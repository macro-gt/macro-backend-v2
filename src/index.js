require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');

const authRoutes      = require('./routes/auth');
const clientesRoutes  = require('./routes/clientes');
const pagosRoutes     = require('./routes/pagos');
const dashboardRoutes = require('./routes/dashboard');
const { iniciarScheduler } = require('./services/scheduler');



const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares ────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ── Rutas ──────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/clientes',    clientesRoutes);
app.use('/api/pagos',       pagosRoutes);
app.use('/api/dashboard',   dashboardRoutes);

// Ruta de salud (para verificar que el servidor está corriendo)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', sistema: 'MACRO Cobros API', version: '1.0.0' });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: `Ruta ${req.path} no encontrada` });
});

// Manejo global de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── Arranque ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 MACRO Cobros API corriendo en http://localhost:${PORT}`);
  console.log(`📋 Endpoints disponibles:`);
  console.log(`   POST /api/auth/login`);
  console.log(`   GET  /api/dashboard`);
  console.log(`   GET  /api/clientes`);
  console.log(`   GET  /api/pagos`);
  console.log(`   POST /api/pagos`);
  console.log(`   POST /api/notificaciones/enviar`);
  console.log(`   POST /api/notificaciones/enviar-masivo`);
  iniciarScheduler();
});

module.exports = app;
