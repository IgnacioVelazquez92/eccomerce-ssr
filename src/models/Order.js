// src/models/Order.js
// Modelo de Orden para el flujo de checkout con Mercado Pago (Checkout Pro) con idempotencia.
//
// Propósito:
// - Persistir un "snapshot" del carrito (items y totales).
// - Guardar estado del pago y los IDs de Mercado Pago.
// - Evitar múltiples órdenes "created" simultáneas del mismo usuario para el mismo carrito.
// - Permitir métricas de intentos y expiración.
//
// Estados posibles:
//   created | approved | pending | rejected | abandoned | expired
//
// Campos nuevos para idempotencia:
//   cartHash, attemptCount, lastAttemptAt, expiresAt, shippingMethod, shippingFee, shippingAddressId
//
// Requiere: modelo User, Product y (opcional) UserAddress.
//

import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;

/**
 * Subdocumento de ítem de orden (snapshot del carrito).
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
  { _id: false },
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

    // Snapshot de ítems del carrito
    items: {
      type: [OrderItemSchema],
      validate: [
        (arr) => Array.isArray(arr) && arr.length > 0,
        'La orden debe contener al menos un ítem',
      ],
      required: true,
    },

    // Totales congelados
    subtotal: { type: Number, required: true, min: [0, 'El subtotal debe ser >= 0'] },
    discount: { type: Number, required: true, min: [0, 'El descuento debe ser >= 0'], default: 0 },
    total: { type: Number, required: true, min: [0, 'El total debe ser >= 0'] },

    // Envío
    shippingMethod: {
      type: String,
      enum: ['pickup', 'delivery'],
      default: 'pickup',
    },
    shippingFee: {
      type: Number,
      default: 0,
      min: [0, 'El envío debe ser >= 0'],
    },
    shippingAddressId: {
      type: Schema.Types.ObjectId,
      ref: 'UserAddress',
      default: null,
    },

    // Estado del ciclo de pago
    status: {
      type: String,
      enum: ['created', 'approved', 'pending', 'rejected', 'abandoned', 'expired'],
      default: 'created',
      index: true,
    },

    // Campos para integración con MP
    mpPreferenceId: { type: String, default: null, index: true },
    mpPaymentId: { type: String, default: null, index: true },

    // Campos para idempotencia y control
    cartHash: { type: String, default: null, index: true },
    attemptCount: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  {
    timestamps: true, // createdAt, updatedAt
    versionKey: false,
  },
);

// Índices útiles
OrderSchema.index({ createdAt: -1, status: 1 });
// Evita múltiples "created" simultáneas por usuario
OrderSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: 'created' } });

/**
 * Actualiza campos de integración de MP y estado de la orden.
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
