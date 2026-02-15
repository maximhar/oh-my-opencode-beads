import type { PluginInput } from "@opencode-ai/plugin"

import type { BackgroundManager } from "../../features/background-agent"
import {
  isActiveEpicStatus,
  readActiveWorkState,
  readBeadsIssueStatus,
} from "../../features/boulder-state"
import {
  findNearestMessageWithFields,
  type ToolPermission,
} from "../../features/hook-message-injector"
import { log } from "../../shared/logger"

import {
  CONTINUATION_PROMPT,
  DEFAULT_SKIP_AGENTS,
  HOOK_NAME,
} from "./constants"
import { getMessageDir } from "./message-directory"
import { getIncompleteCount } from "./todo"
import type { ResolvedMessageInfo, Todo } from "./types"
import type { SessionStateStore } from "./session-state"

function hasWritePermission(tools: Record<string, ToolPermission> | undefined): boolean {
  const editPermission = tools?.edit
  const writePermission = tools?.write
  return (
    !tools ||
    (editPermission !== false && editPermission !== "deny" && writePermission !== false && writePermission !== "deny")
  )
}

export async function injectContinuation(args: {
  ctx: PluginInput
  sessionID: string
  backgroundManager?: BackgroundManager
  skipAgents?: string[]
  resolvedInfo?: ResolvedMessageInfo
  workItemLabel?: string
  sessionStateStore: SessionStateStore
  readEpicStatus?: (directory: string, epicId: string) => string | null
}): Promise<void> {
  const {
    ctx,
    sessionID,
    backgroundManager,
    skipAgents = DEFAULT_SKIP_AGENTS,
    resolvedInfo,
    workItemLabel,
    sessionStateStore,
    readEpicStatus,
  } = args

  const resolveEpicStatus = readEpicStatus ?? readBeadsIssueStatus

  const state = sessionStateStore.getExistingState(sessionID)
  if (state?.isRecovering) {
    log(`[${HOOK_NAME}] Skipped injection: in recovery`, { sessionID })
    return
  }

  const hasRunningBgTasks = backgroundManager
    ? backgroundManager.getTasksByParentSession(sessionID).some((task: { status: string }) => task.status === "running")
    : false

  if (hasRunningBgTasks) {
    log(`[${HOOK_NAME}] Skipped injection: background tasks running`, { sessionID })
    return
  }

  const activeWorkState = readActiveWorkState(ctx.directory)
  const activeEpicId =
    activeWorkState?.session_ids?.includes(sessionID) ? activeWorkState.active_epic_id : undefined
  const activeEpicStatus = activeEpicId
    ? resolveEpicStatus(ctx.directory, activeEpicId)
    : undefined
  const activeWorkLabel =
    workItemLabel ??
    (activeWorkState?.session_ids?.includes(sessionID)
      ? (activeWorkState.active_epic_title ?? activeWorkState.active_epic_id ?? undefined)
      : undefined)

  let freshIncompleteCount = 0
  let totalCount = 0
  let remainingSection = ""

  if (activeWorkLabel && activeEpicStatus && isActiveEpicStatus(activeEpicStatus)) {
    freshIncompleteCount = 1
    totalCount = 1
    remainingSection = `Remaining work:\n- ${activeWorkLabel}`
  } else if (activeWorkLabel) {
    log(`[${HOOK_NAME}] Skipped injection: active epic is not open/in_progress`, {
      sessionID,
      activeEpicId,
      activeEpicStatus,
    })
    return
  } else {
    let todos: Todo[] = []
    try {
      const response = await ctx.client.session.todo({ path: { id: sessionID } })
      todos = (response.data ?? response) as Todo[]
    } catch (error) {
      log(`[${HOOK_NAME}] Failed to fetch todos`, { sessionID, error: String(error) })
      return
    }

    freshIncompleteCount = getIncompleteCount(todos)
    if (freshIncompleteCount === 0) {
      log(`[${HOOK_NAME}] Skipped injection: no incomplete work`, { sessionID })
      return
    }

    totalCount = todos.length
    const incompleteTodos = todos.filter((todo) => todo.status !== "completed" && todo.status !== "cancelled")
    const todoList = incompleteTodos.map((todo) => `- [${todo.status}] ${todo.content}`).join("\n")
    remainingSection = `Remaining work:\n${todoList}`
  }

  let agentName = resolvedInfo?.agent
  let model = resolvedInfo?.model
  let tools = resolvedInfo?.tools

  if (!agentName || !model) {
    const messageDir = getMessageDir(sessionID)
    const previousMessage = messageDir ? findNearestMessageWithFields(messageDir) : null
    agentName = agentName ?? previousMessage?.agent
    model =
      model ??
      (previousMessage?.model?.providerID && previousMessage?.model?.modelID
        ? {
            providerID: previousMessage.model.providerID,
            modelID: previousMessage.model.modelID,
            ...(previousMessage.model.variant
              ? { variant: previousMessage.model.variant }
              : {}),
          }
        : undefined)
    tools = tools ?? previousMessage?.tools
  }

  if (agentName && skipAgents.includes(agentName)) {
    log(`[${HOOK_NAME}] Skipped: agent in skipAgents list`, { sessionID, agent: agentName })
    return
  }

  if (!hasWritePermission(tools)) {
    log(`[${HOOK_NAME}] Skipped: agent lacks write permission`, { sessionID, agent: agentName })
    return
  }

  const prompt = `${CONTINUATION_PROMPT}

[Status: ${totalCount - freshIncompleteCount}/${totalCount} completed, ${freshIncompleteCount} remaining]

${remainingSection}`

  const injectionState = sessionStateStore.getExistingState(sessionID)
  if (injectionState) {
    injectionState.inFlight = true
  }

  try {
    log(`[${HOOK_NAME}] Injecting continuation`, {
      sessionID,
      agent: agentName,
      model,
      incompleteCount: freshIncompleteCount,
    })

    await ctx.client.session.promptAsync({
      path: { id: sessionID },
      body: {
        agent: agentName,
        ...(model !== undefined ? { model } : {}),
        parts: [{ type: "text", text: prompt }],
      },
      query: { directory: ctx.directory },
    })

    log(`[${HOOK_NAME}] Injection successful`, { sessionID })
    if (injectionState) {
      injectionState.inFlight = false
      injectionState.lastInjectedAt = Date.now()
    }
  } catch (error) {
    log(`[${HOOK_NAME}] Injection failed`, { sessionID, error: String(error) })
    if (injectionState) {
      injectionState.inFlight = false
    }
  }
}
