// src/routes/admin/orders.js
// Rutas protegidas del Panel Admin (Dashboard + Pedidos)

import { Router } from 'express';
import {
  renderDashboard,
  listOrders,
  showOrder,
  updateOrderStatus,
} from '../../controllers/admin.controller.js';
import { requireAdmin } from '../../middlewares/auth.js';
import { asyncHandler } from '../../middlewares/errors.js';

const router = Router();

// Todas las rutas de este módulo requieren admin
router.use(requireAdmin);

// Dashboard KPIs
router.get('/', asyncHandler(renderDashboard));

// Pedidos: listado, detalle y cambio de estado
router.get('/orders', asyncHandler(listOrders));
router.get('/orders/:id', asyncHandler(showOrder));
router.post('/orders/:id/status', asyncHandler(updateOrderStatus));

export default router;
