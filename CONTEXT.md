# Camaras Comunitarias - Context

## Purpose

Este archivo es la fuente de verdad del dominio, lenguaje, reglas de negocio, modelo de datos, stack y convenciones del proyecto.

Actualiza este documento cuando una regla durable cambie o se descubra durante el trabajo.

## Domain Language

- **Red privada de seguridad comunitaria**: plataforma cerrada donde una comunidad coordina camaras, usuarios, incidentes, alertas y permisos bajo reglas propias.
- **Comunidad**: barrio, condominio, edificio, conjunto residencial u organizacion que opera como tenant separado.
- **Sector comunitario**: subdivision interna y manual de una comunidad usada para agrupar miembros, camaras, incidentes y alertas sin usar ubicacion exacta.
- **Miembro de comunidad**: usuario asociado a una comunidad con un rol y un estado de aprobacion.
- **Invitacion de comunidad**: codigo o enlace privado que permite solicitar ingreso a una comunidad sin exponerla publicamente.
- **Vecino**: miembro que puede compartir camaras propias, ver camaras autorizadas, reportar incidentes, recibir alertas y solicitar revision de grabaciones.
- **Administrador de comunidad**: miembro responsable de aprobar usuarios, gestionar roles, administrar configuracion comunitaria y revisar incidentes.
- **Administrador de plataforma**: operador interno que crea comunidades y define su primer administrador.
- **Guardia**: miembro de seguridad operativa que puede ver camaras autorizadas, recibir alertas SOS y actualizar incidentes.
- **Camara comunitaria**: camara registrada por un vecino para compartir acceso controlado dentro de una comunidad.
- **Dueno de camara**: vecino que mantiene control sobre que camara comparte, con quien, en que horarios y con que capacidades.
- **Permiso de camara**: regla que autoriza acceso por rol o usuario especifico, incluyendo visualizacion en vivo, solicitud de grabaciones y horario permitido.
- **Ubicacion aproximada**: referencia no exacta usada para coordinar seguridad sin revelar informacion sensible innecesaria.
- **Vecinos cercanos**: miembros activos asociados al mismo sector comunitario que un incidente, SOS o camara relevante.
- **Incidente**: reporte de un evento relevante para la seguridad comunitaria, como robo, persona sospechosa, vehiculo sospechoso, emergencia, accidente u otro.
- **Alerta**: notificacion en tiempo real derivada de un incidente o SOS que requiere atencion de vecinos, administradores o guardias autorizados.
- **Severidad de alerta**: nivel LOW, MEDIUM, HIGH o CRITICAL que determina el alcance inicial de notificacion.
- **Solicitud de grabacion**: pedido a un dueno de camara para revisar un rango horario relacionado con un incidente.
- **SOS**: alerta de emergencia inmediata iniciada por un usuario, asociada a comunidad, usuario, ubicacion aproximada, hora y estado.
- **Evidencia**: imagen, video, clip, metadata o registro usado para investigar un incidente.
- **Servidor de medios**: servicio externo a Next.js que recibe RTSP y expone WebRTC para navegadores.

## Business Rules

