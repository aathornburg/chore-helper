import type { NextFunction, Request, Response } from "express";
import type { CorsOptions } from "cors";

const LOCAL_DEVELOPMENT_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:4200",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4200",
  "http://127.0.0.1:5173"
];

function isProduction(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "production";
}

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseOrigin(value: string | undefined) {
  if (!present(value)) return undefined;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return undefined;
  }
}

function googleConfigIsStarted(env: NodeJS.ProcessEnv) {
  return present(env.GOOGLE_CLIENT_ID) ||
    present(env.GOOGLE_CLIENT_SECRET) ||
    present(env.GOOGLE_CALENDAR_REDIRECT_URI);
}

export function assertProductionSecurityConfig(env: NodeJS.ProcessEnv = process.env) {
  if (!isProduction(env)) return;

  const appOrigin = parseOrigin(env.APP_BASE_URL);
  if (!appOrigin) {
    throw new Error("APP_BASE_URL is required in production");
  }
  if (!appOrigin.startsWith("https://")) {
    throw new Error("APP_BASE_URL must use https in production");
  }

  if (!googleConfigIsStarted(env)) return;

  if (!present(env.GOOGLE_CLIENT_ID) || !present(env.GOOGLE_CLIENT_SECRET) || !present(env.GOOGLE_CALENDAR_REDIRECT_URI)) {
    throw new Error("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALENDAR_REDIRECT_URI are required together in production");
  }
  if (!present(env.GOOGLE_OAUTH_STATE_SECRET)) {
    throw new Error("GOOGLE_OAUTH_STATE_SECRET is required when Google Calendar is configured in production");
  }
  if (!present(env.GOOGLE_TOKEN_ENCRYPTION_KEY)) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is required when Google Calendar is configured in production");
  }
}

export function allowedOrigins(env: NodeJS.ProcessEnv = process.env) {
  const configured = (env.APP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const appOrigin = parseOrigin(env.APP_BASE_URL);

  return new Set([
    ...(isProduction(env) ? [] : LOCAL_DEVELOPMENT_ORIGINS),
    ...(appOrigin ? [appOrigin] : []),
    ...configured
  ]);
}

export function createCorsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const origins = allowedOrigins(env);

  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      return callback(null, origins.has(origin));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    optionsSuccessStatus: 204
  };
}

export function rejectDisallowedCorsOrigins(env: NodeJS.ProcessEnv = process.env) {
  const origins = allowedOrigins(env);

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header("Origin");
    if (origin && !origins.has(origin)) {
      return res.status(403).json({ error: "Origin not allowed." });
    }
    return next();
  };
}

export function securityHeaders(env: NodeJS.ProcessEnv = process.env) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    if (isProduction(env)) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
    next();
  };
}

function numberFromEnv(value: string | undefined, fallback: number) {
  if (!present(value)) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function expensiveEndpoint(req: Request) {
  if (req.method === "POST" && /^\/api\/households\/[^/]+\/assistant\/chat$/.test(req.path)) return true;
  if (req.method === "POST" && /^\/api\/households\/[^/]+\/recommendations$/.test(req.path)) return true;
  if (req.method === "POST" && req.path === "/api/me/calendar/google/connect") return true;
  if (req.method === "GET" && req.path === "/api/me/calendar/import-candidates") return true;
  if (req.method === "POST" && req.path === "/api/me/calendar/import-queue") return true;
  if (req.method === "POST" && req.path === "/api/me/calendar/export") return true;
  return false;
}

export function expensiveEndpointRateLimit(env: NodeJS.ProcessEnv = process.env) {
  const windowMs = numberFromEnv(env.EXPENSIVE_RATE_LIMIT_WINDOW_MS, 60_000);
  const maxRequests = numberFromEnv(env.EXPENSIVE_RATE_LIMIT_MAX, 30);
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    if (!expensiveEndpoint(req)) return next();

    const now = Date.now();
    const identity = req.header("Authorization") ?? req.ip ?? "anonymous";
    const key = `${identity}:${req.method}:${req.path}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= maxRequests) {
      res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000).toString());
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }

    bucket.count += 1;
    return next();
  };
}
