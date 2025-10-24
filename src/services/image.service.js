// src/services/image.service.js
// -----------------------------------------------------------------------------
// Servicio de imágenes con Cloudinary + fallback local.
// Ofrece una API uniforme para el controlador del módulo de Productos.
//
// Funciones exportadas:
// - uploadImage({ buffer, mimetype, size, originalname, publicIdPreferred, folder })
// - replaceImage({ previousPublicId, buffer, mimetype, size, originalname, publicIdPreferred, folder })
// - destroyImage(publicId)
// - isUsingCloudinary()
//
// Contratos:
// - Retorna siempre { imageUrl, imagePublicId } en upload/replace.
// - Lanza errores claros en validaciones y fallos de IO.
// - Si Cloudinary no está habilitado, guarda en /uploads/products y sirve desde /uploads.
//   (Deberás exponer estáticos en app.js: app.use('/uploads', express.static('uploads'));
//
// Requisitos externos:
// - Multer en memoria (p. ej., upload.single('image')) para obtener buffer/mimetype/size/originalname.
// -----------------------------------------------------------------------------

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  cloudinary,
  isCloudinaryEnabled,
  ensureCloudinaryOrThrow,
  buildDeliveryUrl,
} from '../config/cloudinary.js';

// -----------------------------
// Parámetros y utilidades
// -----------------------------
export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB (ajustable)

const DEFAULT_FOLDER = 'ecommerce/products'; // en Cloudinary
const LOCAL_BASE_DIR = path.resolve(process.cwd(), 'uploads');
const LOCAL_PRODUCTS_DIR = path.join(LOCAL_BASE_DIR, 'products');

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Validaciones simples en servicio (además de lo que haga multer)
function validateImageInput({ buffer, mimetype, size, originalname }) {
  if (!buffer || !buffer.length) {
    throw new Error('No se recibió el archivo de imagen (buffer vacío).');
  }
  if (!mimetype || !ALLOWED_MIME_TYPES.has(mimetype)) {
    throw new Error('Tipo de archivo no permitido. Solo JPG, PNG o WEBP.');
  }
  if (typeof size === 'number' && size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `La imagen excede el tamaño máximo de ${(MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(1)} MB.`,
    );
  }
  if (!originalname) {
    throw new Error('Falta el nombre original del archivo (originalname).');
  }
}

// Asegura directorios locales
async function ensureLocalDirs() {
  await fs.mkdir(LOCAL_PRODUCTS_DIR, { recursive: true });
}

// Genera nombre de archivo local único y seguro
function buildLocalFilename(originalname, mimetype) {
  const extFromMime = MIME_TO_EXT[mimetype]
    ? `.${MIME_TO_EXT[mimetype]}`
    : path.extname(originalname) || '.bin';
  const stamp = Date.now().toString(36);
  const rand = crypto.randomBytes(6).toString('hex');
  return `${stamp}-${rand}${extFromMime}`;
}

// Normaliza un "publicId" local a ruta absoluta segura dentro de /uploads/products
function localPublicIdToAbsPath(publicId) {
  // Esperamos algo como "products/filename.ext" (ruta relativa al dir /uploads)
  // Normalizamos y anclamos para evitar path traversal.
  const safeRel = path.normalize(publicId).replace(/^(\.\.(\/|\\|$))+/, '');
  const absPath = path.join(LOCAL_BASE_DIR, safeRel);
  const uploadsNormalized = path.normalize(LOCAL_BASE_DIR) + path.sep;
  const absNormalized = path.normalize(absPath) + path.sep.replace(/$/, ''); // ensure trailing sep if directory
  if (!absNormalized.startsWith(uploadsNormalized)) {
    throw new Error('Ruta local inválida al eliminar imagen.');
  }
  return absPath;
}

// -----------------------------
// Implementación Cloudinary
// -----------------------------
async function uploadToCloudinary({ buffer, folder, publicIdPreferred }) {
  ensureCloudinaryOrThrow();

  const publicIdOptions = {};
  if (publicIdPreferred && typeof publicIdPreferred === 'string') {
    // Si se pasa un publicId preferido, lo usamos sin overwrite por defecto
    publicIdOptions.public_id = publicIdPreferred;
    publicIdOptions.unique_filename = false;
    publicIdOptions.overwrite = false;
  } else {
    // Dejar que Cloudinary genere unique_filename
    publicIdOptions.unique_filename = true;
    publicIdOptions.overwrite = false;
  }

  const uploadOptions = {
    folder: folder || DEFAULT_FOLDER,
    resource_type: 'image',
    // Para thumbnails/transformaciones de entrega preferimos hacerlo en URL (buildDeliveryUrl).
    // Aquí almacenamos el original.
    ...publicIdOptions,
  };

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(uploadOptions, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
    stream.end(buffer);
  });

  // Generamos URL de entrega con f_auto / q_auto
  const deliveryUrl = buildDeliveryUrl(result.public_id, { secure: true, sign_url: false });
  return {
    imageUrl: deliveryUrl || result.secure_url,
    imagePublicId: result.public_id,
  };
}

