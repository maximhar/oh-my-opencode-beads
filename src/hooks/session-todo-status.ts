import type { PluginInput } from "@opencode-ai/plugin"
import { readActiveWorkState } from "../features/boulder-state"

interface Todo {
  content: string
  status: string
  priority: string
  id: string
}

export async function hasIncompleteTodos(ctx: PluginInput, sessionID: string): Promise<boolean> {
  const activeWorkState = readActiveWorkState(ctx.directory)
  if (activeWorkState?.session_ids?.includes(sessionID) && activeWorkState.active_issue_id) {
    return true
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
