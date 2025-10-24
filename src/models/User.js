// src/models/User.js
// -----------------------------------------------------------------------------
// Modelo de Usuario (Mongoose) para autenticación con sesiones + datos básicos
// de contacto y envío.
// -----------------------------------------------------------------------------
// Objetivos de diseño
// - Solo se almacena el hash de la contraseña (passwordHash).
// - Email único, normalizado en minúsculas y validado.
// - Roles mínimos: "user" | "admin" (extensible).
// - Campos de contacto: phone.
// - Direcciones múltiples como subdocumentos; se puede marcar una por defecto.
// - Métodos de dominio: setPassword, checkPassword, hasRole, addAddress,
//   setDefaultAddress. Getter virtual: isAdmin.
// - Salida JSON saneada (oculta passwordHash y __v; expone id como string).
//
// Notas
// - Este modelo NO hashea automáticamente en pre('save') para evitar dobles
//   hash involuntarios. Usar el método setPassword() explícitamente.
// - defaultAddressId guarda el _id del subdocumento dentro de addresses; no
//   se usa ref/poblado porque es un subdoc embebido, no una colección aparte.
//
// Requisitos: mongoose, bcrypt (o bcryptjs con la misma API si el equipo lo prefiere)
// -----------------------------------------------------------------------------

import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcrypt';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

export const USER_ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
});

// Validación simple de email (suficiente para backend + UI)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

// ─────────────────────────────────────────────────────────────────────────────
// Subdocumento de Direcciones
// ─────────────────────────────────────────────────────────────────────────────
const AddressSchema = new Schema(
  {
    label: { type: String, trim: true }, // Ej.: "Casa", "Trabajo" (opcional)
    line1: { type: String, required: true, trim: true }, // Calle y número
    line2: { type: String, trim: true }, // Piso/Dto (opcional)
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true }, // Provincia
    zip: { type: String, required: true, trim: true }, // Código Postal
  },
  { _id: true },
);

// ─────────────────────────────────────────────────────────────────────────────
// Esquema de Usuario
// ─────────────────────────────────────────────────────────────────────────────
const UserSchema = new Schema(
  {
    name: {
      type: String,
      trim: true,
      minlength: [2, 'El nombre debe tener al menos 2 caracteres.'],
      maxlength: [80, 'El nombre debe tener como máximo 80 caracteres.'],
    },

    email: {
      type: String,
      required: [true, 'El email es obligatorio.'],
      lowercase: true, // fuerza almacenamiento en minúsculas
      trim: true,
      validate: {
        validator: (v) => EMAIL_REGEX.test(v),
        message: 'El email no tiene un formato válido (ej. usuario@dominio.com).',
      },
      unique: true, // índice único en la base
    },

    // Guardamos SOLO el hash. La contraseña en texto plano nunca se persiste.
    passwordHash: {
      type: String,
      required: [true, 'La contraseña es obligatoria.'],
      select: false, // por defecto no se incluye en find()
    },

    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.USER,
      index: true,
    },

    active: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Contacto y envío
    phone: { type: String, trim: true },
    addresses: { type: [AddressSchema], default: [] },
    // Guarda el _id de un subdocumento de addresses
    defaultAddressId: { type: Schema.Types.ObjectId },
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = ret._id?.toString();
        delete ret._id;
        delete ret.passwordHash;
        return ret;
      },
    },
    toObject: { virtuals: true, versionKey: false },
  },
);

// Índices adicionales (además del email único)
UserSchema.index({ createdAt: -1 });

// ─────────────────────────────────────────────────────────────────────────────
// Métodos de instancia
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hashea y setea la contraseña del usuario.
 * Importante: NO guarda el documento (setear y luego hacer save()).
 */
UserSchema.methods.setPassword = async function setPassword(plainPassword) {
  if (typeof plainPassword !== 'string' || plainPassword.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  this.passwordHash = await bcrypt.hash(plainPassword, salt);
};

/**
 * Compara una contraseña en claro contra el hash almacenado.
 * Nota: si el documento fue obtenido sin 'passwordHash' (por select:false),
 * deberás refetchear con .select('+passwordHash') antes de usar este método.
 */
UserSchema.methods.checkPassword = async function checkPassword(plainPassword) {
  if (!this.passwordHash) {
    throw new Error(
      "passwordHash no cargado en el documento. Usa .select('+passwordHash') al consultar.",
    );
  }
  return bcrypt.compare(plainPassword, this.passwordHash);
};

/** Devuelve true si el usuario posee el rol requerido. */
UserSchema.methods.hasRole = function hasRole(role) {
  return this.role === role;
};

/** Getter conveniente: user.isAdmin → boolean */
UserSchema.virtual('isAdmin').get(function isAdmin() {
  return this.role === USER_ROLES.ADMIN;
});

/**
 * Agrega una dirección validando campos obligatorios.
 * Si es la primera dirección, queda como preferida (default).
 * Devuelve el subdocumento agregado.
 */
UserSchema.methods.addAddress = function addAddress(data) {
  const addr = this.addresses.create({
    label: data.label?.trim() || '',
    line1: String(data.line1 || '').trim(),
    line2: String(data.line2 || '').trim(),
    city: String(data.city || '').trim(),
    state: String(data.state || '').trim(),
    zip: String(data.zip || '').trim(),
  });

  if (!addr.line1 || !addr.city || !addr.state || !addr.zip) {
    throw new Error('Faltan campos obligatorios (calle, ciudad, provincia, CP).');
  }

  this.addresses.push(addr);
  if (!this.defaultAddressId) this.defaultAddressId = addr._id; // primera = default
  return addr;
};

/** Marca como preferida la dirección cuyo _id se pasa por parámetro. */
UserSchema.methods.setDefaultAddress = function setDefaultAddress(addrId) {
  const exists = this.addresses.id(addrId);
  if (!exists) throw new Error('Dirección no encontrada.');
  this.defaultAddressId = addrId;
};

// ─────────────────────────────────────────────────────────────────────────────
// Métodos estáticos de conveniencia
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un usuario realizando hashing interno.
 * Útil para seeds o registros centralizados en servicios/DAO.
 */
UserSchema.statics.register = async function register({
  name,
  email,
  password,
  role = USER_ROLES.USER,
  active = true,
}) {
  const user = new this({ name, email, role, active, passwordHash: 'tmp' });
  await user.setPassword(password);
  return user.save();
};

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────
const User = mongoose.models.User || mongoose.model('User', UserSchema);
export default User;
