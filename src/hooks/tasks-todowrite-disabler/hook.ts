import { BLOCKED_TOOLS, REPLACEMENT_MESSAGE } from "./constants";

export function createTasksTodowriteDisablerHook(
  _config?: unknown,
) {
  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      _output: { args: Record<string, unknown> },
    ) => {
      const toolName = input.tool as string;
      if (
        BLOCKED_TOOLS.some(
          (blocked) => blocked.toLowerCase() === toolName.toLowerCase(),
        )
      ) {
        throw new Error(REPLACEMENT_MESSAGE);
      }
    },
  };
}
