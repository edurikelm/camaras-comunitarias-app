# ADR-0016: Authorization Policies

## Status

Aceptado

## Context

15 servicios de dominio en `src/domain/community/{camera,evidence,incident,recording,membership,invitations}` contienen ~30 bloques de verificación de autorización inline. Cada bloque mezcla: (a) lookup de miembro vía `MembershipLookupsPort` (ADR-0015), (b) condicional de rol, (c) posible ownership check, (d) throw de `CommunityAuthorizationError` o `CommunityInvariantError` con mensaje canónico por operación.

Ejemplo típico (de `review-camera.ts:65-109`, 4 bloques):

```ts
const community = await tx.findCommunityById(communityId);
if (!community) throw new CommunityNotFoundError("Community not found");
if (community.status !== "ACTIVE") throw new CommunityInvariantError("Community is not active");

const actorMember = await tx.findActiveAdminMember(communityId, input.actor.id);
if (!actorMember) throw new CommunityAuthorizationError("Only an ACTIVE ADMIN can review cameras");

const camera = await tx.findCameraById(cameraId);
if (!camera) throw new CommunityNotFoundError("Camera not found");
if (camera.communityId !== communityId) throw new CommunityInvariantError("...");
if (camera.status !== CameraStatus.PENDING_REVIEW) throw new CommunityInvariantError("...");
if (camera.ownerId === input.actor.id) throw new CommunityAuthorizationError("An ADMIN cannot review their own camera");
```

La dispersión causa 3 problemas:

1. **Mensajes inconsistentes**: "Only an ACTIVE ADMIN can X" varía ligeramente entre servicios.
2. **Difícil auditar todas las reglas de autorización desde un solo lugar**: un auditor que pregunta "¿quién puede crear recording requests?" tiene que buscar en 4 archivos.
3. **Tests duplican setup de mocks**: ~25 líneas por test para preparar la policy inline del service.

### Por qué ahora

- **ADR-0015** (`MembershipLookupsPort`) ya consolidó los 6 lookups comunitarios reutilizables. Las policies son la capa de reglas que SENTRÓ sobre ese port.
- **ADR-0011** (`auth prelude seam`) consolidó la identidad del actor en `requireAuthOrSessionUserId`.
- **ADR-0010** (`DomainError inversion`) consolidó la semántica HTTP de los errores en `httpResponse(ctx)`.
- Candidata **#6 del re-review 2026-06-28 v3** (post-ADR-0011).

### Inventario (15 servicios, 30+ bloques)

| # | Servicio | Acción | Lookup(s) usados | Mensaje canónico principal |
|---|---|---|---|---|
| 1 | `register-community-camera.ts` | crear | community + active-member | "Only an ACTIVE NEIGHBOR, GUARD, or ADMIN can register a camera" |
| 2 | `review-camera.ts` | aprobar/rechazar | community + admin + camera | "Only an ACTIVE ADMIN can review cameras" + "An ADMIN cannot review their own camera" |
| 3 | `set-camera-permission.ts` | crear/actualizar permiso | community + member + camera | "Only the camera owner can set permissions" |
| 4 | `remove-camera-permission.ts` | eliminar permiso | community + member + camera + permission | "Only the camera owner can remove permissions" |
| 5 | `request-live-view-token.ts` | emitir token live | community + camera + member + permission | "You do not have permission to view this camera's live stream" |
| 6 | `create-incident.ts` | crear incidente | community + active-neighbor-or-guard + sector | "Only an ACTIVE NEIGHBOR or GUARD can create an incident" |
| 7 | `create-recording-request.ts` | crear solicitud | community + camera + member + admin + incident | "Only the incident creator, ADMIN, or GUARD can request recordings" |
| 8 | `respond-recording-request.ts` | aceptar/rechazar | community + request + camera + incident | "Only the camera owner can respond to a recording request" |
| 9 | `create-evidence.ts` | subir evidencia | community + active-member + incident | "Only an ACTIVE community member can upload evidence" |
| 10 | `get-evidence.ts` | ver evidencia | community + incident + admin-or-guard | "Only the incident creator, an ADMIN, or a GUARD can view evidence" |
| 11 | `approve-community-member.ts` | aprobar miembro | community + admin + target | "Only an ACTIVE ADMIN can approve members" |
| 12 | `reject-community-member.ts` | rechazar miembro | community + admin + target | "Only an ACTIVE ADMIN can reject members" |
| 13 | `create-community-invitation.ts` | crear invitación | community + admin | "Only an ACTIVE ADMIN can create invitations" |
| 14 | `request-community-membership.ts` | solicitar por código | (NO es policy — claim-by-code) | (queda inline con comentario) |
| 15 | (futuro) reabrir/comentar/cerrar incidente | — | — | por diseñar cuando se implementen |

