# ADR-0015: MembershipLookupsPort Seam

## Status

Aceptado

## Context

5 repositorios Prisma duplican lookups de contexto comunitario. Tally verificado el 2026-06-28:

| Metodo | camera | evidence | incident | rec-req | cm-repo | Total |
|---|---|---|---|---|---|---|
| `findCommunityById` | 227 | 34 | 35 | 35 | 23 | **5** |
| `findActiveAdminMember` | 254 | - | 62 | 115 | 31 | **4** |
| `findActiveNeighborOrGuardMember` | 235 | - | 43 | 96 | - | **3** |
| `findActiveMember` (variante evidence) | - | 42 | - | - | - | **1** |
| `findActiveAdminOrGuardMember` (variante evidence) | - | 60 | - | - | - | **1** |
| `findSectorById` | 273 | - | 81 | - | - | **2** |

**Total: 16 ocurrencias en 5 repos.** `platform-community-repository` no tiene estos lookups (opera a nivel plataforma, no comunidad).

### Por que ahora

- **ADR-0005** (`Patron CameraRepository auto-contenido`) justifico la duplicacion como trade-off aceptado a cambio de auto-contencion de cada repo. Esa justificacion queda obsoleta: ADR-0012 demostro que la auto-contencion puede coexistir con seams compartidos (AuditLogPort ADR-0013, RtspCipherPort ADR-0014, helper `createTransactionalRepository`).
- El re-review de arquitectura 2026-06-28 v3 confirmo esta candidata como **#1 del lote**.
- 4 ADRs previos (0008, 0012, 0013, 0014) ya establecieron el patron de extraccion con seam + port + adapter. La simetria arquitectonica lo hace natural.

### Variantes de evidence (unicas)

Solo `evidence-repository` define dos lookups adicionales:

- `findActiveMember(communityId, userId)`: cualquier miembro con `status=ACTIVE` (sin filtro de rol).
- `findActiveAdminOrGuardMember(communityId, userId)`: `role in ["ADMIN", "GUARD"] AND status=ACTIVE`.

No existen en otros repos. Se incluyen en el port como metodos adicionales por simetria y extensibilidad futura.

### Bit-exactness de SELECTs

Las **WHERE clauses** son identicas entre repos para cada lookup. Solo difieren los campos seleccionados en dos casos:

- `findCommunityById`: 4 de 5 repos seleccionan `{id, name, status}`; `recording-request-repository` selecciona `{id, status}` (sin `name`).
- `findSectorById`: `camera` selecciona `{id, communityId}`; `incident` selecciona `{id, communityId, name}`.

**Decision de superset**: el adapter selecciona el superset (`{id, name, status}` para community, `{id, communityId, name}` para sector). Esto significa que `recording-request-repository` recibe `name` extra en el resultado de `findCommunityById` que antes no tenia. **Mitigacion**: verificacion manual confirma que ningun service de recording-request lee `community.name`. Sin tests que aserten sobre la ausencia de `name`. Ver Consequences R1.

## Decision

**Opcion A: un solo port `MembershipLookupsPort`** (mirror exacto del patron ADR-0013 / ADR-0014).

### 1. Port `MembershipLookupsPort`

En `src/domain/community/membership/membership-lookups.ts`. Tipos de retorno viven en el port (fuente de verdad unica):

```ts
import type {
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
} from "@/generated/prisma/enums";

export type CommunityLookupRecord = {
  id: string;
  name: string;
  status: CommunityStatus;
};

export type MemberLookupRecord = {
  id: string;
  userId: string;
  communityId: string;
  role: CommunityMemberRole;
  status: CommunityMemberStatus;
};

export type SectorLookupRecord = {
  id: string;
  communityId: string;
  name: string;
};

export interface MembershipLookupsPort {
  findCommunityById(id: string): Promise<CommunityLookupRecord | null>;
  findActiveAdminMember(
    communityId: string,
    userId: string,
  ): Promise<MemberLookupRecord | null>;
  findActiveNeighborOrGuardMember(
    communityId: string,
    userId: string,
  ): Promise<MemberLookupRecord | null>;
  findActiveMember(
    communityId: string,
    userId: string,
  ): Promise<MemberLookupRecord | null>;
  findActiveAdminOrGuardMember(
    communityId: string,
    userId: string,
  ): Promise<MemberLookupRecord | null>;
  findSectorById(sectorId: string): Promise<SectorLookupRecord | null>;
}
```

