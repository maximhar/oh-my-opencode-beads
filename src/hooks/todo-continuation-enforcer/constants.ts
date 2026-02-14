import { createSystemDirective, SystemDirectiveTypes } from "../../shared/system-directive"

export const HOOK_NAME = "todo-continuation-enforcer"

export const DEFAULT_SKIP_AGENTS = ["prometheus", "compaction"]

export const CONTINUATION_PROMPT = `${createSystemDirective(SystemDirectiveTypes.WORK_CONTINUATION)}

Incomplete work remains in your active issue queue. Continue working on the next ready issue.

- Proceed without asking for permission
- Mark each issue complete when finished (\`bd close <id>\`)
- Do not stop until active work is done`

export const COUNTDOWN_SECONDS = 2
export const TOAST_DURATION_MS = 900
export const COUNTDOWN_GRACE_PERIOD_MS = 500

export const ABORT_WINDOW_MS = 3000
export const CONTINUATION_COOLDOWN_MS = 30_000