### Restricciones

- **Privacy & access control son dominio crítico** (CONTEXT.md): un cambio de mensaje canónico NO puede romper la UX existente.
- HTTP semantics deben preservarse: 403 (auth), 400 (invariant), 404 (not found). ADR-0010 NO se modifica.
- Migration debe ser mecánica y reversible (cada PR debe dejar typecheck + tests verdes).

## Decision

**Opción A: namespace de funciones puras agrupadas por agregado**. NO clase `Policy`. NO nuevo port `PolicyContext`. NO nuevas subclases de `DomainError`.

### 1. Localización y forma

```
src/domain/community/policies/
├── ensure-active-community.ts                   # compartido
├── camera/
│   ├── ensure-can-register-camera.ts
│   ├── ensure-can-review-camera.ts             # retorna { camera }
│   ├── ensure-can-modify-permission.ts         # retorna { camera }
│   └── ensure-active-member-with-live-access.ts # admin shortcut + role/user permission + schedule
├── incident/
│   └── ensure-can-create-incident.ts
├── recording-request/
│   ├── ensure-can-request-recording.ts          # retorna { incident, camera, member }
│   └── ensure-can-respond-recording.ts          # retorna { request, camera, incident, community }
├── evidence/
│   ├── ensure-can-upload-evidence.ts
│   └── ensure-can-view-evidence.ts              # retorna { incident }
├── membership/
│   ├── ensure-can-approve-member.ts             # retorna { targetMember }
│   ├── ensure-can-reject-member.ts              # retorna { targetMember }
│   └── ensure-can-create-invitation.ts
├── policies.test.ts                             # ~25 tests, 1-2 por policy
└── index.ts                                     # barrel
```

**Justificación del shape**:

1. El proyecto usa **funciones de servicio puras** y **puertos con interfaces**. No hay clases en `src/domain/`. Consistencia con el estilo existente.
2. Los 4 ADRs previos (0008, 0011, 0013, 0014) introdujeron **funciones o factories**, no builders.
3. Mockeable: una policy es `async function ensureCanFoo(...)` testeada con la misma familia `vi.fn()`.
4. ADR-0010 consolidó `httpResponse(ctx)` por clase — no añadir una nueva capa de objetos "Policy".

### 2. Firma estándar

```ts
// Policy simple
export async function ensureCanCreateIncident(args: {
  client: MembershipLookupsPort;
  communityId: string;
  actor: { id: string };
}): Promise<void>;

// Policy compuesta (carga el recurso y lo expone para evitar doble lookup)
export async function ensureCanReviewCamera(args: {
  client: MembershipLookupsPort & Pick<CameraRepository, "findCameraById">;
  actor: { id: string };
  cameraId: string;
}): Promise<{ camera: CameraRecord }>;
```

**Nota:** El patrón preferido es `MembershipLookupsPort & Pick<X, "method">` (ver `ensureCanSetPermission`). El tipo `client: CommunityUnitOfWork` directo se usa solo cuando la policy necesita múltiples métodos del UoW que no encajan en un Pick único (ver `ensureCanApproveMember`, `ensureCanRejectMember`).

**Por qué `client: <UoW intersected with port>`**: las policies necesitan `findCommunityById` (port) y `findCameraById` (repository). El intersection con `Pick<>` evita crear un nuevo `PolicyContextPort` ceremonioso y mantiene el patrón actual donde services llaman `tx.foo(...)`.

**Helper genérico para reducir verbosidad**:

```ts
// src/domain/community/policies/_helpers.ts
export type WithLookups<T> = MembershipLookupsPort & T;
export async function ensureActiveCommunity(
  client: MembershipLookupsPort,
  communityId: string,
): Promise<void> {
  const community = await client.findCommunityById(communityId);
  if (!community) throw new CommunityNotFoundError("Community not found");
  if (community.status !== "ACTIVE") {
    throw new CommunityInvariantError("Community is not active");
  }
}
```

