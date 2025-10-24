// src/services/cart.service.js
// Servicio de carrito en sesión (sin base de datos).
// - Mantiene snapshot de precio/promos por ítem para consistencia visual.
// - Recalcula totales siempre que se modifica el carrito.
// - Permite refrescar precios/stock con documentos de producto (opcional) en recalc().
//
// Uso típico en controller (ejemplo):
//   import CartService from "../services/cart.service.js";
//   const cart = new CartService(req.session);
//   await cart.add(productDoc, qty);
//   // ... cart.getSummary()

/* eslint-disable no-underscore-dangle */

/**
 * Redondea a centavos trabajando en enteros para evitar errores de punto flotante.
 * @param {number} value - número en pesos/dólares (ej. 123.45)
 * @returns {number} centavos (ej. 12345)
 */
function toCents(value) {
  if (Number.isNaN(Number(value))) return 0;
  return Math.round(Number(value) * 100);
}

/**
 * Convierte centavos a número de punto flotante con 2 decimales.
 * @param {number} cents
 * @returns {number}
 */
function fromCents(cents) {
  return Math.round(Number(cents)) / 100;
}

/**
 * Calcula el precio con promo (si aplica). Devuelve en centavos.
 * @param {object} product - documento de producto (parcial)
 * @param {number} product.price - precio base (en número ej. 123.45)
 * @param {boolean} [product.promoEnabled]
 * @param {number} [product.promoPct] - porcentaje 0..100
 * @returns {{unitBaseCents:number, unitFinalCents:number, unitDiscountCents:number}}
 */
function computeUnitPrice(product) {
  const unitBaseCents = toCents(product?.price ?? 0);
  const hasPromo =
    !!product?.promoEnabled && typeof product?.promoPct === 'number' && product.promoPct > 0;

  if (!hasPromo) {
    return {
      unitBaseCents,
      unitFinalCents: unitBaseCents,
      unitDiscountCents: 0,
    };
  }
  const pct = Math.min(Math.max(product.promoPct, 0), 100); // clamp 0..100
  const unitFinalCents = Math.round(unitBaseCents * (1 - pct / 100));
  const unitDiscountCents = Math.max(unitBaseCents - unitFinalCents, 0);

  return { unitBaseCents, unitFinalCents, unitDiscountCents };
}

/**
 * Error de dominio controlado para el carrito.
 */
class CartError extends Error {
  /**
   * @param {string} message
   * @param {string} code - ej. "NOT_ACTIVE" | "OUT_OF_STOCK" | "INVALID_QTY"
   */
  constructor(message, code) {
    super(message);
    this.name = 'CartError';
    this.code = code;
  }
}

const CART_KEY = 'cart';

/**
 * Asegura la estructura base del carrito en la sesión.
 * @param {object} session
 */
function ensureCart(session) {
  if (!session[CART_KEY]) {
    session[CART_KEY] = {
      items: [],
      count: 0,
      subtotal: 0, // en número (no centavos) para mostrar
      discount: 0,
      total: 0,
      // metadatos internos en centavos para estabilidad de cálculo
      _meta: {
        subtotalCents: 0,
        discountCents: 0,
        totalCents: 0,
      },
    };
  }
}

export default class CartService {
  /**
   * @param {object} session - req.session
   */
  constructor(session) {
    if (!session) {
      throw new Error('CartService requiere una sesión válida (req.session).');
    }
    this.session = session;
    ensureCart(this.session);
  }

  /** @returns {object} objeto crudo del carrito en sesión */
  get data() {
    return this.session[CART_KEY];
  }

