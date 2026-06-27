# Triage Labels

## Canonical Labels

- `bug`: comportamiento incorrecto o regresion.
- `feature`: nueva capacidad de producto.
- `chore`: mantenimiento sin cambio funcional directo.
- `docs`: documentacion, ADRs o contexto.
- `question`: falta informacion o decision humana.

## Severity

- `critical`: afecta seguridad, privacidad, permisos, evidencia, disponibilidad o datos sensibles.
- `high`: bloquea flujo principal.
- `medium`: afecta flujo importante con workaround.
- `low`: mejora menor o problema cosmetico.

## Rules

- No mezclar severidad con tipo.
- Si toca dominio critico, escalar revision aunque el cambio parezca pequeno.