### 3. Composición

Cuando un check depende de un lookup que ya hace el service (ej. `incident.createdById`), la policy recibe el registro cargado como argumento para evitar doble query:

```ts
// Pattern A: composite retorna recurso (preferred para "lookups nuevos")
export async function ensureCanRequestRecording(args: {
  client: WithLookups<Pick<RecordingRequestRepository, "findIncidentById" | "findCameraById">>;
  actor: { id: string };
  incidentId: string;
  cameraId: string;
}): Promise<{ incident: IncidentRecord; camera: CameraRecord; member: MemberLookupRecord }>;

// Pattern B: caller provee el recurso (preferred cuando el service ya lo cargó)
export async function ensureCanViewEvidence(args: {
  client: MembershipLookupsPort;
  actor: { id: string };
  incident: IncidentRecord; // pre-cargado por el service para crear la evidencia o audit
}): Promise<void>;
```

### 4. Reutilización del seam de errores

Las policies **lanzan exclusivamente** las 3 clases existentes en `src/domain/community/errors.ts`:

```
DomainError (abstract, ADR-0010)
├── CommunityAuthorizationError        → 403
├── CommunityInvariantError            → 400
│   └── CommunityNotFoundError         → 404  (override de status)
```

Cero `instanceof` nuevos. Cero clases nuevas en `errors.ts`. ADR-0010 NO requiere cambios. HTTP semantics inalteradas.

**Mensajes canónicos verbatim**: cada policy lleva su mensaje como constante local. La migración debe preservar el texto exacto de cada mensaje actual — un grep post-migración asegura 0 cambios de mensaje.

### 5. Fuera del scope de las policies

NO se mueve:

- **Validaciones de input técnico** (UUID, MIME type, HH:MM, RTSP URL format, file size, `isWithinSchedule`, range > 30min) → siguen como `CommunityInvariantError` **inline** ANTES de la policy.
- **Invariantes de estado del recurso** (camera PENDING/REJECTED, incident OPEN/CLOSED, permission uniqueness) → siguen inline. NO son policy de actor.
- **Nota:** Los invariantes de estado **acoplados a la operación** (mensajes que llevan el verbo de la operación, ej. *"Camera must be ACTIVE to remove permissions"*, *"Community is not active; recording requests are disabled"*) **sí son scope de la policy**, no inline. La policy ya encapsula la operación; cuando el mensaje tiene un verbo operacional, preservarlo dentro de la policy mantiene locality del contrato UX sin sacrificar el orden de checks de R8. El helper genérico `ensureActiveCommunity()` aplica solo a policies donde el wording genérico es aceptable.
- **`request-community-membership.ts`**: política de "claim-by-code", no de "actor role". Inline con comentario `// no extraer: claim-by-code, no es policy de actor`.
- **`findSectorById` cross-community check** (sector pertenece a la comunidad del incidente): invariante de entidad, no policy.

## Consequences

### Positive

- **Locality**: ~30 bloques `if (role !== X) throw ...` en 13 services colapsan a 13 funciones puras.
- **Leverage**: ~25 tests en `policies.test.ts` cubren TODAS las reglas de autorización del dominio community desde un solo archivo.
- **Consistencia de mensajes**: cada mensaje canónico vive en la policy. Cambiar "Only an ACTIVE ADMIN can X" es 1 commit, no 13.
- **Traceability**: si un auditor pide "¿quién puede crear recording requests?", la respuesta está en `policies/recording-request/ensure-can-request-recording.ts`.
- **Compatible con ADR-0015**: las policies consumen el port extendido. Sin re-implementar lookups.
- **Compatible con ADR-0010**: sin nuevas subclases de `DomainError`. HTTP semantics inalteradas.
- **Tests existentes**: los mocks que satisfacen `MembershipLookupsPort` siguen funcionando sin cambios (las policies dependen del mismo port).
- **Composición natural**: las policies compuestas retornan `{ resource }` para que el service no recargue; el service que ya cargó el recurso puede pasarlo como argumento.

### Negative

