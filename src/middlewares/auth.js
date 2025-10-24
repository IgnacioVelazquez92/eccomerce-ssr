// src/middlewares/auth.js
// -----------------------------------------------------------------------------
// Middlewares de autenticación/autorización y helpers relacionados.
// Diseñados para:
// - Cargar el usuario desde la sesión y exponerlo en req.user y res.locals.user
// - Proteger rutas (requireAuth, requireAdmin)
// - Prevenir acceso a login/register cuando ya hay sesión (requireGuest)
// - Mantener la sesión "fresca" con un refresh periódico opcional desde la BD
//
// Notas de diseño:
// - Por defecto NO golpeamos la BD en cada request. Usamos el user guardado en
//   la sesión. Opcionalmente, podemos "refrescar" cada X minutos para reflejar
//   cambios (role/active) sin pedir re-login.
// - Las respuestas diferencian HTML vs JSON, según Accept o cabeceras.
// -----------------------------------------------------------------------------

import { User } from '../models/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración (puede tunearse por .env)
// ─────────────────────────────────────────────────────────────────────────────
const REFRESH_INTERVAL_MS = Number(process.env.USER_REFRESH_INTERVAL_MS ?? 5 * 60 * 1000); // 5 min
const LOGIN_PATH = '/login';
const HOME_PATH = '/';

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades internas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determina si el cliente "prefiere" JSON (API/AJAX) en lugar de HTML.
 * Útil para decidir entre redirect (HTML) o 401/403 JSON.
 */
function wantsJSON(req) {
  const accept = req.headers.accept || '';
  const requestedWith = req.get('X-Requested-With');
  return accept.includes('application/json') || requestedWith === 'XMLHttpRequest';
}

/**
 * Refresca (opc.) el usuario en sesión leyendo desde BD cada cierto tiempo.
 * Si el usuario fue desactivado o cambió de rol, la sesión se actualiza.
 * Evita re-hashear campos sensibles: guardamos SOLO los públicos.
 */
async function maybeRefreshUserInSession(req) {
  if (!req.session?.user?.id && !req.session?.user?._id) return;

  const now = Date.now();
  const last = req.session.user_refreshed_at ?? 0;
  if (now - last < REFRESH_INTERVAL_MS) return; // aún fresco

  const findId = req.session.user._id || req.session.user.id;
  const fresh = await User.findById(findId).lean();
  req.session.user_refreshed_at = now;

  if (!fresh) {
    delete req.session.user;
    return;
  }

  // Guardamos una versión "segura" y ESTABLE con ambos id/_id como string
  req.session.user = {
    id: fresh._id.toString(),
    _id: fresh._id.toString(),
    name: fresh.name,
    email: fresh.email,
    role: fresh.role,
    active: Boolean(fresh.active),
    createdAt: fresh.createdAt,
  };
}

/**
 * Proyección segura para exponer en res.locals.user (navbar/vistas).
 */
function safeUserProjection(u) {
  if (!u) return null;
  return {
    id: u.id || u._id, // cualquiera de los dos
    name: u.name,
    email: u.email,
    role: u.role,
    isAdmin: u.role === 'admin',
    active: u.active,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Middlewares públicos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Carga el usuario desde la sesión y lo expone en:
 *  - req.user (obj plain, listo para lógica de server)
 *  - res.locals.user (proyección segura para vistas)
 *
 * Normaliza para garantizar que existan tanto `user.id` como `user._id` (string).
 * Debe ir lo más arriba posible en la cadena de middlewares.
 */
export async function setUserInViews(req, res, next) {
  try {
    const sessionUser = req.session?.user || null;

    // (Opcional) refrescar desde BD cada X min
    if (sessionUser) {
      await maybeRefreshUserInSession(req);
    }

    // Normalización: asegurar ambos id/_id como string si hay usuario en sesión
    if (req.session?.user) {
      const su = req.session.user;
      const anyId = su._id || su.id;
      if (anyId) {
        const sid = String(anyId);
        if (!su._id) su._id = sid;
        if (!su.id) su.id = sid;
      }
    }

    // Alinear req.user, req.userId y res.locals.user
    req.user = req.session?.user || null;
    req.userId = req.user?._id || req.user?.id || null;
    res.locals.user = safeUserProjection(req.user);

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Requiere que exista un usuario autenticado en sesión.
 * - HTML: redirige a /login
 * - JSON: responde 401 con payload estándar
 *
 * Hidrata req.user desde la sesión si hace falta y define req.userId.
 */
export function requireAuth(req, res, next) {
  // Hidratar desde sesión si no vino poblado por otro middleware
  if (!req.user && req.session?.user) {
    const su = req.session.user;
    // Normalización mínima aquí también por si setUserInViews no corrió antes
    const anyId = su._id || su.id;
    if (anyId) {
      const sid = String(anyId);
      if (!su._id) su._id = sid;
      if (!su.id) su.id = sid;
    }
    req.user = su;
  }

  // Conveniencia para controladores
  if (!req.userId && req.user) {
    req.userId = req.user._id || req.user.id || null;
  }

  if (req.user) return next();

  if (wantsJSON(req)) {
    return res.status(401).json({
      ok: false,
      error: 'unauthorized',
      message: 'Necesitas iniciar sesión para acceder a este recurso.',
    });
  }

  // Guardar "returnTo" para post-login (UX mejorada)
  if (req.method === 'GET') {
    req.session.returnTo = req.originalUrl;
  }
  return res.redirect(LOGIN_PATH);
}

/**
 * Requiere usuario con rol admin (y autenticación previa).
 * - HTML: redirect a home si no tiene permisos
 * - JSON: 403 con detalle
 */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return requireAuth(req, res, next);
  }
  if (req.user.role === 'admin') return next();

  if (wantsJSON(req)) {
    return res.status(403).json({
      ok: false,
      error: 'forbidden',
      message: 'No tenés permisos para acceder a este recurso.',
    });
  }

  return res.redirect(HOME_PATH);
}

/**
 * Requiere que NO haya sesión (útil para /login y /register).
 * - Si hay sesión, redirige al home (HTML) o 400 (JSON).
 */
export function requireGuest(req, res, next) {
  if (!req.user) return next();

  if (wantsJSON(req)) {
    return res.status(400).json({
      ok: false,
      error: 'already_authenticated',
      message: 'Ya iniciaste sesión.',
    });
  }

  return res.redirect(HOME_PATH);
}

/**
 * Valida que el usuario autenticado esté activo.
 * Combínalo después de requireAuth:
 *   app.get("/zona", requireAuth, requireActiveUser, handler)
 */
export function requireActiveUser(req, res, next) {
  if (!req.user) return requireAuth(req, res, next);

  if (req.user.active) return next();

  if (wantsJSON(req)) {
    return res.status(403).json({
      ok: false,
      error: 'inactive_user',
      message: 'Tu usuario está inactivo. Contactá a un administrador.',
    });
  }

  return res.status(403).render('shared/error_inactive', {
    title: 'Usuario inactivo',
    message: 'Tu usuario está inactivo. Contactá a un administrador.',
  });
}
