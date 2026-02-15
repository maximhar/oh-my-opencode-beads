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
  issue_type?: string
}

interface NoHintEpicResolution {
  kind: "single" | "multiple" | "none"
  epic?: BeadsIssue
  epics?: BeadsIssue[]
}

function runBdJson(directory: string, args: string[]): unknown {
  const rawOutput = execFileSync("bd", [...args, "--json"], {
    cwd: directory,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  })
  return JSON.parse(rawOutput)
}

function normalizeBdShowResult(parsed: unknown): BeadsIssue | null {
  const normalized = Array.isArray(parsed) ? parsed[0] : parsed
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return null
  }
  const asIssue = normalized as BeadsIssue
  return typeof asIssue.id === "string" ? asIssue : null
}

function isEpicIssue(issue: BeadsIssue): boolean {
  const issueType = issue.type ?? issue.issue_type
  return !issueType || issueType === "epic"
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
    const asIssue = normalizeBdShowResult(parsed)
    if (!asIssue) return null
    if (!isEpicIssue(asIssue)) return null
    return asIssue
  } catch {
    const allEpics = readEpicList(directory)
    const loweredHint = hint.toLowerCase()

    const fuzzyMatches = allEpics.filter((epic) => {
      const id = epic.id.toLowerCase()
      const title = epic.title?.toLowerCase() ?? ""
      return (
        epic.id === hint ||
        id.includes(loweredHint) ||
        title.includes(loweredHint)
      )
    })

    return fuzzyMatches.length === 1 ? fuzzyMatches[0] : null
  }
}

function readEpicById(directory: string, epicId: string): BeadsIssue | null {
  try {
    const parsed = runBdJson(directory, ["show", epicId])
    const asIssue = normalizeBdShowResult(parsed)
    if (!asIssue) return null
    if (asIssue.id !== epicId) return null
    if (!isEpicIssue(asIssue)) return null
    return asIssue
  } catch {
    return null
  }
}

function resolveNoHintEpic(directory: string): NoHintEpicResolution {
  const inProgressEpics = readEpicList(directory, "in_progress")
  const openEpics = readEpicList(directory, "open")

  const byId = new Map<string, BeadsIssue>()
  for (const epic of [...inProgressEpics, ...openEpics]) {
    if (!byId.has(epic.id)) {
      byId.set(epic.id, epic)
    }
  }

  const candidates = Array.from(byId.values())
  if (candidates.length === 1) {
    return { kind: "single", epic: candidates[0] }
  }
  if (candidates.length > 1) {
    return { kind: "multiple", epics: candidates }
  }
  return { kind: "none" }
}

