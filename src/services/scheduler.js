// src/services/scheduler.js
// Scheduler automático de notificaciones MACRO Cobros
// Ejecuta 2 veces al día: 9:00 AM y 5:00 PM (Guatemala UTC-6)

const cron = require('node-cron');
const { Pool } = require('pg');
const whatsapp = require('./whatsapp');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'no-verify' ? { rejectUnauthorized: false } : false,
});

// ─── MENSAJES POR TIPO ────────────────────────────────────────────────────────

function getMensajeRecordatorio(cliente, diasRestantes) {
  const empresa = process.env.COMPANY_NAME || 'MACRO Internet Guatemala';
  const telefono = process.env.COMPANY_PHONE || '+502 3000-8062';
  const plural = diasRestantes === 1 ? 'día' : 'días';
  return (
    `Hola ${cliente.nombre} 👋\n\n` +
    `Te recordamos que tu pago del servicio de *${cliente.servicio}* vence en *${diasRestantes} ${plural}*.\n\n` +
    `📅 Fecha de pago: *${formatFecha(cliente.fecha_pago)}*\n` +
    `💰 Monto: *Q ${parseFloat(cliente.monto_mensual || 0).toFixed(2)}*\n\n` +
    `Para evitar interrupciones en tu servicio, realiza tu pago a tiempo.\n\n` +
    `📞 Información: ${telefono}\n` +
    `_${empresa}_`
  );
}

function getMensajeDiaDePago(cliente) {
  const empresa = process.env.COMPANY_NAME || 'MACRO Internet Guatemala';
  const telefono = process.env.COMPANY_PHONE || '+502 3000-8062';
  return (
    `Hola ${cliente.nombre} 👋\n\n` +
    `⚠️ *HOY es la fecha de pago* de tu servicio de *${cliente.servicio}*.\n\n` +
    `💰 Monto a pagar: *Q ${parseFloat(cliente.monto_mensual || 0).toFixed(2)}*\n\n` +
    `Por favor realiza tu pago hoy para evitar la suspensión del servicio.\n\n` +
    `📞 Información: ${telefono}\n` +
    `_${empresa}_`
  );
}

function getMensajeMora(cliente, diasMora) {
  const empresa = process.env.COMPANY_NAME || 'MACRO Internet Guatemala';
  const telefono = process.env.COMPANY_PHONE || '+502 3000-8062';
  return (
    `Hola ${cliente.nombre} 👋\n\n` +
    `🚨 *AVISO DE MORA* — Tu pago lleva *${diasMora} ${diasMora === 1 ? 'día' : 'días'}* de retraso.\n\n` +
    `📋 Servicio: *${cliente.servicio}*\n` +
    `💰 Monto pendiente: *Q ${parseFloat(cliente.monto_mensual || 0).toFixed(2)}*\n\n` +
    `Tu servicio puede ser suspendido en cualquier momento. Te pedimos regularizar tu situación a la brevedad.\n\n` +
    `📞 Contáctanos: ${telefono}\n` +
    `_${empresa}_`
  );
}

// ─── UTILIDADES ───────────────────────────────────────────────────────────────

function formatFecha(fecha) {
  if (!fecha) return '';
  const d = new Date(fecha);
  return d.toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getDiasHastaFecha(fechaPago) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const pago = new Date(fechaPago);
  pago.setHours(0, 0, 0, 0);
  return Math.round((pago - hoy) / (1000 * 60 * 60 * 24));
}

async function yaSeEnvioHoy(clienteId, tipo) {
  const hoy = new Date().toISOString().split('T')[0];
  const result = await pool.query(
    `SELECT id FROM notificaciones 
     WHERE cliente_id = $1 AND tipo = $2 AND DATE(created_at) = $3`,
    [clienteId, tipo, hoy]
  );
  return result.rows.length > 0;
}

