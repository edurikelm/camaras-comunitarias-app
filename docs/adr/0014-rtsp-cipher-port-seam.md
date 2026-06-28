# ADR-0014: RTSP Cipher Port Seam

## Status

Aceptado

## Context

`src/infrastructure/prisma/camera-repository.ts` (478 lineas) mezclaba logica de cifrado AES-256-GCM y hash SHA-256 con SQL y Prisma. Las primeras 56 lineas (`getEncryptionKey`, `encryptRTSP`, `hashStreamKey`) y el import de `node:crypto` no eran ni SQL ni UoW — eran infraestructura de seguridad mezclada con persistencia.

ADR-0008 ya reconocio este patron cuando lo extrajo de `evidence-repository.ts` (EvidenceStoragePort). La camara estaba en la misma situacion.

Si manana se cambia `CAMERA_RTSP_SECRET` por rotacion de claves (KEK+DEK) o se migra a un KMS externo, habria que modificar el repositorio aunque el SQL no cambie.

## Decision

Mirror exacto del patron ADR-0008 (EvidenceStoragePort):

1. **Port `RtspCipherPort`** en `src/domain/community/camera/rtsp-cipher.ts`. Interfaz de dominio sin conocer a `node:crypto` ni Prisma.

2. **`RtspCipherError extends CommunityInvariantError`** con `httpResponse()` que retorna 502 Bad Gateway (upstream encryption failure). Permite al `DomainErrorMapper` distinguir fallos de cifrado (502) de errores de dominio (400).

3. **Adapter `AesGcmRtspCipherAdapter`** en `src/infrastructure/security/aes-gcm-rtsp-cipher.ts`. Implementa el port con `node:crypto`, moviendo la logica actual tal cual.

4. **Factory `createRtspCipherFromEnv()`** en `src/infrastructure/security/index.ts`. Lee `CAMERA_RTSP_SECRET` y construye el adapter. Si la variable no esta, lanza `RtspCipherError` (no `Error` generico).

5. **`createPrismaCameraRepository` recortado**: acepta `deps: { rtspCipher: RtspCipherPort }` y ya no depende de `node:crypto` ni de `CAMERA_RTSP_SECRET`.

6. **Routes actualizados**: cada route que usa `createPrismaCameraRepository` ahora construye `createRtspCipherFromEnv()` antes de llamar al repositorio.

## Consequences

### Positive

- Dominio no conoce al proveedor de cifrado (posible migracion futura a KMS/HSM sin tocar dominio ni repositorio).
- `camera-repository.ts` ya no tiene imports de `node:crypto`.
- Fallos de cifrado se distinguen semanticamente (502 vs 400 opaco).
- El secreto se valida una sola vez en `createRtspCipherFromEnv()` al construir el adapter.

### Negative

- Un dep extra en cada route que toca camaras (5 routes).
- El contrato de bit-exactness (formato `iv:authTag:ciphertext` hex) es critico — cualquier cambio rompe el descifrado de URLs existentes.

## Implementation

### Bit-exactness contract (ADR-0003)

El formato de salida de `encryptRtspUrl` es un contrato definido en ADR-0003 y debe preservarse exactamente:

```
encryptRtspUrl(plaintext) → `${iv.toString("hex")}:${authTag}:${encrypted}`
  iv = randomBytes(16) — 32 hex chars
  authTag = cipher.getAuthTag().toString("hex") — 32 hex chars
  encrypted = cipher.update(utf8, "hex") + cipher.final("hex") — variable length
  algorithm = "aes-256-gcm"
  key = SHA-256(CAMERA_RTSP_SECRET) — 32 bytes

hashStreamKey(key) → SHA-256(key).digest("hex") — 64 hex chars
```

### Archivos creados

- `src/domain/community/camera/rtsp-cipher.ts` — port + `RtspCipherError`
- `src/infrastructure/security/aes-gcm-rtsp-cipher.ts` — adapter + factory
- `src/infrastructure/security/index.ts` — re-exports
- `src/infrastructure/security/aes-gcm-rtsp-cipher.test.ts` — 11 tests del adapter
- `docs/adr/0014-rtsp-cipher-port-seam.md` — este ADR

### Archivos modificados

- `src/infrastructure/prisma/camera-repository.ts` — elimina imports `node:crypto`, helpers de cifrado, y acepta `deps.rtspCipher`
- `src/app/api/communities/[communityId]/cameras/route.ts` — inyecta `createRtspCipherFromEnv()`
- `src/app/api/cameras/[cameraId]/live/route.ts` — inyecta `createRtspCipherFromEnv()`
- `src/app/api/communities/[communityId]/cameras/[cameraId]/review/route.ts` — inyecta `createRtspCipherFromEnv()`
- `src/app/api/communities/[communityId]/cameras/[cameraId]/permissions/route.ts` — inyecta `createRtspCipherFromEnv()`
- `src/app/api/communities/[communityId]/cameras/[cameraId]/permissions/[permissionId]/route.ts` — inyecta `createRtspCipherFromEnv()`

## References

- ADR-0003 (cifrado RTSP AES-256-GCM, contrato preservado)
- ADR-0008 (EvidenceStoragePort, patron mirror)
- `src/infrastructure/prisma/camera-repository.ts:17-56` (helpers removidos)
- `src/domain/community/evidence/evidence-storage.ts` (EvidenceStoragePort, patron original)
