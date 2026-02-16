import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { randomUUID } from "node:crypto"
import * as childProcess from "node:child_process"
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

    test("should block work when no active state and no hint", async () => {
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

      // then - should block and request valid epic hint
      expect(output.parts[0].text).toContain("Cannot Start Work")
      expect(output.parts[0].text).toContain("/start-work <beads-epic-id>")
      // Should NOT reference plan files or boulder.json
      expect(output.parts[0].text).not.toContain(".sisyphus/plans")
      expect(output.parts[0].text).not.toContain("boulder.json")
    })

    test("should auto-select no-hint epic when exactly one open/in-progress epic exists", async () => {
      const execSpy = spyOn(childProcess, "execFileSync")
      execSpy.mockImplementation(
        ((file: string, args?: readonly string[] | childProcess.ExecFileSyncOptions) => {
          const argv = Array.isArray(args) ? args : []
          if (file === "bd" && argv.includes("list") && argv.includes("in_progress")) {
            return JSON.stringify([{ id: "beads-101", title: "Single Epic", status: "in_progress", type: "epic" }])
          }
          if (file === "bd" && argv.includes("list") && argv.includes("open")) {
            return JSON.stringify([])
          }
          return JSON.stringify([])
        }) as typeof childProcess.execFileSync
      )

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      try {
        await hook["chat.message"](
          { sessionID: "session-auto-epic" },
          output
        )

        expect(output.parts[0].text).toContain("Starting Work Session")
        expect(output.parts[0].text).toContain("beads-101")
        expect(output.parts[0].text).not.toContain("Cannot Start Work")
        expect(output.parts[0].text).toContain(
          "Parallelize all currently ready independent issues in one wave"
        )

        const state = readActiveWorkState(testDir)
        expect(state?.active_epic_id).toBe("beads-101")
      } finally {
        execSpy.mockRestore()
      }
    })

    test("should block and show candidate list when multiple no-hint epics exist", async () => {
      const execSpy = spyOn(childProcess, "execFileSync")
      execSpy.mockImplementation(
        ((file: string, args?: readonly string[] | childProcess.ExecFileSyncOptions) => {
          const argv = Array.isArray(args) ? args : []
          if (file === "bd" && argv.includes("list") && argv.includes("in_progress")) {
            return JSON.stringify([{ id: "beads-201", title: "First Epic", status: "in_progress", type: "epic" }])
          }
          if (file === "bd" && argv.includes("list") && argv.includes("open")) {
            return JSON.stringify([{ id: "beads-202", title: "Second Epic", status: "open", type: "epic" }])
          }
          return JSON.stringify([])
        }) as typeof childProcess.execFileSync
      )

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      try {
        await hook["chat.message"](
          { sessionID: "session-multi-epic" },
          output
        )

        expect(output.parts[0].text).toContain("Cannot Start Work")
        expect(output.parts[0].text).toContain("Multiple open/in-progress epics")
        expect(output.parts[0].text).toContain("beads-201")
        expect(output.parts[0].text).toContain("beads-202")
        expect(output.parts[0].text).toContain("/start-work <beads-epic-id>")

        const state = readActiveWorkState(testDir)
        expect(state).toBeNull()
      } finally {
        execSpy.mockRestore()
      }
    })

    test("should inject resume info when existing active work state found", async () => {
      // given - existing active work state
      const state: ActiveWorkState = {
        active_epic_id: "beads-abc",
        active_epic_title: "Fix login bug",
        started_at: "2026-01-02T10:00:00Z",
        session_ids: ["session-1"],
        agent: "atlas",
      }
      writeActiveWorkState(testDir, state)

      const execSpy = spyOn(childProcess, "execFileSync")
      execSpy.mockImplementation(
        ((file: string, args?: readonly string[] | childProcess.ExecFileSyncOptions) => {
          const argv = Array.isArray(args) ? args : []
          if (file === "bd" && argv.includes("show") && argv.includes("beads-abc")) {
            return JSON.stringify({ id: "beads-abc", title: "Fix login bug", status: "in_progress", type: "epic" })
          }
          return JSON.stringify([])
        }) as typeof childProcess.execFileSync
      )

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      try {
        // when
        await hook["chat.message"](
          { sessionID: "session-123" },
          output
        )

        // then - should show resuming status with beads details
        expect(output.parts[0].text).toContain("Resuming Active Work Session")
        expect(output.parts[0].text).toContain("Active Epic")
        expect(output.parts[0].text).toContain("Fix login bug")
        expect(output.parts[0].text).toContain("bd show")
      } finally {
        execSpy.mockRestore()
      }
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

    test("should block when explicit epic hint cannot be resolved", async () => {
      // given - user specifies an epic hint that cannot be resolved
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

      // then - should block and keep the hint visible
      expect(output.parts[0].text).toContain("Cannot Start Work")
      expect(output.parts[0].text).toContain("beads-xyz")
      expect(output.parts[0].text).toContain("/start-work beads-123")
    })

    test("should not override existing state when hint cannot be resolved", async () => {
      // given - existing active work state AND user provides an unresolved epic hint
      const existingState: ActiveWorkState = {
        active_epic_id: "beads-old",
        active_epic_title: "Old work",
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

      // then - should block and keep previous persisted state untouched
      expect(output.parts[0].text).toContain("Cannot Start Work")
      expect(output.parts[0].text).toContain("beads-new")

      // Active state should be updated
      const updatedState = readActiveWorkState(testDir)
      expect(updatedState?.active_epic_id).toBe("beads-old")
    })

    test("should strip ultrawork/ulw keywords from epic hint", async () => {
      // given - user specifies epic with ultrawork keyword
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

      // then - should use cleaned hint without ultrawork and block unresolved hint
      expect(output.parts[0].text).toContain("fix-auth-bug")
      expect(output.parts[0].text).toContain("Cannot Start Work")
    })

    test("should strip ulw keyword from epic hint", async () => {
      // given - user specifies epic with ulw keyword
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

      // then - should use cleaned hint without ulw and block unresolved hint
      expect(output.parts[0].text).toContain("api-refactor")
      expect(output.parts[0].text).toContain("Cannot Start Work")
    })

    test("should not write active work state when no epic is resolved", async () => {
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

      // then - active work state should not be created without resolved epic id
      const state = readActiveWorkState(testDir)
      expect(state).toBeNull()
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