- La privacidad y el control de acceso son reglas criticas del dominio.
- La evidencia y los eventos deben mantener trazabilidad suficiente para auditoria.
- Los cambios en autenticacion, permisos, visibilidad de evidencia, alertas, integraciones o datos sensibles son dominio critico.
- No asumir acceso publico a camaras, eventos o evidencia salvo que una regla explicita lo permita.
- Cada comunidad debe funcionar como un tenant separado; toda consulta sensible debe validar comunidad.
- Los estados de comunidad del MVP son ACTIVE, SUSPENDED y ARCHIVED.
- Una comunidad SUSPENDED queda bloqueada temporalmente por plataforma para operacion normal.
- Una comunidad ARCHIVED esta cerrada o inactiva y no permite crear nuevos incidentes ni camaras.
- En el MVP, un usuario solo puede pertenecer a una comunidad.
- Todo usuario nuevo debe ser validado por un administrador de comunidad antes de quedar activo.
- El ingreso a una comunidad en el MVP requiere codigo o enlace de invitacion y aprobacion posterior del administrador.
- En el MVP, un administrador de comunidad puede generar invitaciones genericas para solicitar ingreso.
- Las invitaciones de comunidad no fijan el rol final; el administrador de comunidad asigna el rol al aprobar.
- En el MVP, solo un administrador de plataforma puede crear comunidades.
- El administrador de plataforma define el primer administrador de comunidad.
- El administrador de plataforma es un rol global separado de los roles de miembro de comunidad.
- No se debe modelar al administrador de plataforma como miembro de una comunidad especial.
- En el MVP, el administrador de plataforma gestiona comunidades y primeros administradores, pero no ve video, evidencia ni incidentes privados por defecto.
- Cualquier acceso de soporte de plataforma a datos privados comunitarios debe ser explicito, excepcional y auditado.
- Los estados de un miembro de comunidad en el MVP son PENDING, ACTIVE y BLOCKED.
- Un miembro PENDING no puede ver camaras, incidentes ni evidencia de la comunidad.
- Un miembro BLOCKED no puede acceder a datos de la comunidad.
- En el MVP, ADMIN incluye las capacidades base de NEIGHBOR mas gestion administrativa.
- En el MVP, GUARD es un rol operativo separado y no se asume como dueno tipico de camaras.
- Un ADMIN activo puede promover a otro miembro ACTIVE a ADMIN, dejando trazabilidad/auditoria.
- Un ADMIN no puede convertir a un miembro PENDING directamente en ADMIN sin activarlo primero.
- El dueno de una camara mantiene control sobre acceso, horarios, capacidades y estado de privacidad.
- Toda camara registrada por un vecino requiere revision de un administrador de comunidad antes de quedar disponible.
- Una camara en revision no puede ser vista por otros miembros aunque tenga permisos configurados.
- El administrador de comunidad revisa datos no sensibles de la camara; la URL RTSP no debe mostrarse salvo necesidad tecnica explicita y autorizada.
- Los estados de camara del MVP son PENDING_REVIEW, ACTIVE, INACTIVE, PRIVATE y REJECTED.
- Una camara PENDING_REVIEW o REJECTED no esta disponible para visualizacion comunitaria.
- Una camara ACTIVE no queda visible por defecto para toda la comunidad.
- Toda visualizacion de camara requiere permisos explicitos configurados por el dueno de camara.
- Un administrador de comunidad no tiene acceso automatico al video de todas las camaras.
- Un administrador de comunidad solo puede ver una camara si tiene permiso explicito, una excepcion de emergencia definida o una solicitud de grabacion aceptada.
- En el MVP, un SOS no cambia permisos de camara ni habilita acceso automatico a camaras cercanas.
- Un SOS genera alerta inmediata y coordina respuesta, pero solo se pueden ver camaras con permisos ya existentes.
- Despues de un SOS o incidente se pueden crear solicitudes de grabacion segun el flujo normal de aceptacion del dueno.
- En el MVP, la evidencia adjunta a incidentes permite imagenes y metadata; no permite videos subidos directamente por usuarios.
- Los videos o clips quedan fuera del MVP salvo que provengan de un flujo futuro de solicitud de grabacion aceptada.
- Toda evidencia debe registrar comunidad, incidente, usuario que la subio y fecha/hora para trazabilidad.
- En el MVP, la evidencia de un incidente es visible para el creador del incidente, administradores de comunidad y guardias autorizados.
- Los vecinos notificados pueden ver el resumen del incidente, pero no la evidencia completa por defecto.
- La evidencia no debe distribuirse automaticamente a toda la comunidad activa.
- En el MVP, la cercania se calcula por sector comunitario definido manualmente, no por GPS ni radio en metros.
- Los sectores comunitarios son opcionales en el MVP y los administra el administrador de comunidad.
- Una comunidad puede operar sin sectores comunitarios configurados.
- Si no hay sector comunitario aplicable, las alertas se envian al menos a administradores y guardias autorizados; la comunidad puede definir si tambien notifica a todos los vecinos activos.
- Las alertas cercanas se envian a miembros ACTIVE del mismo sector comunitario, mas administradores y guardias autorizados.
- Las severidades de alerta del MVP son LOW, MEDIUM, HIGH y CRITICAL.
- Una alerta LOW notifica inicialmente a administradores y guardias autorizados.
- Una alerta MEDIUM notifica a administradores, guardias autorizados y vecinos activos del sector comunitario aplicable.
- Una alerta HIGH notifica a administradores, guardias autorizados y vecinos activos del sector; si no hay sector aplicable, puede notificar a toda la comunidad activa.
- Una alerta CRITICAL se usa para SOS o emergencia y notifica a administradores, guardias autorizados y vecinos activos del sector; si no hay sector aplicable, notifica a toda la comunidad activa.
- La severidad sugerida por defecto es: emergencia CRITICAL, robo HIGH, accidente HIGH, persona sospechosa MEDIUM, vehiculo sospechoso MEDIUM y otro LOW.

