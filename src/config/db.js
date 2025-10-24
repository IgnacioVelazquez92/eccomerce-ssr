// src/config/db.js
import mongoose from 'mongoose';
import { config } from './env.js';

/**
 * Conexión a MongoDB (reutilizable entre hot reloads en desarrollo).
 * Adaptado para Render + MongoDB Atlas (TLS + IPv4 forzado).
 */
let cached = global.__mongoConn;
if (!cached) cached = global.__mongoConn = { conn: null, promise: null };

export async function connectDb() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const opts = {
      // Recomendaciones para Atlas + Render
      serverSelectionTimeoutMS: 30000, // 30 s para selección de servidor
      tls: true, // obligatorio en Atlas
      tlsAllowInvalidCertificates: false, // mantener en false
      family: 4, // fuerza IPv4 (evita handshake fallido)
      autoIndex: config.nodeEnv !== 'production', // índices automáticos solo en dev
    };

    console.log('[DB] Intentando conectar a MongoDB...');
    console.log(`[DB] URI: ${config.mongoUri ? '✅ definida' : '❌ no definida'}`);

    cached.promise = mongoose
      .connect(config.mongoUri, opts)
      .then((m) => {
        console.log('[DB] ✅ Conectado a MongoDB Atlas');
        return m;
      })
      .catch((err) => {
        console.error('[DB] ❌ Error de conexión a MongoDB:', err?.message || err);
        process.exit(1);
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
