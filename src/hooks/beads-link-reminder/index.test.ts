const { afterEach, describe, expect, mock, test } = require("bun:test")

import { consumeToolMetadata, clearPendingStore } from "../../features/tool-metadata-store"
import { _resetForTesting, subagentSessions, updateSessionAgent } from "../../features/claude-code-session-state"
import { createBeadsLinkReminderHook } from "./hook"

describe("createBeadsLinkReminderHook", () => {
  afterEach(() => {
    clearPendingStore()
    _resetForTesting()
  })

  test("stores reminder metadata for subagent bd create without inline deps", async () => {
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
    expect(stored?.metadata?.beadsInlineDepsReminderNeeded).toBe(true)
  })

  test("stores metadata for atlas session bd create without inline deps", async () => {
    //#given
    const promptAsync = mock(async () => ({ data: {} }))
    updateSessionAgent("ses_atlas", "atlas")
    const hook = createBeadsLinkReminderHook({
      client: { session: { promptAsync } },
    } as any)

    //#when
    await hook["tool.execute.before"](
      { tool: "bash", sessionID: "ses_atlas", callID: "call_atlas" },
      { args: { command: "bd create \"x\" -t task -p 2 --json" } }
    )

    //#then
    const stored = consumeToolMetadata("ses_atlas", "call_atlas")
    expect(stored?.metadata?.beadsInlineDepsReminderNeeded).toBe(true)
  })

  test("stores metadata for prometheus session bd create without inline deps", async () => {
    //#given
    const promptAsync = mock(async () => ({ data: {} }))
    updateSessionAgent("ses_prom", "prometheus")
    const hook = createBeadsLinkReminderHook({
      client: { session: { promptAsync } },
    } as any)

    //#when
    await hook["tool.execute.before"](
      { tool: "bash", sessionID: "ses_prom", callID: "call_prom" },
      { args: { command: "bd create \"x\" -t task -p 2 --json" } }
    )

    //#then
    const stored = consumeToolMetadata("ses_prom", "call_prom")
    expect(stored?.metadata?.beadsInlineDepsReminderNeeded).toBe(true)
  })

  test("does not store metadata for non-target sessions", async () => {
    //#given
    const promptAsync = mock(async () => ({ data: {} }))
    updateSessionAgent("ses_main", "sisyphus")
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
        metadata: { beadsInlineDepsReminderNeeded: true },
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
    const firstCall = promptAsync.mock.calls[0]
    expect(firstCall[0].body.parts[0].text).toContain("--deps")
    expect(firstCall[0].body.parts[0].text).toContain("bd dep add")
  })

  test("does not store metadata when bd create already includes --deps", async () => {
    //#given
    const promptAsync = mock(async () => ({ data: {} }))
    subagentSessions.add("ses_1")
    const hook = createBeadsLinkReminderHook({
      client: { session: { promptAsync } },
    } as any)

    //#when
    await hook["tool.execute.before"](
      { tool: "bash", sessionID: "ses_1", callID: "call_inline_deps" },
      { args: { command: "bd create \"x\" -t task -p 2 --deps discovered-from:beads-1 --json" } }
    )

    //#then
    const stored = consumeToolMetadata("ses_1", "call_inline_deps")
    expect(stored).toBeUndefined()
  })

  test("does not store metadata for epic issue creation without deps", async () => {
    //#given
    const promptAsync = mock(async () => ({ data: {} }))
    updateSessionAgent("ses_atlas", "atlas")
    const hook = createBeadsLinkReminderHook({
      client: { session: { promptAsync } },
    } as any)

    //#when
    await hook["tool.execute.before"](
      { tool: "bash", sessionID: "ses_atlas", callID: "call_epic" },
      { args: { command: "bd create \"Epic\" --type=epic --priority=1 --json" } }
    )

    //#then
    const stored = consumeToolMetadata("ses_atlas", "call_epic")
    expect(stored).toBeUndefined()
  })
})
