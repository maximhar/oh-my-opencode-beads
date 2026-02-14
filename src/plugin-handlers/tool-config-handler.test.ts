import { describe, test, expect } from "bun:test"
import type { OhMyOpenCodeConfig } from "../config"
import { applyToolConfig } from "./tool-config-handler"

function createBaseAgentResult() {
  return {
    atlas: { permission: {} },
    sisyphus: { permission: {} },
    hephaestus: { permission: {} },
    prometheus: { permission: {} },
    "sisyphus-junior": { permission: {} },
  } as Record<string, { permission?: Record<string, unknown> }>
}

describe("applyToolConfig", () => {
  test("always disables todowrite/todoread and denies primary agents", () => {
    //#given
    const config: Record<string, unknown> = { tools: {}, permission: {} }
    const pluginConfig: OhMyOpenCodeConfig = {}
    const agentResult = createBaseAgentResult()

    //#when
    applyToolConfig({ config, pluginConfig, agentResult })

    //#then
    const tools = config.tools as Record<string, unknown>
    expect(tools.todowrite).toBe(false)
    expect(tools.todoread).toBe(false)

    expect(agentResult.atlas?.permission?.todowrite).toBe("deny")
    expect(agentResult.atlas?.permission?.todoread).toBe("deny")
    expect(agentResult.sisyphus?.permission?.todowrite).toBe("deny")
    expect(agentResult.sisyphus?.permission?.todoread).toBe("deny")
    expect(agentResult.hephaestus?.permission?.todowrite).toBe("deny")
    expect(agentResult.hephaestus?.permission?.todoread).toBe("deny")
    expect(agentResult.prometheus?.permission?.todowrite).toBe("deny")
    expect(agentResult.prometheus?.permission?.todoread).toBe("deny")
    expect(agentResult["sisyphus-junior"]?.permission?.todowrite).toBe("deny")
    expect(agentResult["sisyphus-junior"]?.permission?.todoread).toBe("deny")
  })

  test("still denies todo tools when unrelated experimental flags are set", () => {
    //#given
    const config: Record<string, unknown> = { tools: {}, permission: {} }
    const pluginConfig: OhMyOpenCodeConfig = {
      experimental: { aggressive_truncation: true },
    }
    const agentResult = createBaseAgentResult()

    //#when
    applyToolConfig({ config, pluginConfig, agentResult })

    //#then
    const tools = config.tools as Record<string, unknown>
    expect(tools.todowrite).toBe(false)
    expect(tools.todoread).toBe(false)
    expect(agentResult.sisyphus?.permission?.todowrite).toBe("deny")
    expect(agentResult.sisyphus?.permission?.todoread).toBe("deny")
  })
})
