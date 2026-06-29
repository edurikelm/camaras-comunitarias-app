# Servicio Realtime — Socket.IO

Servicios de tiempo real para Camaras Comunitarias. Maneja conexiones WebSocket via Socket.IO y notifica a los clientes sobre eventos del dominio en tiempo real.

## Estado

**PR #0 (Foundation)**: Este servicio esta en su version inicial. Los siguientes features aun NO estan implementados:
- Autenticacion de Socket.IO con JWT de Supabase (PR #1)
- Rooms y autorizacion de suscripcion (PR #2)
- Handler `/internal/emit` para emision de eventos (PR #3)
- Eventos MVP: `alert.created`, `incident.created`, `community-member.status-changed`, `recording-request.created`, `recording-request.responded` (PR #3 y PR #4)

## Como levantar

```bash
cd services/realtime
npm install
npm run dev
```

El servicio escuchara en `http://localhost:3001` por defecto.

## Variables de entorno

Copia `.env.example` a `.env` y completa los valores:

| Variable | Descripcion | Default |
|---|---|---|
| `REALTIME_PORT` | Puerto donde escucha el servicio | `3001` |
| `SUPABASE_URL` | URL del proyecto Supabase | — (requerido) |
| `SUPABASE_JWT_AUDIENCE` | Audience esperado en el JWT | `authenticated` |
| `DATABASE_URL` | Connection string de Postgres | — (requerido) |
| `REALTIME_INTERNAL_SECRET` | Secret para validar `/internal/emit` | — (requerido, min 16 chars) |
| `CORS_ORIGIN` | Origen permitido para CORS | `http://localhost:3000` |
| `LOG_LEVEL` | Nivel de logging: `fatal`, `error`, `warn`, `info`, `debug`, `trace` | `info` |

## Como testear

```bash
# Tests unitarios
npm test

# TypeScript sin compilar
npm run typecheck

# Con coverage
npm test -- --coverage
```

## Endpoints

### GET /healthz

Health check basico. Siempre retorna 200 si el proceso esta vivo.

```bash
curl http://localhost:3001/healthz
# {"status":"ok"}
```

### GET /readyz

Readiness check. Verifica que la conexion a la base de datos esta activa.

```bash
curl http://localhost:3001/readyz
# {"status":"ready"}
```

Si la base de datos no responde, retorna 503 con `{"status":"not_ready", "error": "..."}`.

## Desarrollo

### Estructura del proyecto

```
services/realtime/
├── src/
│   ├── server.ts      # createServer(): punto de entrada, lifecycle
│   ├── config.ts      # loadConfig(): validacion de env con Zod
│   ├── logger.ts      # createLogger(): pino configurado
│   └── health.ts      # registerHealthRoutes(): /healthz y /readyz
├── package.json
└── tsconfig.json
```

### Logging

- En desarrollo (`NODE_ENV !== "production"`): usa `pino-pretty` con colores y timestamps legibles.
- En produccion: JSON estructurado compatible con agregadores de logs.

### Arquitectura

- **Fastify** para el servidor HTTP (logging estructurado, routing, CORS).
- **Socket.IO** para conexiones WebSocket (sin auth ni handlers en PR #0).
- **Prisma Client** para conexion a la base de datos.
- **Zod** para validacion de variables de entorno y payloads.

## Relacion con Next.js

- Next.js y `services/realtime` comparten la base de datos.
- La autorizacion de rooms se basa en `MembershipLookupsPort` (mismo port que las policies de dominio).
- La emision de eventos desde Next.js hacia el servicio se hace via HTTP POST a `/internal/emit` (PR #3).
- Para desarrollo conjunto, usa `npm run dev:all` en la raiz del repositorio.
