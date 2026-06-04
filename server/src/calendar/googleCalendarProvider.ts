import crypto from "node:crypto";

export type GoogleCalendarTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes: string[];
};

export type GoogleCalendarSummary = {
  providerCalendarId: string;
  name: string;
  color?: string;
  timezone?: string;
  accessRole?: string;
};

export type GoogleCalendarEvent = {
  providerEventId: string;
  sourceProviderCalendarId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  timezone?: string;
};

export type GoogleCalendarProvider = {
  buildAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<GoogleCalendarTokenSet>;
  refreshAccessToken(refreshToken: string): Promise<Omit<GoogleCalendarTokenSet, "refreshToken">>;
  getProfile(accessToken: string): Promise<{ email: string }>;
  listCalendars(accessToken: string): Promise<GoogleCalendarSummary[]>;
  listEvents(input: {
    accessToken: string;
    calendarIds: string[];
    startAt: string;
    endAt: string;
  }): Promise<GoogleCalendarEvent[]>;
  createEvent(input: {
    accessToken: string;
    calendarId: string;
    title: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
  }): Promise<{ providerEventId: string }>;
};

export const googleCalendarScopes = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.events"
];

export function googleOAuthConfig(env: NodeJS.ProcessEnv = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const redirectUri = env.GOOGLE_CALENDAR_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return undefined;
  return { clientId, clientSecret, redirectUri };
}

function eventDateTime(eventDate: { dateTime?: string; date?: string; timeZone?: string } | undefined) {
  if (!eventDate) return undefined;
  return eventDate.dateTime ?? (eventDate.date ? `${eventDate.date}T00:00:00.000Z` : undefined);
}

export function createGoogleCalendarProvider(env: NodeJS.ProcessEnv = process.env): GoogleCalendarProvider | undefined {
  const config = googleOAuthConfig(env);
  if (!config) return undefined;

  return {
    buildAuthUrl(state) {
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", config.clientId);
      authUrl.searchParams.set("redirect_uri", config.redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("scope", googleCalendarScopes.join(" "));
      authUrl.searchParams.set("state", state);
      return authUrl.toString();
    },

    async exchangeCode(code) {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: "authorization_code",
          code
        })
      });
      if (!response.ok) throw new Error("Google token exchange failed");
      const payload = await response.json() as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
      };
      if (!payload.access_token) throw new Error("Google token exchange did not return an access token");
      return {
        accessToken: payload.access_token,
        ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}),
        expiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : undefined,
        scopes: payload.scope?.split(" ") ?? googleCalendarScopes
      };
    },

    async refreshAccessToken(refreshToken) {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken
        })
      });
      if (!response.ok) throw new Error("Google token refresh failed");
      const payload = await response.json() as { access_token?: string; expires_in?: number; scope?: string };
      if (!payload.access_token) throw new Error("Google token refresh did not return an access token");
      return {
        accessToken: payload.access_token,
        expiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : undefined,
        scopes: payload.scope?.split(" ") ?? googleCalendarScopes
      };
    },

    async getProfile(accessToken) {
      const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) throw new Error("Google profile fetch failed");
      const profile = await response.json() as { email?: string };
      if (!profile.email) throw new Error("Google profile did not return an email");
      return { email: profile.email };
    },

    async listCalendars(accessToken) {
      const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) throw new Error("Google calendar list fetch failed");
      const payload = await response.json() as { items?: Array<{
        id?: string;
        summary?: string;
        backgroundColor?: string;
        timeZone?: string;
        accessRole?: string;
      }> };
      return (payload.items ?? [])
        .filter((calendar) => calendar.id && calendar.summary)
        .map((calendar) => ({
          providerCalendarId: calendar.id!,
          name: calendar.summary!,
          ...(calendar.backgroundColor ? { color: calendar.backgroundColor } : {}),
          ...(calendar.timeZone ? { timezone: calendar.timeZone } : {}),
          ...(calendar.accessRole ? { accessRole: calendar.accessRole } : {})
        }));
    },

    async listEvents(input) {
      const eventLists = await Promise.all(input.calendarIds.map(async (calendarId) => {
        const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");
        url.searchParams.set("timeMin", input.startAt);
        url.searchParams.set("timeMax", input.endAt);
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${input.accessToken}` }
        });
        if (!response.ok) throw new Error("Google event list fetch failed");
        const payload = await response.json() as { items?: Array<{
          id?: string;
          summary?: string;
          start?: { dateTime?: string; date?: string; timeZone?: string };
          end?: { dateTime?: string; date?: string; timeZone?: string };
        }> };
        return (payload.items ?? []).flatMap((event) => {
          const startsAt = eventDateTime(event.start);
          const endsAt = eventDateTime(event.end);
          if (!startsAt || !endsAt) return [];
          return [{
            providerEventId: event.id ?? crypto.randomUUID(),
            sourceProviderCalendarId: calendarId,
            title: event.summary ?? "Busy",
            startsAt,
            endsAt,
            ...(event.start?.timeZone ? { timezone: event.start.timeZone } : {})
          }];
        });
      }));
      return eventLists.flat();
    },

    async createEvent(input) {
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          summary: input.title,
          start: { dateTime: input.startsAt, timeZone: input.timezone },
          end: { dateTime: input.endsAt, timeZone: input.timezone }
        })
      });
      if (!response.ok) throw new Error("Google event create failed");
      const payload = await response.json() as { id?: string };
      if (!payload.id) throw new Error("Google event create did not return an id");
      return { providerEventId: payload.id };
    }
  };
}
