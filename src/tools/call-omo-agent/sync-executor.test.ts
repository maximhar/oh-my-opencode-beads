import { afterEach, describe, expect, mock, test } from "bun:test"

afterEach(() => {
  mock.restore()
})

describe("executeSync", () => {
  test("passes question=false via tools parameter to block question tool", async () => {
    //#given
    mock.module("./session-creator", () => ({
      createOrGetSession: mock(async () => ({ sessionID: "ses-test-123", isNew: true })),
    }))
    mock.module("./completion-poller", () => ({
      waitForCompletion: mock(async () => {}),
    }))
    mock.module("./message-processor", () => ({
      processMessages: mock(async () => "agent response"),
    }))
    const { executeSync } = await import(`./sync-executor?question=${Date.now()}`)

    let promptArgs: unknown
    const promptAsync = mock(async (input: any) => {
      promptArgs = input
      return { data: {} }
    })

    const args = {
      subagent_type: "explore",
      description: "test task",
      prompt: "find something",
    }

    const toolContext = {
      sessionID: "parent-session",
      messageID: "msg-1",
      agent: "sisyphus",
      abort: new AbortController().signal,
      metadata: mock(async () => {}),
    }

    const ctx = {
      client: {
        session: { promptAsync },
      },
    }

    //#when
    await executeSync(args, toolContext, ctx as any)

    //#then
    expect(promptAsync).toHaveBeenCalled()
    expect((promptArgs as any).body.tools.question).toBe(false)
  })

  test("passes task=false via tools parameter", async () => {
    //#given
    mock.module("./session-creator", () => ({
      createOrGetSession: mock(async () => ({ sessionID: "ses-test-123", isNew: true })),
    }))
    mock.module("./completion-poller", () => ({
      waitForCompletion: mock(async () => {}),
    }))
    mock.module("./message-processor", () => ({
      processMessages: mock(async () => "agent response"),
    }))
    const { executeSync } = await import(`./sync-executor?task=${Date.now()}`)

    let promptArgs: unknown
    const promptAsync = mock(async (input: any) => {
      promptArgs = input
      return { data: {} }
    })

    const args = {
      subagent_type: "librarian",
      description: "search docs",
      prompt: "find docs",
    }

    const toolContext = {
      sessionID: "parent-session",
      messageID: "msg-2",
      agent: "sisyphus",
      abort: new AbortController().signal,
      metadata: mock(async () => {}),
    }

    const ctx = {
      client: {
        session: { promptAsync },
      },
    }

    //#when
    await executeSync(args, toolContext, ctx as any)

    //#then
    expect(promptAsync).toHaveBeenCalled()
    expect((promptArgs as any).body.tools.task).toBe(false)
  })
})
