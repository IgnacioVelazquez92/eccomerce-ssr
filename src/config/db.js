//src/config/db.js
import mongoose from 'mongoose';
import { config } from './env.js';

let cached = global.__mongoConn;
if (!cached) cached = global.__mongoConn = { conn: null, promise: null };

/**
 * Conexión a MongoDB (re-usable en dev para evitar múltiples sockets).
 */
export async function connectDb() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(config.mongoUri, {
        // Ajustes recomendados en Mongoose 7+
        autoIndex: config.nodeEnv !== 'production',
      })
      .then((m) => {
        if (config.nodeEnv !== 'test') {
          console.log('[DB] Conectado a MongoDB');
        }
        return m;
      })
      .catch((err) => {
        console.error('[DB] Error de conexión a MongoDB:', err.message);
        process.exit(1);
      });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
