import { describe, expect, mock, test } from "bun:test"

const stubTool = { description: "stub", parameters: {}, execute: async () => "ok" } as any

mock.module("../tools", () => ({
  builtinTools: {},
  createBackgroundTools: () => ({}),
  createCallOmoAgent: () => stubTool,
  createLookAt: () => stubTool,
  createSkillTool: () => stubTool,
  createSkillMcpTool: () => stubTool,
  createSlashcommandTool: () => stubTool,
  createGrepTools: () => ({}),
  createGlobTools: () => ({}),
  createAstGrepTools: () => ({}),
  createSessionManagerTools: () => ({}),
  createDelegateTask: () => stubTool,
  discoverCommandsSync: () => ({}),
  interactive_bash: stubTool,
  createTaskCreateTool: () => stubTool,
  createTaskGetTool: () => stubTool,
  createTaskList: () => stubTool,
  createTaskUpdateTool: () => stubTool,
}))

mock.module("../features/claude-code-session-state", () => ({
  getMainSessionID: () => "session-main",
}))

mock.module("../shared", () => ({
  log: () => {},
}))

const { createToolRegistry } = await import("./tool-registry")

describe("createToolRegistry", () => {
  test("always includes task_* tools", () => {
    //#given
    const result = createToolRegistry({
      ctx: { directory: "/tmp", client: {} } as any,
      pluginConfig: {} as any,
      managers: {
        backgroundManager: {} as any,
        tmuxSessionManager: { onSessionCreated: async () => {} } as any,
        skillMcpManager: {} as any,
      },
      skillContext: {
        browserProvider: "playwright",
        disabledSkills: new Set<string>(),
        availableSkills: [],
        mergedSkills: [],
      } as any,
      availableCategories: [],
    })

    //#then
    expect(result.filteredTools.task_create).toBeDefined()
    expect(result.filteredTools.task_get).toBeDefined()
    expect(result.filteredTools.task_list).toBeDefined()
    expect(result.filteredTools.task_update).toBeDefined()
  })
})
