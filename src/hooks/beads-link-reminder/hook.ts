import type { PluginInput } from "@opencode-ai/plugin"

import { getSessionAgent, subagentSessions } from "../../features/claude-code-session-state"
import { storeToolMetadata } from "../../features/tool-metadata-store"

const NEEDS_INLINE_DEPS_METADATA_KEY = "beadsInlineDepsReminderNeeded"
const TARGET_AGENTS = new Set(["atlas", "prometheus"])

function isBdCreateWithoutInlineDeps(command: string): boolean {
  const isCreate = /\bbd\s+create\b/.test(command)
  const hasInlineDeps = /--deps\b/.test(command)
  const isEpicCreate = /(?:--type(?:=|\s+)epic\b)|(?:-t\s+epic\b)/.test(command)
  return isCreate && !hasInlineDeps && !isEpicCreate
}

function isTargetSession(sessionID: string, inputAgent?: string): boolean {
  if (subagentSessions.has(sessionID)) {
    return true
  }

  const sessionAgent = (inputAgent ?? getSessionAgent(sessionID) ?? "").toLowerCase()
  return TARGET_AGENTS.has(sessionAgent)
}

export function createBeadsLinkReminderHook(ctx: PluginInput): {
  "tool.execute.before": (input: { tool: string; sessionID: string; callID: string; agent?: string }, output: { args: Record<string, unknown> }) => Promise<void>
  "tool.execute.after": (
    input: { tool: string; sessionID: string; callID: string; agent?: string },
    output: { title: string; output: string; metadata: Record<string, unknown> }
  ) => Promise<void>
} {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") {
        return
      }

      if (!isTargetSession(input.sessionID, input.agent)) {
        return
      }

      const command = typeof output.args.command === "string" ? output.args.command : ""
      if (!isBdCreateWithoutInlineDeps(command)) {
        return
      }

      storeToolMetadata(input.sessionID, input.callID, {
        metadata: {
          [NEEDS_INLINE_DEPS_METADATA_KEY]: true,
        },
      })
    },

    "tool.execute.after": async (input, output) => {
      if (input.tool !== "bash") {
        return
      }

      if (!isTargetSession(input.sessionID, input.agent)) {
        return
      }

      const needsReminder = output.metadata?.[NEEDS_INLINE_DEPS_METADATA_KEY] === true
      if (!needsReminder) {
        return
      }

      await ctx.client.session
        .promptAsync({
          path: { id: input.sessionID },
          body: {
            noReply: true,
            parts: [
              {
                type: "text",
                text:
                  "Beads reminder: when creating delegated follow-up issues, include inline deps: `bd create ... --deps parent-child:<ASSIGNED_EPIC_ID>,discovered-from:<ASSIGNED_ISSUE_ID>`. If the issue already exists, link it now: `bd dep add <new-issue> <depends-on>`.",
              },
            ],
          },
        })
        .catch(() => {})
    },
  }
}
