# ADR-0010: Inverted Domain Error HTTP Mapping

## Status

Aceptado

## Context

El `DomainErrorMapper` introduced por ADR-0007 y refinado por ADR-0009 presenta un **god-class risk inversion** identificado en el re-review 2026-06-28 v2. El mapper acumula branches `instanceof` crecientes, uno por cada subclase de error con semantica HTTP diferenciada:

```
if (error instanceof CommunityAuthorizationError) { return 403 }
if (error instanceof CommunityNotFoundError)      { return 404 }
if (error instanceof EvidenceStorageError)         { return 502 + log }
if (error instanceof CommunityInvariantError)      { return 400 }
```

Cada nueva clase de error que requiera un HTTP status unico demanda modificar el mapper. Esto viola locality: la semantica HTTP de una clase vive en el mapper, no en la clase.

Ademas, el ADR-0007 documento un bug de ordering donde `CommunityNotFoundError extends CommunityInvariantError` podia caer en el branch `CommunityInvariantError` (404 -> 400) si el orden de los branches no era el correcto. Ese bug se cerro con ADR-0007 al poner `CommunityNotFoundError` antes de `CommunityInvariantError`, pero la garantia era del orden, no de la logica.

Este ADR invierte la dependencia: las clases de error declaran su propia semantica HTTP y el mapper queda como dispatcher delgado.

## Decision

1. Nuevo modulo `src/domain/shared/domain-error.ts` con tres tipos exportados:
   - `DomainErrorContext = { method: string; path: string }`
   - `DomainErrorResponse = { status: number; body: { error: string }; log?: () => void }`
   - `abstract class DomainError extends Error` con metodo abstracto `httpResponse(ctx: DomainErrorContext): DomainErrorResponse`

2. `CommunityAuthorizationError`, `CommunityInvariantError`, `CommunityNotFoundError` en `src/domain/community/errors.ts` extienden ahora `DomainError` e implementan `httpResponse` con su semantica HTTP propia.

3. `CommunityNotFoundError` **overridea** `httpResponse` a 404 en lugar de heredar 400 del padre. Critico: este override es lo que elimina el ordering bug de ADR-0007 por construccion. Ya no importa el orden de branches en el mapper.

4. `EvidenceStorageError` overridea `httpResponse` con body fijo (`"Evidence storage temporarily unavailable"`) y un closure `log` que captura `ctx` y `this.cause`. El mapper lo invoca como `resp.log?.()`.

5. El mapper se reduce a ~12 lineas. Unico check `instanceof DomainError` + fallback 500. Ya no importa ninguna clase de error concreta.

6. Tests: el caso "EvidenceStorageError does NOT fall through" se mueve de `domain-error-mapper.test.ts` a `evidence-storage.test.ts` como test unitario de `httpResponse`. Cada archivo de error tiene ahora tests unitarios de su `httpResponse`.

7. Compatibilidad backwards preservada:
   - `EvidenceStorageError extends CommunityInvariantError` (back-compat con `instanceof CommunityInvariantError` existente)
   - `PlatformAuthorizationError extends CommunityAuthorizationError` ( ADR-0009)
   - `DomainErrorContext` se re-exporta desde `domain-error-mapper.ts` para no romper imports de callers

8. Las clases community NO se mueven a `shared/` (minima invasion). El modulo `shared/` solo contiene la clase abstracta base y los tipos. Platform no requiere cambios: sus clases heredan automaticamente la cadena hasta `DomainError`.

## Consequences

### Positive

- **DRY**: la semantica HTTP vive en la clase que la conoce, no en un dispatcher ajeno.
- **Locality**: agregar una nueva clase de error con HTTP status propio cuesta solo la clase (implementa `httpResponse`) y cero cambios en el mapper.
- **Leverage**: la clase decide su propio body, status y logging sin involucrar al mapper.
- **Eliminacion del ordering bug**: `CommunityNotFoundError` overridea `httpResponse` a 404. Ya no hay branch `instanceof` en competencia, solo herencia con override.
- **Separation of concerns**: el mapper es un thin dispatcher; las clases son responsables de su propia presentacion HTTP.
- **Mejor test strength**: unit tests de `httpResponse` por clase, aislados del mapper.

### Negative

- **Indirection leve**: para entender que HTTP status devuelve un error, hay que ver la clase, no el mapper.trade-off aceptable por la locality ganada.
- **Requiere TypeScript activo**: el `abstract` enforce en tiempo de compilacion que toda subclase declare `httpResponse`. Si se desactiva TS, una subclase que olvide el override compila y se comporta como `CommunityInvariantError` (400 por defecto en la clase base si no overridea).
- **Riesgo bajo de subclases que olvidan override**: mitigated por el hecho de que `CommunityAuthorizationError` y `CommunityInvariantError` ya tienen implementacion por defecto. Solo `EvidenceStorageError` y `CommunityNotFoundError` requieren override explicito por su semantica diferenciada.

## Implementation

### Archivos creados

- `src/domain/shared/domain-error.ts` — abstract class + types
- `src/domain/community/errors.test.ts` — unit tests de `httpResponse` para cada clase community
- `src/domain/community/evidence/evidence-storage.test.ts` — unit tests de `httpResponse` para EvidenceStorageError
- `docs/adr/0010-inverted-domain-error-http-mapping.md` — este ADR

### Archivos modificados

- `src/domain/community/errors.ts` — 3 clases ahora extienden `DomainError` e implementan `httpResponse`
- `src/domain/community/evidence/evidence-storage.ts` — `EvidenceStorageError` overridea `httpResponse` con body fijo + log closure
- `src/lib/api/domain-error-mapper.ts` — reescrito a ~12 lineas, thin dispatcher, ya no importa clases concretas
- `src/lib/api/domain-error-mapper.test.ts` — reducido de 13 a 9 tests, eliminados tests de dispatch specifcos (cubiertos ahora en errors.test.ts)

### Referencias

- ADR-0007: Domain Error Mapping (introdujo el mapper original y el bug de ordering)
- ADR-0009: DomainErrorMapper aplicado al platform route (PlatformAuthorizationError y CommunityCreationInvariantError)
- Re-review 2026-06-28 v2: senalo el "god-class risk inversion" como candidata #2