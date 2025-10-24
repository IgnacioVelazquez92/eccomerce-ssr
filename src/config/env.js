import dotenv from 'dotenv';

dotenv.config();

/**
 * Validación mínima de variables de entorno.
 * No usa librerías extra para evitar dependencias.
 */
const REQUIRED = ['PORT', 'NODE_ENV', 'MONGO_URI', 'SESSION_SECRET'];

const missing = REQUIRED.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
if (missing.length) {
  // Hacemos el error bien claro para evitar “arranca pero falla después”
  console.error(`[ENV] Faltan variables requeridas: ${missing.join(', ')}`);
  process.exit(1);
}

// Exportamos un objeto inmutable “config” para usar en el resto de la app
export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV,
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGO_URI,
  sessionSecret: process.env.SESSION_SECRET,

  // Extras opcionales (pueden venir vacías ahora; se usan en otros módulos)
  mpPublicKey: process.env.MP_PUBLIC_KEY || '',
  mpAccessToken: process.env.MP_ACCESS_TOKEN || '',
  baseUrl: process.env.BASE_URL || `http://localhost:${Number(process.env.PORT) || 3000}`,
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    defaultFrom: process.env.DEFAULT_FROM || 'Ecommerce <no-reply@demo.test>',
  },
});
