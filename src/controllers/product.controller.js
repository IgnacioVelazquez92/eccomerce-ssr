// src/controllers/product.controller.js
// -----------------------------------------------------------------------------
// Controlador de Productos (lado admin).
// Requiere el modelo Product y el servicio de imágenes Cloudinary.
//
// Acciones exportadas:
// - upload (multer en memoria) -> para usar en la ruta con upload.single('image')
// - listProducts (GET /admin/products)
// - renderNewForm (GET /admin/products/new)
// - createProduct (POST /admin/products)
// - renderEditForm (GET /admin/products/:id/edit)
// - updateProduct (POST/PUT /admin/products/:id)
// - toggleFlag (POST /admin/products/:id/toggle/:flag)
// - deleteProduct (POST/DELETE /admin/products/:id)
// -----------------------------------------------------------------------------

import multer from 'multer';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import {
  uploadImage,
  replaceImage,
  destroyImage,
  isUsingCloudinary,
} from '../services/image.service.js';

// -----------------------------
// Multer en memoria (input name="image")
// -----------------------------
export const upload = multer({ storage: multer.memoryStorage() });

// -----------------------------
// Helpers de validación y parsing
// -----------------------------
function parseNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampPct(n) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function buildSearchFilter(query) {
  const filter = {};
  const q = (query?.q || '').trim();
  if (q) {
    // Búsqueda básica por título o SKU (case-insensitive)
    filter.$or = [{ title: { $regex: q, $options: 'i' } }, { sku: { $regex: q, $options: 'i' } }];
  }
  return filter;
}

