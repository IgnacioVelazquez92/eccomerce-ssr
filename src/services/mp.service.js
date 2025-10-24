// src/services/mp.service.js
// Servicio de integración con Mercado Pago (Checkout Pro) para crear Preferencias.
//
// - Inicializa el SDK con MP_ACCESS_TOKEN.
// - Expone createPreference(cart, orderId) que valida el carrito,
//   mapea ítems, arma back_urls y devuelve { id, init_point, sandbox_init_point }.
//
// Requisitos .env:
//   MP_ACCESS_TOKEN=TEST-xxxxxxxx
//   BASE_URL=http://localhost:8080
//
// Notas de diseño:
// - SDK v2: { MercadoPagoConfig, Preference }.
// - auto_return solo si BASE_URL NO es local (MP rechaza localhost).
// - external_reference = orderId para reconciliar pagos ↔ órdenes.
// - notification_url lista (comentada) para cuando implementemos webhooks.
// - binary_mode: true (opcional).
/* eslint-disable no-throw-literal */

import { MercadoPagoConfig, Preference } from 'mercadopago';

const { MP_ACCESS_TOKEN, BASE_URL } = process.env;

// === Validaciones tempranas de configuración ===
if (!MP_ACCESS_TOKEN) {
  throw new Error('[mp.service] Falta MP_ACCESS_TOKEN en .env (usa TEST-...)');
}
if (!BASE_URL) {
  throw new Error('[mp.service] Falta BASE_URL en .env (ej: http://localhost:8080)');
}

// Normalizar BASE_URL: sin espacios y sin slash final
const BASE_URL_CLEAN = String(BASE_URL).trim().replace(/\/+$/, '');
if (!BASE_URL_CLEAN) {
  throw new Error('[mp.service] BASE_URL inválida tras normalizar (revisá .env)');
}

// Detectar si es entorno local (localhost/127.0.0.1)
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(BASE_URL_CLEAN);

// === Instancia del SDK de Mercado Pago ===
const mpClient = new MercadoPagoConfig({
  accessToken: MP_ACCESS_TOKEN,
});

// Logs al cargar el módulo
console.log('[mp.service] START — BASE_URL        =', BASE_URL);
console.log('[mp.service] START — BASE_URL_CLEAN =', BASE_URL_CLEAN);
console.log('[mp.service] START — IS_LOCAL       =', IS_LOCAL);

/**
 * Normaliza y valida un ítem del carrito al formato requerido por MP.
 *
 * @param {Object} it - Ítem del carrito en sesión.
 * @param {string|number} it.productId
 * @param {string} it.title
 * @param {number} it.price
 * @param {number} it.qty
 * @param {boolean} [it.promoApplied]
 * @returns {import("mercadopago/dist/clients/commonTypes").PreferenceItem}
 * @throws {{ code: string, message: string }}
 */
function mapCartItemToMP(it) {
  const title = (it?.title ?? '').toString().trim();
  const qty = Number(it?.qty ?? 1);
  const unit = Number(it?.price);

  if (!title) {
    throw { code: 'INVALID_ITEM_TITLE', message: `Falta título en ítem: ${JSON.stringify(it)}` };
  }
  if (Number.isNaN(unit) || unit <= 0) {
    throw { code: 'INVALID_ITEM_PRICE', message: `Precio inválido en ítem: ${JSON.stringify(it)}` };
  }
  if (Number.isNaN(qty) || qty <= 0) {
    throw { code: 'INVALID_ITEM_QTY', message: `Cantidad inválida en ítem: ${JSON.stringify(it)}` };
  }

  return {
    id: String(it.productId ?? ''), // opcional
    title,
    description: it.promoApplied ? 'Promo aplicada' : '',
    quantity: qty,
    currency_id: 'ARS', // ajustar si necesitas otra moneda
    unit_price: unit,
  };
}

/**
 * Crea una Preferencia de Checkout Pro a partir del carrito activo.
 *
 * @param {Object} cart - Carrito en sesión (`req.session.cart`).
 * @param {Array} cart.items - [{ productId, title, price, qty, promoApplied }]
 * @param {string|number} orderId - ID de la orden en Mongo (external_reference).
 * @returns {Promise<{ id: string, init_point: string, sandbox_init_point?: string }>}
 */
export async function createPreference(cart, orderId) {
  // --- Validaciones del carrito ---
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    throw { code: 'CART_EMPTY', message: 'El carrito está vacío o no es válido.' };
  }
  if (!orderId) {
    throw { code: 'MISSING_ORDER_ID', message: 'Falta orderId para external_reference.' };
  }

  // --- Mapeo de ítems ---
  const items = cart.items.map(mapCartItemToMP);

  // Logs de diagnóstico del contenido a enviar
  console.log('[mp.service] createPreference — orderId =', String(orderId));
  console.log('[mp.service] createPreference — items.length =', items.length);

  const back_urls = {
    success: `${BASE_URL_CLEAN}/checkout/success`,
    failure: `${BASE_URL_CLEAN}/checkout/failure`,
    pending: `${BASE_URL_CLEAN}/checkout/pending`,
  };

  // Log de back_urls antes de enviar
  console.log('[mp.service] createPreference — back_urls =', back_urls);

  // --- Construcción del cuerpo de preferencia ---
  const body = {
    items,
    back_urls,
    external_reference: String(orderId),
    // notification_url: `${BASE_URL_CLEAN}/webhooks/mp`, // activar cuando implementemos webhook
    binary_mode: true, // opcional
  };

  // auto_return solo si NO es local (evita error invalid_auto_return con localhost)
  if (!IS_LOCAL) {
    body.auto_return = 'approved';
    console.log('[mp.service] createPreference — auto_return = "approved" (no local)');
  } else {
    console.log('[mp.service] createPreference — auto_return OMITIDO (BASE_URL local)');
  }

  // Sanity check
  if (!body.back_urls.success) {
    throw new Error('[mp.service] back_urls.success quedó vacío; revisá BASE_URL');
  }

  // --- Llamada al SDK para crear la preferencia ---
  try {
    const prefClient = new Preference(mpClient);
    const pref = await prefClient.create({ body });

    // Logs de retorno de MP
    console.log('[mp.service] createPreference — MP response.id                 =', pref?.id);
    console.log(
      '[mp.service] createPreference — MP response.init_point         =',
      pref?.init_point,
    );
    console.log(
      '[mp.service] createPreference — MP response.sandbox_init_point =',
      pref?.sandbox_init_point,
    );

    return {
      id: pref.id,
      init_point: pref.init_point,
      sandbox_init_point: pref.sandbox_init_point,
    };
  } catch (e) {
    console.error('[mp.service] Error al crear preferencia:', {
      message: e?.message,
      error: e?.error,
      status: e?.status,
      cause: e?.cause,
      // bodySent: { ...body, items }, // si necesitás depurar el payload completo
    });
    throw e;
  }
}

export default { createPreference };
