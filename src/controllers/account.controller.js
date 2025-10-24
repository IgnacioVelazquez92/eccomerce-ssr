// src/controllers/account.controller.js
// -----------------------------------------------------------------------------
// Controlador de Cuenta (Perfil de Usuario) — TODO en /account/profile
// -----------------------------------------------------------------------------
// UX-first: un único lugar para ver y editar datos personales:
//   • Ver perfil (GET /account/profile)
//   • Actualizar teléfono (POST /account/profile/phone)
//   • Agregar dirección (POST /account/profile/addresses)
//   • Marcar dirección preferida (POST /account/profile/addresses/:id/default)
//   • Eliminar dirección (POST /account/profile/addresses/:id/delete)
//
// Notas de integración
// - Todas las rutas deben estar protegidas con requireAuth (sesión activa).
// - La vista que renderizamos es **auth/profile.hbs** (reutilizamos tu file).
//   Luego, en ese template, pondremos los formularios de teléfono + direcciones.
// - El modelo User expone helpers: addAddress(data), setDefaultAddress(addrId).
// -----------------------------------------------------------------------------

import { User } from '../models/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Utils internos
// ─────────────────────────────────────────────────────────────────────────────
const trim = (v) => String(v ?? '').trim();

async function findUserDoc(req) {
  if (!req.user?.id) return null;
  return User.findById(req.user.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /account/profile
// Renderiza el perfil con teléfono + direcciones en una única pantalla.
// Reutilizamos la vista auth/profile.hbs para no dispersar templates.
// -----------------------------------------------------------------------------
export async function showProfile(req, res, next) {
  try {
    // Usamos .lean() para render rápido. Enviamos user completo.
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.redirect('/login');

    return res.render('auth/profile', {
      title: 'Mi perfil',
      user, // phone, addresses[], defaultAddressId, name, email, role, active...
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /account/profile/phone
// Actualiza el teléfono del usuario y redirige a /account/profile.
// -----------------------------------------------------------------------------
export async function updatePhone(req, res, next) {
  try {
    await User.updateOne({ _id: req.user.id }, { $set: { phone: trim(req.body?.phone) } });
    return res.redirect('/account/profile');
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /account/profile/addresses
// Agrega una dirección. Si es la primera, queda como preferida.
// Body: { label?, line1, line2?, city, state, zip }
// Redirige a /account/profile.
// -----------------------------------------------------------------------------
export async function addAddress(req, res, next) {
  try {
    const u = await findUserDoc(req);
    if (!u) return res.redirect('/login');

    u.addAddress({
      label: req.body?.label,
      line1: req.body?.line1,
      line2: req.body?.line2,
      city: req.body?.city,
      state: req.body?.state,
      zip: req.body?.zip,
    });

    await u.save();
    return res.redirect('/account/profile');
  } catch (err) {
    // Si faltan campos obligatorios, el método del modelo lanza → 400
    err.status = err.status || 400;
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /account/profile/addresses/:id/default
// Marca una dirección como preferida. Redirige a /account/profile.
// -----------------------------------------------------------------------------
export async function setDefaultAddress(req, res, next) {
  try {
    const u = await findUserDoc(req);
    if (!u) return res.redirect('/login');

    u.setDefaultAddress(req.params?.id); // lanza si no existe
    await u.save();

    return res.redirect('/account/profile');
  } catch (err) {
    err.status = err.status || 400;
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /account/profile/addresses/:id/delete
// Elimina una dirección. Si era la preferida, reasigna a la primera o null.
// Redirige a /account/profile.
// -----------------------------------------------------------------------------
export async function deleteAddress(req, res, next) {
  try {
    const u = await findUserDoc(req);
    if (!u) return res.redirect('/login');

    const addrId = req.params?.id;
    const addr = u.addresses.id(addrId);
    if (addr) addr.deleteOne();

    if (u.defaultAddressId && String(u.defaultAddressId) === String(addrId)) {
      u.defaultAddressId = u.addresses[0]?._id || null;
    }

    await u.save();
    return res.redirect('/account/profile');
  } catch (err) {
    next(err);
  }
}
