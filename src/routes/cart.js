// src/routes/cart.js
// -----------------------------------------------------------------------------
// Rutas de Carrito (en sesión)
// Protegidas con requireAuth (del Módulo 1) y con manejo de errores async.
// -----------------------------------------------------------------------------

import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errors.js';
import {
  viewCart,
  addToCart,
  updateQty,
  removeItem,
  clearCart,
} from '../controllers/cart.controller.js';

const router = Router();

// Validación simple de ObjectId (evita queries innecesarias al controller)
function ensureValidIdParam(req, res, next) {
  const { id } = req.params;
  if (id && !mongoose.Types.ObjectId.isValid(id)) {
    req.flash?.('error', 'Identificador de producto inválido.');
    return res.redirect('back');
  }
  return next();
}

// Todas las rutas del carrito requieren usuario autenticado
router.use(requireAuth);

// Ver carrito
router.get('/', asyncHandler(viewCart));

// Agregar producto (qty opcional en body)
router.post('/add/:id', ensureValidIdParam, asyncHandler(addToCart));

// Cambiar cantidad
router.post('/qty/:id', ensureValidIdParam, asyncHandler(updateQty));

// Quitar línea
router.post('/remove/:id', ensureValidIdParam, asyncHandler(removeItem));

// Vaciar carrito
router.post('/clear', asyncHandler(clearCart));

export default router;
