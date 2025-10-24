// src/routes/account.js
// -----------------------------------------------------------------------------
// Rutas del módulo "Cuenta de Usuario" (perfil unificado)
// -----------------------------------------------------------------------------
// Responsabilidad
// - Unificar en **/account/profile** la visualización y edición de los datos
//   personales del usuario autenticado:
//    • Teléfono de contacto
//    • Direcciones múltiples de envío
//    • Dirección preferida (por defecto)
// - Todas las rutas están protegidas por requireAuth (no hay acceso anónimo).
//
// Controladores usados (account.controller.js):
//   • showProfile           → Render de perfil con teléfono + direcciones
//   • updatePhone           → Guardar número de teléfono
//   • addAddress            → Agregar nueva dirección
//   • setDefaultAddress     → Marcar dirección preferida
//   • deleteAddress         → Eliminar dirección
//
// Middlewares:
//   • requireAuth  → exige sesión activa
//   • asyncHandler → captura errores async y delega en errorHandler global
//
// Vista asociada:
//   • views/auth/profile.hbs  (una sola pantalla con todo el perfil)
// -----------------------------------------------------------------------------

import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errors.js';
import {
  showProfile,
  updatePhone,
  addAddress,
  setDefaultAddress,
  deleteAddress,
} from '../controllers/account.controller.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Middleware global: todas las rutas requieren sesión activa
// -----------------------------------------------------------------------------
router.use(requireAuth);

// ─────────────────────────────────────────────────────────────────────────────
// Perfil unificado (/account/profile)
// -----------------------------------------------------------------------------

// Vista principal del perfil (teléfono + direcciones en una sola página)
router.get('/account/profile', asyncHandler(showProfile));

// Actualizar teléfono
router.post('/account/profile/phone', asyncHandler(updatePhone));

// Agregar nueva dirección
router.post('/account/profile/addresses', asyncHandler(addAddress));

// Marcar dirección como preferida
router.post('/account/profile/addresses/:id/default', asyncHandler(setDefaultAddress));

// Eliminar dirección existente
router.post('/account/profile/addresses/:id/delete', asyncHandler(deleteAddress));

// ─────────────────────────────────────────────────────────────────────────────
// Export
// -----------------------------------------------------------------------------
export default router;
