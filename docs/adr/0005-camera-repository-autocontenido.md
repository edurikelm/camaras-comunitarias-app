# ADR-0005: Patrón CameraRepository auto-contenido

## Status

Aceptado

## Context

Los servicios de cámara (`registerCommunityCamera`, `reviewCamera`, `setCameraPermission`, `requestLiveViewToken`) necesitan validar que el actor es miembro de la comunidad, que la comunidad está ACTIVE, y operar sobre la cámara.

Había dos opciones de diseño:

**Opción A — Repositorio separado por dominio (Membership + Camera):**
El servicio recibe ambos repositorios y coordina. Problema: `runInTransaction` debe abarcar ambos repositorios sin una UoW compartida. Más complejo.

**Opción B — CameraRepository autocontenido:**
CameraRepository incluye métodos de lookup comunitario (`findCommunityById`, `findActiveNeighborOrGuardMember`, `findActiveAdminMember`, `findSectorById`) además de los de cámara. Cada servicio solo recibe un repositorio. Las transacciones son simples.

## Decision

CameraRepository es autocontenido e incluye los métodos de lookup necesarios para sus servicios.

El `runInTransaction` de CameraRepository crea un UnitOfWork que tiene todos los métodos necesarios (tanto de cámara como de comunidad) scoped a la transacción.

## Consequences

### Positive

- Cada servicio recibe un solo repositorio → simplicidad.
- Las transacciones son simples: un solo `runInTransaction`.
- Se evita el patrón de dos repositorios con UoW compartida.

### Negative

- Existe cierta duplicación: CommunityMembershipRepository y CameraRepository tienen métodos de lookup comunitario similares.
- Un cambio en la estructura de comunidad podría requerir cambios en ambos repositorios.

## Implementation

`src/domain/community/camera/camera-repository.ts` — interfaz con métodos de cámara y de lookup comunitario.
`src/infrastructure/prisma/camera-repository.ts` — implementación Prisma que crea ambos en un solo UnitOfWork.

## Notas posteriores

**2026-06-29 — ADR-0015 (`MembershipLookupsPort seam`)** revoca parcialmente este ADR. La duplicación de lookups comunitarios ya no se considera trade-off aceptado — vive en `MembershipLookupsPort` + `PrismaMembershipLookupsAdapter`. La auto-contención del repo (un servicio recibe un solo repo, `runInTransaction` simple) se preserva vía extensión del port en cada interface de UoW. Ver ADR-0015 §Supersedes para detalles.
