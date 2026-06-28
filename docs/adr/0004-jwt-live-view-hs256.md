# ADR-0004: Token JWT para live view con HS256

## Status

Aceptado

## Context

Un usuario con permiso vigente debe poder ver el stream de una cámara via WebRTC. La arquitectura de streaming es: Next.js autoriza → MediaMTX entrega stream.

El problema: ¿cómo comunica Next.js a MediaMTX que el usuario está autorizado sin que MediaMTX tenga que consultar a Next.js en cada conexión?

Alternativas evaluadas:
- **Signed URL estática**: MediaMTX valida firma HMAC en la URL. Simple pero sin expiración configurable por sesión.
- **JWT con clave compartida**: Next.js y MediaMTX comparten `CAMERA_STREAM_SECRET`. Next.js emite JWT → usuario usa JWT para conectarse a MediaMTX → MediaMTX valida JWT con la clave compartida.
- **Opaque token + lookup**: MediaMTX llama a Next.js para validar cada conexión. Introduce latencia y acoplamiento.

## Decision

Usar JWT HS256 (HMAC con clave compartida) para el token de live view.

Payload: `{ cameraId, userId, iat, exp }`
- `exp` = 1 hora desde emisión.
- Firma con `CAMERA_STREAM_SECRET` (env).
- MediaMTX valida la firma con la misma clave, sin llamar a Next.js.

El stream URL se arma en Next.js: `{NEXT_PUBLIC_MEDIA_SERVER_URL}/stream/{cameraId}?token={jwt}`

## Consequences

### Positive

- MediaMTX valida auth sin consultar Next.js → baja latencia, tolerancia a fallos.
- Cada token expira en 1h → acceso temporal, no perpetuo.
-.userId en el token permite auditoría en MediaMTX si se logs activos.
- JWT es estándar → MediaMTX soporta nativamente validación JWT.

### Negative

- La clave `CAMERA_STREAM_SECRET` debe ser la misma en Next.js y MediaMTX.
- Si la clave se filtra, un atacante puede generar tokens falsos → rotar clave si ocurre.
- El token lleva `userId` pero no el `communityId` ni el `rol`. No es un token de identidad completo, solo de autorización de stream.

## Implementation

`src/domain/community/camera/request-live-view-token.ts` delega la generación del JWT al adaptador `src/infrastructure/streaming/jose-live-stream-token-issuer.ts`, que implementa la interfaz `LiveStreamTokenIssuer` usando `jose.SignJWT`. El factory `src/infrastructure/streaming/index.ts` construye el issuer a partir de `CAMERA_STREAM_SECRET` y `NEXT_PUBLIC_MEDIA_SERVER_URL`.
MediaMTX se configura con la misma `CAMERA_STREAM_SECRET` y valida JWT en cada conexión.
