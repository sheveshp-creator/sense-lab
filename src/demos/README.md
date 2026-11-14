# Playground demos

Each demo is a folder here (`model.ts` for the logic, `actions.ts` for the gesture/button/key declarations, `Demo.tsx` for the view) plus one line in `registry.ts`.

Rule: demos use only `core/frameStore` and `events/bus`. They never import a model, the worker or the pipeline (`tests/demoRules.test.ts` enforces this).
Every gesture action is declared once in `actions.ts` and rendered as a button and a keyboard shortcut by `ActionBar`.