- **R1 — Indirection**: `await ensureCanReviewCamera({...})` añade 1 nivel sobre el `if/throw` inline. Mitigation: el caller sigue leyendo en una línea declarativa (`// 1. validate actor can review` ... `await ensureCanReviewCamera(...)`). Trade-off aceptable.
- **R2 — Tipo intersection verboso**: `MembershipLookupsPort & Pick<CameraRepository, "findCameraById">` requiere `Pick<>` explícito por policy. Mitigation: helper genérico `WithLookups<T>`.
- **R3 — Mensaje canónico en cada policy**: si dos policies necesitan el mismo mensaje (ej. "Only an ACTIVE ADMIN can..."), la constante se duplica. **No** se centraliza para preservar locality y evitar otro módulo compartido trivial. Severidad: baja (2-3 strings de duplicación).
- **R4 — NON-OBVIOUS #1 (`request-live-view-token.ts`)**: la check de miembro ADMIN + permisos + schedule está acoplada al contexto "emitir token". Se extrae como `ensureActiveMemberWithLiveAccess({...})` que retorna el `MemberLookupRecord`. **El ORDEN debe ser preservado**: cámara ACTIVE → community ACTIVE → member ACTIVE → permission-with-schedule. Mitigation: comment explícito en la policy + test que cubra el path "community not found → NotFound, aunque el member también falte".
- **R5 — NON-OBVIOUS #2 (`create-recording-request.ts`)**: la policy compuesta debe consultar `incident.createdById` que NO está en `MembershipLookupsPort`. La policy recibe el `incident` cargado por el service como argumento (Pattern B). Esto **rompe la simetría** con `ensureCanReviewCamera` (Pattern A). Mitigation: documentar el Pattern B en code review, no forzar simetría.
- **R6 — NON-OBVIOUS #3 (auto-review block)**: el mensaje "An ADMIN cannot review their own camera" vive en `review-camera.ts:105`. Debe preservarse verbatim dentro de `ensureCanReviewCamera`. Mitigation: test dedicado que cubre el path "actor is owner of camera → throws CommunityAuthorizationError with this message".
- **R7 — Patrón `findX ?? findY`**: 4 sitios hacen `findActiveNeighborOrGuardMember ?? findActiveAdminMember`. Centralizar en `findAnyActiveMember(client, communityId, userId)` dentro de `_helpers.ts`. Riesgo bajo: la helper se testea una vez.
- **R8 — Orden de checks observable**: community → member → resource-state es invariante del comportamiento (404 vs 403 vs 400 cambia para el cliente). Mitigation: comments explícitos en cada policy + 1 test por policy que cubre el path "community not found → NotFound, aunque el member también falte".

### Out of Scope

- Migración a clases / builders de policies: si en el futuro crece la complejidad (>40 policies), se re-evalúa la forma.
- Listado de "cámaras visibles para el actor" (`ensureCanListVisibleCameras`): cuando exista ese endpoint.
- Reapertura / comentarios / cierre de incidente: cuando se implementen esos servicios (phase 2).
- Promoción de miembro a ADMIN: cuando exista endpoint.
- Cancelación de recording request por el solicitante: cuando exista.
- `request-community-membership.ts` (claim-by-code).
- Migración de errores a una jerarquía nueva (mantener 3 clases existentes de ADR-0010).

## Implementation

### Plan de aplicación (2 PRs, estranguladores secuenciales)

NO big-bang. NO feature flag. Cada PR es independiente: typecheck + tests verdes antes del siguiente.

| # | PR | Archivos | LOC aprox | Riesgo |
|---|---|---|---|---|
| 0 | Foundation: 14 archivos de policies + 1 archivo de tests + ADR | 16 archivos nuevos | ~400 | Bajo |
| 1 | Migración mecánica de los 13 services | 13 archivos modificados | ~300 reducidas | Medio (cambio mecánico pero masivo) |

### PR #0 — Foundation

**Crear:**

