# ADR-0012: Plan de profundizacion Opcion B re-evaluado (post-ADR-0011)

## Status

Aceptado

## Context

El re-review de arquitectura ejecutado el 2026-06-28 (v2, post-ADR-0007/0008) identifico 7 candidatas de profundizacion. La sesion del 2026-06-28-late acordo ejecutar el plan "Opcion B" (quick wins primero) y aplico 5 de 7 candidatas: #1 (auth prelude), #2 (inversion de acoplamiento del DomainErrorMapper), #3 (DomainErrorMapper en platform route), #6 (DRY validators) y #7 (consolidar auth con supabase).

Las candidatas restantes del v2 eran:

- **#4 (UoW + lookups en repositorios Prisma)**: 5 repositorios compartian duplicacion de UnitOfWork y lookups comunitarios. La clausula "duplicacion aceptada" del ADR-0005 quedo desactualizada al sumarse evidence y platform.
- **#5 (desconocida)**: la observacion #519 quedo truncada a 300 caracteres, por lo que la candidata #5 no se conocia con certeza.

## Decision

Despues de re-ejecutar el skill `improve-codebase-architecture` sobre el codigo actual post-ADR-0011, se confirma que las candidatas #4 y #5 del v2 siguen vigentes y ademas aparecieron 4 candidatas nuevas que el v2 no detecto (porque solo son visibles despues de aplicar los ADRs que limpiaron auth y errores de dominio). El plan de implementacion re-evaluado es:

### Candidatas de profundizacion (6 total, post-ADR-0011)

| # | Candidata | Tipo | Nivel ADR-0001 | Tamano |
|---|-----------|------|----------------|--------|
| 1 | `MembershipLookupsPort` (re-exhumar v2 #4) | Profundizacion | **3** | M-L |
| 2 | `AuditLogPort` (6 repos duplican `createAuditLog`) | Nueva post-0011 | **3** | S-M |
| 3 | Helper `createTransactionalRepository` (6 repos duplican UoW) | Nueva post-0011 | **2** | S |
| 4 | `RtspCipherPort` (mirror de ADR-0008) | Nueva post-0008 | **3** | S-M |
| 5 | UUID inline en `cameras/route.ts:55` (stale de v2 #6) | Stale | **1** | Trivial |
| 6 | Policies de authorization (10 servicios duplican "actor=ACTIVE member") | Nueva post-0011 | **3** | M |

### Orden de implementacion (Opcion B re-evaluada)

**Esta sesion (quick wins + Nivel 3 mecanicos):**

1. **#5** — UUID inline cameras/route. Nivel 1. Orquestador directo. Typecheck.
2. **#3** — Helper `createTransactionalRepository`. Nivel 2. Orquestador directo. Typecheck + tests.
3. **#2** — `AuditLogPort`. Nivel 3. Delegar a `implementer` + `tester` + `reviewer`. **Bit-exact**: el INSERT contra `auditLog` debe preservarse sin cambios.
4. **#4** — `RtspCipherPort`. Nivel 3. Delegar a `implementer` + `tester` + `reviewer`. **Bit-exact**: el formato `iv:authTag:ciphertext` (hex) y el SHA-256 de streamKey deben preservarse exactamente. Requiere test vectors de regresion.

**Sesion dedicada (Nivel 3 grandes):**

5. **#1** — `MembershipLookupsPort`. Sesion nivel 3 completa. Toca 6 repos + ~15 servicios. **Al aplicar: actualizar ADR-0005** explicitamente (revocar la clausula "duplicacion aceptada", no solo agregar ADR).
6. **#6** — `Authorization policies`. Depende de #1. Sesion nivel 3 completa.

### ADRs especificos que se crearan al aplicar cada Nivel 3

- **#2** → ADR-0013 (AuditLogPort seam)
- **#4** → ADR-0014 (RtspCipherPort seam)
- **#1** → ADR-0015 (MembershipLookupsPort seam) + revision de ADR-0005

## Consequences

### Positive

- Plan claro y ordenado: las candidatas de Nivel 1-2 se aplican rapido (esta sesion), las de Nivel 3 con seguridad (tester + reviewer), las grandes en sesiones dedicadas.
- Reduce la friccion de testing: 25 mocks de `createAuditLog` colapsaran a 1 shape por test.
- ADR-0008 ya demostro el patron de extraction (EvidenceStoragePort) que se re-aplica a camara (RtspCipherPort) y a 6 repos (AuditLogPort). Simetria arquitectonica entre dominios.
- `createTransactionalRepository` ya es realidad: 6 repos colapsados a 1 helper. Patron reusable para futuros repos.

### Negative

- Sesion actual tiene mucho trabajo. Si #2 o #4 delegadas regresan con issues, se rebalancea.
- Politica "Opcion B quick wins primero" puede dejar candidatas grandes (#1, #6) abiertas por mas tiempo del optimo.

### Out of Scope (de este plan)

- Optimizaciones de performance (separacion de este lote).
- Cambios al modelo de datos o migraciones de schema.
- Refactors de UI o shadcn (no hay candidatas en este lote).

## Implementation

### Archivos creados (al cierre de la sesion)

- `src/infrastructure/prisma/_internal/create-transactional-repository.ts` — helper generico (cand #3).
- `docs/adr/0012-deepening-plan-option-b-reevaluated.md` — este ADR.

### Archivos modificados (al cierre de la sesion)

- `src/app/api/communities/[communityId]/cameras/route.ts` — regex UUID inline reemplazado por `isUuid` (cand #5).
- `src/infrastructure/prisma/camera-repository.ts` — migrado a helper (cand #3).
- `src/infrastructure/prisma/community-membership-repository.ts` — migrado a helper (cand #3).
- `src/infrastructure/prisma/evidence-repository.ts` — migrado a helper (cand #3).
- `src/infrastructure/prisma/incident-repository.ts` — migrado a helper (cand #3).
- `src/infrastructure/prisma/platform-community-repository.ts` — migrado a helper (cand #3).
- `src/infrastructure/prisma/recording-request-repository.ts` — migrado a helper (cand #3).

### Verificacion

```bash
# Typecheck: solo debe quedar el error preexistente de evidence route test
# (no relacionado con este lote).
npx tsc --noEmit

# Tests: todos los suites deben pasar.
npx vitest run
```

## Related Decisions

- **ADR-0005** (camera-repository autocontenido) — sera actualizado al aplicar cand #1.
- **ADR-0007** (DomainErrorMapper) — fundamento de la separacion de auth.
- **ADR-0008** (EvidenceStoragePort) — patron mirror para RtspCipherPort.
- **ADR-0009** (Platform DomainErrorMapping) — extiende el mapper.
- **ADR-0010** (Inverted DomainError HTTP Mapping) — god-class risk resuelto.
- **ADR-0011** (Authentication Prelude Seam) — auth unificada.
