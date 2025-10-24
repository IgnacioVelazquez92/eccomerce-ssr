//routes/admin/categories.js
import express from 'express';
import mongoose from 'mongoose';
import { requireAdmin } from '../../middlewares/auth.js';
import { asyncHandler } from '../../middlewares/errors.js';
import {
  listCategories,
  renderNewForm,
  createCategory,
  renderEditForm,
  updateCategory,
  toggleActive,
  deleteCategory,
} from '../../controllers/category.controller.js';

const router = express.Router();

function ensureValidIdParam(req, res, next) {
  const { id } = req.params;
  if (id && !mongoose.Types.ObjectId.isValid(id)) {
    req.flash?.('error', 'ID inválido');
    return res.redirect('/admin/categories');
  }
  return next();
}

router.use(requireAdmin);

router.get('/', asyncHandler(listCategories));
router.get('/new', asyncHandler(renderNewForm));
router.post('/', asyncHandler(createCategory));
router.get('/:id/edit', ensureValidIdParam, asyncHandler(renderEditForm));
router.post('/:id', ensureValidIdParam, asyncHandler(updateCategory));
router.post('/:id/toggle', ensureValidIdParam, asyncHandler(toggleActive));
router.post('/:id/delete', ensureValidIdParam, asyncHandler(deleteCategory));

export default router;
