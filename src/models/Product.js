// src/models/Product.js
// -----------------------------------------------------------------------------
// Modelo de Producto (Mongoose) para gestión en panel admin y catálogo público.
// - Cloudinary-only: guarda imageUrl y imagePublicId.
// - Validaciones: SKU único, price >= 0, stock >= 0, promoPct en 0..100.
// - Virtual: promoPrice (precio con descuento cuando promoEnabled = true).
// - Campos extra: description (breve), techSpecs (detalles), categoryId/Name.
// - Índices para admin y catálogo (búsqueda y filtros).
// -----------------------------------------------------------------------------

import mongoose from 'mongoose';

const { Schema } = mongoose;

const ProductSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'El título es obligatorio'],
      trim: true,
      minlength: [2, 'El título es muy corto'],
      maxlength: [200, 'El título es demasiado largo'],
    },

    sku: {
      type: String,
      required: [true, 'El SKU es obligatorio'],
      trim: true,
      unique: true,
      uppercase: true,
      index: true,
    },

    price: {
      type: Number,
      required: [true, 'El precio es obligatorio'],
      min: [0, 'El precio no puede ser negativo'],
    },

    stock: {
      type: Number,
      required: [true, 'El stock es obligatorio'],
      min: [0, 'El stock no puede ser negativo'],
      default: 0,
    },

    // Flags
    active: { type: Boolean, default: true, index: true },
    featured: { type: Boolean, default: false, index: true },

    // Promociones
    promoEnabled: { type: Boolean, default: false, index: true },
    promoPct: {
      type: Number,
      default: 0, // porcentaje 0..100
      min: [0, 'El porcentaje de promo no puede ser negativo'],
      max: [100, 'El porcentaje de promo no puede superar 100'],
    },

    // Contenidos
    description: {
      type: String,
      trim: true,
      default: '', // breve descripción comercial para la vista de detalle
      maxlength: [2000, 'La descripción es demasiado larga'],
    },
    // Ficha técnica — lista simple de características
    techSpecs: {
      type: [String],
      default: [], // ej: ["Peso: 500g", "Color: Azul", "Material: Acero"]
    },

    // Categoría
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    // Denormalizado opcional para render rápido en catálogo
    categoryName: { type: String, default: null },

    // Imagen (Cloudinary)
    imageUrl: {
      type: String, // secure URL (recomendado f_auto,q_auto desde el service)
      trim: true,
      default: '',
    },
    imagePublicId: {
      type: String, // public_id de Cloudinary
      trim: true,
      default: '',
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// -----------------------------------------------------------------------------
// Normalizaciones y clamps
// -----------------------------------------------------------------------------

// Asegura que promoPct quede siempre dentro de 0..100 (por si llega fuera de rango)
ProductSchema.pre('validate', function clampPromoPct(next) {
  if (typeof this.promoPct === 'number') {
    if (this.promoPct < 0) this.promoPct = 0;
    if (this.promoPct > 100) this.promoPct = 100;
  }
  next();
});

// -----------------------------------------------------------------------------
// Virtuals
// -----------------------------------------------------------------------------

// Precio con descuento si la promo está activa.
// Ej.: price=1000, promoPct=25 -> promoPrice=750; si no hay promo, promoPrice = price.
ProductSchema.virtual('promoPrice').get(function getPromoPrice() {
  const base = typeof this.price === 'number' ? this.price : 0;
  if (this.promoEnabled && typeof this.promoPct === 'number' && this.promoPct > 0) {
    const pct = Math.min(Math.max(this.promoPct, 0), 100);
    const discount = (base * pct) / 100;
    return Math.max(base - discount, 0);
  }
  return base;
});

// -----------------------------------------------------------------------------
// Índices adicionales
// -----------------------------------------------------------------------------

// Lista admin típica: activos más recientes primero
ProductSchema.index({ active: 1, updatedAt: -1 });

// Búsqueda básica por texto: title y sku
ProductSchema.index({ title: 'text', sku: 'text' });

// Catálogo: filtros frecuentes
ProductSchema.index({ active: 1, categoryId: 1 });
ProductSchema.index({ active: 1, price: 1 });

// -----------------------------------------------------------------------------
// Métodos / estáticos mínimos (opcionales para controladores)
// -----------------------------------------------------------------------------

/**
 * Alterna un booleano (active/featured/promoEnabled) de forma segura.
 * Útil si luego preferís llamarlo desde el controlador.
 */
ProductSchema.statics.toggleFlag = async function toggleFlag(id, flagName) {
  const ALLOWED = new Set(['active', 'featured', 'promoEnabled']);
  if (!ALLOWED.has(flagName)) {
    throw new Error(`Flag no permitido: ${flagName}`);
  }
  const doc = await this.findById(id).exec();
  if (!doc) throw new Error('Producto no encontrado');
  doc[flagName] = !doc[flagName];
  await doc.save();
  return doc;
};

const Product = mongoose.model('Product', ProductSchema);
export default Product;
