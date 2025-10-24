// src/routes/auth.js
// -----------------------------------------------------------------------------
// Rutas públicas y protegidas del módulo de Autenticación
// -----------------------------------------------------------------------------
// Responsabilidad
// - Gestionar el flujo de registro, login, logout y perfil de usuario.
// - Dividir rutas en públicas (requireGuest) y protegidas (requireAuth).
// - Cada controlador implementa la lógica correspondiente (auth.controller.js):
//     • showLogin / login
//     • showRegister / register
//     • showProfile
//     • logout
//
// Middlewares usados:
// - requireGuest → bloquea acceso a login/register si ya hay sesión activa.
// - requireAuth  → exige sesión autenticada para acceder a /logout y /profile.
// - asyncHandler → captura excepciones de controladores async y delega a
//   errorHandler global, evitando repetir try/catch en cada ruta.
//
// Convención de vistas (en /src/views/auth/):
//   • login.hbs      — formulario de acceso
//   • register.hbs   — formulario de alta de cuenta
//   • profile.hbs    — datos del usuario autenticado
// -----------------------------------------------------------------------------

import { Router } from 'express';
import {
  showLogin,
  showRegister,
  login,
  register,
  logout,
} from '../controllers/auth.controller.js';
import { requireGuest, requireAuth } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errors.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Rutas públicas (solo accesibles si NO hay sesión activa)
// -----------------------------------------------------------------------------
router.get('/login', requireGuest, showLogin); // Formulario de login
router.get('/register', requireGuest, showRegister); // Formulario de registro
router.post('/login', requireGuest, asyncHandler(login)); // Envío de credenciales
router.post('/register', requireGuest, asyncHandler(register)); // Alta usuario

// ─────────────────────────────────────────────────────────────────────────────
// Rutas protegidas (requieren sesión activa)
// -----------------------------------------------------------------------------
router.get('/logout', requireAuth, logout); // Cierre de sesión

// ─────────────────────────────────────────────────────────────────────────────
// Export
// -----------------------------------------------------------------------------
export default router;