async function registrarNotificacion(clienteId, tipo, mensaje, estado = 'enviado') {
  await pool.query(
    `INSERT INTO notificaciones (cliente_id, tipo, mensaje, estado, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [clienteId, tipo, mensaje, estado]
  );
}

async function clienteTienePagoEstemes(clienteId, fechaPago) {
  const fechaRef = new Date(fechaPago);
  const mesRef = fechaRef.getMonth() + 1;
  const anioRef = fechaRef.getFullYear();

  const result = await pool.query(
    `SELECT id FROM pagos 
     WHERE cliente_id = $1 
       AND EXTRACT(MONTH FROM fecha_pago) = $2 
       AND EXTRACT(YEAR FROM fecha_pago) = $3`,
    [clienteId, mesRef, anioRef]
  );
  return result.rows.length > 0;
}

// ─── LÓGICA PRINCIPAL ─────────────────────────────────────────────────────────

async function ejecutarCicloNotificaciones() {
  console.log(`[SCHEDULER] Ejecutando ciclo - ${new Date().toLocaleString('es-GT')}`);

  let clientes;
  try {
    const result = await pool.query(
      `SELECT c.*, c.monto_mensual
       FROM clientes c
       WHERE c.activo = true
         AND c.programado_automatico = true
         AND c.fecha_pago IS NOT NULL
         AND c.telefono IS NOT NULL`
    );
    clientes = result.rows;
  } catch (err) {
    console.error('[SCHEDULER] Error al obtener clientes:', err.message);
    return;
  }

  console.log(`[SCHEDULER] Clientes con programado automático: ${clientes.length}`);

  for (const cliente of clientes) {
    try {
      // Calcular la próxima fecha de pago (este mes o siguiente)
      const hoy = new Date();
      let fechaPago = new Date(cliente.fecha_pago);

      // Ajustar al mes actual
      fechaPago.setFullYear(hoy.getFullYear(), hoy.getMonth(), fechaPago.getDate());

      // Si ya pasó este mes, ir al siguiente
      if (fechaPago < hoy && hoy.getDate() > fechaPago.getDate() + 7) {
        fechaPago.setMonth(fechaPago.getMonth() + 1);
      }

      const dias = getDiasHastaFecha(fechaPago);

      // Verificar si ya pagó
      const yaPago = await clienteTienePagoEstemes(cliente.id, fechaPago);
      if (yaPago) {
        console.log(`[SCHEDULER] ${cliente.nombre} ya tiene pago registrado. Omitiendo.`);
        continue;
      }

      let tipo = null;
      let mensaje = null;

      if (dias >= 1 && dias <= 3) {
        // 3, 2 o 1 días antes → Recordatorio
        tipo = 'recordatorio';
        mensaje = getMensajeRecordatorio(cliente, dias);
      } else if (dias === 0) {
        // Día de pago
        tipo = 'dia_pago';
        mensaje = getMensajeDiaDePago(cliente);
      } else if (dias < 0 && dias >= -7) {
        // Mora (1 a 7 días después)
        tipo = 'mora';
        mensaje = getMensajeMora(cliente, Math.abs(dias));
      } else {
        // Fuera de rango, no hacer nada
        continue;
      }

      // Verificar si ya se envió hoy
      const enviado = await yaSeEnvioHoy(cliente.id, tipo);
      if (enviado) {
        console.log(`[SCHEDULER] ${cliente.nombre} ya recibió ${tipo} hoy. Omitiendo.`);
        continue;
      }

      // Enviar por WhatsApp
      const telefono = cliente.telefono.replace(/\D/g, '');
      const telefonoFormato = telefono.startsWith('502') ? telefono : `502${telefono}`;

      try {
        await whatsapp.enviarMensaje(telefonoFormato, mensaje);
        await registrarNotificacion(cliente.id, tipo, mensaje, 'enviado');
        console.log(`[SCHEDULER] ✅ ${tipo.toUpperCase()} enviado a ${cliente.nombre} (${telefonoFormato})`);
      } catch (errWA) {
        await registrarNotificacion(cliente.id, tipo, mensaje, 'error');
        console.error(`[SCHEDULER] ❌ Error enviando a ${cliente.nombre}:`, errWA.message);
      }

    } catch (errCliente) {
      console.error(`[SCHEDULER] Error procesando cliente ${cliente.id}:`, errCliente.message);
    }
  }

  console.log(`[SCHEDULER] Ciclo completado - ${new Date().toLocaleString('es-GT')}`);
}

// ─── INICIAR CRON ─────────────────────────────────────────────────────────────
// Guatemala es UTC-6. Para 9:00 AM → 15:00 UTC. Para 5:00 PM → 23:00 UTC.

function iniciarScheduler() {
  // 9:00 AM Guatemala (15:00 UTC)
  cron.schedule('0 15 * * *', () => {
    console.log('[SCHEDULER] Turno mañana (9:00 AM GT)');
    ejecutarCicloNotificaciones();
  }, { timezone: 'America/Guatemala' });

  // 5:00 PM Guatemala (23:00 UTC)
  cron.schedule('0 23 * * *', () => {
    console.log('[SCHEDULER] Turno tarde (5:00 PM GT)');
    ejecutarCicloNotificaciones();
  }, { timezone: 'America/Guatemala' });

  console.log('[SCHEDULER] ✅ Scheduler automático iniciado (9AM y 5PM Guatemala)');
}

module.exports = { iniciarScheduler, ejecutarCicloNotificaciones };
