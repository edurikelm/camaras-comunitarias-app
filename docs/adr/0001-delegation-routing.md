# ADR-0001: Routing de delegacion entre orquestador y subagentes

## Status

Aceptado

## Context

El orquestador debe delegar a subagentes cuando aporte velocidad, cobertura o calidad, pero no todo cambio merece el mismo costo de coordinacion.

El riesgo depende del dominio tocado y de si el cambio altera comportamiento observable por el usuario, no del numero de lineas modificadas.

## Decision

Adoptar un modelo de tres niveles basado en riesgo.

### Nivel 1 - Cosmetico

Cambios de estilo, layout, espaciado, tipografia, color, animaciones puras o refactors sin cambio de comportamiento.

Flujo:
- El orquestador ejecuta directo.
- Verifica con typecheck, tests existentes relevantes y validacion visual cuando aplique.
- Sin subagentes.

### Nivel 2 - Comportamiento o dominio no critico

Features con estado, validaciones nuevas, CRUDs, refactors de modulos, nuevos endpoints o componentes con condicionales que afectan lo que el usuario ve.

Flujo:
- El orquestador plantea el plan.
- `implementer` ejecuta con brief claro.
- `reviewer` revisa el resultado.
- `tester` es opcional cuando el cambio introduce logica testeable.

### Nivel 3 - Dominio critico

Cambios en autenticacion, permisos, privacidad, evidencia, alertas, integraciones, disponibilidad, datos sensibles, migraciones destructivas o auditoria.

Flujo:
- `architect` revisa el diseno si hay ambiguedad sobre limites de dominio.
- `implementer` ejecuta.
- `tester` valida con escenarios reproducibles.
- `reviewer` revisa con foco en seguridad, idempotencia, manejo de errores y regresiones.

## Criterios Objetivos

Es Nivel 1 solo si todas estas son verdaderas:
- No cambia comportamiento observable.
- No introduce ni modifica hooks, estado, handlers de eventos o reglas condicionales.
- No modifica endpoints, server actions, queries ni persistencia.
- No toca autenticacion, permisos, privacidad, evidencia, alertas o integraciones.

Si cualquiera falla, es Nivel 2 como minimo.

Es Nivel 3 si toca:
- Autenticacion, autorizacion, roles o permisos.
- Datos sensibles, evidencia, eventos o alertas.
- Integraciones externas o webhooks.
- Migraciones destructivas o constraints que afectan datos existentes.
- Auditoria, trazabilidad o disponibilidad.

## Consequences

### Positive

- Criterio explicito para decidir delegacion.
- Reduce sobre-delegacion en cambios cosmeticos.
- Reduce sub-delegacion en cambios riesgosos.

### Negative

- El orquestador debe clasificar antes de actuar.
- Algunos cambios limite requieren juicio y deben escalar si hay duda.
