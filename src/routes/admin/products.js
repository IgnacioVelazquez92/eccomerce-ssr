// src/routes/admin/products.js
// -----------------------------------------------------------------------------
// Rutas de administración para Productos.
// Protegidas con requireAdmin y usando asyncHandler.
// Usa multer en memoria desde el propio controlador (upload.single('image')).
// -----------------------------------------------------------------------------

import express from 'express';

// Middlewares globales
import { requireAdmin } from '../../middlewares/auth.js';
import { asyncHandler } from '../../middlewares/errors.js';

// Acciones del controlador
import {
  upload,
  listProducts,
  renderNewForm,
  createProduct,
  renderEditForm,
  updateProduct,
  toggleFlag,
  deleteProduct,
} from '../../controllers/product.controller.js';

const router = express.Router();

// Todas las rutas bajo /admin/products requieren rol admin
router.use(requireAdmin);

// Listado + búsqueda + paginación
router.get('/', asyncHandler(listProducts));

// Formulario de alta
router.get('/new', asyncHandler(renderNewForm));

// Crear (con imagen opcional)
router.post('/', upload.single('image'), asyncHandler(createProduct));

// Formulario de edición
router.get('/:id/edit', asyncHandler(renderEditForm));

// Actualizar (con posible reemplazo de imagen)
router.post('/:id', upload.single('image'), asyncHandler(updateProduct));

// Toggles: active / featured / promoEnabled
router.post('/:id/toggle/:flag', asyncHandler(toggleFlag));

// Borrado (elimina imagen en Cloudinary y luego el documento)
router.post('/:id/delete', asyncHandler(deleteProduct));

export default router;
