import { VERIFICATION_REMINDER } from "./system-reminder-templates"

function buildVerificationReminder(sessionId: string): string {
  return `${VERIFICATION_REMINDER}

---

**If ANY verification fails, use this immediately:**
\`\`\`
task(session_id="${sessionId}", prompt="fix: [describe the specific failure]")
\`\`\`
`
}

export function buildOrchestratorReminder(
  workItemLabel: string,
  sessionId: string,
  progress?: { total: number; completed: number }
): string {
  const hasProgress = progress !== undefined && progress.total > 0
  const remaining = hasProgress ? progress.total - progress.completed : undefined
  const progressLine = hasProgress
    ? `**WORK PROGRESS:** Work item: \`${workItemLabel}\` | ${progress.completed}/${progress.total} done | ${remaining} remaining`
    : `**WORK ITEM:** \`${workItemLabel}\``

  const completionSummary =
    remaining !== undefined
      ? `**${remaining} tasks remain. Keep working.**`
      : "**Continue with the next ready issue in the active epic. Keep working.**"

  return `
---

${progressLine}

---

${buildVerificationReminder(sessionId)}

**STEP 5: READ SUBAGENT NOTEPAD (LEARNINGS, ISSUES, PROBLEMS)**

The subagent was instructed to record findings in notepad files. Read them NOW:
\`\`\`
Glob(".sisyphus/notepads/${workItemLabel}/*.md")
\`\`\`
Then \`Read\` each file found — especially:
- **learnings.md**: Patterns, conventions, successful approaches discovered
- **issues.md**: Problems, blockers, gotchas encountered during work
- **problems.md**: Unresolved issues, technical debt flagged

**USE this information to:**
- Inform your next delegation (avoid known pitfalls)
- Adjust your plan if blockers were discovered
- Propagate learnings to subsequent subagents

**STEP 6: CHECK WORK PROGRESS DIRECTLY (EVERY TIME — NO EXCEPTIONS)**

Do NOT rely on cached progress. Run these NOW:
\`\`\`
bd list --status=in_progress
bd ready
bd blocked
\`\`\`
This is YOUR ground truth. Use it to decide what comes next.

**STEP 7: MARK COMPLETION (IMMEDIATELY)**

RIGHT NOW - Do not delay. Verification passed → Mark IMMEDIATELY.

Update issue tracking immediately:
- Close the completed issue with \`bd close <id>\`
- If follow-up work remains, claim the next ready issue in the active epic with \`bd update <id> --status=in_progress\`

**DO THIS BEFORE ANYTHING ELSE. Unmarked = Untracked = Lost progress.**

**STEP 8: COMMIT ATOMIC UNIT**

- Stage ONLY the verified changes
- Commit with clear message describing what was done

**STEP 9: PROCEED TO NEXT TASK**

- Run \`bd ready\` AGAIN to identify the next available issue in the active epic
- Start immediately - DO NOT STOP

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${completionSummary}`
}

export function buildStandaloneVerificationReminder(sessionId: string): string {
  return `
---

${buildVerificationReminder(sessionId)}

**STEP 5: CHECK YOUR PROGRESS DIRECTLY (EVERY TIME — NO EXCEPTIONS)**

Do NOT rely on memory or cached state. Run \`bd show <ACTIVE_EPIC_ID> --json\` and \`bd ready\` NOW to see exact current state.
Count open vs closed issues inside the active epic. This is your ground truth for what comes next.

**STEP 6: UPDATE ISSUE STATUS (IMMEDIATELY)**

RIGHT NOW - Do not delay. Verification passed → Mark IMMEDIATELY.

1. Run \`bd show <ACTIVE_EPIC_ID> --json\` and identify active in-progress issues in this epic
2. Close the completed issue with \`bd close <id>\`

**DO THIS BEFORE ANYTHING ELSE. Unclosed = Untracked = Lost progress.**

**STEP 7: EXECUTE QA TASKS (IF ANY)**

If QA issues exist in your issue list:
- Execute them BEFORE proceeding
- Close each QA issue after successful verification

**STEP 8: PROCEED TO NEXT READY ISSUE IN ACTIVE EPIC**

- Run \`bd ready\` AGAIN to identify the next available issue
- Start immediately - DO NOT STOP

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**NO ISSUE = NO TRACKING = INCOMPLETE WORK. Use bd create aggressively.**`
}
