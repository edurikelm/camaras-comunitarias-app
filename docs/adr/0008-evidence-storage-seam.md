# ADR-0008: Evidence Storage Seam

## Status
Aceptado

## Context

El `EvidenceRepository` de infraestructura (`src/infrastructure/prisma/evidence-repository.ts:12, 147-182`) contenia logic de Supabase Storage mezclada con Prisma. Esto violaba el principio de hexagonal architecture: el dominio no debe conocer a su proveedor de persistencia. Ademas, si la transacción Prisma fallaba después de un upload exitoso, el archivo quedaba como orphan en storage (storage leak).

El puerto `EvidenceStoragePort` en el dominio permite extraer esta responsabilidad y hacer el dominio independiente de Supabase.

## Decision

1. **Port `EvidenceStoragePort`** en `src/domain/community/evidence/evidence-storage.ts`. El dominio define la interfaz sin conocer a Supabase.

2. **Adapter `SupabaseEvidenceStorageAdapter`** en `src/infrastructure/storage/supabase-evidence-storage.ts`. Implementa el port con el SDK de Supabase. Sus dependencias (cliente y bucket) se injectan via constructor (mirror del patron `JoseLiveStreamTokenIssuer` de deepening #4).

3. **Factory `createSupabaseEvidenceStorageFromEnv`** en `src/infrastructure/storage/index.ts`. Wirea el adapter con las variables de entorno (`EVIDENCE_STORAGE_BUCKET`).

4. **Nueva clase `EvidenceStorageError extends CommunityInvariantError`** (mirror de `CommunityNotFoundError` de ADR-0007). Permite al `DomainErrorMapper` distinguir fallos de storage (502 Bad Gateway) de errores de dominio (400).

5. **Compensación storage-first**: `uploadFile` se ejecuta ANTES de la transacción Prisma. Si la tx falla, se ejecuta `deleteFile` como compensación. Esto reduce orphans en storage.

6. **`DomainErrorMapper` extendido**: `EvidenceStorageError` mapea a 502 Bad Gateway con logging del cause.

7. **`EvidenceRepository` recortado**: solo Prisma, sin imports de Supabase. Los métodos `uploadFile` y `createSignedUrl` se eliminaron del interfaz y de la implementación Prisma.

## Consequences

### Positive

- Dominio no conoce al proveedor de storage (posible migración futura a S3/R2 sin tocar dominio).
- Tests de dominio no requieren mock global de Supabase.
- Fallos de storage se distinguen semánticamente (502 vs 400 opaco).
- Compensación explícita reduce orphans en storage.

### Negative

- Un dep extra en cada servicio que toca evidencia (`uploadEvidence`, `getEvidence`).
- Tests existentes requieren agregar `evidenceStorage` como segunda dep (cambio mecánico).

## Implementation

### Archivos creados

- `src/domain/community/evidence/evidence-storage.ts` — port + tipos + `EvidenceStorageError`
- `src/infrastructure/storage/supabase-evidence-storage.ts` — adapter
- `src/infrastructure/storage/supabase-evidence-storage.test.ts` — 10 tests del adapter
- `src/infrastructure/storage/index.ts` — factory `createSupabaseEvidenceStorageFromEnv`
- `docs/adr/0008-evidence-storage-seam.md` — este ADR

### Archivos modificados

- `src/domain/community/evidence/evidence-repository.ts` — elimina `UploadFileInput` y los métodos de storage del interfaz
- `src/infrastructure/prisma/evidence-repository.ts` — elimina imports de Supabase y métodos de storage
- `src/domain/community/evidence/create-evidence.ts` — usa `evidenceStorage` del deps, compensación storage-first
- `src/domain/community/evidence/get-evidence.ts` — usa `evidenceStorage.createSignedUrl` en lugar de `repository.createSignedUrl`
- `src/app/api/communities/[communityId]/incidents/[incidentId]/evidence/route.ts` — inyecta `createSupabaseEvidenceStorageFromEnv`
- `src/lib/api/domain-error-mapper.ts` — agrega branch para `EvidenceStorageError → 502`
- `src/lib/api/domain-error-mapper.test.ts` — 2 tests para el nuevo branch
- `src/domain/community/evidence/create-evidence.test.ts` — actualiza mocks y agrega 2 tests de compensación
- `src/domain/community/evidence/get-evidence.test.ts` — actualiza mocks
- `src/app/api/communities/[communityId]/incidents/[incidentId]/evidence/route.test.ts` — mock de storage

## References

- ADR-0005 (CameraRepository auto-contenido)
- ADR-0007 (DomainErrorMapper pattern: subclases de CommunityInvariantError)
- deepening #4 (LiveStreamTokenIssuer: port + adapter + fromEnv factory)
- `src/domain/community/evidence/evidence-repository.ts` (acoplamiento a remover)
- `src/infrastructure/prisma/evidence-repository.ts:12, 147-182` (implementación con storage leak)
- `CONTEXT.md:30` (definición de Evidencia), :172-173 (soft delete preparado)
