# Task System

Oh My OpenCode's primary task management uses **beads** (`bd` CLI) for issue tracking with dependency management, cross-session persistence, and execution workflow.

## Beads: The Primary Workflow

Beads provides a git-synced issue graph with full dependency tracking. Issues persist across sessions and sync via git.

### Core Commands

| Command | Purpose |
|---------|---------|
| `bd create --title="..." --type=task` | Create an issue |
| `bd ready` | List issues with no unresolved blockers |
| `bd show <id>` | View issue details and dependencies |
| `bd update <id> --status in_progress` | Claim work |
| `bd close <id>` | Mark issue complete |
| `bd create --title="..." --type=task --deps blocks:<depends-on>` | Create issue with dependency |
| `bd blocked` | Show all blocked issues |
| `bd stats` | Project statistics |
| `bd sync` | Sync with git |

### Issue Schema

Issues support these fields:

- **id**: Auto-generated (e.g., `beads-001`)
- **title**: Short imperative description
- **type**: `task`, `bug`, `feature`
- **priority**: 0–4 (0=critical, 4=backlog)
- **status**: `open`, `in_progress`, `closed`
- **dependencies**: Explicit via `bd create --deps ...`
- **notes/design/description**: Rich metadata

### Dependencies and Execution Order

```
[Build Frontend]    ──┐
                      ├──→ [Integration Tests] ──→ [Deploy]
[Build Backend]     ──┘
```

- Issues with no blockers appear in `bd ready`
- Closing an issue automatically unblocks its dependents

### Example Workflow

```bash
bd create --title="Build frontend" --type=task         # beads-001
bd create --title="Build backend" --type=task          # beads-002
bd create --title="Run integration tests" --type=task --deps blocks:beads-001,blocks:beads-002  # beads-003
```

```bash
bd ready
# beads-001 [open] Build frontend        (no blockers)
# beads-002 [open] Build backend          (no blockers)

bd update beads-001 --status in_progress
# ... implement frontend ...
bd close beads-001

bd update beads-002 --status in_progress
# ... implement backend ...
bd close beads-002

bd ready
# beads-003 [open] Run integration tests  (unblocked!)
```

### Storage

Issues are stored in the `.beads/` directory and sync with git via `bd sync`.

### When to Use Beads

Use beads when:
- Work has multiple steps with dependencies
- Progress should persist across sessions
- You want visibility into what's blocked and what's ready
- Multiple agents or sessions will collaborate on work
