// src/models/Category.js
import mongoose from 'mongoose';

function slugify(str = '') {
  return String(str)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-z0-9]+/g, '-') // no alfanum -> guión
    .replace(/^-+|-+$/g, ''); // guiones extremos
}

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, required: true, unique: true, index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

CategorySchema.pre('validate', function (next) {
  if (!this.slug && this.name) this.slug = slugify(this.name);
  next();
});

export default mongoose.model('Category', CategorySchema);
