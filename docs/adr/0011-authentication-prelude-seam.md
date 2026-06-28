# ADR-0011: Authentication Prelude Seam

## Status

Aceptado

## Context

Los 14 route handlers de la API comparten un bloque identico de autenticacion de ~13 lineas que:
1. Llama `authenticateRequest(request)` para verificar la sesion de Supabase.
2. Llama `getPrisma()` para obtener el cliente de base de datos.
3. Busca el `User` local mediante `prisma.user.findUnique({ where: { authProviderId: authUser.id }, select: { id: true } })`.
4. Retorna `401 Unauthorized` si no hay sesion.
5. Retorna `403 Forbidden` si no existe el usuario local.

Adicionalmente, el route `platform/communities` requiere verificar que el usuario tiene `platformRole === PLATFORM_ADMIN`, ahi el bloque se extiende a ~18 lineas con el `select: { id: true, platformRole: true }` y la validacion extra.

Este bloque esta duplicado en todos los routes, violando el principio DRY y dificultando:
- Mantenimiento: cualquier cambio en la logica de autenticacion requiere editar 14 archivos.
- Testing: cada test de route mockea `authenticateRequest` y `getPrisma` por separado.
- Auditoria: la consistencia de los codigos de error depende de la implementacion individual.

## Decision

Crear un seam llamado `auth-prelude` en `src/lib/api/auth-prelude.ts` que extrae la logica de autenticacion a una funcion reutilizable.

El seam expone dos funciones:
- `requireAuthenticatedUser(request)` — para routes de comunidad (actor: `{ id }`).
- `requirePlatformAdmin(request)` — para routes de plataforma (actor: `{ id, platformRole }`).

Ambas retornan `AuthPreludeResult<T>`, un tipo discriminado:
- `{ ok: true, actor, prisma }` cuando la autenticacion es exitosa.
- `{ ok: false, response: NextResponse }` cuando falla, con la respuesta ya construida (401 o 403).

Internamente el seam expone dos helpers privados, uno por variante del actor:
- `resolveActorWithoutPlatformRole(request)` para `requireAuthenticatedUser`.
- `resolveActorWithPlatformRole(request)` para `requirePlatformAdmin`, que ademas valida que `user.platformRole === PlatformRole.PLATFORM_ADMIN`.

El diseno original considero un unico helper `resolveActor(request, opts)` parametrizado por un flag `includePlatformRole`, pero esa forma producia un tipo de retorno discriminado que TypeScript no podiainferir sin un cast explicito en el caller. Para preservar la propiedad de que el actor regular NO expone `platformRole` y el actor platform SI lo expone con el enum correcto, se opto por dos helpers separados. El costo es ~45 lineas de logica compartida entre los dos, aceptable dado que la divergencia entre las dos variantes es solo el `select` y el check de `platformRole`. Si en el futuro aparece una tercera variante, conviene revisar este tradeoff.

## Consequences

### Positive

- Eliminacion de ~180 lineas de codigo duplicado (14 routes x ~13 lineas).
- Logica de autenticacion centralizada: un solo lugar para modificar, testar y auditar.
- Tests de routes mas simples: en vez de mockear `authenticateRequest` + `getPrisma` + `findUnique`, solo se mockea `requireAuthenticatedUser` o `requirePlatformAdmin`.
- El seam mantiene el mismo comportamiento observable: mismos codigos de error, mismos mensajes, mismo flujo de ejecucion.
- El tipo `PlatformRole` se preserva correctamente sin casts adicionales.

### Negative

- Introduce una nueva dependencia indirecta de los routes hacia el seam.
- Los tests existentes de routes que mockeaban `authenticateRequest` directamente deben actualizarse.

## Out of Scope

- Cambios en la logica de servicios de dominio (siguen recibiendo `actor: { id }` o `actor: { id, platformRole }`).
- Modificacion de `src/lib/auth.ts` o `src/lib/prisma.ts`.
- Migracion de routes que no usan el bloque de autenticacion standard (ej. `/register`).

## Implementation

### Archivos creados

- `src/lib/api/auth-prelude.ts` — seam con las dos funciones exportadas `requireAuthenticatedUser` y `requirePlatformAdmin`, implementadas sobre dos helpers privados `resolveActorWithoutPlatformRole` y `resolveActorWithPlatformRole` (ver seccion Decision para la justificacion de la duplicacion controlada).
- `src/lib/api/auth-prelude.test.ts` — 11 tests unitarios del seam.
- `docs/adr/0011-authentication-prelude-seam.md` — este ADR.

### Archivos modificados

14 routes migrados para usar el seam:

1. `src/app/api/community-membership/request/route.ts`
2. `src/app/api/cameras/[cameraId]/live/route.ts`
3. `src/app/api/communities/[communityId]/invitations/route.ts`
4. `src/app/api/communities/[communityId]/members/[memberId]/reject/route.ts`
5. `src/app/api/recording-requests/[requestId]/respond/route.ts`
6. `src/app/api/communities/[communityId]/members/[memberId]/approve/route.ts`
7. `src/app/api/communities/[communityId]/cameras/route.ts`
8. `src/app/api/communities/[communityId]/incidents/route.ts`
9. `src/app/api/communities/[communityId]/incidents/[incidentId]/evidence/route.ts`
10. `src/app/api/communities/[communityId]/cameras/[cameraId]/review/route.ts`
11. `src/app/api/communities/[communityId]/cameras/[cameraId]/permissions/route.ts`
12. `src/app/api/communities/[communityId]/cameras/[cameraId]/permissions/[permissionId]/route.ts`
13. `src/app/api/incidents/[incidentId]/recording-requests/route.ts`
14. `src/app/api/platform/communities/route.ts` — usa `requirePlatformAdmin`.

2 archivos de tests actualizados:

1. `src/app/api/platform/communities/route.test.ts` — mocks para `requirePlatformAdmin`.
2. `src/app/api/communities/[communityId]/incidents/[incidentId]/evidence/route.test.ts` — mocks para `requireAuthenticatedUser`.

### Verificacion

```bash
# No debe quedar ninguna referencia a authenticateRequest en los routes
grep -r "authenticateRequest" src/app/api/

# No debe quedar ningun import de @/lib/auth desde routes
grep -r 'from "@/lib/auth"' src/app/api/

# No debe quedar ningun import de @/lib/prisma desde routes (que solo lo usaban para el prelude)
grep -r 'from "@/lib/prisma"' src/app/api/
```

Todas las busquedas deben devolver 0 coincidencias.
