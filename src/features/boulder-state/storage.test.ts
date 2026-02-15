import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  readBoulderState,
  writeBoulderState,
  appendSessionId,
  clearBoulderState,
  getPlanProgress,
  getPlanName,
  createBoulderState,
  findPrometheusPlans,
  createActiveWorkState,
  readActiveWorkState,
  writeActiveWorkState,
  clearActiveWorkState,
  appendActiveWorkSessionId,
} from "./storage"
import type { BoulderState, ActiveWorkState } from "./types"

describe("boulder-state", () => {
  const TEST_DIR = join(tmpdir(), "boulder-state-test-" + Date.now())
  const SISYPHUS_DIR = join(TEST_DIR, ".sisyphus")

  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
    if (!existsSync(SISYPHUS_DIR)) {
      mkdirSync(SISYPHUS_DIR, { recursive: true })
    }
    clearBoulderState(TEST_DIR)
    clearActiveWorkState(TEST_DIR)
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  // -----------------------------------------------------------------------
  // Legacy boulder state tests (kept for backward-compat verification)
  // -----------------------------------------------------------------------

  describe("readBoulderState", () => {
    test("should return null when no boulder.json exists", () => {
      const result = readBoulderState(TEST_DIR)
      expect(result).toBeNull()
    })

    test("should return null for JSON null value", () => {
      const boulderFile = join(SISYPHUS_DIR, "boulder.json")
      writeFileSync(boulderFile, "null")
      const result = readBoulderState(TEST_DIR)
      expect(result).toBeNull()
    })

    test("should return null for JSON primitive value", () => {
      const boulderFile = join(SISYPHUS_DIR, "boulder.json")
      writeFileSync(boulderFile, '"just a string"')
      const result = readBoulderState(TEST_DIR)
      expect(result).toBeNull()
    })

    test("should default session_ids to [] when missing from JSON", () => {
      const boulderFile = join(SISYPHUS_DIR, "boulder.json")
      writeFileSync(boulderFile, JSON.stringify({
        active_plan: "/path/to/plan.md",
        started_at: "2026-01-01T00:00:00Z",
        plan_name: "plan",
      }))
      const result = readBoulderState(TEST_DIR)
      expect(result).not.toBeNull()
      expect(result!.session_ids).toEqual([])
    })

    test("should default session_ids to [] when not an array", () => {
      const boulderFile = join(SISYPHUS_DIR, "boulder.json")
      writeFileSync(boulderFile, JSON.stringify({
        active_plan: "/path/to/plan.md",
        started_at: "2026-01-01T00:00:00Z",
        session_ids: "not-an-array",
        plan_name: "plan",
      }))
      const result = readBoulderState(TEST_DIR)
      expect(result).not.toBeNull()
      expect(result!.session_ids).toEqual([])
    })

    test("should default session_ids to [] for empty object", () => {
      const boulderFile = join(SISYPHUS_DIR, "boulder.json")
      writeFileSync(boulderFile, JSON.stringify({}))
      const result = readBoulderState(TEST_DIR)
      expect(result).not.toBeNull()
      expect(result!.session_ids).toEqual([])
    })

    test("should read valid boulder state", () => {
      const state: BoulderState = {
        active_plan: "/path/to/plan.md",
        started_at: "2026-01-02T10:00:00Z",
        session_ids: ["session-1", "session-2"],
        plan_name: "my-plan",
      }
      writeBoulderState(TEST_DIR, state)
      const result = readBoulderState(TEST_DIR)
      expect(result).not.toBeNull()
      expect(result?.active_plan).toBe("/path/to/plan.md")
      expect(result?.session_ids).toEqual(["session-1", "session-2"])
      expect(result?.plan_name).toBe("my-plan")
    })
  })

  describe("writeBoulderState", () => {
    test("should write state and create .sisyphus directory if needed", () => {
      const state: BoulderState = {
        active_plan: "/test/plan.md",
        started_at: "2026-01-02T12:00:00Z",
        session_ids: ["ses-123"],
        plan_name: "test-plan",
      }
      const success = writeBoulderState(TEST_DIR, state)
      const readBack = readBoulderState(TEST_DIR)
      expect(success).toBe(true)
      expect(readBack).not.toBeNull()
      expect(readBack?.active_plan).toBe("/test/plan.md")
    })
  })

  describe("appendSessionId", () => {
    test("should append new session id to existing state", () => {
      const state: BoulderState = {
        active_plan: "/plan.md",
        started_at: "2026-01-02T10:00:00Z",
        session_ids: ["session-1"],
        plan_name: "plan",
      }
      writeBoulderState(TEST_DIR, state)
      const result = appendSessionId(TEST_DIR, "session-2")
      expect(result).not.toBeNull()
      expect(result?.session_ids).toEqual(["session-1", "session-2"])
    })

    test("should not duplicate existing session id", () => {
      const state: BoulderState = {
        active_plan: "/plan.md",
        started_at: "2026-01-02T10:00:00Z",
        session_ids: ["session-1"],
        plan_name: "plan",
      }
      writeBoulderState(TEST_DIR, state)
      appendSessionId(TEST_DIR, "session-1")
      const result = readBoulderState(TEST_DIR)
      expect(result?.session_ids).toEqual(["session-1"])
    })

    test("should return null when no state exists", () => {
      const result = appendSessionId(TEST_DIR, "new-session")
      expect(result).toBeNull()
    })

    test("should not crash when boulder.json has no session_ids field", () => {
      const boulderFile = join(SISYPHUS_DIR, "boulder.json")
      writeFileSync(boulderFile, JSON.stringify({
        active_plan: "/plan.md",
        started_at: "2026-01-01T00:00:00Z",
        plan_name: "plan",
      }))
      const result = appendSessionId(TEST_DIR, "ses-new")
      expect(result).not.toBeNull()
      expect(result!.session_ids).toContain("ses-new")
    })
  })

  describe("clearBoulderState", () => {
    test("should remove boulder.json", () => {
      const state: BoulderState = {
        active_plan: "/plan.md",
        started_at: "2026-01-02T10:00:00Z",
        session_ids: ["session-1"],
        plan_name: "plan",
      }
      writeBoulderState(TEST_DIR, state)
      const success = clearBoulderState(TEST_DIR)
      const result = readBoulderState(TEST_DIR)
      expect(success).toBe(true)
      expect(result).toBeNull()
    })

    test("should succeed even when no file exists", () => {
      const success = clearBoulderState(TEST_DIR)
      expect(success).toBe(true)
    })
  })

  describe("getPlanProgress (deprecated)", () => {
    test("should count completed and uncompleted checkboxes", () => {
      const planPath = join(TEST_DIR, "test-plan.md")
      writeFileSync(planPath, `# Plan
- [ ] Task 1
- [x] Task 2  
- [ ] Task 3
- [X] Task 4
`)
      const progress = getPlanProgress(planPath)
      expect(progress.total).toBe(4)
      expect(progress.completed).toBe(2)
      expect(progress.isComplete).toBe(false)
    })

    test("should return isComplete true when all checked", () => {
      const planPath = join(TEST_DIR, "complete-plan.md")
      writeFileSync(planPath, `# Plan
- [x] Task 1
- [X] Task 2
`)
      const progress = getPlanProgress(planPath)
      expect(progress.total).toBe(2)
      expect(progress.completed).toBe(2)
      expect(progress.isComplete).toBe(true)
    })

    test("should return isComplete true for empty plan", () => {
      const planPath = join(TEST_DIR, "empty-plan.md")
      writeFileSync(planPath, "# Plan\nNo tasks here")
      const progress = getPlanProgress(planPath)
      expect(progress.total).toBe(0)
      expect(progress.isComplete).toBe(true)
    })

    test("should handle non-existent file", () => {
      const progress = getPlanProgress("/non/existent/file.md")
      expect(progress.total).toBe(0)
      expect(progress.isComplete).toBe(true)
    })
  })

  describe("getPlanName (deprecated)", () => {
    test("should extract plan name from path", () => {
      const path = "/home/user/.sisyphus/plans/project/my-feature.md"
      const name = getPlanName(path)
      expect(name).toBe("my-feature")
    })
  })

  describe("createBoulderState (deprecated)", () => {
    test("should create state with correct fields", () => {
      const planPath = "/path/to/auth-refactor.md"
      const sessionId = "ses-abc123"
      const state = createBoulderState(planPath, sessionId)
      expect(state.active_plan).toBe(planPath)
      expect(state.session_ids).toEqual([sessionId])
      expect(state.plan_name).toBe("auth-refactor")
      expect(state.started_at).toBeDefined()
    })

    test("should include agent field when provided", () => {
      const state = createBoulderState("/path/to/feature.md", "ses-xyz789", "atlas")
      expect(state.agent).toBe("atlas")
    })

    test("should allow agent to be undefined", () => {
      const state = createBoulderState("/path/to/legacy.md", "ses-legacy")
      expect(state.agent).toBeUndefined()
    })
  })

  // -----------------------------------------------------------------------
  // Beads-oriented ActiveWorkState tests
  // -----------------------------------------------------------------------

  describe("createActiveWorkState", () => {
    test("should create state with epic id and title", () => {
      const state = createActiveWorkState("ses-1", "beads-abc", "Fix login", "atlas")
      expect(state.active_epic_id).toBe("beads-abc")
      expect(state.active_epic_title).toBe("Fix login")
      expect(state.session_ids).toEqual(["ses-1"])
      expect(state.agent).toBe("atlas")
      expect(state.started_at).toBeDefined()
    })

    test("should create state with null epic when not specified", () => {
      const state = createActiveWorkState("ses-2")
      expect(state.active_epic_id).toBeNull()
      expect(state.active_epic_title).toBeNull()
      expect(state.session_ids).toEqual(["ses-2"])
      expect(state.agent).toBeUndefined()
    })
  })

  describe("readActiveWorkState / writeActiveWorkState", () => {
    test("should round-trip active work state", () => {
      const state: ActiveWorkState = {
        active_epic_id: "beads-xyz",
        active_epic_title: "Refactor auth",
        started_at: "2026-02-14T10:00:00Z",
        session_ids: ["ses-a"],
        agent: "atlas",
      }
      const written = writeActiveWorkState(TEST_DIR, state)
      expect(written).toBe(true)

      const readBack = readActiveWorkState(TEST_DIR)
      expect(readBack).not.toBeNull()
      expect(readBack?.active_epic_id).toBe("beads-xyz")
      expect(readBack?.active_epic_title).toBe("Refactor auth")
      expect(readBack?.session_ids).toEqual(["ses-a"])
    })

    test("should return null when no active-work.json exists", () => {
      const result = readActiveWorkState(TEST_DIR)
      expect(result).toBeNull()
    })

    test("should return null for invalid JSON", () => {
      const filePath = join(SISYPHUS_DIR, "active-work.json")
      writeFileSync(filePath, "not json")
      const result = readActiveWorkState(TEST_DIR)
      expect(result).toBeNull()
    })

    test("should default session_ids to [] when missing", () => {
      const filePath = join(SISYPHUS_DIR, "active-work.json")
      writeFileSync(filePath, JSON.stringify({
        active_epic_id: "beads-123",
        active_epic_title: "Test",
        started_at: "2026-01-01T00:00:00Z",
      }))
      const result = readActiveWorkState(TEST_DIR)
      expect(result).not.toBeNull()
      expect(result!.session_ids).toEqual([])
    })
  })

  describe("clearActiveWorkState", () => {
    test("should remove active-work.json", () => {
      const state = createActiveWorkState("ses-1", "beads-abc", "Test")
      writeActiveWorkState(TEST_DIR, state)
      const success = clearActiveWorkState(TEST_DIR)
      expect(success).toBe(true)
      expect(readActiveWorkState(TEST_DIR)).toBeNull()
    })

    test("should succeed when no file exists", () => {
      const success = clearActiveWorkState(TEST_DIR)
      expect(success).toBe(true)
    })
  })

  describe("appendActiveWorkSessionId", () => {
    test("should append new session id", () => {
      const state = createActiveWorkState("ses-1", "beads-abc", "Test")
      writeActiveWorkState(TEST_DIR, state)

      const result = appendActiveWorkSessionId(TEST_DIR, "ses-2")
      expect(result).not.toBeNull()
      expect(result?.session_ids).toEqual(["ses-1", "ses-2"])
    })

    test("should not duplicate existing session id", () => {
      const state = createActiveWorkState("ses-1", "beads-abc", "Test")
      writeActiveWorkState(TEST_DIR, state)

      appendActiveWorkSessionId(TEST_DIR, "ses-1")
      const readBack = readActiveWorkState(TEST_DIR)
      expect(readBack?.session_ids).toEqual(["ses-1"])
    })

    test("should return null when no state exists", () => {
      const result = appendActiveWorkSessionId(TEST_DIR, "ses-new")
      expect(result).toBeNull()
    })
  })
})
