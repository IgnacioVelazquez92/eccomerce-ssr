// src/controllers/admin.controller.js
// -----------------------------------------------------------------------------
// Gestión de usuarios para el panel Admin (solo rol "admin").
// Acciones: listar, crear, editar nombre/rol, activar/desactivar.
// -----------------------------------------------------------------------------
import { User, USER_ROLES } from '../models/index.js';
import mongoose from 'mongoose';
import Order from '../models/Order.js';

export async function listUsers(req, res, next) {
  try {
    const users = await User.find().sort({ createdAt: -1 }).lean();
    return res.render('admin/users', {
      title: 'Usuarios',
      users,
      roles: Object.values(USER_ROLES),
    });
  } catch (err) {
    next(err);
  }
}

export async function createUser(req, res, next) {
  try {
    const { name = '', email = '', password = '', role = USER_ROLES.USER } = req.body || {};
    await User.register({ name: name.trim(), email: email.trim().toLowerCase(), password, role });
    return res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { name = '', role = USER_ROLES.USER } = req.body || {};
    await User.updateOne({ _id: id }, { $set: { name: name.trim(), role } });
    return res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
}

export async function toggleActive(req, res, next) {
  try {
    const { id } = req.params;
    const u = await User.findById(id);
    if (!u) return res.redirect('/admin/users');
    u.active = !u.active;
    await u.save();
    return res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
}

// src/controllers/admin.controller.js
// Controlador del Panel Admin (Dashboard + Pedidos)
// ESM compatible. Usa Mongoose y middlewares del Módulo 1 (asyncHandler/requireAdmin).

/* Utilidades de fechas (día actual) */
function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/* GET /admin  → Dashboard KPIs */
export const renderDashboard = async (req, res, next) => {
  try {
    const [{ start, end }] = [{ ...getTodayRange() }];

    // Ventas totales (solo approved)
    const salesAgg = await Order.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, totalSales: { $sum: '$total' }, ordersCount: { $sum: 1 } } },
    ]);

    const totalSales = salesAgg.length ? salesAgg[0].totalSales : 0;
    const ordersApprovedCount = salesAgg.length ? salesAgg[0].ordersCount : 0;

    // Pedidos de hoy (cualquier estado)
    const ordersToday = await Order.countDocuments({
      createdAt: { $gte: start, $lte: end },
    });

    // Top 5 productos por cantidad (en items de órdenes aprobadas)
    const topProducts = await Order.aggregate([
      { $match: { status: 'approved' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: { productId: '$items.productId', title: '$items.title' },
          qty: { $sum: '$items.qty' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
        },
      },
      {
        $project: { _id: 0, productId: '$_id.productId', title: '$_id.title', qty: 1, revenue: 1 },
      },
      { $sort: { qty: -1 } },
      { $limit: 5 },
    ]);

    // Últimos pedidos (tabla corta)
    const latestOrders = await Order.find({}, { userId: 1, total: 1, status: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return res.render('admin/dashboard', {
      totalSales,
      ordersApprovedCount,
      ordersToday,
      topProducts,
      latestOrders,
    });
  } catch (err) {
    next(err);
  }
};

/* GET /admin/orders  → Listado (con filtros y paginado básicos) */
export const listOrders = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status, // opcional: approved|pending|rejected|created
      from, // opcional: ISO date (YYYY-MM-DD)
      to, // opcional: ISO date (YYYY-MM-DD)
    } = req.query;

    const q = {};
    if (status) q.status = status;

    if (from || to) {
      q.createdAt = {};
      if (from) q.createdAt.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) q.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const [items, total] = await Promise.all([
      Order.find(q, {
        userId: 1,
        total: 1,
        status: 1,
        createdAt: 1,
        mpPreferenceId: 1,
        mpPaymentId: 1,
      })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Order.countDocuments(q),
    ]);

    const pages = Math.ceil(total / pageSize);

    return res.render('admin/orders', {
      filters: { status: status || '', from: from || '', to: to || '' },
      items,
      pagination: { page: pageNum, pages, total, limit: pageSize },
    });
  } catch (err) {
    next(err);
  }
};

/* GET /admin/orders/:id  → Detalle */
export const showOrder = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).render('shared/404');
    }

    const order = await Order.findById(id).lean();
    if (!order) return res.status(404).render('shared/404');

    // order.items contiene: productId, title, price, qty, subtotal (según tu modelo)
    return res.render('admin/order_detail', { order });
  } catch (err) {
    next(err);
  }
};

/* POST /admin/orders/:id/status  → Cambio manual de estado (opcional) */
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const ALLOWED = new Set(['created', 'approved', 'pending', 'rejected']);
    if (!ALLOWED.has(status)) {
      req.flash('error', 'Estado inválido.');
      return res.redirect('/admin/orders');
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'Pedido no encontrado.');
      return res.redirect('/admin/orders');
    }

    const result = await Order.updateOne({ _id: id }, { $set: { status } });
    if (result.matchedCount === 0) {
      req.flash('error', 'Pedido no encontrado.');
    } else {
      req.flash('success', 'Estado actualizado correctamente.');
    }

    return res.redirect('/admin/orders');
  } catch (err) {
    next(err);
  }
};
