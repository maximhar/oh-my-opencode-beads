import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { findNearestMessageWithFields, findFirstMessageWithAgent, MESSAGE_STORAGE } from "../../features/hook-message-injector"
import { getSessionAgent } from "../../features/claude-code-session-state"
import { readActiveWorkState, readBoulderState } from "../../features/boulder-state"

function getMessageDir(sessionID: string): string | null {
  if (!existsSync(MESSAGE_STORAGE)) return null

  const directPath = join(MESSAGE_STORAGE, sessionID)
  if (existsSync(directPath)) return directPath

  for (const dir of readdirSync(MESSAGE_STORAGE)) {
    const sessionPath = join(MESSAGE_STORAGE, dir, sessionID)
    if (existsSync(sessionPath)) return sessionPath
  }

  return null
}

function getAgentFromMessageFiles(sessionID: string): string | undefined {
  const messageDir = getMessageDir(sessionID)
  if (!messageDir) return undefined
  return findFirstMessageWithAgent(messageDir) ?? findNearestMessageWithFields(messageDir)?.agent
}

/**
 * Get the effective agent for the session.
 * Priority order:
 * 1. In-memory session agent (most recent, set by work-assignment flows)
 * 2. Active work state agent (persisted across restarts)
 * 3. Legacy boulder state agent (compatibility fallback)
 * 4. Message files (fallback for sessions without persisted state)
 *
 * This fixes issue #927 where after interruption:
 * - In-memory map is cleared (process restart)
 * - Message files may return an earlier planner agent
 * - But persisted work state may have the latest orchestrator agent
 */
export function getAgentFromSession(sessionID: string, directory: string): string | undefined {
  // Check in-memory first (current session)
  const memoryAgent = getSessionAgent(sessionID)
  if (memoryAgent) return memoryAgent

  // Check active work state first (persisted across restarts)
  const activeWorkState = readActiveWorkState(directory)
  if (activeWorkState?.session_ids?.includes(sessionID) && activeWorkState.agent) {
    return activeWorkState.agent
  }

  // Check legacy boulder state (backward compatibility)
  const boulderState = readBoulderState(directory)
  if (boulderState?.session_ids?.includes(sessionID) && boulderState.agent) {
    return boulderState.agent
  }

  // Fallback to message files
  return getAgentFromMessageFiles(sessionID)
}
