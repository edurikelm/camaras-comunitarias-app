# ADR-0013: AuditLog Port Seam

## Status

Aceptado

## Context

El metodo `createAuditLog` estaba duplicado identicamente en los 6 repositorios Prisma:

```ts
// camera-repository.ts, community-membership-repository.ts, evidence-repository.ts,
// incident-repository.ts, recording-request-repository.ts
async createAuditLog(input: CreateAuditLogInput) {
  await tx.auditLog.create({
    data: {
      communityId: input.communityId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
},
```

El caso de `platform-community-repository.ts` (linea 79-89) no tiene el `?? {}` fallback y hace cast directo a `InputJsonValue` — variacion no intencional que la normalizacion arregla.

Afectados:
- 6 repositorios con logica duplicada.
- ~25 servicios de dominio llaman `tx.createAuditLog({...})` o `repository.createAuditLog({...})` dentro de transacciones.
- ~25 archivos `.test.ts` que mockean `createAuditLog: vi.fn()`.
- 14 routes que instancian repositorios.

## Decision

**Opcion A implementada** (preserva interfaz existente, delegacion interna):

1. **`AuditLogPort`** en `src/domain/shared/audit-log.ts`:
   - `interface AuditLogPort { record(input: AuditLogEntry): Promise<void> }`
   - `type AuditLogEntry = { communityId, actorId, action, entityType, entityId, metadata? }`
   - `class AuditLogError extends DomainError` (mapea a 500 Internal Server Error via `httpResponse`).

2. **`PrismaAuditLogAdapter`** en `src/infrastructure/prisma/audit-log-adapter.ts`:
   - Implementa `AuditLogPort` ejecutando el INSERT Prisma.
   - Factory `createPrismaAuditLogAdapter(client)` acepta `PrismaClient` o `Prisma.TransactionClient`.
   - El adapter solo necesita el client para escribir — el client puede ser top-level o transaccional.

3. **Delegacion interna en cada repositorio** (Opcion A):
   - La interface `createAuditLog(...)` del UoW se mantiene igual.
   - La implementacion interna delega a `auditLog.record(...)`.
   - Los ~25 servicios de dominio NO CAMBIAN su firma de llamado.
   - Los ~25 mocks en tests NO CAMBIAN.

4. **Inyeccion via deps object**:
   - Cada factory de repositorio ahora recibe `deps: { auditLog: AuditLogPort }`.
   - El `auditLog` se captura en el closure de `createUnitOfWork` y esta disponible en cada transaccion.

5. **Normalizacion de platform**:
   - `platform-community-repository` ahora usa `input.metadata ?? {}` como los demas (antes lo omitia).

## Consequences

### Positive

- **Locality**: la logica de audit vive en un solo lugar (`PrismaAuditLogAdapter`).
- **Leverage**: un solo test del adapter cubre la implementacion de todos los repos.
- **Tests**: los tests de repos no necesitan cambiar (Opcion A preserva la interfaz). Solo se agrega `audit-log-adapter.test.ts`.
- **Consistency**: la variacion no intencional de platform (sin `?? {}`) se normaliza.
- **500 para audit failures**: `AuditLogError` permite al `DomainErrorMapper` distinguir fallos de audit (infraestructura, no dominio) y retornar 500 en lugar de 400.

### Negative

- **Dependencia indirecta**: los repositorios ahora dependen de `AuditLogPort` ademas de Prisma. Si el adapter no se inyecta, falla en runtime.
- **14 routes** requieren 2 lineas adicionales cada una para crear el adapter y pasarlo al deps.
- **Nuevo archivo** `audit-log-adapter.ts` que mantener.

### Out of Scope

- **Migracion completa a Opcion B** (cambiar la interfaz del UoW de `createAuditLog` a `auditLog: AuditLogPort` directamente) queda pendiente como follow-up. Esto requiere migrar ~25 servicios de dominio.

## Implementation

### Archivos creados

- `src/domain/shared/audit-log.ts` — port + types + `AuditLogError`
- `src/infrastructure/prisma/audit-log-adapter.ts` — adapter + factory
- `src/infrastructure/prisma/audit-log-adapter.test.ts` — 4 tests del adapter
- `docs/adr/0013-audit-log-port-seam.md` — este ADR

### Archivos modificados

**6 repositorios** (agregan `auditLog: AuditLogPort` a deps, delegan `createAuditLog` al port):

- `src/infrastructure/prisma/camera-repository.ts` — agrega `AuditLogPort` al deps ya existente `{ rtspCipher }`
- `src/infrastructure/prisma/community-membership-repository.ts` — agrega deps
- `src/infrastructure/prisma/evidence-repository.ts` — agrega deps
- `src/infrastructure/prisma/incident-repository.ts` — agrega deps
- `src/infrastructure/prisma/platform-community-repository.ts` — agrega deps (nuevo parametro)
- `src/infrastructure/prisma/recording-request-repository.ts` — agrega deps

**14 routes** (agregan `createPrismaAuditLogAdapter` + pasan al deps):

- `src/app/api/community-membership/request/route.ts`
- `src/app/api/platform/communities/route.ts`
- `src/app/api/incidents/[incidentId]/recording-requests/route.ts`
- `src/app/api/cameras/[cameraId]/live/route.ts`
- `src/app/api/communities/[communityId]/cameras/route.ts`
- `src/app/api/communities/[communityId]/incidents/route.ts`
- `src/app/api/communities/[communityId]/invitations/route.ts`
- `src/app/api/recording-requests/[requestId]/respond/route.ts`
- `src/app/api/communities/[communityId]/incidents/[incidentId]/evidence/route.ts`
- `src/app/api/communities/[communityId]/cameras/[cameraId]/review/route.ts`
- `src/app/api/communities/[communityId]/members/[memberId]/reject/route.ts`
- `src/app/api/communities/[communityId]/members/[memberId]/approve/route.ts`
- `src/app/api/communities/[communityId]/cameras/[cameraId]/permissions/route.ts`
- `src/app/api/communities/[communityId]/cameras/[cameraId]/permissions/[permissionId]/route.ts`

## References

- ADR-0008 (EvidenceStoragePort seam — mismo patron)
- ADR-0012 (plan de profundizacion, candidata #2)
- ADR-0014 (RtspCipherPort — dependencias existentes en camera-repository)
- `src/domain/shared/audit-log.ts` (port)
- `src/infrastructure/prisma/audit-log-adapter.ts` (adapter)
