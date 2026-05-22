const pool = require('./database');

async function crearTablas() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Tabla de usuarios (administradores del sistema)
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id          SERIAL PRIMARY KEY,
        nombre      VARCHAR(100) NOT NULL,
        email       VARCHAR(150) UNIQUE NOT NULL,
        password    VARCHAR(255) NOT NULL,
        rol         VARCHAR(20) DEFAULT 'admin',
        activo      BOOLEAN DEFAULT true,
        creado_en   TIMESTAMP DEFAULT NOW()
      );
    `);

    // Tabla de servicios disponibles
    await client.query(`
      CREATE TABLE IF NOT EXISTS servicios (
        id          SERIAL PRIMARY KEY,
        nombre      VARCHAR(100) NOT NULL,
        descripcion TEXT,
        icono       VARCHAR(50),
        activo      BOOLEAN DEFAULT true
      );
    `);

    // Tabla de clientes
    await client.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id                  SERIAL PRIMARY KEY,
        nombre              VARCHAR(150) NOT NULL,
        telefono            VARCHAR(20) NOT NULL,
        email               VARCHAR(150),
        dpi_nit             VARCHAR(30),
        servicio_id         INTEGER REFERENCES servicios(id),
        plan_detalle        VARCHAR(100),
        monto_mensual       DECIMAL(10,2) NOT NULL DEFAULT 0,
        dia_pago            INTEGER NOT NULL DEFAULT 1,
        estado              VARCHAR(20) DEFAULT 'activo',
        notificaciones_wa   VARCHAR(20) DEFAULT 'activadas',
        creado_en           TIMESTAMP DEFAULT NOW()
      );
    `);

    // Tabla de pagos
    await client.query(`
      CREATE TABLE IF NOT EXISTS pagos (
        id              SERIAL PRIMARY KEY,
        cliente_id      INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
        monto           DECIMAL(10,2) NOT NULL,
        metodo_pago     VARCHAR(50),
        referencia      VARCHAR(100),
        fecha_pago      DATE NOT NULL DEFAULT CURRENT_DATE,
        registrado_por  INTEGER REFERENCES usuarios(id),
        creado_en       TIMESTAMP DEFAULT NOW()
      );
    `);

    // Tabla de notificaciones WhatsApp enviadas
    await client.query(`
      CREATE TABLE IF NOT EXISTS notificaciones (
        id              SERIAL PRIMARY KEY,
        cliente_id      INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
        tipo            VARCHAR(50) NOT NULL,
        mensaje         TEXT NOT NULL,
        estado          VARCHAR(20) DEFAULT 'pendiente',
        wa_message_id   VARCHAR(100),
        error_detalle   TEXT,
        enviado_en      TIMESTAMP DEFAULT NOW()
      );
    `);

    // Tabla de plantillas de mensajes
    await client.query(`
      CREATE TABLE IF NOT EXISTS plantillas (
        id          SERIAL PRIMARY KEY,
        tipo        VARCHAR(50) UNIQUE NOT NULL,
        contenido   TEXT NOT NULL,
        activa      BOOLEAN DEFAULT true,
        actualizado TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query('COMMIT');
    console.log('✅ Tablas creadas exitosamente');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error creando tablas:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function insertarDatosIniciales() {
  const bcrypt = require('bcryptjs');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Usuario administrador por defecto
    const hash = await bcrypt.hash('macro2026', 10);
    await client.query(`
      INSERT INTO usuarios (nombre, email, password, rol)
      VALUES ('Administrador MACRO', 'admin@macro.gt', $1, 'admin')
      ON CONFLICT (email) DO NOTHING;
    `, [hash]);

    // Servicios base
    const servicios = [
      ['Internet', 'Residencial y empresarial', 'ti-wifi'],
      ['Cámaras', 'Vigilancia y CCTV', 'ti-camera'],
      ['Soporte TI', 'Mantenimiento y redes', 'ti-device-desktop'],
      ['VoIP', 'Telefonía IP', 'ti-phone'],
      ['Cloud', 'Hosting y servidores', 'ti-cloud'],
      ['Otro', 'Servicio personalizado', 'ti-plus'],
    ];
    for (const [nombre, desc, icono] of servicios) {
      await client.query(
        `INSERT INTO servicios (nombre, descripcion, icono) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [nombre, desc, icono]
      );
    }

    // Plantillas de mensajes por defecto
    const plantillas = [
      ['aviso_preventivo',
        '🔔 *{empresa}*\n\nEstimado/a *{nombre}*, le recordamos que su servicio de *{servicio}* vence el *{fecha}*.\n\nMonto a pagar: *{monto}*\n\nPuede pagar por transferencia o en nuestras oficinas.\n\n📞 Soporte 24/7: {telefono}'],
      ['recordatorio_mora',
        '⚠️ *{empresa}*\n\nEstimado/a *{nombre}*, su servicio de *{servicio}* tiene un saldo pendiente de *{monto}*.\n\nPara evitar la suspensión del servicio, regularice su pago a la brevedad.\n\n📞 Soporte: {telefono}'],
      ['confirmacion_pago',
        '✅ *{empresa}*\n\nEstimado/a *{nombre}*, hemos recibido su pago de *{monto}* por el servicio de *{servicio}*.\n\n¡Gracias por su pago a tiempo!\n\n📞 Soporte: {telefono}'],
      ['mantenimiento',
        '🔧 *{empresa}*\n\nEstimado/a *{nombre}*, le informamos que realizaremos mantenimiento programado en su servicio de *{servicio}* el día *{fecha}*.\n\nDisculpe los inconvenientes.\n\n📞 Soporte: {telefono}'],
    ];
    for (const [tipo, contenido] of plantillas) {
      await client.query(
        `INSERT INTO plantillas (tipo, contenido) VALUES ($1,$2) ON CONFLICT (tipo) DO UPDATE SET contenido=$2`,
        [tipo, contenido]
      );
    }

    await client.query('COMMIT');
    console.log('✅ Datos iniciales insertados');
    console.log('👤 Usuario: admin@macro.gt | Contraseña: macro2026');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error insertando datos:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

(async () => {
  await crearTablas();
  await insertarDatosIniciales();
})();