### 2. Adapter `PrismaMembershipLookupsAdapter`

En `src/infrastructure/prisma/membership-lookups-adapter.ts`. Implementa el port ejecutando las 6 SELECTs Prisma con WHERE y SELECT identicos al estado actual (salvo por la superset decision documentada). Factory `createPrismaMembershipLookupsAdapter(client)` acepta `PrismaClient | Prisma.TransactionClient`. Mirror del discriminador `isTopLevelClient` de `audit-log-adapter.ts`.

### 3. Construccion del adapter DENTRO de cada UoW

A diferencia de `AuditLogPort` (donde el adapter se inyecta en `deps`), `MembershipLookupsAdapter` se construye **dentro** del `createUnitOfWork(client)` de cada repo. Razon: `AuditLog` es escritura (puede legitimamente vivir fuera de la tx para garantizar persistencia); `MembershipLookups` es lectura y debe ver escrituras en vuelo dentro de la tx (consistencia transaccional con mutaciones posteriores).

```ts
function createUnitOfWork(
  client: PrismaClient | Prisma.TransactionClient,
): IncidentRepository {
  const tx = client;
  const membershipLookups = createPrismaMembershipLookupsAdapter(client);

  return {
    async findCommunityById(id) {
      return membershipLookups.findCommunityById(id);
    },
    async findActiveAdminMember(communityId, userId) {
      return membershipLookups.findActiveAdminMember(communityId, userId);
    },
    // ... etc
    async createIncident(input) {
      const row = await tx.incident.create({ ... });
    },
    // ... mutaciones usan `tx` directo
  };
}
```

### 4. Extension del UoW interface (cambio clave)

Cada interface de UoW extiende `MembershipLookupsPort` y elimina las declaraciones redundantes de los 6 lookups. Los mocks de tests existentes (que ya implementan `findCommunityById: vi.fn(...)` etc.) satisfacen el port automaticamente via structural typing.

```ts
// ANTES
export interface IncidentRepository {
  findCommunityById(id: string): Promise<CommunityRecord | null>;
  findActiveAdminMember(...): Promise<CommunityMemberRecord | null>;
  // ... otros lookups
  createIncident(...): Promise<IncidentRecord>;
}

// DESPUES
import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";

export interface IncidentRepository extends MembershipLookupsPort {
  // findCommunityById, findActiveAdminMember, etc. provistos por el port
  createIncident(...): Promise<IncidentRecord>;
}
```

Aplicar a los 5 repos: `CameraRepository`, `EvidenceRepository`, `IncidentRepository`, `RecordingRequestRepository`, y `CommunityUnitOfWork` (que afecta `CommunityMembershipRepository` por transitividad).

## Consequences

### Positive

- **Locality**: las 16 implementaciones duplicadas colapsan a 1.
- **Leverage**: 1 test del adapter cubre la logica de los 5 repos.
- **Bit-exactness WHERE**: todas las WHERE clauses (filtros role/status) se preservan exactamente. Sin cambio funcional.
- **Test surface**: 0 cambios en ~25 archivos de test existentes. Los mocks satisfacen el port via structural typing.
- **Service surface**: 0 cambios en ~15 servicios. Siguen llamando `tx.findCommunityById(...)` igual que ahora.
- **Route surface**: 0 cambios en las 14 routes. La factory signature no cambia (adapter se construye internamente).
- **Consistencia transaccional**: dentro de `runInTransaction`, las lecturas usan el `tx` client, garantizando que vean escrituras en vuelo.
- **Extensibilidad**: futuros lookups comunitarios se agregan al port sin re-decidir layout.

### Negative