function paginateParams(query) {
  const page = Math.max(1, parseNumber(query?.page, 1));
  const limit = Math.min(50, Math.max(1, parseNumber(query?.limit, 10))); // 1..50
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function collectProductPayload(body) {
  const title = (body?.title || '').trim();
  const sku = (body?.sku || '').trim().toUpperCase();
  const price = parseNumber(body?.price, NaN);
  const stock = parseNumber(body?.stock, NaN);

  const active = body?.active === 'on' || body?.active === true;
  const featured = body?.featured === 'on' || body?.featured === true;

  const promoEnabled = body?.promoEnabled === 'on' || body?.promoEnabled === true;
  const promoPct = clampPct(parseNumber(body?.promoPct, 0));

  // NUEVO: descripción breve
  const description = (body?.description || '').trim();

  // NUEVO: ficha técnica -> array de strings (una por línea)
  const techSpecsText = (body?.techSpecs || '').toString();
  const techSpecs = techSpecsText
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Categoría (puede venir "" -> null)
  const categoryId = (body?.categoryId || '').trim() || null;

  const errors = {};
  if (!title) errors.title = 'El título es obligatorio';
  if (!sku) errors.sku = 'El SKU es obligatorio';
  if (!Number.isFinite(price) || price < 0) errors.price = 'Precio inválido (>= 0)';
  if (!Number.isFinite(stock) || stock < 0) errors.stock = 'Stock inválido (>= 0)';
  if (promoEnabled && !(promoPct >= 0 && promoPct <= 100)) {
    errors.promoPct = 'El porcentaje de promo debe estar entre 0 y 100';
  }

  return {
    data: {
      title,
      sku,
      price,
      stock,
      active,
      featured,
      promoEnabled,
      promoPct,
      description, // <<---
      techSpecs, // <<---
      categoryId, // <<---
    },
    errors,
  };
}

// -----------------------------
// Listado
// -----------------------------
export async function listProducts(req, res) {
  const filter = buildSearchFilter(req.query);
  const { page, limit, skip } = paginateParams(req.query);

  const [items, total] = await Promise.all([
    Product.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean().exec(),
    Product.countDocuments(filter),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  res.render('admin/products', {
    title: 'Productos',
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
    },
    q: (req.query.q || '').trim(),
  });
}

// -----------------------------
// Formularios
// -----------------------------
export async function renderNewForm(req, res) {
  const categories = await Category.find({ active: true })
    .select('name slug _id')
    .sort({ name: 1 })
    .lean();

  res.render('products/form', {
    title: 'Nuevo producto',
    isEdit: false,
    product: {
      title: '',
      sku: '',
      price: '',
      stock: '',
      active: true,
      featured: false,
      promoEnabled: false,
      promoPct: 0,
      imageUrl: '',
      description: '', // <<---
      techSpecsText: '', // <<--- (para textarea)
      categoryId: '', // <<---
    },
    categories, // <<---
    cloudinaryEnabled: isUsingCloudinary(),
  });
}

export async function renderEditForm(req, res) {
  const { id } = req.params;
  const product = await Product.findById(id).lean().exec();
  if (!product) {
    req.flash?.('error', 'Producto no encontrado');
    return res.redirect('/admin/products');
  }

  // preparar textarea de ficha técnica
  const techSpecsText = Array.isArray(product.techSpecs) ? product.techSpecs.join('\n') : '';

  const categories = await Category.find({ active: true })
    .select('name slug _id')
    .sort({ name: 1 })
    .lean();

  res.render('products/form', {
    title: `Editar: ${product.title}`,
    isEdit: true,
    product: { ...product, techSpecsText }, // <<---
    cloudinaryEnabled: isUsingCloudinary(),
    categories,
  });
}

// -----------------------------
// Crear
// -----------------------------
export async function createProduct(req, res) {
  const { data, errors } = collectProductPayload(req.body);

  // Para re-render: necesitamos categories y techSpecsText
  const categories = await Category.find({ active: true })
    .select('name slug _id')
    .sort({ name: 1 })
    .lean();
  const techSpecsText = Array.isArray(data.techSpecs) ? data.techSpecs.join('\n') : '';

  // Si hay errores del payload, re-render
  if (Object.keys(errors).length > 0) {
    return res.status(422).render('products/form', {
      title: 'Nuevo producto',
      isEdit: false,
      product: { ...data, techSpecsText },
      errors,
      categories,
      cloudinaryEnabled: isUsingCloudinary(),
    });
  }

  // Manejo de imagen (opcional)
  let imageFields = {};
  if (req.file) {
    const { buffer, mimetype, size, originalname } = req.file;
    try {
      const uploaded = await uploadImage({ buffer, mimetype, size, originalname });
      imageFields = {
        imageUrl: uploaded.imageUrl,
        imagePublicId: uploaded.imagePublicId,
      };
    } catch (err) {
      // Si falla la imagen, re-render con error sin perder los campos del form
      return res.status(400).render('products/form', {
        title: 'Nuevo producto',
        isEdit: false,
        product: { ...data, techSpecsText },
        errors: { image: err.message || 'Error al subir la imagen' },
        categories,
        cloudinaryEnabled: isUsingCloudinary(),
      });
    }
  }

  // Denormalizar categoryName si corresponde
  let categoryFields = {};
  if (data.categoryId) {
    const cat = await Category.findById(data.categoryId).select('name').lean();
    if (cat) categoryFields.categoryName = cat.name;
    else {
      // id inválido: limpiamos
      data.categoryId = null;
      categoryFields.categoryName = null;
    }
  }

  const doc = await Product.create({ ...data, ...imageFields, ...categoryFields });
  req.flash?.('success', `Producto "${doc.title}" creado correctamente`);
  res.redirect('/admin/products');
}

// -----------------------------
// Actualizar
// -----------------------------
export async function updateProduct(req, res) {
  const { id } = req.params;
  const exists = await Product.findById(id).exec();
  if (!exists) {
    req.flash?.('error', 'Producto no encontrado');
    return res.redirect('/admin/products');
  }

  const { data, errors } = collectProductPayload(req.body);

  // Para re-render: categories y techSpecsText
  const categories = await Category.find({ active: true })
    .select('name slug _id')
    .sort({ name: 1 })
    .lean();
  const techSpecsText = Array.isArray(data.techSpecs) ? data.techSpecs.join('\n') : '';

  if (Object.keys(errors).length > 0) {
    return res.status(422).render('products/form', {
      title: `Editar: ${exists.title}`,
      isEdit: true,
      product: { ...exists.toObject(), ...data, techSpecsText },
      errors,
      categories,
      cloudinaryEnabled: isUsingCloudinary(),
    });
  }

  // Imagen (opcional): si hay nueva, reemplazamos
  let imageFields = {};
  if (req.file) {
    const { buffer, mimetype, size, originalname } = req.file;
    try {
      const replaced = await replaceImage({
        previousPublicId: exists.imagePublicId || null,
        buffer,
        mimetype,
        size,
        originalname,
      });
      imageFields = {
        imageUrl: replaced.imageUrl,
        imagePublicId: replaced.imagePublicId,
      };
    } catch (err) {
      return res.status(400).render('products/form', {
        title: `Editar: ${exists.title}`,
        isEdit: true,
        product: { ...exists.toObject(), ...data, techSpecsText },
        errors: { image: err.message || 'Error al reemplazar la imagen' },
        categories,
        cloudinaryEnabled: isUsingCloudinary(),
      });
    }
  }

  // Denormalizar categoryName si corresponde
  let categoryFields = {};
  if (data.categoryId) {
    const cat = await Category.findById(data.categoryId).select('name').lean();
    if (cat) categoryFields.categoryName = cat.name;
    else {
      data.categoryId = null;
      categoryFields.categoryName = null;
    }
  } else {
    categoryFields.categoryName = null;
  }

  exists.set({ ...data, ...imageFields, ...categoryFields });
  await exists.save();

  req.flash?.('success', `Producto "${exists.title}" actualizado`);
  res.redirect('/admin/products');
}

// -----------------------------
// Toggle de flags
// -----------------------------
export async function toggleFlag(req, res) {
  const { id, flag } = req.params;
  const allowed = new Set(['active', 'featured', 'promoEnabled']);
  if (!allowed.has(flag)) {
    req.flash?.('error', 'Flag no permitido');
    return res.redirect('/admin/products');
  }

  const product = await Product.findById(id).exec();
  if (!product) {
    req.flash?.('error', 'Producto no encontrado');
    return res.redirect('/admin/products');
  }

  product[flag] = !product[flag];
  await product.save();

  req.flash?.('success', `Se actualizó "${flag}" para ${product.title}`);
  res.redirect('/admin/products');
}

// -----------------------------
// Borrar
// -----------------------------
export async function deleteProduct(req, res) {
  const { id } = req.params;
  const product = await Product.findById(id).exec();
  if (!product) {
    req.flash?.('error', 'Producto no encontrado');
    return res.redirect('/admin/products');
  }

  // 1) Borrar imagen en Cloudinary (si existe)
  if (product.imagePublicId) {
    try {
      await destroyImage(product.imagePublicId);
    } catch (err) {
      // No bloqueamos el borrado del doc si la destrucción falla;
      // pero informamos con un flash.
      req.flash?.(
        'error',
        'No se pudo borrar la imagen en Cloudinary (se elimina el producto igual)',
      );
    }
  }

  // 2) Borrar documento
  await product.deleteOne();

  req.flash?.('success', `Producto "${product.title}" eliminado`);
  res.redirect('/admin/products');
}

// -----------------------------
// MÓDULO 3 — Acciones públicas (Catálogo)
// -----------------------------

// Filtros públicos: activos siempre; q, featured?, rango de precio
async function buildPublicFilter(query) {
  const filter = buildSearchFilter(query);
  filter.active = true;

  if (String(query?.featured).toLowerCase() === 'true') {
    filter.featured = true;
  }

  const min = parseNumber(query?.min, null);
  const max = parseNumber(query?.max, null);
  if (Number.isFinite(min) || Number.isFinite(max)) {
    filter.price = {};
    if (Number.isFinite(min)) filter.price.$gte = min;
    if (Number.isFinite(max)) filter.price.$lte = max;
  }

  // Categoría por slug (?cat=alimentos, por ejemplo)
  const catSlug = (query?.cat || '').trim().toLowerCase();
  if (catSlug) {
    const cat = await Category.findOne({ slug: catSlug, active: true })
      .select('_id name slug')
      .lean()
      .exec();
    if (cat) filter.categoryId = cat._id;
    else filter.categoryId = '__no_match__'; // fuerza 0 resultados si slug inválido
  }

  return filter;
}

// Orden público: newest (default), price_asc, price_desc
function buildPublicSort(query) {
  const sortKey = (query?.sort || 'newest').toLowerCase();
  switch (sortKey) {
    case 'price_asc':
      return [{ price: 1 }, sortKey];
    case 'price_desc':
      return [{ price: -1 }, sortKey];
    case 'newest':
    default:
      return [{ createdAt: -1 }, 'newest'];
  }
}

// Cálculo de promo para UI (solo lectura)
function decoratePromoFields(doc) {
  const item = { ...doc };
  const promoEnabled = !!item.promoEnabled;
  const pct = clampPct(parseNumber(item.promoPct, 0));
  if (promoEnabled && pct > 0) {
    const promoPrice = Math.round(Number(item.price) * (1 - pct / 100) * 100) / 100;
    item.promoPrice = promoPrice;
    item.hasPromo = true;
  } else {
    item.promoPrice = null;
    item.hasPromo = false;
  }
  return item;
}

// GET /  (home) y /products (si decides separarlo) — listado público
export async function listPublic(req, res) {
  const filter = await buildPublicFilter(req.query);
  const [sort, sortKey] = buildPublicSort(req.query);
  const { page, limit, skip } = paginateParams(req.query);

  const projection =
    'title sku price stock featured promoEnabled promoPct imageUrl categoryName createdAt';

  const [itemsRaw, total, categories] = await Promise.all([
    Product.find(filter).select(projection).sort(sort).skip(skip).limit(limit).lean().exec(),
    Product.countDocuments(filter),
    Category.find({ active: true }).select('name slug').sort({ name: 1 }).lean().exec(),
  ]);

  const items = itemsRaw.map(decoratePromoFields);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const baseQS = new URLSearchParams();
  if (req.query.q) baseQS.set('q', String(req.query.q));
  if (String(req.query.featured).toLowerCase() === 'true') baseQS.set('featured', 'true');
  if (req.query.min) baseQS.set('min', String(req.query.min));
  if (req.query.max) baseQS.set('max', String(req.query.max));
  if (req.query.sort) baseQS.set('sort', String(req.query.sort));
  if (req.query.cat) baseQS.set('cat', String(req.query.cat)); // <<--- mantener categoría

  function pageUrl(p) {
    const qs = new URLSearchParams(baseQS);
    qs.set('page', String(p));
    qs.set('limit', String(limit));
    return `/?${qs.toString()}`;
  }

  res.render('products/list', {
    title: 'Catálogo',
    showSidebar: true,
    items,
    // estado de filtros
    q: (req.query.q || '').trim(),
    featured: String(req.query?.featured || '') === 'true',
    min: req.query?.min || '',
    max: req.query?.max || '',
    sortKey,
    cat: req.query?.cat || '', // <<--- seleccionado
    categories, // <<--- para el sidebar
    // paginación
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
      prevUrl: page > 1 ? pageUrl(page - 1) : null,
      nextUrl: page < totalPages ? pageUrl(page + 1) : null,
    },
  });
}

// GET /products/:id — detalle público (solo activo)
// GET /products/:id — detalle público (solo activo)
export async function detail(req, res) {
  const { id } = req.params;

  // ✅ incluir los campos nuevos en la proyección
  const projection = [
    'title',
    'sku',
    'price',
    'stock',
    'featured',
    'promoEnabled',
    'promoPct',
    'imageUrl',
    'createdAt',
    'active',
    'description', // <<---
    'techSpecs', // <<---
    'categoryName', // <<---
  ].join(' ');

  const product = await Product.findOne({ _id: id, active: true }).select(projection).lean().exec();

  if (!product) {
    req.flash?.('error', 'Producto no disponible');
    return res.redirect('/');
  }

  // para que el template sepa si hay promo y el precio promo
  const decorated = decoratePromoFields(product);

  return res.render('products/detail', {
    title: decorated.title,
    product: decorated,
    showSidebar: true,
  });
}
