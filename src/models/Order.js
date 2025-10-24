// src/models/Order.js
// Modelo de Orden para el flujo de checkout con Mercado Pago (Checkout Pro).
//
// Propósito:
// - Persistir un "snapshot" del carrito en el momento del checkout (items y totales).
// - Guardar el estado del pago y los IDs de Mercado Pago (mpPreferenceId, mpPaymentId).
// - Relacionar la orden con el usuario autenticado (userId).
//
// Decisiones de diseño:
// - Items embebidos (subdocumentos) para congelar título, precio y qty tal como se mostraron al usuario.
// - Totales (subtotal, discount, total) "congelados" en el momento de crear la orden.
// - Campo `status` controlado por el resultado del pago: created|approved|pending|rejected.
// - `external_reference` en MP será el _id de esta Order (string).
//
// Requisitos externos:
// - Debe existir un modelo User y un modelo Product (referenciados por ID cuando corresponda).
// - El controlador calcula totales desde req.session.cart y los pasa al crear la Order.
//
// Uso típico:
//   const order = await Order.createFromCart({
//     userId: req.session.user._id,
//     cart: req.session.cart
//   });
//   // Luego crear preferencia MP usando order._id como external_reference.
//   // Después actualizar con mpPreferenceId/mpPaymentId y status en las return URLs o webhooks.

import mongoose from 'mongoose';

const { Schema, model, Types } = mongoose;

/**
 * Subdocumento de ítem de orden (snapshot del carrito).
 * Guardamos información mínima pero suficiente:
 * - productId: para trazabilidad con nuestro catálogo.
 * - title: texto mostrado al usuario en el momento del checkout.
 * - price: precio final unitario (ya con promo si aplica).
 * - qty: cantidad.
 * - subtotal: redundante para facilitar reporting (price * qty).
 */
const OrderItemSchema = new Schema(
  {
    productId: {
      type: Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'El precio debe ser >= 0'],
    },
    qty: {
      type: Number,
      required: true,
      min: [1, 'La cantidad debe ser >= 1'],
    },
    subtotal: {
      type: Number,
      required: true,
      min: [0, 'El subtotal debe ser >= 0'],
    },
  },
  { _id: false }, // no necesitamos _id por ítem; es un snapshot simple
);

/**
 * Esquema principal de Order.
 */
const OrderSchema = new Schema(
  {
    // Relación con el usuario que inició el checkout
    userId: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Snapshot de ítems
    items: {
      type: [OrderItemSchema],
      validate: [
        (arr) => Array.isArray(arr) && arr.length > 0,
        'La orden debe contener al menos un ítem',
      ],
      required: true,
    },

    // Totales congelados en el momento del checkout
    subtotal: {
      type: Number,
      required: true,
      min: [0, 'El subtotal debe ser >= 0'],
    },
    discount: {
      type: Number,
      required: true,
      min: [0, 'El descuento debe ser >= 0'],
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      min: [0, 'El total debe ser >= 0'],
    },

    // Estado del ciclo de pago
    status: {
      type: String,
      enum: ['created', 'approved', 'pending', 'rejected'],
      default: 'created',
      index: true,
    },

    // Identificadores de la integración de MP
    mpPreferenceId: {
      type: String,
      default: null,
      index: true,
    },
    mpPaymentId: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
    versionKey: false,
  },
);

// Índice útil para reportes por fecha y estado
OrderSchema.index({ createdAt: -1, status: 1 });

/**
 * Crea una Order a partir del carrito en sesión (snapshot).
 * Valida estructura y calcula totales congelados.
 *
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.userId - ID del usuario.
 * @param {Object} params.cart - Carrito en sesión.
 * @param {Array} params.cart.items - [{ productId, title, price, qty, promoApplied, subtotal }]
 * @param {number} params.cart.subtotal
 * @param {number} params.cart.total
 * @returns {Promise<OrderDocument>}
 */
OrderSchema.statics.createFromCart = async function ({ userId, cart }) {
  if (!userId) {
    throw new Error('[Order.createFromCart] Falta userId');
  }
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    throw new Error('[Order.createFromCart] Carrito inválido o vacío');
  }

  // Normalizamos ítems del carrito a OrderItemSchema
  const items = cart.items.map((it) => {
    const qty = Number(it.qty ?? 1);
    const price = Number(it.price);
    const subtotal = Number(it.subtotal ?? price * qty);

    if (!it.productId || !it.title || Number.isNaN(price) || Number.isNaN(qty)) {
      throw new Error('[Order.createFromCart] Ítem de carrito inválido');
    }

    return {
      productId: new Types.ObjectId(it.productId),
      title: it.title,
      price,
      qty,
      subtotal,
    };
  });

  // Totales: se confía en lo calculado por el servicio de carrito (Módulo 3)
  const subtotal = Number(cart.subtotal ?? items.reduce((acc, i) => acc + i.subtotal, 0));
  const total = Number(cart.total ?? subtotal); // discount = subtotal - total
  const discount = Math.max(0, subtotal - total);

  if ([subtotal, total, discount].some((n) => Number.isNaN(n) || n < 0)) {
    throw new Error('[Order.createFromCart] Totales inválidos');
  }

  // Crear y retornar la orden en estado "created"
  return this.create({
    userId,
    items,
    subtotal,
    discount,
    total,
    status: 'created',
  });
};

/**
 * Actualiza los campos de integración de Mercado Pago y el estado de la orden.
 *
 * @param {string|mongoose.Types.ObjectId} orderId
 * @param {Object} patch
 * @param {string} [patch.mpPreferenceId]
 * @param {string} [patch.mpPaymentId]
 * @param {"approved"|"pending"|"rejected"} [patch.status]
 * @returns {Promise<OrderDocument|null>}
 */
OrderSchema.statics.updateMpFields = function (orderId, patch) {
  const fields = {};
  if (patch.mpPreferenceId) fields.mpPreferenceId = patch.mpPreferenceId;
  if (patch.mpPaymentId) fields.mpPaymentId = patch.mpPaymentId;
  if (patch.status) fields.status = patch.status;
  return this.findByIdAndUpdate(orderId, fields, { new: true });
};

const Order = model('Order', OrderSchema);
export default Order;
