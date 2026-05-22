const cron = require('node-cron');
const pool = require('../config/database');
const { notificarCliente } = require('./whatsapp');

// Corre todos los días a las 9:00 AM (hora Guatemala, UTC-6)
// En el servidor, ajusta el cron si está en otra zona horaria
function iniciarScheduler() {
  console.log('⏰ Scheduler de notificaciones iniciado');

  cron.schedule('0 15 * * *', async () => {
    // 15:00 UTC = 09:00 Guatemala (UTC-6)
    console.log(`\n🔔 [${new Date().toLocaleString('es-GT')}] Ejecutando envío automático de notificaciones...`);
    await enviarAvisosPreventivos();
    await enviarRecordatoriosMora();
  });
}

// Avisa a clientes cuyo día de pago es en 3 días
async function enviarAvisosPreventivos() {
  const hoy = new Date();
  const diaObjetivo = hoy.getDate() + 3;

  try {
    const result = await pool.query(
      `SELECT id, nombre FROM clientes
       WHERE estado = 'activo'
         AND dia_pago = $1
         AND notificaciones_wa != 'desactivadas'`,
      [diaObjetivo <= 31 ? diaObjetivo : diaObjetivo - 31]
    );

    console.log(`📅 Avisos preventivos: ${result.rows.length} clientes`);
    for (const cliente of result.rows) {
      const fechaVencimiento = new Date(hoy.getFullYear(), hoy.getMonth(), diaObjetivo);
      await notificarCliente(cliente.id, 'aviso_preventivo', {
        fecha: fechaVencimiento.toLocaleDateString('es-GT')
      }).catch(e => console.error(`  ❌ ${cliente.nombre}: ${e.message}`));
    }
  } catch (err) {
    console.error('Error en avisos preventivos:', err.message);
  }
}

// Recuerda diariamente a clientes en mora (día de pago ya pasó)
async function enviarRecordatoriosMora() {
  const diaHoy = new Date().getDate();

  try {
    const result = await pool.query(
      `SELECT c.id, c.nombre FROM clientes c
       WHERE c.estado = 'activo'
         AND c.dia_pago < $1
         AND c.notificaciones_wa != 'desactivadas'
         AND NOT EXISTS (
           SELECT 1 FROM pagos p
           WHERE p.cliente_id = c.id
             AND DATE_TRUNC('month', p.fecha_pago) = DATE_TRUNC('month', CURRENT_DATE)
         )`,
      [diaHoy]
    );

    console.log(`⚠️  Recordatorios mora: ${result.rows.length} clientes`);
    for (const cliente of result.rows) {
      await notificarCliente(cliente.id, 'recordatorio_mora')
        .catch(e => console.error(`  ❌ ${cliente.nombre}: ${e.message}`));
    }
  } catch (err) {
    console.error('Error en recordatorios mora:', err.message);
  }
}

module.exports = { iniciarScheduler, enviarAvisosPreventivos, enviarRecordatoriosMora };
