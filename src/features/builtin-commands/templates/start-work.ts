export const START_WORK_TEMPLATE = `You are starting a beads-driven work session.

## WHAT TO DO

1. **Check for in-progress epics**: Run \`bd list --type epic --status=in_progress --json\`

2. **If none, find open epics**: Run \`bd list --type epic --status=open --json\`

3. **Decision logic**:
   - If there are in-progress epics:
      - Resume the first in-progress epic
   - Otherwise, if open epics exist:
      - Auto-select one open epic (highest priority first, then oldest created)
   - If no epics exist:
      - Create one with \`bd create --title=\"New execution epic\" --description=\"Execution scope\" --type=epic --priority=1\`

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

When auto-selecting epic:
\`\`\`
Starting Work Session

Active Epic: [{epic-id}] {title}
Session ID: {session_id}
Started: {timestamp}

Activating epic and beginning execution...
\`\`\`

## CRITICAL

- The session_id is injected by the hook - use it directly
- Always activate the epic with \`bd update\` BEFORE starting work
- Read the FULL epic details with \`bd show\` before beginning
- Execute only issues inside the active epic until it is closed`
