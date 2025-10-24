// src/controllers/order.controller.js
// Controlador de Checkout con Mercado Pago (Checkout Pro).
//
// Soporta:
// - FORM HTML (POST clásico): 303 Location → MP
// - FETCH/AJAX (Accept: application/json): JSON con { init_point, sandbox_init_point, url }
//
// En dev usa sandbox; en prod usa init_point.

import Order from '../models/Order.js';
import { createPreference } from '../services/mp.service.js';

/** Detecta si el request espera JSON (fetch/AJAX) */
function wantsJson(req) {
  const accept = req.get('accept') || '';
  const xrw = (req.get('x-requested-with') || '').toLowerCase();
  return accept.includes('application/json') || xrw === 'xmlhttprequest';
}

/** Mapea query params de retorno de MP */
function getMpReturnParams(req) {
  const q = req.query || {};
  return {
    paymentId: (q.payment_id ?? q.collection_id)?.toString() || undefined,
    status: (q.status ?? q.collection_status)?.toString() || undefined,
    preferenceId: q.preference_id?.toString() || undefined,
    externalReference: q.external_reference?.toString() || undefined,
    merchantOrderId: q.merchant_order_id?.toString() || undefined,
  };
}

/** Crea la orden "snapshot" con totales congelados a partir del carrito en sesión */
async function createOrderFromCart({ userId, cart, body }) {
  const shippingMethod = body?.shippingMethod === 'delivery' ? 'delivery' : 'pickup';
  const shippingFee = shippingMethod === 'delivery' ? 2000 : 0;

  const items = (cart.items || []).map((i) => {
    const price = Number(i.price) || 0;
    const qty = Number(i.qty) || 0;
    return {
      productId: i.productId,
      title: i.title,
      price,
      qty,
      subtotal: Number((price * qty).toFixed(2)), // ← requerido por tu esquema
    };
  });

  const subtotal = Number(
    (cart.subtotal ?? items.reduce((a, it) => a + it.subtotal, 0)).toFixed(2),
  );
  const discount = Number((cart.discount ?? 0).toFixed(2));
  const baseTotal = Number((cart.total ?? subtotal - discount).toFixed(2));
  const total = Number((baseTotal + shippingFee).toFixed(2));

  const order = await Order.create({
    userId,
    subtotal,
    discount,
    shippingFee,
    shippingMethod,
    shippingAddressId: body?.addressId || body?.shippingAddressId || null,
    total,
    items,
    status: 'created',
  });

  return { order, shippingMethod, shippingFee };
}

/** Actualiza campos de MP y/o estado en la orden */
async function updateOrderMpFields(orderId, patch) {
  return Order.findByIdAndUpdate(orderId, patch, { new: true });
}

/**
 * POST /checkout
 * - Valida sesión y carrito
 * - Crea Order (snapshot)
 * - Crea Preferencia en MP (external_reference = order._id)
 * - Guarda mpPreferenceId
 * - Devuelve:
 *   • FORM HTML → 303 Location (MP)
 *   • FETCH/AJAX → JSON { init_point, sandbox_init_point, url, orderId, preferenceId }
 */
export async function postCheckout(req, res, next) {
  try {
    const isAjax = wantsJson(req);
    const sessionUser = req.session?.user || null;
    const userId = sessionUser?._id || sessionUser?.id;
    const cart = req.session?.cart;

    if (!userId) {
      return isAjax ? res.status(401).json({ error: 'No autenticado' }) : res.redirect('/login');
    }
    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      return isAjax
        ? res.status(400).json({ error: 'El carrito está vacío' })
        : res.redirect('/cart');
    }

    // 1) Crear Order
    const { order, shippingMethod } = await createOrderFromCart({ userId, cart, body: req.body });

    // 2) Crear preferencia en MP
    const pref = await createPreference(cart, order._id.toString());

    // 3) Persistir mpPreferenceId + externalReference
    await updateOrderMpFields(order._id, {
      mpPreferenceId: pref.id,
      externalReference: String(order._id),
    });

    // 4) Elegir URL de destino (sandbox en dev, init_point en prod)
    const isProd = process.env.NODE_ENV === 'production';
    const url = isProd ? pref.init_point : pref.sandbox_init_point || pref.init_point;

    console.log('[checkout][POST] order:', String(order._id));
    console.log('[checkout][POST] preferenceId:', pref?.id);
    console.log(
      '[checkout][POST] method:',
      isAjax ? 'AJAX/JSON' : 'FORM/303',
      'shipping:',
      shippingMethod,
    );
    console.log('[checkout][POST] redirect to:', url);

    if (isAjax) {
      // Devolvemos las 3 variantes para compatibilidad con tu front actual
      res.set('Vary', 'Accept');
      return res.status(201).json({
        orderId: order._id,
        preferenceId: pref.id,
        init_point: pref.init_point,
        sandbox_init_point: pref.sandbox_init_point,
        url, // por si luego querés usar un único campo
        env: isProd ? 'production' : 'development',
      });
    }

    // FORM HTML: 303 → MP (con fallback HTML)
    res.status(303).set('Location', url);
    return res.send(`<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${url}"><title>Redirigiendo…</title></head>
<body>
  <noscript>
    <p>Si no sos redirigido automáticamente, hacé clic:
      <a href="${url}">Continuar al pago</a>
    </p>
  </noscript>
  <script>location.href=${JSON.stringify(url)};</script>
</body>
</html>`);
  } catch (err) {
    console.error('[postCheckout] Error:', err);
    if (wantsJson(req)) return res.status(500).json({ error: 'No se pudo iniciar el checkout' });
    return next(err);
  }
}