- **R1 — Superset SELECT agrega `name` a `recording-request-repository.findCommunityById`**. El adapter selecciona `{id, name, status}` (superset de `{id, status}`). `recording-request` recibe `name` que antes no existia. **Mitigacion**: verificacion manual confirma que `create-recording-request.ts:115` y `respond-recording-request.ts:90` NO leen `community.name`. Sin tests que aserten sobre la ausencia. Severidad: baja (cosmetica, no funcional).
- **R2 — Acoplamiento UoW <-> port**. Cada UoW depende del port. Si el adapter no se construye, los lookups fallan. **Mitigacion**: el adapter se construye dentro de `createUnitOfWork`, que SIEMPRE se ejecuta (top-level o scoped). Imposible tener UoW sin adapter. Severidad: mitigado por construccion.
- **R3 — Drift prevention**. Sin disciplina, un nuevo service podria agregar lookup directo en un repo en vez del port. **Mitigacion**: documentar en code review que todo lookup de comunidad/miembro/sector debe vivir en el port. Severidad: baja (proceso).
- **R4 — Tipado mentiroso de `createUnitOfWork`**. La firma `(tx: Prisma.TransactionClient)` miente — el helper `createTransactionalRepository` la llama con `PrismaClient | Prisma.TransactionClient`. **Mitigacion**: fuera de scope (preexistente). Severidad: baja, no introducido por este ADR.

### Out of Scope

- Migracion completa a Opcion B (cambiar la interfaz del UoW de `tx.findCommunityById` a `membershipLookups.findCommunityById` directamente) — pendiente como follow-up. Requiere migrar ~15 servicios.
- Correccion del tipado mentiroso en `createUnitOfWork` (R4).
- `MembershipLookupsError` (clase similar a `AuditLogError`). Prisma errors del adapter propagan al route handler, mapeados a 500 por `mapDomainErrorToResponse`. Si en el futuro se quiere distinguir fallos de lookup, agregar clase propia. Por ahora fuera de scope.
- Optimizaciones de queries (N+1, joins) — separado de este lote.

## Implementation

### Plan de aplicacion (6 PRs, Stranglers Fig secuenciales)

NO big-bang. NO feature flag. Cada PR es independiente: typecheck + tests pasan antes del siguiente.

| # | PR | Archivos | LOC aprox | Riesgo |
|---|---|---|---|---|
| 0 | ADR-0015 + port + adapter + tests del adapter | 4 archivos nuevos + 1 ADR modificado | ~250 | Minimo |
| 1 | `community-membership-repository` | 2 lookups, 2 archivos | ~30 | Bajo |
| 2 | `incident-repository` | 4 lookups, 2 archivos | ~50 | Medio |
| 3 | `camera-repository` | 4 lookups, 2 archivos | ~70 | Medio |
| 4 | `recording-request-repository` | 3 lookups, 2 archivos | ~50 | Medio (R1) |
| 5 | `evidence-repository` | 3 lookups (2 unicas), 2 archivos | ~50 | Medio |

### PR #0 — Port + Adapter + ADR

**Crear:**
- `src/domain/community/membership/membership-lookups.ts` — port + tipos
- `src/infrastructure/prisma/membership-lookups-adapter.ts` — adapter + factory
- `src/infrastructure/prisma/membership-lookups-adapter.test.ts` — 7-8 tests
- `docs/adr/0015-membership-lookups-port-seam.md` — este ADR

**Modificar:**
- `docs/adr/0005-camera-repository-autocontenido.md` — agregar "Notas posteriores" (ver Supersedes)

**Verificacion:**
```bash
npx tsc --noEmit
npx vitest run src/infrastructure/prisma/membership-lookups-adapter.test.ts
```

### PRs #1-#5 — migracion repo por repo

Para cada uno de los 5 repos, 5 sub-pasos:

1. **Domain interface** (`src/domain/community/<area>/<repo>-repository.ts`):
   - `import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups"`
   - `export interface XRepository extends MembershipLookupsPort { ... }`
   - Eliminar declaraciones redundantes de los 6 lookups.
   - Eliminar tipos redundantes (`CommunityLookupRecord`, `MemberLookupRecord`, `SectorLookupRecord`) — importar del port.

