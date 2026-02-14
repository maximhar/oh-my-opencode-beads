import { describe, expect, mock, test } from "bun:test"

mock.module("../../hooks", () => ({
  createTodoContinuationEnforcer: () => ({
    markRecovering: () => {},
    markRecoveryComplete: () => {},
    handler: async () => {},
  }),
  createBackgroundNotificationHook: () => ({ event: async () => {} }),
  createStopContinuationGuardHook: () => ({
    isStopped: () => false,
    event: async () => {},
  }),
  createCompactionContextInjector: () => ({ event: async () => {} }),
  createCompactionTodoPreserverHook: () => ({ capture: async () => {}, event: async () => {} }),
  createAtlasHook: () => ({ handler: async () => {} }),
}))

mock.module("../../shared/safe-create-hook", () => ({
  safeCreateHook: (_hookName: string, factory: () => unknown) => factory(),
}))

mock.module("../unstable-agent-babysitter", () => ({
  createUnstableAgentBabysitter: () => ({ event: async () => {} }),
}))

const { createContinuationHooks } = await import("./create-continuation-hooks")

describe("createContinuationHooks", () => {
  test("keeps compaction-todo-preserver enabled when experimental config is present", () => {
    //#given
    const hooks = createContinuationHooks({
      ctx: { directory: "/tmp" } as any,
      pluginConfig: { experimental: {} } as any,
      isHookEnabled: (hookName) => hookName === "compaction-todo-preserver",
      safeHookEnabled: true,
      backgroundManager: {} as any,
      sessionRecovery: null,
    })

    //#then
    expect(hooks.compactionTodoPreserver).not.toBeNull()
  })
})