- `src/domain/community/policies/_helpers.ts` — `WithLookups<T>` + `ensureActiveCommunity()` + `findAnyActiveMember()`
- `src/domain/community/policies/camera/ensure-can-register-camera.ts`
- `src/domain/community/policies/camera/ensure-can-review-camera.ts` (retorna `{camera}`)
- `src/domain/community/policies/camera/ensure-can-modify-permission.ts` (retorna `{camera}`)
- `src/domain/community/policies/camera/ensure-active-member-with-live-access.ts`
- `src/domain/community/policies/camera/ensure-camera-belongs-to-community.ts` (helper compartido)
- `src/domain/community/policies/incident/ensure-can-create-incident.ts`
- `src/domain/community/policies/recording-request/ensure-can-request-recording.ts` (retorna `{incident, camera, member}`)
- `src/domain/community/policies/recording-request/ensure-can-respond-recording.ts` (retorna `{request, camera, incident, community}`)
- `src/domain/community/policies/evidence/ensure-can-upload-evidence.ts`
- `src/domain/community/policies/evidence/ensure-can-view-evidence.ts` (retorna `{incident}`)
- `src/domain/community/policies/membership/ensure-can-approve-member.ts` (retorna `{targetMember}`)
- `src/domain/community/policies/membership/ensure-can-reject-member.ts` (retorna `{targetMember}`)
- `src/domain/community/policies/membership/ensure-can-create-invitation.ts`
- `src/domain/community/policies/index.ts` — barrel
- `src/domain/community/policies/policies.test.ts` — ~25 tests

**Verificación:**

```bash
npx tsc --noEmit
npx vitest run src/domain/community/policies/policies.test.ts
```

**Criterio "listo para migrar"**: cuando todos los tests del seam pasen y los service-site tests existentes sigan verdes (las policies no se usan todavía en ningún service en este PR).

### PR #1 — Migración de los 13 services (mecánica)

**Modificar** (sin cambio de lógica, solo movimiento de bloques if/throw):

| Archivo | Bloques reemplazados | LOC reducidas aprox |
|---|---|---|
| `register-community-camera.ts` | 1 + 1 | 15 → 3 |
| `review-camera.ts` | 1 + 1 + 1 | 30 → 5 |
| `set-camera-permission.ts` | 1 + 1 + 1 + 1 | 25 → 5 |
| `remove-camera-permission.ts` | 1 + 1 + 1 + 1 | 30 → 6 |
| `request-live-view-token.ts` | 2 + 1 | 80 → 12 |
| `create-incident.ts` | 1 + 1 | 15 → 3 |
| `create-recording-request.ts` | (compuesto: 4 lookups + checks) | 35 → 8 |
| `respond-recording-request.ts` | (compuesto: 4 lookups + checks) | 30 → 4 |
| `create-evidence.ts` | 1 + 1 + (incident status inline) | 25 → 6 |
| `get-evidence.ts` | 1 + 1 | 15 → 4 |
| `approve-community-member.ts` | 1 + 1 + (PENDING inline) | 25 → 6 |
| `reject-community-member.ts` | 1 + 1 + (PENDING inline) | 25 → 6 |
| `create-community-invitation.ts` | 1 + 1 | 10 → 3 |

**Excluido de PR #1**:

- `request-community-membership.ts` — claim-by-code, no policy de actor. Inline con comentario explicativo.

**Verificación obligatoria:**

```bash
npx tsc --noEmit
npx vitest run                                                                 # suite completa, sin warnings

# Mensajes canónicos preservados verbatim: cada mensaje debe vivir SOLO en la policy, no en el service.
# Excepción permitida: services que necesitaron if/throw específicos para casos NON-OBVIOUS no cubiertos por la policy.

# No quedan llamadas a lookups comunitarios en services para fines de policy:
grep -rn "findActiveNeighborOrGuardMember\|findActiveAdminMember\|findActiveAdminOrGuardMember" \
  src/domain/community/{camera,incident,recording-request,evidence,membership,invitations}/*.ts \
  | grep -v "policies/" | grep -v ".test.ts"
# esperado: 0 líneas en services — todas las policies tienen findX abstraido
```

### Tests del seam (`policies.test.ts`)

Estructura: 1-2 tests por policy cubriendo happy-path + 1 negative-path por cada branch.

```ts
describe("ensureCanReviewCamera", () => {
  it("throws CommunityNotFoundError when camera missing", async () => { ... });
  it("throws CommunityAuthorizationError when actor not ADMIN", async () => { ... });
  it("throws CommunityAuthorizationError with 'cannot review their own camera' when actor is owner", async () => { ... });
  it("throws CommunityInvariantError when camera not PENDING_REVIEW", async () => { ... });
  it("returns { camera } when ACTIVE ADMIN reviews pending camera of another member", async () => { ... });
});
```

### Tests de regresión

0 cambios en archivos de test existentes. Los mocks que satisfacen `MembershipLookupsPort` siguen funcionando porque las policies dependen del mismo port.

