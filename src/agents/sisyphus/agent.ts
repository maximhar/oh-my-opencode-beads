import type { AgentConfig } from "@opencode-ai/sdk";
import type { AgentMode, AgentPromptMetadata } from "../types";
import { isGptModel } from "../types";
import type {
  AvailableAgent,
  AvailableSkill,
  AvailableCategory,
} from "../dynamic-agent-prompt-builder";
import { categorizeTools } from "../dynamic-agent-prompt-builder";
import { buildDefaultSisyphusPrompt } from "./default";
import { buildGptSisyphusPrompt } from "./gpt";

const MODE: AgentMode = "primary";
export const SISYPHUS_PROMPT_METADATA: AgentPromptMetadata = {
  category: "utility",
  cost: "EXPENSIVE",
  promptAlias: "Sisyphus",
  triggers: [],
};

export type SisyphusPromptSource = "default" | "gpt";

export function getSisyphusPromptSource(model: string): SisyphusPromptSource {
  return isGptModel(model) ? "gpt" : "default";
}

export function createSisyphusAgent(
  model: string,
  availableAgents?: AvailableAgent[],
  availableToolNames?: string[],
  availableSkills?: AvailableSkill[],
  availableCategories?: AvailableCategory[],
  useTaskSystem = false,
): AgentConfig {
  const tools = availableToolNames ? categorizeTools(availableToolNames) : [];
  const skills = availableSkills ?? [];
  const categories = availableCategories ?? [];
  const source = getSisyphusPromptSource(model);
  const agentList = availableAgents ?? [];

  const prompt =
    source === "gpt"
      ? buildGptSisyphusPrompt(agentList, tools, skills, categories, useTaskSystem)
      : buildDefaultSisyphusPrompt(agentList, tools, skills, categories, useTaskSystem);

  const permission = {
    question: "allow",
    call_omo_agent: "deny",
  } as AgentConfig["permission"];

  const base = {
    description:
      "Powerful AI orchestrator. Plans obsessively with beads issues, assesses search complexity before exploration, delegates strategically via category+skills combinations. Uses explore for internal code (parallel-friendly), librarian for external docs. (Sisyphus - OhMyOpenCode)",
    mode: MODE,
    model,
    maxTokens: 64000,
    prompt,
    color: "#00CED1",
    permission,
  };

  if (isGptModel(model)) {
    return { ...base, reasoningEffort: "medium" };
  }

  return { ...base, thinking: { type: "enabled", budgetTokens: 32000 } };
}

createSisyphusAgent.mode = MODE;
