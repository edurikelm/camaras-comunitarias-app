# API Reference — Tracer Bullet MVP

Estado de todas las API routes implementadas. Auth: todas requieren Bearer token o cookie de sesión de Supabase.

## Platform

### `POST /api/platform/communities`
Crea una comunidad y asigna su primer administrador.

**Auth:** PLATFORM_ADMIN
**Body:**
```json
{
  "community": { "name": "Barrio Norte", "address?": "Av. Principal 123" },
  "firstAdmin": { "authProviderId": "<uuid>", "email": "admin@test.com", "name?": "Admin" }
}
```
**Respuesta:** `201` → `{ data: { community, firstAdminUser, firstAdminMember } }`

---

## Communities

### `POST /api/communities/[communityId]/invitations`
Crea una invitación genérica para la comunidad.

**Auth:** ADMIN de la comunidad (ACTIVE)
**Body:** `{}`
**Respuesta:** `201` → `{ plainCode: "XXXX-XXXX", invitation: { id, communityId, createdAt } }`

---

### `POST /api/communities/[communityId]/cameras`
Registra una cámara nueva (queda PENDING_REVIEW).

**Auth:** Miembro ACTIVE (NEIGHBOR, GUARD o ADMIN)
**Body:**
```json
{
  "name": "Cámara entrada",
  "description?": "角度 de la puerta principal",
  "approximateLocation?": "Entrada principal",
  "sectorId?": "<uuid>",
  "rtspUrl": "rtsp://192.168.1.100:554/stream",
  "streamKey?": "mi-stream-key"
}
```
**Respuesta:** `201` → `{ camera: { id, name, status: "PENDING_REVIEW" } }`

### `PATCH /api/communities/[communityId]/cameras/[cameraId]/review`
ADMIN aprueba o rechaza una cámara.

**Auth:** ADMIN de la comunidad (ACTIVE)
**Body:**
```json
{ "action": "APPROVE" | "REJECT", "reviewNote?": "Configurada correctamente" }
```
**Respuesta:** `200` → `{ camera: { id, status: "ACTIVE" | "REJECTED", reviewNote } }`

### `POST /api/communities/[communityId]/cameras/[cameraId]/permissions`
Crea o actualiza un permiso de cámara (upsert).

**Auth:** Dueño de la cámara (ACTIVE)
**Body:**
```json
{
  "role?": "NEIGHBOR" | "GUARD" | "ADMIN",
  "userId?": "<uuid>",
  "canViewLive": true,
  "canRequestRecordings": false,
  "scheduleStart?": "08:00",
  "scheduleEnd?": "18:00"
}
```
**Nota:** `role` o `userId` (uno de los dos, no ambos).

**Respuesta:** `200` → `{ permission: { id, cameraId, roleAllowed, canViewLive, ... } }`

### `DELETE /api/communities/[communityId]/cameras/[cameraId]/permissions/[permissionId]`
Elimina un permiso de cámara.

**Auth:** Dueño de la cámara (ACTIVE)
**Respuesta:** `200` → `{ deleted: true }`

---

## Cameras

### `GET /api/cameras/[cameraId]/live`
Genera token JWT para ver stream en vivo.

**Auth:** Miembro ACTIVE con permiso vigente (rol, usuario o ADMIN)
**Respuesta:** `200` → `{ streamUrl, token, expiresAt }`

---

## Membership

### `POST /api/communities/[communityId]/members/[memberId]/approve`
ADMIN aprueba un miembro PENDING.

**Auth:** ADMIN de la comunidad (ACTIVE)
**Body:** `{ "role": "NEIGHBOR" | "GUARD" }`
**Respuesta:** `200` → `{ member: { id, userId, communityId, role, status: "ACTIVE" } }`

---

## Membership Request

### `POST /api/community-membership/request`
Canjea un código de invitación y crea solicitud de membresía PENDING.

**Auth:** Usuario autenticado
**Body:** `{ "code": "XXXX-XXXX" }`
**Respuesta:** `201` → `{ membership: { id, communityId, status: "PENDING" } }`

---

## Incidents

### `POST /api/communities/[communityId]/incidents`
Reporta un incidente (crea incidente + alerta en transacción).

**Auth:** Miembro ACTIVE (NEIGHBOR o GUARD)
**Body:**
```json
{
  "type": "SUSPICIOUS_PERSON" | "THEFT" | "EMERGENCY" | "ACCIDENT" | "SUSPICIOUS_VEHICLE" | "OTHER",
  "description": "Persona desconocida rondando",
  "location?": "Sector A",
  "sectorId?": "<uuid>"
}
```
**Respuesta:** `201` → `{ incident: { id, type, severity, status: "OPEN", ... }, alert: { id, severity, message } }`

---

## Recording Requests

### `POST /api/incidents/[incidentId]/recording-requests`
Solicita revisión de grabaciones al dueño de una cámara.

**Auth:** Creador del incidente, ADMIN o GUARD
**Body:**
```json
{
  "cameraId": "<uuid>",
  "startTime": "2026-06-27T10:00:00Z",
  "endTime": "2026-06-27T10:30:00Z",
  "reason": "Ver quien entró a las 10:15"
}
```
**Respuesta:** `201` → `{ recordingRequest: { id, status: "PENDING", ... } }`

### `PATCH /api/recording-requests/[requestId]/respond`
Dueño de la cámara acepta o rechaza una solicitud.

**Auth:** Dueño de la cámara
**Body:** `{ "action": "ACCEPT" | "REJECT", "ownerComment?": "Te envío el clip" }`
**Respuesta:** `200` → `{ recordingRequest: { id, status: "ACCEPTED" | "REJECTED", ownerComment } }`

---

## Notas de Implementación

- Todas las rutas validate `communityId`/`cameraId` como UUID well-formed → 400 si no.
- Errores de dominio (validación, autorización) devuelven 400/403 según corresponda.
- Errores inesperados devuelven 500 con `{ error: "Internal server error" }`.
- La autenticación se hace via `authenticateRequest` (cookie o Bearer token).
- Auditoría: todos los mutations crean `AuditLog` en la misma transacción.
- Los tests de dominio cubren happy path + casos de error con mocks de repositorio.
