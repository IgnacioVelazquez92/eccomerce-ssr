// src/routes/admin/users.js
import { Router } from 'express';
import {
  listUsers,
  createUser,
  updateUser,
  toggleActive,
} from '../../controllers/admin.controller.js';
import { requireAuth, requireAdmin } from '../../middlewares/auth.js';
import { asyncHandler } from '../../middlewares/errors.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/', asyncHandler(listUsers));
router.post('/', asyncHandler(createUser));
router.post('/:id/update', asyncHandler(updateUser));
router.post('/:id/toggle', asyncHandler(toggleActive));

export default router;
