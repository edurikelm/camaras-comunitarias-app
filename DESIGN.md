# Camaras Comunitarias - Design

## Purpose

Este archivo define el sistema visual y las convenciones de UI del proyecto. Leer antes de tocar componentes, layout, estilos, responsive, dark mode o consistencia visual.

## Product Feel

- Claro, confiable y operativo.
- Priorizar legibilidad, jerarquia y accion rapida sobre decoracion.
- Evitar UI generica o intercambiable: el producto debe sentirse como una herramienta civica y de seguridad comunitaria.

## Layout

- Diseñar primero para flujos criticos: monitoreo, alertas, eventos, camaras y evidencia.
- Mantener informacion de alta prioridad visible sin sobrecargar la pantalla.
- En mobile, priorizar acciones primarias y lectura rapida.
- En desktop, aprovechar densidad con tablas, mapas, paneles o vistas divididas cuando aporte claridad.

## Components

- Usar shadcn/ui como base de componentes visuales del MVP.
- Componer componentes shadcn/ui antes de crear componentes visuales custom.
- Usar tokens semanticos del sistema (`background`, `foreground`, `primary`, `muted`, etc.) y variantes del componente antes de colores hardcodeados.
- Los estados vacio, carga, error y sin permisos son obligatorios en componentes que dependen de datos remotos.
- Las acciones destructivas o sensibles deben ser explicitas y reversibles cuando sea posible.
- Usar nombres de componentes basados en dominio, no en detalles visuales accidentales.

## Accessibility

- Mantener contraste suficiente.
- No depender solo del color para indicar severidad o estado.
- Asegurar foco visible y navegacion por teclado en acciones clave.

## Dark Mode

- Si el proyecto implementa dark mode, validar pantallas criticas en claro y oscuro.
- Evitar fondos con bajo contraste en tarjetas de evidencia, alertas o mapas.

## Verification

- Validar mobile y desktop para cambios visuales.
- Usar screenshot o Chrome DevTools cuando la tarea modifique layout, responsive o interacciones visuales.