2. **Prisma repo** (`src/infrastructure/prisma/<repo>-repository.ts`):
   - En `createUnitOfWork(client)`: `const membershipLookups = createPrismaMembershipLookupsAdapter(client);`
   - Delegar cada lookup: `async findCommunityById(id) { return membershipLookups.findCommunityById(id); }`
   - Eliminar implementaciones inline.

3. **Factory signature no cambia** (sigue aceptando `deps: { auditLog }` — adapter se construye internamente).
4. **Routes no cambian** — siguen llamando `createPrismaXRepository(prisma, { auditLog })`.
5. **Services no cambian** — siguen llamando `tx.findCommunityById(...)` igual que ahora.

### Tests del adapter

Mirror de `audit-log-adapter.test.ts`. ~7-8 tests:

1. `findCommunityById` invoca `tx.community.findUnique` con SELECT exacto `{id, name, status}`
2. `findCommunityById` retorna null cuando no existe
3. `findActiveAdminMember` filtra `role: "ADMIN", status: "ACTIVE"`
4. `findActiveNeighborOrGuardMember` filtra `role: { in: ["NEIGHBOR", "GUARD"] }, status: "ACTIVE"`
5. `findActiveMember` filtra solo `status: "ACTIVE"` (sin role)
6. `findActiveAdminOrGuardMember` filtra `role: { in: ["ADMIN", "GUARD"] }, status: "ACTIVE"`
7. `findSectorById` invoca `tx.communitySector.findUnique` con SELECT exacto `{id, communityId, name}`
8. No warns cuando se construye con transaction client (no `$transaction`)

### Tests de regresion

Mantener todos los tests existentes sin cambios. Los mocks actuales satisfacen `MembershipLookupsPort` automaticamente.

### Tests de integracion

No requeridos. Adapter cubierto en sus 7-8 tests; repos cubiertos indirectamente por service tests existentes.

## Supersedes (parcial)

Este ADR revoca parcialmente la clausula de "duplicacion aceptada" implicita en ADR-0005 (`Patron CameraRepository auto-contenido`). Especificamente:

- **ADR-0005 Negative** declaraba la duplicacion de lookups comunitarios como trade-off aceptado a cambio de auto-contencion. Esa justificacion queda **revocada**: el seam `MembershipLookupsPort` preserva la auto-contencion del repo (cada repo sigue exponiendo sus lookups via extension del port) pero elimina la duplicacion de implementacion.
- ADR-0005 sigue vigente en todo lo demas: cada repo sigue siendo "auto-contenido" en el sentido de que un servicio recibe un solo repo y `runInTransaction` sigue siendo simple. La diferencia es que las **implementaciones** de los lookups viven en el port, no en cada repo.
- ADR-0012 (Orden-de-implementacion referenciaba esta revocacion pendiente ("actualizar ADR-0005 explicitamente al aplicar cand #1"). Esta referencia queda satisfecha.

Cambio concreto a `docs/adr/0005-camera-repository-autocontenido.md`: agregar al final una seccion "Notas posteriores" referenciando este ADR.

## References

- **ADR-0005** (`Patron CameraRepository auto-contenido`) — revocado parcialmente
- **ADR-0008** (`EvidenceStoragePort seam`) — patron mirror (single-port)
- **ADR-0012** (`Plan de profundizacion Opcion B re-evaluado`) — candidata #1
- **ADR-0013** (`AuditLogPort seam`) — patron mirror (inyeccion via deps, single-port)
- **ADR-0014** (`RtspCipherPort seam`) — patron mirror (single-port)
- `src/infrastructure/prisma/audit-log-adapter.ts` — referencia para `isTopLevelClient` y factory
- `src/infrastructure/prisma/_internal/create-transactional-repository.ts` — helper de UoW sin cambios
- `CONTEXT.md` — lenguaje de dominio (comunidad, miembro, sector comunitario)