async function destroyFromCloudinary(publicId) {
  ensureCloudinaryOrThrow();
  if (!publicId) return;

  // Nota: Cloudinary retorna distintos "result" según exista o no el recurso.
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
}

// -----------------------------
// Implementación Local
// -----------------------------
async function uploadToLocal({ buffer, mimetype, originalname }) {
  await ensureLocalDirs();
  const filename = buildLocalFilename(originalname, mimetype);
  const relPublicId = path.join('products', filename); // publicId local relativo a /uploads
  const absPath = path.join(LOCAL_PRODUCTS_DIR, filename);
  await fs.writeFile(absPath, buffer);

  return {
    imageUrl: `/uploads/${relPublicId.replace(/\\/g, '/')}`,
    imagePublicId: relPublicId.replace(/\\/g, '/'),
  };
}

async function destroyFromLocal(publicId) {
  if (!publicId) return;
  const abs = localPublicIdToAbsPath(publicId);
  // Si es archivo, lo borramos. Ignoramos si no existe.
  try {
    await fs.unlink(abs);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

// -----------------------------
// API pública
// -----------------------------

/**
 * Sube una imagen nueva.
 * @param {Object} params
 * @param {Buffer} params.buffer - contenido del archivo
 * @param {string} params.mimetype - ej. image/jpeg
 * @param {number} [params.size] - bytes (opcional)
 * @param {string} params.originalname - nombre original
 * @param {string} [params.publicIdPreferred] - sugerencia de public_id (para Cloudinary)
 * @param {string} [params.folder] - carpeta en Cloudinary (default: ecommerce/products)
 * @returns {{ imageUrl: string, imagePublicId: string }}
 */
export async function uploadImage(params) {
  const { buffer, mimetype, size, originalname, publicIdPreferred, folder } = params || {};
  validateImageInput({ buffer, mimetype, size, originalname });

  if (isCloudinaryEnabled) {
    return uploadToCloudinary({ buffer, folder, publicIdPreferred });
  }
  return uploadToLocal({ buffer, mimetype, originalname });
}

/**
 * Reemplaza una imagen existente: destruye la anterior (si hay) y sube la nueva.
 * Si fallara la subida nueva, intenta dejar la anterior intacta (best-effort).
 * @param {Object} params - mismos campos que uploadImage + previousPublicId
 * @returns {{ imageUrl: string, imagePublicId: string }}
 */
export async function replaceImage(params) {
  const { previousPublicId, buffer, mimetype, size, originalname, publicIdPreferred, folder } =
    params || {};

  validateImageInput({ buffer, mimetype, size, originalname });

  if (isCloudinaryEnabled) {
    // Subimos primero la nueva; si ok, borramos la anterior.
    const uploaded = await uploadToCloudinary({ buffer, folder, publicIdPreferred });
    try {
      if (previousPublicId) await destroyFromCloudinary(previousPublicId);
    } catch {
      // No interrumpimos si falla la destrucción; ya tenemos la nueva imagen.
    }
    return uploaded;
  }

  // Local: subimos primero la nueva; luego borramos la anterior.
  const uploaded = await uploadToLocal({ buffer, mimetype, originalname });
  try {
    if (previousPublicId) await destroyFromLocal(previousPublicId);
  } catch {
    // Ignoramos error de borrado local, mantenemos la nueva
  }
  return uploaded;
}

/**
 * Elimina una imagen por su publicId.
 * Acepta tanto Cloudinary public_id como publicId local (products/archivo.ext).
 */
export async function destroyImage(publicId) {
  if (!publicId) return;
  if (isCloudinaryEnabled) {
    await destroyFromCloudinary(publicId);
  } else {
    await destroyFromLocal(publicId);
  }
}

/**
 * Indica si el servicio está usando Cloudinary.
 */
export function isUsingCloudinary() {
  return isCloudinaryEnabled;
}
