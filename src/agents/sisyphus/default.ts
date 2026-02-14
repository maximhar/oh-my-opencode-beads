import type {
  AvailableAgent,
  AvailableTool,
  AvailableSkill,
  AvailableCategory,
} from "../dynamic-agent-prompt-builder";
import { buildDefaultSisyphusPromptContent } from "./builder";

export function buildDefaultSisyphusPrompt(
  availableAgents: AvailableAgent[],
  availableTools: AvailableTool[] = [],
  availableSkills: AvailableSkill[] = [],
  availableCategories: AvailableCategory[] = [],
  useTaskSystem = false,
): string {
  return buildDefaultSisyphusPromptContent(
    availableAgents,
    availableTools,
    availableSkills,
    availableCategories,
    useTaskSystem,
  );
}
