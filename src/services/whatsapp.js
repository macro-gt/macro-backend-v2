const axios = require('axios');
const pool = require('../config/database');

// Reemplaza variables en la plantilla del mensaje
function buildMessage(plantilla, datos) {
  return plantilla
    .replace(/{empresa}/g,  datos.empresa  || process.env.COMPANY_NAME)
    .replace(/{nombre}/g,   datos.nombre   || '')
    .replace(/{servicio}/g, datos.servicio || '')
    .replace(/{monto}/g,    datos.monto    || '')
    .replace(/{fecha}/g,    datos.fecha    || '')
    .replace(/{telefono}/g, datos.telefono || process.env.COMPANY_PHONE);
}

// Envía un mensaje de texto simple vía Meta WhatsApp Business API
async function enviarMensaje(telefono, mensaje) {
  const url = `${process.env.WA_API_URL}/${process.env.WA_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefono.replace(/[\s\-]/g, ''), // limpia espacios y guiones
    type: 'text',
    text: { body: mensaje, preview_url: false }
  };

  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  return response.data;
}

// Registra el resultado en la tabla de notificaciones
async function registrarNotificacion(clienteId, tipo, mensaje, estado, waMessageId = null, error = null) {
  await pool.query(
    `INSERT INTO notificaciones (cliente_id, tipo, mensaje, estado, wa_message_id, error_detalle)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [clienteId, tipo, mensaje, estado, waMessageId, error]
  );
}

// Obtiene la plantilla de la BD y envía el mensaje a un cliente
async function notificarCliente(clienteId, tipo, datosExtra = {}) {
  const clienteRes = await pool.query(
    `SELECT c.*, s.nombre AS servicio_nombre
     FROM clientes c
     LEFT JOIN servicios s ON c.servicio_id = s.id
     WHERE c.id = $1`,
    [clienteId]
  );
  if (!clienteRes.rows.length) throw new Error('Cliente no encontrado');
  const cliente = clienteRes.rows[0];

  if (cliente.notificaciones_wa === 'desactivadas') {
    return { omitido: true, razon: 'Notificaciones desactivadas para este cliente' };
  }
  if (tipo === 'aviso_preventivo' && cliente.notificaciones_wa === 'solo_mora') {
    return { omitido: true, razon: 'Cliente configurado solo para mora' };
  }

  const plantillaRes = await pool.query('SELECT contenido FROM plantillas WHERE tipo = $1', [tipo]);
  if (!plantillaRes.rows.length) throw new Error(`Plantilla '${tipo}' no encontrada`);

  const datos = {
    nombre:   cliente.nombre,
    servicio: cliente.servicio_nombre,
    monto:    `Q ${parseFloat(cliente.monto_mensual).toFixed(2)}`,
    fecha:    datosExtra.fecha || new Date().toLocaleDateString('es-GT'),
    ...datosExtra
  };

  const mensaje = buildMessage(plantillaRes.rows[0].contenido, datos);

  try {
    const resultado = await enviarMensaje(cliente.telefono, mensaje);
    const waId = resultado?.messages?.[0]?.id || null;
    await registrarNotificacion(clienteId, tipo, mensaje, 'enviado', waId);
    return { enviado: true, waId };
  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || err.message;
    await registrarNotificacion(clienteId, tipo, mensaje, 'fallido', null, errorMsg);
    throw new Error(`WhatsApp error: ${errorMsg}`);
  }
}

module.exports = { notificarCliente, enviarMensaje, buildMessage };
