// src/controllers/cart.controller.js
// -----------------------------------------------------------------------------
// Controlador de Carrito (en sesión).
// Requiere: CartService (servicio de sesión) y Product (solo lectura).
// Rutas esperadas (protegidas con requireAuth en router):
//   GET    /cart                   -> viewCart
//   POST   /cart/add/:id           -> addToCart
//   POST   /cart/qty/:id           -> updateQty
//   POST   /cart/remove/:id        -> removeItem
//   POST   /cart/clear             -> clearCart
// -----------------------------------------------------------------------------

import Product from '../models/Product.js';
import CartService from '../services/cart.service.js';

// Si tienes un asyncHandler global en middlewares/errors.js, úsalo en las rutas.
// Aquí exportamos funciones async "puras" (los routers las envolverán si hace falta).

/**
 * Crea un Map productId -> productDoc con productos activos encontrados.
 * Útil para refrescar precio/promo/stock antes de renderizar el carrito.
 * @param {string[]} ids
 * @returns {Promise<Map<string, any>>}
 */
async function getProductsMap(ids = []) {
  if (!ids.length) return new Map();
  const docs = await Product.find({
    _id: { $in: ids },
    active: true,
  })
    .select('title price stock promoEnabled promoPct imageUrl active')
    .lean()
    .exec();

  const map = new Map();
  for (const d of docs) map.set(String(d._id), d);
  return map;
}

/**
 * GET /cart
 * Refresca precios/stock con datos vigentes (si existen) y renderiza la vista.
 */
export async function viewCart(req, res) {
  const cart = new CartService(req.session);

  // Refrescar con productos "frescos"
  const ids = cart.data.items.map((it) => it.productId);
  const productsMap = await getProductsMap(ids);
  cart.recalc({ productsMap });

  // Avisos por ajustes (si hubo clamp por stock o se removieron ítems inactivos)
  const adjusted = cart.data.items.some((it) => it._adjusted);
  if (adjusted) {
    req.flash?.('warning', 'Actualizamos cantidades según stock disponible. Revisa tu carrito.');
    // limpiar flags internos para no repetir el aviso
    cart.data.items.forEach((it) => delete it._adjusted);
  }

  // Si quedó vacío, redirigir al catálogo
  if (cart.data.items.length === 0) {
    req.flash?.('info', 'Tu carrito está vacío. Agrega productos para continuar.');
    return res.redirect('/'); // o /products si separas la ruta
  }

  return res.render('cart/cart', {
    title: 'Tu carrito',
    cart: cart.getSummary(),
  });
}

/**
 * POST /cart/add/:id
 * Agrega una unidad (o qty indicada) de un producto activo con stock.
 */
export async function addToCart(req, res) {
  const { id } = req.params;
  const qty = Number.isFinite(Number(req.body?.qty)) ? Math.trunc(Number(req.body.qty)) : 1;

  const product = await Product.findOne({ _id: id, active: true })
    .select('title price stock promoEnabled promoPct imageUrl active')
    .exec();

  if (!product) {
    req.flash?.('error', 'El producto no existe o no está disponible.');
    return res.redirect('back');
  }

  const cart = new CartService(req.session);
  try {
    await cart.add(product, qty > 0 ? qty : 1);
    req.flash?.('success', `Se agregó "${product.title}" al carrito.`);
  } catch (err) {
    if (err?.name === 'CartError') {
      req.flash?.('error', err.message);
    } else {
      req.flash?.('error', 'No se pudo agregar al carrito.');
    }
  }

  return res.redirect('/cart');
}

/**
 * POST /cart/qty/:id
 * Cambia la cantidad de una línea. Si qty < 1, elimina la línea.
 */
export async function updateQty(req, res) {
  const { id } = req.params;
  const qty = Math.trunc(Number(req.body?.qty));

  const cart = new CartService(req.session);

  // Intentar refrescar con doc vigente (si existe) para capear por stock actual
  const fresh = await Product.findOne({ _id: id, active: true })
    .select('title price stock promoEnabled promoPct imageUrl active')
    .exec()
    .catch(() => null);

  try {
    await cart.setQty(id, qty, fresh || undefined);
    // Mensaje según acción
    if (qty < 1) {
      req.flash?.('success', 'Se eliminó el producto del carrito.');
    } else {
      req.flash?.('success', 'Cantidad actualizada.');
    }
  } catch (err) {
    if (err?.name === 'CartError') {
      req.flash?.('error', err.message);
    } else {
      req.flash?.('error', 'No se pudo actualizar la cantidad.');
    }
  }

  return res.redirect('/cart');
}

/**
 * POST /cart/remove/:id
 * Elimina una línea del carrito.
 */
export function removeItem(req, res) {
  const { id } = req.params;
  const cart = new CartService(req.session);
  cart.remove(id);
  req.flash?.('success', 'Producto eliminado del carrito.');
  return res.redirect('/cart');
}

/**
 * POST /cart/clear
 * Vacía el carrito por completo.
 */
export function clearCart(req, res) {
  const cart = new CartService(req.session);
  cart.clear();
  req.flash?.('success', 'Carrito vacío.');
  // Tras vaciar, redirigir al catálogo
  return res.redirect('/');
}
