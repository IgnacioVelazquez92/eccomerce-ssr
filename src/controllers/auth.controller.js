// src/controllers/auth.controller.js
// -----------------------------------------------------------------------------
// Controlador de Autenticación (registro, login, logout).
// - Sin dependencias de "flash": devuelve errores a la vista por contexto.
// - Usa el modelo User (hash con bcrypt/bcryptjs, según tu elección).
// - Administra "returnTo" para redirigir al recurso originalmente solicitado.
// -----------------------------------------------------------------------------

import { User } from '../models/index.js';

/** Renderiza formulario de login */
export function showLogin(req, res) {
  return res.render('auth/login', {
    title: 'Iniciar sesión',
  });
}

/** Renderiza formulario de registro */
export function showRegister(req, res) {
  return res.render('auth/register', {
    title: 'Crear cuenta',
  });
}

/** POST /login — valida credenciales y crea sesión */
export async function login(req, res, next) {
  try {
    const { email = '', password = '' } = req.body || {};
    const normEmail = String(email).trim().toLowerCase();

    // Validación mínima
    const errors = {};
    if (!normEmail) errors.email = 'El email es obligatorio.';
    if (!password) errors.password = 'La contraseña es obligatoria.';

    if (Object.keys(errors).length) {
      return res.status(400).render('auth/login', {
        title: 'Iniciar sesión',
        errors,
        form: { email: normEmail },
      });
    }

    // Buscar usuario con passwordHash (select:false en el schema)
    const user = await User.findOne({ email: normEmail }).select('+passwordHash');
    if (!user) {
      return res.status(400).render('auth/login', {
        title: 'Iniciar sesión',
        errors: { email: 'Credenciales inválidas.' },
        form: { email: normEmail },
      });
    }

    // Verificar contraseña
    const ok = await user.checkPassword(password);
    if (!ok) {
      return res.status(400).render('auth/login', {
        title: 'Iniciar sesión',
        errors: { password: 'Credenciales inválidas.' },
        form: { email: normEmail },
      });
    }

    // Usuario inactivo
    if (!user.active) {
      return res.status(403).render('auth/login', {
        title: 'Iniciar sesión',
        errors: { _global: 'Tu usuario está inactivo. Contactá a un administrador.' },
        form: { email: normEmail },
      });
    }

    // Crear sesión "ligera" (sin passwordHash)
    req.session.user = user.toJSON(); // aplica transform del schema (oculta hash)
    req.session.user_refreshed_at = Date.now();

    // Redirección amable: volver a donde quería ir
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    return res.redirect(returnTo);
  } catch (err) {
    return next(err);
  }
}

/** POST /register — crea usuario nuevo */
export async function register(req, res, next) {
  try {
    const { name = '', email = '', password = '' } = req.body || {};
    const normName = String(name).trim();
    const normEmail = String(email).trim().toLowerCase();

    // Validaciones básicas
    const errors = {};
    if (!normName || normName.length < 2) errors.name = 'Ingresa tu nombre (mín. 2 caracteres).';
    if (!normEmail) errors.email = 'El email es obligatorio.';
    if (!password || password.length < 6)
      errors.password = 'La contraseña debe tener al menos 6 caracteres.';

    if (Object.keys(errors).length) {
      return res.status(400).render('auth/register', {
        title: 'Crear cuenta',
        errors,
        form: { name: normName, email: normEmail },
      });
    }

    // Verificar duplicado
    const exists = await User.exists({ email: normEmail });
    if (exists) {
      return res.status(400).render('auth/register', {
        title: 'Crear cuenta',
        errors: { email: 'Ya existe una cuenta con ese email.' },
        form: { name: normName, email: normEmail },
      });
    }

    // Crear usuario con helper del modelo (hashea internamente)
    await User.register({
      name: normName,
      email: normEmail,
      password,
      // role por defecto "user", active true (ver schema)
    });

    // Redirigir a login con el email prellenado
    return res.redirect(`/login?email=${encodeURIComponent(normEmail)}`);
  } catch (err) {
    return next(err);
  }
}

/** GET /logout — destruye sesión y va a login */
export function logout(req, res, next) {
  try {
    req.session.destroy(() => {
      // limpiar cookie de sesión:
      res.clearCookie?.('connect.sid');
      return res.redirect('/login');
    });
  } catch (err) {
    return next(err);
  }
}