## Camera Management Rules

- Una camara comunitaria se registra con estado inicial PENDING_REVIEW.
- En el registro, el dueno de camara ingresa la RTSP URL (rtspUrlEncrypted) junto con name, description y approximateLocation.
- El campo reviewNote es opcional para el ADMIN al aprobar o rechazar una camara; nunca es obligatorio en BD.
- Luego del registro, el dueno puede editar: name, description, approximateLocation y sectorId.
- EI campo rtspUrlEncrypted y streamKeyHash nunca son editables ni visibles para otros usuarios tras el registro.
- El campo technicalStatus es un string libre con valores sugeridos: "configurada", "pendiente", "error", "offline".
- El ADMIN de comunidad nunca ve la RTSP URL ni el streamKeyHash de ninguna camara; tampoco en el flujo de revision.
- Para que el sistema de streaming reporte technicalStatus se usa un proceso fuera de banda.

## Camera Permission Rules

- Solo el dueno de camara puede crear, actualizar o eliminar permisos de su propia camara.
- Un permiso por rol (o usuario) es unico por camara: si ya existe, se actualiza al crear.
- Un permiso tiene dos booleanos independientes: canViewLive y canRequestRecordings.
- Un permiso puede tener horario: scheduleStart y scheduleEnd en formato HH:MM.
- scheduleEnd debe ser mayor a scheduleStart si ambos existen.
- Solo camaras ACTIVE pueden tener permisos configurados.
- Los permisos para camaras PENDING_REVIEW, INACTIVE, PRIVATE o REJECTED no tienen efecto.
- Un permiso por rol se elimina al asignar el rol a un miembro; un permiso por usuario permanece aunque cambie su rol.

## Incident and Alert Rules

- Un incidente se crea junto con su alerta en la misma transaccion: createIncident persiste Incident + Alert.
- Pueden crear incidentes: miembros ACTIVE con rol NEIGHBOR o GUARD.
- El creador del incidente no necesita tener permisos de camara.
- Sector es opcional en el incidente; si no se especifica, la alerta se enva segun la regla de sin sector aplicable.
- La severidad inicial se sugiere automaticamente por tipo de incidente.
- Un ADMIN o GUARD puede ajustar la severidad despues de creado el incidente.
- La alerta se persiste en BD en este slice; la notificacion realtime via Socket.IO queda para un slice posterior.

## Recording Request Rules

- Pueden crear solicitudes de grabacion: el creador del incidente, administradores de comunidad y guardias autorizados.
- Una solicitud se refiere a una camara de la misma comunidad del incidente.
- El rango horario maximo es 30 minutos; se valida al crear la solicitud.
- El dueno de la camara puede aceptar o rechazar la solicitud.
- Al aceptar, el dueno puede agregar un comentario.
- Al rechazar, el dueno puede agregar un comentario.
- El solicitante no puede cancelar la solicitud.
- Se permiten multiples solicitudes para la misma camara e incidente.

## Live View Rules

- Para ver un stream en vivo, el usuario debe tener un permiso vigente: por rol, por usuario, o ser ADMIN de la comunidad.
- El horario del permiso (scheduleStart/scheduleEnd) se verifica contra la hora actual HH:MM.
- Si scheduleStart > scheduleEnd lexicograficamente, se interpreta como rango que cruza medianoche: se permite si hora actual >= scheduleStart O <= scheduleEnd.
- Solo camaras en estado ACTIVE pueden emitir streams.
- La API de live view devuelve un token JWT con cameraId, userId y expiresAt (1 hora).
- El token se firma con CAMERA_STREAM_SECRET y se valida en MediaMTX.
- El stream URL se arma con NEXT_PUBLIC_MEDIA_SERVER_URL + /stream/{cameraId}?token={jwt}.
- Cada vez que se genera un token valido se audita con CAMERA_LIVE_VIEWED.

