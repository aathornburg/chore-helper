/*
  This factory matches Spring profile-based bean selection. It keeps app
  startup responsible for choosing an implementation while controllers
  depend only on the AgentProvider service contract.
*/
import type { AgentProvider } from "./AgentProvider.js";
import { MockChoreAgentProvider } from "./MockChoreAgentProvider.js";
import {
  DEFAULT_OPENAI_AGENT_MODEL,
  OpenAiChoreAgentProvider
} from "./OpenAiChoreAgentProvider.js";

type AgentProviderEnv = {
  AGENT_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_AGENT_MODEL?: string;
};

export function createAgentProvider(env: AgentProviderEnv = process.env): AgentProvider {
  const providerName = env.AGENT_PROVIDER ?? "mock";

  if (providerName === "mock") {
    return new MockChoreAgentProvider();
  }

  if (providerName === "openai") {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required when AGENT_PROVIDER=openai");
    }

    return new OpenAiChoreAgentProvider(
      env.OPENAI_AGENT_MODEL ?? DEFAULT_OPENAI_AGENT_MODEL
    );
  }

  throw new Error(`Unsupported AGENT_PROVIDER: ${providerName}`);
}
