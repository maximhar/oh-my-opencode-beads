import type { PluginInput } from "@opencode-ai/plugin"
import { getPlanProgress, readActiveWorkState, readBoulderState } from "../../features/boulder-state"
import { subagentSessions } from "../../features/claude-code-session-state"
import { log } from "../../shared/logger"
import { HOOK_NAME } from "./hook-name"
import { isAbortError } from "./is-abort-error"
import { injectWorkContinuation } from "./boulder-continuation-injector"
import { getLastAgentFromSession } from "./session-last-agent"
import type { AtlasHookOptions, SessionState } from "./types"

const CONTINUATION_COOLDOWN_MS = 5000

export function createAtlasEventHandler(input: {
  ctx: PluginInput
  options?: AtlasHookOptions
  sessions: Map<string, SessionState>
  getState: (sessionID: string) => SessionState
}): (arg: { event: { type: string; properties?: unknown } }) => Promise<void> {
  const { ctx, options, sessions, getState } = input

  return async ({ event }): Promise<void> => {
    const props = event.properties as Record<string, unknown> | undefined

    if (event.type === "session.error") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return

      const state = getState(sessionID)
      const isAbort = isAbortError(props?.error)
      state.lastEventWasAbortError = isAbort

      log(`[${HOOK_NAME}] session.error`, { sessionID, isAbort })
      return
    }

    if (event.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return

      log(`[${HOOK_NAME}] session.idle`, { sessionID })

      // Prefer active work state (beads-first). Fallback to legacy boulder state.
      const activeWorkState = readActiveWorkState(ctx.directory)
      const boulderState = activeWorkState ? null : readBoulderState(ctx.directory)
      const isWorkSession =
        activeWorkState?.session_ids?.includes(sessionID) ?? boulderState?.session_ids?.includes(sessionID) ?? false

      const isBackgroundTaskSession = subagentSessions.has(sessionID)

      // Allow continuation only if: session is in work plan's session_ids OR is a background task
      if (!isBackgroundTaskSession && !isWorkSession) {
        log(`[${HOOK_NAME}] Skipped: not work plan or background task session`, { sessionID })
        return
      }

      const state = getState(sessionID)

      if (state.lastEventWasAbortError) {
        state.lastEventWasAbortError = false
        log(`[${HOOK_NAME}] Skipped: abort error immediately before idle`, { sessionID })
        return
      }

      if (state.promptFailureCount >= 2) {
        log(`[${HOOK_NAME}] Skipped: continuation disabled after repeated prompt failures`, {
          sessionID,
          promptFailureCount: state.promptFailureCount,
        })
        return
      }

      const backgroundManager = options?.backgroundManager
      const hasRunningBgTasks = backgroundManager
        ? backgroundManager.getTasksByParentSession(sessionID).some((t: { status: string }) => t.status === "running")
        : false

      if (hasRunningBgTasks) {
        log(`[${HOOK_NAME}] Skipped: background tasks running`, { sessionID })
        return
      }

      if (!activeWorkState && !boulderState) {
        log(`[${HOOK_NAME}] No active work plan`, { sessionID })
        return
      }

      if (options?.isContinuationStopped?.(sessionID)) {
        log(`[${HOOK_NAME}] Skipped: continuation stopped for session`, { sessionID })
        return
      }

      const lastAgent = getLastAgentFromSession(sessionID)
      const requiredAgent = (activeWorkState?.agent ?? boulderState?.agent ?? "atlas").toLowerCase()
      const lastAgentMatchesRequired = lastAgent === requiredAgent
      const workAgentWasNotExplicitlySet = activeWorkState?.agent === undefined && boulderState?.agent === undefined
      const workAgentDefaultsToAtlas = requiredAgent === "atlas"
      const lastAgentIsSisyphus = lastAgent === "sisyphus"
      const allowSisyphusWhenDefaultAtlas = workAgentWasNotExplicitlySet && workAgentDefaultsToAtlas && lastAgentIsSisyphus
      const agentMatches = lastAgentMatchesRequired || allowSisyphusWhenDefaultAtlas
      if (!agentMatches) {
        log(`[${HOOK_NAME}] Skipped: last agent does not match work plan agent`, {
          sessionID,
          lastAgent: lastAgent ?? "unknown",
          requiredAgent,
          workAgentExplicitlySet: activeWorkState?.agent !== undefined || boulderState?.agent !== undefined,
        })
        return
      }

      let workItemLabel: string
      let remaining: number | undefined
      let total: number | undefined

      if (activeWorkState) {
        const issueLabel = activeWorkState.active_issue_title ?? activeWorkState.active_issue_id
        if (!issueLabel) {
          log(`[${HOOK_NAME}] Active work state has no issue label`, { sessionID })
          return
        }
        workItemLabel = issueLabel
      } else {
        const progress = getPlanProgress(boulderState.active_plan)
        if (progress.isComplete) {
          log(`[${HOOK_NAME}] Work plan complete`, { sessionID, plan: boulderState.plan_name })
          return
        }
        remaining = progress.total - progress.completed
        total = progress.total
        workItemLabel = boulderState.plan_name
      }

      const now = Date.now()
      if (state.lastContinuationInjectedAt && now - state.lastContinuationInjectedAt < CONTINUATION_COOLDOWN_MS) {
        log(`[${HOOK_NAME}] Skipped: continuation cooldown active`, {
          sessionID,
          cooldownRemaining: CONTINUATION_COOLDOWN_MS - (now - state.lastContinuationInjectedAt),
        })
        return
      }

      state.lastContinuationInjectedAt = now
      try {
        await injectWorkContinuation({
          ctx,
          sessionID,
          workItemLabel,
          remaining,
          total,
          agent: activeWorkState?.agent ?? boulderState?.agent,
          backgroundManager,
          sessionState: state,
        })
      } catch (err) {
        log(`[${HOOK_NAME}] Failed to inject work continuation`, { sessionID, error: err })
        state.promptFailureCount++
      }
      return
    }

    if (event.type === "message.updated") {
      const info = props?.info as Record<string, unknown> | undefined
      const sessionID = info?.sessionID as string | undefined
      if (!sessionID) return

      const state = sessions.get(sessionID)
      if (state) {
        state.lastEventWasAbortError = false
      }
      return
    }

    if (event.type === "message.part.updated") {
      const info = props?.info as Record<string, unknown> | undefined
      const sessionID = info?.sessionID as string | undefined
      const role = info?.role as string | undefined

      if (sessionID && role === "assistant") {
        const state = sessions.get(sessionID)
        if (state) {
          state.lastEventWasAbortError = false
        }
      }
      return
    }

    if (event.type === "tool.execute.before" || event.type === "tool.execute.after") {
      const sessionID = props?.sessionID as string | undefined
      if (sessionID) {
        const state = sessions.get(sessionID)
        if (state) {
          state.lastEventWasAbortError = false
        }
      }
      return
    }

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined
      if (sessionInfo?.id) {
        sessions.delete(sessionInfo.id)
        log(`[${HOOK_NAME}] Session deleted: cleaned up`, { sessionID: sessionInfo.id })
      }
      return
    }

    if (event.type === "session.compacted") {
      const sessionID = (props?.sessionID ?? (props?.info as { id?: string } | undefined)?.id) as string | undefined
      if (sessionID) {
        sessions.delete(sessionID)
        log(`[${HOOK_NAME}] Session compacted: cleaned up`, { sessionID })
      }
    }
  }
}