  /**
   * Recalcula líneas y totales.
   * Puede opcionalmente refrescar datos con un mapa de productos vigentes.
   * @param {{ productsMap?: Map<string, any> }} [opts]
   */
  recalc(opts = {}) {
    const cart = this.data;
    let subtotalCents = 0;
    let discountCents = 0;
    let count = 0;

    const productsMap = opts.productsMap instanceof Map ? opts.productsMap : null;

    cart.items = cart.items
      .map((it) => {
        // Si nos pasaron productos "frescos", actualizar snapshot (precio/stock/título/imagen).
        const fresh = productsMap?.get(it.productId) || null;
        const current = fresh || it; // si no hay fresh, usamos snapshot previo para cálculo

        // Si existe fresh: refrescamos campos que pueden cambiar.
        if (fresh) {
          it.title = fresh.title ?? it.title;
          it.imageUrl = fresh.imageUrl ?? it.imageUrl;

          const { unitBaseCents, unitFinalCents, unitDiscountCents } = computeUnitPrice(fresh);

          it.price = fromCents(unitBaseCents);
          it.promoPrice = unitFinalCents !== unitBaseCents ? fromCents(unitFinalCents) : null;
          it.unitBaseCents = unitBaseCents;
          it.unitFinalCents = unitFinalCents;
          it.unitDiscountCents = unitDiscountCents;

          // Cap a stock vigente si viene en fresh; si no, conserva stock snapshot.
          const stockFresh =
            typeof fresh.stock === 'number' ? Math.max(fresh.stock, 0) : (it.stock ?? 0);
          it.stock = stockFresh;
          if (it.qty > stockFresh) {
            it.qty = stockFresh; // ajusta hacia abajo
            it._adjusted = true;
          }
        }

        // Si el stock actual o snapshot quedó en 0, descartar línea.
        const stockNow = typeof current.stock === 'number' ? Math.max(current.stock, 0) : 0;
        if (stockNow <= 0 || it.qty <= 0) {
          return null; // remover
        }

        // Asegurar estructura de centavos para el cálculo (por si proviene de snapshot viejo).
        if (typeof it.unitBaseCents !== 'number' || typeof it.unitFinalCents !== 'number') {
          const { unitBaseCents, unitFinalCents, unitDiscountCents } = computeUnitPrice(current);
          it.price = fromCents(unitBaseCents);
          it.promoPrice = unitFinalCents !== unitBaseCents ? fromCents(unitFinalCents) : null;
          it.unitBaseCents = unitBaseCents;
          it.unitFinalCents = unitFinalCents;
          it.unitDiscountCents = unitDiscountCents;
        }

        const lineFinalCents = Math.max(Math.round(it.unitFinalCents * it.qty), 0);
        const lineDiscountCents = Math.max(Math.round(it.unitDiscountCents * it.qty), 0);
        it.lineSubtotal = fromCents(lineFinalCents);

        subtotalCents += lineFinalCents;
        discountCents += lineDiscountCents;
        count += it.qty;

        return it;
      })
      .filter(Boolean);

    const totalCents = Math.max(subtotalCents, 0); // sin extras por ahora
    cart._meta.subtotalCents = subtotalCents;
    cart._meta.discountCents = discountCents;
    cart._meta.totalCents = totalCents;

    cart.subtotal = fromCents(subtotalCents);
    cart.discount = fromCents(discountCents);
    cart.total = fromCents(totalCents);
    cart.count = count;
  }

