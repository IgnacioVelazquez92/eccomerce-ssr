// src/utils/hbs-helpers.js
// Helpers útiles para templates.
// Nota: en helpers de HBS, el último argumento siempre es "options" (el hash interno).
// Por eso removemos el último elemento cuando esperamos parámetros dinámicos.

function dropOptions(args) {
  // quita el objeto "options" que Handlebars pasa como último parámetro
  return Array.isArray(args) ? args.slice(0, -1) : args;
}

export const hbsHelpers = {
  // ---------------------------------------------------------------------------
  // Lógicos
  // ---------------------------------------------------------------------------
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
  or: (...args) => dropOptions(args).some(Boolean),
  and: (...args) => dropOptions(args).every(Boolean),
  not: (v) => !v,

  // ---------------------------------------------------------------------------
  // Colecciones
  // ---------------------------------------------------------------------------
  array: (...args) => dropOptions(args), // {{#each (array 1 2 3)}}...
  join: (arr, sep = ', ') => (arr || []).join(sep),
  includes: (arr, v) => Array.isArray(arr) && arr.includes(v),
  slice: (arr, start, end) => (arr || []).slice(start, end),

  // ---------------------------------------------------------------------------
  // Formato
  // ---------------------------------------------------------------------------
  dateTime: (v) => (v ? new Date(v).toLocaleString('es-AR') : ''),

  // alias usado en vistas de admin (orders.hbs)
  formatDate: (v /*, fmt opcional */) => (v ? new Date(v).toLocaleString('es-AR') : ''),

  json: (v) => JSON.stringify(v, null, 2),

  // ---------------------------------------------------------------------------
  // Números y moneda
  // ---------------------------------------------------------------------------
  currency: (v) =>
    v == null || v === ''
      ? ''
      : new Intl.NumberFormat('es-AR', {
          style: 'currency',
          currency: 'ARS',
        }).format(Number(v)),

  inc: (v) => Number(v) + 1,
  dec: (v) => Number(v) - 1,
  gt: (a, b) => a > b,
  lt: (a, b) => a < b,

  // ---------------------------------------------------------------------------
  // Texto / visual
  // ---------------------------------------------------------------------------
  truncate: (s, len = 10) => (s && s.length > len ? s.slice(0, len) + '…' : s),

  statusColor: (status) => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'pending':
        return 'warning';
      case 'rejected':
        return 'danger';
      default:
        return 'secondary';
    }
  },

  // ---------------------------------------------------------------------------
  // Varios
  // ---------------------------------------------------------------------------
  def: (v, dflt) => (v == null || v === '' ? dflt : v), // default
  tern: (cond, a, b) => (cond ? a : b), // ternario
};
