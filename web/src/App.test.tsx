import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  AppNotification,
  CalendarImportQueueItem,
  CleanlyCalendarEvent,
  TaskOccurrence,
  CreateScheduledTaskInput,
  HouseholdAppData,
  HouseholdInvitation,
  HouseholdMemberSummary,
  HouseholdStructure
} from "@chore-helper/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { completeOccurrence, createScheduledTask, listOccurrences, updateCompletionCheckIn } from "./api";
import App from "./App";

const clerkState = vi.hoisted(() => ({
  authLoaded: true,
  signedIn: true,
  getToken: vi.fn<() => Promise<string | null>>(async () => "test-user-a")
}));

vi.mock("@clerk/clerk-react", () => ({
  SignInButton: ({ children, forceRedirectUrl }: { children?: React.ReactNode; forceRedirectUrl?: string }) => (
    <button data-force-redirect-url={forceRedirectUrl} type="button">{children ?? "Sign in"}</button>
  ),
  SignUpButton: ({ children, forceRedirectUrl }: { children?: React.ReactNode; forceRedirectUrl?: string }) => (
    <button data-force-redirect-url={forceRedirectUrl} type="button">{children ?? "Sign up"}</button>
  ),
  SignedIn: ({ children }: { children: React.ReactNode }) => (clerkState.signedIn ? <>{children}</> : null),
  SignedOut: ({ children }: { children: React.ReactNode }) => (!clerkState.signedIn ? <>{children}</> : null),
  UserButton: () => <button aria-label="User menu" type="button" />,
  useAuth: () => ({
    isLoaded: clerkState.authLoaded,
    getToken: clerkState.getToken
  })
}));

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

function stubScrollIntoView() {
  const scrollIntoView = vi.fn();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: scrollIntoView
  });
  return scrollIntoView;
}

async function withMay2026CalendarClock(callback: () => Promise<void>) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-05-30T12:00:00.000-04:00"));
  try {
    await callback();
  } finally {
    vi.useRealTimers();
  }
}

function getTaskEditor() {
  const editor = document.querySelector(".chore-editor-modal");
  expect(editor).not.toBeNull();
  return within(editor as HTMLElement);
}

function getTaskEditorElement() {
  const editor = document.querySelector(".chore-editor-modal");
  expect(editor).not.toBeNull();
  return editor as HTMLElement;
}

async function openCalendarActions() {
  fireEvent.click(await screen.findByRole("button", { name: "Calendar actions" }));
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
  clerkState.authLoaded = true;
  clerkState.signedIn = true;
  clerkState.getToken.mockReset();
  clerkState.getToken.mockResolvedValue("test-user-a");
}

function mockClerkSignedOut() {
  clerkState.authLoaded = true;
  clerkState.signedIn = false;
  clerkState.getToken.mockReset();
  clerkState.getToken.mockResolvedValue(null);
}

function mockClerkLoading() {
  clerkState.authLoaded = false;
  clerkState.signedIn = true;
  clerkState.getToken.mockReset();
  clerkState.getToken.mockResolvedValue(null);
}

async function manageHomeHousehold() {
  await waitFor(() => expect(screen.getByRole("heading", { name: "My Home", level: 1 })).toBeTruthy());
}

async function editHomeDetails() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit home details" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Edit home details" }));
}

async function editSelectedFloor() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit floor" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Edit floor" }));
}

