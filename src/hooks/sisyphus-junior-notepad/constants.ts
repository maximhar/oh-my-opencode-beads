export const HOOK_NAME = "sisyphus-junior-notepad"

export const NOTEPAD_DIRECTIVE = `
<Work_Context>
## Notepad Location (for recording learnings)
NOTEPAD PATH: .sisyphus/notepads/{plan-name}/
- learnings.md: Record patterns, conventions, successful approaches
- issues.md: Record problems, blockers, gotchas encountered
- decisions.md: Record architectural choices and rationales
- problems.md: Record unresolved issues, technical debt

You SHOULD append findings to notepad files after completing work.
IMPORTANT: Always APPEND to notepad files - never overwrite or use Edit tool.

## Work Item Source (READ ONLY)
WORK ITEM: beads issue id/title

CRITICAL RULE: NEVER MODIFY THE WORK ITEM DEFINITION DIRECTLY

The work item definition is SACRED and READ-ONLY.
- You may READ issue context to understand tasks and their status
- You may READ task items to know what to do
- You MUST NOT edit, modify, or rewrite the plan-of-record directly
- You MUST NOT mark tasks as complete outside beads issue state
- Only the Orchestrator manages issue state (via \`bd close\`)

VIOLATION = IMMEDIATE FAILURE. The Orchestrator tracks work state via beads issues.
</Work_Context>
`
