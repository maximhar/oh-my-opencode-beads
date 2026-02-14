import type { PluginInput } from "@opencode-ai/plugin"
import {
  readActiveWorkState,
  writeActiveWorkState,
  appendActiveWorkSessionId,
  createActiveWorkState,
} from "../../features/boulder-state"
import { log } from "../../shared/logger"
import { updateSessionAgent } from "../../features/claude-code-session-state"

export const HOOK_NAME = "start-work" as const

const KEYWORD_PATTERN = /\b(ultrawork|ulw)\b/gi

interface StartWorkHookInput {
  sessionID: string
  messageID?: string
}

interface StartWorkHookOutput {
  parts: Array<{ type: string; text?: string }>
}

/**
 * Best-effort extraction of an issue hint from the user-request tag.
 * Returns a cleaned string (beads issue ID, partial title, etc.) or null.
 */
function extractIssueHint(promptText: string): string | null {
  const userRequestMatch = promptText.match(/<user-request>\s*([\s\S]*?)\s*<\/user-request>/i)
  if (!userRequestMatch) return null

  const rawArg = userRequestMatch[1].trim()
  if (!rawArg) return null

  const cleanedArg = rawArg.replace(KEYWORD_PATTERN, "").trim()
  return cleanedArg || null
}

export function createStartWorkHook(ctx: PluginInput) {
  return {
    "chat.message": async (
      input: StartWorkHookInput,
      output: StartWorkHookOutput
    ): Promise<void> => {
      const parts = output.parts
      const promptText = parts
        ?.filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join("\n")
        .trim() || ""

      // Only trigger on actual command execution (contains <session-context> tag)
      const isStartWorkCommand = promptText.includes("<session-context>")

      if (!isStartWorkCommand) {
        return
      }

      log(`[${HOOK_NAME}] Processing start-work command`, {
        sessionID: input.sessionID,
      })

      updateSessionAgent(input.sessionID, "atlas") // Always switch: fixes #1298

      const sessionId = input.sessionID
      const timestamp = new Date().toISOString()

      let contextInfo = ""

      const issueHint = extractIssueHint(promptText)
      const existingState = readActiveWorkState(ctx.directory)

      if (existingState && !issueHint) {
        // Resume existing active work session
        appendActiveWorkSessionId(ctx.directory, sessionId)
        const issueLabel = existingState.active_issue_id
          ? `${existingState.active_issue_id}${existingState.active_issue_title ? ` – ${existingState.active_issue_title}` : ""}`
          : "unknown"

        contextInfo = `
## Resuming Active Work Session

**Active Issue**: ${issueLabel}
**Sessions**: ${existingState.session_ids.length + 1} (current session appended)
**Started**: ${existingState.started_at}

Run \`bd show ${existingState.active_issue_id || "<issue-id>"}\` to review the issue, then continue working.
Check progress with \`bd list --status=in_progress\`.`
      } else if (issueHint) {
        // User provided an issue hint — create fresh work state
        const newState = createActiveWorkState(sessionId, issueHint, null, "atlas")
        writeActiveWorkState(ctx.directory, newState)

        contextInfo = `
## Starting Work on Specified Issue

**Issue hint**: ${issueHint}
**Session ID**: ${sessionId}
**Started**: ${timestamp}

Resolve the issue using beads:
1. Run \`bd show ${issueHint}\` to find and review the issue (try exact ID or search by title).
2. If the hint doesn't match an ID exactly, run \`bd ready --json\` and pick the closest match.
3. Mark it in-progress: \`bd update <id> --status in_progress\`
4. Begin implementation.`
      } else {
        // No existing state, no hint — discover work from beads queue
        const newState = createActiveWorkState(sessionId, null, null, "atlas")
        writeActiveWorkState(ctx.directory, newState)

        contextInfo = `
## Discover Available Work

**Session ID**: ${sessionId}
**Started**: ${timestamp}

No active work session found. Use beads to find and start work:

1. Run \`bd ready\` to see issues with no blockers.
2. If no ready issues, run \`bd list --status=open\` for all open work.
3. Pick an issue and mark it in-progress: \`bd update <id> --status in_progress\`
4. Begin implementation.

If there are no issues at all, ask the user what they'd like to work on and create one:
\`bd create --title="..." --type=task --priority=2\``
      }

      const idx = output.parts.findIndex((p) => p.type === "text" && p.text)
      if (idx >= 0 && output.parts[idx].text) {
        output.parts[idx].text = output.parts[idx].text
          .replace(/\$SESSION_ID/g, sessionId)
          .replace(/\$TIMESTAMP/g, timestamp)

        output.parts[idx].text += `\n\n---\n${contextInfo}`
      }

      log(`[${HOOK_NAME}] Context injected`, {
        sessionID: input.sessionID,
        hasExistingState: !!existingState,
        issueHint,
      })
    },
  }
}