## Incident Status Rules

- Los estados de incidente del MVP son OPEN, REVIEWING y CLOSED.
- Un incidente OPEN esta recien reportado o pendiente de atencion.
- Un incidente REVIEWING esta siendo gestionado por un administrador de comunidad o guardia.
- Un incidente CLOSED esta finalizado y no admite nuevas solicitudes de grabacion por defecto.
- En el MVP, falsas alarmas o cancelaciones se registran como motivo de cierre, no como estados separados.
- En el MVP, un incidente CLOSED puede reabrirse a REVIEWING solo por un administrador de comunidad o guardia autorizado.
- La reapertura de incidente requiere motivo obligatorio y auditoria.
- El creador del incidente no puede reabrir directamente un incidente cerrado en el MVP.
- En el MVP, los incidentes pueden tener comentarios o actualizaciones limitadas.
- Administradores de comunidad y guardias autorizados pueden agregar comentarios operativos a incidentes.
- El creador del incidente puede agregar informacion adicional mientras el incidente este OPEN o REVIEWING.
- Vecinos notificados que no crearon el incidente no pueden comentar por defecto.
- El chat vecinal queda fuera del MVP.

## Audit Rules

- En el MVP se debe auditar aprobacion y bloqueo de miembros, cambios de rol, gestion y revision de camaras, cambios de permisos de camara, visualizacion de camara en vivo, creacion y cambios de estado de incidentes, solicitudes de grabacion, SOS, y subida o visualizacion de evidencia.
- Los logs de auditoria deben registrar al menos actor, comunidad, accion, entidad afectada y fecha/hora.
- En el MVP no hay borrado automatico de logs de auditoria ni evidencia.
- Los logs de auditoria se conservan indefinidamente hasta definir una politica de retencion futura.

## Evidence Rules

- La evidencia de imagenes se conserva mientras el incidente este abierto o en revision; al cerrar el incidente se mantiene salvo eliminacion manual autorizada.
- Las entidades sensibles deben prepararse para soft delete cuando aplique.

## Data Conventions

- Los identificadores persistentes del MVP deben usar UUID en base de datos.
- La UI puede ofrecer presets de permisos, pero no debe otorgar acceso automatico sin confirmacion del dueno.
- Nunca mostrar camaras sin validar comunidad, rol, permisos, horario permitido y estado de camara.
- Las URLs RTSP y configuraciones tecnicas sensibles no deben exponerse al frontend.
- En el MVP, solo el dueno de camara ingresa o actualiza la URL RTSP/configuracion tecnica sensible de su camara.
- La URL RTSP/configuracion tecnica sensible debe guardarse cifrada o protegida en backend.
- Despues de guardada, la URL RTSP no debe mostrarse completa; si debe cambiarse, se reemplaza.
- El administrador de comunidad solo ve estado tecnico resumido de una camara, como configurada, pendiente o error.
- El streamKey o identificador de stream tambien se considera dato sensible.
- El streamKey no debe ser enumerable ni predecible.
- El streamKey debe almacenarse como hash cuando solo se necesite validar identidad del stream; el frontend debe operar con URL o token temporal autorizado.
- El frontend debe recibir preferentemente una URL o token temporal autorizado para WebRTC, no el streamKey crudo.
- En el MVP, los horarios de permisos de camara se modelan como rangos horarios simples; reglas por dia o calendarios complejos quedan para iteraciones futuras.

## MVP Scope

- El MVP no incluye IA; la prioridad es validar colaboracion segura entre vecinos.
- El primer corte funcional del MVP debe ser un tracer bullet de punta a punta que valide creacion de comunidad por plataforma, invitacion, aprobacion de vecino, registro y revision de camara, permiso explicito, live view autorizado, incidente, alerta interna, solicitud de grabacion manual y auditoria.

## Relationships

