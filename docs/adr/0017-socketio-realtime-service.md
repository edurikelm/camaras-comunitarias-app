# ADR-0017: Servicio de Socket.IO Realtime

## Status

Aceptado

> **Nota**: este ADR fue modificado respecto al draft original (2026-06-29 v1 -> v2). El draft v1 proponia npm workspaces con `apps/{web,realtime}` + `packages/shared` y emision via `OutboxEvent` en Prisma. El v2 (aceptado) usa monorepo liviano (`services/realtime/` + `packages/shared/` como directorio de tipos) y emision via HTTP POST a `/internal/emit` con retry + timeout. Rationale: reducir el ruido mecanico de la migracion a workspaces hasta validar el patron, y evitar overengineering del mecanismo de transporte para MVP. La migracion a workspaces y/o a outbox queda documentada como follow-up en la seccion Implementation.

## Context

### Por que ahora

CONTEXT.md (lineas 226-234) y ADR-0002 (`docs/adr/0002-socketio-servicio-separado.md`) ya establecieron dos cosas:

1. **Socket.IO es el transporte de tiempo real del MVP.**
2. **Debe correr como un servicio Node separado de Next.js** porque las conexiones persistentes no encajan en un despliegue serverless de Next.js.

Lo que NO estaba decidido era **como** se implementa ese servicio, **como** se autentican los clientes, **como** Next.js le emite eventos cuando un service de dominio crea un Alert/Incident/SOS, y **como** se valida autorizacion de subscripcion a rooms. Hasta ahora el slice de alertas se persiste en BD pero "la notificacion realtime via Socket.IO queda para un slice posterior" (CONTEXT.md:123, regla de Incident and Alert). Ese slice es el Phase 2 que abre este ADR.

### Problema concreto

Tres servicios de dominio producen eventos que necesitan notificacion en tiempo real:

- `createIncident` crea `Incident + Alert` en la misma transaccion (CONTEXT.md:117 y `src/domain/community/incident/create-incident.ts:128-146`). Hoy no notifica a nadie en tiempo real.
- `approveCommunityMember` / `rejectCommunityMember` cambian `status` del miembro. El usuario afectado debe enterarse inmediatamente.
- `createRecordingRequest` debe avisar al dueno de camara; `respondRecordingRequest` debe avisar al solicitante.

Ademas, la regla de severidad (CONTEXT.md:83-90) implica que la audiencia de cada alerta depende de:

- Severidad (LOW solo admin+guards; MEDIUM/HIGH/CRITICAL incluyen vecinos activos del sector).
- Existencia de sector aplicable (si no hay sector, MEDIUM queda admin+guards y HIGH/CRITICAL pueden ir a toda la comunidad).

Esa audiencia **debe calcularse server-side** porque es la fuente de verdad del dominio. El cliente NUNCA puede ser el que decida a quien llega una alerta.

### Restricciones tecnicas

1. **Serverless y conexiones persistentes**: Next.js corriendo en Vercel/Lambda no puede mantener conexiones WebSocket de larga vida. Por eso el servicio de Socket.IO **debe** correr en un proceso Node de larga vida (VM, contenedor, servicio dedicado). Ya esta en ADR-0002; este ADR lo hace operable.
2. **Stack consistente**: monorepo actual es un unico paquete npm (`package.json` con todo bajo `src/`). Cualquier nuevo proceso debe sumar lo minimo a esa ergonomia. No podemos tener dos bases de codigo con tooling distinto.
3. **DB y autorizacion compartidas**: el servicio realtime debe leer Supabase Postgres y aplicar las mismas reglas que `policies/` (ADR-0016). Un usuario BLOCKED no puede seguir conectado.
4. **Estilo del codigo existente**: funciones puras + ports con interfaces. Sin clases en `src/domain/`. Las policies son namespaces de funciones. Los repos exponen ports. La libreria `jose` ya esta en `package.json:23` (se usa para el token de live view en `live-stream-token-issuer.ts`).
5. **Prisma client generado en `src/generated/prisma`**: si separamos el servicio realtime como workspace, hay que decidir si ambos procesos comparten el cliente generado o si cada uno genera el suyo. La opcion conservadora es regenerar localmente en cada workspace contra el mismo `prisma/schema.prisma`.
6. **Sin Stripe ni servicios externos adicionales**: la unica dependencia externa nueva seria el endpoint JWKS de Supabase (`https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`), accesible por HTTPS sin nuevos secretos.


### Inventario de eventos MVP

