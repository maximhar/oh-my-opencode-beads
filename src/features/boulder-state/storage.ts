/**
 * Boulder State Storage
 *
 * Legacy boulder-state read/write functions are retained for backward
 * compatibility with atlas hooks and other consumers.
 *
 * New beads-oriented helpers (ActiveWorkState) are added for the
 * migrated start-work flow.
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs"
import { dirname, join, basename } from "node:path"
import type { BoulderState, PlanProgress, ActiveWorkState } from "./types"
import { BOULDER_DIR, BOULDER_FILE, PROMETHEUS_PLANS_DIR } from "./constants"

const ACTIVE_BEADS_STATUSES = new Set(["open", "in_progress"])
const CLOSED_BEADS_STATUS = "closed"

// ---------------------------------------------------------------------------
// Legacy boulder.json helpers (kept for backward compat)
// ---------------------------------------------------------------------------

export function getBoulderFilePath(directory: string): string {
  return join(directory, BOULDER_DIR, BOULDER_FILE)
}

export function readBoulderState(directory: string): BoulderState | null {
  const filePath = getBoulderFilePath(directory)

  if (!existsSync(filePath)) {
    return null
  }

  try {
    const content = readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null
    }
    if (!Array.isArray(parsed.session_ids)) {
      parsed.session_ids = []
    }
    return parsed as BoulderState
  } catch {
    return null
  }
}

export function writeBoulderState(directory: string, state: BoulderState): boolean {
  const filePath = getBoulderFilePath(directory)

  try {
    const dir = dirname(filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8")
    return true
  } catch {
    return false
  }
}

export function appendSessionId(directory: string, sessionId: string): BoulderState | null {
  const state = readBoulderState(directory)
  if (!state) return null

  if (!state.session_ids?.includes(sessionId)) {
    if (!Array.isArray(state.session_ids)) {
      state.session_ids = []
    }
    state.session_ids.push(sessionId)
    if (writeBoulderState(directory, state)) {
      return state
    }
  }

  return state
}

export function clearBoulderState(directory: string): boolean {
  const filePath = getBoulderFilePath(directory)

  try {
    if (existsSync(filePath)) {
      const { unlinkSync } = require("node:fs")
      unlinkSync(filePath)
    }
    return true
  } catch {
    return false
  }
}

/**
 * @deprecated Use `bd ready` / `bd list` instead.
 */
export function findPrometheusPlans(directory: string): string[] {
  const plansDir = join(directory, PROMETHEUS_PLANS_DIR)

  if (!existsSync(plansDir)) {
    return []
  }

  try {
    const files = readdirSync(plansDir)
    return files
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(plansDir, f))
      .sort((a, b) => {
        const aStat = require("node:fs").statSync(a)
        const bStat = require("node:fs").statSync(b)
        return bStat.mtimeMs - aStat.mtimeMs
      })
  } catch {
    return []
  }
}

/**
 * @deprecated Use beads issue status instead.
 */
export function getPlanProgress(planPath: string): PlanProgress {
  if (!existsSync(planPath)) {
    return { total: 0, completed: 0, isComplete: true }
  }

  try {
    const content = readFileSync(planPath, "utf-8")

    const uncheckedMatches = content.match(/^[-*]\s*\[\s*\]/gm) || []
    const checkedMatches = content.match(/^[-*]\s*\[[xX]\]/gm) || []

    const total = uncheckedMatches.length + checkedMatches.length
    const completed = checkedMatches.length

    return {
      total,
      completed,
      isComplete: total === 0 || completed === total,
    }
  } catch {
    return { total: 0, completed: 0, isComplete: true }
  }
}

/**
 * @deprecated Use beads issue title instead.
 */
export function getPlanName(planPath: string): string {
  return basename(planPath, ".md")
}

/**
 * @deprecated Use createActiveWorkState instead.
 */
export function createBoulderState(
  planPath: string,
  sessionId: string,
  agent?: string
): BoulderState {
  return {
    active_plan: planPath,
    started_at: new Date().toISOString(),
    session_ids: [sessionId],
    plan_name: getPlanName(planPath),
    ...(agent !== undefined ? { agent } : {}),
  }
}

// ---------------------------------------------------------------------------
// Beads-oriented active work state helpers
// ---------------------------------------------------------------------------

const ACTIVE_WORK_FILE = "active-work.json"

function getActiveWorkFilePath(directory: string): string {
  return join(directory, BOULDER_DIR, ACTIVE_WORK_FILE)
}

/**
 * Create a fresh ActiveWorkState.
 */
export function createActiveWorkState(
  sessionId: string,
  epicId?: string | null,
  epicTitle?: string | null,
  agent?: string
): ActiveWorkState {
  return {
    active_epic_id: epicId ?? null,
    active_epic_title: epicTitle ?? null,
    started_at: new Date().toISOString(),
    session_ids: [sessionId],
    ...(agent !== undefined ? { agent } : {}),
  }
}

/**
 * Read the active-work.json state for beads-oriented workflows.
 */
export function readActiveWorkState(directory: string): ActiveWorkState | null {
  const filePath = getActiveWorkFilePath(directory)
  if (!existsSync(filePath)) return null

  try {
    const content = readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null
    }
    if (!Array.isArray(parsed.session_ids)) {
      parsed.session_ids = []
    }
    return parsed as ActiveWorkState
  } catch {
    return null
  }
}

/**
 * Write the active-work.json state.
 */
export function writeActiveWorkState(directory: string, state: ActiveWorkState): boolean {
  const filePath = getActiveWorkFilePath(directory)

  try {
    const dir = dirname(filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8")
    return true
  } catch {
    return false
  }
}

/**
 * Clear the active-work.json state.
 */
export function clearActiveWorkState(directory: string): boolean {
  const filePath = getActiveWorkFilePath(directory)
  try {
    if (existsSync(filePath)) {
      const { unlinkSync } = require("node:fs")
      unlinkSync(filePath)
    }
    return true
  } catch {
    return false
  }
}

/**
 * Append a session ID to the active work state.
 */
export function appendActiveWorkSessionId(
  directory: string,
  sessionId: string
): ActiveWorkState | null {
  const state = readActiveWorkState(directory)
  if (!state) return null

  if (!state.session_ids?.includes(sessionId)) {
    if (!Array.isArray(state.session_ids)) {
      state.session_ids = []
    }
    state.session_ids.push(sessionId)
    if (writeActiveWorkState(directory, state)) {
      return state
    }
  }
  return state
}

export function readBeadsIssueStatus(directory: string, issueId: string): string | null {
  try {
    const rawOutput = execFileSync("bd", ["show", issueId, "--json"], {
      cwd: directory,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    const parsed = JSON.parse(rawOutput)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null
    }
    return typeof parsed.status === "string" ? parsed.status : null
  } catch {
    return null
  }
}

export function isActiveEpicStatus(status: string | null | undefined): boolean {
  return !!status && ACTIVE_BEADS_STATUSES.has(status)
}

export function isClosedEpicStatus(status: string | null | undefined): boolean {
  return status === CLOSED_BEADS_STATUS
}
