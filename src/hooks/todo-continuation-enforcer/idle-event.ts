import type { PluginInput } from "@opencode-ai/plugin"

import type { BackgroundManager } from "../../features/background-agent"
import {
  isActiveEpicStatus,
  isClosedEpicStatus,
  readActiveWorkState,
  readBeadsIssueStatus,
} from "../../features/boulder-state"
import type { ToolPermission } from "../../features/hook-message-injector"
import { log } from "../../shared/logger"

import {
  ABORT_WINDOW_MS,
  CONTINUATION_COOLDOWN_MS,
  DEFAULT_SKIP_AGENTS,
  HOOK_NAME,
} from "./constants"
import { isLastAssistantMessageAborted } from "./abort-detection"
import type { MessageInfo, ResolvedMessageInfo, Todo } from "./types"
import type { SessionStateStore } from "./session-state"
import { startCountdown } from "./countdown"

export async function handleSessionIdle(args: {
  ctx: PluginInput
  sessionID: string
  sessionStateStore: SessionStateStore
  backgroundManager?: BackgroundManager
  skipAgents?: string[]
  isContinuationStopped?: (sessionID: string) => boolean
  readEpicStatus?: (directory: string, epicId: string) => string | null
}): Promise<void> {
  const {
    ctx,
    sessionID,
    sessionStateStore,
    backgroundManager,
    skipAgents = DEFAULT_SKIP_AGENTS,
    isContinuationStopped,
    readEpicStatus,
  } = args

  const resolveEpicStatus = readEpicStatus ?? readBeadsIssueStatus

  log(`[${HOOK_NAME}] session.idle`, { sessionID })

  const state = sessionStateStore.getState(sessionID)
  if (state.isRecovering) {
    log(`[${HOOK_NAME}] Skipped: in recovery`, { sessionID })
    return
  }

  if (state.abortDetectedAt) {
    const timeSinceAbort = Date.now() - state.abortDetectedAt
    if (timeSinceAbort < ABORT_WINDOW_MS) {
      log(`[${HOOK_NAME}] Skipped: abort detected via event ${timeSinceAbort}ms ago`, { sessionID })
      state.abortDetectedAt = undefined
      return
    }
    state.abortDetectedAt = undefined
  }

  const hasRunningBgTasks = backgroundManager
    ? backgroundManager.getTasksByParentSession(sessionID).some((task: { status: string }) => task.status === "running")
    : false

  if (hasRunningBgTasks) {
    log(`[${HOOK_NAME}] Skipped: background tasks running`, { sessionID })
    return
  }

  try {
    const messagesResp = await ctx.client.session.messages({
      path: { id: sessionID },
      query: { directory: ctx.directory },
    })
    const messages = (messagesResp as { data?: Array<{ info?: MessageInfo }> }).data ?? []
    if (isLastAssistantMessageAborted(messages)) {
      log(`[${HOOK_NAME}] Skipped: last assistant message was aborted (API fallback)`, { sessionID })
      return
    }
  } catch (error) {
    log(`[${HOOK_NAME}] Messages fetch failed, continuing`, { sessionID, error: String(error) })
  }

  let workItemLabel: string | undefined
  let incompleteCount = 0
  let total = 0

  const activeWorkState = readActiveWorkState(ctx.directory)
  if (activeWorkState?.session_ids?.includes(sessionID) && activeWorkState.active_epic_id) {
    const epicStatus = resolveEpicStatus(ctx.directory, activeWorkState.active_epic_id)
    if (isClosedEpicStatus(epicStatus)) {
      log(`[${HOOK_NAME}] Active epic is closed`, {
        sessionID,
        epicID: activeWorkState.active_epic_id,
      })
      return
    }
    if (!isActiveEpicStatus(epicStatus)) {
      log(`[${HOOK_NAME}] Active epic status unknown; skipping continuation`, {
        sessionID,
        epicID: activeWorkState.active_epic_id,
        epicStatus,
      })
      return
    }
    workItemLabel = activeWorkState.active_epic_title ?? activeWorkState.active_epic_id
    incompleteCount = 1
    total = 1
  } else {
    let todos: Todo[] = []
    try {
      const response = await ctx.client.session.todo({ path: { id: sessionID } })
      todos = (response.data ?? response) as Todo[]
    } catch (error) {
      log(`[${HOOK_NAME}] Todo fetch failed`, { sessionID, error: String(error) })
      return
    }

    if (!todos || todos.length === 0) {
      log(`[${HOOK_NAME}] No active work items`, { sessionID })
      return
    }

    incompleteCount = todos.filter((todo) => todo.status !== "completed" && todo.status !== "cancelled").length
    total = todos.length
    if (incompleteCount === 0) {
      log(`[${HOOK_NAME}] All tracked work complete`, { sessionID, total })
      return
    }
  }

  if (state.inFlight) {
    log(`[${HOOK_NAME}] Skipped: injection in flight`, { sessionID })
    return
  }

  if (state.lastInjectedAt && Date.now() - state.lastInjectedAt < CONTINUATION_COOLDOWN_MS) {
    log(`[${HOOK_NAME}] Skipped: cooldown active`, { sessionID })
    return
  }

  let resolvedInfo: ResolvedMessageInfo | undefined
  let hasCompactionMessage = false
  try {
    const messagesResp = await ctx.client.session.messages({
      path: { id: sessionID },
    })
    const messages = (messagesResp.data ?? []) as Array<{ info?: MessageInfo }>
    for (let i = messages.length - 1; i >= 0; i--) {
      const info = messages[i].info
      if (info?.agent === "compaction") {
        hasCompactionMessage = true
        continue
      }
      if (info?.agent || info?.model || (info?.modelID && info?.providerID)) {
        resolvedInfo = {
          agent: info.agent,
          model: info.model ?? (info.providerID && info.modelID ? { providerID: info.providerID, modelID: info.modelID } : undefined),
          tools: info.tools as Record<string, ToolPermission> | undefined,
        }
        break
      }
    }
  } catch (error) {
    log(`[${HOOK_NAME}] Failed to fetch messages for agent check`, { sessionID, error: String(error) })
  }

  log(`[${HOOK_NAME}] Agent check`, { sessionID, agentName: resolvedInfo?.agent, skipAgents, hasCompactionMessage })

  if (resolvedInfo?.agent && skipAgents.includes(resolvedInfo.agent)) {
    log(`[${HOOK_NAME}] Skipped: agent in skipAgents list`, { sessionID, agent: resolvedInfo.agent })
    return
  }
  if (hasCompactionMessage && !resolvedInfo?.agent) {
    log(`[${HOOK_NAME}] Skipped: compaction occurred but no agent info resolved`, { sessionID })
    return
  }

  if (isContinuationStopped?.(sessionID)) {
    log(`[${HOOK_NAME}] Skipped: continuation stopped for session`, { sessionID })
    return
  }

    startCountdown({
      ctx,
      sessionID,
      incompleteCount,
      total,
      workItemLabel,
      resolvedInfo,
      backgroundManager,
      skipAgents,
      sessionStateStore,
      readEpicStatus: resolveEpicStatus,
    })
}
