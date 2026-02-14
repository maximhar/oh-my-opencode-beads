import { describe, expect, test } from "bun:test"

const { createTasksTodowriteDisablerHook } = await import("./index")

describe("tasks-todowrite-disabler", () => {
  describe("todo tools are always blocked", () => {
    test("should block TodoWrite tool", async () => {
      // given
      const hook = createTasksTodowriteDisablerHook()
      const input = {
        tool: "TodoWrite",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: {},
      }

      // when / then
      await expect(
        hook["tool.execute.before"](input, output)
      ).rejects.toThrow("TodoRead/TodoWrite are DISABLED")
    })

    test("should block TodoRead tool", async () => {
      // given
      const hook = createTasksTodowriteDisablerHook()
      const input = {
        tool: "TodoRead",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: {},
      }

      // when / then
      await expect(
        hook["tool.execute.before"](input, output)
      ).rejects.toThrow("TodoRead/TodoWrite are DISABLED")
    })

    test("should not block other tools", async () => {
      // given
      const hook = createTasksTodowriteDisablerHook()
      const input = {
        tool: "Read",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: {},
      }

      // when / then
      await expect(
        hook["tool.execute.before"](input, output)
      ).resolves.toBeUndefined()
    })
  })

  describe("error message content", () => {
    test("should include replacement message with beads workflow info", async () => {
      // given
      const hook = createTasksTodowriteDisablerHook()
      const input = {
        tool: "TodoWrite",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: {},
      }

      // when / then
      await expect(
        hook["tool.execute.before"](input, output)
      ).rejects.toThrow(/bd create|bd update|bd close|bd show/)
    })
  })
})
