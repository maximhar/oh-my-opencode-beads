import type { PluginInput } from "@opencode-ai/plugin"
import {
  isActiveEpicStatus,
  readActiveWorkState,
  readBeadsIssueStatus,
} from "../features/boulder-state"

interface Todo {
  content: string
  status: string
  priority: string
  id: string
}

export async function hasIncompleteTodos(ctx: PluginInput, sessionID: string): Promise<boolean> {
  const activeWorkState = readActiveWorkState(ctx.directory)
  if (activeWorkState?.session_ids?.includes(sessionID) && activeWorkState.active_epic_id) {
    const epicStatus = readBeadsIssueStatus(ctx.directory, activeWorkState.active_epic_id)
    return isActiveEpicStatus(epicStatus)
  }

  try {
    const response = await ctx.client.session.todo({ path: { id: sessionID } })
    const todos = (response.data ?? response) as Todo[]
    if (!todos || todos.length === 0) return false
    return todos.some((todo) => todo.status !== "completed" && todo.status !== "cancelled")
  } catch {
    return false
  }
}
