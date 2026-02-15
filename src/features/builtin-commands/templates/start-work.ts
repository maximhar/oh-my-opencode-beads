export const START_WORK_TEMPLATE = `You are starting a beads-driven work session.

## WHAT TO DO

1. **Check for in-progress issues**: Run \`bd list --status=in_progress --json\` to find work already claimed

2. **Find available work**: Run \`bd ready --json\` to list issues with no blockers

3. **Decision logic**:
   - If there are in-progress issues:
      - Resume work on the first in-progress issue
   - Otherwise, if ready issues exist:
      - Auto-select one ready issue (highest priority first, then oldest created)
   - If no ready issues:
      - Check \`bd blocked --json\` for blocked work
      - Continue execution by resolving blockers (resolve or create/claim prerequisite work)

4. **Claim work**: Run \`bd update <id> --status=in_progress\` to claim the selected issue

5. **Read issue details** with \`bd show <id> --json\` and start executing the work

## OUTPUT FORMAT

When resuming in-progress work:
\`\`\`
Resuming Work Session

Active Issue: [{issue-id}] {title}
Priority: P{priority}
Status: in_progress

Reading issue details and continuing work...
\`\`\`

When auto-selecting single issue:
\`\`\`
Starting Work Session

Issue: [{issue-id}] {title}
Session ID: {session_id}
Started: {timestamp}

Claiming issue and beginning execution...
\`\`\`

## CRITICAL

- The session_id is injected by the hook - use it directly
- Always claim the issue with \`bd update\` BEFORE starting work
- Read the FULL issue details with \`bd show\` before beginning
- Close issues with \`bd close <id>\` when work is complete`