async function openHouseholdManageTab(name: "Overview" | "Floors") {
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

const cleanBathroomsTask = {
  id: "chore-1",
  householdId: "household-1",
  title: "Clean bathrooms",
  type: "chore" as const,
  libraryState: "saved" as const,
  source: "manual"
};

const ownerMember: HouseholdMemberSummary = {
  householdId: "household-1",
  userId: "app-user-1",
  clerkUserId: "test-user-a",
  primaryEmail: "owner@example.com",
  displayName: "Alex Owner",
  role: "owner",
  taskLibraryPermission: "manage"
};

const secondMember: HouseholdMemberSummary = {
  householdId: "household-1",
  userId: "app-user-2",
  clerkUserId: "test-user-b",
  primaryEmail: "member@example.com",
  displayName: "Morgan Member",
  role: "member",
  taskLibraryPermission: "view"
};

function createHouseholdAppData({
  chores = [cleanBathroomsTask],
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
  chores?: typeof cleanBathroomsTask[];
  recommendations?: unknown[];
  structure?: HouseholdStructure;
} = {}): HouseholdAppData {
  return {
    ...household,
    structure,
    tasks: chores.map((task) => ({ ...task, recommendations: [] })),
    recommendations
  } as HouseholdAppData;
}

function mockRestoredHouseholdFetches({
  chores = [cleanBathroomsTask],
  archivedTasks = [],
  recommendations = [],
  chatResponses = [],
  calendarPreferencesOk = true,
  currentUserId = "app-user-1",
  membersOk = true,
  members = [ownerMember, secondMember]
}: {
  chores?: typeof cleanBathroomsTask[];
  archivedTasks?: typeof cleanBathroomsTask[];
  recommendations?: unknown[];
  chatResponses?: Array<{ ok: boolean; json: () => Promise<unknown> }>;
  calendarPreferencesOk?: boolean;
  currentUserId?: string;
  membersOk?: boolean;
  members?: HouseholdMemberSummary[];
} = {}) {
  let activeTasks = [...chores];
  let inactiveTasks = [...archivedTasks];
  let householdMembers = [...members];
  const nextChatResponses = [...chatResponses];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (url === "http://localhost:3001/api/households" && method === "GET") {
      return { ok: true, json: async () => [createHouseholdAppData({ chores, recommendations })] };
    }

    if (url === "http://localhost:3001/api/me" && method === "GET") {
      return { ok: true, json: async () => ({ id: currentUserId, clerkUserId: "test-user-a" }) };
    }

    if (url === "http://localhost:3001/api/households/household-1/tasks" && method === "GET") {
      return { ok: true, json: async () => activeTasks };
    }

    if (url === "http://localhost:3001/api/households/household-1/tasks?status=archived" && method === "GET") {
      return { ok: true, json: async () => inactiveTasks };
    }

    if (url === "http://localhost:3001/api/households/household-1/tasks" && method === "POST") {
      const body = JSON.parse(String(init?.body));
      const created = { id: "chore-new", householdId: "household-1", ...body.task };
      activeTasks = [...activeTasks, created];
      return { ok: true, json: async () => created };
    }

    if (url === "http://localhost:3001/api/households/household-1/tasks/chore-1" && method === "PUT") {
      const body = JSON.parse(String(init?.body));
      const updated = { ...activeTasks.find((chore) => chore.id === "chore-1")!, ...body };
      activeTasks = activeTasks.map((chore) => chore.id === "chore-1" ? updated : chore);
      return { ok: true, json: async () => updated };
    }

    if (url === "http://localhost:3001/api/households/household-1/tasks/chore-1/archive" && method === "POST") {
      const archived = { ...activeTasks.find((chore) => chore.id === "chore-1")!, archivedAt: "2026-06-13T12:00:00.000Z" };
      activeTasks = activeTasks.filter((chore) => chore.id !== "chore-1");
      inactiveTasks = [archived, ...inactiveTasks];
      return { ok: true, json: async () => archived };
    }

    if (url === "http://localhost:3001/api/households/household-1/tasks/chore-1/restore" && method === "POST") {
      const restored = { ...inactiveTasks.find((chore) => chore.id === "chore-1")!, archivedAt: undefined };
      inactiveTasks = inactiveTasks.filter((chore) => chore.id !== "chore-1");
      activeTasks = [restored, ...activeTasks];
      return { ok: true, json: async () => restored };
    }

    if (url === "http://localhost:3001/api/households/household-1/members" && method === "GET") {
      if (!membersOk) return { ok: false, json: async () => ({ error: "Column taskLibraryPermission does not exist." }) };
      return { ok: true, json: async () => householdMembers };
    }

    if (url === "http://localhost:3001/api/households/household-1/members/app-user-2/task-library-permission" && method === "PATCH") {
      const body = JSON.parse(String(init?.body));
      householdMembers = householdMembers.map((member) =>
        member.userId === "app-user-2" ? { ...member, taskLibraryPermission: body.taskLibraryPermission } : member
      );
      return { ok: true, json: async () => householdMembers.find((member) => member.userId === "app-user-2") };
    }

    if (url === "http://localhost:3001/api/me/calendar/connections" && method === "GET") {
      return { ok: true, json: async () => [] };
    }

    if (url === "http://localhost:3001/api/me/calendar/external-calendars" && method === "GET") {
      return { ok: true, json: async () => [] };
    }

    if (url === "http://localhost:3001/api/me/calendar/preferences?householdId=household-1" && method === "GET") {
      if (!calendarPreferencesOk) return { ok: false, json: async () => ({ error: "Calendar preferences unavailable." }) };
      return {
        ok: true,
        json: async () => ({
          householdId: "household-1",
          defaultDetailLevel: "busy_only",
          selectedSourceCalendarIds: [],
          exportMode: "off",
          exportContentMode: "chores"
        })
      };
    }

    if (url === "http://localhost:3001/api/me/calendar/preferences" && method === "PATCH") {
      return { ok: true, json: async () => JSON.parse(String(init?.body)) };
    }

    if (url === "http://localhost:3001/api/households/household-1/calendar/import-policies" && method === "GET") {
      return {
        ok: true,
        json: async () => [
          {
            householdId: "household-1",
            memberId: "app-user-1",
            memberName: "Alex Owner",
            memberEmail: "owner@example.com",
            importQueueMode: "manual",
            importContentMode: "both"
          },
          {
            householdId: "household-1",
            memberId: "app-user-2",
            memberName: "Morgan Member",
            memberEmail: "member@example.com",
            importQueueMode: "manual",
            importContentMode: "both"
          }
        ]
      };
    }

    if (url === "http://localhost:3001/api/me/calendar/google/connect" && method === "POST") {
      return { ok: true, json: async () => ({ provider: "google", status: "setup_required", message: "Google Calendar login needs Google client configuration." }) };
    }

    if (url === "http://localhost:3001/api/me/calendar/import-candidates?householdId=household-1" && method === "GET") {
      return { ok: true, json: async () => [] };
    }

    if (url === "http://localhost:3001/api/me/calendar/import-queue" && method === "POST") {
      return { ok: true, json: async () => ({ status: "queued_for_review", items: [] }) };
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
    allowAddHousehold?: boolean;
    allowDeleteHousehold?: boolean;
    saveResponse?: { ok: boolean; json: () => Promise<unknown> };
    savePromise?: Promise<{ ok: boolean; json: () => Promise<unknown> }>;
  } = {}
) {
  let storedStructure = structure;
  let isDeleted = false;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (url === "http://localhost:3001/api/me" && method === "GET") {
      return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
    }

    if (url === "http://localhost:3001/api/households" && method === "GET") {
      return {
        ok: true,
        json: async () => isDeleted ? [] : [createHouseholdAppData({ structure: storedStructure })]
      };
    }

    if (url === "http://localhost:3001/api/households" && method === "POST" && options.allowAddHousehold) {
      return { ok: true, json: async () => ({ id: "household-new", name: "New household" }) };
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

    if (url === "http://localhost:3001/api/households/household-1" && method === "DELETE" && options.allowDeleteHousehold) {
      isDeleted = true;
      return { ok: true, json: async () => ({}) };
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
      role: currentRole,
      taskLibraryPermission: currentRole === "owner" ? "manage" : "view"
    },
    {
      householdId: "household-1",
      userId: "app-user-2",
      clerkUserId: "test-user-b",
      primaryEmail: "member@example.com",
      displayName: "Morgan Member",
      role: currentRole === "owner" ? "member" : "owner",
      taskLibraryPermission: currentRole === "owner" ? "view" : "manage"
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
  const occurrences: TaskOccurrence[] = [{
    id: "occurrence-family-1",
    householdId: "household-1",
    taskId: "chore-1",
    scheduleId: "schedule-1",
    sequence: 1,
    planningMode: "flexible",
    estimatedMinutes: 30,
    eligibleStartOn: "2026-06-15",
    eligibleEndOn: "2026-06-15",
    assignedUserId: "app-user-1",
    exceptionType: "none",
    status: "planned"
  }, {
    id: "occurrence-family-2",
    householdId: "household-1",
    taskId: "chore-1",
    scheduleId: "schedule-2",
    sequence: 2,
    planningMode: "flexible",
    estimatedMinutes: 20,
    eligibleStartOn: "2026-06-17",
    eligibleEndOn: "2026-06-17",
    assignedUserId: "app-user-2",
    exceptionType: "none",
    status: "planned"
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
    if (url.startsWith("http://localhost:3001/api/households/household-1/occurrences?") && method === "GET") {
      return { ok: true, json: async () => occurrences };
    }
    if (url.startsWith("http://localhost:3001/api/households/household-1/calendar/events?") && method === "GET") {
      return { ok: true, json: async () => [] };
    }
    if (url === "http://localhost:3001/api/me/calendar/export" && method === "POST") {
      return { ok: true, json: async () => ({ status: "exported", exported: 0 }) };
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

function mockMultiHouseholdOptimizeFetches() {
  const secondHousehold = createHouseholdAppData({
    chores: [{ ...cleanBathroomsTask, id: "chore-2", householdId: "household-2", title: "Sweep entryway" }],
    structure: {
      householdId: "household-2",
      floors: [{
        id: "floor-second-main",
        householdId: "household-2",
        name: "Main floor",
        levelType: "main",
        flooring: ["hardwood"],
        petImpact: "low",
        robotVacuumCoverage: "none",
        robotMopCoverage: "none",
        rooms: []
      }]
    }
  });
  secondHousehold.id = "household-2";
  secondHousehold.name = "Lake house";
  secondHousehold.timeZone = "America/New_York";

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (url === "http://localhost:3001/api/me" && method === "GET") {
      return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
    }

    if (url === "http://localhost:3001/api/households" && method === "GET") {
      return { ok: true, json: async () => [createHouseholdAppData(), secondHousehold] };
    }

    if (url === "http://localhost:3001/api/households/household-1/tasks" && method === "GET") {
      return { ok: true, json: async () => [cleanBathroomsTask] };
    }

    if (url === "http://localhost:3001/api/households/household-2/tasks" && method === "GET") {
      return { ok: true, json: async () => [{ ...cleanBathroomsTask, id: "chore-2", householdId: "household-2", title: "Sweep entryway" }] };
    }

    if (url === "http://localhost:3001/api/households/household-1/recommendations" && method === "GET") {
      return { ok: true, json: async () => [] };
    }

    if (url === "http://localhost:3001/api/households/household-2/recommendations" && method === "GET") {
      return { ok: true, json: async () => [] };
    }

    if (url.endsWith("/assistant/chat") && method === "POST") {
      return { ok: true, json: async () => ({ answer: "Mock assistant answer." }) };
    }

    throw new Error(`Unhandled fetch ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockCalendarPageFetches(importQueueItems: CalendarImportQueueItem[] = [], notifications: AppNotification[] = []) {
  let notificationItems = notifications;
  let cleanlyCalendarEvents: CleanlyCalendarEvent[] = [];
  let occurrences = [{
    id: "occurrence-1",
    householdId: "household-1",
    taskId: "chore-1",
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
      role: "owner",
      taskLibraryPermission: "manage"
    },
    {
      householdId: "household-1",
      userId: "app-user-2",
      clerkUserId: "test-user-b",
      primaryEmail: "member@example.com",
      displayName: "Morgan Member",
      role: "member",
      taskLibraryPermission: "view"
    }
  ];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (url === "http://localhost:3001/api/me" && method === "GET") {
      return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
    }
    if (url === "http://localhost:3001/api/me/notifications" && method === "GET") {
      return {
        ok: true,
        json: async () => ({
          unreadTaskCount: notificationItems.filter((notification) => !notification.readAt).length,
          notifications: notificationItems
        })
      };
    }
    if (url === "http://localhost:3001/api/me/notifications/read" && method === "PATCH") {
      const body = JSON.parse(String(init?.body));
      const ids = new Set(body.notificationIds);
      notificationItems = notificationItems.map((notification) =>
        ids.has(notification.id)
          ? { ...notification, readAt: "2026-06-06T20:00:00.000Z" }
          : notification
      );
      return {
        ok: true,
        json: async () => ({
          unreadTaskCount: notificationItems.filter((notification) => !notification.readAt).length,
          notifications: notificationItems.filter((notification) => ids.has(notification.id))
        })
      };
    }
    if (url === "http://localhost:3001/api/households" && method === "GET") {
      return { ok: true, json: async () => [createHouseholdAppData()] };
    }
    if (url === "http://localhost:3001/api/households/household-1/members" && method === "GET") {
      return { ok: true, json: async () => members };
    }
    if (url === "http://localhost:3001/api/households/household-1/calendar/import-queue" && method === "GET") {
      return { ok: true, json: async () => importQueueItems };
    }
    if (url.startsWith("http://localhost:3001/api/households/household-1/calendar/events?") && method === "GET") {
      return { ok: true, json: async () => cleanlyCalendarEvents };
    }
    if (url === "http://localhost:3001/api/households/household-1/calendar/import-policies" && method === "GET") {
      return {
        ok: true,
        json: async () => members.map((member) => ({
          householdId: "household-1",
          memberId: member.userId,
          memberName: member.displayName ?? member.primaryEmail ?? member.userId,
          memberEmail: member.primaryEmail,
          importQueueMode: "manual",
          importContentMode: "both"
        }))
      };
    }
    if (url === "http://localhost:3001/api/me/calendar/import-policy?householdId=household-1" && method === "GET") {
      return {
        ok: true,
        json: async () => ({
          householdId: "household-1",
          memberId: "app-user-1",
          memberName: "Alex Owner",
          memberEmail: "owner@example.com",
          importQueueMode: "manual",
          importContentMode: "both"
        })
      };
    }
    if (url === "http://localhost:3001/api/me/calendar/connections" && method === "GET") {
      return { ok: true, json: async () => [] };
    }
    if (url === "http://localhost:3001/api/me/calendar/external-calendars" && method === "GET") {
      return { ok: true, json: async () => [] };
    }
    if (url === "http://localhost:3001/api/me/calendar/preferences?householdId=household-1" && method === "GET") {
      return {
        ok: true,
        json: async () => ({
          householdId: "household-1",
          defaultDetailLevel: "busy_only",
          selectedSourceCalendarIds: [],
          exportMode: "off",
          exportContentMode: "chores"
        })
      };
    }
    if (url === "http://localhost:3001/api/me/calendar/preferences" && method === "PATCH") {
      return { ok: true, json: async () => JSON.parse(String(init?.body)) };
    }
    if (url === "http://localhost:3001/api/me/calendar/google/connect" && method === "POST") {
      return { ok: true, json: async () => ({ provider: "google", status: "setup_required", message: "Google Calendar login needs Google client configuration." }) };
    }
    if (url === "http://localhost:3001/api/me/calendar/import-candidates?householdId=household-1" && method === "GET") {
      return { ok: true, json: async () => [] };
    }
    if (url === "http://localhost:3001/api/me/calendar/import-queue" && method === "POST") {
      return { ok: true, json: async () => ({ status: "queued_for_review", items: [] }) };
    }
    if (url === "http://localhost:3001/api/me/calendar/export" && method === "POST") {
      return { ok: true, json: async () => ({ status: "exported", exported: 0 }) };
    }
    if (url === "http://localhost:3001/api/households/household-1/calendar/import-queue/queue-1" && method === "PATCH") {
      const body = JSON.parse(String(init?.body));
      const createdCleanlyEventId = body.decision === "approve" ? "cleanly-event-1" : undefined;
      if (createdCleanlyEventId) {
        cleanlyCalendarEvents = [{
          id: createdCleanlyEventId,
          householdId: "household-1",
          createdByUserId: "app-user-2",
          type: body.proposedType,
          title: importQueueItems[0].title,
          privacyTitle: importQueueItems[0].privacyTitle,
          detailLevel: importQueueItems[0].detailLevel,
          startsAt: importQueueItems[0].startsAt,
          endsAt: importQueueItems[0].endsAt,
          timezone: "America/New_York",
          source: "google",
          status: "active"
        }];
      }
      return {
        ok: true,
        json: async () => ({
          ...importQueueItems[0],
          queueStatus: body.decision === "approve" ? "approved" : "rejected",
          createdCleanlyEventId
        })
      };
    }
    if (url.startsWith("http://localhost:3001/api/households/household-1/occurrences?") && method === "GET") {
      return { ok: true, json: async () => occurrences };
    }
    if (url === "http://localhost:3001/api/households/household-1/tasks/chore-1/schedules" && method === "GET") {
      return {
        ok: true,
        json: async () => [{
          id: "schedule-1",
          householdId: "household-1",
          taskId: "chore-1",
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
          taskId: "chore-1",
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
  calendarConnected = false,
  cleanlyCalendarEvents = [],
  frequency = "weekly",
  includeHistory = true,
  importCandidates = [],
  importQueueMode = "manual",
  occurrences: occurrenceOverrides
}: {
  calendarConnected?: boolean;
  cleanlyCalendarEvents?: Array<{
    id: string;
    householdId: string;
    createdByUserId: string;
    type: "chore" | "commitment";
    title: string;
    privacyTitle: string;
    detailLevel: "busy_only" | "full_details";
    startsAt: string;
    endsAt: string;
    timezone: string;
    source: "manual" | "google";
    status: "active" | "cancelled";
  }>;
  frequency?: "daily" | "weekly" | "monthly" | "yearly";
  includeHistory?: boolean;
  importQueueMode?: "off" | "manual" | "auto";
  occurrences?: TaskOccurrence[];
  importCandidates?: Array<{
    id: string;
    sourceExternalCalendarId: string;
    providerEventId: string;
    title: string;
    privacyTitle: string;
    startsAt: string;
    endsAt: string;
    proposedType: "chore" | "commitment";
    detailLevel: "busy_only" | "full_details";
  }>;
} = {}) {
  let storedCleanlyCalendarEvents = [...cleanlyCalendarEvents];
  const historyOccurrences: TaskOccurrence[] = includeHistory ? [{
    id: "occurrence-history",
    householdId: "household-1",
    taskId: "chore-1",
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
  }] : [];
  let occurrences: TaskOccurrence[] = occurrenceOverrides ?? [{
    id: "occurrence-flexible",
    householdId: "household-1",
    taskId: "chore-1",
    scheduleId: "schedule-1",
    sequence: 0,
    planningMode: "flexible",
    estimatedMinutes: 60,
    eligibleStartOn: "2026-05-28",
    eligibleEndOn: "2026-05-30",
    assignedUserId: "app-user-1",
    exceptionType: "none",
    status: "planned"
  }, ...historyOccurrences, {
    id: "occurrence-pet-completed",
    householdId: "household-1",
    taskId: "chore-2",
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
    role: "owner",
    taskLibraryPermission: "manage"
  }, {
    householdId: "household-1",
    userId: "app-user-2",
    clerkUserId: "test-user-b",
    primaryEmail: "member@example.com",
    displayName: "Taylor Member",
    role: "member",
    taskLibraryPermission: "view"
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
            cleanBathroomsTask,
            { ...cleanBathroomsTask, id: "chore-2", title: "Pet cats" }
          ]
        })]
      };
    }
    if (url.endsWith("/api/households/household-1/calendar/import-queue")) return { ok: true, json: async () => [] };
    if (url.endsWith("/api/households/household-1/calendar/import-policies")) {
      return {
        ok: true,
        json: async () => members.map((member) => ({
          householdId: "household-1",
          memberId: member.userId,
          memberName: member.displayName ?? member.primaryEmail ?? member.userId,
          memberEmail: member.primaryEmail,
          importQueueMode,
          importContentMode: "both"
        }))
      };
    }
    if (url.endsWith("/api/me/calendar/import-policy?householdId=household-1")) {
      return {
        ok: true,
        json: async () => ({
          householdId: "household-1",
          memberId: "app-user-1",
          memberName: "Alex Owner",
          memberEmail: "owner@example.com",
          importQueueMode,
          importContentMode: "both"
        })
      };
    }
    if (url.endsWith("/api/me/calendar/connections")) {
      return {
        ok: true,
        json: async () => calendarConnected ? [{
          id: "connection-1",
          provider: "google",
          providerAccountEmail: "owner@example.com",
          status: "connected",
          scopes: []
        }] : []
      };
    }
    if (url.endsWith("/api/me/calendar/connections/connection-1") && method === "DELETE") {
      return {
        ok: true,
        json: async () => ({
          connectionId: "connection-1",
          status: "disconnected",
          message: "Google Calendar was disconnected from Clenella."
        })
      };
    }
    if (url.endsWith("/api/me/calendar/external-calendars")) {
      return {
        ok: true,
        json: async () => calendarConnected ? [{
          id: "external-calendar-1",
          connectionId: "connection-1",
          providerCalendarId: "google-primary",
          name: "Personal calendar",
          isSelectedForImport: true,
          isSelectedForExport: true
        }] : []
      };
    }
    if (url.endsWith("/api/me/calendar/preferences?householdId=household-1")) {
      return {
        ok: true,
        json: async () => ({
          householdId: "household-1",
          defaultDetailLevel: "busy_only",
          selectedSourceCalendarIds: calendarConnected ? ["external-calendar-1"] : [],
          exportMode: calendarConnected ? "review" : "off",
          exportContentMode: "both",
          destinationExternalCalendarId: calendarConnected ? "external-calendar-1" : undefined
        })
      };
    }
    if (url.endsWith("/api/me/calendar/preferences") && method === "PATCH") return { ok: true, json: async () => JSON.parse(String(init?.body)) };
    if (url.endsWith("/api/me/calendar/google/connect") && method === "POST") {
      return { ok: true, json: async () => ({ provider: "google", status: "setup_required", message: "Google Calendar login needs Google client configuration." }) };
    }
    if (url.endsWith("/api/me/calendar/import-candidates?householdId=household-1")) return { ok: true, json: async () => importCandidates };
    if (url.endsWith("/api/me/calendar/import-queue") && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { events: typeof importCandidates };
      if (importQueueMode === "auto") {
        storedCleanlyCalendarEvents = [
          ...storedCleanlyCalendarEvents,
          ...body.events.map((event, index) => ({
            id: `cleanly-import-${index + 1}`,
            householdId: "household-1",
            createdByUserId: "app-user-1",
            type: event.proposedType,
            title: event.title,
            privacyTitle: event.privacyTitle,
            detailLevel: event.detailLevel,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            timezone: "America/New_York",
            source: "google" as const,
            status: "active" as const
          }))
        ];
      }
      return { ok: true, json: async () => ({ status: importQueueMode === "auto" ? "auto_ready" : "queued_for_review", items: [] }) };
    }
    if (url.includes("/members")) return { ok: true, json: async () => members };
    if (url.includes("/occurrences?") && method === "GET") return { ok: true, json: async () => occurrences };
    if (url.includes("/calendar/events?") && method === "GET") return { ok: true, json: async () => storedCleanlyCalendarEvents };
    if (url.endsWith("/api/me/calendar/export") && method === "POST") return { ok: true, json: async () => ({ status: "exported", exported: 0 }) };
    if (url.endsWith("/api/households/household-1/tasks/chore-1/schedules") && method === "GET") {
      return {
        ok: true,
        json: async () => [{
          id: "schedule-1",
          householdId: "household-1",
          taskId: "chore-1",
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
          taskId: "chore-1",
          ...JSON.parse(String(init?.body))
        })
      };
    }
    if (url.endsWith("/api/households/household-1/tasks") && method === "POST") {
      const body = JSON.parse(String(init?.body));
      const schedule = body.schedules[0];
      occurrences = [...occurrences, {
        id: "occurrence-new",
        householdId: "household-1",
        taskId: "chore-new",
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
          task: {
            id: "chore-new",
            householdId: "household-1",
            title: body.task.title,
            type: body.task.type,
            libraryState: body.task.libraryState,
            source: "manual"
          },
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
  setViewportWidth(1024);
  delete (Element.prototype as { scrollIntoView?: Element["scrollIntoView"] }).scrollIntoView;
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("App", () => {
  it("posts scheduled chore creation and occurrence completion through the unified API", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (url === "http://localhost:3001/api/households/household-1/tasks" && method === "POST") {
        return {
          ok: true,
          json: async () => ({
            task: {
              id: "chore-1",
              householdId: "household-1",
              title: "Clean bathrooms",
              type: "chore",
              libraryState: "saved",
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
            taskId: "chore-1",
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
    const input: CreateScheduledTaskInput = {
      task: { title: "Clean bathrooms", type: "chore", libraryState: "saved", source: "manual" },
      schedules: [{
        planningMode: "timed",
        recurrence: { frequency: "daily", interval: 1 },
        localStartTime: "09:00",
        localEndTime: "09:30",
        startsOn: "2026-05-25",
        assignment: { mode: "fixed", memberUserIds: ["app-user-1"] }
      }]
    };

    await createScheduledTask("household-1", input);
    await listOccurrences("household-1", {
      startAt: "2026-05-25T04:00:00.000Z",
      endAt: "2026-05-26T03:59:59.000Z",
      startOn: "2026-05-25",
      endOn: "2026-05-25"
    });
    await completeOccurrence("household-1", "occurrence-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/tasks",
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

  it("updates a completed occurrence check-in through the unified API", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (
        url === "http://localhost:3001/api/households/household-1/occurrences/occurrence-1/check-in" &&
        method === "PUT"
      ) {
        return {
          ok: true,
          json: async () => ({
            id: "check-in-1",
            householdId: "household-1",
            occurrenceId: "occurrence-1",
            completedOnTime: true,
            durationAccurate: false,
            rebaseFutureOccurrences: true,
            createdAt: "2026-05-25T14:20:00.000Z",
            updatedAt: "2026-05-25T14:25:00.000Z"
          })
        };
      }

      throw new Error(`Unhandled fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const checkIn = await updateCompletionCheckIn("household-1", "occurrence-1", {
      completedOnTime: true,
      durationAccurate: false,
      rebaseFutureOccurrences: true
    });

    expect(checkIn.durationAccurate).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/occurrences/occurrence-1/check-in",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"rebaseFutureOccurrences":true')
      })
    );
  });

  it("routes signed-in root visits to Today", async () => {
    mockRestoredHouseholdFetches();
    renderAt("/");

    await waitFor(() => expect(screen.getByText("Ready to optimize")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy();
    expect(window.location.pathname).toBe("/");
    expect(screen.queryByText("Watch the week click into place.")).toBeNull();
  });

  it("renders the current primary navigation without setup", async () => {
    mockEmptyAppDataFetches();
    renderAt("/today");

    const nav = await screen.findByRole("navigation", { name: "Primary" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Optimize", "Today", "Calendar", "Tasks", "My Home", "Family", "Settings"]);
    expect(within(nav).getByRole("link", { name: "Optimize" }).classList.contains("is-primary-nav-action")).toBe(true);
    expect(within(nav).getByRole("link", { name: "Tasks" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Setup" })).toBeNull();
  });

  it("shows the Clenella logo in the signed-in header brand link", async () => {
    mockEmptyAppDataFetches();
    renderAt("/today");

    const brandLink = await screen.findByRole("link", { name: "Clenella" });
    const logo = brandLink.querySelector("img.brand-logo");
    expect(logo).not.toBeNull();
    expect(logo?.getAttribute("alt")).toBe("");
    expect(logo?.getAttribute("aria-hidden")).toBe("true");
    expect(logo?.getAttribute("src")).toBe("/clenella-logo.svg");
  });

  it("toggles the mobile navigation menu from the app shell", async () => {
    mockEmptyAppDataFetches();
    renderAt("/today");

    const nav = await screen.findByRole("navigation", { name: "Primary" });
    expect(nav.classList.contains("workspace-nav-mobile-overlay")).toBe(true);
    expect(nav.classList.contains("is-closed")).toBe(true);
    expect(nav.getAttribute("data-open")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(nav.classList.contains("is-open")).toBe(true);
    expect(nav.getAttribute("data-open")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Close navigation menu" }));
    expect(nav.classList.contains("is-closed")).toBe(true);
    expect(nav.getAttribute("data-open")).toBe("false");
  });

  it("loads Today dashboard occurrences across households", async () => {
    await withMay2026CalendarClock(async () => {
    const homeOccurrences = [{
      id: "occurrence-clean",
      householdId: "household-1",
      taskId: "chore-1",
      scheduleId: "schedule-1",
      sequence: 0,
      planningMode: "flexible",
      estimatedMinutes: 30,
      eligibleStartOn: "2026-05-30",
      eligibleEndOn: "2026-05-30",
      assignedUserId: "app-user-1",
      exceptionType: "none",
      status: "planned"
    }, {
      id: "occurrence-skipped",
      householdId: "household-1",
      taskId: "chore-1",
      scheduleId: "schedule-1",
      sequence: 1,
      planningMode: "flexible",
      estimatedMinutes: 30,
      eligibleStartOn: "2026-05-30",
      eligibleEndOn: "2026-05-30",
      assignedUserId: "app-user-1",
      exceptionType: "skipped",
      status: "skipped"
    }];
    const cabinOccurrences = [{
      id: "occurrence-mow",
      householdId: "household-2",
      taskId: "chore-cabin",
      scheduleId: "schedule-cabin",
      sequence: 0,
      planningMode: "flexible",
      estimatedMinutes: 45,
      eligibleStartOn: "2026-05-30",
      eligibleEndOn: "2026-05-30",
      assignedUserId: "app-user-1",
      exceptionType: "none",
      status: "completed",
      completedAt: "2026-05-30T14:00:00.000Z",
      completedByUserId: "app-user-1"
    }];
    const secondHousehold = {
      ...createHouseholdAppData({
        chores: [{ ...cleanBathroomsTask, id: "chore-cabin", householdId: "household-2", title: "Mow lawn" }],
        structure: { householdId: "household-2", floors: [] }
      }),
      id: "household-2",
      name: "Cabin",
      timeZone: "America/New_York"
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
      if (url === "http://localhost:3001/api/households/household-1/members" && method === "GET") {
        return { ok: true, json: async () => [{ householdId: "household-1", userId: "app-user-1", clerkUserId: "test-user-a", displayName: "Alex Owner", role: "owner" }] };
      }
      if (url === "http://localhost:3001/api/households/household-2/members" && method === "GET") {
        return { ok: true, json: async () => [{ householdId: "household-2", userId: "app-user-1", clerkUserId: "test-user-a", displayName: "Alex Owner", role: "owner" }] };
      }
      if (url.startsWith("http://localhost:3001/api/households/household-1/occurrences?") && method === "GET") {
        return { ok: true, json: async () => homeOccurrences };
      }
      if (url.startsWith("http://localhost:3001/api/households/household-2/occurrences?") && method === "GET") {
        return { ok: true, json: async () => cabinOccurrences };
      }

      throw new Error(`Unhandled fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/today");

    expect(await screen.findByRole("region", { name: "Seven day chore strip" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Selected day chores" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "View full calendar" })).toBeTruthy();
    expect(screen.getByText("done")).toBeTruthy();
    expect(screen.getByText("to do")).toBeTruthy();
    expect(screen.getByText("skipped")).toBeTruthy();
    expect(screen.getByText("hrs remaining")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Merged" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "By household" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Cabin" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Upcoming next 7 days" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Sunday May 24 0 due" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Saturday May 30 3 due, today/ })).toBeTruthy();
    expect(screen.getByText("TO DO (1)")).toBeTruthy();
    expect(screen.getByText("DONE (1)")).toBeTruthy();
    expect(screen.getByText("SKIPPED (1)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Complete Clean bathrooms" })).toBeTruthy();
    expect(screen.getByText("Improve future suggestions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "By household" }));
    expect(screen.getByRole("region", { name: "Home chores" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Cabin chores" })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) =>
      String(url).startsWith("http://localhost:3001/api/households/household-1/occurrences?") &&
      String(url).includes("startOn=") &&
      String(url).includes("endOn=")
    )).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) =>
      String(url).startsWith("http://localhost:3001/api/households/household-2/occurrences?") &&
      String(url).includes("startOn=") &&
      String(url).includes("endOn=")
    )).toBe(true);
    });
  });

  it("renders Today no-household state as the shared first-home panel without dashboard actions", async () => {
    mockEmptyAppDataFetches();
    renderAt("/today");

    expect(await screen.findByRole("heading", { name: "Today" })).toBeTruthy();
    const emptyHeading = await screen.findByRole("heading", { name: "Add or join a household" });
    const emptyPanel = emptyHeading.closest("section");
    expect(emptyPanel?.classList.contains("setup-empty-state")).toBe(true);
    expect(emptyPanel?.classList.contains("first-home-empty-state")).toBe(true);
    expect(screen.queryByRole("button", { name: "Add household" })).toBeNull();
    expect(screen.queryByLabelText("Today status summary")).toBeNull();
  });

  it("renders Calendar no-household state as the shared first-home panel without top actions", async () => {
    mockEmptyAppDataFetches();
    renderAt("/calendar");

    expect(await screen.findByRole("heading", { name: "Calendar" })).toBeTruthy();
    const emptyHeading = await screen.findByRole("heading", { name: "Add or join a household" });
    const emptyPanel = emptyHeading.closest("section");
    expect(emptyPanel?.classList.contains("setup-empty-state")).toBe(true);
    expect(emptyPanel?.classList.contains("first-home-empty-state")).toBe(true);
    expect(screen.queryByRole("button", { name: "Import events" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add chore" })).toBeNull();
    expect(screen.queryByLabelText("Calendar actions")).toBeNull();
  });

  it("renders Family no-household state as the shared first-home panel without collaboration metrics", async () => {
    mockEmptyAppDataFetches();
    renderAt("/family");

    expect(await screen.findByRole("heading", { name: "Family" })).toBeTruthy();
    const emptyHeading = await screen.findByRole("heading", { name: "Add or join a household" });
    const emptyPanel = emptyHeading.closest("section");
    expect(emptyPanel?.classList.contains("setup-empty-state")).toBe(true);
    expect(emptyPanel?.classList.contains("first-home-empty-state")).toBe(true);
    expect(screen.queryByText("Members")).toBeNull();
    expect(screen.queryByText("Pending invitations")).toBeNull();
    expect(screen.queryByLabelText("Household collaboration")).toBeNull();
  });

  it("completes a Today chore and saves post-completion details", async () => {
    await withMay2026CalendarClock(async () => {
    let occurrences: TaskOccurrence[] = [{
      id: "occurrence-clean",
      householdId: "household-1",
      taskId: "chore-1",
      scheduleId: "schedule-1",
      sequence: 0,
      planningMode: "flexible",
      estimatedMinutes: 30,
      eligibleStartOn: "2026-05-30",
      eligibleEndOn: "2026-05-30",
      assignedUserId: "app-user-1",
      exceptionType: "none",
      status: "planned"
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
        return { ok: true, json: async () => [{ householdId: "household-1", userId: "app-user-1", clerkUserId: "test-user-a", primaryEmail: "owner@example.com", displayName: "Alex Owner", role: "owner" }] };
      }
      if (url.startsWith("http://localhost:3001/api/households/household-1/occurrences?") && method === "GET") {
        return { ok: true, json: async () => occurrences };
      }
      if (url === "http://localhost:3001/api/households/household-1/occurrences/occurrence-clean/complete" && method === "POST") {
        occurrences = [{ ...occurrences[0], status: "completed", completedAt: "2026-05-30T14:20:00.000Z", completedByUserId: "app-user-1" }];
        return { ok: true, json: async () => occurrences[0] };
      }
      if (url === "http://localhost:3001/api/households/household-1/occurrences/occurrence-clean/check-in" && method === "PUT") {
        return {
          ok: true,
          json: async () => ({
            id: "check-in-1",
            householdId: "household-1",
            occurrenceId: "occurrence-clean",
            completedOnTime: false,
            durationAccurate: true,
            rebaseFutureOccurrences: false,
            createdAt: "2026-05-30T14:20:00.000Z",
            updatedAt: "2026-05-30T14:25:00.000Z"
          })
        };
      }

      throw new Error(`Unhandled fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/today");

    fireEvent.click(await screen.findByRole("button", { name: "Complete Clean bathrooms" }));
    await waitFor(() => expect(screen.getByText("Clean bathrooms marked done")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Add details" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Improve future suggestions for Clean bathrooms" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/occurrences/occurrence-clean/complete",
      expect.objectContaining({ method: "POST" })
    );

    fireEvent.click(screen.getByRole("button", { name: "Improve future suggestions for Clean bathrooms" }));
    fireEvent.click(screen.getByLabelText("It happened later than planned"));
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/occurrences/occurrence-clean/check-in",
      expect.objectContaining({ method: "PUT" })
    ));
    });
  });

  it("moves Google Calendar work from Today to Calendar actions", async () => {
    mockRestoredHouseholdFetches();
    renderAt("/today");

    await screen.findByRole("heading", { name: "Today" });
    await waitFor(() => expect(screen.getByText("Ready to optimize")).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Google Calendar" })).toBeNull();

    cleanup();
    const fetchMock = mockCalendarPageFetches();
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/calendar");

    expect(await screen.findByRole("heading", { name: "Calendar" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Google Calendar setup" })).toBeNull();
    await openCalendarActions();
    fireEvent.click(screen.getByRole("button", { name: "Import events" }));
    expect(await screen.findByRole("dialog", { name: "Import calendar events" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect Google Calendar" }));
    expect(await screen.findByText(/Google Calendar login needs/i)).toBeTruthy();
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
              chores: [cleanBathroomsTask],
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

    expect(screen.getByRole("heading", { name: "Put chores where the week actually has room." })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Build my home plan" }).getAttribute("data-force-redirect-url")).toBe("/today");
    expect(screen.queryByText(/calendar manager first/i)).toBeNull();
    expect(screen.getByText(/Clenella reads the shape of your week/i)).toBeTruthy();

    const nav = screen.getByRole("navigation", { name: "Landing" });
    expect(within(nav).getByRole("link", { name: "How it works" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Family load" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Why Clenella" })).toBeTruthy();
    expect(within(nav).queryByRole("link", { name: "Google Calendar" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Optimize" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Today" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Calendar" })).toBeNull();
    expect(screen.getByRole("button", { name: /sign in/i }).getAttribute("data-force-redirect-url")).toBe("/today");

    expect(screen.getByRole("region", { name: "Clenella calendar optimization preview" })).toBeTruthy();
    expect(screen.getByText("June chore plan")).toBeTruthy();
    expect(screen.getByText("Synced with Google Calendar")).toBeTruthy();
    expect(screen.getByText("Google Calendar added: practice, dentist, trash pickup, school event")).toBeTruthy();
    expect(screen.getAllByText("Bathroom reset").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Laundry fold")).toBeTruthy();
    expect(screen.getByText("Mop floors")).toBeTruthy();
    expect(screen.getByText("Property check")).toBeTruthy();
    expect(screen.getByText("Entry reset")).toBeTruthy();
    expect(screen.queryByText("Grouped with trip")).toBeNull();
    expect(screen.queryByText("Done early")).toBeNull();

    expect(screen.getByRole("heading", { name: "How Clenella works" })).toBeTruthy();
    expect(screen.getByText("Three steps, no spreadsheet")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Why Clenella" })).toBeTruthy();
    expect(screen.getByText('Less "whose turn?" energy')).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Set up the home" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Keep Clenella in the loop" })).toBeTruthy();
    expect(screen.getByText(/Mark chores complete, skipped, or still open/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Balanced for the household" })).toBeTruthy();
    expect(screen.getByText(/Google Calendar import and export/i)).toBeTruthy();

    expect(screen.queryByText("Home model")).toBeNull();
    expect(screen.queryByText("Choose chores")).toBeNull();
    expect(screen.queryByText("Recommendations")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Calendar commitments should shape chore planning." })).toBeNull();
    expect(screen.queryByRole("heading", { name: "For households" })).toBeNull();
    expect(screen.queryByText("duration conflict")).toBeNull();
    expect(screen.queryByText("calendar slot found")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an auth loading status while Clerk is finishing the sign-in handoff", () => {
    mockClerkLoading();
    vi.stubGlobal("fetch", vi.fn());

    renderAt("/today");

    expect(screen.getByRole("status").textContent).toBe("Loading Clenella...");
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
      expect(screen.getByRole("region", { name: "Home summary" })).toBeTruthy();
      expect(screen.getByRole("region", { name: "Cabin summary" })).toBeTruthy();
    });
    expect(screen.queryByText(/active household/i)).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url === "http://localhost:3001/api/me/active-household")).toBe(false);
  });

  it("renders multiple households as a Homes list with a list-level add action", async () => {
    const secondHousehold = {
      ...createHouseholdAppData({
        structure: {
          householdId: "household-2",
          floors: [
            {
              id: "floor-cabin-main",
              householdId: "household-2",
              name: "Main floor",
              levelType: "main",
              flooring: [],
              petImpact: "none",
              robotVacuumCoverage: "none",
              robotMopCoverage: "none",
              rooms: []
            }
          ]
        }
      }),
      id: "household-2",
      name: "Cabin"
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

      if (url === "http://localhost:3001/api/households" && method === "POST") {
        return { ok: true, json: async () => ({ id: "household-new", name: "New household" }) };
      }

      throw new Error(`Unhandled fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/households");

    expect(await screen.findByRole("heading", { name: "Homes", level: 1 })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add another home" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Home summary" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Cabin summary" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "My Home", level: 1 })).toBeNull();
    expect(screen.queryByText(/active household/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add another home" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3001/api/households",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "New household" })
        })
      );
    });
  });

  it("lets first-time users reach Households from the primary nav", async () => {
    mockEmptyAppDataFetches();
    renderAt("/today");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Add or join a household", level: 2 })).toBeTruthy());
    fireEvent.click(screen.getByRole("link", { name: "My Home" }));

    expect(screen.getByRole("heading", { name: "My Home", level: 1 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Add or join a household", level: 2 })).toBeTruthy();
  });

  it("renders the Households page", async () => {
    mockEmptyAppDataFetches();
    renderAt("/households");

    await waitFor(() => expect(screen.getByRole("heading", { name: "My Home", level: 1 })).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Add or join a household", level: 2 })).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add household" })).toBeTruthy();
    });
  });

  it("renders the one-home overview as a view state with editable profile details", async () => {
    mockHouseholdsPageFetches({
      householdId: "household-1",
      floors: [
        {
          id: "floor-main",
          householdId: "household-1",
          name: "Main floor",
          levelType: "main",
          flooring: ["tile"],
          petImpact: "medium",
          robotVacuumCoverage: "none",
          robotMopCoverage: "none",
          rooms: [{
            id: "room-kitchen",
            floorId: "floor-main",
            name: "Kitchen",
            flooring: ["tile"],
            petImpact: "inherit",
            robotVacuumCoverage: "inherit",
            robotMopCoverage: "inherit"
          }]
        },
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
        }
      ]
    });
    renderAt("/households");

    expect(await screen.findByRole("heading", { name: "My Home", level: 1 })).toBeTruthy();
    expect(screen.getByRole("tabpanel", { name: "Overview" }).classList.contains("household-editor")).toBe(true);
    expect(within(screen.getByRole("tabpanel", { name: "Overview" })).getByLabelText("View Main floor details, 1 room")).toBeTruthy();
    expect(within(screen.getByRole("tabpanel", { name: "Overview" })).queryByLabelText("Select Main floor, 1 room")).toBeNull();
    expect(screen.getByRole("region", { name: "Home profile summary" })).toBeTruthy();
    expect(screen.queryByLabelText("Household name")).toBeNull();

    await editHomeDetails();
    expect(screen.getByLabelText("Household name")).toBeTruthy();
    expect(screen.getByLabelText("Home type")).toBeTruthy();
    expect(screen.queryByText("Property dashboard")).toBeNull();
  });

  it("renders one household as a My Home workspace without aggregate dashboard framing", async () => {
    mockHouseholdsPageFetches({
      householdId: "household-1",
      floors: [
        {
          id: "floor-main",
          householdId: "household-1",
          name: "Main floor",
          levelType: "main",
          flooring: ["tile"],
          petImpact: "medium",
          robotVacuumCoverage: "none",
          robotMopCoverage: "none",
          rooms: [
            {
              id: "room-kitchen",
              floorId: "floor-main",
              name: "Kitchen",
              flooring: ["tile"],
              petImpact: "inherit",
              robotVacuumCoverage: "inherit",
              robotMopCoverage: "inherit"
            }
          ]
        }
      ]
    });

    renderAt("/households");

    expect(await screen.findByRole("heading", { name: "My Home", level: 1 })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Floors" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Rooms" })).toBeNull();
    expect(within(screen.getByRole("tabpanel", { name: "Overview" })).getByLabelText("View Main floor details, 1 room").hasAttribute("aria-pressed")).toBe(false);
    expect(screen.getAllByText("Main floor").length).toBeGreaterThan(0);
    expect(screen.getByText("1 floor / 1 rooms")).toBeTruthy();

    expect(screen.queryByRole("heading", { name: "Households", level: 1 })).toBeNull();
    expect(screen.queryByText("Property dashboard")).toBeNull();
    expect(screen.queryByText("Household overview")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add household" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Manage" })).toBeNull();
  });

  it("lets a user delete a household from the My Home workspace", async () => {
    const fetchMock = mockHouseholdsPageFetches(
      {
        householdId: "household-1",
        floors: [
          {
            id: "floor-main",
            householdId: "household-1",
            name: "Main floor",
            levelType: "main",
            flooring: ["tile"],
            petImpact: "medium",
            robotVacuumCoverage: "none",
            robotMopCoverage: "none",
            rooms: []
          }
        ]
      },
      { allowDeleteHousehold: true }
    );

    renderAt("/households");

    expect(await screen.findByRole("heading", { name: "My Home", level: 1 })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete home" }));
    expect(screen.getByText("Delete Home?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete home" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1",
      expect.objectContaining({ method: "DELETE" })
    ));
    expect(await screen.findByRole("heading", { name: "Add or join a household", level: 2 })).toBeTruthy();
  });

  it("renders the single-home workspace as a home setup studio", async () => {
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
          rooms: [
            {
              id: "room-living",
              floorId: "floor-main",
              name: "Living room",
              flooring: ["hardwood"],
              petImpact: "inherit",
              robotVacuumCoverage: "inherit",
              robotMopCoverage: "inherit"
            }
          ]
        }
      ]
    });

    renderAt("/households");

    expect(await screen.findByRole("heading", { name: "My Home", level: 1 })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Home setup studio" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Home model" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "View Main floor details, 1 room" })).toBeTruthy();
    expect(screen.getByText("Setup path")).toBeTruthy();
    expect(screen.getByText("Build the house in three passes")).toBeTruthy();
    const floorSummary = screen.getByRole("region", { name: "Floor setup summary" });
    expect(within(floorSummary).getByText("Main floor")).toBeTruthy();
    expect(within(floorSummary).getByText("1 room")).toBeTruthy();
    expect(within(floorSummary).getByText("hardwood")).toBeTruthy();
  });

  it("opens the Floors view from the Overview studio model", async () => {
    mockHouseholdsPageFetches({
      householdId: "household-1",
      floors: [
        {
          id: "floor-main",
          householdId: "household-1",
          name: "Main floor",
          levelType: "main",
          flooring: ["tile"],
          petImpact: "medium",
          robotVacuumCoverage: "none",
          robotMopCoverage: "none",
          rooms: []
        },
        {
          id: "floor-upstairs",
          householdId: "household-1",
          name: "Floor 2",
          levelType: "upstairs",
          flooring: ["carpet"],
          petImpact: "low",
          robotVacuumCoverage: "none",
          robotMopCoverage: "none",
          rooms: []
        }
      ]
    });

    renderAt("/households");

    fireEvent.click(await screen.findByRole("button", { name: "View Floor 2 details, 0 rooms" }));

    expect(screen.getByRole("tab", { name: "Floors" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Select Floor 2, 0 rooms" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "Floor 2" })).toBeTruthy();
  });

  it("renders room annotations with quiet add and edit actions", async () => {
    mockHouseholdsPageFetches({
      householdId: "household-1",
      floors: [
        {
          id: "floor-main",
          householdId: "household-1",
          name: "Main floor",
          levelType: "main",
          flooring: ["tile"],
          petImpact: "medium",
          robotVacuumCoverage: "none",
          robotMopCoverage: "none",
          rooms: [
            {
              id: "room-kitchen",
              floorId: "floor-main",
              name: "Kitchen",
              flooring: ["tile"],
              petImpact: "high",
              robotVacuumCoverage: "inherit",
              robotMopCoverage: "inherit"
            }
          ]
        }
      ]
    });

    renderAt("/households");
    fireEvent.click(await screen.findByRole("tab", { name: "Floors" }));

    const addRoom = screen.getByRole("button", { name: "Add room to Main floor" });
    expect(addRoom.classList.contains("quiet-link")).toBe(true);

    const room = screen.getByRole("article", { name: "Kitchen room annotation" });
    expect(room.classList.contains("room-annotation")).toBe(true);
    expect(room.classList.contains("room-card")).toBe(false);
    expect(within(room).getByRole("button", { name: "Edit Kitchen" }).classList.contains("quiet-link")).toBe(true);
    expect(within(room).queryByRole("button", { name: "Remove Kitchen" })).toBeNull();
  });

  it("shows selected floor rooms inside the Floors view without a separate Rooms tab", async () => {
    mockHouseholdsPageFetches({
      householdId: "household-1",
      floors: [
        {
          id: "floor-main",
          householdId: "household-1",
          name: "Main floor",
          levelType: "main",
          flooring: ["tile"],
          petImpact: "medium",
          robotVacuumCoverage: "none",
          robotMopCoverage: "none",
          rooms: [
            {
              id: "room-kitchen",
              floorId: "floor-main",
              name: "Kitchen",
              flooring: ["tile"],
              petImpact: "high",
              robotVacuumCoverage: "inherit",
              robotMopCoverage: "inherit"
            }
          ]
        }
      ]
    });

    renderAt("/households");
    fireEvent.click(await screen.findByRole("tab", { name: "Floors" }));

    const floorRooms = screen.getByRole("region", { name: "Rooms on Main floor" });
    expect(within(floorRooms).getByText("Kitchen")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Rooms" })).toBeNull();
    expect(within(floorRooms).getByRole("button", { name: "Add room to Main floor" }).classList.contains("quiet-link")).toBe(true);
  });

  it("uses Overview house floors as navigation into the Floors view", async () => {
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

    expect(await screen.findByLabelText("View Main floor details, 0 rooms")).toBeTruthy();
    expect(screen.queryByText("Selected floor")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "View Main floor details, 0 rooms" }));

    expect(screen.getByRole("tab", { name: "Floors" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("region", { name: "Home profile summary" })).toBeNull();
    expect(screen.getByLabelText("Select Main floor, 0 rooms").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Edit floor" })).toBeTruthy();
  });

  it("keeps view content scoped to the selected My Home tab", async () => {
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

    expect(await screen.findByLabelText("View Main floor details, 0 rooms")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Home profile summary" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Floors" }));
    expect(screen.queryByRole("region", { name: "Home profile summary" })).toBeNull();
    expect(screen.queryByText("Selected floor")).toBeNull();
    expect(screen.getByLabelText("Select Main floor, 0 rooms")).toBeTruthy();
    const overviewPanel = document.getElementById("household-1-overview-panel") as HTMLElement;
    expect(overviewPanel.hidden).toBe(true);
    expect(window.getComputedStyle(overviewPanel).display).toBe("none");
    expect(document.getElementById("household-1-rooms-panel")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Rooms" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add room to Main floor" })).toBeTruthy();
    const floorsPanel = document.getElementById("household-1-floors-panel") as HTMLElement;
    expect(floorsPanel.hidden).toBe(false);
    expect(window.getComputedStyle(floorsPanel).display).not.toBe("none");
  });

  it("keeps add another home as a low-emphasis header action for one household", async () => {
    const fetchMock = mockHouseholdsPageFetches(
      { householdId: "household-1", floors: [] },
      { allowAddHousehold: true }
    );

    renderAt("/households");

    expect(await screen.findByRole("heading", { name: "My Home", level: 1 })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add household" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More home actions" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add another home" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3001/api/households",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "New household" })
        })
      );
    });
  });

  it("loads household family management and lets an owner administer members and invitations", async () => {
    const fetchMock = mockFamilyPageFetches();
    renderAt("/family");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Family" })).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText("Alex Owner").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Morgan Member").length).toBeGreaterThan(0);
    expect(screen.getByText("pending@example.com")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Invite by email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(screen.getByText("new@example.com")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Promote Morgan Member to owner" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Make Morgan Member a member" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Cancel invitation for pending@example.com" }));
    await waitFor(() => expect(screen.getByText("Cancelled")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Remove Morgan Member" }));
    await waitFor(() => expect(screen.queryAllByText("Morgan Member")).toHaveLength(0));

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/invitations",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("renders Family as a collaboration hub", async () => {
    const fetchMock = mockFamilyPageFetches();
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/family");

    expect(await screen.findByRole("heading", { name: "Family" })).toBeTruthy();
    const collaboration = screen.getByRole("region", { name: "Household collaboration" });
    expect(collaboration).toBeTruthy();
    await waitFor(() => expect(within(collaboration).getAllByText("Alex Owner").length).toBeGreaterThan(0));
    expect(within(collaboration).getByRole("region", { name: "Home weekly responsibility board" })).toBeTruthy();
    await waitFor(() => expect(within(collaboration).getAllByText("Clean bathrooms").length).toBeGreaterThan(0));
    await waitFor(() => {
      expect(within(collaboration).getByText("People with household access").parentElement?.textContent).toContain("2");
      expect(within(collaboration).getByText("Owner-managed invite queue").parentElement?.textContent).toContain("1");
      expect(within(collaboration).getByText("Scheduled chores on the family board").parentElement?.textContent).toContain("2");
    });
  });

  it("shows family members without owner-only actions to an ordinary member", async () => {
    mockFamilyPageFetches("member");
    renderAt("/family");

    await waitFor(() => expect(screen.getAllByText("Alex Owner").length).toBeGreaterThan(0));
    expect(screen.queryByLabelText("Invite by email")).toBeNull();
    expect(screen.queryByRole("button", { name: /promote/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /cancel invitation/i })).toBeNull();
  });

  it("loads Calendar occurrences and provides equivalent planner edit actions", async () => {
    await withMay2026CalendarClock(async () => {
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
  });

  it("shows assignee initials on calendar chore cards with accessible helper text", async () => {
    await withMay2026CalendarClock(async () => {
      mockCalendarPageFetches();
      renderAt("/calendar");

      await waitFor(() => expect(screen.getByRole("heading", { name: "Calendar" })).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: "Week" }));

      const assignedTokens = await screen.findAllByRole("img", { name: "Assigned to Morgan Member" });
      expect(assignedTokens.length).toBeGreaterThan(0);
      expect(assignedTokens[0].textContent).toContain("MM");
      expect(screen.queryByRole("img", { name: "Imported by Alex Owner" })).toBeNull();
    });
  });

  it("shows assignee and source details in the chore detail modal", async () => {
    await withMay2026CalendarClock(async () => {
      mockCalendarPageFetches();
      renderAt("/calendar");

      fireEvent.click(await screen.findByRole("button", { name: "View Clean bathrooms" }));

      const dialog = await screen.findByRole("dialog", { name: "Scheduled task details" });
      expect(within(dialog).getByText("Assigned to")).toBeTruthy();
      expect(within(dialog).getByText("Morgan Member")).toBeTruthy();
      expect(within(dialog).getByText("Source")).toBeTruthy();
      expect(within(dialog).getByText("Manual chore")).toBeTruthy();
    });
  });

  it("stages owner calendar import queue decisions before submitting them", async () => {
    const fetchMock = mockCalendarPageFetches([{
      id: "queue-1",
      householdId: "household-1",
      submittedByUserId: "app-user-2",
      submittedByName: "Morgan Member",
      proposedType: "commitment",
      detailLevel: "busy_only",
      title: "Dentist appointment",
      privacyTitle: "Dentist appointment",
      startsAt: "2026-06-18T14:00:00.000Z",
      endsAt: "2026-06-18T15:00:00.000Z",
      queueStatus: "pending",
      taskLinkStatus: "unreviewed",
      importScope: "single",
      createdAt: "2026-06-01T12:00:00.000Z"
    }]);
    renderAt("/calendar");

    expect(await screen.findByText("Calendar imports need review")).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".calendar-queue-badge")?.textContent).toBe("1"));
    fireEvent.click(screen.getByRole("button", { name: "Review imports" }));

    expect(await screen.findByRole("dialog", { name: "Review calendar imports" })).toBeTruthy();
    expect(screen.getAllByText("Dentist appointment").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Busy only").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Approval options for Dentist appointment" }));
    expect(screen.getByRole("menuitem", { name: "Approve as chore" })).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("heading", { name: "Review calendar imports" }));
    expect(screen.queryByRole("menuitem", { name: "Approve as chore" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Approval options for Dentist appointment" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Approve as chore" }));
    expect(screen.getByText("Approved as chore")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/calendar/import-queue/queue-1",
      expect.anything()
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit 1 decision" }));
    await waitFor(() => expect(screen.getByText("1 import decision submitted.")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/calendar/import-queue/queue-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ decision: "approve", proposedType: "chore" })
      })
    );
  });

  it("hides the calendar import review panel when no imports need review", async () => {
    const fetchMock = mockCalendarPageFetches([]);
    renderAt("/calendar");

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      url === "http://localhost:3001/api/households/household-1/calendar/import-queue"
    )).toBe(true));
    expect(screen.queryByRole("region", { name: "Calendar import queue" })).toBeNull();
    expect(screen.queryByText("Calendar imports need review")).toBeNull();
  });

  it("shows unread notification tasks in the bell and marks visible notifications read when opened", async () => {
    const fetchMock = mockCalendarPageFetches([], [{
      id: "notification-1",
      recipientUserId: "app-user-1",
      type: "calendar_import_queue_review",
      householdId: "household-1",
      householdName: "Home",
      title: "Calendar imports need review",
      body: "2 events are waiting in Home.",
      targetPath: "/calendar?reviewImports=1",
      metadata: { pendingCount: 2 },
      readAt: null,
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:00:00.000Z"
    }]);
    renderAt("/calendar");

    await waitFor(() => expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));

    const popover = await screen.findByRole("dialog", { name: "Notifications" });
    expect(popover).toBeTruthy();
    expect(within(popover).getByText("Calendar imports need review")).toBeTruthy();
    expect(within(popover).getByText("Home")).toBeTruthy();
    expect(within(popover).getByText("2 pending")).toBeTruthy();
    expect(within(popover).getByText("Review imports")).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/me/notifications/read",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ notificationIds: ["notification-1"] })
      })
    ));
    await waitFor(() => expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy());
  });

  it("renders an empty notification popover", async () => {
    mockCalendarPageFetches();
    renderAt("/calendar");

    await waitFor(() => expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));

    expect(await screen.findByRole("dialog", { name: "Notifications" })).toBeTruthy();
    expect(screen.getByText("No new notifications.")).toBeTruthy();
  });

  it("opens Calendar owner review from an import notification while keeping the queue badge visible", async () => {
    const fetchMock = mockCalendarPageFetches([{
      id: "queue-1",
      householdId: "household-1",
      submittedByUserId: "app-user-2",
      submittedByName: "Morgan Member",
      proposedType: "commitment",
      detailLevel: "busy_only",
      title: "Dentist appointment",
      privacyTitle: "Dentist appointment",
      startsAt: "2026-06-18T14:00:00.000Z",
      endsAt: "2026-06-18T15:00:00.000Z",
      queueStatus: "pending",
      taskLinkStatus: "unreviewed",
      importScope: "single",
      createdAt: "2026-06-01T12:00:00.000Z"
    }], [{
      id: "notification-1",
      recipientUserId: "app-user-1",
      type: "calendar_import_queue_review",
      householdId: "household-1",
      householdName: "Home",
      title: "Calendar imports need review",
      body: "1 event is waiting in Home.",
      targetPath: "/calendar?reviewImports=1",
      metadata: { pendingCount: 1 },
      readAt: null,
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:00:00.000Z"
    }]);
    renderAt("/today");

    await waitFor(() => expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.click(await screen.findByRole("button", { name: "Review imports for Home, 1 pending" }));

    expect(await screen.findByRole("heading", { name: "Calendar" })).toBeTruthy();
    expect(await screen.findByRole("dialog", { name: "Review calendar imports" })).toBeTruthy();
    expect(document.querySelector(".calendar-queue-badge")?.textContent).toBe("1");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/me/notifications/read",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("keeps scheduling actions on Calendar while Tasks is a separate destination", async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    expect(await screen.findByRole("heading", { name: "Calendar" })).toBeTruthy();
    expect(screen.queryByLabelText("Calendar status summary")).toBeNull();
    const pageHeader = document.querySelector(".page-command-header");
    expect(pageHeader).not.toBeNull();
    expect(within(pageHeader as HTMLElement).queryByText("Home")).toBeNull();
    expect(within(pageHeader as HTMLElement).queryByText(/open$/)).toBeNull();
    expect(within(pageHeader as HTMLElement).queryByText(/completed$/)).toBeNull();
    expect(screen.getByRole("link", { name: "Tasks" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Schedule task" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add chore" })).toBeNull();
    expect(screen.getByRole("button", { name: "Calendar actions" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Import events" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export events" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Calendar actions" }));
    expect(screen.getByRole("button", { name: "Import events" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export events" })).toBeTruthy();
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
    const legend = within(workspace).getByRole("region", { name: "Calendar item types" });
    expect(within(legend).getByText("Tasks")).toBeTruthy();
    expect(within(legend).getByText("Commitments")).toBeTruthy();
    expect(within(workspace).queryByRole("button", { name: /View Practice/i })).toBeNull();
  });

  it("uses Schedule task as the primary Calendar creation action", async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    expect(await screen.findByRole("heading", { name: "Calendar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Schedule task" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add chore" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add event" })).toBeNull();
  });

  it("defaults new manually scheduled tasks to save to the Task library", async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Schedule task" }));

    expect((screen.getByRole("checkbox", { name: "Save to Task library" }) as HTMLInputElement).checked).toBe(true);
  });

  it("uses one compact calendar actions trigger on mobile", async () => {
    setViewportWidth(390);
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    expect(await screen.findByRole("heading", { name: "Calendar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Calendar actions" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Schedule task" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Import events" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export events" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Calendar actions" }));

    expect(screen.getByRole("button", { name: "Schedule task" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import events" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export events" })).toBeTruthy();
  });

  it("puts the mobile Calendar/List selector directly after the heading before actions", async () => {
    setViewportWidth(390);
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    const heading = await screen.findByRole("heading", { name: "Calendar" });
    const header = heading.closest(".page-command-header");
    expect(header).not.toBeNull();
    const headerChildren = Array.from((header as HTMLElement).children);
    expect(headerChildren[0]?.contains(heading)).toBe(true);
    expect(headerChildren[1]?.classList.contains("calendar-workspace-tabs")).toBe(true);
    expect(headerChildren[2]?.classList.contains("calendar-header-actions")).toBe(true);
    expect(within(header as HTMLElement).getByRole("tab", { name: "Calendar" })).toBeTruthy();
    expect(within(header as HTMLElement).getByRole("tab", { name: "List" })).toBeTruthy();
  });

  it("anchors the mobile calendar actions popover inside the viewport", async () => {
    setViewportWidth(246);
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    await screen.findByRole("heading", { name: "Calendar" });
    fireEvent.click(screen.getByRole("button", { name: "Calendar actions" }));

    const popover = screen.getByRole("region", { name: "Calendar actions menu" });
    expect(popover.classList.contains("calendar-actions-popover")).toBe(true);
    expect(popover.classList.contains("is-mobile-positioned")).toBe(true);
    expect(popover.classList.contains("is-edge-aligned")).toBe(true);
  });

  it("uses a cohesive centered modal shell for add and import event modals on mobile", async () => {
    setViewportWidth(390);
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    await screen.findByRole("heading", { name: "Calendar" });
    fireEvent.click(screen.getByRole("button", { name: "Calendar actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Schedule task" }));

    const addModal = await screen.findByRole("dialog", { name: "Schedule task" });
    expect(addModal.classList.contains("calendar-modal-shell")).toBe(true);
    expect(document.querySelector(".chore-editor-backdrop")?.classList.contains("calendar-modal-backdrop")).toBe(true);
    fireEvent.click(within(addModal).getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Calendar actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Import events" }));

    const importModal = await screen.findByRole("dialog", { name: "Import calendar events" });
    expect(importModal.classList.contains("calendar-modal-shell")).toBe(true);
    expect(importModal.classList.contains("calendar-sync-modal")).toBe(true);
  });

  it("renders the Tasks route", async () => {
    mockEmptyAppDataFetches();
    renderAt("/tasks");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Tasks" })).toBeTruthy());
    expect(screen.getByRole("tab", { name: "Task library" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Task inbox" })).toBeTruthy();
  });

  it("switches between calendar and chronological list occurrences", async () => {
    await withMay2026CalendarClock(async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("tab", { name: "List" }));
    const agenda = await screen.findByRole("region", { name: "Task agenda" });
    expect(within(agenda).getByRole("heading", { name: "Upcoming and completed work" })).toBeTruthy();
    const plannedCard = within(agenda).getByRole("button", { name: "View Clean bathrooms" });
    expect(plannedCard.classList.contains("calendar-chore-row")).toBe(true);
    expect(plannedCard.classList.contains("calendar-work-item")).toBe(true);
    expect(plannedCard.classList.contains("is-chore")).toBe(true);
    expect(plannedCard.classList.contains("calendar-agenda-row")).toBe(true);
    expect(plannedCard.classList.contains("calendar-agenda-card")).toBe(false);
    const plannedTimeSummary = plannedCard.querySelector(".calendar-time-summary");
    expect(plannedTimeSummary).not.toBeNull();
    expect(plannedTimeSummary?.children).toHaveLength(2);
    expect(within(plannedTimeSummary as HTMLElement).getByText("Anytime")).toBeTruthy();
    expect(within(plannedTimeSummary as HTMLElement).getByText("60 min")).toBeTruthy();
    expect(within(plannedCard).queryByText("Anytime / 60 min")).toBeNull();
    expect(within(agenda).getByRole("button", { name: "View Pet cats" })).toBeTruthy();
    expect(screen.queryByText("Flexible")).toBeNull();
    });
  });

  it("shows imported calendar events in the chronological list", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({
        cleanlyCalendarEvents: [{
          id: "cleanly-event-list",
          householdId: "household-1",
          createdByUserId: "app-user-1",
          type: "commitment",
          title: "Busy",
          privacyTitle: "Busy",
          detailLevel: "busy_only",
          startsAt: "2026-05-30T12:00:00.000Z",
          endsAt: "2026-05-30T12:30:00.000Z",
          timezone: "America/New_York",
          source: "google",
          status: "active"
        }],
        occurrences: []
      }));
      renderAt("/calendar");

      fireEvent.click(await screen.findByRole("tab", { name: "List" }));
      const agenda = await screen.findByRole("region", { name: "Task agenda" });
      expect(within(agenda).getByRole("button", { name: "View Busy" })).toBeTruthy();
      expect(within(agenda).queryByText("No events match these filters.")).toBeNull();
    });
  });

  it("shows an empty state when the chronological list has no items", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({ occurrences: [] }));
      renderAt("/calendar");

      fireEvent.click(await screen.findByRole("tab", { name: "List" }));
      const agenda = await screen.findByRole("region", { name: "Task agenda" });
      expect(within(agenda).getByText("No events match these filters.")).toBeTruthy();
    });
  });

  it("renders month as dated calendar cells with lightweight truncated chore rows", async () => {
    await withMay2026CalendarClock(async () => {
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
      renderAt("/calendar");

      expect(await screen.findByRole("grid", { name: "May 2026 month calendar" })).toBeTruthy();
      expect(screen.getByText("Sun")).toBeTruthy();
      const friday = screen.getByRole("gridcell", { name: "Friday, May 29" });
      const monthTask = within(friday).getByRole("button", { name: "View Clean bathrooms" });
      expect(monthTask.classList.contains("calendar-chore-row")).toBe(true);
      expect(monthTask.classList.contains("calendar-work-item")).toBe(true);
      expect(monthTask.classList.contains("is-chore")).toBe(true);
      expect(monthTask.classList.contains("calendar-month-chore-row")).toBe(false);
      expect(monthTask.classList.contains("calendar-event")).toBe(false);
      expect(monthTask.getAttribute("title")).toBe("Clean bathrooms");
      expect(monthTask.querySelector(".calendar-chore-title")).not.toBeNull();
      const monthAssigneeToken = within(monthTask).getByRole("img", { name: "Assigned to Alex Owner" });
      expect(monthAssigneeToken.closest(".calendar-chore-assignee")).not.toBeNull();
      expect(monthTask.lastElementChild).toBe(monthAssigneeToken.closest(".calendar-chore-assignee"));
      expect(within(friday).queryByText("Anytime / 60 min")).toBeNull();
      expect(within(friday).queryByText("Alex Owner")).toBeNull();
      expect(screen.queryByText("Assigned member")).toBeNull();
    });
  });

  it("shows household identity on calendar event rows and detail modals", async () => {
    await withMay2026CalendarClock(async () => {
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({
        calendarConnected: true,
        cleanlyCalendarEvents: [{
          id: "cleanly-event-1",
          householdId: "household-1",
          createdByUserId: "app-user-1",
          type: "commitment",
          title: "Soccer practice",
          privacyTitle: "Soccer practice",
          detailLevel: "full_details",
          startsAt: "2026-05-29T21:00:00.000Z",
          endsAt: "2026-05-29T22:00:00.000Z",
          timezone: "America/New_York",
          source: "google",
          status: "active"
        }]
      }));
      renderAt("/calendar");

      const friday = await screen.findByRole("gridcell", { name: "Friday, May 29" });
      const choreCard = within(friday).getByRole("button", { name: "View Clean bathrooms" });
      expect(within(choreCard).getByText("Home")).toBeTruthy();
      const calendarCard = within(friday).getByRole("button", { name: "View Soccer practice" });
      expect(within(calendarCard).getByText("Home")).toBeTruthy();

      fireEvent.click(choreCard);
      const choreDialog = await screen.findByRole("dialog", { name: "Scheduled task details" });
      expect(within(choreDialog).getByText("Household")).toBeTruthy();
      expect(within(choreDialog).getByText("Home")).toBeTruthy();
      fireEvent.click(within(choreDialog).getByRole("button", { name: "Close" }));

      fireEvent.click(calendarCard);
      const eventDialog = await screen.findByRole("dialog", { name: "Calendar event details" });
      expect(within(eventDialog).getByText("Household")).toBeTruthy();
      expect(within(eventDialog).getByText("Home")).toBeTruthy();
    });
  });

  it("renders mobile Month as date buttons with a selected-day agenda", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
      const scrollIntoView = stubScrollIntoView();
      renderAt("/calendar");

      const mobileMonth = await screen.findByRole("grid", { name: "May 2026 mobile month calendar" });
      expect(within(mobileMonth).getByRole("button", { name: /Select Friday, May 29, 1 item/ })).toBeTruthy();
      expect(within(mobileMonth).queryByRole("button", { name: "View Clean bathrooms" })).toBeNull();
      expect(scrollIntoView).not.toHaveBeenCalled();

      const agenda = screen.getByRole("region", { name: "Selected day agenda" });
      expect(within(agenda).getByRole("heading", { name: "Saturday, May 30" })).toBeTruthy();
      const mobileAgendaTask = within(agenda).getByRole("button", { name: "View Clean bathrooms" });
      expect(mobileAgendaTask).toBeTruthy();
      const mobileAssigneeToken = within(mobileAgendaTask).getByRole("img", { name: "Assigned to Alex Owner" });
      expect(mobileAssigneeToken.closest(".calendar-chore-assignee")).not.toBeNull();
      expect(mobileAgendaTask.lastElementChild).toBe(mobileAssigneeToken.closest(".calendar-chore-assignee"));
      expect(within(agenda).getByRole("button", { name: "View Pet cats" })).toBeTruthy();

      fireEvent.click(within(mobileMonth).getByRole("button", { name: /Select Friday, May 29, 1 item/ }));
      expect(within(agenda).getByRole("heading", { name: "Friday, May 29" })).toBeTruthy();
      expect(within(agenda).getByRole("button", { name: "View Clean bathrooms" })).toBeTruthy();
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" }));
    });
  });

  it("renders mobile Week as a week strip with selected-day agenda", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
      renderAt("/calendar");

      fireEvent.click(await screen.findByRole("button", { name: "Week" }));

      expect(await screen.findByRole("group", { name: "Week days" })).toBeTruthy();
      expect(screen.getByRole("region", { name: "Selected week day agenda" })).toBeTruthy();
      expect(screen.queryByRole("grid", { name: /Week of/i })).toBeNull();
    });
  });

  it("uses capped dot markers instead of visible counts in the mobile Week strip", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({
        cleanlyCalendarEvents: [{
          id: "cleanly-event-1",
          householdId: "household-1",
          createdByUserId: "app-user-1",
          type: "commitment",
          title: "Morning appointment",
          privacyTitle: "Morning appointment",
          detailLevel: "full_details",
          startsAt: "2026-05-29T13:00:00.000Z",
          endsAt: "2026-05-29T13:30:00.000Z",
          timezone: "America/New_York",
          source: "google",
          status: "active"
        }, {
          id: "cleanly-event-2",
          householdId: "household-1",
          createdByUserId: "app-user-1",
          type: "commitment",
          title: "Afternoon appointment",
          privacyTitle: "Afternoon appointment",
          detailLevel: "full_details",
          startsAt: "2026-05-29T18:00:00.000Z",
          endsAt: "2026-05-29T18:30:00.000Z",
          timezone: "America/New_York",
          source: "google",
          status: "active"
        }]
      }));
      renderAt("/calendar");

      fireEvent.click(await screen.findByRole("button", { name: "Week" }));
      const weekDays = await screen.findByRole("group", { name: "Week days" });
      const friday = within(weekDays).getByRole("button", { name: /Select Friday, May 29, 3 items/ });

      expect(friday.querySelectorAll(".calendar-mobile-week-dot")).toHaveLength(3);
      expect(friday.querySelector(".calendar-mobile-week-count")).toBeNull();
      expect(friday.querySelector("em")).toBeNull();
    });
  });

  it("updates the mobile Week selected-day agenda when a day is selected", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
      renderAt("/calendar");

      fireEvent.click(await screen.findByRole("button", { name: "Week" }));
      const weekDays = await screen.findByRole("group", { name: "Week days" });
      fireEvent.click(within(weekDays).getByRole("button", { name: /Select Friday, May 29/ }));

      const agenda = screen.getByRole("region", { name: "Selected week day agenda" });
      expect(within(agenda).getByRole("heading", { name: "Friday, May 29" })).toBeTruthy();
      expect(within(agenda).getByRole("button", { name: "View Clean bathrooms" })).toBeTruthy();
    });
  });

  it("orders mobile Week timed chores and imported calendar events chronologically", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({
        cleanlyCalendarEvents: [{
          id: "cleanly-event-1",
          householdId: "household-1",
          createdByUserId: "app-user-1",
          type: "commitment",
          title: "Morning appointment",
          privacyTitle: "Morning appointment",
          detailLevel: "full_details",
          startsAt: "2026-05-29T13:00:00.000Z",
          endsAt: "2026-05-29T13:30:00.000Z",
          timezone: "America/New_York",
          source: "google",
          status: "active"
        }],
        occurrences: [{
          id: "occurrence-timed",
          householdId: "household-1",
          taskId: "chore-1",
          scheduleId: "schedule-1",
          sequence: 0,
          planningMode: "timed",
          plannedStartAt: "2026-05-29T21:00:00.000Z",
          plannedEndAt: "2026-05-29T21:30:00.000Z",
          estimatedMinutes: 30,
          eligibleStartOn: "2026-05-29",
          eligibleEndOn: "2026-05-29",
          assignedUserId: "app-user-1",
          exceptionType: "none",
          status: "planned"
        }]
      }));
      renderAt("/calendar");

      fireEvent.click(await screen.findByRole("button", { name: "Week" }));
      const weekDays = await screen.findByRole("group", { name: "Week days" });
      fireEvent.click(within(weekDays).getByRole("button", { name: /Select Friday, May 29/ }));

      const agenda = screen.getByRole("region", { name: "Selected week day agenda" });
      const morningEvent = within(agenda).getByRole("button", { name: "View Morning appointment" });
      const eveningTask = within(agenda).getByRole("button", { name: "View Clean bathrooms" });
      expect(morningEvent.compareDocumentPosition(eveningTask) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it("shows timed chore duration only once in the mobile Week agenda", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({
        occurrences: [{
          id: "occurrence-timed",
          householdId: "household-1",
          taskId: "chore-1",
          scheduleId: "schedule-1",
          sequence: 0,
          planningMode: "timed",
          plannedStartAt: "2026-05-30T00:00:00.000Z",
          plannedEndAt: "2026-05-30T01:00:00.000Z",
          estimatedMinutes: 60,
          eligibleStartOn: "2026-05-29",
          eligibleEndOn: "2026-05-29",
          assignedUserId: "app-user-1",
          exceptionType: "none",
          status: "planned"
        }]
      }));
      renderAt("/calendar");

      fireEvent.click(await screen.findByRole("button", { name: "Week" }));
      const weekDays = await screen.findByRole("group", { name: "Week days" });
      fireEvent.click(within(weekDays).getByRole("button", { name: /Select Friday, May 29/ }));

      const agenda = screen.getByRole("region", { name: "Selected week day agenda" });
      const choreCard = within(agenda).getByRole("button", { name: "View Clean bathrooms" });
      const timeSummary = choreCard.querySelector(".calendar-time-summary");
      expect(timeSummary).not.toBeNull();
      expect(timeSummary?.children).toHaveLength(2);
      expect(within(timeSummary as HTMLElement).getByText("8:00 PM")).toBeTruthy();
      expect(within(timeSummary as HTMLElement).getByText("60 min")).toBeTruthy();
      expect(within(choreCard).getAllByText("60 min")).toHaveLength(1);
      expect(within(choreCard).queryByText("8:00 PM / 60 min")).toBeNull();
    });
  });

  it("shows all-day imported events as anytime without a 1440 minute duration", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({
        cleanlyCalendarEvents: [{
          id: "cleanly-event-all-day",
          householdId: "household-1",
          createdByUserId: "app-user-1",
          type: "commitment",
          title: "Busy",
          privacyTitle: "Busy",
          detailLevel: "busy_only",
          startsAt: "2026-05-30T00:00:00.000Z",
          endsAt: "2026-05-31T00:00:00.000Z",
          timezone: "America/New_York",
          source: "google",
          status: "active"
        }],
        occurrences: []
      }));
      renderAt("/calendar");

      fireEvent.click(await screen.findByRole("button", { name: "Week" }));
      const weekDays = await screen.findByRole("group", { name: "Week days" });
      fireEvent.click(within(weekDays).getByRole("button", { name: /Select Friday, May 29/ }));

      const agenda = screen.getByRole("region", { name: "Selected week day agenda" });
      const eventCard = within(agenda).getByRole("button", { name: "View Busy" });
      expect(within(eventCard).getByText("Anytime")).toBeTruthy();
      expect(within(eventCard).queryByText("1440 min")).toBeNull();
    });
  });

  it("shows mobile Week empty state and opens detail modals from agenda rows", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
      renderAt("/calendar");

      fireEvent.click(await screen.findByRole("button", { name: "Week" }));
      const weekDays = await screen.findByRole("group", { name: "Week days" });

      fireEvent.click(within(weekDays).getByRole("button", { name: /Select Sunday, May 24/ }));
      expect(screen.getByText("No events scheduled for this day.")).toBeTruthy();

      fireEvent.click(within(weekDays).getByRole("button", { name: /Select Friday, May 29/ }));
      const agenda = screen.getByRole("region", { name: "Selected week day agenda" });
      fireEvent.click(within(agenda).getByRole("button", { name: "View Clean bathrooms" }));

      expect(await screen.findByRole("dialog", { name: "Scheduled task details" })).toBeTruthy();
    });
  });

  it("scrolls the mobile Week agenda into view only after selecting a day", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      const scrollIntoView = stubScrollIntoView();
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
      renderAt("/calendar");

      fireEvent.click(await screen.findByRole("button", { name: "Week" }));
      expect(scrollIntoView).not.toHaveBeenCalled();

      const weekDays = await screen.findByRole("group", { name: "Week days" });
      fireEvent.click(within(weekDays).getByRole("button", { name: /Select Friday, May 29/ }));

      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" }));
    });
  });

  it("collapses calendar filters and stretches the scale selector on mobile", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
      renderAt("/calendar");

      const controls = await screen.findByRole("region", { name: "Calendar controls" });
      const scaleToggle = within(controls).getByRole("region", { name: "Calendar scale" });
      expect(scaleToggle.classList.contains("is-mobile-full-width")).toBe(true);

      const filters = within(controls).getByRole("region", { name: "Calendar filters" });
      expect(filters.classList.contains("is-collapsed")).toBe(true);
      expect(within(filters).queryByLabelText("Planning mode")).toBeNull();

      const toggle = within(filters).getByRole("button", { name: "Filters" });
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(toggle);

      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(filters.classList.contains("is-collapsed")).toBe(false);
      expect(within(filters).getByLabelText("Planning mode")).toBeTruthy();
    });
  });

  it("opens detail modals from the mobile Month selected-day agenda", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
      renderAt("/calendar");

      const agenda = await screen.findByRole("region", { name: "Selected day agenda" });
      fireEvent.click(within(agenda).getByRole("button", { name: "View Clean bathrooms" }));

      const dialog = await screen.findByRole("dialog", { name: "Scheduled task details" });
      expect(within(dialog).getByRole("heading", { name: "Clean bathrooms" })).toBeTruthy();
    });
  });

  it("shows an empty selected-day agenda in mobile Month", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
      renderAt("/calendar");

      const mobileMonth = await screen.findByRole("grid", { name: "May 2026 mobile month calendar" });
      fireEvent.click(within(mobileMonth).getByRole("button", { name: /Select Monday, May 4, 0 items/ }));

      const agenda = screen.getByRole("region", { name: "Selected day agenda" });
      expect(within(agenda).getByRole("heading", { name: "Monday, May 4" })).toBeTruthy();
      expect(within(agenda).getByText("No work scheduled for this day.")).toBeTruthy();
    });
  });

  it("keeps Calendar month view as a full month grid after the visual refresh", async () => {
    await withMay2026CalendarClock(async () => {
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
      renderAt("/calendar");

      expect(await screen.findByRole("heading", { name: "Calendar" })).toBeTruthy();
      fireEvent.click(screen.getByRole("tab", { name: "Calendar" }));
      fireEvent.click(screen.getByRole("button", { name: "Month" }));

      const monthGrid = await screen.findByRole("grid", { name: /month calendar/i });
      expect(monthGrid.closest(".calendar-desktop-month-surface")).not.toBeNull();
      const dayCells = within(monthGrid).getAllByRole("gridcell");
      const friday = screen.getByRole("gridcell", { name: "Friday, May 29" });
      expect(within(friday).getByRole("button", { name: "View Clean bathrooms" })).toBeTruthy();

      expect(dayCells.map((cell) => cell.getAttribute("aria-label"))).toEqual([
        "Sunday, Apr 26",
        "Monday, Apr 27",
        "Tuesday, Apr 28",
        "Wednesday, Apr 29",
        "Thursday, Apr 30",
        "Friday, May 1",
        "Saturday, May 2",
        "Sunday, May 3",
        "Monday, May 4",
        "Tuesday, May 5",
        "Wednesday, May 6",
        "Thursday, May 7",
        "Friday, May 8",
        "Saturday, May 9",
        "Sunday, May 10",
        "Monday, May 11",
        "Tuesday, May 12",
        "Wednesday, May 13",
        "Thursday, May 14",
        "Friday, May 15",
        "Saturday, May 16",
        "Sunday, May 17",
        "Monday, May 18",
        "Tuesday, May 19",
        "Wednesday, May 20",
        "Thursday, May 21",
        "Friday, May 22",
        "Saturday, May 23",
        "Sunday, May 24",
        "Monday, May 25",
        "Tuesday, May 26",
        "Wednesday, May 27",
        "Thursday, May 28",
        "Friday, May 29",
        "Saturday, May 30",
        "Sunday, May 31",
        "Monday, Jun 1",
        "Tuesday, Jun 2",
        "Wednesday, Jun 3",
        "Thursday, Jun 4",
        "Friday, Jun 5",
        "Saturday, Jun 6"
      ]);
    });
  });

  it("renders week view with one time rail and title-only chore buttons", async () => {
    await withMay2026CalendarClock(async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Week" }));
    const weekGrid = await screen.findByRole("grid", { name: "Week of May 24, 2026" });
    expect(weekGrid).toBeTruthy();
    expect(screen.getAllByText("May 24 - May 30, 2026").length).toBeGreaterThan(0);
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
    const weekTask = within(weekGrid).getAllByRole("button", { name: "View Clean bathrooms" })[0];
    expect(weekTask.classList.contains("calendar-chore-row")).toBe(true);
    expect(weekTask.classList.contains("calendar-work-item")).toBe(true);
    expect(weekTask.classList.contains("is-chore")).toBe(true);
    expect(weekTask.classList.contains("calendar-event")).toBe(false);
    expect(weekTask.getAttribute("title")).toBe("Clean bathrooms");
    expect(weekGrid.querySelector(".calendar-time-rail-separator")).not.toBeNull();
    expect(weekGrid.querySelectorAll(".calendar-column-hour-separator")).toHaveLength(7);
    expect(weekGrid.querySelectorAll(".calendar-column-hour-separator.has-top-divider")).toHaveLength(7);
    expect(screen.queryByText("Flexible")).toBeNull();
    });
  });

  it("renders day view with an anytime row label and inline hour labels", async () => {
    await withMay2026CalendarClock(async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Day" }));
    const dayGrid = await screen.findByRole("grid", { name: "Saturday, May 30 day calendar" });
    expect(dayGrid).toBeTruthy();
    expect(dayGrid.querySelector(".calendar-column-anytime-label")?.textContent).toBe("Anytime");
    expect(dayGrid.querySelector(".calendar-time-rail")).toBeNull();
    expect(within(dayGrid).getAllByText("8:00 am")).toHaveLength(1);
    const dayRows = within(dayGrid).getAllByRole("button");
    expect(dayRows.map((row) => row.getAttribute("aria-label"))).toEqual(["View Clean bathrooms", "View Pet cats"]);
    expect(dayRows[0].classList.contains("calendar-work-item")).toBe(true);
    expect(dayRows[0].classList.contains("is-chore")).toBe(true);
    const dayAssigneeToken = within(dayRows[0]).getByRole("img", { name: "Assigned to Alex Owner" });
    expect(dayAssigneeToken.textContent).toContain("AO");
    expect(dayAssigneeToken.closest(".calendar-chore-assignee")).not.toBeNull();
    expect(dayRows[0].lastElementChild).toBe(dayAssigneeToken.closest(".calendar-chore-assignee"));
    const dayTimeSummary = dayRows[0].querySelector(".calendar-time-summary");
    expect(dayTimeSummary).not.toBeNull();
    expect(within(dayTimeSummary as HTMLElement).getByText("Anytime")).toBeTruthy();
    expect(within(dayTimeSummary as HTMLElement).getByText("60 min")).toBeTruthy();
    expect(within(dayRows[0]).queryByText("Alex Owner")).toBeNull();
    expect(dayRows[1].classList.contains("is-completed")).toBe(true);
    expect(dayGrid.querySelector(".calendar-completed-drawer")).toBeNull();
    });
  });

  it("filters calendar content by planning mode inside the workspace panel", async () => {
    await withMay2026CalendarClock(async () => {
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
  });

  it("shows completed chores inline in calendar views and in list agenda views", async () => {
    await withMay2026CalendarClock(async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    expect(await screen.findByRole("grid", { name: "May 2026 month calendar" })).toBeTruthy();
    const completedOnlyDay = screen.getByRole("gridcell", { name: "Wednesday, May 27" });
    expect(completedOnlyDay.classList.contains("is-all-completed")).toBe(true);
    expect(completedOnlyDay.classList.contains("is-today")).toBe(false);
    expect(within(completedOnlyDay).queryByText("Done")).toBeNull();
    expect(within(completedOnlyDay).queryByText("No chores due")).toBeNull();
    expect(completedOnlyDay.querySelector(".calendar-completed-drawer")).toBeNull();
    const completedOnlyTask = within(completedOnlyDay).getByRole("button", { name: "View Clean bathrooms" });
    expect(completedOnlyTask.classList.contains("calendar-chore-row")).toBe(true);
    expect(completedOnlyTask.classList.contains("is-completed")).toBe(true);
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
    const completedOnlyWeekTask = completedOnlyColumn
      ? within(completedOnlyColumn as HTMLElement).getByRole("button", { name: "View Clean bathrooms" })
      : null;
    expect(completedOnlyWeekTask?.classList.contains("is-completed")).toBe(true);
    expect(saturdayColumn?.querySelector(".calendar-column-anytime-main")).not.toBeNull();
    expect(saturdayColumn?.querySelector(".calendar-day-completed-footer")).toBeNull();
    expect(saturdayColumn?.querySelector(".calendar-column-hour-separator")?.classList.contains("has-top-divider")).toBe(true);
    const saturdayRows = saturdayColumn ? within(saturdayColumn as HTMLElement).getAllByRole("button") : [];
    expect(saturdayRows.map((row) => row.getAttribute("aria-label"))).toEqual(["View Clean bathrooms", "View Pet cats"]);
    expect(saturdayRows[1].classList.contains("is-completed")).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: "List" }));
    const agenda = await screen.findByRole("region", { name: "Task agenda" });
    expect(agenda.classList.contains("calendar-agenda")).toBe(true);
    const completedCard = within(agenda).getByRole("button", { name: "View Pet cats" });
    expect(completedCard.classList.contains("calendar-chore-row")).toBe(true);
    expect(completedCard.classList.contains("calendar-agenda-row")).toBe(true);
    expect(completedCard.classList.contains("calendar-agenda-card")).toBe(false);
    expect(within(completedCard).getByText("Completed")).toBeTruthy();
    expect(within(agenda).getByText("1 completed")).toBeTruthy();
    });
  });

  it("renders completed Calendar chores after incomplete chores in each day group", async () => {
    await withMay2026CalendarClock(async () => {
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
      renderAt("/calendar");

      expect(await screen.findByRole("heading", { name: "Calendar" })).toBeTruthy();
      const dayCell = await screen.findByRole("gridcell", { name: /Saturday, May 30/i });
      const rows = within(dayCell).getAllByRole("button", { name: /View / });

      expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual(["View Clean bathrooms", "View Pet cats"]);

      const firstCompletedIndex = rows.findIndex((row) => row.classList.contains("is-completed"));
      const lastOpenIndex = rows.findLastIndex((row) => !row.classList.contains("is-completed"));

      expect(firstCompletedIndex).toBeGreaterThanOrEqual(0);
      expect(lastOpenIndex).toBeGreaterThanOrEqual(0);
      expect(firstCompletedIndex).toBeGreaterThan(lastOpenIndex);
    });
  });

  it("uses the compact completed status marker class for completed Calendar rows", async () => {
    await withMay2026CalendarClock(async () => {
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
      renderAt("/calendar");

      const completedButton = await screen.findByRole("button", { name: /View Pet cats/i });
      expect(completedButton.classList.contains("is-completed")).toBe(true);
      expect(completedButton.querySelector(".calendar-status-icon")).toBeTruthy();
    });
  });

  it("opens a chore view modal with upcoming and history before editing", async () => {
    await withMay2026CalendarClock(async () => {
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
      renderAt("/calendar");

    fireEvent.click(await findPlannedCleanBathroomsButton());

    const dialog = getTaskEditor();
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
    expect(screen.getByRole("button", { name: /Task details/ }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "Upcoming occurrences" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Task details/ }));
    expect(screen.getByRole("button", { name: /Task details/ }).getAttribute("aria-expanded")).toBe("true");
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
  });

  it("shows a calm empty state when a chore has no history", async () => {
    await withMay2026CalendarClock(async () => {
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({ includeHistory: false }));
      renderAt("/calendar");

      fireEvent.click(await findPlannedCleanBathroomsButton());

      const history = screen.getByRole("region", { name: "Historical occurrences" });
      expect(within(history).getByText("This event has no history yet.")).toBeTruthy();
    });
  });

  it("uses the compact inset chore detail modal on mobile", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
      renderAt("/calendar");

      fireEvent.click(await findPlannedCleanBathroomsButton());

      const modal = getTaskEditorElement();
      expect(modal.classList.contains("is-detail-view")).toBe(true);
      expect(modal.classList.contains("calendar-sync-modal")).toBe(false);
      expect(document.querySelector(".chore-editor-backdrop")?.classList.contains("is-detail-view")).toBe(true);
      expect(document.querySelector(".chore-editor-backdrop")?.classList.contains("is-centered-detail-view")).toBe(true);
      expect(modal.querySelector(".chore-detail-meta-grid")).not.toBeNull();
    });
  });

  it("keeps keyboard focus inside the chore detail modal and closes accessibly", async () => {
    await withMay2026CalendarClock(async () => {
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
      renderAt("/calendar");

      const opener = await findPlannedCleanBathroomsButton();
      fireEvent.click(opener);

      const modal = getTaskEditorElement();
      await waitFor(() => expect(modal.contains(document.activeElement)).toBe(true));
      expect(document.activeElement).toBe(within(modal).getByRole("button", { name: "Close dialog" }));

      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(within(modal).getByRole("button", { name: "Edit" }));

      fireEvent.keyDown(document, { key: "Tab" });
      expect(document.activeElement).toBe(within(modal).getByRole("button", { name: "Close dialog" }));

      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Scheduled task details" })).toBeNull());
      expect(document.activeElement).toBe(opener);

      fireEvent.click(opener);
      await screen.findByRole("dialog", { name: "Scheduled task details" });
      fireEvent.mouseDown(document.querySelector(".chore-editor-backdrop") as HTMLElement);
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Scheduled task details" })).toBeNull());
      expect(document.activeElement).toBe(opener);
    });
  });

  it("does not offer future occurrence rebasing for daily chores", async () => {
    await withMay2026CalendarClock(async () => {
      const fetchMock = mockCalendarWorkspaceFetches({ frequency: "daily" });
      vi.stubGlobal("fetch", fetchMock);
      renderAt("/calendar");

    fireEvent.click(await findPlannedCleanBathroomsButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/tasks/chore-1/schedules",
      expect.objectContaining({ headers: expect.any(Object) })
    ));
    fireEvent.click(getTaskEditor().getByRole("button", { name: "Complete chore" }));

    expect(screen.getByRole("region", { name: "Completion check-in" })).toBeTruthy();
      expect(screen.queryByLabelText("Base future occurrences on this completion date")).toBeNull();
    });
  });

  it("creates a chore from occurrence fields with inline recurrence controls", async () => {
    const fetchMock = mockCalendarWorkspaceFetches();
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Schedule task" }));
    const editor = getTaskEditor();
    expect(editor.getByRole("button", { name: "Close dialog" })).toBeTruthy();
    expect(editor.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(editor.getByRole("button", { name: "Schedule task" })).toBeTruthy();
    expect(editor.queryByRole("button", { name: "Save chore" })).toBeNull();
    expect(screen.getByText("Add steps, scope, or preferences. This helps future optimization understand what the chore includes.")).toBeTruthy();
    expect(screen.getByText("Optional labels like bathroom, outdoor, or deep clean. Tags help group chores and give optimization more context.")).toBeTruthy();
    expect(screen.getByText("Choose the first date, optional timing, owner, and whether this chore repeats.")).toBeTruthy();
    expect(screen.getByText("Leave blank if this can be done anytime on the selected day.")).toBeTruthy();
    expect(screen.getByText("Used for flexible chores. If you add a start time, the end time is calculated from this duration.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Upcoming Occurrences" })).toBeNull();
    expect(screen.queryByRole("button", { name: "History" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Clean bathrooms" } });
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

    fireEvent.click(editor.getByRole("button", { name: "Schedule task" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/tasks",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"startsOn\":\"2026-06-06\"")
      })
    ));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/tasks",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"memberUserIds\":[\"app-user-2\"]")
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/tasks",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"frequency\":\"weekly\"")
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/tasks",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"interval\":5")
      })
    );
  });

  it("refreshes calendar occurrences after creating a chore", async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Schedule task" }));
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Wash windows" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-06-06" } });
    fireEvent.click(getTaskEditor().getByRole("button", { name: "Schedule task" }));

    expect(await screen.findByRole("button", { name: "View Wash windows" })).toBeTruthy();
  });

  it("uses optional start time to create timed chores", async () => {
    const fetchMock = mockCalendarWorkspaceFetches();
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Schedule task" }));
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Clean kitchen" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-06-06" } });
    fireEvent.change(screen.getByLabelText(/Start time/), { target: { value: "10:30" } });
    fireEvent.change(screen.getByLabelText(/Estimated duration/), { target: { value: "45" } });
    fireEvent.click(getTaskEditor().getByRole("button", { name: "Schedule task" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/tasks",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"planningMode\":\"timed\"")
      })
    ));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/tasks",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"localStartTime\":\"10:30\"")
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/tasks",
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

    fireEvent.click(await screen.findByRole("button", { name: "Schedule task" }));
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Replace filter" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-06-15" } });
    expect(screen.queryByLabelText("Monthly anchor date")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Repeats" }));
    fireEvent.change(screen.getByLabelText("Repeat unit"), { target: { value: "monthly" } });
    expect(screen.queryByLabelText("Monthly anchor date")).toBeNull();
    expect(screen.getByRole("radio", { name: "On day 15 of the month" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "On the third Monday" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "On the third Monday" }));
    fireEvent.click(getTaskEditor().getByRole("button", { name: "Schedule task" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/tasks",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"monthlyPattern\":\"weekday_of_month\"")
      })
    ));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/tasks",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"monthlyWeek\":3")
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/tasks",
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

    fireEvent.click(await screen.findByRole("button", { name: "Schedule task" }));
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Service HVAC" } });
    fireEvent.click(screen.getByRole("button", { name: "Repeats" }));
    fireEvent.change(screen.getByLabelText("Repeat interval"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Repeat unit"), { target: { value: "yearly" } });
    expect(screen.queryByText("Days")).toBeNull();
    expect(screen.queryByLabelText("Monthly anchor date")).toBeNull();
    fireEvent.click(getTaskEditor().getByRole("button", { name: "Schedule task" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households/household-1/tasks",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"frequency\":\"yearly\"")
      })
    ));
  });

  it("opens a selected occurrence in view mode before editing", async () => {
    await withMay2026CalendarClock(async () => {
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
      renderAt("/calendar");

    fireEvent.click(await findPlannedCleanBathroomsButton());
    expect(screen.getByRole("heading", { name: "Clean bathrooms" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Upcoming occurrences" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = getTaskEditor();
    expect(dialog.getByRole("heading", { name: "Clean bathrooms" })).toBeTruthy();
    expect(dialog.getByText("Edit scheduled task")).toBeTruthy();
    const schedulePanel = screen.getByRole("region", { name: "Task schedule" });
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
  });

  it("saves schedule series edits from the occurrence editor", async () => {
    await withMay2026CalendarClock(async () => {
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
  });

  it("completes an assigned flexible obligation from its row and removes duplicate projections", async () => {
    await withMay2026CalendarClock(async () => {
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
      expect(screen.getByRole("heading", { name: "My Home", level: 1 })).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Overview" })).toBeTruthy();
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
      expect(screen.getByRole("heading", { name: "My Home", level: 1 })).toBeTruthy();
      expect(within(screen.getByRole("tabpanel", { name: "Overview" })).getByLabelText("View Main floor details, 0 rooms")).toBeTruthy();
      expect(within(screen.getByRole("tabpanel", { name: "Overview" })).getByRole("region", { name: "Home profile summary" })).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
      expect(within(screen.getByRole("region", { name: "Home profile summary" })).getByRole("button", { name: "Edit home details" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Add room to Main floor" })).toBeNull();
    });
    await openHouseholdManageTab("Floors");

    expect(screen.getByLabelText("Select Main floor, 0 rooms")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Main floor" })).toBeTruthy();
    expect(within(screen.getByRole("tabpanel", { name: "Floors" })).getByText("hardwood, rugs")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit surfaces" })).toBeNull();
    await editSelectedFloor();
    expect(screen.queryByRole("button", { name: "Add floor" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "Flooring surfaces" })).getByRole("button", { name: "Edit surfaces" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "hardwood" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit surfaces" }));
    expect(within(screen.getByRole("region", { name: "Flooring surfaces" })).queryByRole("button", { name: "Edit surfaces" })).toBeNull();
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
    await editHomeDetails();
    fireEvent.change(screen.getByLabelText("Household name"), { target: { value: "Lake House" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
    expect(within(screen.getByRole("region", { name: "Home profile summary" })).getByRole("button", { name: "Edit home details" })).toBeTruthy();
  });

  it("confirms before switching away from unsaved overview edits", async () => {
    mockHouseholdsPageFetches({
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
    await editHomeDetails();
    fireEvent.change(screen.getByLabelText("Household name"), { target: { value: "Changed home" } });
    fireEvent.click(screen.getByRole("tab", { name: "Floors" }));

    expect(await screen.findByRole("dialog", { name: "Discard changes?" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    expect((screen.getByLabelText("Household name") as HTMLInputElement).value).toBe("Changed home");

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog", { name: "Discard changes?" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
  });

  it("discards floor edits only after confirmation when switching tabs", async () => {
    restoreHouseholdInStorage();
    mockHouseholdsPageFetches({
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
    await editSelectedFloor();
    fireEvent.change(screen.getByLabelText("Floor name"), { target: { value: "Renamed floor" } });
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));

    expect(await screen.findByRole("dialog", { name: "Discard changes?" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Floors" }).getAttribute("aria-selected")).toBe("true");
    expect((screen.getByLabelText("Floor name") as HTMLInputElement).value).toBe("Renamed floor");

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("dialog", { name: "Discard changes?" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    await openHouseholdManageTab("Floors");
    expect(screen.getByRole("heading", { name: "Main floor" })).toBeTruthy();
    expect(screen.queryByDisplayValue("Renamed floor")).toBeNull();
  });

  it("adds and removes a basement floor with confirmation", async () => {
    restoreHouseholdInStorage();
    mockHouseholdsPageFetches({ householdId: "household-1", floors: [] });

    renderAt("/households");

    await manageHomeHousehold();
    await openHouseholdManageTab("Floors");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add basement" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add basement" }));

    expect(screen.getByLabelText("Select Basement, 0 rooms")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Basement" })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove basement" }).hasAttribute("disabled")).toBe(false));

    fireEvent.click(screen.getByRole("button", { name: "Remove basement" }));
    expect(screen.getByText("Remove Basement and 0 rooms?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove floor" }));

    expect(screen.queryByLabelText("Select Basement, 0 rooms")).toBeNull();
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
    await editSelectedFloor();
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

  it("keeps floor edit select fields from stretching beside notes", async () => {
    restoreHouseholdInStorage();
    mockHouseholdsPageFetches({
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
    await editSelectedFloor();

    const mopCoverage = screen.getByLabelText("Mop coverage");
    const fieldGrid = mopCoverage.closest(".field-grid");
    expect(fieldGrid?.classList.contains("aligned-field-grid")).toBe(true);
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
    await editSelectedFloor();
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
    await editSelectedFloor();
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

  it("adds and edits room annotations on the selected floor", async () => {
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
    await openHouseholdManageTab("Floors");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add room to Main floor" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add room to Main floor" }));
    fireEvent.change(screen.getByLabelText("Room name"), { target: { value: "Kitchen" } });
    fireEvent.click(screen.getByRole("button", { name: "Save room" }));

    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Edit Kitchen" }));
    fireEvent.click(within(screen.getByLabelText("Room flooring")).getByRole("button", { name: "rugs" }));
    fireEvent.click(screen.getByRole("button", { name: "Save room" }));

    await waitFor(() => expect(screen.getByText("hardwood, rugs")).toBeTruthy());
  });

  it("keeps room edit select fields from stretching beside notes", async () => {
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
    await openHouseholdManageTab("Floors");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add room to Main floor" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add room to Main floor" }));

    const mopCoverage = screen.getByLabelText("Mop coverage");
    const fieldGrid = mopCoverage.closest(".field-grid");
    expect(fieldGrid?.classList.contains("aligned-field-grid")).toBe(true);
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
    await openHouseholdManageTab("Floors");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add room to Main floor" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add room to Main floor" }));
    fireEvent.change(screen.getByLabelText("Room name"), { target: { value: "Kitchen" } });
    fireEvent.click(screen.getByLabelText("Select Upstairs, 0 rooms"));
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

  it("shows the calendar sync governance shell in Settings", async () => {
    mockRestoredHouseholdFetches();
    renderAt("/settings#calendar");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy());
    expect(screen.getByRole("tab", { name: "Connections" }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByRole("region", { name: "Calendar sync" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Your calendar connection" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Family permissions" })).toBeNull();
    expect(screen.getByText(/When you are ready to import or export events, use Calendar\./)).toBeTruthy();
    expect(screen.queryByLabelText("Source calendars")).toBeNull();
    expect(screen.queryByLabelText("Export destination")).toBeNull();
    expect(screen.queryByRole("button", { name: "Review events to share" })).toBeNull();
    expect(screen.getByText("Not connected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect Google Calendar" }));
    expect(await screen.findByText(/Google Calendar login needs/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Family" }));
    expect(await screen.findByRole("heading", { name: "Family permissions" })).toBeTruthy();
  });

  it("organizes Settings into sidebar views with General as the default", async () => {
    mockRestoredHouseholdFetches({
      chores: [cleanBathroomsTask, { ...cleanBathroomsTask, id: "chore-2", title: "Pet cats" }]
    });
    renderAt("/settings");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy());
    const sections = screen.getByRole("tablist", { name: "Settings sections" });
    expect(within(sections).getByRole("tab", { name: "General" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("region", { name: "General settings" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Week starts on" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Calendar sync" })).toBeNull();

    fireEvent.click(within(sections).getByRole("tab", { name: "Connections" }));
    expect(await screen.findByRole("region", { name: "Calendar sync" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "General settings" })).toBeNull();
    expect(within(sections).queryByRole("tab", { name: "Task library" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Task library" })).toBeNull();
  });

  it("opens a compact mobile Settings section menu that switches views and closes", async () => {
    mockRestoredHouseholdFetches({
      chores: [cleanBathroomsTask]
    });
    renderAt("/settings");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy());
    const sectionButton = screen.getByRole("button", { name: "Settings section: General. Change section" });
    fireEvent.click(sectionButton);

    const mobileSections = screen.getByRole("menu", { name: "Settings sections" });
    expect(within(mobileSections).getByRole("menuitem", { name: "General Defaults" })).toBeTruthy();

    fireEvent.click(within(mobileSections).getByRole("menuitem", { name: "Connections Calendar sync" }));
    expect(await screen.findByRole("region", { name: "Calendar sync" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Settings section: Connections. Change section" })).toBeTruthy();
    expect(screen.queryByRole("menu", { name: "Settings sections" })).toBeNull();
  });

  it("closes the compact mobile Settings section menu after clicking outside", async () => {
    mockRestoredHouseholdFetches();
    renderAt("/settings");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Settings section: General. Change section" }));
    expect(screen.getByRole("menu", { name: "Settings sections" })).toBeTruthy();

    fireEvent.mouseDown(screen.getByRole("heading", { name: "Calendar preferences" }));
    expect(screen.queryByRole("menu", { name: "Settings sections" })).toBeNull();
  });

  it("lets owners update each member's Task library permission from Family settings", async () => {
    const fetchMock = mockRestoredHouseholdFetches();
    renderAt("/settings");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Family" }));
    const permissionSelect = await screen.findByLabelText("Morgan Member Task library permission");
    fireEvent.change(permissionSelect, { target: { value: "manage" } });

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, init]) =>
        url === "http://localhost:3001/api/households/household-1/members/app-user-2/task-library-permission" &&
        init?.method === "PATCH"
      )).toBe(true);
    });
  });

  it("shows Task library CRUD controls to members with manage access", async () => {
    mockRestoredHouseholdFetches({
      currentUserId: "app-user-2",
      members: [ownerMember, { ...secondMember, taskLibraryPermission: "manage" }]
    });
    renderAt("/tasks");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Tasks" })).toBeTruthy());

    const choreLibrary = await screen.findByRole("region", { name: "Task library" });
    expect(within(choreLibrary).getByRole("button", { name: "Add task" })).toBeTruthy();
    expect(within(choreLibrary).getAllByRole("button", { name: /Edit / }).length).toBeGreaterThan(0);
    expect(within(choreLibrary).getAllByRole("button", { name: /Archive / }).length).toBeGreaterThan(0);
  });

  it("keeps Task library mutation controls unavailable to view-only members", async () => {
    mockRestoredHouseholdFetches({
      currentUserId: "app-user-2",
      members: [ownerMember, { ...secondMember, taskLibraryPermission: "view" }]
    });
    renderAt("/tasks");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Tasks" })).toBeTruthy());

    const choreLibrary = await screen.findByRole("region", { name: "Task library" });
    expect(within(choreLibrary).getByText("Your household owner controls who can manage the Task library.")).toBeTruthy();
    expect(within(choreLibrary).queryByRole("button", { name: "Add task" })).toBeNull();
    expect(within(choreLibrary).queryByRole("button", { name: /Archive / })).toBeNull();
  });

  it("shows a permission load error instead of assuming Task library view-only access", async () => {
    mockRestoredHouseholdFetches({ membersOk: false });
    renderAt("/tasks");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Tasks" })).toBeTruthy());

    const choreLibrary = await screen.findByRole("region", { name: "Task library" });
    expect(within(choreLibrary).getByText(/Could not load household permissions/i)).toBeTruthy();
    expect(within(choreLibrary).getByText(/database migration may still need to run/i)).toBeTruthy();
    expect(within(choreLibrary).queryByText("Your household owner controls who can manage the Task library.")).toBeNull();
  });

  it("does not show a calendar sync settings error just because a disconnected user has no sync preferences", async () => {
    const fetchMock = mockRestoredHouseholdFetches({ calendarPreferencesOk: false });
    renderAt("/settings#calendar");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy());
    expect(await screen.findByText("Not connected")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Connect Google Calendar" })).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock.mock.calls.some(([url]) =>
      url === "http://localhost:3001/api/me/calendar/preferences?householdId=household-1"
    )).toBe(false);
    expect(screen.queryByText("Could not load calendar sync settings.")).toBeNull();
  });

  it("lets connected users disconnect Google Calendar from Settings", async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({ calendarConnected: true }));
    renderAt("/settings#calendar");

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(await screen.findByText("Connected")).toBeTruthy();
    expect(await screen.findByText(/Connected as owner@example.com/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect Google Calendar" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect Google Calendar" }));

    expect(await screen.findByText("Google Calendar was disconnected from Clenella.")).toBeTruthy();
    expect(screen.getByText("Not connected")).toBeTruthy();
  });

  it("opens calendar sync actions from Calendar instead of Settings", async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    expect(await screen.findByRole("heading", { name: "Calendar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Calendar actions" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Import events" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export events" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Google Calendar setup" })).toBeNull();

    await openCalendarActions();
    expect(screen.getByRole("button", { name: "Import events" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export events" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Import events" }));
    expect(await screen.findByRole("dialog", { name: "Import calendar events" })).toBeTruthy();
    expect(screen.getByText(/Import and export stay independent/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));

    await openCalendarActions();
    fireEvent.click(screen.getByRole("button", { name: "Export events" }));
    const preselectPanel = await screen.findByRole("region", { name: "Export preselect controls" });
    const reviewPanel = await screen.findByRole("region", { name: "Export review controls" });
    const calendarGrid = screen.getByRole("grid", { name: /month calendar/i });
    expect(preselectPanel).toBeTruthy();
    expect(reviewPanel).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Export events" })).toBeNull();
    expect(screen.getByText(/Export mode: choose a range, select eligible events, then export to your calendar\./)).toBeTruthy();
    expect(screen.getByText(/Review selected events before choosing a destination calendar/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Import events" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export events" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Schedule task" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add chore" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Calendar import queue" })).toBeNull();
    expect(
      preselectPanel.compareDocumentPosition(calendarGrid) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      calendarGrid.compareDocumentPosition(reviewPanel) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("reviews connected Google Calendar import candidates without preselecting events", async () => {
    await withMay2026CalendarClock(async () => {
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({
        calendarConnected: true,
        importCandidates: [{
          id: "candidate-1",
          sourceExternalCalendarId: "external-calendar-1",
          providerEventId: "google-event-1",
          title: "Soccer practice",
          privacyTitle: "Soccer practice",
          startsAt: "2026-05-29T21:00:00.000Z",
          endsAt: "2026-05-29T22:00:00.000Z",
          proposedType: "commitment",
          detailLevel: "busy_only"
        }]
      }));
      renderAt("/calendar");

      await openCalendarActions();
      fireEvent.click(screen.getByRole("button", { name: "Import events" }));
      expect(await screen.findByRole("dialog", { name: "Import calendar events" })).toBeTruthy();
      expect(screen.queryByText(/You're connected. Choose which Google Calendar events Clenella can use./)).toBeNull();
      expect((screen.getByLabelText("From calendar") as HTMLSelectElement).value).toBe("external-calendar-1");
      expect(screen.getByRole("option", { name: "Choose a calendar" })).toBeTruthy();
      expect(screen.queryByRole("option", { name: "All connected calendars" })).toBeNull();
      expect(screen.queryByLabelText("Shared detail")).toBeNull();
      expect(screen.queryByRole("button", { name: "Change range" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "May 1 - May 31" }));
      expect(screen.getByRole("group", { name: "Import date range presets" })).toBeTruthy();
      expect(screen.getByText("0 selected")).toBeTruthy();
      expect(await screen.findByText("Soccer practice")).toBeTruthy();
      expect(screen.getByText("Busy")).toBeTruthy();
      expect(screen.getByText(/Clenella shares as/)).toBeTruthy();
      expect((screen.getByLabelText("Hide details for Soccer practice") as HTMLInputElement).checked).toBe(true);
      expect((screen.getByLabelText("Soccer practice import type") as HTMLSelectElement).value).toBe("commitment");
      expect((screen.getByRole("button", { name: "Apply to selected" }) as HTMLButtonElement).disabled).toBe(true);

      fireEvent.click(screen.getByLabelText("Select Soccer practice"));
      fireEvent.click(screen.getByRole("button", { name: "Apply to selected" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Set as chores" }));

      expect((screen.getByLabelText("Soccer practice import type") as HTMLSelectElement).value).toBe("chore");
      fireEvent.click(screen.getByRole("button", { name: "Apply to selected" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Show details" }));

      expect((screen.getByLabelText("Hide details for Soccer practice") as HTMLInputElement).checked).toBe(false);
      expect(screen.getAllByText("Soccer practice").length).toBeGreaterThan(1);
      expect((screen.getByRole("button", { name: "Send selected to Clenella" }) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it("refreshes imported Google Calendar events after sending selected events to Clenella", async () => {
    await withMay2026CalendarClock(async () => {
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({
        calendarConnected: true,
        importQueueMode: "auto",
        importCandidates: [{
          id: "candidate-1",
          sourceExternalCalendarId: "external-calendar-1",
          providerEventId: "google-event-1",
          title: "Soccer practice",
          privacyTitle: "Soccer practice",
          startsAt: "2026-05-29T21:00:00.000Z",
          endsAt: "2026-05-29T22:00:00.000Z",
          proposedType: "chore",
          detailLevel: "full_details"
        }]
      }));
      renderAt("/calendar");

      await openCalendarActions();
      fireEvent.click(screen.getByRole("button", { name: "Import events" }));
      fireEvent.click(await screen.findByLabelText("Select Soccer practice"));
      fireEvent.click(screen.getByRole("button", { name: "Send selected to Clenella" }));

      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Import calendar events" })).toBeNull());
      expect(await screen.findByText("Soccer practice")).toBeTruthy();
    });
  });

  it("places imported timed chores in their time slot with start time and duration", async () => {
    await withMay2026CalendarClock(async () => {
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({
        calendarConnected: true,
        cleanlyCalendarEvents: [{
          id: "cleanly-event-1",
          householdId: "household-1",
          createdByUserId: "app-user-1",
          type: "chore",
          title: "Soccer practice",
          privacyTitle: "Soccer practice",
          detailLevel: "full_details",
          startsAt: "2026-05-29T21:00:00.000Z",
          endsAt: "2026-05-29T21:45:00.000Z",
          timezone: "America/New_York",
          source: "google",
          status: "active"
        }]
      }));
      renderAt("/calendar");

      fireEvent.click(await screen.findByRole("button", { name: "Day" }));
      fireEvent.click(screen.getByRole("button", { name: "Previous day" }));

      const dayGrid = await screen.findByRole("grid", { name: "Friday, May 29 day calendar" });
      const anytimeRow = dayGrid.querySelector(".calendar-column-anytime-main");
      expect(within(anytimeRow as HTMLElement).queryByRole("button", { name: "View Soccer practice" })).toBeNull();
      const timedSlot = screen.getByLabelText("Friday, May 29 17:00 time slot");
      const importedTask = within(timedSlot).getByRole("button", { name: "View Soccer practice" });
      expect(importedTask.classList.contains("is-chore")).toBe(true);
      const timeSummary = importedTask.querySelector(".calendar-time-summary");
      expect(timeSummary).not.toBeNull();
      expect(timeSummary?.children).toHaveLength(2);
      expect(within(timeSummary as HTMLElement).getByText("5:00 PM")).toBeTruthy();
      expect(within(timeSummary as HTMLElement).getByText("45 min")).toBeTruthy();
      expect(within(importedTask).queryByText(/5:45 PM/)).toBeNull();
    });
  });

  it("shows importer and source details for imported calendar events", async () => {
    await withMay2026CalendarClock(async () => {
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({
        calendarConnected: true,
        cleanlyCalendarEvents: [{
          id: "cleanly-event-1",
          householdId: "household-1",
          createdByUserId: "app-user-1",
          type: "commitment",
          title: "Soccer practice",
          privacyTitle: "Soccer practice",
          detailLevel: "full_details",
          startsAt: "2026-05-29T21:00:00.000Z",
          endsAt: "2026-05-29T22:00:00.000Z",
          timezone: "America/New_York",
          source: "google",
          status: "active"
        }]
      }));
      renderAt("/calendar");

      fireEvent.click(await screen.findByRole("button", { name: "View Soccer practice" }));

      const dialog = await screen.findByRole("dialog", { name: "Calendar event details" });
      expect(within(dialog).getByText("Imported by")).toBeTruthy();
      expect(within(dialog).getByText("Alex Owner")).toBeTruthy();
      expect(within(dialog).getByText("Source")).toBeTruthy();
      expect(within(dialog).getByText("Google Calendar")).toBeTruthy();
    });
  });

  it("uses the compact inset calendar event detail modal on mobile", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({
        calendarConnected: true,
        cleanlyCalendarEvents: [{
          id: "cleanly-event-1",
          householdId: "household-1",
          createdByUserId: "app-user-1",
          type: "commitment",
          title: "Soccer practice",
          privacyTitle: "Soccer practice",
          detailLevel: "full_details",
          startsAt: "2026-05-29T21:00:00.000Z",
          endsAt: "2026-05-29T22:00:00.000Z",
          timezone: "America/New_York",
          source: "google",
          status: "active"
        }]
      }));
      stubScrollIntoView();
      renderAt("/calendar");

      const mobileMonth = await screen.findByRole("grid", { name: "May 2026 mobile month calendar" });
      fireEvent.click(within(mobileMonth).getByRole("button", { name: /Select Friday, May 29/ }));
      const agenda = screen.getByRole("region", { name: "Selected day agenda" });
      fireEvent.click(await within(agenda).findByRole("button", { name: "View Soccer practice" }));

      const dialog = await screen.findByRole("dialog", { name: "Calendar event details" });
      expect(dialog.classList.contains("calendar-event-detail-modal")).toBe(true);
      expect(dialog.classList.contains("is-detail-view")).toBe(true);
      expect(document.querySelector(".chore-editor-backdrop")?.classList.contains("is-detail-view")).toBe(true);
      expect(document.querySelector(".chore-editor-backdrop")?.classList.contains("is-centered-detail-view")).toBe(true);
    });
  });

  it("shows a blocked import state when the member import policy is off", async () => {
    await withMay2026CalendarClock(async () => {
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({
        calendarConnected: true,
        importCandidates: [{
          id: "candidate-1",
          sourceExternalCalendarId: "external-calendar-1",
          providerEventId: "google-event-1",
          title: "Soccer practice",
          privacyTitle: "Soccer practice",
          startsAt: "2026-05-29T21:00:00.000Z",
          endsAt: "2026-05-29T22:00:00.000Z",
          proposedType: "commitment",
          detailLevel: "busy_only"
        }],
        importQueueMode: "off"
      }));
      renderAt("/calendar");

      await openCalendarActions();
      fireEvent.click(screen.getByRole("button", { name: "Import events" }));

      expect(await screen.findByRole("dialog", { name: "Import calendar events" })).toBeTruthy();
      expect(screen.getByRole("region", { name: "Import disabled" })).toBeTruthy();
      expect(screen.getByText(/household owner has turned off Google Calendar imports/i)).toBeTruthy();
      fireEvent.click(screen.getByLabelText("Select Soccer practice"));
      expect((screen.getByRole("button", { name: "Send selected to Clenella" }) as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("summarizes selected export events by chores and commitments", async () => {
    await withMay2026CalendarClock(async () => {
      vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({
        calendarConnected: true,
        cleanlyCalendarEvents: [{
          id: "cleanly-event-1",
          householdId: "household-1",
          createdByUserId: "app-user-1",
          type: "chore",
          title: "Clean bathrooms",
          privacyTitle: "Clean bathrooms",
          detailLevel: "busy_only",
          startsAt: "2026-05-29T14:00:00.000Z",
          endsAt: "2026-05-29T15:00:00.000Z",
          timezone: "America/New_York",
          source: "manual",
          status: "active"
        }, {
          id: "cleanly-event-2",
          householdId: "household-1",
          createdByUserId: "app-user-1",
          type: "commitment",
          title: "Soccer practice",
          privacyTitle: "Soccer practice",
          detailLevel: "busy_only",
          startsAt: "2026-05-30T14:00:00.000Z",
          endsAt: "2026-05-30T15:00:00.000Z",
          timezone: "America/New_York",
          source: "google",
          status: "active"
        }]
      }));
      renderAt("/calendar");

      await openCalendarActions();
      fireEvent.click(screen.getByRole("button", { name: "Export events" }));
      expect(await screen.findByRole("region", { name: "Export preselect controls" })).toBeTruthy();
      expect(screen.getByRole("region", { name: "Export review controls" })).toBeTruthy();
      expect(screen.getByText("0 selected")).toBeTruthy();
      expect(screen.getByText("0 chores / 0 commitments")).toBeTruthy();
      expect(screen.queryByLabelText("To calendar")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /Select options:/ }));
      expect(screen.getByRole("region", { name: "Preselect options" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Select matching events" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Visible range" }));

      await waitFor(() => expect(screen.getByText("2 selected")).toBeTruthy());
      expect(screen.getByText("1 chores / 1 commitments")).toBeTruthy();
      expect(screen.getByText(/Review selected events before choosing a destination calendar/i)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Review" })).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Review" }));

      const reviewDialog = screen.getByRole("dialog", { name: "Review export" });
      expect(reviewDialog).toBeTruthy();
      expect(within(reviewDialog).getByText("Clean bathrooms")).toBeTruthy();
      expect(within(reviewDialog).getByText("Soccer practice")).toBeTruthy();
      expect(within(reviewDialog).getByLabelText("To calendar")).toBeTruthy();
      expect(within(reviewDialog).getByRole("button", { name: "Export 2 selected events" })).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Deselect Clean bathrooms" }));

      expect(screen.getByText("1 selected")).toBeTruthy();
      expect(screen.getByText("0 chores / 1 commitments")).toBeTruthy();
    });
  });

  it("lets Settings switch the Today week rail start day", async () => {
    await withMay2026CalendarClock(async () => {
      mockEmptyAppDataFetches();
      renderAt("/settings");

      await waitFor(() => expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy());
      const weekStartSelect = screen.getByRole("combobox", { name: "Week starts on" }) as HTMLSelectElement;
      expect(weekStartSelect.value).toBe("sunday");
      fireEvent.change(weekStartSelect, { target: { value: "monday" } });
      expect(window.localStorage.getItem("cleanly:week-start-day")).toBe("monday");

      cleanup();
      mockRestoredHouseholdFetches();
      renderAt("/today");

      expect(await screen.findByRole("button", { name: "Monday May 25 0 due" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Sunday May 24 0 due" })).toBeNull();
    });
  });

  it("moves the Today week rail with the previous and next buttons", async () => {
    await withMay2026CalendarClock(async () => {
      mockRestoredHouseholdFetches();
      renderAt("/today");

      expect(await screen.findByRole("button", { name: "Sunday May 24 0 due" })).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Next week" }));
      expect(await screen.findByRole("button", { name: "Sunday May 31 0 due" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Sunday May 31 0 due" }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.queryByRole("button", { name: "Sunday May 24 0 due" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
      expect(await screen.findByRole("button", { name: "Sunday May 24 0 due" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Sunday May 24 0 due" }).getAttribute("aria-pressed")).toBe("true");
    });
  });

  it("marks actual today in the Today week rail and animates arrow changes", async () => {
    await withMay2026CalendarClock(async () => {
      mockRestoredHouseholdFetches();
      renderAt("/today");

      const todayButton = await screen.findByRole("button", { name: /Saturday May 30 \d+ due, today/ });
      expect(todayButton.classList.contains("is-today")).toBe(true);
      expect(within(todayButton).queryByText("Today")).toBeNull();
      const dateStrip = document.querySelector(".today-date-strip");
      expect(dateStrip?.classList.contains("is-sliding-next")).toBe(false);

      fireEvent.click(screen.getByRole("button", { name: "Next week" }));
      expect(await screen.findByRole("button", { name: "Sunday May 31 0 due" })).toBeTruthy();
      expect(document.querySelector(".today-date-strip")?.classList.contains("is-sliding-next")).toBe(true);
      expect(screen.queryByRole("button", { name: /Saturday May 30 \d+ due, today/ })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
      expect(await screen.findByRole("button", { name: /Sunday May 24 \d+ due/ })).toBeTruthy();
      expect(document.querySelector(".today-date-strip")?.classList.contains("is-sliding-previous")).toBe(true);
    });
  });

  it("centers the selected Today rail date on mobile only", async () => {
    await withMay2026CalendarClock(async () => {
      setViewportWidth(390);
      const scrollIntoView = stubScrollIntoView();
      mockRestoredHouseholdFetches();
      renderAt("/today");

      await screen.findByRole("button", { name: /Saturday May 30 \d+ due/ });
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "nearest", inline: "center" }));

      cleanup();
      setViewportWidth(1024);
      const desktopScrollIntoView = stubScrollIntoView();
      mockRestoredHouseholdFetches();
      renderAt("/today");

      await screen.findByRole("button", { name: /Saturday May 30 \d+ due/ });
      expect(desktopScrollIntoView).not.toHaveBeenCalled();
    });
  });

  it("shows the Optimize recommendation selection flow", async () => {
    restoreHouseholdInStorage();
    mockRestoredHouseholdFetches();

    renderAt("/optimize");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Run a plan checkup for Home." })).toBeTruthy();
      expect(screen.getByLabelText("Clean bathrooms")).toBeTruthy();
    });

    expect(screen.getByRole("tab", { name: "Recommendations" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Chat" })).toBeTruthy();
    expect(screen.queryByLabelText("Household to review")).toBeNull();
    expect(screen.getByRole("region", { name: "Recommendation review" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Assistant chat" })).toBeNull();
    expect(screen.getByRole("button", { name: "Review selected chores" })).toBeTruthy();
  });

  it("renders Optimize as a special command-center workspace", async () => {
    restoreHouseholdInStorage();
    mockRestoredHouseholdFetches();

    renderAt("/optimize");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Run a plan checkup for Home." })).toBeTruthy());
    expect(screen.getByRole("region", { name: "Optimize command center" })).toBeTruthy();
    expect(screen.getByText("Ready for assistant review")).toBeTruthy();
    expect(screen.getByText("What Clenella is using")).toBeTruthy();
    expect((await screen.findAllByText(/Selected/i)).length).toBeGreaterThan(0);

    const modeTabs = screen.getByRole("tablist", { name: "Optimize workspace mode" });
    expect(modeTabs.parentElement?.classList.contains("optimize-workspace-toolbar")).toBe(true);

    const reviewPanel = screen.getByRole("region", { name: "Recommendation review" });
    const signalsPanel = screen.getByRole("region", { name: "Home household signals" });
    expect(reviewPanel.compareDocumentPosition(signalsPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));
    const chatPanel = screen.getByRole("region", { name: "Assistant chat" });
    expect(screen.queryByRole("region", { name: "Recommendation review" })).toBeNull();
    expect(chatPanel.compareDocumentPosition(signalsPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lets Optimize switch the household under review when multiple households exist", async () => {
    const fetchMock = mockMultiHouseholdOptimizeFetches();

    renderAt("/optimize");

    const householdSelect = await screen.findByLabelText("Household to review") as HTMLSelectElement;
    expect(householdSelect.value).toBe("household-1");
    expect(screen.getByRole("heading", { name: "Run a plan checkup for Home." })).toBeTruthy();
    expect(await screen.findByLabelText("Clean bathrooms")).toBeTruthy();

    fireEvent.change(householdSelect, { target: { value: "household-2" } });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Run a plan checkup for Lake house." })).toBeTruthy();
      expect(screen.getByLabelText("Sweep entryway")).toBeTruthy();
    });
    expect(fetchMock.mock.calls.some(([url]) =>
      url === "http://localhost:3001/api/households/household-2/tasks"
    )).toBe(true);
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
