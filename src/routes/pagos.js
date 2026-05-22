const router = require('express').Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const { notificarCliente } = require('../services/whatsapp');

// ── PAGOS ──────────────────────────────────────────────

// GET /api/pagos — historial de pagos (con filtro opcional por cliente)
router.get('/', auth, async (req, res) => {
  const { cliente_id } = req.query;
  let query = `
    SELECT p.*, c.nombre AS cliente_nombre, u.nombre AS registrado_por_nombre
    FROM pagos p
    JOIN clientes c ON p.cliente_id = c.id
    LEFT JOIN usuarios u ON p.registrado_por = u.id
    WHERE 1=1
  `;
  const params = [];
  if (cliente_id) { query += ' AND p.cliente_id = $1'; params.push(cliente_id); }
  query += ' ORDER BY p.creado_en DESC LIMIT 100';

  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pagos — registrar pago y enviar confirmación por WhatsApp
router.post('/', auth, async (req, res) => {
  const { cliente_id, monto, metodo_pago, referencia, fecha_pago } = req.body;
  if (!cliente_id || !monto) {
    return res.status(400).json({ error: 'cliente_id y monto son requeridos' });
  }

  try {
    // Registrar el pago
    const { rows } = await pool.query(
      `INSERT INTO pagos (cliente_id, monto, metodo_pago, referencia, fecha_pago, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [cliente_id, monto, metodo_pago, referencia, fecha_pago || new Date().toISOString().split('T')[0], req.usuario.id]
    );
    const pago = rows[0];

    // Enviar confirmación por WhatsApp (no bloqueante si falla)
    let waResultado = null;
    try {
      waResultado = await notificarCliente(cliente_id, 'confirmacion_pago', {
        monto: `Q ${parseFloat(monto).toFixed(2)}`
      });
    } catch (waErr) {
      waResultado = { error: waErr.message };
    }

    res.status(201).json({ pago, whatsapp: waResultado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NOTIFICACIONES ──────────────────────────────────────

// GET /api/notificaciones — historial de mensajes WA
router.get('/notificaciones', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.*, c.nombre AS cliente_nombre, c.telefono
       FROM notificaciones n
       JOIN clientes c ON n.cliente_id = c.id
       ORDER BY n.enviado_en DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notificaciones/enviar — envío manual a un cliente
router.post('/notificaciones/enviar', auth, async (req, res) => {
  const { cliente_id, tipo, fecha } = req.body;
  if (!cliente_id || !tipo) {
    return res.status(400).json({ error: 'cliente_id y tipo son requeridos' });
  }
  try {
    const resultado = await notificarCliente(cliente_id, tipo, { fecha });
    res.json({ mensaje: 'Notificación enviada', resultado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notificaciones/enviar-masivo — envío masivo por tipo y servicio
router.post('/notificaciones/enviar-masivo', auth, async (req, res) => {
  const { tipo, servicio_id } = req.body;
  if (!tipo) return res.status(400).json({ error: 'tipo es requerido' });

  let query = `SELECT id FROM clientes WHERE estado = 'activo' AND notificaciones_wa != 'desactivadas'`;
  const params = [];
  if (servicio_id) { query += ' AND servicio_id = $1'; params.push(servicio_id); }

  try {
    const { rows } = await pool.query(query, params);
    const resultados = { enviados: 0, fallidos: 0, omitidos: 0 };

    for (const { id } of rows) {
      try {
        const r = await notificarCliente(id, tipo);
        r.omitido ? resultados.omitidos++ : resultados.enviados++;
      } catch {
        resultados.fallidos++;
      }
    }
    res.json({ mensaje: 'Envío masivo completado', resultados, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
