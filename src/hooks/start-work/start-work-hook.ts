import type { PluginInput } from "@opencode-ai/plugin"
import { execFileSync } from "node:child_process"
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
 * Best-effort extraction of an epic hint from the user-request tag.
 * Returns a cleaned string (beads epic ID, partial title, etc.) or null.
 */
function extractEpicHint(promptText: string): string | null {
  const userRequestMatch = promptText.match(/<user-request>\s*([\s\S]*?)\s*<\/user-request>/i)
  if (!userRequestMatch) return null

  const rawArg = userRequestMatch[1].trim()
  if (!rawArg) return null

  const cleanedArg = rawArg.replace(KEYWORD_PATTERN, "").trim()
  return cleanedArg || null
}

interface BeadsIssue {
  id: string
  title?: string
  status?: string
  type?: string
}

function runBdJson(directory: string, args: string[]): unknown {
  const rawOutput = execFileSync("bd", [...args, "--json"], {
    cwd: directory,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  })
  return JSON.parse(rawOutput)
}

function readEpicList(directory: string, status?: "open" | "in_progress"): BeadsIssue[] {
  try {
    const args = status ? ["list", "--type", "epic", "--status", status] : ["list", "--type", "epic"]
    const parsed = runBdJson(directory, args)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is BeadsIssue => !!item && typeof item === "object" && !Array.isArray(item) && typeof (item as { id?: unknown }).id === "string")
  } catch {
    return []
  }
}

function readEpicByHint(directory: string, hint: string): BeadsIssue | null {
  try {
    const parsed = runBdJson(directory, ["show", hint])
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    const asIssue = parsed as BeadsIssue
    if (typeof asIssue.id !== "string") return null
    if (asIssue.type && asIssue.type !== "epic") return null
    return asIssue
  } catch {
    const allEpics = readEpicList(directory)
    const loweredHint = hint.toLowerCase()
    return allEpics.find((epic) => epic.id === hint || epic.title?.toLowerCase().includes(loweredHint)) ?? null
  }
}

function selectActiveEpic(directory: string): BeadsIssue | null {
  const inProgressEpics = readEpicList(directory, "in_progress")
  if (inProgressEpics.length > 0) {
    return inProgressEpics[0]
  }

  const openEpics = readEpicList(directory, "open")
  if (openEpics.length > 0) {
    return openEpics[0]
  }

  return null
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

      const epicHint = extractEpicHint(promptText)
      const existingState = readActiveWorkState(ctx.directory)

      if (existingState && !epicHint) {
        // Resume existing active work session
        appendActiveWorkSessionId(ctx.directory, sessionId)
        const epicLabel = existingState.active_epic_id
          ? `${existingState.active_epic_id}${existingState.active_epic_title ? ` – ${existingState.active_epic_title}` : ""}`
          : "unknown"

        contextInfo = `
## Resuming Active Work Session

**Active Epic**: ${epicLabel}
**Sessions**: ${existingState.session_ids.length + 1} (current session appended)
**Started**: ${existingState.started_at}

Run \`bd show ${existingState.active_epic_id || "<epic-id>"}\` to review the epic, then continue working.
Check progress with \`bd show ${existingState.active_epic_id || "<epic-id>"} --json\`.
Choose work only from this active epic.`
      } else if (epicHint) {
        const hintedEpic = readEpicByHint(ctx.directory, epicHint)
        const resolvedEpicId = hintedEpic?.id ?? epicHint
        const resolvedEpicTitle = hintedEpic?.title ?? null
        const newState = createActiveWorkState(sessionId, resolvedEpicId, resolvedEpicTitle, "atlas")
        writeActiveWorkState(ctx.directory, newState)

        contextInfo = `
## Starting Work on Specified Epic

**Epic hint**: ${epicHint}
**Active Epic**: ${resolvedEpicId}${resolvedEpicTitle ? ` – ${resolvedEpicTitle}` : ""}
**Session ID**: ${sessionId}
**Started**: ${timestamp}

Resolve and activate the epic:
1. Run \`bd show ${resolvedEpicId} --json\` to confirm this epic.
2. If status is \`open\`, mark it active: \`bd update ${resolvedEpicId} --status in_progress\`.
3. Run \`bd ready\` and pick the next ready issue inside this epic.
4. Begin implementation.`
      } else {
        const selectedEpic = selectActiveEpic(ctx.directory)
        if (selectedEpic) {
          const newState = createActiveWorkState(sessionId, selectedEpic.id, selectedEpic.title ?? null, "atlas")
          writeActiveWorkState(ctx.directory, newState)

          contextInfo = `
## Starting Work Session

**Active Epic**: ${selectedEpic.id}${selectedEpic.title ? ` – ${selectedEpic.title}` : ""}
**Session ID**: ${sessionId}
**Started**: ${timestamp}

Epic selected automatically:
1. Run \`bd show ${selectedEpic.id} --json\`.
2. If needed, activate it with \`bd update ${selectedEpic.id} --status in_progress\`.
3. Run \`bd ready\` and execute the next ready issue from this epic.
4. Continue until the epic is closed.`
        } else {
          const newState = createActiveWorkState(sessionId, null, null, "atlas")
          writeActiveWorkState(ctx.directory, newState)

          contextInfo = `
## Discover Available Epic

**Session ID**: ${sessionId}
**Started**: ${timestamp}

No active epic found. Initialize one deterministically:

1. Run \`bd list --type epic --status=in_progress\`.
2. If empty, run \`bd list --type epic --status=open\`.
3. If still empty, create one now: \`bd create --title="New execution epic" --description="Execution scope" --type=epic --priority=1\`.
4. Set epic active: \`bd update <epic-id> --status in_progress\`.
5. Re-run \`/start-work\` to persist this active epic.`
        }
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
        epicHint,
      })
    },
  }
}
