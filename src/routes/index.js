// src/routes/index.js
// -----------------------------------------------------------------------------
// Rutas principales del sitio
// - Catálogo público (home)
// - Subrutas: carrito, checkout, admin, etc.
// -----------------------------------------------------------------------------

import { Router } from 'express';
import { asyncHandler } from '../middlewares/errors.js';
import { listPublic } from '../controllers/product.controller.js';

// Subrutas
import cartRoutes from './cart.js';
import checkoutRoutes from './checkout.js';
import adminOrdersRoutes from './admin/orders.js';

const router = Router();

// -----------------------------------------------------------------------------
// Home (catálogo público)
// -----------------------------------------------------------------------------
router.get('/', asyncHandler(listPublic));

// -----------------------------------------------------------------------------
// Subrutas funcionales
// -----------------------------------------------------------------------------
router.use('/cart', cartRoutes);
router.use('/checkout', checkoutRoutes);
router.use('/admin', adminOrdersRoutes);

// -----------------------------------------------------------------------------
// Exportar router principal
// -----------------------------------------------------------------------------
export default router;
