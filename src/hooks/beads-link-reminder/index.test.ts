const { afterEach, describe, expect, mock, test } = require("bun:test")

import { consumeToolMetadata, clearPendingStore } from "../../features/tool-metadata-store"
import { _resetForTesting, subagentSessions } from "../../features/claude-code-session-state"
import { createBeadsLinkReminderHook } from "./hook"

describe("createBeadsLinkReminderHook", () => {
  afterEach(() => {
    clearPendingStore()
    _resetForTesting()
  })

  test("stores reminder metadata for subagent bd create without dep add", async () => {
    //#given
    const promptAsync = mock(async () => ({ data: {} }))
    subagentSessions.add("ses_1")
    const hook = createBeadsLinkReminderHook({
      client: { session: { promptAsync } },
    } as any)

    //#when
    await hook["tool.execute.before"](
      { tool: "bash", sessionID: "ses_1", callID: "call_1" },
      { args: { command: "bd create \"x\" -t task -p 2 --json" } }
    )

    //#then
    const stored = consumeToolMetadata("ses_1", "call_1")
    expect(stored?.metadata?.beadsLinkReminderNeeded).toBe(true)
  })

  test("does not store metadata for non-subagent sessions", async () => {
    //#given
    const promptAsync = mock(async () => ({ data: {} }))
    const hook = createBeadsLinkReminderHook({
      client: { session: { promptAsync } },
    } as any)

    //#when
    await hook["tool.execute.before"](
      { tool: "bash", sessionID: "ses_main", callID: "call_main" },
      { args: { command: "bd create \"x\" -t task -p 2 --json" } }
    )

    //#then
    const stored = consumeToolMetadata("ses_main", "call_main")
    expect(stored).toBeUndefined()
  })

  test("does not store metadata for non-create commands", async () => {
    //#given
    const promptAsync = mock(async () => ({ data: {} }))
    const hook = createBeadsLinkReminderHook({
      client: { session: { promptAsync } },
    } as any)

    //#when
    await hook["tool.execute.before"](
      { tool: "bash", sessionID: "ses_1", callID: "call_2" },
      { args: { command: "bd show abc --json" } }
    )

    //#then
    const stored = consumeToolMetadata("ses_1", "call_2")
    expect(stored).toBeUndefined()
  })

  test("sends no-reply reminder when metadata marker is present", async () => {
    //#given
    const promptAsync = mock(async () => ({ data: {} }))
    subagentSessions.add("ses_1")
    const hook = createBeadsLinkReminderHook({
      client: { session: { promptAsync } },
    } as any)

    //#when
    await hook["tool.execute.after"](
      { tool: "bash", sessionID: "ses_1", callID: "call_3" },
      {
        title: "bash",
        output: "ok",
        metadata: { beadsLinkReminderNeeded: true },
      }
    )

    //#then
    expect(promptAsync).toHaveBeenCalledTimes(1)
    expect(promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: "ses_1" },
        body: expect.objectContaining({ noReply: true }),
      })
    )
  })
})
