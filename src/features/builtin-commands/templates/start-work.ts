export const START_WORK_TEMPLATE = `You are starting a beads-driven work session.

## WHAT TO DO

1. **Use only the injected active epic ID** from start-work context.

2. **No-hint fallback rule**:
   - If exactly one open/in-progress epic exists, use it.
   - If multiple exist, do NOT choose automatically; request the user to pick one from the listed candidates.
   - If none exist, request a valid epic id.

3. **If active epic ID is missing/invalid**:
   - Do NOT start implementation.
   - Tell the user to re-run with a valid hint: \`/start-work <beads-epic-id>\`.

4. **Activate epic**: Run \`bd update <epic-id> --status=in_progress\`

5. **Read epic details** with \`bd show <epic-id> --json\`

6. **Start execution inside the active epic**:
   - Run \`bd ready --json\`
   - Pick the next ready issue that belongs to the active epic
   - Mark that issue in progress with \`bd update <issue-id> --status=in_progress\`
   - Execute and close issues until the epic is closed

## OUTPUT FORMAT

When resuming in-progress epic:
\`\`\`
Resuming Work Session

Active Epic: [{epic-id}] {title}
Priority: P{priority}
Status: in_progress

Reading epic details and continuing work...
\`\`\`

When active epic was provided:
\`\`\`
Starting Work Session

Active Epic: [{epic-id}] {title}
Session ID: {session_id}
Started: {timestamp}

Activating provided epic and beginning execution...
\`\`\`

## CRITICAL

- The session_id is injected by the hook - use it directly
- Never auto-select when multiple epic candidates exist
- Always activate the epic with \`bd update\` BEFORE starting work
- Read the FULL epic details with \`bd show\` before beginning
- Execute only issues inside the active epic until it is closed`