### Tests de integración

NO requeridos. Adapter cubierto en sus tests; services cubiertos indirectamente por service tests existentes.

### Criterios de include/exclude (resumen)

| Criterio | Include | Exclude |
|---|---|---|
| "actor debe tener rol X" | ✅ | |
| "actor es dueño del recurso" | ✅ | |
| Compuesto por "actor-tiene-rol" + "actor-es-X" | ✅ policy compuesta | |
| "campo del input es válido" (formato, rango, igualdad) | | ✅ invariant |
| "estado del recurso permite acción" (camera PENDING, incident OPEN) | solo si va pegado al check de actor | ✅ si va suelto, invariant |
| Lógica de claim/redeem/concurrencia | | ✅ no policy |
| Cambia la HTTP response | nunca (mantener 403/400/404) | |

### Mensajes canónicos preservados (referencia rápida)

| Mensaje canónico actual | Policy destino |
|---|---|
| "Only an ACTIVE NEIGHBOR, GUARD, or ADMIN can register a camera" | `camera/ensure-can-register-camera.ts` |
| "Only an ACTIVE ADMIN can review cameras" | `camera/ensure-can-review-camera.ts` |
| "An ADMIN cannot review their own camera" | `camera/ensure-can-review-camera.ts` |
| "Only the camera owner can set permissions" | `camera/ensure-can-modify-permission.ts` (set branch) |
| "Only the camera owner can remove permissions" | `camera/ensure-can-modify-permission.ts` (remove branch) |
| "You do not have permission to view this camera's live stream" | `camera/ensure-active-member-with-live-access.ts` |
| "Only an ACTIVE NEIGHBOR or GUARD can create an incident" | `incident/ensure-can-create-incident.ts` |
| "Only the incident creator, ADMIN, or GUARD can request recordings" | `recording-request/ensure-can-request-recording.ts` |
| "Only the camera owner can respond to a recording request" | `recording-request/ensure-can-respond-recording.ts` |
| "Only an ACTIVE community member can upload evidence" | `evidence/ensure-can-upload-evidence.ts` |
| "Only the incident creator, an ADMIN, or a GUARD can view evidence" | `evidence/ensure-can-view-evidence.ts` |
| "Only an ACTIVE ADMIN can approve members" | `membership/ensure-can-approve-member.ts` |
| "Only an ACTIVE ADMIN can reject members" | `membership/ensure-can-reject-member.ts` |
| "Only an ACTIVE ADMIN can create invitations" | `membership/ensure-can-create-invitation.ts` |

### Invariantes de estado con verbo operacional (dentro de policy)

| Mensaje canónico | Policy destino |
|---|---|
| "Camera must be ACTIVE to configure permissions" | `camera/ensure-can-set-permission.ts` |
| "Camera must be ACTIVE to remove permissions" | `camera/ensure-can-remove-permission.ts` |
| "Community is not active; recording requests are disabled" | `recording-request/ensure-can-request-recording.ts` |

### Invariantes de estado genéricas (sin verbo, compartidas vía helper)

| Mensaje canónico | Helper/policy destino |
|---|---|
| "Community is not active" | `_helpers.ts: ensureActiveCommunity()` (11 policies lo usan) |
| "Camera is not active" | `recording-request/ensure-can-request-recording.ts` (genérico OK) |
| "Camera is not available for live viewing" | `camera/ensure-active-member-with-live-access.ts` (wording ya específico) |
| "Camera is not pending review" | `camera/ensure-can-review-camera.ts` |
| "Cannot request recordings for a closed incident" | `recording-request/ensure-can-request-recording.ts` |

## References

- ADR-0010 (Inverted Domain Error HTTP Mapping) — sin cambios
- ADR-0011 (Authentication Prelude Seam) — patrón de seam con helper module
- ADR-0013 (AuditLog Port Seam) — patrón de inyección vía UoW
- ADR-0014 (RtspCipherPort Seam) — patrón de extraction de lógica compartida
- ADR-0015 (MembershipLookupsPort Seam) — port consumido por las policies
- CONTEXT.md — reglas de negocio completas (Camera Permission Rules, Live View Rules, Recording Request Rules, Incident Status Rules, Evidence Rules, Membership Rules, Business Rules)
- Re-review arquitectura 2026-06-28 v3 — candidata #6
