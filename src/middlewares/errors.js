// src/middlewares/errors.js
// -----------------------------------------------------------------------------
// Middlewares de manejo de errores y utilidades para controladores async.
// Objetivos:
// - asyncHandler(fn): elimina try/catch repetitivo en rutas y controllers.
// - notFound: 404 consistente para HTML/JSON.
// - errorHandler: serializa errores, respeta status si viene seteado, y
//   diferencia salida en development vs production.
// -----------------------------------------------------------------------------

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Envuelve un handler async y captura errores para next(err).
 * Uso:
 *   router.get("/ruta", asyncHandler(async (req, res) => { ... }));
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404: recurso no encontrado.
 * Si el cliente prefiere JSON → payload JSON. Si no, render HTML.
 */
export function notFound(req, res, _next) {
  const payload = {
    ok: false,
    error: 'not_found',
    message: `No se encontró: ${req.originalUrl}`,
  };

  if (wantsJSON(req)) {
    return res.status(404).json(payload);
  }
  return res.status(404).render('shared/404', {
    title: 'Página no encontrada',
    ...payload,
  });
}

/**
 * Manejador global de errores.
 * - Respeta err.status o usa 500 por defecto.
 * - En dev: incluye stack; en prod: oculta detalles sensibles.
 * - Devuelve JSON o HTML según prefiera el cliente.
 */
export function errorHandler(err, req, res, _next) {
  const status = normalizeStatus(err);
  const base = {
    ok: false,
    error: err.code || err.name || 'internal_error',
    message: err.message || 'Ocurrió un error inesperado.',
  };

  const payload = isDev ? { ...base, stack: err.stack } : base;

  if (wantsJSON(req)) {
    return res.status(status).json(payload);
  }

  // Para vistas, exponer data útil y un title
  return res.status(status).render('shared/error', {
    title: status === 500 ? 'Error del servidor' : 'Error',
    ...payload,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

function wantsJSON(req) {
  const accept = req.headers.accept || '';
  const requestedWith = req.get('X-Requested-With');
  return accept.includes('application/json') || requestedWith === 'XMLHttpRequest';
}

function normalizeStatus(err) {
  const s = Number(err?.status || err?.statusCode || 500);
  if (s >= 400 && s < 600) return s;
  return 500;
}
