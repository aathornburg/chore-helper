import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  CreateScheduledChoreInput,
  HouseholdAppData,
  HouseholdInvitation,
  HouseholdMemberSummary,
  HouseholdStructure
} from "@chore-helper/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { completeOccurrence, createScheduledChore, listOccurrences } from "./api";
import App from "./App";

const clerkState = vi.hoisted(() => ({
  signedIn: true,
  getToken: vi.fn<() => Promise<string | null>>(async () => "test-user-a")
}));

vi.mock("@clerk/clerk-react", () => ({
  SignInButton: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children ?? "Sign in"}</button>
  ),
  SignUpButton: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children ?? "Sign up"}</button>
  ),
  SignedIn: ({ children }: { children: React.ReactNode }) => (clerkState.signedIn ? <>{children}</> : null),
  SignedOut: ({ children }: { children: React.ReactNode }) => (!clerkState.signedIn ? <>{children}</> : null),
  UserButton: () => <button aria-label="User menu" type="button" />,
  useAuth: () => ({
    isLoaded: true,
    getToken: clerkState.getToken
  })
}));

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

function getChoreEditor() {
  const editor = document.querySelector(".chore-editor-modal");
  expect(editor).not.toBeNull();
  return within(editor as HTMLElement);
}

async function findPlannedCleanBathroomsButton() {
  const viewButtons = await screen.findAllByRole("button", { name: "View Clean bathrooms" });
  const plannedButton = viewButtons.find((button) =>
    !button.classList.contains("is-completed") && !button.classList.contains("is-skipped")
  );
  expect(plannedButton).toBeTruthy();
  return plannedButton as HTMLElement;
}

function mockClerkSignedIn() {
  clerkState.signedIn = true;
  clerkState.getToken.mockReset();
  clerkState.getToken.mockResolvedValue("test-user-a");
}

function mockClerkSignedOut() {
  clerkState.signedIn = false;
  clerkState.getToken.mockReset();
  clerkState.getToken.mockResolvedValue(null);
}

async function manageHomeHousehold() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Manage" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Manage" }));
}

async function openHouseholdManageTab(name: "Overview" | "Floors" | "Rooms") {
  await waitFor(() => expect(screen.getByRole("tab", { name })).toBeTruthy());
  fireEvent.click(screen.getByRole("tab", { name }));
}

async function editFloorSurfaces() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit surfaces" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Edit surfaces" }));
}

function restoreHouseholdInStorage() {
  window.localStorage.setItem("chore-helper:household-id", "household-1");
}

const household = {
  id: "household-1",
  name: "Home",
  timeZone: "America/New_York",
  profile: {
    homeType: "house",
    hasPets: true,
    hasOutdoorSpace: false,
    notes: ""
  }
};

const cleanBathroomsChore = {
  id: "chore-1",
  householdId: "household-1",
  title: "Clean bathrooms",
  cadence: "weekly",
  estimatedMinutes: 10,
  source: "manual"
};

function createHouseholdAppData({
  chores = [cleanBathroomsChore],
  recommendations = [],
  structure = {
    householdId: "household-1",
    floors: [{
      id: "floor-main",
      householdId: "household-1",
      name: "Main floor",
      levelType: "main",
      flooring: ["tile"],
      petImpact: "medium",
      robotVacuumCoverage: "none",
      robotMopCoverage: "none",
      rooms: []
    }]
  }
}: {
  chores?: typeof cleanBathroomsChore[];
  recommendations?: unknown[];
  structure?: HouseholdStructure;
} = {}): HouseholdAppData {
  return {
    ...household,
    structure,
    chores: chores.map((chore) => ({ ...chore, recommendations: [] })),
    recommendations
  } as HouseholdAppData;
}

