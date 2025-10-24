// src/routes/checkout.js
// Rutas del flujo de Checkout con Mercado Pago (Checkout Pro, sandbox).
//
// Endpoints:
//   GET  /checkout               -> Renderiza la página de confirmación (entrega + dirección + resumen)
//   POST /checkout               -> Inicia el checkout: crea Order + Preferencia MP y devuelve init_point
//   GET  /checkout/success       -> Return URL de MP (pago aprobado)
//   GET  /checkout/pending       -> Return URL de MP (pago pendiente)
//   GET  /checkout/failure       -> Return URL de MP (pago rechazado)
//
// Requisitos de sesión:
// - `requireAuth` protege GET/POST /checkout (el usuario debe estar logueado).
// - El carrito vive en req.session.cart (Módulo 3).
//
// Nota CSP:
// - Usamos Helmet con CSP + nonce. Si tu template `checkout.hbs` incluye <script> inline,
//   agregá `nonce="{{cspNonce}}"` en la etiqueta para que no lo bloquee el navegador.

import { Router } from 'express';
import {
  postCheckout,
  getCheckoutSuccess,
  getCheckoutPending,
  getCheckoutFailure,
  // postWebhookMp, // (opcional) activar cuando implementes webhooks
} from '../controllers/order.controller.js';
import { requireAuth } from '../middlewares/auth.js';
import { User } from '../models/index.js';
const router = Router();

/**
 * GET /checkout
 * Render de confirmación (método de entrega + direcciones guardadas + resumen).
 * - Carga direcciones SIEMPRE desde BD (evita depender de lo que haya en la sesión).
 * - Normaliza _id -> id string para la vista.
 * - LOGS de diagnóstico para ver qué está llegando.
 */
router.get('/checkout', requireAuth, async (req, res, next) => {
  try {
    const sessionUser = req.session?.user || null;
    const userId = sessionUser?._id || sessionUser?.id;

    console.log(
      '[checkout][GET] session.user has addresses:',
      Array.isArray(sessionUser?.addresses) ? sessionUser.addresses.length : 'no',
    );

    // Leer desde BD sólo los campos necesarios
    const dbUser = userId
      ? await User.findById(userId).select('name email addresses defaultAddressId').lean()
      : null;

    console.log(
      '[checkout][GET] dbUser loaded:',
      !!dbUser,
      'addresses:',
      Array.isArray(dbUser?.addresses) ? dbUser.addresses.length : 0,
    );

    const defaultId = dbUser?.defaultAddressId ? String(dbUser.defaultAddressId) : null;

    // Normalizar direcciones: id string + flag isDefault
    const addresses = Array.isArray(dbUser?.addresses)
      ? dbUser.addresses.map((a, i) => {
          const id = a._id?.toString?.() || a.id || '';
          return {
            id,
            label: a.label || 'Sin etiqueta',
            line1: a.line1 || '',
            line2: a.line2 || '',
            city: a.city || '',
            state: a.state || '',
            zip: a.zip || '',
            isDefault: defaultId ? id === defaultId : i === 0,
          };
        })
      : [];

    const cart = req.session?.cart || null;

    // LOGS finales de lo que vamos a pintar
    console.log('[checkout][GET] will render addresses:', addresses.length, 'default:', defaultId);

    return res.render('checkout/checkout', {
      title: 'Checkout',
      user: {
        name: dbUser?.name || sessionUser?.name || '',
        email: dbUser?.email || sessionUser?.email || '',
      },
      addresses, // <-- USAR ESTO EN LA VISTA
      defaultAddressId: defaultId,
      cart,
    });
  } catch (err) {
    next(err);
  }
});

// Inicia el flujo de pago: requiere usuario autenticado
router.post('/checkout', requireAuth, postCheckout);

// Return URLs que Mercado Pago redirige al finalizar el intento de pago
router.get('/checkout/success', getCheckoutSuccess);
router.get('/checkout/pending', getCheckoutPending);
router.get('/checkout/failure', getCheckoutFailure);

// (Opcional) Webhook server-to-server (recordá configurar notification_url en la preferencia)
// import express from "express";
// router.post("/webhooks/mp", express.json({ type: "*/*" }), postWebhookMp);

export default router;
