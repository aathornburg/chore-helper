import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MockChoreAgentProvider } from "../src/agent/MockChoreAgentProvider.js";
import { createApp } from "../src/app.js";
import { createInMemoryStore } from "../src/repositories/inMemoryStore.js";

function auth(userId: string) {
  return { Authorization: `Bearer ${userId}` };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("security hardening", () => {
  it("fails closed in production when APP_BASE_URL is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "");

    expect(() => createApp({
      store: createInMemoryStore(),
      agentProvider: new MockChoreAgentProvider(),
      authMode: "test"
    })).toThrow("APP_BASE_URL is required in production");
  });

  it("fails closed in production when Google OAuth is configured without token encryption", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "https://app.cleanly.test");
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
    vi.stubEnv("GOOGLE_CALENDAR_REDIRECT_URI", "https://api.cleanly.test/api/me/calendar/google/callback");
    vi.stubEnv("GOOGLE_OAUTH_STATE_SECRET", "state-secret-with-enough-randomness");
    vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", "");

    expect(() => createApp({
      store: createInMemoryStore(),
      agentProvider: new MockChoreAgentProvider(),
      authMode: "test"
    })).toThrow("GOOGLE_TOKEN_ENCRYPTION_KEY is required when Google Calendar is configured in production");
  });

  it("sets core security headers on API responses", async () => {
    const app = createApp({
      store: createInMemoryStore(),
      agentProvider: new MockChoreAgentProvider(),
      authMode: "test"
    });

    const response = await request(app).get("/api/health").expect(200);

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  it("only allows configured browser origins through CORS", async () => {
    vi.stubEnv("APP_BASE_URL", "https://app.cleanly.test");
    vi.stubEnv("APP_ALLOWED_ORIGINS", "https://app.cleanly.test");
    const app = createApp({
      store: createInMemoryStore(),
      agentProvider: new MockChoreAgentProvider(),
      authMode: "test"
    });

    const allowed = await request(app)
      .options("/api/me")
      .set("Origin", "https://app.cleanly.test")
      .set("Access-Control-Request-Method", "GET")
      .expect(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://app.cleanly.test");

    const blocked = await request(app)
      .options("/api/me")
      .set("Origin", "https://evil.test")
      .set("Access-Control-Request-Method", "GET")
      .expect(403);
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
    expect(blocked.body).toEqual({ error: "Origin not allowed." });
  });

  it("rate limits expensive authenticated endpoints", async () => {
    vi.stubEnv("EXPENSIVE_RATE_LIMIT_MAX", "1");
    vi.stubEnv("EXPENSIVE_RATE_LIMIT_WINDOW_MS", "60000");
    const app = createApp({
      store: createInMemoryStore(),
      agentProvider: new MockChoreAgentProvider(),
      authMode: "test"
    });
    const created = await request(app)
      .post("/api/households")
      .set(auth("member@example.com"))
      .send({ name: "Home" })
      .expect(201);

    await request(app)
      .post(`/api/households/${created.body.id}/assistant/chat`)
      .set(auth("member@example.com"))
      .send({ message: "What should I do first?" })
      .expect(200);

    await request(app)
      .post(`/api/households/${created.body.id}/assistant/chat`)
      .set(auth("member@example.com"))
      .send({ message: "And then?" })
      .expect(429)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Too many requests. Please try again later." });
      });
  });
});