function mockRestoredHouseholdFetches({
  chores = [cleanBathroomsChore],
  recommendations = [],
  chatResponses = []
}: {
  chores?: typeof cleanBathroomsChore[];
  recommendations?: unknown[];
  chatResponses?: Array<{ ok: boolean; json: () => Promise<unknown> }>;
} = {}) {
  const nextChatResponses = [...chatResponses];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (url === "http://localhost:3001/api/households" && method === "GET") {
      return { ok: true, json: async () => [createHouseholdAppData({ chores, recommendations })] };
    }

    if (url === "http://localhost:3001/api/me" && method === "GET") {
      return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
    }

    if (url === "http://localhost:3001/api/households/household-1/chores" && method === "GET") {
      return { ok: true, json: async () => chores };
    }

    if (url === "http://localhost:3001/api/households/household-1/recommendations" && method === "GET") {
      return { ok: true, json: async () => recommendations };
    }

    if (url === "http://localhost:3001/api/households/household-1/assistant/chat" && method === "POST") {
      const response = nextChatResponses.shift();
      return response ?? { ok: true, json: async () => ({ answer: "Mock assistant answer." }) };
    }

    throw new Error(`Unhandled fetch ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function mockEmptyAppDataFetches() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (url === "http://localhost:3001/api/me" && method === "GET") {
        return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
      }

      if (url === "http://localhost:3001/api/households" && method === "GET") {
        return { ok: true, json: async () => [] };
      }

      throw new Error(`Unhandled fetch ${method} ${url}`);
    })
  );
}

function mockHouseholdsPageFetches(
  structure: HouseholdStructure,
  options: {
    saveResponse?: { ok: boolean; json: () => Promise<unknown> };
    savePromise?: Promise<{ ok: boolean; json: () => Promise<unknown> }>;
  } = {}
) {
  let storedStructure = structure;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (url === "http://localhost:3001/api/me" && method === "GET") {
      return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
    }

    if (url === "http://localhost:3001/api/households" && method === "GET") {
      return {
        ok: true,
        json: async () => [createHouseholdAppData({ structure: storedStructure })]
      };
    }

    if (url === "http://localhost:3001/api/households/household-1/structure" && method === "GET") {
      return { ok: true, json: async () => storedStructure };
    }

    if (url === "http://localhost:3001/api/households/household-1/structure" && method === "PUT") {
      if (options.savePromise) return options.savePromise;
      if (options.saveResponse) return options.saveResponse;
      const body = JSON.parse(String(init?.body)) as Pick<HouseholdStructure, "floors">;
      storedStructure = { householdId: "household-1", floors: body.floors };
      return { ok: true, json: async () => storedStructure };
    }

    if (url === "http://localhost:3001/api/households/household-1/profile" && method === "PUT") {
      const body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ ...household, name: body.name, profile: body }) };
    }

    throw new Error(`Unhandled fetch ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockFamilyPageFetches(currentRole: "owner" | "member" = "owner") {
  let members: HouseholdMemberSummary[] = [
    {
      householdId: "household-1",
      userId: "app-user-1",
      clerkUserId: "test-user-a",
      primaryEmail: "owner@example.com",
      displayName: "Alex Owner",
      role: currentRole
    },
    {
      householdId: "household-1",
      userId: "app-user-2",
      clerkUserId: "test-user-b",
      primaryEmail: "member@example.com",
      displayName: "Morgan Member",
      role: currentRole === "owner" ? "member" : "owner"
    }
  ];
  let invitations: HouseholdInvitation[] = [{
    id: "invite-1",
    householdId: "household-1",
    recipientEmail: "pending@example.com",
    role: "member",
    status: "pending",
    invitedByUserId: "app-user-1",
    expiresAt: "2026-06-01T12:00:00.000Z",
    createdAt: "2026-05-25T12:00:00.000Z"
  }];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (url === "http://localhost:3001/api/me" && method === "GET") {
      return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
    }
    if (url === "http://localhost:3001/api/households" && method === "GET") {
      return { ok: true, json: async () => [createHouseholdAppData()] };
    }
    if (url === "http://localhost:3001/api/households/household-1/members" && method === "GET") {
      return { ok: true, json: async () => members };
    }
    if (url === "http://localhost:3001/api/households/household-1/invitations" && method === "GET") {
      return { ok: true, json: async () => invitations };
    }
    if (url === "http://localhost:3001/api/households/household-1/invitations" && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { email: string };
      const invitation: HouseholdInvitation = {
        ...invitations[0],
        id: "invite-2",
        recipientEmail: body.email
      };
      invitations = [...invitations, invitation];
      return { ok: true, json: async () => invitation };
    }
    if (url === "http://localhost:3001/api/households/household-1/invitations/invite-1/cancel" && method === "POST") {
      invitations = invitations.map((invitation) =>
        invitation.id === "invite-1" ? { ...invitation, status: "cancelled" } : invitation
      );
      return { ok: true, json: async () => invitations[0] };
    }
    if (url === "http://localhost:3001/api/households/household-1/members/app-user-2/role" && method === "PUT") {
      members = members.map((member) =>
        member.userId === "app-user-2" ? { ...member, role: "owner" } : member
      );
      return { ok: true, json: async () => ({ householdId: "household-1", userId: "app-user-2", role: "owner" }) };
    }
    if (url === "http://localhost:3001/api/households/household-1/members/app-user-2" && method === "DELETE") {
      members = members.filter((member) => member.userId !== "app-user-2");
      return { ok: true, json: async () => ({ householdId: "household-1", userId: "app-user-2", role: "owner" }) };
    }

    throw new Error(`Unhandled fetch ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockCalendarPageFetches() {
  let occurrences = [{
    id: "occurrence-1",
    householdId: "household-1",
    choreId: "chore-1",
    scheduleId: "schedule-1",
    sequence: 0,
    planningMode: "timed",
    plannedStartAt: "2026-05-25T14:00:00.000Z",
    plannedEndAt: "2026-05-25T14:30:00.000Z",
    estimatedMinutes: 30,
    eligibleStartOn: "2026-05-25",
    eligibleEndOn: "2026-05-25",
    assignedUserId: "app-user-2",
    exceptionType: "none",
    status: "planned"
  }];
  const members: HouseholdMemberSummary[] = [
    {
      householdId: "household-1",
      userId: "app-user-1",
      clerkUserId: "test-user-a",
      primaryEmail: "owner@example.com",
      displayName: "Alex Owner",
      role: "owner"
    },
    {
      householdId: "household-1",
      userId: "app-user-2",
      clerkUserId: "test-user-b",
      primaryEmail: "member@example.com",
      displayName: "Morgan Member",
      role: "member"
    }
  ];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (url === "http://localhost:3001/api/me" && method === "GET") {
      return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
    }
    if (url === "http://localhost:3001/api/households" && method === "GET") {
      return { ok: true, json: async () => [createHouseholdAppData()] };
    }
    if (url === "http://localhost:3001/api/households/household-1/members" && method === "GET") {
      return { ok: true, json: async () => members };
    }
    if (url.startsWith("http://localhost:3001/api/households/household-1/occurrences?") && method === "GET") {
      return { ok: true, json: async () => occurrences };
    }
    if (url === "http://localhost:3001/api/households/household-1/chores/chore-1/schedules" && method === "GET") {
      return {
        ok: true,
        json: async () => [{
          id: "schedule-1",
          householdId: "household-1",
          choreId: "chore-1",
          planningMode: "timed",
          recurrence: { frequency: "one_time", interval: 1 },
          startsOn: "2026-05-25",
          assignment: { mode: "fixed", memberUserIds: ["app-user-2"] },
          localStartTime: "10:00",
          localEndTime: "10:30"
        }]
      };
    }
    if (url === "http://localhost:3001/api/households/household-1/schedules/schedule-1" && method === "PUT") {
      return {
        ok: true,
        json: async () => ({
          id: "schedule-1",
          householdId: "household-1",
          choreId: "chore-1",
          ...JSON.parse(String(init?.body))
        })
      };
    }
    if (url === "http://localhost:3001/api/households/household-1/occurrences/occurrence-1" && method === "PUT") {
      const body = JSON.parse(String(init?.body));
      occurrences = [{ ...occurrences[0], ...body, exceptionType: "rescheduled" }];
      return { ok: true, json: async () => occurrences[0] };
    }
    if (url === "http://localhost:3001/api/households/household-1/occurrences/occurrence-1/skip" && method === "POST") {
      occurrences = [{ ...occurrences[0], status: "skipped", exceptionType: "skipped" }];
      return { ok: true, json: async () => occurrences[0] };
    }

    throw new Error(`Unhandled fetch ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockCalendarWorkspaceFetches({
  frequency = "weekly"
}: {
  frequency?: "daily" | "weekly" | "monthly" | "yearly";
} = {}) {
  let occurrences = [{
    id: "occurrence-flexible",
    householdId: "household-1",
    choreId: "chore-1",
    scheduleId: "schedule-1",
    sequence: 0,
    planningMode: "flexible",
    estimatedMinutes: 60,
    eligibleStartOn: "2026-05-28",
    eligibleEndOn: "2026-05-30",
    assignedUserId: "app-user-1",
    exceptionType: "none",
    status: "planned"
  }, {
    id: "occurrence-history",
    householdId: "household-1",
    choreId: "chore-1",
    scheduleId: "schedule-1",
    sequence: -1,
    planningMode: "flexible",
    estimatedMinutes: 60,
    eligibleStartOn: "2026-05-27",
    eligibleEndOn: "2026-05-27",
    assignedUserId: "app-user-1",
    exceptionType: "none",
    status: "completed",
    completedAt: "2026-05-27T14:00:00.000Z",
    completedByUserId: "app-user-1"
  }, {
    id: "occurrence-pet-completed",
    householdId: "household-1",
    choreId: "chore-2",
    scheduleId: "schedule-2",
    sequence: 0,
    planningMode: "flexible",
    estimatedMinutes: 15,
    eligibleStartOn: "2026-05-30",
    eligibleEndOn: "2026-05-30",
    assignedUserId: "app-user-1",
    exceptionType: "none",
    status: "completed",
    completedAt: "2026-05-30T14:00:00.000Z",
    completedByUserId: "app-user-1"
  }];
  const members: HouseholdMemberSummary[] = [{
    householdId: "household-1",
    userId: "app-user-1",
    clerkUserId: "test-user-a",
    primaryEmail: "owner@example.com",
    displayName: "Alex Owner",
    role: "owner"
  }, {
    householdId: "household-1",
    userId: "app-user-2",
    clerkUserId: "test-user-b",
    primaryEmail: "member@example.com",
    displayName: "Taylor Member",
    role: "member"
  }];
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/me")) return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
    if (url.endsWith("/api/households")) {
      return {
        ok: true,
        json: async () => [createHouseholdAppData({
          chores: [
            cleanBathroomsChore,
            { ...cleanBathroomsChore, id: "chore-2", title: "Pet cats" }
          ]
        })]
      };
    }
    if (url.includes("/members")) return { ok: true, json: async () => members };
    if (url.includes("/occurrences?") && method === "GET") return { ok: true, json: async () => occurrences };
    if (url.endsWith("/api/households/household-1/chores/chore-1/schedules") && method === "GET") {
      return {
        ok: true,
        json: async () => [{
          id: "schedule-1",
          householdId: "household-1",
          choreId: "chore-1",
          planningMode: "flexible",
          recurrence: frequency === "weekly"
            ? { frequency, interval: 1, weekDays: [4, 5] }
            : frequency === "monthly"
              ? { frequency, interval: 1, monthlyPattern: "day_of_month", monthlyDay: 28 }
              : { frequency, interval: 1 },
          startsOn: "2026-05-28",
          assignment: { mode: "fixed", memberUserIds: ["app-user-1"] },
          estimatedMinutes: 60,
          flexibleWindowRule: "once_within_selected_days"
        }]
      };
    }
    if (url.endsWith("/api/households/household-1/schedules/schedule-1") && method === "PUT") {
      return {
        ok: true,
        json: async () => ({
          id: "schedule-1",
          householdId: "household-1",
          choreId: "chore-1",
          ...JSON.parse(String(init?.body))
        })
      };
    }
    if (url.endsWith("/api/households/household-1/chores") && method === "POST") {
      const body = JSON.parse(String(init?.body));
      const schedule = body.schedules[0];
      occurrences = [...occurrences, {
        id: "occurrence-new",
        householdId: "household-1",
        choreId: "chore-new",
        scheduleId: "schedule-new",
        sequence: 0,
        planningMode: schedule.planningMode,
        estimatedMinutes: schedule.estimatedMinutes ?? 60,
        eligibleStartOn: schedule.startsOn,
        eligibleEndOn: schedule.startsOn,
        assignedUserId: schedule.assignment.memberUserIds[0],
        exceptionType: "none",
        status: "planned"
      }];
      return {
        ok: true,
        json: async () => ({
          chore: { id: "chore-new", householdId: "household-1", title: body.chore.title, source: "manual" },
          schedules: []
        })
      };
    }
    if (url.endsWith("/occurrences/occurrence-flexible/complete") && method === "POST") {
      const completed = { ...occurrences[0], status: "completed", completedAt: "2026-05-30T16:00:00.000Z", completedByUserId: "app-user-1" };
      occurrences = [];
      return { ok: true, json: async () => completed };
    }
    throw new Error(`Unhandled fetch ${method} ${url}`);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockClerkSignedIn();
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("App", () => {
  it("posts scheduled chore creation and occurrence completion through the unified API", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (url === "http://localhost:3001/api/households/household-1/chores" && method === "POST") {
        return {
          ok: true,
          json: async () => ({
            chore: {
              id: "chore-1",
              householdId: "household-1",
              title: "Clean bathrooms",
              source: "manual"
            },
            schedules: []
          })
        };
      }

      if (
        url === "http://localhost:3001/api/households/household-1/occurrences/occurrence-1/complete" &&
        method === "POST"
      ) {
        return {
          ok: true,
          json: async () => ({
            id: "occurrence-1",
            householdId: "household-1",
            choreId: "chore-1",
            scheduleId: "schedule-1",
            sequence: 0,
            planningMode: "timed",
            plannedStartAt: "2026-05-25T14:00:00.000Z",
            plannedEndAt: "2026-05-25T14:30:00.000Z",
            estimatedMinutes: 30,
            eligibleStartOn: "2026-05-25",
            eligibleEndOn: "2026-05-25",
            assignedUserId: "app-user-1",
            exceptionType: "none",
            status: "completed",
            completedAt: "2026-05-25T14:20:00.000Z",
            completedByUserId: "app-user-1"
          })
        };
      }

      if (url.startsWith("http://localhost:3001/api/households/household-1/occurrences?") && method === "GET") {
        return { ok: true, json: async () => [] };
      }

      throw new Error(`Unhandled fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const input: CreateScheduledChoreInput = {
      chore: { title: "Clean bathrooms", source: "manual" },
      schedules: [{
        planningMode: "timed",
        recurrence: { frequency: "daily", interval: 1 },
        localStartTime: "09:00",
        localEndTime: "09:30",
        startsOn: "2026-05-25",
        assignment: { mode: "fixed", memberUserIds: ["app-user-1"] }
      }]
    };

    await createScheduledChore("household-1", input);
    await listOccurrences("household-1", {
      startAt: "2026-05-25T04:00:00.000Z",
      endAt: "2026-05-26T03:59:59.000Z",
      startOn: "2026-05-25",
      endOn: "2026-05-25"
    });
    await completeOccurrence("household-1", "occurrence-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"schedules"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/occurrences?startAt=2026-05-25T04%3A00%3A00.000Z&endAt=2026-05-26T03%3A59%3A59.000Z&startOn=2026-05-25&endOn=2026-05-25",
      expect.anything()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/occurrences/occurrence-1/complete",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("routes signed-in root visits to Today", async () => {
    mockRestoredHouseholdFetches();
    renderAt("/");

    await waitFor(() => expect(screen.getByText("Ready to optimize")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy();
    expect(window.location.pathname).toBe("/");
    expect(screen.queryByText("Make household work visible, fair, and easier to adjust.")).toBeNull();
  });

  it("renders the current primary navigation without setup", async () => {
    mockEmptyAppDataFetches();
    renderAt("/today");

    const nav = await screen.findByRole("navigation", { name: "Primary" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Optimize", "Today", "Calendar", "Households", "Family", "Settings"]);
    expect(within(nav).getByRole("link", { name: "Optimize" }).classList.contains("is-primary-nav-action")).toBe(true);
    expect(screen.queryByRole("link", { name: "Chores" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Setup" })).toBeNull();
  });

  it("loads app household data from the user-scoped households endpoint without localStorage restore", async () => {
    window.localStorage.setItem("chore-helper:household-id", "stale-household");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (url === "http://localhost:3001/api/me" && method === "GET") {
        return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
      }

      if (url === "http://localhost:3001/api/households" && method === "GET") {
        return {
          ok: true,
          json: async () => [
            {
              ...household,
              structure: { householdId: household.id, floors: [] },
              chores: [cleanBathroomsChore],
              recommendations: []
            }
          ]
        };
      }

      throw new Error(`Unhandled fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/today");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Home" })).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/me",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-user-a" })
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-user-a" })
      })
    );
    expect(fetchMock).not.toHaveBeenCalledWith("http://localhost:3001/api/households/stale-household");
  });

  it("shows auth entry points when signed out", async () => {
    mockClerkSignedOut();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/today");

    expect(screen.getByRole("heading", { name: "Cleanly" })).toBeTruthy();
    expect(screen.getByText("Make household work visible, fair, and easier to adjust.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /sign up/i })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders all households without an active household selector", async () => {
    const secondHousehold = {
      ...createHouseholdAppData(),
      id: "household-2",
      name: "Cabin",
      structure: { householdId: "household-2", floors: [] },
      chores: []
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (url === "http://localhost:3001/api/me" && method === "GET") {
        return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
      }

      if (url === "http://localhost:3001/api/households" && method === "GET") {
        return { ok: true, json: async () => [createHouseholdAppData(), secondHousehold] };
      }

      throw new Error(`Unhandled fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/households");

    await waitFor(() => {
      expect(screen.getByLabelText("Home floor editor")).toBeTruthy();
      expect(screen.getByLabelText("Cabin floor editor")).toBeTruthy();
    });
    expect(screen.queryByText(/active household/i)).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url === "http://localhost:3001/api/me/active-household")).toBe(false);
  });

  it("routes the first-time household action to Households", async () => {
    mockEmptyAppDataFetches();
    renderAt("/today");

    await waitFor(() => expect(screen.getByRole("button", { name: "Set up household" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Set up household" }));

    expect(screen.getByRole("heading", { name: "Households", level: 1 })).toBeTruthy();
  });

  it("renders the Households page", async () => {
    mockEmptyAppDataFetches();
    renderAt("/households");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Households", level: 1 })).toBeTruthy());
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add household" })).toBeTruthy();
    });
  });

  it("loads household family management and lets an owner administer members and invitations", async () => {
    const fetchMock = mockFamilyPageFetches();
    renderAt("/family");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Family" })).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Alex Owner")).toBeTruthy());
    expect(screen.getByText("Morgan Member")).toBeTruthy();
    expect(screen.getByText("pending@example.com")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Invite by email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(screen.getByText("new@example.com")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Promote Morgan Member to owner" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Make Morgan Member a member" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Cancel invitation for pending@example.com" }));
    await waitFor(() => expect(screen.getByText("Cancelled")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Remove Morgan Member" }));
    await waitFor(() => expect(screen.queryByText("Morgan Member")).toBeNull());

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/invitations",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows family members without owner-only actions to an ordinary member", async () => {
    mockFamilyPageFetches("member");
    renderAt("/family");

    await waitFor(() => expect(screen.getByText("Alex Owner")).toBeTruthy());
    expect(screen.queryByLabelText("Invite by email")).toBeNull();
    expect(screen.queryByRole("button", { name: /promote/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /cancel invitation/i })).toBeNull();
  });

  it("loads Calendar occurrences and provides equivalent planner edit actions", async () => {
    const fetchMock = mockCalendarPageFetches();
    renderAt("/calendar");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Calendar" })).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Clean bathrooms")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Month" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Week" }));

    fireEvent.change(screen.getByLabelText("Member"), { target: { value: "app-user-2" } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      String(url).includes("assignedUserId=app-user-2")
    )).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "View Clean bathrooms" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expect(screen.getByLabelText(/Estimated duration/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/Estimated duration/), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/schedules/schedule-1",
      expect.objectContaining({ method: "PUT", body: expect.stringContaining("\"localEndTime\":\"10:45\"") })
    ));

    fireEvent.dragStart(screen.getByRole("button", { name: "View Clean bathrooms" }));
    fireEvent.drop(screen.getByLabelText("Monday, May 25 10:00 time slot"));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url, init]) =>
      url === "http://localhost:3001/api/households/household-1/occurrences/occurrence-1" &&
      init?.method === "PUT"
    )).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "Skip occurrence" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "View Clean bathrooms" }).classList.contains("is-skipped")).toBe(true));
  });

  it("uses Calendar as the only chore planning destination", async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    expect(await screen.findByRole("heading", { name: "Calendar" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Chores" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add chore" })).toBeTruthy();
    const workspace = screen.getByRole("region", { name: "Calendar workspace" });
    expect(workspace.classList.contains("has-external-tabs")).toBe(true);
    const tabs = within(workspace).getByRole("tablist", { name: "Workspace view" });
    expect(within(tabs).getByRole("tab", { name: "Calendar" })).toBeTruthy();
    expect(within(tabs).getByRole("tab", { name: "List" })).toBeTruthy();
    expect(within(workspace).getByRole("region", { name: "Calendar controls" })).toBeTruthy();
    const header = document.querySelector(".calendar-workspace-panel-header");
    expect(header?.querySelector(".calendar-view-toggle")).toBeNull();
    const filters = within(workspace).getByRole("region", { name: "Calendar filters" });
    expect(filters.classList.contains("calendar-filter-card")).toBe(true);
    expect(within(filters).getByRole("heading", { name: "Filters" })).toBeTruthy();
    expect(within(workspace).getByLabelText("Planning mode")).toBeTruthy();
  });

  it("normalizes the removed Chores route away", async () => {
    mockEmptyAppDataFetches();
    renderAt("/chores");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Chores" })).toBeNull();
  });

  it("switches between calendar and chronological list occurrences", async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("tab", { name: "List" }));
    const agenda = await screen.findByRole("region", { name: "Chore agenda" });
    expect(within(agenda).getByRole("heading", { name: "Upcoming and completed work" })).toBeTruthy();
    const plannedCard = within(agenda).getByRole("button", { name: "View Clean bathrooms" });
    expect(plannedCard.classList.contains("calendar-chore-row")).toBe(true);
    expect(plannedCard.classList.contains("calendar-agenda-row")).toBe(true);
    expect(plannedCard.classList.contains("calendar-agenda-card")).toBe(false);
    expect(within(plannedCard).getByText("Anytime / 60 min")).toBeTruthy();
    expect(within(agenda).getByRole("button", { name: "View Pet cats" })).toBeTruthy();
    expect(screen.queryByText("Flexible")).toBeNull();
  });

  it("renders month as dated calendar cells with lightweight truncated chore rows", async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    expect(await screen.findByRole("grid", { name: "May 2026 month calendar" })).toBeTruthy();
    expect(screen.getByText("Sun")).toBeTruthy();
    const friday = screen.getByRole("gridcell", { name: "Friday, May 29" });
    const monthChore = within(friday).getByRole("button", { name: "View Clean bathrooms" });
    expect(monthChore.classList.contains("calendar-chore-row")).toBe(true);
    expect(monthChore.classList.contains("calendar-month-chore-row")).toBe(false);
    expect(monthChore.classList.contains("calendar-event")).toBe(false);
    expect(monthChore.getAttribute("title")).toBe("Clean bathrooms");
    expect(monthChore.querySelector(".calendar-chore-title")).not.toBeNull();
    expect(within(friday).queryByText("Anytime / 60 min")).toBeNull();
    expect(within(friday).queryByText("Alex Owner")).toBeNull();
    expect(screen.queryByText("Assigned member")).toBeNull();
  });

  it("renders week view with one time rail and title-only chore buttons", async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Week" }));
    const weekGrid = await screen.findByRole("grid", { name: "Week of May 24, 2026" });
    expect(weekGrid).toBeTruthy();
    expect(screen.getByText("May 24 - May 30, 2026")).toBeTruthy();
    const previousButton = screen.getByRole("button", { name: "Previous week" });
    const nextButton = screen.getByRole("button", { name: "Next week" });
    expect(previousButton.querySelector("svg")).not.toBeNull();
    expect(nextButton.querySelector("svg")).not.toBeNull();
    expect(previousButton.textContent).not.toContain("<");
    expect(nextButton.textContent).not.toContain(">");
    expect(screen.queryByText("May 2026")).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Friday, May 29" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Saturday, May 30" })).toBeTruthy();
    expect(screen.getAllByText("8:00 am")).toHaveLength(1);
    expect(screen.getAllByText("5:00 pm")).toHaveLength(1);
    expect(screen.queryByText("08:00")).toBeNull();
    const weekChore = within(weekGrid).getAllByRole("button", { name: "View Clean bathrooms" })[0];
    expect(weekChore.classList.contains("calendar-chore-row")).toBe(true);
    expect(weekChore.classList.contains("calendar-event")).toBe(false);
    expect(weekChore.getAttribute("title")).toBe("Clean bathrooms");
    expect(weekGrid.querySelector(".calendar-time-rail-separator")).not.toBeNull();
    expect(weekGrid.querySelectorAll(".calendar-column-hour-separator")).toHaveLength(7);
    expect(weekGrid.querySelectorAll(".calendar-column-hour-separator.has-top-divider")).toHaveLength(7);
    expect(screen.queryByText("Flexible")).toBeNull();
  });

  it("renders day view with an anytime row label and inline hour labels", async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Day" }));
    const dayGrid = await screen.findByRole("grid", { name: "Saturday, May 30 day calendar" });
    expect(dayGrid).toBeTruthy();
    expect(within(dayGrid).getByText("Anytime")).toBeTruthy();
    expect(dayGrid.querySelector(".calendar-time-rail")).toBeNull();
    expect(within(dayGrid).getAllByText("8:00 am")).toHaveLength(1);
    const dayRows = within(dayGrid).getAllByRole("button");
    expect(dayRows.map((row) => row.getAttribute("aria-label"))).toEqual(["View Clean bathrooms", "View Pet cats"]);
    expect(within(dayRows[0]).getByText("Anytime / 60 min · Alex Owner")).toBeTruthy();
    expect(within(dayRows[0]).queryByText("Anytime / 60 min")).toBeNull();
    expect(within(dayRows[0]).queryByText("Alex Owner")).toBeNull();
    expect(dayRows[1].classList.contains("is-completed")).toBe(true);
    expect(dayGrid.querySelector(".calendar-completed-drawer")).toBeNull();
  });

  it("filters calendar content by planning mode inside the workspace panel", async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    const workspace = await screen.findByRole("region", { name: "Calendar workspace" });
    await screen.findByRole("grid", { name: "May 2026 month calendar" });
    expect(within(workspace).getAllByRole("button", { name: "View Clean bathrooms" }).length).toBeGreaterThan(0);
    fireEvent.change(within(workspace).getByLabelText("Planning mode"), { target: { value: "timed" } });

    expect(within(workspace).queryAllByRole("button", { name: "View Clean bathrooms" })).toHaveLength(0);
    expect(within(workspace).queryByText("No chores in this range.")).toBeNull();
    expect(within(workspace).getByRole("grid", { name: "May 2026 month calendar" })).toBeTruthy();
  });

  it("shows completed chores inline in calendar views and in list agenda views", async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    expect(await screen.findByRole("grid", { name: "May 2026 month calendar" })).toBeTruthy();
    const completedOnlyDay = screen.getByRole("gridcell", { name: "Wednesday, May 27" });
    expect(completedOnlyDay.classList.contains("is-all-completed")).toBe(true);
    expect(completedOnlyDay.classList.contains("is-today")).toBe(false);
    expect(within(completedOnlyDay).queryByText("Done")).toBeNull();
    expect(within(completedOnlyDay).queryByText("No chores due")).toBeNull();
    expect(completedOnlyDay.querySelector(".calendar-completed-drawer")).toBeNull();
    const completedOnlyChore = within(completedOnlyDay).getByRole("button", { name: "View Clean bathrooms" });
    expect(completedOnlyChore.classList.contains("calendar-chore-row")).toBe(true);
    expect(completedOnlyChore.classList.contains("is-completed")).toBe(true);
    const today = screen.getByRole("gridcell", { name: "Saturday, May 30" });
    expect(today.closest(".calendar-month-week")).not.toBeNull();
    expect(today.classList.contains("is-all-completed")).toBe(false);
    expect(today.classList.contains("is-today")).toBe(true);
    expect(within(today).queryByText("Done")).toBeNull();
    expect(today.querySelector(".calendar-day-active-events")).not.toBeNull();
    expect(today.querySelector(".calendar-day-completed-footer")).toBeNull();
    const todayRows = within(today).getAllByRole("button");
    expect(todayRows.map((row) => row.getAttribute("aria-label"))).toEqual(["View Clean bathrooms", "View Pet cats"]);
    expect(todayRows[1].classList.contains("is-completed")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    const weekGrid = await screen.findByRole("grid", { name: "Week of May 24, 2026" });
    expect(weekGrid.querySelector(".calendar-time-rail-completed-spacer")).toBeNull();
    expect(weekGrid.querySelector(".calendar-time-rail-separator")).not.toBeNull();
    const saturdayColumn = screen.getByRole("columnheader", { name: "Saturday, May 30" }).closest(".calendar-column");
    const completedOnlyColumn = screen.getByRole("columnheader", { name: "Wednesday, May 27" }).closest(".calendar-column");
    expect(completedOnlyColumn ? within(completedOnlyColumn as HTMLElement).queryByText("No chores due") : null).toBeNull();
    expect(completedOnlyColumn?.querySelector(".calendar-completed-drawer")).toBeNull();
    const completedOnlyWeekChore = completedOnlyColumn
      ? within(completedOnlyColumn as HTMLElement).getByRole("button", { name: "View Clean bathrooms" })
      : null;
    expect(completedOnlyWeekChore?.classList.contains("is-completed")).toBe(true);
    expect(saturdayColumn?.querySelector(".calendar-column-anytime-main")).not.toBeNull();
    expect(saturdayColumn?.querySelector(".calendar-day-completed-footer")).toBeNull();
    expect(saturdayColumn?.querySelector(".calendar-column-hour-separator")?.classList.contains("has-top-divider")).toBe(true);
    const saturdayRows = saturdayColumn ? within(saturdayColumn as HTMLElement).getAllByRole("button") : [];
    expect(saturdayRows.map((row) => row.getAttribute("aria-label"))).toEqual(["View Clean bathrooms", "View Pet cats"]);
    expect(saturdayRows[1].classList.contains("is-completed")).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: "List" }));
    const agenda = await screen.findByRole("region", { name: "Chore agenda" });
    expect(agenda.classList.contains("calendar-agenda")).toBe(true);
    const completedCard = within(agenda).getByRole("button", { name: "View Pet cats" });
    expect(completedCard.classList.contains("calendar-chore-row")).toBe(true);
    expect(completedCard.classList.contains("calendar-agenda-row")).toBe(true);
    expect(completedCard.classList.contains("calendar-agenda-card")).toBe(false);
    expect(within(completedCard).getByText("Completed")).toBeTruthy();
    expect(within(agenda).getByText("1 completed")).toBeTruthy();
  });

  it("opens a chore view modal with upcoming and history before editing", async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    fireEvent.click(await findPlannedCleanBathroomsButton());

    const dialog = getChoreEditor();
    expect(dialog.getByRole("heading", { name: "Clean bathrooms" })).toBeTruthy();
    expect(dialog.getByRole("button", { name: "Close dialog" })).toBeTruthy();
    expect(dialog.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(dialog.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(dialog.getByRole("button", { name: "Complete chore" })).toBeTruthy();
    const modalActions = document.querySelector(".modal-actions");
    expect(Array.from(modalActions?.querySelectorAll("button") ?? []).map((button) => button.textContent)).toEqual([
      "Close",
      "Complete chore",
      "Edit"
    ]);
    expect(dialog.getByRole("button", { name: "Complete chore" }).classList.contains("section-action")).toBe(true);
    expect(dialog.getByRole("button", { name: "Edit" }).classList.contains("section-action")).toBe(false);
    fireEvent.click(dialog.getByRole("button", { name: "Complete chore" }));
    expect(screen.getByRole("region", { name: "Completion check-in" })).toBeTruthy();
    expect(screen.getByLabelText("This was done on time")).toBeTruthy();
    expect(screen.queryByLabelText("Keep this assignee for future work")).toBeNull();
    expect(await screen.findByLabelText("Base future occurrences on this completion date")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Chore details/ }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "Upcoming occurrences" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Chore details/ }));
    expect(screen.getByRole("button", { name: /Chore details/ }).getAttribute("aria-expanded")).toBe("true");
    expect(Array.from(modalActions?.querySelectorAll("button") ?? []).map((button) => button.textContent)).toEqual([
      "Close",
      "Submit"
    ]);
    expect(dialog.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(dialog.getByRole("button", { name: "Submit" }).classList.contains("section-action")).toBe(false);
    const upcoming = screen.getByRole("region", { name: "Upcoming occurrences" });
    expect(upcoming.classList.contains("schedule-occurrence-section")).toBe(true);
    expect(upcoming.querySelector(".schedule-occurrence-list")).not.toBeNull();
    expect(upcoming.querySelector(".schedule-occurrence-list .schedule-card")).toBeNull();
    expect(within(upcoming).getByText("Thursday, May 28")).toBeTruthy();
    expect(within(upcoming).getByText("Friday, May 29")).toBeTruthy();
    const history = screen.getByRole("region", { name: "Historical occurrences" });
    expect(history.classList.contains("schedule-occurrence-section")).toBe(true);
    expect(within(history).getByText("Wednesday, May 27")).toBeTruthy();
  });

  it("does not offer future occurrence rebasing for daily chores", async () => {
    const fetchMock = mockCalendarWorkspaceFetches({ frequency: "daily" });
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/calendar");

    fireEvent.click(await findPlannedCleanBathroomsButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores/chore-1/schedules",
      expect.objectContaining({ headers: expect.any(Object) })
    ));
    fireEvent.click(getChoreEditor().getByRole("button", { name: "Complete chore" }));

    expect(screen.getByRole("region", { name: "Completion check-in" })).toBeTruthy();
    expect(screen.queryByLabelText("Base future occurrences on this completion date")).toBeNull();
  });

  it("creates a chore from occurrence fields with inline recurrence controls", async () => {
    const fetchMock = mockCalendarWorkspaceFetches();
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Add chore" }));
    const editor = getChoreEditor();
    expect(editor.getByRole("button", { name: "Close dialog" })).toBeTruthy();
    expect(editor.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(editor.getByRole("button", { name: "Add chore" })).toBeTruthy();
    expect(editor.queryByRole("button", { name: "Save chore" })).toBeNull();
    expect(screen.getByText("Add steps, scope, or preferences. This helps future optimization understand what the chore includes.")).toBeTruthy();
    expect(screen.getByText("Optional labels like bathroom, outdoor, or deep clean. Tags help group chores and give optimization more context.")).toBeTruthy();
    expect(screen.getByText("Choose the first date, optional timing, owner, and whether this chore repeats.")).toBeTruthy();
    expect(screen.getByText("Leave blank if this can be done anytime on the selected day.")).toBeTruthy();
    expect(screen.getByText("Used for flexible chores. If you add a start time, the end time is calculated from this duration.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Upcoming Occurrences" })).toBeNull();
    expect(screen.queryByRole("button", { name: "History" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Chore title"), { target: { value: "Clean bathrooms" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-06-06" } });
    fireEvent.change(screen.getByLabelText(/Estimated duration/), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "app-user-2" } });
    expect(screen.queryByRole("button", { name: /Repeat this chore/i })).toBeNull();
    expect(screen.queryByText("Days")).toBeNull();
    expect(screen.queryByLabelText("Repeat interval")).toBeNull();
    expect(screen.getByRole("button", { name: "Does not repeat" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Repeats" }));
    expect(screen.getByText("Repeats every")).toBeTruthy();
    expect(screen.getByLabelText("Repeat interval")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Repeat unit"), { target: { value: "weekly" } });
    expect(screen.getByText("Days")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Repeat interval"), { target: { value: "5" } });

    fireEvent.click(editor.getByRole("button", { name: "Add chore" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"startsOn\":\"2026-06-06\"")
      })
    ));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"memberUserIds\":[\"app-user-2\"]")
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"frequency\":\"weekly\"")
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"interval\":5")
      })
    );
  });

  it("refreshes calendar occurrences after creating a chore", async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Add chore" }));
    fireEvent.change(screen.getByLabelText("Chore title"), { target: { value: "Wash windows" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-06-06" } });
    fireEvent.click(getChoreEditor().getByRole("button", { name: "Add chore" }));

    expect(await screen.findByRole("button", { name: "View Wash windows" })).toBeTruthy();
  });

  it("uses optional start time to create timed chores", async () => {
    const fetchMock = mockCalendarWorkspaceFetches();
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Add chore" }));
    fireEvent.change(screen.getByLabelText("Chore title"), { target: { value: "Clean kitchen" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-06-06" } });
    fireEvent.change(screen.getByLabelText(/Start time/), { target: { value: "10:30" } });
    fireEvent.change(screen.getByLabelText(/Estimated duration/), { target: { value: "45" } });
    fireEvent.click(getChoreEditor().getByRole("button", { name: "Add chore" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"planningMode\":\"timed\"")
      })
    ));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"localStartTime\":\"10:30\"")
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"localEndTime\":\"11:15\"")
      })
    );
  });

  it("reveals monthly recurrence details only for monthly chores", async () => {
    const fetchMock = mockCalendarWorkspaceFetches();
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Add chore" }));
    fireEvent.change(screen.getByLabelText("Chore title"), { target: { value: "Replace filter" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-06-15" } });
    expect(screen.queryByLabelText("Monthly anchor date")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Repeats" }));
    fireEvent.change(screen.getByLabelText("Repeat unit"), { target: { value: "monthly" } });
    expect(screen.queryByLabelText("Monthly anchor date")).toBeNull();
    expect(screen.getByRole("radio", { name: "On day 15 of the month" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "On the third Monday" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "On the third Monday" }));
    fireEvent.click(getChoreEditor().getByRole("button", { name: "Add chore" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"monthlyPattern\":\"weekday_of_month\"")
      })
    ));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"monthlyWeek\":3")
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"monthlyWeekday\":1")
      })
    );
  });

  it("creates yearly recurring chores from the repeat unit select", async () => {
    const fetchMock = mockCalendarWorkspaceFetches();
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Add chore" }));
    fireEvent.change(screen.getByLabelText("Chore title"), { target: { value: "Service HVAC" } });
    fireEvent.click(screen.getByRole("button", { name: "Repeats" }));
    fireEvent.change(screen.getByLabelText("Repeat interval"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Repeat unit"), { target: { value: "yearly" } });
    expect(screen.queryByText("Days")).toBeNull();
    expect(screen.queryByLabelText("Monthly anchor date")).toBeNull();
    fireEvent.click(getChoreEditor().getByRole("button", { name: "Add chore" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/chores",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"frequency\":\"yearly\"")
      })
    ));
  });

  it("opens a selected occurrence in view mode before editing", async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    fireEvent.click(await findPlannedCleanBathroomsButton());
    expect(screen.getByRole("heading", { name: "Clean bathrooms" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Upcoming occurrences" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = getChoreEditor();
    expect(dialog.getByRole("heading", { name: "Clean bathrooms" })).toBeTruthy();
    expect(dialog.getByText("Edit chore")).toBeTruthy();
    const schedulePanel = screen.getByRole("region", { name: "Chore schedule" });
    expect(schedulePanel.classList.contains("create-schedule-panel")).toBe(true);
    expect(schedulePanel.querySelector(".aligned-field-grid")).not.toBeNull();
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-05-28");
    expect((screen.getByLabelText("Assignee") as HTMLSelectElement).value).toBe("app-user-1");
    expect((screen.getByLabelText(/Estimated duration/) as HTMLInputElement).value).toBe("60");
    expect(screen.getByRole("button", { name: "Does not repeat" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Occurrence timing" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Schedule series" })).toBeNull();
    expect(screen.queryByRole("button", { name: "History" })).toBeNull();
  });

  it("saves schedule series edits from the occurrence editor", async () => {
    const fetchMock = mockCalendarWorkspaceFetches();
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/calendar");

    fireEvent.click(await findPlannedCleanBathroomsButton());
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy());
    await waitFor(() => expect(screen.getByLabelText(/Estimated duration/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/Estimated duration/), { target: { value: "75" } });
    fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "app-user-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/schedules/schedule-1",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining("\"estimatedMinutes\":75")
      })
    ));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/schedules/schedule-1",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining("\"memberUserIds\":[\"app-user-2\"]")
      })
    );
    expect(screen.getByRole("status").textContent).toContain("Schedule saved.");
  });

  it("completes an assigned flexible obligation from its row and removes duplicate projections", async () => {
    const fetchMock = mockCalendarWorkspaceFetches();
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("tab", { name: "List" }));
    fireEvent.click(screen.getByRole("button", { name: "View Clean bathrooms" }));
    fireEvent.click(screen.getByRole("button", { name: "Complete chore" }));
    fireEvent.click(await screen.findByLabelText("Base future occurrences on this completion date"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "View Clean bathrooms" }).classList.contains("is-completed")).toBe(true));
    expect(screen.getAllByText("Clean bathrooms")).toHaveLength(1);
    expect(screen.getByText("2 completed")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/occurrences/occurrence-flexible/complete",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"rebaseFutureOccurrences\":true")
      })
    );
    const completeCall = fetchMock.mock.calls.find(([url]) =>
      String(url) === "http://localhost:3001/api/households/household-1/occurrences/occurrence-flexible/complete"
    );
    expect(String(completeCall?.[1]?.body)).not.toContain("keepAssignee");
  });

  it("adds the first household from the no-households state", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (url === "http://localhost:3001/api/me" && method === "GET") {
        return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
      }

      if (url === "http://localhost:3001/api/households" && method === "GET") {
        return { ok: true, json: async () => [] };
      }

      if (url === "http://localhost:3001/api/households" && method === "POST") {
        return { ok: true, json: async () => ({ id: "household-new", name: "New household" }) };
      }

      throw new Error(`Unhandled fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/households");

    await waitFor(() => expect(screen.getByRole("button", { name: "Add household" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add household" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "New household" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Manage" })).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-user-a" }),
        body: JSON.stringify({ name: "New household" })
      })
    );
  });

  it("renders a compact floor selector and selects the main floor by default", async () => {
    restoreHouseholdInStorage();
    const fetchMock = mockHouseholdsPageFetches({
      householdId: "household-1",
      floors: [
        {
          id: "floor-main",
          householdId: "household-1",
          name: "Main floor",
          levelType: "main",
          flooring: ["hardwood", "rugs"],
          petImpact: "medium",
          robotVacuumCoverage: "most",
          robotMopCoverage: "partial",
          rooms: []
        }
      ]
    });

    renderAt("/households");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Manage" })).toBeTruthy();
      expect(screen.getByLabelText("Home floor editor").classList.contains("panel")).toBe(true);
      expect(screen.queryByLabelText("Select Main floor")).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
      expect(screen.getByText("1 floor / 1 chore")).toBeTruthy();
      expect(screen.queryByLabelText("Select Main floor")).toBeNull();
      expect(screen.queryByRole("button", { name: "Add room" })).toBeNull();
    });
    await openHouseholdManageTab("Floors");

    expect(screen.getByLabelText("Select Main floor")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Main floor" })).toBeTruthy();
    expect(screen.getByText("hardwood, rugs")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "hardwood" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit surfaces" }));
    expect(screen.getByRole("button", { name: "hardwood" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "rugs" }).getAttribute("aria-pressed")).toBe("true");
    expect(fetchMock).not.toHaveBeenCalledWith("http://localhost:3001/api/households/household-1/structure");
  });

  it("saves household profile details from Manage overview", async () => {
    const fetchMock = mockHouseholdsPageFetches({
      householdId: "household-1",
      floors: [{
        id: "floor-main",
        householdId: "household-1",
        name: "Main floor",
        levelType: "main",
        flooring: [],
        petImpact: "medium",
        robotVacuumCoverage: "none",
        robotMopCoverage: "none",
        rooms: []
      }]
    });

    renderAt("/households");
    await manageHomeHousehold();
    fireEvent.change(screen.getByLabelText("Household name"), { target: { value: "Lake House" } });
    fireEvent.click(screen.getByRole("button", { name: "Save household profile" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3001/api/households/household-1/profile",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            name: "Lake House",
            homeType: "house",
            hasPets: true,
            hasOutdoorSpace: false,
            notes: ""
          })
        })
      );
    });
  });

  it("adds and removes a basement floor with confirmation", async () => {
    restoreHouseholdInStorage();
    mockHouseholdsPageFetches({ householdId: "household-1", floors: [] });

    renderAt("/households");

    await manageHomeHousehold();
    await openHouseholdManageTab("Floors");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add basement" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add basement" }));

    expect(screen.getByLabelText("Select Basement")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Basement" })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove basement" }).hasAttribute("disabled")).toBe(false));

    fireEvent.click(screen.getByRole("button", { name: "Remove basement" }));
    expect(screen.getByText("Remove Basement and 0 rooms?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove floor" }));

    expect(screen.queryByLabelText("Select Basement")).toBeNull();
  });

  it("allows multiple flooring chips on a floor", async () => {
    restoreHouseholdInStorage();
    const fetchMock = mockHouseholdsPageFetches({
      householdId: "household-1",
      floors: [
        {
          id: "floor-main",
          householdId: "household-1",
          name: "Main floor",
          levelType: "main",
          flooring: [],
          petImpact: "none",
          robotVacuumCoverage: "none",
          robotMopCoverage: "none",
          rooms: []
        }
      ]
    });

    renderAt("/households");

    await manageHomeHousehold();
    await openHouseholdManageTab("Floors");
    await editFloorSurfaces();
    await waitFor(() => expect(screen.getByRole("button", { name: "hardwood" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "hardwood" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "rugs" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "rugs" }));

    expect(screen.getByRole("button", { name: "hardwood" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "rugs" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3001/api/households/household-1/structure",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("\"hardwood\"")
        })
      );
    });
  });

  it("rolls back floor edits when saving structure fails", async () => {
    restoreHouseholdInStorage();
    mockHouseholdsPageFetches(
      {
        householdId: "household-1",
        floors: [
          {
            id: "floor-main",
            householdId: "household-1",
            name: "Main floor",
            levelType: "main",
            flooring: [],
            petImpact: "none",
            robotVacuumCoverage: "none",
            robotMopCoverage: "none",
            rooms: []
          }
        ]
      },
      {
        saveResponse: { ok: false, json: async () => ({ error: "Save failed" }) }
      }
    );

    renderAt("/households");

    await manageHomeHousehold();
    await openHouseholdManageTab("Floors");
    await editFloorSurfaces();
    await waitFor(() => expect(screen.getByRole("button", { name: "hardwood" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "hardwood" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Could not save household structure.");
      expect(screen.getByRole("button", { name: "hardwood" }).getAttribute("aria-pressed")).toBe("false");
    });
  });

  it("blocks additional floor edits while a structure save is pending", async () => {
    restoreHouseholdInStorage();
    const deferred = createDeferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const fetchMock = mockHouseholdsPageFetches(
      {
        householdId: "household-1",
        floors: [
          {
            id: "floor-main",
            householdId: "household-1",
            name: "Main floor",
            levelType: "main",
            flooring: [],
            petImpact: "none",
            robotVacuumCoverage: "none",
            robotMopCoverage: "none",
            rooms: []
          }
        ]
      },
      { savePromise: deferred.promise }
    );

    renderAt("/households");

    await manageHomeHousehold();
    await openHouseholdManageTab("Floors");
    await editFloorSurfaces();
    await waitFor(() => expect(screen.getByRole("button", { name: "hardwood" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "hardwood" }));
    fireEvent.click(screen.getByRole("button", { name: "rugs" }));

    expect(screen.getByRole("button", { name: "rugs" }).hasAttribute("disabled")).toBe(true);
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url, init]) =>
        url === "http://localhost:3001/api/households/household-1/structure" && init?.method === "PUT"
      )).toHaveLength(1);
    });

    deferred.resolve({ ok: true, json: async () => ({ householdId: "household-1", floors: [] }) });
  });

  it("adds and edits room cards on the selected floor", async () => {
    restoreHouseholdInStorage();
    mockHouseholdsPageFetches({
      householdId: "household-1",
      floors: [
        {
          id: "floor-main",
          householdId: "household-1",
          name: "Main floor",
          levelType: "main",
          flooring: ["hardwood"],
          petImpact: "medium",
          robotVacuumCoverage: "most",
          robotMopCoverage: "partial",
          rooms: []
        }
      ]
    });

    renderAt("/households");

    await manageHomeHousehold();
    await openHouseholdManageTab("Rooms");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add room" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add room" }));
    fireEvent.change(screen.getByLabelText("Room name"), { target: { value: "Kitchen" } });
    fireEvent.click(screen.getByRole("button", { name: "Save room" }));

    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Edit Kitchen" }));
    fireEvent.click(within(screen.getByLabelText("Room flooring")).getByRole("button", { name: "rugs" }));
    fireEvent.click(screen.getByRole("button", { name: "Save room" }));

    await waitFor(() => expect(screen.getByText("hardwood, rugs")).toBeTruthy());
  });

  it("saves a room to the floor where editing started after switching floors", async () => {
    restoreHouseholdInStorage();
    const fetchMock = mockHouseholdsPageFetches({
      householdId: "household-1",
      floors: [
        {
          id: "floor-upstairs",
          householdId: "household-1",
          name: "Upstairs",
          levelType: "upstairs",
          flooring: ["carpet"],
          petImpact: "low",
          robotVacuumCoverage: "partial",
          robotMopCoverage: "none",
          rooms: []
        },
        {
          id: "floor-main",
          householdId: "household-1",
          name: "Main floor",
          levelType: "main",
          flooring: ["hardwood"],
          petImpact: "medium",
          robotVacuumCoverage: "most",
          robotMopCoverage: "partial",
          rooms: []
        }
      ]
    });

    renderAt("/households");

    await manageHomeHousehold();
    await openHouseholdManageTab("Rooms");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add room" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add room" }));
    fireEvent.change(screen.getByLabelText("Room name"), { target: { value: "Kitchen" } });
    fireEvent.click(screen.getByLabelText("Select Upstairs"));
    fireEvent.click(screen.getByRole("button", { name: "Save room" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, init]) => {
        if (url !== "http://localhost:3001/api/households/household-1/structure" || init?.method !== "PUT") return false;
        const body = JSON.parse(String(init.body)) as Pick<HouseholdStructure, "floors">;
        return body.floors.some((floor) =>
          floor.id === "floor-main" && floor.rooms.some((room) => room.name === "Kitchen" && room.floorId === "floor-main")
        );
      })).toBe(true);
    });
  });

  it("shows the Google Calendar connection shell in Settings", async () => {
    mockEmptyAppDataFetches();
    renderAt("/settings#calendar");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Google Calendar" })).toBeTruthy();
    expect(screen.getByText("Not connected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect Google Calendar" }));
    expect(screen.getByText(/connection flow is coming next/i)).toBeTruthy();
  });

  it("shows the Optimize recommendation selection flow", async () => {
    restoreHouseholdInStorage();
    mockRestoredHouseholdFetches();

    renderAt("/optimize");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Optimize" })).toBeTruthy();
      expect(screen.getByLabelText("Clean bathrooms")).toBeTruthy();
    });

    expect(screen.getByRole("tab", { name: "Recommendations" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Chat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review selected chores" })).toBeTruthy();
  });

  it("shows Optimize chat prompts and renders an assistant answer", async () => {
    restoreHouseholdInStorage();
    const fetchMock = mockRestoredHouseholdFetches({
      chatResponses: [
        {
        ok: true,
        json: async () => ({ answer: "Clean bathrooms may be under-scoped." })
        }
      ]
    });

    renderAt("/optimize");

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Chat" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));

    expect(screen.getByText("Which chores look under-scoped?")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Ask the assistant"), {
      target: { value: "Which chores look under-scoped?" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Clean bathrooms may be under-scoped.")).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://localhost:3001/api/households/household-1/assistant/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Which chores look under-scoped?" })
      })
    );
  });

  it("keeps Optimize chat messages visible when assistant chat fails", async () => {
    restoreHouseholdInStorage();
    mockRestoredHouseholdFetches({
      chores: [],
      recommendations: [],
      chatResponses: [
        {
        ok: true,
        json: async () => ({ answer: "First answer." })
        },
        {
        ok: false,
        json: async () => ({ error: "Could not answer assistant question" })
        }
      ]
    });

    renderAt("/optimize");

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Chat" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));
    fireEvent.change(screen.getByLabelText("Ask the assistant"), {
      target: { value: "First question" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("First answer.")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Ask the assistant"), {
      target: { value: "Second question" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("First answer.")).toBeTruthy();
      expect(screen.getByRole("status").textContent).toBe("Could not answer assistant question.");
    });
  });
});
