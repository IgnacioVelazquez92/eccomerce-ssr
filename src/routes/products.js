// src/routes/products.js
// -----------------------------------------------------------------------------
// Rutas públicas de productos (detalle)
// -----------------------------------------------------------------------------

import { Router } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../middlewares/errors.js';
import { detail } from '../controllers/product.controller.js';

const router = Router();

// Validar ObjectId para evitar errores
function ensureValidIdParam(req, res, next) {
  const { id } = req.params;
  if (id && !mongoose.Types.ObjectId.isValid(id)) {
    req.flash?.('error', 'Identificador de producto inválido.');
    return res.redirect('/');
  }
  return next();
}

// GET /products/:id — detalle público
router.get('/:id', ensureValidIdParam, asyncHandler(detail));

export default router;
