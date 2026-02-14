export const HOOK_NAME = "tasks-todowrite-disabler"
export const BLOCKED_TOOLS = ["TodoWrite", "TodoRead"]
export const REPLACEMENT_MESSAGE = `TodoRead/TodoWrite are DISABLED in this project.

**ACTION REQUIRED**: RE-REGISTER what you were about to track using beads (bd) NOW. Then CLAIM the issue and START WORKING immediately.

**Use bd commands instead:**
- bd create --title="..." --type=task|bug|feature --priority=2: Create new issue
- bd update <id> --status=in_progress: Claim work
- bd show <id>: View issue details
- bd close <id>: Mark complete

**Workflow:**
1. bd create --title="your task description" --type=task
2. bd update <id> --status=in_progress
3. DO THE WORK
4. bd close <id>

CRITICAL: 1 issue = 1 unit of work. Fire independent work concurrently.

**STOP! DO NOT START WORKING DIRECTLY - NO MATTER HOW SMALL THE TASK!**
Even if the task seems trivial (1 line fix, simple edit, quick change), you MUST:
1. FIRST register it with bd create
2. THEN mark it in_progress with bd update
3. ONLY THEN do the actual work
4. FINALLY close it with bd close

**WHY?** Issue tracking = visibility = accountability. Skipping registration = invisible work = chaos.

DO NOT retry TodoWrite. Convert to bd create NOW.`
