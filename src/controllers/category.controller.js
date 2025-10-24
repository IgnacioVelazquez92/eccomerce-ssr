// src/controllers/category.controller.js
import Category from '../models/Category.js';

function collectCategoryPayload(body) {
  const name = (body?.name || '').trim();
  const active = body?.active === 'on' || body?.active === true;
  const errors = {};
  if (!name) errors.name = 'El nombre es obligatorio';
  return { data: { name, active }, errors };
}

// Lista (admin)
export async function listCategories(req, res) {
  const q = (req.query.q || '').trim();
  const filter = q ? { name: { $regex: q, $options: 'i' } } : {};
  const items = await Category.find(filter).sort({ name: 1 }).lean().exec();
  res.render('admin/categories', {
    title: 'Categorías',
    q,
    items,
  });
}

// Helper: sanitiza el returnTo (solo paths internos)
function safeReturnTo(req) {
  const raw = (req.query.returnTo || req.body.returnTo || '').trim();
  if (!raw) return null;
  // Solo permitimos paths relativos internos tipo "/admin/products/new?..."
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

// Form nuevo
export async function renderNewForm(req, res) {
  const returnTo = safeReturnTo(req);
  res.render('categories/form', {
    title: 'Nueva categoría',
    isEdit: false,
    category: { name: '', active: true },
    returnTo, // <<--- para hidden input en el form
  });
}

// Crear
export async function createCategory(req, res) {
  const returnTo = safeReturnTo(req);
  const { data, errors } = collectCategoryPayload(req.body);

  if (Object.keys(errors).length) {
    return res.status(422).render('categories/form', {
      title: 'Nueva categoría',
      isEdit: false,
      category: data,
      errors,
      returnTo, // <<---
    });
  }

  try {
    await Category.create(data);
    req.flash?.('success', 'Categoría creada');
    if (returnTo) return res.redirect(returnTo); // <<---
    return res.redirect('/admin/categories');
  } catch (err) {
    return res.status(400).render('categories/form', {
      title: 'Nueva categoría',
      isEdit: false,
      category: data,
      errors: { name: err.code === 11000 ? 'Nombre duplicado' : err.message || 'Error al crear' },
      returnTo, // <<---
    });
  }
}

// Form editar
export async function renderEditForm(req, res) {
  const returnTo = safeReturnTo(req);
  const { id } = req.params;
  const category = await Category.findById(id).lean().exec();
  if (!category) {
    req.flash?.('error', 'Categoría no encontrada');
    return res.redirect('/admin/categories');
  }
  res.render('categories/form', {
    title: `Editar: ${category.name}`,
    isEdit: true,
    category,
    returnTo, // <<---
  });
}

// Actualizar
export async function updateCategory(req, res) {
  const returnTo = safeReturnTo(req);
  const { id } = req.params;
  const exists = await Category.findById(id).exec();
  if (!exists) {
    req.flash?.('error', 'Categoría no encontrada');
    return res.redirect('/admin/categories');
  }

  const { data, errors } = collectCategoryPayload(req.body);
  if (Object.keys(errors).length) {
    return res.status(422).render('categories/form', {
      title: `Editar: ${exists.name}`,
      isEdit: true,
      category: { ...exists.toObject(), ...data },
      errors,
      returnTo, // <<---
    });
  }

  exists.set(data);
  await exists.save();
  req.flash?.('success', 'Categoría actualizada');
  if (returnTo) return res.redirect(returnTo); // <<---
  res.redirect('/admin/categories');
}

// Toggle activo
export async function toggleActive(req, res) {
  const { id } = req.params;
  const cat = await Category.findById(id).exec();
  if (!cat) {
    req.flash?.('error', 'Categoría no encontrada');
    return res.redirect('/admin/categories');
  }
  cat.active = !cat.active;
  await cat.save();
  req.flash?.('success', `Categoría ${cat.active ? 'activada' : 'desactivada'}`);
  res.redirect('/admin/categories');
}

// Eliminar
export async function deleteCategory(req, res) {
  const { id } = req.params;
  const cat = await Category.findById(id).exec();
  if (!cat) {
    req.flash?.('error', 'Categoría no encontrada');
    return res.redirect('/admin/categories');
  }
  await cat.deleteOne();
  req.flash?.('success', 'Categoría eliminada');
  res.redirect('/admin/categories');
}