Lista exhaustiva, derivada de los services de dominio que hoy persisten cambios sin emitir. Cada evento va con su payload Zod en `packages/shared/realtime/events/*.ts` (definido en PR #0).

| Evento | Emitido por (service Next.js) | Audience | Rooms destino |
|---|---|---|---|
| `alert:created` | `createIncident`, futuro `createSosEvent` | Segun severidad y sector (regla CONTEXT.md:83-90) | `community:{communityId}` y/o `sector:{sectorId}` |
| `incident:created` | `createIncident` | Misma audience que `alert:created` (es la misma noti UX) | Mismas rooms que `alert:created` |
| `incident:updated` | futuro `updateIncident` (cambio de severidad, comentario, reapertura) | Creador + ADMIN + GUARD del comunidad | rooms del creador + `community:{communityId}` filtrado a roles |
| `sos:created` | futuro `createSosEvent` | Sector aplicable o comunidad entera (CRITICAL) | `sector:{sectorId}` o `community:{communityId}` |
| `community-member:status-changed` | `approveCommunityMember`, `rejectCommunityMember` | Usuario afectado | `user:{userId}` |
| `recording-request:created` | `createRecordingRequest` | Dueno de camara | `user:{ownerId}` |
| `recording-request:responded` | `respondRecordingRequest` | Solicitante | `user:{requesterId}` |

Nota: `alert:created` y `incident:created` se emiten en la misma transaccion, pero son eventos distintos para que el cliente pueda decidir si refresca la lista de incidentes, la lista de alertas o ambas. Ambos viajan al mismo set de rooms.

### Modelo de rooms

Estructura exacta de room names:

```
community:{communityId}              # broadcast a miembros ACTIVE de la comunidad
sector:{sectorId}                    # broadcast a miembros ACTIVE cuyo sectorId == sectorId
user:{userId}                        # DM a un usuario especifico
role:admin-guard:community:{id}      # broadcast restringido a ADMIN+GUARD (para alertas LOW, futuro)
```

Reglas de autorizacion al unirse (verificadas por el middleware de Socket.IO en cada `join` o en cada emit):

- `community:{id}` requiere `MembershipLookupsPort.findActiveMember(communityId, userId)` no nulo.
- `sector:{id}` requiere que el miembro ACTIVE del usuario tenga `sectorId == sectorId-del-room`.
- `user:{id}` requiere `id == userId-del-socket`. Es un DM. Nadie mas puede unirse.
- `role:admin-guard:community:{id}` requiere `findActiveAdminOrGuardMember` no nulo.

La audiencia de cada `emit` la decide el servicio realtime leyendo el `payload` y haciendo la consulta de audience con el mismo `MembershipLookupsPort`. **Server-side authority**: el cliente no envia la audiencia, la calcula el servicio.

### Riesgos del monolito actual vs servicio separado

| Aspecto | Monolito Next.js (custom server) | Servicio Node separado |
|---|---|---|
| Despliegue serverless | Incompatible | Compatible |
| Latencia de emision | ~0 (mismo proceso) | ~10-50 ms (HTTP o polling) |
| Resiliencia a caidas | Caida conjunta | Aislada |
| Hot reload de Next.js | Rompe conexiones | No afecta |
| Coste operativo | Un solo proceso | Dos procesos |
| Complejidad de auth | Cookie de Next.js | Cookie NO comparte dominio; necesita JWT |
| Consistencia transaccional | Directo en Prisma `tx` | Necesita seam (outbox/HTTP) |

ADR-0002 ya decidio "servicio separado" por las razones serverless y de responsabilidades. Este ADR **baja esa decision a tierra** sin revertirla.

## Decision

Resumen ejecutivo: **monorepo liviano** (un solo repo, sin npm workspaces formales) con `services/realtime/` (servicio Node con su propio `package.json`/`tsconfig.json`) y `packages/shared/` (directorio plano de tipos Zod compartidos, sin `package.json` propio). Servicio con **Fastify + Socket.IO v4**, autenticacion por **JWT de Supabase validado con `jose` + JWKS**, emision desde Next.js via **HTTP POST a `/internal/emit` con retry + timeout** (sin outbox), **rooms por comunidad/sector/usuario** con middleware de autorizacion que reusa `MembershipLookupsPort`.


### a) Layout del monorepo

**Opcion elegida: monorepo liviano, sin npm workspaces. Directorio `services/realtime/` con su propio `package.json` + `tsconfig.json` + `node_modules/`. Directorio `packages/shared/` solo como contenedor de tipos Zod, sin `package.json` propio (se importa via paths relativos desde ambos procesos).**

```
camaras-comunitarias-app/
├── src/                              # Next.js (sin cambios en esta fase)
├── prisma/                           # sin cambios
├── package.json                      # raiz — Next.js, sin workspaces
├── services/
│   └── realtime/                     # NUEVO servicio Socket.IO
│       ├── package.json              # propio: fastify, socket.io, jose, prisma, zod
│       ├── tsconfig.json             # propio, baseUrl ./
│       ├── .env.example
│       ├── README.md
│       └── src/
│           ├── server.ts
│           ├── config.ts
│           ├── health.ts
│           ├── auth/socket-auth.ts
│           ├── rooms/...
│           ├── connection/...
│           └── internal/emit-handler.ts
└── packages/
    └── shared/                       # NUEVO — tipos compartidos, SIN package.json
        └── src/
            └── realtime/
                ├── rooms.ts          # constantes y builders de room names
                └── events/           # schemas Zod de eventos
```

**Justificacion**:
- **No mover `src/` de Next.js**: el codebase viene de cerrar un bug critico de wiring (spread membership lookups) y un sprint de polish. Mover 100+ archivos de `src/` a `apps/web/` introduce ruido mecanico masivo (imports relativos, paths de TSConfig, baseUrl) sin valor funcional inmediato. Diferimos la migracion a npm workspaces hasta validar que el patron realtime funciona.
- **`services/realtime/` con su propio `package.json`**: necesario porque Socket.IO, Fastify y `jose` son dependencias que **no** deben contaminar el `package.json` de Next.js (no las usa). Mantener `node_modules/` separado evita conflictos de versiones entre procesos.
- **`packages/shared/` sin package.json propio**: solo contiene tipos TS (schemas Zod y constantes de room names). Ambos procesos los importan via tsconfig paths relativos. Esto evita un build step, un registry interno y la complejidad de npm workspaces solo para compartir tipos.
- **Patron "ports-only" mantenido**: `MembershipLookupsPort` (ADR-0015) sigue siendo la frontera. `services/realtime` consume solo el port (interfaz), NO las policies. La implementacion Prisma del port se duplica explicita en `services/realtime/src/infrastructure/prisma-membership-lookups.ts` (~80 LOC) en lugar de moverse a `packages/shared/` para no acoplar el port a Prisma.
- **Path de migracion futuro a npm workspaces**: cuando duela la coexistencia (2 PRs del proyecto o mas con cambios cross-cutting entre `apps/web` y `apps/realtime`), se hace un PR dedicado de migracion a `apps/{web,realtime}` + `packages/shared` con workspaces. El ADR-0012 ya menciona esta evolucion como Opcion B.

**Alternativas descartadas**:
- **npm workspaces con `apps/web`, `apps/realtime`, `packages/shared` (propuesta original del draft v1)**: descartada porque reorganizar `src/` a `apps/web/` es mecanico pero costoso en diff review y riesgoso de regresion. Diferimos a cuando el patron realtime madure.
- **Repo hermano separado** (e.g. `camaras-comunitarias-realtime`): descartado porque rompe el contrato de cambio unico (un cambio de evento requiere PR sincronizado en dos repos) y agrega friccion de versionado y publish.

### b) Stack del servicio realtime

**Opcion elegida: Fastify v5 + Socket.IO v4 + Node 20 + TypeScript 5.9.**

```
services/realtime/
├── package.json                     # propio
├── tsconfig.json                    # propio
├── .env.example
├── README.md
└── src/
    ├── server.ts                    # createServer(): Fastify app + Socket.IO attached
    ├── config.ts                    # parse y valida env (REALTIME_PORT, SUPABASE_JWKS_URL, ...)
    ├── health.ts                    # GET /healthz + GET /readyz
    ├── auth/
    │   ├── socket-auth.ts           # middleware handshake: valida JWT + popula socket.data
    │   └── socket-auth.test.ts
    ├── rooms/
    │   ├── join-authorized-room.ts  # helper que valida y une; la usa el on-connection handler
    │   └── join-authorized-room.test.ts
    ├── connection/
    │   ├── on-connection.ts         # handler de socket.on('connection')
    │   └── on-connection.test.ts
    ├── internal/
    │   └── emit-handler.ts          # POST /internal/emit (ver seccion d)
    └── infrastructure/
        └── prisma-membership-lookups.ts  # mirror del adapter en src/infrastructure/prisma/
```

**Justificacion**:
- **Fastify** porque trae `pino` para logging estructurado, tiene mejor rendimiento que Express (benchmark publico: ~3x req/s) y su tipado TypeScript es solido sin `@types/*` extra. Es lo que Vercel recomienda para servicios Node que extienden el stack Next.js cuando hay que escapar del limite serverless.
- **Socket.IO v4** ya esta validado por CONTEXT.md. Fastify lo integra via `@fastify/cors` + `new ServerIO(fastify.server, {...})` patron. Documentado oficialmente para `engine.io` con adaptador `ws`.
- **Node 20** para alinear con `@types/node 20.19.43` que ya esta en `devDependencies`.
- **No Express**: ADR-0016 y ADR-0012 prefirieron funciones puras sobre objetos; Fastify respeta eso mejor porque el handler signature es `(req, reply) => ...` y se puede testear con `app.inject()` sin levantar un puerto.

**Alternativas descartadas**:
- **Express + Socket.IO**: descartado por la mezcla callback/async middleware y por requerir `http` integration manual. Su tipado es fragil con TypeScript strict.
- **`http` nativo + Socket.IO**: descartado porque no resuelve logging, routing, CORS ni request validation sin re-implementar todo eso.
- **NestJS (microservices)**: CONTEXT.md lo menciona como evaluacion futura ("Si el backend crece, evaluar migrar logica a NestJS"). Trae opinionated patterns (decorators, providers, modules) que rompen la consistencia del estilo "funciones puras + ports" del proyecto.


### c) Autenticacion del cliente Socket.IO

**Opcion elegida: el cliente envia el access token JWT de Supabase en el handshake Socket.IO (`auth.token`), validado server-side con `jose.jwtVerify` contra el JWKS remoto de Supabase.**

```ts
// services/realtime/src/auth/socket-auth.ts
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Server, Socket } from "socket.io";

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

export function registerSocketAuth(io: Server) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Missing auth token"));

    try {
      const { payload } = await jwtVerify(token, JWKS, {
        audience: process.env.SUPABASE_JWT_AUDIENCE, // ej. "authenticated"
        issuer: process.env.SUPABASE_URL,
      });
      const sub = payload.sub; // Supabase user.id (= User.authProviderId)
      socket.data.supabaseUserId = sub;
      next();
    } catch (err) {
      next(new Error("Invalid auth token"));
    }
  });
}
```

**Justificacion**:

- **Reuso del JWT existente**: hoy `src/lib/auth.ts:11` ya acepta `Authorization: Bearer <token>` validado por `supabase.auth.getUser(token)`. El mismo token (access token de Supabase) se usa en el handshake de Socket.IO. Esto evita mintar un segundo tipo de credencial y reusar el ciclo de vida del token que Supabase Auth ya gobierna (rotacion, expiracion, revocacion).
- **`jose` ya esta en `dependencies`**: `package.json:23`. Reusar evita nueva dependencia. `jose.createRemoteJWKSet` cachea las claves publicas con TTL configurable, asi que el costo por validacion es ~1 lookup en memoria.
- **No hay roundtrip a Supabase Auth en cada conexion**: la validacion es local (firma JWT). Si Supabase Auth esta caido, las conexiones existentes siguen funcionando salvo rotacion de claves (el JWKS remoto las refresca automaticamente cuando expiran o rotan).
- **Cookie NO funciona cross-proceso**: ADR-0002 ya senalo que el servicio esta en un proceso distinto. Las cookies de Supabase (`sb-<project>-auth-token`) tienen atributos de dominio y atributos `HttpOnly` que no se pueden levantar y reusar desde un proceso Node que no es el navegador. La opcion de reenviar la cookie cruda en el handshake fue evaluada y descartada por fragilidad (CSRF, rotacion, multi-tab).

**Mapeo Supabase user.id -> User DB**:

```ts
// services/realtime/src/auth/socket-auth.ts (continuacion)
const supabaseUserId = socket.data.supabaseUserId as string;
const user = await prisma.user.findUnique({
  where: { authProviderId: supabaseUserId },
  // NOTA (PR #1): solo `id` se selecciona. `email` es PII y NO debe exponerse
  // en `socket.data` ni en logs (ver seccion h abajo, observabilidad minima).
  select: { id: true },
});
if (!user) return next(new Error("User not found in app DB"));
socket.data.userId = user.id;       // ahora la clave de dominio
```

Esto es importante: el dominio del proyecto identifica al usuario por `User.id` (UUID interno), NO por `authProviderId` (Supabase UUID). El realtime service debe resolver ambos en el handshake.

**Alternativas descartadas**:

- **Mintar un JWT interno corto (15 min) en Next.js tras autenticar**: descartado por la friccion operacional de agregar un endpoint POST `/api/realtime-ticket` que se llame antes del handshake. Suma una llamada HTTP y un secreto compartido (`REALTIME_JWT_SECRET`) que rotar. Su unica ventaja (reducir dependencia de Supabase JWKS) se puede resolver configurando JWKS como variable de entorno y, si Supabase cambia el endpoint, rotando `SUPABASE_URL` sin cambio de codigo.
- **`supabase.auth.getUser(token)` por cada conexion**: descartado por la latencia (red a Supabase en handshake) y porque en servicios de tiempo real se busca validar localmente. El overhead por conexion rompe escalado.


### d) Patron de emision de eventos desde Next.js hacia el servicio

**Opcion elegida: HTTP POST a `services/realtime/internal/emit` con retry + timeout corto. La entrega de realtime es best-effort: si falla, el Alert ya esta persistido en la DB y el cliente lo ve cuando refresca por polling HTTP.**

```ts
// services/realtime/src/internal/emit-handler.ts
import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";
import { AlertCreatedSchema, IncidentCreatedSchema, /* ... */ } from "../../../../packages/shared/src/realtime/events";

export function registerEmitHandler(app: FastifyInstance, io: Server) {
  app.post("/internal/emit", async (req, reply) => {
    const body = req.body as { type: string; audience: { roomKeys: string[]; userIds: string[] }; payload: unknown };
    // Validar con Zod segun body.type, luego emitir a rooms. Detalle en PR #3.
    return { ok: true };
  });
}
```

```ts
// src/lib/realtime/emit-realtime-event.ts (helper reutilizable desde cualquier service de dominio)
import { z } from "zod";

export type EmitInput = {
  type: "alert.created" | "incident.created" | "community-member.status-changed" | /* ... */;
  communityId: string | null;
  audience: { roomKeys: string[]; userIds: string[] };
  payload: unknown;
};

export async function emitRealtimeEvent(input: EmitInput): Promise<void> {
  const url = process.env.REALTIME_INTERNAL_URL ?? "http://localhost:3001/internal/emit";
  const maxAttempts = 3;
  const timeoutMs = 3000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": process.env.REALTIME_INTERNAL_SECRET ?? "",
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) return; // exito
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        // 4xx no retryable: log + salir (no tiene sentido insistir)
        console.warn(`[realtime] emit ${input.type} failed with ${res.status}, no retry`);
        return;
      }
      // 5xx o 408/429: retry
    } catch (err) {
      // network error o timeout: retry
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 200 * attempt)); // backoff lineal 200/400ms
    }
  }
  console.warn(`[realtime] emit ${input.type} failed after ${maxAttempts} attempts, dropping`);
}
```

```ts
// src/domain/community/incident/create-incident.ts (modificado en PR #3)
// Despues del commit de la transaccion, FUERA del callback de runInTransaction:
const audience = calculateIncidentAudience({ communityId, sectorId, severity });
await emitRealtimeEvent({
  type: "incident.created",
  communityId,
  audience: { roomKeys: audience.roomKeys, userIds: [] },
  payload: { incidentId: incident.id, ... },
});
await emitRealtimeEvent({
  type: "alert.created",
  communityId,
  audience,
  payload: { alertId: alert.id, ... },
});
```

**Justificacion**:
- **Simplicidad operativa**: HTTP POST + retry + timeout es ~30 LOC de codigo. No requiere migracion de Prisma, no requiere tabla nueva, no requiere loop de polling en el servicio realtime.
- **La "atomicidad" rota es aceptable**: el Alert ya esta persistido en la DB cuando se hace el POST. Si el POST falla, el cliente ve el Alert cuando navega o refresca `/incidents`. La notificacion realtime es UX, no seguridad.
- **Resiliencia basica suficiente para MVP**: 3 intentos con backoff lineal (200ms, 400ms) cubre caidas momentaneas del servicio realtime (ej. reinicio por deploy). Caidas prolongadas pierden notificaciones pero la DB esta consistente.
- **Secret compartido**: header `X-Internal-Secret` evita que cualquiera pueda hacer POST a `/internal/emit`. Se valida en `services/realtime` con `process.env.REALTIME_INTERNAL_SECRET`. No es el unico control (la emision a rooms sigue requiriendo que el cliente Socket.IO este autenticado), pero evita spam externo.
- **Best-effort explicito**: el helper loguea warning cuando falla despues de 3 intentos. No propaga la excepcion al caller. Asi un fallo de realtime nunca rompe el flujo principal (crear incidente sigue devolviendo 201 aunque realtime este caido).
- **Latencia de entrega**: ~10-50ms (HTTP localhost en dev) a ~100-300ms (red en prod). Comparable al outbox (1-2s) para el caso feliz.

**Trade-off explicito aceptado**:
- Si `services/realtime` esta caido al momento de crear un Alert, **el cliente no recibe la notificacion en tiempo real, pero el Alert esta en la DB**. UX: "el alert aparece cuando el usuario hace pull-to-refresh o navega a `/incidents`". Esto ya es el comportamiento actual (sin realtime). El ADR mejora la UX cuando realtime funciona, sin empeorarla cuando no.
- Si el proceso Next.js crashea entre el commit del Alert y el POST a realtime, el evento se pierde. Para MVP aceptable: probabilisticamente raro, y el cliente lo ve igual al refrescar.

**Alternativas descartadas**:
- **Tabla `OutboxEvent` en Prisma + consumer poll-based (propuesta original del draft v1)**: correcta tecnicamente y resuelve atomicidad real, pero para MVP es overengineering. Aporta ~250 LOC, 1 PR entero (PR #3), una migracion de schema y un loop de polling. Se descarta por costo/beneficio en esta fase. **Se documenta como follow-up**: si en el futuro el volumen de eventos crece (>10/s sostenidos) o se requiere garantia de entrega, migrar a outbox es un PR dedicado de ~1 sesion que **no cambia la API del helper `emitRealtimeEvent`** (solo cambia la implementacion: en vez de HTTP POST directo, escribe a outbox en la misma transaccion).
- **Postgres LISTEN/NOTIFY**: descartado por complejidad infra (cliente `pg` raw, trigger SQL por tabla, conexion persistente separada del pool de Prisma). Adecuado para fase posterior, no MVP.
- **El servicio realtime hace polling read-only de tablas de eventos (Alert, Incident, etc.)**: descartado porque rompe la atomicidad observada por el cliente (dos queries: INSERT + SELECT con ventana de inconsistencia) y requiere una columna "emitido" en cada tabla de dominio. Outbox es la version formal de eso, sin ensuciar las tablas.


### e) Modelo de rooms y autorizacion de suscripcion

**Estructura de rooms** (constantes en `packages/shared/src/realtime/rooms.ts`):

```ts
export const RoomPrefix = {
  Community: "community",
  Sector: "sector",
  User: "user",
  RoleScoped: "role:admin-guard:community",
} as const;

export function communityRoom(id: string): string {
  return `${RoomPrefix.Community}:${id}`;
}
export function sectorRoom(id: string): string {
  return `${RoomPrefix.Sector}:${id}`;
}
export function userRoom(id: string): string {
  return `${RoomPrefix.User}:${id}`;
}
// etc.
```

Ambos procesos importan este archivo via tsconfig path relativo: `services/realtime/tsconfig.json` declara `"paths": { "@shared/*": ["../../packages/shared/src/*"] }` y `tsconfig.json` raiz declara el mismo path.

**Validacion en `join`** (helper en `services/realtime/src/rooms/join-authorized-room.ts`):

```ts
import type { Socket } from "socket.io";
import type { MembershipLookupsPort } from "../../../../src/domain/community/membership/membership-lookups";

export type JoinRoomInput =
  | { kind: "community"; communityId: string }
  | { kind: "sector"; communityId: string; sectorId: string }
  | { kind: "user"; userId: string }
  | { kind: "roleAdminGuard"; communityId: string };

export async function joinAuthorizedRoom(
  socket: Socket,
  lookups: MembershipLookupsPort,
  input: JoinRoomInput
): Promise<{ joined: boolean; room?: string; reason?: string }> {
  const userId = socket.data.userId as string;
  switch (input.kind) {
    case "community": {
      const m = await lookups.findActiveMember(input.communityId, userId);
      if (!m) return { joined: false, reason: "not_member" };
      const room = communityRoom(input.communityId);
      await socket.join(room);
      return { joined: true, room };
    }
    case "sector": {
      const m = await lookups.findActiveMember(input.communityId, userId);
      if (!m || m.sectorId !== input.sectorId) {
        return { joined: false, reason: "not_in_sector" };
      }
      const room = sectorRoom(input.sectorId);
      await socket.join(room);
      return { joined: true, room };
    }
    case "user": {
      if (input.userId !== userId) return { joined: false, reason: "not_owner" };
      const room = userRoom(userId);
      await socket.join(room);
      return { joined: true, room };
    }
    case "roleAdminGuard": {
      const m = await lookups.findActiveAdminOrGuardMember(input.communityId, userId);
      if (!m) return { joined: false, reason: "not_admin_or_guard" };
      const room = `${RoomPrefix.RoleScoped}:${input.communityId}`;
      await socket.join(room);
      return { joined: true, room };
    }
  }
}
```

**Validacion en `on-connection`** (handler en `services/realtime/src/connection/on-connection.ts`):

Cuando un cliente se conecta, el handler **automatica y sincronamente** une al usuario a las rooms que le corresponden sin intervencion del cliente. Esto elimina la posibilidad de que un cliente pida unirse a una room que no le corresponde.

```ts
export function bindConnectionHandlers(
  io: Server,
  prisma: PrismaClient,
  lookups: MembershipLookupsPort
) {
  io.on("connection", async (socket) => {
    const userId = socket.data.userId as string;
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    // 1. Siempre unir al user a su DM room
    await socket.join(userRoom(userId));

    // 2. Listar membresias ACTIVE y unir a rooms correspondientes
    const memberships = await prisma.communityMember.findMany({
      where: { userId, status: "ACTIVE", deletedAt: null },
      select: { communityId: true, sectorId: true, role: true },
    });

    for (const m of memberships) {
      await joinAuthorizedRoom(socket, lookups, { kind: "community", communityId: m.communityId });
      if (m.sectorId) {
        await joinAuthorizedRoom(socket, lookups, {
          kind: "sector", communityId: m.communityId, sectorId: m.sectorId,
        });
      }
      if (m.role === "ADMIN" || m.role === "GUARD") {
        await joinAuthorizedRoom(socket, lookups, {
          kind: "roleAdminGuard", communityId: m.communityId,
        });
      }
    }

    // 3. Manejar desconexion
    socket.on("disconnect", (reason) => {
      logger.info({ userId, reason }, "socket disconnected");
    });
  });
}
```


**Caching de lookups para `join`**: el middleware de Socket.IO puede recibir cientos de conexiones por segundo. Cacheamos `MembershipLookupsPort` con un wrapper in-memory con TTL corto (5 segundos) para evitar hits repetidos a Prisma durante rafagas. Una membresia no cambia de status cientos de veces por segundo.

**Status change mientras esta conectado (PENDING -> ACTIVE -> BLOCKED)**:

Tres caminos:

1. **Reconexion**: cada `connection` re-evalua membresias. Si el usuario ahora es BLOCKED, simplemente no se une a las rooms (porque el query `status: ACTIVE` retorna vacio). Queda solo en su `user:{id}` DM room, que no recibe eventos de dominio.

2. **Bloqueo durante conexion activa**: el evento `community-member:status-changed` con `newStatus: "BLOCKED"` se emite al room `user:{userId}` (PR #4). El cliente deberia hacer `socket.disconnect()` al recibirlo. Documentado en guia de cliente (PR separado). El realtime service NO ejectuta `socket.disconnect(true)` reactivamente en MVP.

3. **Promocion de rol (NEIGHBOR -> ADMIN)**: mismo mecanismo via `community-member:status-changed` (con `newRole` en el payload) o un evento dedicado `community-member:role-changed`. El handler reconnect-eligible el usuario y lo une a `role:admin-guard:community:{id}`. Esto es nice-to-have para MVP; ver Out of Scope si el costo es alto.

**Seam para la validacion**: la autorizacion de rooms REUSA el port `MembershipLookupsPort` (ADR-0015) que ya existe. **No** duplicamos lookups. `services/realtime` importa el port desde `src/domain/community/membership/membership-lookups.ts` (path relativo directo) y el adapter Prisma se construye en `services/realtime/src/infrastructure/prisma-membership-lookups.ts` con la misma firma que en Next.js.

### f) Eventos MVP (payloads Zod)

Todos los schemas viven en `packages/shared/src/realtime/events/*.ts` y se reusan tanto en `src/lib/realtime/emit-realtime-event.ts` (al construir el payload antes del POST) como en `services/realtime/src/internal/emit-handler.ts` (al validar antes del `io.to(room).emit`). Misma validacion server-side en ambos lados.

```ts
// packages/shared/src/realtime/events/incident-events.ts
import { z } from "zod";

export const AlertSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const IncidentTypeSchema = z.enum([
  "THEFT", "SUSPICIOUS_PERSON", "SUSPICIOUS_VEHICLE", "EMERGENCY", "ACCIDENT", "OTHER",
]);

export const AlertCreatedSchema = z.object({
  alertId: z.string().uuid(),
  communityId: z.string().uuid(),
  sectorId: z.string().uuid().nullable(),
  severity: AlertSeveritySchema,
  type: z.string(),         // sincronizado con IncidentType en runtime
  message: z.string(),
  incidentId: z.string().uuid().nullable(),
  sosEventId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export const IncidentCreatedSchema = z.object({
  incidentId: z.string().uuid(),
  communityId: z.string().uuid(),
  sectorId: z.string().uuid().nullable(),
  type: IncidentTypeSchema,
  severity: AlertSeveritySchema,
  status: z.enum(["OPEN", "REVIEWING", "CLOSED"]),
  description: z.string(),
  location: z.string().nullable(),
  createdById: z.string().uuid(),
  createdAt: z.string().datetime(),
});
```


Lista exhaustiva de eventos (schemas completos en PR #0):

| Evento | Payload | Emitido por | Rooms destino |
|---|---|---|---|
| `alert.created` | `AlertCreatedSchema` | `createIncident` (success path) | `community:{id}` +/- `sector:{sectorId}` segun audience |
| `alert.created` | `AlertCreatedSchema` | futuro `createSosEvent` | depende de severidad |
| `incident.created` | `IncidentCreatedSchema` | `createIncident` | mismas rooms que `alert.created` |
| `incident.updated` | `IncidentUpdatedSchema` | futuro `updateIncident` (status, severity, comments) | `user:{creatorId}` + `community:{id}` filtrado a ADMIN+GUARD |
| `incident.status-changed` | `IncidentStatusChangedSchema` | futuro `transitionIncidentStatus` | mismos criterios |
| `sos.created` | `SosCreatedSchema` | futuro `createSosEvent` (CRITICAL) | `sector:{sectorId}` o `community:{id}` |
| `community-member.status-changed` | `MemberStatusChangedSchema` | `approveCommunityMember`, `rejectCommunityMember` | `user:{affectedUserId}` |
| `community-member.role-changed` | `MemberRoleChangedSchema` | futuro `changeMemberRole` | `user:{affectedUserId}` |
| `recording-request.created` | `RecordingRequestCreatedSchema` | `createRecordingRequest` | `user:{ownerId}` |
| `recording-request.responded` | `RecordingRequestRespondedSchema` | `respondRecordingRequest` | `user:{requesterId}` |

**Calculo de audience** (en `src/domain/realtime/audience-calculator.ts`):

```ts
// Decide a que rooms llega un alert:created segun severidad y sector
export function calculateAudience(args: {
  communityId: string;
  sectorId: string | null;
  severity: AlertSeverity;
}): { roomKeys: string[] } {
  const { communityId, sectorId, severity } = args;
  const roomKeys: string[] = [];

  if (severity === "LOW") {
    roomKeys.push(`role:admin-guard:community:${communityId}`);
    return { roomKeys };
  }

  // MEDIUM, HIGH, CRITICAL: si hay sector, sector + admin-guard channel
  if (sectorId) {
    roomKeys.push(`sector:${sectorId}`);
    roomKeys.push(`role:admin-guard:community:${communityId}`);
    return { roomKeys };
  }

  // Sin sector: comunidad entera + admin-guard
  roomKeys.push(`community:${communityId}`);
  roomKeys.push(`role:admin-guard:community:${communityId}`);
  return { roomKeys };
}
```

Nota: `severity === "CRITICAL"` sin sector **debe** notificar a toda la comunidad activa (CONTEXT.md:89). La implementacion anterior cubre HIGH/CRITICAL uniformemente para MVP — diferenciado en `incident:updated` o en una iteracion posterior si la UX exige flag visual diferenciado. Explicitado aqui para que no quede ambiguo en code review.

### g) Manejo de errores y desconexion

**MVP: sin buffer de eventos perdidos en cliente. Reconexion manual transparente.**

Comportamiento esperado:

- **Caida del servicio realtime**: los clientes con `socket.connected === false` quedan en estado "desconectado". Socket.IO client reintenta cada 1-5 segundos automaticamente (default configurable). Al reconectar, el cliente hace `GET /api/alerts?since={lastSeenAt}` (fuera del scope de este ADR, pero convencion ya usada en otros endpoints). Los eventos perdidos durante la caida se reconcilian por polling HTTP.
- **`services/realtime` caido al momento del POST `/internal/emit`**: el helper `emitRealtimeEvent` ya intento 3 veces. Si fallo, se loguea warning y se descarta. El incidente/alerta/etc. ya esta persistido. El cliente lo ve al refrescar.
- **Servidor emite a una room vacia**: `io.to(room).emit(...)` es no-op silencioso. No hay error.
- **JWT revocado/expirado durante conexion activa**: el handshake ya paso. El socket sigue abierto hasta el siguiente reconnect. **Decision MVP**: confiamos en que la conexion dura <= tiempo de expiracion del JWT (default Supabase: 1h). Cuando expira, el cliente hace `socket.disconnect()` y reconecta con un refresh del token. El handler `on-connection` re-evalua membresias en cada reconexion.
- **Validacion Zod falla en `/internal/emit`**: el handler retorna 400 con detalle del error. Next.js loguea warning y NO reintenta (4xx no retryable).


**Cliente (referencia, no implementacion de este ADR)**:

```tsx
// src/lib/realtime/client.ts (referencia para PR de cliente aparte)
import { io } from "socket.io-client";
import { getSupabaseAccessToken } from "@/lib/supabase/client";

export async function connectRealtime(): Promise<Socket> {
  const token = await getSupabaseAccessToken();
  return io(process.env.NEXT_PUBLIC_REALTIME_URL!, {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}
```

### h) Observabilidad minima MVP

- **Logging estructurado con `pino`** (built-in de Fastify). Cada log incluye: `timestamp`, `level`, `service: "realtime"`, `traceId` (cuando aplique), `userId` (cuando aplique, NO communityId ni emails).
- **Eventos logueados** (sin PII):
  - `auth.success` con `{ userId }` (PR #1) — `communityIds` se agrega en PR #2 cuando el usuario hace `socket.join(communityRoom)`. Ver PR #1 implementation: el middleware actual solo popula `userId` y `supabaseUserId`; todavia no hay conexion con rooms.
  - `auth.rejected` con `{ reason }` (sin el token, sin el email)
  - `connection.established` con `{ userId }`
  - `connection.closed` con `{ userId, reason }`
  - `emit.received` con `{ type, audienceSize }` (en `/internal/emit` handler)
  - `emit.emitted` con `{ type, roomKeys, recipients }` (despues del `io.to(...).emit`)
  - `emit.failed` con `{ type, attempts, error: "zod_validation" | "socket_io_error" | "all_attempts_failed" }`
- **NO se loguea**: emails, nombres, descripciones de incidentes, contenido de payloads de eventos. Solo el `type`.
- **Healthcheck**: `GET /healthz` retorna 200 si proceso vivo. `GET /readyz` retorna 200 si la conexion a Prisma esta OK (`SELECT 1`). Usado por Kubernetes/Cloud Run readiness probes.
- **Metricas (fuera de alcance MVP)**: counters Prometheus se dejan como follow-up. Para MVP, logs estructurados son suficientes.

### i) Estrategia de dev

```json
// root package.json (modificacion minima en PR #0)
{
  "scripts": {
    "dev:realtime": "cd services/realtime && npm run dev",
    "dev:all": "concurrently -n web,realtime \"npm:dev\" \"npm:dev:realtime\""
  }
}
```

`services/realtime` en dev usa `tsx watch src/server.ts` para hot reload. Conexion a Supabase:

- **Local**: misma `DATABASE_URL` que el root `package.json` (apunta a Supabase cloud dev). El `.env` del servicio se copia con un script post-install o se documenta en el README.
- **CI**: la suite de tests de `services/realtime` usa mocks de Prisma (`vi.mock("@prisma/client")`), no requiere DB. La suite de Next.js sigue igual.
- **NO Docker Compose MVP**: el servicio es solo `node`. Un Dockerfile y un `docker-compose.yml` con Next.js + `services/realtime` + supabase + mediakit sera un PR separado cuando se necesite un entorno integrado.

### j) Out of scope explicito

Para que este ADR no se infle y pueda aprobarse en una sesion:

- **Firebase Cloud Messaging (push)**: CONTEXT.md:232-234 explicito. MVP no incluye FCM.
- **Horizontal scaling, sticky sessions, Redis adapter para Socket.IO**: un solo pod de realtime alcanza para MVP. Cuando se justifique, se agrega `@socket.io/redis-adapter` y la sesion de sticky load balancer.
- **Signaling WebRTC**: el live view ya tiene su propio JWT de corta duracion (ADR-0004). Socket.IO no se usa para senalizacion.
- **Cancelacion / edicion de recording-request**: cuando exista ese service, se agrega `recording-request:cancelled` siguiendo el mismo patron HTTP POST.
- **`community-member.role-changed`**: solo se incluye si surge necesidad explicita. Si el MVP no requiere notificar al usuario promocionado, queda follow-up. La sesion inicial MVP emite `community-member.status-changed` (PENDING -> ACTIVE/BLOCKED) que es lo critico.
- **Reconciliacion proactiva de rooms (cada N segundos)**: MVP usa rejoin en reconexion. Un worker de reconciliacion es follow-up.
- **Persistencia de eventos fallidos**: cuando un POST a `/internal/emit` falla tras 3 intentos, se loguea warning y se descarta. No hay tabla de "failed events". Si la perdida de notificaciones resulta inaceptable, migrar a outbox (documentado en Implementation).
- **Persistencia de auditoria del lado realtime**: no se audita cada `emit`. La auditoria existe en Next.js via `AuditLog` que ya cubre las mutaciones de dominio.


## Consequences

### Positive

- **Limites claros**: el monolito Next.js (dominio) y `services/realtime/` (transporte) tienen responsabilidades no superpuestas. ADR-0002 elevado a operable.
- **Best-effort explicito**: la entrega de realtime NO bloquea la transaccion del dominio. Un `services/realtime` caido no impide que Next.js siga creando incidentes. Los warnings se loguean; el incidente queda persistido y el cliente lo ve al refrescar.
- **Sin migracion de Prisma en esta fase**: la entrega via HTTP POST no requiere nueva tabla. El `schema.prisma` queda intacto en esta fase. Esto reduce el riesgo del Phase 2 a "crear un servicio nuevo en un subdirectorio" sin tocar la DB.
- **Reuso de `MembershipLookupsPort` (ADR-0015)**: el realtime consume el mismo port que las policies del dominio. Las reglas de "ACTIVE member" viven en un solo lugar. El adapter Prisma es un mirror explicito (~80 LOC) en `services/realtime/src/infrastructure/`.
- **Esquemas Zod compartidos via `packages/shared/`**: el `payload` se valida al emitir (Next.js, antes del fetch) y al recibir (`services/realtime`, antes del `io.to(room).emit`). Un schema fuera de sincronia rompe el build de TypeScript (no solo runtime).
- **Stack consistente con el resto del proyecto**: `jose`, `pino` (via Fastify), TypeScript strict, Zod, vitest. Sin nuevas librerias "exoticas".
- **Coste operativo bajo MVP**: un solo proceso Node de `services/realtime` en una VM pequena (1 vCPU, 512 MB) alcanza para cientos de conexiones. No requiere Redis, no requiere Kubernetes, no requiere outbox consumer.
- **Servidor extensible para Phase 3**: agregar Signaling, presencia, o chat (cuando se definan) es una nueva ruta en `services/realtime/` sin tocar Next.js.
- **Path de migracion a outbox sin breaking change**: si en el futuro el volumen de eventos crece, migrar a outbox NO requiere cambiar la API del helper `emitRealtimeEvent` (solo su implementacion interna: HTTP POST -> escritura en outbox). Los services que llaman al helper no cambian.
- **Path de migracion a workspaces sin breaking change**: si en el futuro se justifica reorganizar a `apps/{web,realtime}` + `packages/shared` con workspaces, es un PR de movimiento de archivos sin tocar logica. Los imports actuales via path alias `@shared/*` se migrarian a workspace imports sin cambios de API.

### Negative

- **R1 — Sin garantia de entrega**: si `services/realtime` esta caido al momento de un POST `/api/incidents`, el cliente NO recibe la notificacion realtime. El Alert queda persistido y aparece cuando el usuario navega o refresca. Aceptable para MVP (UX ya era esa), pero documentado para no engañar al operador: el realtime es un enhancement, no una garantia.
- **R2 — Latencia HTTP vs polling**: la entrega via HTTP POST es ~10-50ms en localhost y ~100-300ms en red. Si en produccion se necesita <100ms garantizado, el PR futuro reemplaza el HTTP POST por outbox + `LISTEN/NOTIFY` (mismo helper, diferente implementacion).
- **R3 — Token Supabase validado en handshake**: si el access token de Supabase expira (default 1h) durante una conexion activa, el siguiente reconnect fallara si el cliente no refresca. Mitigation: documento explicito para que el cliente (PR separado) renueve el access token con `supabase.auth.refreshSession()` antes de `socket.disconnect() + io(...)` cuando falten <5min para expirar. No es responsabilidad del realtime service.
- **R4 — `services/realtime` consume PrismaClient pero tambien Next.js**: ambos procesos generan el cliente Prisma localmente contra el mismo `schema.prisma`. Si se agrega un campo nuevo, hay que regenerar en ambos. Mitigation: `services/realtime` puede tener su propio script `prisma:generate` o reusar el `DATABASE_URL` del root. Riesgo bajo (operacional, no funcional).
- **R5 — Sin caching de lookups en MVP**: cada `on-connection` hace 1 query a `communityMember` para listar membresias ACTIVE. Si una comunidad tiene muchos miembros concurrentes conectandose, la carga se nota. Mitigation: si en produccion duele, agregar cache TTL=5s en PR futuro sin cambios de API.
- **R6 — Disconnect reactivo en bloqueo**: si un miembro pasa a BLOCKED mientras esta conectado, el socket sigue abierto hasta el siguiente reconnect (no hay `socket.disconnect(true)` reactivo en MVP). Mitigation: el evento `community-member.status-changed` con `newStatus: "BLOCKED"` se emite al room `user:{userId}` (PR #4), y el cliente deberia hacer `socket.disconnect()` al recibirlo. Documentado en guia de cliente.
- **R7 — No hay ACK de recepcion**: el broadcaster emite a la room, Socket.IO no garantiza que un cliente especifico la recibio. No hay ACK. Mitigation: aceptable para MVP (UX "fire and forget"). Si se necesita ACK, se agrega `socket.emit-with-ack` para eventos criticos en PR futuro.
- **R8 — Doble paso de Zod**: el payload se valida al emitir (Next.js, antes del fetch) y al recibir (`services/realtime`, antes del `io.to(room).emit`). Costo de CPU despreciable (Zod es el orden de microsegundos por objeto pequeno), beneficio: el contrato entre procesos es explicito en codigo. Sin mitigacion.
- **R9 — El handler de Socket.IO es stateful**: `socket.data` mantiene el userId durante la conexion. Esto es inevitable porque Socket.IO es inherentemente stateful. Mitigation: los helpers (`joinAuthorizedRoom`, `calculateAudience`, `emitRealtimeEvent`) son funciones puras; solo el handler de conexion es stateful. Esta asimetria es aceptable y se documenta con comments.
- **R10 — NO-OBVIOUS: el calculator de `audience` vive en Next.js, no en `services/realtime`**: esto es intencional. Si el calculator viviera en `services/realtime`, Next.js tendria que esperar confirmacion del realtime para saber si la entrega fue exitosa (latencia). Al calcular la audience antes del POST, Next.js termina su trabajo inmediatamente y `services/realtime` solo ejecuta.
- **R11 — Path de migracion a outbox implica cambio en helper, no en callers**: cuando se migre a outbox, `emitRealtimeEvent` cambia su firma ligeramente (acepta `tx` para escribir en la misma transaccion). Los services que la llaman deben pasar `tx` como argumento. Esto es un cambio mecanico pero NO es invisible. Documentado como follow-up.

### Out of Scope

- Migracion a `OutboxEvent` table para entrega garantizada (documentada como follow-up en Implementation).
- Migracion a npm workspaces con `apps/{web,realtime}` + `packages/shared` (documentada como follow-up).
- Adapter LISTEN/NOTIFY de Postgres (reemplazo del HTTP POST si en el futuro se requiere menor latencia).
- Adapter Redis para escalado horizontal (multi-pod).
- Reconciliacion proactiva periodica de rooms (re-evaluacion automatica cuando un miembro cambia de status).
- Tests de carga (k6, Artillery).
- Cancelacion / edicion de recording request via realtime.
- `community-member.role-changed` event (solo si surge necesidad concreta).
- Cliente browser (componente React que consume Socket.IO): PR separado, no incluido en este ADR.
- Dockerfile y docker-compose para entorno integrado (PR separado cuando se necesite).
- Metricas Prometheus o equivalentes (solo logs estructurados por ahora).
- Renovation automatica del access token Supabase en clientes de larga duracion: documentar en guia de cliente, no en realtime service.


## Implementation

### Plan de aplicacion (5 PRs, estranguladores secuenciales)

NO big-bang. NO feature flag. Cada PR es independiente: typecheck + tests verdes antes del siguiente. Cada PR deja la app funcionando sin realtime (degradacion controlada: el helper `emitRealtimeEvent` es best-effort, si el servicio no responde no rompe el flujo principal). El wiring end-to-end se enciende en PR #3.

| # | PR | Archivos | LOC aprox | Riesgo |
|---|---|---|---|---|
| 0 | Foundation: `services/realtime/` skeleton + `packages/shared/` types + `.env.example` | ~12 archivos nuevos | ~250 | Bajo (estructura nueva, sin tocar Next.js) |
| 1 | Auth seam: handshake JWT + lookup Supabase -> User DB | 4 archivos nuevos | ~150 | Bajo |
| 2 | Rooms & autorizacion: `joinAuthorizedRoom` + `on-connection` handler + mirror del membership lookups adapter | 6 archivos nuevos | ~250 | Bajo |
| 3 | `/internal/emit` handler + helper `emitRealtimeEvent` en Next.js + wiring con `createIncident` (primer evento end-to-end) | 6 archivos | ~200 | Bajo |
| 4 | Resto de eventos MVP: `approveCommunityMember`, `rejectCommunityMember`, `createRecordingRequest`, `respondRecordingRequest` | 6 archivos modificados | ~150 | Bajo |

### PR #0 — Foundation (skeleton, types compartidos, env)

**Objetivo**: tener `services/realtime/` arrancando, `/healthz` respondiendo 200, y los tipos de eventos listos para reusar desde Next.js. **NO** toca Next.js ni `src/`.

**Crear**:

- `services/realtime/package.json` — name `realtime` (NO scope, no es parte de un workspace). Deps: `fastify@^5`, `@fastify/cors@^11`, `socket.io@^4`, `jose@^6`, `@prisma/client@^7.8`, `zod@^3.24`. DevDeps: `tsx`, `pino-pretty`, `vitest@^4`, `typescript@^5.9`. Scripts: `dev: tsx watch src/server.ts`, `build: tsc`, `start: node dist/server.js`, `test: vitest run`, `typecheck: tsc --noEmit`.
- `services/realtime/tsconfig.json` — extends un tsconfig base; `outDir: ./dist`, `rootDir: ./src`, `strict: true`. **NO** extiende del tsconfig raiz (Next.js tiene opciones incompatibles).
- `services/realtime/.env.example` — `REALTIME_PORT=3001`, `SUPABASE_URL`, `SUPABASE_JWT_AUDIENCE=authenticated`, `DATABASE_URL`, `REALTIME_INTERNAL_SECRET`, `CORS_ORIGIN=http://localhost:3000`.
- `services/realtime/README.md` — como levantar el servicio en dev, como correr tests, variables de entorno.
- `services/realtime/src/config.ts` — parsea y valida env con Zod. Falla rapido si falta algo.
- `services/realtime/src/logger.ts` — instancia de pino configurada segun env (dev usa `pino-pretty`, prod usa JSON).
- `services/realtime/src/server.ts` — `createServer()` que crea Fastify, monta Socket.IO, registra `/healthz` y `/readyz`, devuelve `{ start, stop }` para tests y graceful shutdown.
- `services/realtime/src/health.ts` — handlers `GET /healthz` (siempre 200), `GET /readyz` (verifica Prisma con `SELECT 1`).
- `services/realtime/src/server.test.ts` — test que `app.inject({ method: "GET", url: "/healthz" })` retorna 200.
- `packages/shared/src/realtime/rooms.ts` — constantes y builders (mostradas en seccion e).
- `packages/shared/src/realtime/events/index.ts` — barrel de eventos.
- `packages/shared/src/realtime/events/incident-events.ts` — `AlertCreatedSchema`, `IncidentCreatedSchema`.
- `packages/shared/src/realtime/events/membership-events.ts` — `MemberStatusChangedSchema`.
- `packages/shared/src/realtime/events/recording-request-events.ts` — `RecordingRequestCreatedSchema`, `RecordingRequestRespondedSchema`.
- `packages/shared/tsconfig.json` — para que `services/realtime` y Next.js (via paths relativos) puedan importar los tipos.
- Root `tsconfig.json` — agregar path alias `"paths": { "@shared/*": ["./packages/shared/src/*"] }` para que Next.js pueda importar `@shared/realtime/rooms`. NO requiere cambios en `services/realtime/` (importa con path relativo).
- Root `package.json` — agregar script `dev:realtime: cd services/realtime && npm run dev` (convenience).

**Verificacion**:

```bash
# Toda la suite previa sigue verde (sin cambios funcionales)
npx tsc --noEmit
npx vitest run

# El nuevo servicio arranca y responde
cd services/realtime && npm install
cd services/realtime && npx tsc --noEmit
cd services/realtime && npx vitest run
cd services/realtime && npm run dev       # en otra terminal:
curl -fsS http://localhost:3001/healthz    # expected: {"status":"ok"}

# Test cross-cut: Next.js importa desde packages/shared
npx tsc --noEmit    # verifica que @shared/realtime/rooms resuelve
```

**Criterio "listo para PR #1"**: `services/realtime` arranca y responde `/healthz` con 200. Next.js puede hacer `import { communityRoom } from "@shared/realtime/rooms"` y TypeScript resuelve. `packages/shared` no tiene `package.json` propio (solo `tsconfig.json` y los `.ts`).

### PR #1 — Auth seam (handshake JWT + lookup Supabase -> User DB)

**Objetivo**: conexiones Socket.IO rechazadas sin JWT valido, conexiones validas con `socket.data.userId` y `socket.data.supabaseUserId`.

**Crear**:

- `services/realtime/src/auth/socket-auth.ts` — `io.use(async (socket, next) => {...})` con `jose.jwtVerify` + JWKS. Mapea `sub` -> `authProviderId` -> `User.id` via Prisma. Popula `socket.data`.
- `services/realtime/src/auth/socket-auth.test.ts` — 4 tests:
  1. `accepts a connection with a valid Supabase access token`
  2. `rejects a connection without a token (next called with Error)`
  3. `rejects a connection with an expired token`
  4. `rejects a connection when Supabase user has no matching User row in app DB`

**Modificar**:

- `services/realtime/src/server.ts` — registrar `registerSocketAuth(io, prisma)` antes de `io.on("connection", ...)`.

**Verificacion**:

```bash
cd services/realtime && npx tsc --noEmit
cd services/realtime && npx vitest run src/auth

# Manual: arrancar el servicio y un cliente con io() sin token -> rechazar.
# Manual: token invalido -> rechazar.
# Manual: token valido (obtenido con supabase auth via una CLI o un test e2e) -> conectar, socket.data.userId populado.
```

**Criterio "listo para PR #2"**: cualquier intento de `io(url)` sin token en `auth` produce desconexion con error claro. Una conexion valida tiene `socket.data.userId` populado. Todavia NO se une a ninguna room (eso es PR #2).


### PR #2 — Rooms y autorizacion de suscripcion

**Objetivo**: un usuario autenticado se une automaticamente a las rooms correctas en `on-connection`. No hay `socket.join` expuesto al cliente (regla de server-side authority).

**Crear**:

- `services/realtime/src/rooms/join-authorized-room.ts` — `joinAuthorizedRoom(socket, lookups, input): Promise<{ joined, room?, reason? }>` con el codigo de la seccion (e).
- `services/realtime/src/rooms/join-authorized-room.test.ts` — 5 tests:
  1. `allows joining community room when user is ACTIVE member`
  2. `refuses joining community room when user is PENDING or not member`
  3. `allows joining sector room only when member's sectorId matches`
  4. `allows joining user room only when userId matches socket.data.userId`
  5. `allows joining roleAdminGuard room when member.role in [ADMIN, GUARD]`
- `services/realtime/src/infrastructure/prisma-membership-lookups.ts` — `createPrismaMembershipLookupsAdapter(client)`, **mirror del codigo existente** en `src/infrastructure/prisma/membership-lookups-adapter.ts` (reuso por copia explicita, sin shared package para evitar acoplar el port a Prisma).
- `services/realtime/src/connection/on-connection.ts` — handler que lista membresias ACTIVE y une a rooms (codigo de seccion e).
- `services/realtime/src/connection/on-connection.test.ts` — 3 tests:
  1. `a user with 1 ACTIVE membership joins userRoom + communityRoom + roleAdminGuardRoom if ADMIN/GUARD`
  2. `a PENDING user joins only userRoom and no community rooms`
  3. `a user with sectorId joins sectorRoom in addition to communityRoom`

**Modificar**:

- `services/realtime/src/server.ts` — registrar `bindConnectionHandlers(io, prisma, lookups)` despues de `registerSocketAuth`.

**Verificacion**:

```bash
cd services/realtime && npx tsc --noEmit
cd services/realtime && npx vitest run

# Manual: dos clientes en navegadores distintos (mismo user, distintas pestanas), uno con un user activo en comunidad A, otro user no miembro. Ambos conectan; solo el activo recibe `io.to("community:...").emit(...)`.
```

**Criterio "listo para PR #3"**: cualquier conexion Socket.IO autenticada automaticamente esta en las rooms correctas segun su `MembershipLookupsPort` actual.

### PR #3 — `/internal/emit` + helper `emitRealtimeEvent` + primer evento end-to-end

**Objetivo**: un POST a `/api/incidents` produce un `alert:created` en la room `community:{id}` para clientes conectados. Sin realtime todavia para los demas eventos (eso es PR #4).

**Crear**:

- `services/realtime/src/internal/emit-handler.ts` — registra `POST /internal/emit` en Fastify. Valida `X-Internal-Secret`, parsea body con Zod segun `body.type`, emite a las rooms en `body.audience.roomKeys`, devuelve 200. Si Zod falla, 400.
- `services/realtime/src/internal/emit-handler.test.ts` — 4 tests:
  1. `accepts a valid alert.created payload and emits to specified rooms`
  2. `rejects a request without the internal secret header`
  3. `rejects a payload that fails Zod validation`
  4. `emits to multiple rooms when audience contains multiple roomKeys`
- `src/lib/realtime/emit-realtime-event.ts` — helper `emitRealtimeEvent(input): Promise<void>` con la logica de retry + timeout (codigo de seccion d). NO toca la transaccion del dominio; se llama FUERA del callback de `runInTransaction`.
- `src/lib/realtime/emit-realtime-event.test.ts` — 4 tests cubriendo: exito al primer intento, exito al segundo intento tras 5xx, falla permanente tras 3 intentos con warning logueado, llamada invalida (4xx) sin retry.
- `src/domain/realtime/audience-calculator.ts` — `calculateAudience({ communityId, sectorId, severity }): { roomKeys: string[] }` (codigo de seccion f).
- `src/domain/realtime/audience-calculator.test.ts` — 5 tests cubriendo la matriz `severity x hasSector` (LOW, MEDIUM, HIGH sin sector, HIGH con sector, CRITICAL).

**Modificar**:

- `services/realtime/src/server.ts` — registrar `registerEmitHandler(app, io)` antes de `start()`.
- `src/domain/community/incident/create-incident.ts` — despues del commit de la transaccion (FUERA del `runInTransaction`), agregar:
  ```ts
  const audience = calculateAudience({ communityId, sectorId, severity });
  await emitRealtimeEvent({
    type: "alert.created",
    communityId,
    audience: { roomKeys: audience.roomKeys, userIds: [] },
    payload: { alertId: alert.id, severity, ... },
  });
  await emitRealtimeEvent({
    type: "incident.created",
    communityId,
    audience: { roomKeys: audience.roomKeys, userIds: [] },
    payload: { incidentId: incident.id, ... },
  });
  ```
- `src/domain/community/incident/create-incident.test.ts` — 1 test adicional: `emits alert.created and incident.created after successful incident creation` (mockea `fetch`, verifica que se llamo 2 veces con los payloads correctos).

**Verificacion**:

```bash
npx tsc --noEmit
npx vitest run src/domain/community/incident
npx vitest run src/lib/realtime
npx vitest run src/domain/realtime

cd services/realtime && npx tsc --noEmit
cd services/realtime && npx vitest run

# E2E manual:
# 1. Arrancar services/realtime (npm run dev) y Next.js (npm run dev).
# 2. Cliente Socket.IO conectado como usuario activo de comunidad A.
# 3. POST /api/incidents con curl + cookie de auth.
# 4. Esperado: cliente recibe {type: "alert.created", ...} y {type: "incident.created", ...} en menos de 1 segundo.
```

**Criterio "listo para PR #4"**: una sola llamada `createIncident` resulta en 2 POSTs a `/internal/emit`, que emiten `alert.created` y `incident.created` a la room correcta. Si `services/realtime` esta caido, los warnings se loguean pero el incidente se crea igual (HTTP 201 al cliente). Si el helper se llama 2 veces y la primera falla, la segunda intenta sola (no se acoplan entre si).

### PR #4 — Resto de eventos MVP

**Objetivo**: completar el inventario de eventos MVP.

**Modificar** (uno por service de dominio, mismo patron que PR #3):

| Archivo | Eventos emitidos | Verificacion |
|---|---|---|
| `src/domain/community/membership/approve-community-member.ts` | `community-member.status-changed` con `newStatus: "ACTIVE"` audience = `[user:{userId}]` | 1 test que `emitRealtimeEvent` se llamo con `type: "community-member.status-changed"` y `newStatus: "ACTIVE"` |
| `src/domain/community/membership/reject-community-member.ts` | `community-member.status-changed` con `newStatus: "BLOCKED"` audience = `[user:{userId}]` | 1 test similar |
| `src/domain/community/recording/create-recording-request.ts` | `recording-request.created` audience = `[user:{ownerId}]` | 1 test |
| `src/domain/community/recording/respond-recording-request.ts` | `recording-request.responded` audience = `[user:{requesterId}]` | 1 test |

**Modificar**:

- `services/realtime/src/internal/emit-handler.ts` — extender el switch Zod schemas para incluir `community-member.status-changed`, `recording-request.created`, `recording-request.responded`.


**Verificacion**:

```bash
npx tsc --noEmit
npx vitest run
cd services/realtime && npx tsc --noEmit
cd services/realtime && npx vitest run
```

**E2E manual (smoke test)**:

1. Cliente A: usuario ADMIN de comunidad X, conectado a `services/realtime`.
2. Cliente B: usuario NEIGHBOR de comunidad X, conectado.
3. Cliente C: usuario de comunidad Y (otra comunidad), conectado.
4. Cliente A aprueba a un PENDING de comunidad X.
5. Cliente B (vecino de X, no afectado) no recibe nada.
6. Cliente que fue aprobado (en otra pestana) recibe `{ type: "community-member.status-changed", newStatus: "ACTIVE" }`.
7. Cliente A crea incidente HIGH con sector S1. Vecino de X en S1 recibe `alert.created` + `incident.created`. Vecino de X en S2 no recibe. Cliente C no recibe.
8. Cliente A acepta una recording request del dueno de camara. El solicitante recibe `recording-request.responded`.

**Criterio "listo para release"**: todos los eventos del inventario MVP estan cubiertos en tests. La suite de `services/realtime` y los tests de Next.js pasan en verde. El servicio realtime arranca con `npm run dev:realtime` y se conecta a una instancia de Supabase cloud. Logs estructurados visibles en stdout.

### PR #5 — Browser client + integracion UI

**Objetivo**: el navegador se conecta a `services/realtime` y refleja los 5 eventos del MVP en la UI. Slice que cierra la pregunta "¿se puede ver en la UI?".

**Crear**:

- `src/lib/realtime/client.ts` — factory `createRealtimeClient({ url, accessToken })` que devuelve un `Socket` de socket.io-client con `auth: { token }`, `transports: ["websocket"]`, `autoConnect: false` (ciclo de vida controlado por el provider).
- `src/components/providers/realtime-provider.tsx` — context React que conecta/desconecta segun el estado de Supabase Auth via `onAuthStateChange`. Expone `useRealtime()` con `{ status, socket, error }`.
- `src/components/ui/sonner.tsx` — wrapper shadcn de `sonner` (toast library).
- `src/components/realtime/realtime-toaster.tsx` — suscribe a los 5 eventos y muestra toasts. Severidad se indica con texto + color (no solo color, ver `DESIGN.md`).
- `src/components/realtime/realtime-refresh.tsx` — suscribe a `incident.created`, `community-member.status-changed`, `recording-request.*` y llama `router.refresh()` cuando el `pathname` es relevante (`/incidents`, `/dashboard`).
- Tests: `client.test.ts` (2), `realtime-provider.test.tsx` (4), `realtime-toaster.test.tsx` (2), `realtime-refresh.test.tsx` (3).

**Modificar**:

- `package.json` — agregar `socket.io-client: ^4.8.0` y `sonner: ^1.7.0` a `dependencies`.
- `src/app/layout.tsx` — envolver `{children}` con `RealtimeProvider`, renderizar `<Toaster />`, `<RealtimeToaster />` y `<RealtimeRefresh />` dentro del provider.
- `.env.example` y `.env.local` — agregar `NEXT_PUBLIC_REALTIME_URL=http://localhost:3001`.

**Decisiones clave**:

- El ciclo de vida del socket lo controla el provider, no el factory (`autoConnect: false`). Asi el provider decide cuando reconectar segun `onAuthStateChange`.
- El provider escucha `SIGNED_OUT` y `TOKEN_REFRESHED`. En `TOKEN_REFRESHED` actualiza `socket.auth = { token: newToken }` y reconecta. Limitacion documentada: tokens expirados mid-session pueden no refrescarse si Supabase Auth no emite el evento (caso raro).
- Token refresh via `socket.disconnect().connect()` (no via `socket.io.opts.auth` setter). Patron documentado en socket.io docs.
- Toast library: `sonner` (estandar shadcn, ~3kb). Se eligio sobre `@radix-ui/react-toast` por ergonomia y peso.
- Auto-refresh con debounce de 500ms para evitar rafagas en multiples eventos simultaneos.

**Verificacion**:

```bash
npx tsc --noEmit
npx vitest run src/lib/realtime src/components/providers src/components/realtime
npx vitest run
```

**E2E manual (smoke test)**:

1. Arrancar `services/realtime` (`npm run dev:realtime`) y Next.js (`npm run dev`).
2. Login como usuario ADMIN de comunidad X. Verificar en DevTools Network que hay un WebSocket abierto a `localhost:3001/socket.io/`.
3. En otra pestana, como usuario NEIGHBOR de la misma comunidad, crear un incidente HIGH. Verificar que la pestana del ADMIN recibe un toast "Nuevo incidente: ..." en <1s.
4. Verificar que la lista de `/incidents` se actualiza automaticamente (router.refresh dispara re-fetch del server component).
5. Aprobar una membresia PENDING. Verificar que la pestana del usuario aprobado recibe un toast "Membresia activa".
6. Crear una recording request a una camara de un vecino. Verificar que el dueno de la camara recibe el toast.
7. Logout → verificar que el WebSocket se cierra en DevTools.

**Criterio "listo"**: el usuario final ve toasts en tiempo real y las listas de `/dashboard` e `/incidents` se actualizan solas cuando hay eventos relevantes. Sin F5 manual. Tests verdes.

**Limitaciones conocidas**:

- No hay indicador visual de "conectado/desconectado" en la UI. Si el servicio realtime cae, el provider intenta reconectar silenciosamente. Si se requiere feedback, agregar un badge en la sidebar (futuro PR).
- Token refresh depende de que Supabase Auth emita el evento `TOKEN_REFRESHED`. No es garantizado en todos los flujos.

### Tests del seam realtime

Estructura general (sigue el patron ADR-0016):

- `services/realtime/src/server.test.ts`: 1 test (healthz).
- `services/realtime/src/auth/socket-auth.test.ts`: 4 tests.
- `services/realtime/src/rooms/join-authorized-room.test.ts`: 5 tests.
- `services/realtime/src/connection/on-connection.test.ts`: 3 tests.
- `services/realtime/src/internal/emit-handler.test.ts`: 4 tests.
- `src/lib/realtime/emit-realtime-event.test.ts`: 4 tests.
- `src/domain/realtime/audience-calculator.test.ts`: 5 tests.
- Tests adicionales en services de dominio modificados (PR #3 y PR #4): 1 por service (6 services).

Total estimado: 26 tests del seam realtime, 6 tests en services de dominio.
- Tests adicionales en services de dominio modificados: 1 por service (ver PR #4).

Total estimado: 25 tests del seam realtime, 5 tests del helper de dominio.

### Tests de regresion

Cero cambios en archivos de test existentes durante PR #0, PR #1 y PR #2 (no se toca Next.js ni los services de dominio). En PR #3 y PR #4 se agrega 1 test por service modificado (createIncident, approveCommunityMember, rejectCommunityMember, createRecordingRequest, respondRecordingRequest), pero los tests previos siguen verdes porque la adicion de `emitRealtimeEvent` no cambia el resultado retornado por el service (es un side-effect best-effort).

### Tests de integracion

NO requeridos para `services/realtime` en MVP. El handler `/internal/emit` se testea con `fastify.inject()` (sin levantar puerto). El broadcaster de Socket.IO se testea con `socket.io` en modo in-memory (cliente + servidor en el mismo proceso via `new ServerIO(...)`). Cubierto por ADR-0013 y ADR-0014 como patron mirror.

### Follow-up documentado (no en este PR)

Si en el futuro el volumen de eventos crece (>10/s sostenidos) o se requiere garantia de entrega (caso SOS donde la notificacion es critica), migrar a outbox es un PR dedicado de ~1 sesion que **no cambia la API del helper `emitRealtimeEvent`** (solo cambia la implementacion: en vez de HTTP POST directo, escribe a `OutboxEvent` en la misma transaccion del dominio y un consumer en `services/realtime` lo lee con `FOR UPDATE SKIP LOCKED`). Ver seccion d) para el esquema y la justificacion.

## References

- **ADR-0002** (`Socket.IO como servicio separado`) — la decision de 3 lineas que este ADR hace operable.
- **ADR-0004** (`JWT live view HS256`) — patron de JWT firmado (no aplica aca porque validamos JWT de Supabase, pero mismo modelo mental).
- **ADR-0008** (`EvidenceStoragePort seam`) — patron mirror de `Storage Port + adapter`.
- **ADR-0011** (`Authentication Prelude Seam`) — patron de seam para identidad del actor; este ADR define el seam equivalente para realtime.
- **ADR-0013** (`AuditLogPort seam`) — patron mirror de inyeccion via deps.
- **ADR-0014** (`RtspCipherPort seam`) — patron mirror de extraction de logica compartida.
- **ADR-0015** (`MembershipLookupsPort seam`) — port que el realtime consume sin re-implementar lookups.
- **ADR-0016** (`Authorization Policies`) — formato del ADR (Status / Context / Decision / Consequences / Implementation), y patron de funciones puras que se reusa en `calculateAudience`.
- CONTEXT.md (lineas 83-90 reglas de severidad; 116-124 reglas de Incident y Alert; 226-234 reglas de realtime; 237-247 stack; 193-194 scope MVP).
- `src/lib/auth.ts` — patron actual de validacion de Bearer token via Supabase.
- `src/lib/supabase/server.ts` — patron actual de Supabase server client.
- `src/domain/community/membership/membership-lookups.ts` — port fuente para el adapter mirror en `services/realtime/`.
- `src/domain/community/incident/create-incident.ts` — service que sera extendido en PR #3 para emitir `alert.created` y `incident.created`.
- `prisma/schema.prisma` — entidades `Alert`, `Incident`, `SosEvent`, `CommunityMember`.
