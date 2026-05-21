import { describe, expect, it } from "vitest";
import { MockChoreAgentProvider } from "../src/agent/MockChoreAgentProvider.js";
import { OpenAiChoreAgentProvider } from "../src/agent/OpenAiChoreAgentProvider.js";
import { createAgentProvider } from "../src/agent/createAgentProvider.js";

describe("createAgentProvider", () => {
  it("uses the mock provider by default", () => {
    const provider = createAgentProvider({});

    expect(provider).toBeInstanceOf(MockChoreAgentProvider);
  });

  it("uses the mock provider when AGENT_PROVIDER is mock", () => {
    const provider = createAgentProvider({ AGENT_PROVIDER: "mock" });

    expect(provider).toBeInstanceOf(MockChoreAgentProvider);
  });

  it("uses the OpenAI provider when AGENT_PROVIDER is openai and an API key is present", () => {
    const provider = createAgentProvider({
      AGENT_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      OPENAI_AGENT_MODEL: "gpt-test"
    });

    expect(provider).toBeInstanceOf(OpenAiChoreAgentProvider);
  });

  it("fails clearly when OpenAI provider is selected without an API key", () => {
    expect(() => createAgentProvider({ AGENT_PROVIDER: "openai" })).toThrow(
      "OPENAI_API_KEY is required when AGENT_PROVIDER=openai"
    );
  });

  it("fails clearly for an unsupported AGENT_PROVIDER value", () => {
    expect(() => createAgentProvider({ AGENT_PROVIDER: "local-ai" })).toThrow(
      "Unsupported AGENT_PROVIDER: local-ai"
    );
  });
});
