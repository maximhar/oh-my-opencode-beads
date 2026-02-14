import type {
  AvailableAgent,
  AvailableTool,
  AvailableSkill,
  AvailableCategory,
} from "../dynamic-agent-prompt-builder";
import { buildGptSisyphusPromptContent } from "./builder";

export function buildGptSisyphusPrompt(
  availableAgents: AvailableAgent[],
  availableTools: AvailableTool[] = [],
  availableSkills: AvailableSkill[] = [],
  availableCategories: AvailableCategory[] = [],
  useTaskSystem = false,
): string {
  return buildGptSisyphusPromptContent(
    availableAgents,
    availableTools,
    availableSkills,
    availableCategories,
    useTaskSystem,
  );
}