/** GET /checkout/success — marca approved si aplica */
export async function getCheckoutSuccess(req, res) {
  const { paymentId, status, preferenceId, externalReference } = getMpReturnParams(req);
  try {
    const order =
      (externalReference && (await Order.findById(externalReference))) ||
      (preferenceId && (await Order.findOne({ mpPreferenceId: preferenceId })));

    if (!order) {
      return res.status(404).render('checkout/failure', {
        title: 'Pago - Orden no encontrada',
        message: 'No pudimos identificar la orden asociada al pago.',
      });
    }

    const newStatus = status === 'approved' ? 'approved' : order.status;
    const patched = await updateOrderMpFields(order._id, {
      mpPaymentId: paymentId || order.mpPaymentId,
      mpPreferenceId: preferenceId || order.mpPreferenceId,
      status: newStatus,
    });

    if (newStatus === 'approved') req.session.cart = null;

    return res.render('checkout/success', {
      title: 'Pago aprobado',
      order: patched,
      mp: { paymentId, preferenceId, status },
    });
  } catch (err) {
    console.error('[getCheckoutSuccess] Error:', err);
    return res.status(500).render('checkout/failure', {
      title: 'Error al procesar el retorno',
      message: 'Ocurrió un error al confirmar tu pago.',
    });
  }
}

/** GET /checkout/pending — marca pending */
export async function getCheckoutPending(req, res) {
  const { paymentId, status, preferenceId, externalReference } = getMpReturnParams(req);
  try {
    const order =
      (externalReference && (await Order.findById(externalReference))) ||
      (preferenceId && (await Order.findOne({ mpPreferenceId: preferenceId })));

    if (!order) {
      return res.status(404).render('checkout/failure', {
        title: 'Pago - Orden no encontrada',
        message: 'No encontramos la orden asociada al pago pendiente.',
      });
    }

    const patched = await updateOrderMpFields(order._id, {
      mpPaymentId: paymentId || order.mpPaymentId,
      mpPreferenceId: preferenceId || order.mpPreferenceId,
      status: 'pending',
    });

    return res.render('checkout/pending', {
      title: 'Pago pendiente',
      order: patched,
      mp: { paymentId, preferenceId, status },
    });
  } catch (err) {
    console.error('[getCheckoutPending] Error:', err);
    return res.status(500).render('checkout/failure', {
      title: 'Error al procesar el retorno',
      message: 'Ocurrió un error al registrar el estado pendiente.',
    });
  }
}

/** GET /checkout/failure — marca rejected si la identificamos */
export async function getCheckoutFailure(req, res) {
  const { paymentId, status, preferenceId, externalReference } = getMpReturnParams(req);
  try {
    const order =
      (externalReference && (await Order.findById(externalReference))) ||
      (preferenceId && (await Order.findOne({ mpPreferenceId: preferenceId })));

    if (!order) {
      return res.render('checkout/failure', {
        title: 'Pago rechazado',
        message:
          'No pudimos identificar tu orden, pero el intento de pago fue rechazado. Podés volver a intentarlo.',
      });
    }

    const patched = await updateOrderMpFields(order._id, {
      mpPaymentId: paymentId || order.mpPaymentId,
      mpPreferenceId: preferenceId || order.mpPreferenceId,
      status: 'rejected',
    });

    return res.render('checkout/failure', {
      title: 'Pago rechazado',
      order: patched,
      mp: { paymentId, preferenceId, status },
    });
  } catch (err) {
    console.error('[getCheckoutFailure] Error:', err);
    return res.status(500).render('checkout/failure', {
      title: 'Error al procesar el retorno',
      message: 'Ocurrió un error al registrar el rechazo del pago.',
    });
  }
}
