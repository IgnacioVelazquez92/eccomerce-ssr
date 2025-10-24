// src/config/cloudinary.js
// ------------------------------------------------------------
// Inicialización y helpers mínimos para Cloudinary (v2).
// Lee credenciales desde .env usando dos esquemas:
//
// A) CLOUDINARY_URL="cloudinary://<api_key>:<api_secret>@<cloud_name>"
//
// B) CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
//
// Exporta:
// - cloudinary: instancia v2 (si hay credenciales, ya configurada).
// - isCloudinaryEnabled: boolean para saber si Cloudinary está activo.
// - ensureCloudinaryOrThrow(): lanza error si se intenta usar sin estar habilitado.
// - buildDeliveryUrl(publicId, options): helper para generar URLs con f_auto/q_auto.
// ------------------------------------------------------------

import { v2 as cloudinary } from 'cloudinary';

const hasUrl = !!process.env.CLOUDINARY_URL;
const hasTriplet =
  !!process.env.CLOUDINARY_CLOUD_NAME &&
  !!process.env.CLOUDINARY_API_KEY &&
  !!process.env.CLOUDINARY_API_SECRET;

// Cloudinary se considera "habilitado" si hay URL o trío de variables.
export const isCloudinaryEnabled = hasUrl || hasTriplet;

// Configuración segura por defecto (HTTPS). Si usás CLOUDINARY_URL,
// con sólo setear `secure: true` ya queda activo. Si usás el trío,
// seteamos explícitamente cada valor.
if (isCloudinaryEnabled) {
  if (hasUrl) {
    // Usa CLOUDINARY_URL; añadimos secure:true para entregar por HTTPS.
    cloudinary.config({
      secure: true,
    });
  } else {
    // Configuración por trío de variables.
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
}

// ------------------------------------------------------------
// Helper opcional: asegura que Cloudinary esté habilitado.
// Útil en servicios para fallar rápido si se pretende subir/borrar
// una imagen sin credenciales configuradas.
// ------------------------------------------------------------
export function ensureCloudinaryOrThrow() {
  if (!isCloudinaryEnabled) {
    throw new Error(
      'Cloudinary no está habilitado. Definí CLOUDINARY_URL o ' +
        'CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET en el .env',
    );
  }
}

// ------------------------------------------------------------
// Helper: construir URL de entrega con defaults sensatos.
// - publicId: string (por ejemplo "ecommerce/products/abc123")
// - options: opciones de transformación (width, height, crop, etc.)
//   Por defecto aplicamos f_auto y q_auto para optimización.
// ------------------------------------------------------------
export function buildDeliveryUrl(publicId, options = {}) {
  const baseOptions = {
    fetch_format: 'auto', // f_auto
    quality: 'auto', // q_auto
    ...options,
  };
  return cloudinary.url(publicId, baseOptions);
}

export { cloudinary };