- Un **Usuario** pertenece a una sola **Comunidad** mediante un **Miembro de comunidad** en el MVP.
- Un **Miembro de comunidad** tiene un rol: **Vecino**, **Administrador de comunidad** o **Guardia**.
- Un **Usuario** puede tener un rol global de **Administrador de plataforma** independiente de su membresia comunitaria.
- Una **Comunidad** contiene miembros, camaras, permisos, incidentes, solicitudes de grabacion, alertas y logs.
- Una **Comunidad** puede tener cero o mas **Sectores comunitarios**.
- Un **Miembro de comunidad**, una **Camara comunitaria**, un **Incidente** o un **SOS** pueden asociarse a un **Sector comunitario**.
- Una **Comunidad** es creada por un **Administrador de plataforma** y recibe un primer **Administrador de comunidad**.
- Una **Camara comunitaria** pertenece a una comunidad y tiene un **Dueno de camara**.
- Un **Permiso de camara** pertenece a una camara y autoriza un rol o usuario especifico.
- Un **Incidente** pertenece a una comunidad y puede generar **Alertas** y **Solicitudes de grabacion**.
- Una **Solicitud de grabacion** conecta un incidente, una camara, un solicitante y el dueno de la camara.

## Architecture Notes

- Mantener limites claros entre dominio, UI, persistencia, autenticacion e integraciones externas.
- Preferir modulos profundos con interfaces simples sobre helpers superficiales dispersos.
- Documentar decisiones arquitectonicas durables en `docs/adr/`.
- Separar plataforma web, API/backend, base de datos, servidor de medios y sistema de notificaciones.
- Next.js debe encargarse de interfaz, permisos, usuarios, comunidades, incidentes, solicitudes y paneles.
- La logica critica de dominio del MVP debe vivir en servicios de dominio reutilizables y Route Handlers/API, no dispersa en componentes UI.
- Server Actions pueden usarse como capa fina para formularios simples, llamando servicios de dominio internos.
- Permisos, camaras, incidentes, solicitudes, alertas y evidencia deben pasar por servicios de dominio testeables.
- Next.js no debe procesar video directamente.
- MediaMTX es la primera opcion para servidor de medios; go2rtc es alternativa.
- La arquitectura de streaming recomendada es Camara IP/DVR/NVR -> RTSP -> MediaMTX -> WebRTC -> navegador.
- En el MVP, los streams deben estar configurados previamente en el servidor de medios; la app solo autoriza acceso WebRTC.
- Next.js nunca entrega RTSP al frontend; solo entrega identificadores o URLs WebRTC seguras para usuarios autorizados.
- Si un stream esta offline, la app debe mostrar camara no disponible y no intentar controlar fisicamente el DVR/NVR.
- Usar Socket.IO para eventos en tiempo real del MVP.
- Socket.IO debe correr como un servicio Node separado de Next.js en el MVP.
- Next.js no debe alojar conexiones persistentes de Socket.IO en un despliegue serverless.
- Next.js y el servicio realtime comparten la base de datos y las reglas de autorizacion del dominio.
- El servidor de tiempo real debe validar membresia ACTIVE antes de unir usuarios a rooms.
- Las rooms de tiempo real deben separarse por comunidad, sector comunitario y rol cuando corresponda.
- Usar Firebase Cloud Messaging para notificaciones push cuando se incorporen.
- En el MVP inicial, las alertas son internas en tiempo real mediante Socket.IO.
- Firebase Cloud Messaging queda para una iteracion posterior, no para el primer MVP funcional.
- Usar storage externo para clips o evidencias si se guardan archivos: S3, Cloudflare R2 o Supabase Storage.

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS y shadcn/ui para componentes visuales.
- Backend inicial: Next.js API Routes o Server Actions.
- Si el backend crece, evaluar migrar logica a NestJS.
- Base de datos MVP: Supabase Postgres con Prisma ORM.
- Autenticacion MVP: Supabase Auth.
- Streaming: MediaMTX como primera opcion; go2rtc como alternativa.
- Tiempo real MVP: Socket.IO.
- Storage MVP para evidencia de imagenes: Supabase Storage.
- Push posterior al MVP inicial: Firebase Cloud Messaging.

## Conventions

- Explorar antes de editar.
- Hacer el cambio minimo correcto.
- Agregar o actualizar tests cuando el cambio modifique comportamiento.
- Leer `DESIGN.md` antes de cambios visuales o de componentes.
- Registrar decisiones durables aqui o en un ADR.

## Open Questions

- Definir comandos de verificacion del proyecto.