function formatEpicList(epics: BeadsIssue[]): string {
  return epics
    .map((epic, index) => {
      const title = epic.title ? ` – ${epic.title}` : ""
      const status = epic.status ? ` (${epic.status})` : ""
      return `${index + 1}. ${epic.id}${title}${status}`
    })
    .join("\n")
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
        const existingEpic = existingState.active_epic_id
          ? readEpicById(ctx.directory, existingState.active_epic_id)
          : null

        if (existingEpic) {
          appendActiveWorkSessionId(ctx.directory, sessionId)
          const epicLabel = `${existingEpic.id}${existingEpic.title ? ` – ${existingEpic.title}` : ""}`

          contextInfo = `
## Resuming Active Work Session

**Active Epic**: ${epicLabel}
**Sessions**: ${existingState.session_ids.length + 1} (current session appended)
**Started**: ${existingState.started_at}

Run \`bd show ${existingEpic.id}\` to review the epic, then continue working.
Check progress with \`bd show ${existingEpic.id} --json\`.
Choose work only from this active epic.`
        } else {
          const noHintResolution = resolveNoHintEpic(ctx.directory)
          if (noHintResolution.kind === "single" && noHintResolution.epic) {
            const resolvedEpic = noHintResolution.epic
            const newState = createActiveWorkState(sessionId, resolvedEpic.id, resolvedEpic.title ?? null, "atlas")
            writeActiveWorkState(ctx.directory, newState)

            contextInfo = `
## Starting Work Session

**Active Epic**: ${resolvedEpic.id}${resolvedEpic.title ? ` – ${resolvedEpic.title}` : ""}
**Session ID**: ${sessionId}
**Started**: ${timestamp}

Auto-resolved because exactly one open/in-progress epic exists.
1. Run \`bd show ${resolvedEpic.id} --json\`.
2. If status is \`open\`, activate it: \`bd update ${resolvedEpic.id} --status in_progress\`.
3. Run \`bd ready --json\` and execute the next ready issue inside this epic.`
          } else if (noHintResolution.kind === "multiple" && noHintResolution.epics) {
            contextInfo = `
## Cannot Start Work

Multiple open/in-progress epics were found. Do not choose one automatically.

Request the user to select one epic from this list and re-run \`/start-work <beads-epic-id>\`:
${formatEpicList(noHintResolution.epics)}`
          } else {
            contextInfo = `
## Cannot Start Work

No open/in-progress epic was resolved for this session.

Do not start implementation.
Ask the user to run \`/start-work <beads-epic-id>\` with a valid epic id.`
          }
        }
      } else if (epicHint) {
        const hintedEpic = readEpicByHint(ctx.directory, epicHint)
        if (!hintedEpic) {
          contextInfo = `
## Cannot Start Work

Failed to resolve epic hint to a valid beads epic id.

**Epic hint**: ${epicHint}

Do not start implementation.
Ask the user to re-run with a valid epic id, for example:
\`/start-work beads-123\``
        } else {
          const newState = createActiveWorkState(sessionId, hintedEpic.id, hintedEpic.title ?? null, "atlas")
          writeActiveWorkState(ctx.directory, newState)

          contextInfo = `
## Starting Work on Specified Epic

**Epic hint**: ${epicHint}
**Active Epic**: ${hintedEpic.id}${hintedEpic.title ? ` – ${hintedEpic.title}` : ""}
**Session ID**: ${sessionId}
**Started**: ${timestamp}

Resolve and activate the epic:
1. Run \`bd show ${hintedEpic.id} --json\` to confirm this epic.
2. If status is \`open\`, mark it active: \`bd update ${hintedEpic.id} --status in_progress\`.
3. Run \`bd ready --json\` and pick the next ready issue inside this epic.
4. Begin implementation.`
        }
      } else {
        const noHintResolution = resolveNoHintEpic(ctx.directory)
        if (noHintResolution.kind === "single" && noHintResolution.epic) {
          const resolvedEpic = noHintResolution.epic
          const newState = createActiveWorkState(sessionId, resolvedEpic.id, resolvedEpic.title ?? null, "atlas")
          writeActiveWorkState(ctx.directory, newState)

          contextInfo = `
## Starting Work Session

**Active Epic**: ${resolvedEpic.id}${resolvedEpic.title ? ` – ${resolvedEpic.title}` : ""}
**Session ID**: ${sessionId}
**Started**: ${timestamp}

Auto-resolved because exactly one open/in-progress epic exists.
1. Run \`bd show ${resolvedEpic.id} --json\`.
2. If status is \`open\`, activate it: \`bd update ${resolvedEpic.id} --status in_progress\`.
3. Run \`bd ready --json\` and execute the next ready issue inside this epic.`
        } else if (noHintResolution.kind === "multiple" && noHintResolution.epics) {
          contextInfo = `
## Cannot Start Work

Multiple open/in-progress epics were found. Do not choose one automatically.

Request the user to select one epic from this list and re-run \`/start-work <beads-epic-id>\`:
${formatEpicList(noHintResolution.epics)}`
        } else {
          contextInfo = `
## Cannot Start Work

No open/in-progress epic was resolved for this session.

Do not start implementation.
Ask the user to run \`/start-work <beads-epic-id>\` with a valid epic id.`
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
