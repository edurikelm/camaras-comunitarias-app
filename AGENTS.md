# Camaras Comunitarias - Agents

## Session Protocol

Before any work, read `CONTEXT.md`. It is the source of truth for domain language, data model, business rules, tech stack, and project conventions.

## Domain Documentation

Camaras Comunitarias uses a single-context layout:

- `CONTEXT.md` at the repo root for domain language, rules, relationships, and implementation conventions.
- `DESIGN.md` at the repo root for UI design system, visual consistency, layout, component sizing, responsive rules, and dark mode.
- `docs/adr/` for architectural decisions.
- `docs/agents/` for agent workflow metadata.

When making or discovering a durable domain or architecture decision, update `CONTEXT.md` or add an ADR.

For UI, styling, layout, component, Tailwind, shadcn/ui, responsive, dark mode, or visual consistency work, read `DESIGN.md` before editing.

## Workflow Skills

Use the existing workflow skill when the task maps to one:

- `diagnose` for bugs, regressions, failing commands, broken behavior, or performance issues.
- `tdd` for behavior changes that need a safety net.
- `triage` for incoming bugs, feature requests, unclear issues, or issue workflow.
- `to-prd` for shaping a product idea into a requirement document.
- `to-issues` for breaking a PRD, plan, or feature into implementation tickets.
- `zoom-out` when broader system context is needed before deciding.
- `grill-with-docs` for domain terminology, naming, and decision clarification.
- `improve-codebase-architecture` for refactors, architectural analysis, or maintainability work.

Coordinate these skills with `CONTEXT.md`, GitHub Issues, and `docs/adr/`.

## Issue Tracker

Issues are tracked in GitHub Issues of the main repository unless `docs/agents/issue-tracker.md` says otherwise.

See `docs/agents/issue-tracker.md`.

## Triage Labels

This repo uses the canonical five-label triage vocabulary.

See `docs/agents/triage-labels.md`.

## Next.js Best Practices

When working on Next.js code, including pages, components, API routes, server actions, layouts, metadata, routing, or caching, load `next-best-practices` first.

## Delegation Routing

Antes de empezar una tarea, clasificala en uno de los tres niveles definidos en `docs/adr/0001-delegation-routing.md`:

- **Nivel 1 (cosmetico)**: el orquestador ejecuta directo, verifica con typecheck + tests + screenshot visual.
- **Nivel 2 (comportamiento / dominio no critico)**: `implementer` ejecuta, `reviewer` revisa.
- **Nivel 3 (dominio critico)**: `architect` + `implementer` + `tester` + `reviewer`.

Si hay duda entre Nivel 1 y Nivel 2, escalar hacia arriba. Ver ADR-0001 para los criterios completos.

## Artefactos De Verificacion

Screenshots, traces de performance, heap snapshots, archivos `.network-request`, `.network-response`, `.heapsnapshot` y otros generados durante la verificacion visual o de red no son parte del producto. Despues de usarlos, eliminarlos del worktree o moverlos a `C:\Users\eduri\AppData\Local\Temp\opencode` (directorio temporal pre-aprobado). Nunca dejarlos en la raiz del repo ni en `src/`.
