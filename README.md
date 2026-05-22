# MACRO Cobros — Backend API

Sistema de gestión de clientes, pagos y notificaciones WhatsApp para MACRO.

---

## Requisitos previos

- Node.js v18 o superior
- Una cuenta en [Supabase](https://supabase.com) (gratis) o PostgreSQL propio
- Cuenta de [Meta Business](https://business.facebook.com) para WhatsApp API

---

## Instalación paso a paso

### 1. Instalar dependencias

```bash
cd macro-backend
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Abre el archivo `.env` y rellena:

| Variable | Cómo obtenerla |
|---|---|
| `DATABASE_URL` | En Supabase: Settings → Database → Connection string |
| `JWT_SECRET` | Escribe cualquier cadena larga y aleatoria |
| `WA_PHONE_NUMBER_ID` | En Meta Business → WhatsApp → Configuración de API |
| `WA_ACCESS_TOKEN` | En Meta Business → WhatsApp → Tokens de acceso |

### 3. Crear las tablas e insertar datos iniciales

```bash
npm run seed
```

Esto crea todas las tablas y el usuario administrador:
- **Email:** admin@macro.gt
- **Contraseña:** macro2026

### 4. Arrancar el servidor

```bash
# Desarrollo (reinicia automáticamente al guardar cambios)
npm run dev

# Producción
npm start
```

El servidor corre en `http://localhost:3000`

---

## Endpoints disponibles

### Autenticación
```
POST /api/auth/login
Body: { "email": "admin@macro.gt", "password": "macro2026" }
```

### Dashboard
```
GET /api/dashboard              → Estadísticas del día
GET /api/dashboard/clientes-mora → Lista de clientes en mora
```

### Clientes
```
GET    /api/clientes            → Listar (filtros: ?estado=activo&servicio_id=1&buscar=nombre)
GET    /api/clientes/:id        → Detalle de un cliente
POST   /api/clientes            → Crear cliente
PUT    /api/clientes/:id        → Actualizar cliente
DELETE /api/clientes/:id        → Eliminar cliente
```

### Pagos
```
GET  /api/pagos                 → Historial (?cliente_id=X)
POST /api/pagos                 → Registrar pago (envía WA automáticamente)
```

### Notificaciones WhatsApp
```
GET  /api/notificaciones              → Historial de mensajes
POST /api/notificaciones/enviar       → Envío manual a un cliente
POST /api/notificaciones/enviar-masivo → Envío masivo por tipo/servicio
```

Todos los endpoints (excepto `/api/auth/login` y `/health`) requieren el header:
```
Authorization: Bearer <token>
```

---

## Notificaciones automáticas

El scheduler corre todos los días a las **9:00 AM** (Guatemala) y envía:

1. **Aviso preventivo** — a clientes cuyo día de pago es en 3 días
2. **Recordatorio de mora** — a clientes que no han pagado en el mes actual

---

## Subir a Railway (producción)

1. Crea una cuenta en [Railway.app](https://railway.app)
2. Conecta tu repositorio de GitHub
3. Agrega las variables de entorno del `.env` en Railway → Variables
4. Railway despliega automáticamente en cada push

---

## Tipos de notificaciones disponibles

| Tipo | Cuándo se usa |
|---|---|
| `aviso_preventivo` | 3 días antes del vencimiento |
| `recordatorio_mora` | Clientes con pago vencido |
| `confirmacion_pago` | Al registrar un pago |
| `mantenimiento` | Avisos de mantenimiento programado |
