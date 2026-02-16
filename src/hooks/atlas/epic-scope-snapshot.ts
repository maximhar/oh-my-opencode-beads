import { execFileSync } from "node:child_process"

type JsonRecord = Record<string, unknown>

export interface EpicScopeSnapshot {
  epicId: string
  readyIssues: JsonRecord[]
  blockedIssues: JsonRecord[]
  warning?: string
}

function runBdJson(directory: string, args: string[]): JsonRecord[] {
  const raw = execFileSync("bd", [...args, "--json"], {
    cwd: directory,
    encoding: "utf8",
  })
  const parsed: unknown = JSON.parse(raw)
  return Array.isArray(parsed) ? (parsed as JsonRecord[]) : []
}

export function buildEpicScopeSnapshot(directory: string, epicId: string): EpicScopeSnapshot {
  try {
    const readyIssues = runBdJson(directory, ["ready", "--parent", epicId])
    const blockedIssues = runBdJson(directory, ["blocked", "--parent", epicId])

    return {
      epicId,
      readyIssues,
      blockedIssues,
    }
  } catch {
    return {
      epicId,
      readyIssues: [],
      blockedIssues: [],
      warning:
        "Failed to preload epic-scoped `bd ready --json --parent <ACTIVE_EPIC_ID>` / `bd blocked --json --parent <ACTIVE_EPIC_ID>`.",
    }
  }
}
