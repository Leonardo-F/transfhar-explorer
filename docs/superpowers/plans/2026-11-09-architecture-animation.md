# Architecture Animation Implementation Plan

> Implement natively in this session, task by task.

**Goal:** Animate the reported TransfHAR module topology and trace patch-to-token arithmetic.
**Architecture:** Isolate deterministic numerical teaching examples in neural-model.mjs; keep SVG rendering and playback in neural-flow.mjs. Integrate with the existing model state and offline builder.
**Tech Stack:** ES modules, native SVG/SMIL, HTML/CSS, Python offline bundler, Node tests.
**Spec:** ../specs/2026-11-09-architecture-animation-design.md

## Global Constraints

No new browser runtime dependencies; reported dimensions above; all numbers from example weights labeled; maintain offline build and third-party notices.

## Review Focus

Masked token cannot enter attention; channel-major token ordering; 3-axis clamp; autoplay cannot reset through cross-tab callbacks; controls retain focus and stop while hidden.

### Task 1: Computational teaching model
- [x] Create neural-model.mjs with getArchitectureModel, patchProjection, positionExample, attentionExample, ffnExample, poolingExample; shared deterministic demo data and pipelineMask.
- [x] Tests: patch boundaries and shared weights, all 384 values, position additivity, exact attention normalization/mask exclusion and weighted sum, residual/FFN dimensions, pool/classifier dimensions, 3/6 axes and modes.

### Task 2: Architecture rendering and controls
- [x] Rewrite neural-flow.mjs: overview topology, per-stage enlarged SVG, numerical cards, complete token map, transformer expansion, play/pause/speed, manual selection.
- [x] Tests: stage lists per mode, DOM interactions, focus, playback visibility and destruction.

### Task 3: Integration and delivery
- [x] Update app.js state sync, style.css responsive layout, build_offline.py dependencies and original MIT notice; regenerate HTML.
- [x] Update README and VERIFICATION. Run existing/new tests, syntax checks and offline extraction. Inspect stage SVG renders and UI with available tools. Push sources, tests and rebuilt HTML; verify remote blob equality.
