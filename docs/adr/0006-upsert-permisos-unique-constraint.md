# ADR-0006: Upsert con unique constraint para permisos de cámara

## Status

Aceptado

## Context

Un permiso de cámara es único por `(cameraId, roleAllowed)` o por `(cameraId, userIdAllowed)`. Un dueño puede querer actualizar el horario de un permiso existente sin crear duplicados.

El problema de concurrencia: dos solicitudes simultáneas para el mismo `(cameraId + roleAllowed)` podían crear duplicados si se hacía `findFirst → create` en vez de un upsert atómico.

## Decision

1. Agregar `@@unique([cameraId, roleAllowed])` y `@@unique([cameraId, userIdAllowed])` en el schema Prisma.
2. Usar `prisma.cameraPermission.upsert()` en el repositorio para hacer el upsert atómico.
3. El dominio usa semantics de "actualizar si existe, crear si no existe" (upsert semantics).

## Consequences

### Positive

- No hay race conditions en la creación de permisos duplicados.
- El upsert de Prisma es atómico en la BD.
- La constraint de BD es la última línea de defensa.

### Negative

- Las migraciones de constraints únicos requieren cuidado: si ya hay datos duplicados, la migración falla.
- Unique constraint en PostgreSQL no admite valores NULL en la combinación (aunque el soft delete no aplica aquí).

## Implementation

Schema Prisma: `prisma/schema.prisma` — índices únicos en CameraPermission.
Repositorio: `src/infrastructure/prisma/camera-repository.ts` — método `upsertCameraPermission`.
