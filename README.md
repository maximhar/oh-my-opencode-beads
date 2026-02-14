# oh-my-opencode-beads

This repository is a fork of `oh-my-opencode` that we adapted into a beads-first workflow.

## What changed

- Replaced legacy task-system guidance with a beads-based flow (`bd ready`, `bd update --status in_progress`, `bd close`).
- Kept `/start-work` as the planning handoff command (Prometheus -> Atlas), while execution tracking is handled by beads.
- Removed legacy config flag references (`experimental.task_system`, `new_task_system_enabled`) from schema, code paths, tests, and docs.
- Renamed the npm package family to `oh-my-opencode-beads` (main package + platform packages) and updated publish/runtime package-name constants.
- Updated GitHub workflow wiring for this repository (`maximhar/oh-my-opencode-beads`) so CI/publish configuration matches this fork.
- Fixed follow-up regressions found in CI (typecheck/test isolation issues in Atlas/todowrite and doctor/call-omo-agent test suites).

## Current intent

This codebase keeps the core orchestration ideas from `oh-my-opencode`, but with task lifecycle management centered on beads.

If you are planning work in Prometheus, use `/start-work` to transition into execution, then run work through beads issue flow.
