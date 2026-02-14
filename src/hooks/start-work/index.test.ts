import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { randomUUID } from "node:crypto"
import { createStartWorkHook } from "./index"
import {
  writeActiveWorkState,
  clearActiveWorkState,
  readActiveWorkState,
} from "../../features/boulder-state"
import type { ActiveWorkState } from "../../features/boulder-state"
import * as sessionState from "../../features/claude-code-session-state"

describe("start-work hook", () => {
  let testDir: string
  let sisyphusDir: string

  function createMockPluginInput() {
    return {
      directory: testDir,
      client: {},
    } as Parameters<typeof createStartWorkHook>[0]
  }

  beforeEach(() => {
    testDir = join(tmpdir(), `start-work-test-${randomUUID()}`)
    sisyphusDir = join(testDir, ".sisyphus")
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true })
    }
    if (!existsSync(sisyphusDir)) {
      mkdirSync(sisyphusDir, { recursive: true })
    }
    clearActiveWorkState(testDir)
  })

  afterEach(() => {
    clearActiveWorkState(testDir)
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe("chat.message handler", () => {
    test("should ignore non-start-work commands", async () => {
      // given - hook and non-start-work message
      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "Just a regular message" }],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - output should be unchanged
      expect(output.parts[0].text).toBe("Just a regular message")
    })

    test("should detect start-work command via session-context tag", async () => {
      // given - hook and start-work message
      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [
          {
            type: "text",
            text: "<session-context>Some context here</session-context>",
          },
        ],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - output should be modified with context info
      expect(output.parts[0].text).toContain("---")
    })

    test("should inject beads discovery guidance when no active state and no hint", async () => {
      // given - no active work state
      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - should show beads discovery instructions
      expect(output.parts[0].text).toContain("Discover Available Work")
      expect(output.parts[0].text).toContain("bd ready")
      expect(output.parts[0].text).toContain("bd update")
      expect(output.parts[0].text).toContain("bd create")
      // Should NOT reference plan files or boulder.json
      expect(output.parts[0].text).not.toContain(".sisyphus/plans")
      expect(output.parts[0].text).not.toContain("boulder.json")
    })

    test("should inject resume info when existing active work state found", async () => {
      // given - existing active work state
      const state: ActiveWorkState = {
        active_issue_id: "beads-abc",
        active_issue_title: "Fix login bug",
        started_at: "2026-01-02T10:00:00Z",
        session_ids: ["session-1"],
        agent: "atlas",
      }
      writeActiveWorkState(testDir, state)

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - should show resuming status with beads details
      expect(output.parts[0].text).toContain("Resuming Active Work Session")
      expect(output.parts[0].text).toContain("beads-abc")
      expect(output.parts[0].text).toContain("Fix login bug")
      expect(output.parts[0].text).toContain("bd show")
    })

    test("should replace $SESSION_ID placeholder", async () => {
      // given - hook and message with placeholder
      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [
          {
            type: "text",
            text: "<session-context>Session: $SESSION_ID</session-context>",
          },
        ],
      }

      // when
      await hook["chat.message"](
        { sessionID: "ses-abc123" },
        output
      )

      // then - placeholder should be replaced
      expect(output.parts[0].text).toContain("ses-abc123")
      expect(output.parts[0].text).not.toContain("$SESSION_ID")
    })

    test("should replace $TIMESTAMP placeholder", async () => {
      // given - hook and message with placeholder
      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [
          {
            type: "text",
            text: "<session-context>Time: $TIMESTAMP</session-context>",
          },
        ],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - placeholder should be replaced with ISO timestamp
      expect(output.parts[0].text).not.toContain("$TIMESTAMP")
      expect(output.parts[0].text).toMatch(/\d{4}-\d{2}-\d{2}T/)
    })

    test("should use explicit issue hint from user-request tag", async () => {
      // given - user specifies an issue hint
      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [
          {
            type: "text",
            text: `<session-context>
<user-request>beads-xyz</user-request>
</session-context>`,
          },
        ],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - should reference the issue hint in guidance
      expect(output.parts[0].text).toContain("Starting Work on Specified Issue")
      expect(output.parts[0].text).toContain("beads-xyz")
      expect(output.parts[0].text).toContain("bd show beads-xyz")
    })

    test("should override existing active state when user provides issue hint", async () => {
      // given - existing active work state AND user provides a new issue hint
      const existingState: ActiveWorkState = {
        active_issue_id: "beads-old",
        active_issue_title: "Old work",
        started_at: "2026-01-01T10:00:00Z",
        session_ids: ["old-session"],
        agent: "atlas",
      }
      writeActiveWorkState(testDir, existingState)

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [
          {
            type: "text",
            text: `<session-context>
<user-request>beads-new</user-request>
</session-context>`,
          },
        ],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - should start fresh with new issue, NOT resume old
      expect(output.parts[0].text).toContain("beads-new")
      expect(output.parts[0].text).not.toContain("Resuming")
      expect(output.parts[0].text).not.toContain("beads-old")

      // Active state should be updated
      const updatedState = readActiveWorkState(testDir)
      expect(updatedState?.active_issue_id).toBe("beads-new")
    })

    test("should strip ultrawork/ulw keywords from issue hint", async () => {
      // given - user specifies issue with ultrawork keyword
      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [
          {
            type: "text",
            text: `<session-context>
<user-request>fix-auth-bug ultrawork</user-request>
</session-context>`,
          },
        ],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - should use cleaned hint without ultrawork
      expect(output.parts[0].text).toContain("fix-auth-bug")
      expect(output.parts[0].text).toContain("Starting Work on Specified Issue")
    })

    test("should strip ulw keyword from issue hint", async () => {
      // given - user specifies issue with ulw keyword
      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [
          {
            type: "text",
            text: `<session-context>
<user-request>api-refactor ulw</user-request>
</session-context>`,
          },
        ],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - should use cleaned hint without ulw
      expect(output.parts[0].text).toContain("api-refactor")
      expect(output.parts[0].text).toContain("Starting Work on Specified Issue")
    })

    test("should write active work state to disk for beads discovery flow", async () => {
      // given - no existing state
      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      // when
      await hook["chat.message"](
        { sessionID: "ses-new" },
        output
      )

      // then - active work state should be persisted
      const state = readActiveWorkState(testDir)
      expect(state).not.toBeNull()
      expect(state?.session_ids).toContain("ses-new")
      expect(state?.agent).toBe("atlas")
      expect(state?.active_issue_id).toBeNull()
    })

    test("should not reference plan files or boulder.json in output", async () => {
      // given - hook triggered with no state
      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - no legacy references
      expect(output.parts[0].text).not.toContain(".sisyphus/plans")
      expect(output.parts[0].text).not.toContain("boulder.json")
      expect(output.parts[0].text).not.toContain("Prometheus")
      expect(output.parts[0].text).not.toContain("/plan ")
    })
  })

  describe("session agent management", () => {
    test("should update session agent to Atlas when start-work command is triggered", async () => {
      // given
      const updateSpy = spyOn(sessionState, "updateSessionAgent")

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      // when
      await hook["chat.message"](
        { sessionID: "ses-prometheus-to-sisyphus" },
        output
      )

      // then
      expect(updateSpy).toHaveBeenCalledWith("ses-prometheus-to-sisyphus", "atlas")
      updateSpy.mockRestore()
    })
  })
})
