import type { PluginInput } from "@opencode-ai/plugin"

import { subagentSessions } from "../../features/claude-code-session-state"
import { storeToolMetadata } from "../../features/tool-metadata-store"

const NEEDS_LINK_METADATA_KEY = "beadsLinkReminderNeeded"

function isBdCreateWithoutDepAdd(command: string): boolean {
  return /\bbd\s+create\b/.test(command) && !/\bbd\s+dep\s+add\b/.test(command)
}

export function createBeadsLinkReminderHook(ctx: PluginInput): {
  "tool.execute.before": (input: { tool: string; sessionID: string; callID: string }, output: { args: Record<string, unknown> }) => Promise<void>
  "tool.execute.after": (
    input: { tool: string; sessionID: string; callID: string },
    output: { title: string; output: string; metadata: Record<string, unknown> }
  ) => Promise<void>
} {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") {
        return
      }

      if (!subagentSessions.has(input.sessionID)) {
        return
      }

      const command = typeof output.args.command === "string" ? output.args.command : ""
      if (!isBdCreateWithoutDepAdd(command)) {
        return
      }

      storeToolMetadata(input.sessionID, input.callID, {
        metadata: {
          [NEEDS_LINK_METADATA_KEY]: true,
        },
      })
    },

    "tool.execute.after": async (input, output) => {
      if (input.tool !== "bash") {
        return
      }

      if (!subagentSessions.has(input.sessionID)) {
        return
      }

      const needsReminder = output.metadata?.[NEEDS_LINK_METADATA_KEY] === true
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
                  "Beads reminder: if you created a new issue for delegated work, link it to ASSIGNED_ISSUE_ID now: `bd dep add <new-issue> <ASSIGNED_ISSUE_ID>`.",
              },
            ],
          },
        })
        .catch(() => {})
    },
  }
}
