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

4. **Use preloaded context**:
   - The hook already ran \`bd update <epic-id> --status=in_progress\`
   - The hook already injected \`bd show <epic-id> --json\`
   - The hook already injected \`bd ready --json\`
   - The hook already injected \`bd list --status=in_progress --json\`

5. **Start execution inside the active epic**:
   - Use all ready issues that belong to the active epic
   - Parallelize all currently ready independent issues in one delegation wave
   - Run sequentially only when dependencies or file conflicts require ordering
   - For in-progress issues in the active epic with no workers assigned, delegate them immediately
   - Delegate each selected issue and require the executing subagent to claim it with \`bd update <issue-id> --status=in_progress\`
   - Execute and close issues until the epic is closed

## OUTPUT FORMAT

When resuming in-progress epic:
\`\`\`
Resuming Work Session

Active Epic: [{epic-id}] {title}
Priority: P{priority}
Status: in_progress

Using preloaded epic details and continuing work...
\`\`\`

When active epic was provided:
\`\`\`
Starting Work Session

Active Epic: [{epic-id}] {title}
Session ID: {session_id}
Started: {timestamp}

Using preloaded epic/ready context and beginning execution...
\`\`\`

## CRITICAL

- The session_id is injected by the hook - use it directly
- EXECUTION-ONLY RULE: Never ask for plan submission or approval during /start-work execution.
- Never auto-select when multiple epic candidates exist
- Treat injected \`bd show\` and \`bd ready\` outputs as ground truth
- Execute only issues inside the active epic until it is closed`
