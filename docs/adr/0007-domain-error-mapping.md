# ADR-0007: Domain Error Mapping

## Status

Aceptado

## Context

14 route handlers tenian bloques catch identicos pero con dos variantes divergentes al mapear `CommunityInvariantError` a HTTP status:

- **Variante A** (10 routes): `error.message.toLowerCase().includes("not found") ? 404 : 400`
- **Variante B** (4 routes: `community-membership/request`, `communities/[id]/invitations`, `members/[id]/approve`, `members/[id]/reject`): siempre 400

Variante B es un bug silencioso: degrada 404 a 400 en flujos de membresia. El usuario recibe un error menos especifico y pierde la posibilidad de distinguir "no encontrado" de "invariante violado".

La auditoria del arquitecto identifico que la logica de string matching no es necesaria si el dominio usa subclases de error propias. Asi el mapper es determinista, sin parsing de mensajes.

## Decision

1. Nueva subclase `CommunityNotFoundError extends CommunityInvariantError` en `src/domain/community/errors.ts`. Mantiene compatibilidad con `instanceof CommunityInvariantError` en codigo existente.

2. Mapper unico en `src/lib/api/domain-error-mapper.ts` con firma:
   ```
   mapDomainErrorToResponse(error: unknown, context: DomainErrorContext): NextResponse
   ```
   Donde `DomainErrorContext = { method: string; path: string }`.

3. Mapeo canonico:
   - `CommunityAuthorizationError` -> 403
   - `CommunityNotFoundError` -> 404
   - `CommunityInvariantError` (no NotFound) -> 400
   - Error generico de JS -> 500 con `console.error("[METHOD path] Unexpected error:", error)`

4. Throw sites actualizados en dominio: ~30 throw sites que decia "X not found" ahora usan `CommunityNotFoundError`.

5. Routes migradas (13 archivos): se reemplazo el bloque catch por `mapDomainErrorToResponse(error, { method, path })`.

6. Logging: `console.error` directo con prefijo `[METHOD path]` (un solo consumer, no se introduce interfaz Logger).

7. Out of scope: `platform/communities/route.ts` usa `PlatformAuthorizationError` y `CommunityCreationInvariantError` (clases distintas). `register/route.ts` no usa errores de dominio.

## Consequences

### Positive

- DRY: un solo lugar donde vive la logica de mapeo error -> HTTP status.
- Bug fix: las 4 rutas de Variante B ahora devuelven 404 correctamente para "not found".
- Locality: agregar un nuevo tipo de error de dominio requiere cambiar solo el mapper y el dominio, no 14 routes.
- Compatibilidad: `CommunityNotFoundError extends CommunityInvariantError` garantiza que codigo existente con `instanceof CommunityInvariantError` sigue funcionando.

### Negative

- Nueva subclase `CommunityNotFoundError` incrementa la superficie de clases de error.
- Throw sites actualizados requieren verificar que el mensaje sea semanticamente "no encontrado" y no otra clase de invariante.
- Los tests de route que mockeaban `CommunityInvariantError` para casos "not found" requieren actualizacion (solo `evidence/route.test.ts` fue afectado).

## Implementation

### Archivos creados

- `src/lib/api/domain-error-mapper.ts` — mapper con `mapDomainErrorToResponse`
- `src/lib/api/domain-error-mapper.test.ts` — 12 tests unitarios para el mapper
- `docs/adr/0007-domain-error-mapping.md` — este ADR

### Archivos modificados

**Subclase:**
- `src/domain/community/errors.ts` — agregado `CommunityNotFoundError extends CommunityInvariantError`

**Throw sites migrados (14 archivos de dominio):**
- `src/domain/community/evidence/get-evidence.ts`
- `src/domain/community/evidence/create-evidence.ts`
- `src/domain/community/recording/respond-recording-request.ts`
- `src/domain/community/recording/create-recording-request.ts`
- `src/domain/community/invitations/create-community-invitation.ts`
- `src/domain/community/incident/create-incident.ts`
- `src/domain/community/camera/register-community-camera.ts`
- `src/domain/community/camera/request-live-view-token.ts`
- `src/domain/community/camera/remove-camera-permission.ts`
- `src/domain/community/camera/set-camera-permission.ts`
- `src/domain/community/camera/review-camera.ts`
- `src/domain/community/membership/request-community-membership.ts`
- `src/domain/community/membership/approve-community-member.ts`
- `src/domain/community/membership/reject-community-member.ts`

**Routes migradas (13 archivos):**
- `src/app/api/cameras/[cameraId]/live/route.ts`
- `src/app/api/recording-requests/[requestId]/respond/route.ts`
- `src/app/api/community-membership/request/route.ts`
- `src/app/api/incidents/[incidentId]/recording-requests/route.ts`
- `src/app/api/communities/[communityId]/cameras/route.ts`
- `src/app/api/communities/[communityId]/incidents/route.ts`
- `src/app/api/communities/[communityId]/invitations/route.ts`
- `src/app/api/communities/[communityId]/members/[memberId]/reject/route.ts`
- `src/app/api/communities/[communityId]/members/[memberId]/approve/route.ts`
- `src/app/api/communities/[communityId]/cameras/[cameraId]/review/route.ts`
- `src/app/api/communities/[communityId]/incidents/[incidentId]/evidence/route.ts` (POST y GET)
- `src/app/api/communities/[communityId]/cameras/[cameraId]/permissions/route.ts`
- `src/app/api/communities/[communityId]/cameras/[cameraId]/permissions/[permissionId]/route.ts`

**Test actualizado:**
- `src/app/api/communities/[communityId]/incidents/[incidentId]/evidence/route.test.ts` — agregado `MockCommunityNotFoundError` al mock y actualizado 4 test cases para usar la nueva clase
