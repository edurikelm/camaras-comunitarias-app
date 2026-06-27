# ADR-0003: Cifrado de RTSP URL con AES-256-GCM

## Status

Aceptado

## Context

La URL RTSP de una cámara es un dato sensible técnico. Un atacante con acceso a la BD no debería poder ver las URLs de las cámaras de los usuarios. Además, CONTEXT.md establece que la RTSP no debe exponerse nunca al frontend.

La alternativa era:
- No cifrar (inseguro si hay acceso a BD)
- Cifrado simétrico con clave en env (más simple pero clave expuesta en memoria)
- Hash (no sirve porque RTSP necesita estar para conectar al stream)

## Decision

Usar AES-256-GCM para cifrar la RTSP URL antes de almacenarla en BD.

- La clave `CAMERA_RTSP_SECRET` vive en `process.env` y nunca se expone al frontend.
- El IV se genera aleatoriamente por cada cifrado y se prependa al ciphertext.
- El flujo es: dueño ingresa RTSP plana → servicio la pasa al repositorio → repositorio cifra → BD almacena ciphertext.
- Para descifrar (solo en el servidor, paraMediaMTX) se usa el repositorio con la clave.

El hash del streamKey usa SHA-256 simple porque no necesita recuperarse, solo validarse.

## Consequences

### Positive

- Si un atacante obtiene acceso a la BD, no ve las RTSP URLs.
- El cifrado es AUTHENTICATED (GCM) → detecta manipulación.
- La RTSP plana nunca sale del servidor hacia el frontend.

### Negative

- Si se pierde `CAMERA_RTSP_SECRET`, no hay recuperación de las URLs cifradas.
- Agrega costo computacional mínimo por operación de cámara.
- Requiere gestión de secrets en el entorno (Rotación de clave no implementada aún).

## Implementation

`src/infrastructure/prisma/camera-repository.ts` contiene `encryptRTSP()` y `decryptRTSP()`.