  /**
   * Agrega un producto (mergea cantidad si ya existe).
   * @param {object} product - documento de producto (de Mongo/Mongoose)
   * @param {number} [qty=1]
   */
  async add(product, qty = 1) {
    if (!product?._id) throw new CartError('Producto inválido.', 'INVALID_PRODUCT');
    const productId = String(product._id);

    // Reglas de negocio básicas
    if (product.active === false) {
      throw new CartError('El producto no está activo.', 'NOT_ACTIVE');
    }
    const stock = Math.max(Number(product.stock ?? 0), 0);
    if (stock <= 0) {
      throw new CartError('Sin stock disponible.', 'OUT_OF_STOCK');
    }

    const addQty = Number.isFinite(qty) ? Math.trunc(qty) : 1;
    if (addQty <= 0) {
      throw new CartError('Cantidad inválida.', 'INVALID_QTY');
    }

    const { unitBaseCents, unitFinalCents, unitDiscountCents } = computeUnitPrice(product);

    // Buscar línea existente
    const cart = this.data;
    const idx = cart.items.findIndex((it) => it.productId === productId);

    if (idx >= 0) {
      const it = cart.items[idx];
      const newQty = Math.min(it.qty + addQty, stock);
      it.qty = newQty;
      // Refrescar snapshot de precio/promo/stock/título/imagen
      it.title = product.title ?? it.title;
      it.imageUrl = product.imageUrl ?? it.imageUrl;
      it.price = fromCents(unitBaseCents);
      it.promoPrice = unitFinalCents !== unitBaseCents ? fromCents(unitFinalCents) : null;
      it.unitBaseCents = unitBaseCents;
      it.unitFinalCents = unitFinalCents;
      it.unitDiscountCents = unitDiscountCents;
      it.stock = stock;
    } else {
      const qtyClamped = Math.min(addQty, stock);
      cart.items.push({
        productId,
        title: product.title ?? 'Producto',
        imageUrl: product.imageUrl ?? null,
        qty: qtyClamped,
        stock, // snapshot
        price: fromCents(unitBaseCents),
        promoPrice: unitFinalCents !== unitBaseCents ? fromCents(unitFinalCents) : null,
        unitBaseCents,
        unitFinalCents,
        unitDiscountCents,
        lineSubtotal: 0, // se setea en recalc
      });
    }

    this.recalc();
  }

  /**
   * Cambia cantidad de una línea. Si qty < 1 elimina.
   * Puede recibir el doc de producto para refrescar precio/stock en el acto.
   * @param {string} productId
   * @param {number} qty
   * @param {object} [product] - documento "fresco" (opcional)
   */
  async setQty(productId, qty, product = null) {
    const cart = this.data;
    const idx = cart.items.findIndex((it) => it.productId === String(productId));
    if (idx < 0) return; // no-op si no existe

    const it = cart.items[idx];
    const newQty = Math.trunc(Number(qty));
    if (!Number.isFinite(newQty)) {
      throw new CartError('Cantidad inválida.', 'INVALID_QTY');
    }

    if (newQty < 1) {
      // eliminar línea
      cart.items.splice(idx, 1);
      this.recalc();
      return;
    }

    // Cap por stock snapshot (o por product.stock si lo pasaron)
    let maxStock = it.stock ?? 0;
    if (product && typeof product.stock === 'number') {
      maxStock = Math.max(product.stock, 0);
      // refrescar snapshot de precio/stock si vino el producto
      const { unitBaseCents, unitFinalCents, unitDiscountCents } = computeUnitPrice(product);
      it.title = product.title ?? it.title;
      it.imageUrl = product.imageUrl ?? it.imageUrl;
      it.price = fromCents(unitBaseCents);
      it.promoPrice = unitFinalCents !== unitBaseCents ? fromCents(unitFinalCents) : null;
      it.unitBaseCents = unitBaseCents;
      it.unitFinalCents = unitFinalCents;
      it.unitDiscountCents = unitDiscountCents;
      it.stock = maxStock;
    }

    it.qty = Math.min(newQty, Math.max(maxStock, 0));
    this.recalc();
  }

  /**
   * Elimina una línea del carrito.
   * @param {string} productId
   */
  remove(productId) {
    const cart = this.data;
    cart.items = cart.items.filter((it) => it.productId !== String(productId));
    this.recalc();
  }

  /** Vacía el carrito por completo. */
  clear() {
    const cart = this.data;
    cart.items = [];
    this.recalc();
  }

  /**
   * Devuelve un resumen seguro para vistas (sin metadatos internos).
   * @returns {{items:Array, count:number, subtotal:number, discount:number, total:number}}
   */
  getSummary() {
    const { items, count, subtotal, discount, total } = this.data;
    return {
      items: items.map((it) => ({
        productId: it.productId,
        title: it.title,
        imageUrl: it.imageUrl,
        qty: it.qty,
        price: it.price,
        promoPrice: it.promoPrice,
        lineSubtotal: it.lineSubtotal,
      })),
      count,
      subtotal,
      discount,
      total,
    };
  }
}
