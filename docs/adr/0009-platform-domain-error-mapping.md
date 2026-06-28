# ADR-0009: DomainErrorMapper aplicado al platform route

## Status

Aceptado

## Context

ADR-0007 introdujo el `DomainErrorMapper` y consolido el mapeo `domain error -> HTTP status` en 13 route handlers de community. La clausula 7 del ADR declaro "out of scope" la ruta `src/app/api/platform/communities/route.ts` porque usaba clases de error distintas (`PlatformAuthorizationError`, `CommunityCreationInvariantError`) definidas localmente en `src/domain/platform/create-community-with-first-admin.ts`.

El re-review de arquitectura 2026-06-28 (post-ADR-0007/0008) detecto que esa exclusion dejo una **tercera copia** del patron de mapeo de errores en el codigo:

- Bloque `catch` bespoke de 21 lineas en `route.ts:109-129` con tres ramas (`PlatformAuthorizationError` -> 403, `CommunityCreationInvariantError` -> 400, fallback generico a 500 con `console.error`).
- Dos clases de error en `src/domain/platform/create-community-with-first-admin.ts` que son funcionalmente equivalentes a `CommunityAuthorizationError` y `CommunityInvariantError` del dominio community (mismo concepto: "actor carece de rol/permiso para la operacion"; "invariante de dominio violado").
- Logica de `console.error("[METHOD path] Unexpected error:", error)` copiada del mapper. Si el formato del log cambia en el mapper, este queda desincronizado.

El riesgo es el mismo que llevo a crear ADR-0007: una nueva clase de error de plataforma (ej. `PlatformMemberNotFoundError` para futuros flujos de admin de plataforma) requiere repensar el `catch` de la ruta, en lugar de agregar una clase + branch.

## Decision

1. **`PlatformAuthorizationError` extiende `CommunityAuthorizationError`** (mismo patron que `CommunityNotFoundError extends CommunityInvariantError` en ADR-0007). Preserva el nombre para logs (`this.name = "PlatformAuthorizationError"`).
2. **`CommunityCreationInvariantError` extiende `CommunityInvariantError`** con la misma tecnica.
3. La ruta `platform/communities/route.ts` reemplaza su `catch` bespoke por `mapDomainErrorToResponse(error, { method: "POST", path: "/api/platform/communities" })`.
4. Las dos clases de plataforma siguen exportandose desde `src/domain/platform/create-community-with-first-admin.ts` para preservar locality: el dominio platform las lanza; los callers no necesitan importar de `@/domain/community/errors` para entender la intencion.
5. Test del route actualizado para ejercitar la cadena de herencia real (`vi.importActual` preserva las clases reales; el mock solo cubre `createCommunityWithFirstAdmin`). Esto valida que la refactorizacion no es solo cosmetica: si alguien rompe la cadena de herencia en el futuro, el mapper dejaria de reconocer las platform-errors y los tests fallarian.
6. ADR-0007 clausula 7 queda resuelta y se referencia a este ADR.

## Consequences

### Positive

- **DRY**: 14 routes ahora usan el mismo mapper. La ruta de plataforma deja de ser la excepcion.
- **Locality**: agregar `PlatformMemberNotFoundError extends CommunityNotFoundError` cuando aparezca el caso de uso cuesta una clase y, si su HTTP status difiere del 404 por defecto, un branch en el mapper. No hay que volver a la ruta.
- **Logging consistente**: el formato `[POST /api/platform/communities] Unexpected error:` ahora es identico al del resto de las routes. Si se cambia el formato, cambia en un solo lugar.
- **Compatibilidad**: cualquier codigo existente que importaba `PlatformAuthorizationError` o `CommunityCreationInvariantError` sigue funcionando: los nombres de las clases exportadas y sus mensajes son los mismos. La unica diferencia es que ahora extienden clases del dominio community.

### Negative

- **Acoplamiento conceptual platform -> community**: ahora el dominio platform depende del modulo de errores del dominio community. Es una dependencia de bajo nivel (clases de error, no entidades de negocio) y justificada por la naturaleza del mapper compartido. Si esto incomoda, una alternativa seria mover las clases base (`CommunityAuthorizationError`, `CommunityInvariantError`) a un modulo neutral `src/domain/shared/errors.ts`. No se hace en este ADR para mantener locality del cambio.
- **`instanceof` cross-module**: el mapper reconoce `PlatformAuthorizationError` solo porque su prototipo es `CommunityAuthorizationError.prototype`. Un test explicito verifica esta cadena para que un cambio futuro que rompa la herencia falle antes de que el mapper mapee mal silenciosamente.

## Implementation

### Archivos modificados

- `src/domain/platform/create-community-with-first-admin.ts` — las dos clases de error ahora extienden las clases base del dominio community.
- `src/app/api/platform/communities/route.ts` — `catch` reducido de 21 lineas a 4; importa `mapDomainErrorToResponse` desde `@/lib/api/domain-error-mapper`.
- `src/app/api/platform/communities/route.test.ts` — mocks de las clases de error eliminados; usa `vi.importActual` para preservar las clases reales y validar la cadena de herencia. Test nuevo explicito para la herencia.
- `docs/adr/0007-domain-error-mapping.md` — clausula 7 "Out of scope" reemplazada por referencia a este ADR.

### Archivos creados

- `docs/adr/0009-platform-domain-error-mapping.md` — este ADR.

### Tests

- Los 12 tests existentes del `route.test.ts` siguen pasando con la nueva implementacion.
- 1 test nuevo: `verifica que PlatformAuthorizationError extiende CommunityAuthorizationError (cadena de herencia real)`.
- `src/domain/platform/create-community-with-first-admin.test.ts` no requiere cambios: testea el dominio directamente, no a traves del mapper.
- `src/lib/api/domain-error-mapper.test.ts` no requiere cambios: el mapper ya reconoce las clases via `instanceof CommunityAuthorizationError` y `instanceof CommunityInvariantError`.

### Riesgo conocido (no resuelto por este ADR)

La decision de ADR-0007 + este ADR mantienen al `DomainErrorMapper` con branches `instanceof` crecientes. El re-review 2026-06-28 v2 senalo esto como candidata #2 ("god-class risk inversion"). Se aborda en ADR-0010 o posterior.
