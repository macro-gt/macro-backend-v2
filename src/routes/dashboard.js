const router = require('express').Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

// GET /api/dashboard — estadísticas generales
router.get('/', auth, async (req, res) => {
  const diaHoy = new Date().getDate();

  try {
    const [activos, vencenHoy, enMora, pagosHoy, notifHoy, proximosVencer] = await Promise.all([
      // Total clientes activos
      pool.query(`SELECT COUNT(*) FROM clientes WHERE estado = 'activo'`),

      // Vencen hoy
      pool.query(`SELECT COUNT(*) FROM clientes WHERE estado = 'activo' AND dia_pago = $1`, [diaHoy]),

      // En mora (día de pago pasó y no han pagado este mes)
      pool.query(`
        SELECT COUNT(*) FROM clientes c
        WHERE c.estado = 'activo' AND c.dia_pago < $1
          AND NOT EXISTS (
            SELECT 1 FROM pagos p WHERE p.cliente_id = c.id
              AND DATE_TRUNC('month', p.fecha_pago) = DATE_TRUNC('month', CURRENT_DATE)
          )`, [diaHoy]),

      // Pagos registrados hoy
      pool.query(`SELECT COUNT(*), COALESCE(SUM(monto), 0) AS total FROM pagos WHERE DATE(fecha_pago) = CURRENT_DATE`),

      // Notificaciones enviadas hoy
      pool.query(`SELECT COUNT(*) FROM notificaciones WHERE DATE(enviado_en) = CURRENT_DATE AND estado = 'enviado'`),

      // Próximos a vencer (próximos 3 días)
      pool.query(`
        SELECT c.id, c.nombre, c.telefono, c.monto_mensual, c.dia_pago, s.nombre AS servicio
        FROM clientes c LEFT JOIN servicios s ON c.servicio_id = s.id
        WHERE c.estado = 'activo' AND c.dia_pago BETWEEN $1 AND $2
        ORDER BY c.dia_pago ASC`, [diaHoy + 1, diaHoy + 3])
    ]);

    res.json({
      estadisticas: {
        clientes_activos: parseInt(activos.rows[0].count),
        vencen_hoy:       parseInt(vencenHoy.rows[0].count),
        en_mora:          parseInt(enMora.rows[0].count),
        pagos_hoy:        parseInt(pagosHoy.rows[0].count),
        recaudado_hoy:    parseFloat(pagosHoy.rows[0].total),
        notificaciones_hoy: parseInt(notifHoy.rows[0].count)
      },
      proximos_vencer: proximosVencer.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/clientes-mora — lista completa en mora
router.get('/clientes-mora', auth, async (req, res) => {
  const diaHoy = new Date().getDate();
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.nombre, c.telefono, c.monto_mensual, c.dia_pago,
             s.nombre AS servicio,
             ($1 - c.dia_pago) AS dias_mora,
             COALESCE((
               SELECT COUNT(*) FROM notificaciones n
               WHERE n.cliente_id = c.id
                 AND n.tipo = 'recordatorio_mora'
                 AND DATE_TRUNC('month', n.enviado_en) = DATE_TRUNC('month', CURRENT_DATE)
             ), 0) AS mensajes_enviados
      FROM clientes c
      LEFT JOIN servicios s ON c.servicio_id = s.id
      WHERE c.estado = 'activo' AND c.dia_pago < $1
        AND NOT EXISTS (
          SELECT 1 FROM pagos p WHERE p.cliente_id = c.id
            AND DATE_TRUNC('month', p.fecha_pago) = DATE_TRUNC('month', CURRENT_DATE)
        )
      ORDER BY dias_mora DESC`, [diaHoy]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
