const router = require('express').Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

// GET /api/clientes — listar con filtros opcionales
router.get('/', auth, async (req, res) => {
  const { estado, servicio_id, buscar } = req.query;
  let query = `
    SELECT c.*, s.nombre AS servicio_nombre, s.icono AS servicio_icono,
           COALESCE(
             (SELECT COUNT(*) FROM notificaciones n WHERE n.cliente_id = c.id AND n.enviado_en > NOW() - INTERVAL '30 days'),
             0
           ) AS mensajes_mes
    FROM clientes c
    LEFT JOIN servicios s ON c.servicio_id = s.id
    WHERE 1=1
  `;
  const params = [];
  let i = 1;

  if (estado)      { query += ` AND c.estado = $${i++}`;          params.push(estado); }
  if (servicio_id) { query += ` AND c.servicio_id = $${i++}`;     params.push(servicio_id); }
  if (buscar)      { query += ` AND (c.nombre ILIKE $${i} OR c.telefono ILIKE $${i++})`; params.push(`%${buscar}%`); }

  query += ' ORDER BY c.nombre ASC';

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clientes/:id — detalle de un cliente
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, s.nombre AS servicio_nombre
       FROM clientes c LEFT JOIN servicios s ON c.servicio_id = s.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clientes — crear cliente
router.post('/', auth, async (req, res) => {
  const { nombre, telefono, email, dpi_nit, servicio_id, plan_detalle, monto_mensual, dia_pago, notificaciones_wa } = req.body;
  if (!nombre || !telefono || !monto_mensual) {
    return res.status(400).json({ error: 'nombre, telefono y monto_mensual son requeridos' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO clientes (nombre, telefono, email, dpi_nit, servicio_id, plan_detalle, monto_mensual, dia_pago, notificaciones_wa)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [nombre, telefono, email, dpi_nit, servicio_id, plan_detalle, monto_mensual, dia_pago || 1, notificaciones_wa || 'activadas']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/clientes/:id — actualizar cliente
router.put('/:id', auth, async (req, res) => {
  const { nombre, telefono, email, dpi_nit, servicio_id, plan_detalle, monto_mensual, dia_pago, estado, notificaciones_wa } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE clientes SET
        nombre=$1, telefono=$2, email=$3, dpi_nit=$4, servicio_id=$5,
        plan_detalle=$6, monto_mensual=$7, dia_pago=$8, estado=$9, notificaciones_wa=$10
       WHERE id=$11 RETURNING *`,
      [nombre, telefono, email, dpi_nit, servicio_id, plan_detalle, monto_mensual, dia_pago, estado, notificaciones_wa, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/clientes/:id — eliminar cliente
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM clientes WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ mensaje: 'Cliente eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── ACTIVAR / DESACTIVAR programado automático ──────────────────────────────
const { ejecutarCicloNotificaciones } = require('../services/scheduler');

router.patch('/:id/programado-automatico', auth, async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;
  try {
    const result = await pool.query(
      `UPDATE clientes SET programado_automatico = $1, updated_at = NOW()
       WHERE id = $2 RETURNING id, nombre, programado_automatico`,
      [activo, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({
      mensaje: activo ? 'Programado automático activado' : 'Programado automático desactivado',
      cliente: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/scheduler/ejecutar-ahora', auth, async (req, res) => {
  res.json({ mensaje: 'Ciclo iniciado. Revisa los logs del servidor.' });
  ejecutarCicloNotificaciones();
});
module.exports = router;
