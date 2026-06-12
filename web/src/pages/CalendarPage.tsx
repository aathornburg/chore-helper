import { addDays, addMinutes, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarConnectionSummary, CalendarImportCandidate, CalendarImportPolicy, CalendarImportQueueItem, CalendarPreferences, ChoreOccurrence, ChoreSchedule, CleanlyCalendarEvent, CompletionCheckInInput, ExternalCalendarSummary, HouseholdAppData, HouseholdMemberSummary, ScheduleInput } from "@chore-helper/shared";
import { completeOccurrence, createScheduledChore, decideCalendarImportQueueItem, exportCleanlyCalendarEvents, getCalendarPreferences, getCurrentUser, getMyCalendarImportPolicy, listCalendarConnections, listCalendarImportCandidates, listCalendarImportPolicies, listCalendarImportQueue, listCleanlyCalendarEvents, listExternalCalendars, listHouseholdMembers, listOccurrences, listSchedules, skipOccurrence, startGoogleCalendarConnection, submitCalendarImportEvents, updateCalendarPreferences, updateOccurrence, updateSchedule as updateScheduleApi } from "../api";
import { CalendarExportPreselectPanel, CalendarExportReviewPanel } from "./calendar/CalendarExportPanel";
import { DateRangePicker } from "./calendar/DateRangePicker";
import type { CalendarDateRange, CalendarDateRangePreset } from "./calendar/dateRange";
import { createVisibleRange, isDateInRange } from "./calendar/dateRange";
import type { Navigate } from "../types";

type WorkspaceView = "calendar" | "list";
type CalendarScale = "month" | "week" | "day";
type CalendarFilters = { householdId?: string; assignedUserId?: string; status?: string; planningMode?: string };
type EditorMode = "closed" | "create" | "view" | "edit";
type OccurrenceCardDensity = "title" | "summary";
type CalendarSyncModal = "closed" | "import";
type ScheduleDraft = ScheduleInput & { key: string };
type QueueDecisionDraft = {
  decision: "approve" | "reject";
  proposedType: CalendarImportQueueItem["proposedType"];
};
type EditorDraft = {
  choreId?: string;
  title: string;
  instructions: string;
  tags: string;
  startTime: string;
  schedules: ScheduleDraft[];
};

type CompletionCheckInDraft = Required<Pick<CompletionCheckInInput, "completedOnTime" | "durationAccurate" | "rebaseFutureOccurrences">>;

type CalendarPageProps = {
  households: HouseholdAppData[];
  isLoading: boolean;
  onNavigate: Navigate;
};

const scaleOptions: CalendarScale[] = ["month", "week", "day"];
const weekdays = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 }
];
const timedSlots = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const mobileMonthBreakpoint = 700;

function memberLabel(member: HouseholdMemberSummary) {
  return member.displayName ?? member.primaryEmail ?? member.clerkUserId;
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function durationInMinutes(occurrence: ChoreOccurrence) {
  return occurrence.estimatedMinutes;
}

function rangeForView(date: Date, view: CalendarScale, timeZone: string) {
  const startDate = view === "month"
    ? startOfMonth(date)
    : view === "week"
      ? startOfWeek(date, { weekStartsOn: 0 })
      : date;
  const endDate = view === "month"
    ? endOfMonth(date)
    : view === "week"
      ? endOfWeek(date, { weekStartsOn: 0 })
      : date;
  const startOn = format(startDate, "yyyy-MM-dd");
  const endOn = format(endDate, "yyyy-MM-dd");
  return {
    startAt: fromZonedTime(`${startOn}T00:00:00`, timeZone).toISOString(),
    endAt: fromZonedTime(`${endOn}T23:59:59`, timeZone).toISOString(),
    startOn,
    endOn
  };
}

function listRange(timeZone: string) {
  const startOn = format(new Date(), "yyyy-MM-dd");
  const endOn = format(addDays(new Date(), 30), "yyyy-MM-dd");
  return {
    startAt: fromZonedTime(`${startOn}T00:00:00`, timeZone).toISOString(),
    endAt: fromZonedTime(`${endOn}T23:59:59`, timeZone).toISOString(),
    startOn,
    endOn
  };
}

function displayDates(occurrence: ChoreOccurrence) {
  if (occurrence.status === "completed" && occurrence.completedAt) {
    return [parseISO(occurrence.completedAt)];
  }
  if (occurrence.planningMode === "flexible" && occurrence.status === "planned") {
    return eachDayOfInterval({ start: parseISO(occurrence.eligibleStartOn), end: parseISO(occurrence.eligibleEndOn) });
  }
  return [parseISO(occurrence.eligibleStartOn)];
}

function dateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function longDateLabel(date: Date) {
  return format(date, "EEEE, MMM d");
}

function createEmptyTimedScheduleDraft(): ScheduleDraft {
  return {
    key: crypto.randomUUID(),
    planningMode: "timed",
    recurrence: { frequency: "weekly", interval: 1, weekDays: [1] },
    localStartTime: "09:00",
    localEndTime: "10:00",
    startsOn: format(new Date(), "yyyy-MM-dd"),
    assignment: { mode: "fixed", memberUserIds: [] }
  };
}

function createEmptyFlexibleScheduleDraft(): ScheduleDraft {
  return {
    key: crypto.randomUUID(),
    planningMode: "flexible",
    recurrence: { frequency: "weekly", interval: 1, weekDays: [6, 0] },
    flexibleWindowRule: "once_within_selected_days",
    estimatedMinutes: 60,
    startsOn: format(new Date(), "yyyy-MM-dd"),
    assignment: { mode: "fixed", memberUserIds: [] }
  };
}

function createDefaultOneTimeScheduleDraft(): ScheduleDraft {
  return {
    key: crypto.randomUUID(),
    planningMode: "flexible",
    recurrence: { frequency: "one_time", interval: 1 },
    flexibleWindowRule: "each_selected_day",
    estimatedMinutes: 60,
    startsOn: format(new Date(), "yyyy-MM-dd"),
    assignment: { mode: "fixed", memberUserIds: [] }
  };
}

function timeAfterMinutes(startTime: string, minutes: number) {
  const [hour, minute] = startTime.split(":").map(Number);
  const totalMinutes = hour * 60 + minute + minutes;
  const endHour = Math.floor(totalMinutes / 60);
  const endMinute = totalMinutes % 60;
  return `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
}

function timeSlotLabel(slot: string) {
  const [hour, minute] = slot.split(":").map(Number);
  const period = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function orderCompletedLast(occurrencesForDay: ChoreOccurrence[]) {
  const completedOccurrences = occurrencesForDay.filter((occurrence) => occurrence.status === "completed");
  const activeOccurrences = occurrencesForDay.filter((occurrence) => occurrence.status !== "completed");
  return [...activeOccurrences, ...completedOccurrences];
}

function ChevronIcon({ direction }: { direction: "previous" | "next" }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20">
      <path
        d={direction === "previous" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20">
      <path
        d="M3.5 5h13M5.5 10h9M8 15h4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function minutesBetween(startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  return Math.max(1, endTotal >= startTotal ? endTotal - startTotal : endTotal + 24 * 60 - startTotal);
}

function ordinal(value: number) {
  if (value === -1) return "last";
  return ["first", "second", "third", "fourth"][value - 1] ?? `${value}th`;
}

function weekOfMonth(dateValue: string) {
  return Math.ceil(parseISO(dateValue).getDate() / 7);
}

function monthlyWeekdayLabel(dateValue: string) {
  return `${ordinal(weekOfMonth(dateValue))} ${format(parseISO(dateValue), "EEEE")}`;
}

function weekdayIndex(dateValue: string) {
  return parseISO(dateValue).getDay();
}

function tagsFromText(value: string) {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function scheduleToDraft(schedule: ChoreSchedule): ScheduleDraft {
  return {
    ...schedule,
    key: schedule.id
  };
}

export function CalendarPage({ households, isLoading }: CalendarPageProps) {
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("calendar");
  const [calendarScale, setCalendarScale] = useState<CalendarScale>("month");
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [filters, setFilters] = useState<CalendarFilters>({});
  const [members, setMembers] = useState<HouseholdMemberSummary[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [occurrences, setOccurrences] = useState<ChoreOccurrence[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [editorMode, setEditorMode] = useState<EditorMode>("closed");
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string>();
  const [editorDraft, setEditorDraft] = useState<EditorDraft>();
  const [editorStatus, setEditorStatus] = useState<string>();
  const [scheduleAccordionOpen, setScheduleAccordionOpen] = useState(false);
  const [completionCheckIn, setCompletionCheckIn] = useState<CompletionCheckInDraft>();
  const [draggingId, setDraggingId] = useState<string>();
  const [createdChoreTitles, setCreatedChoreTitles] = useState(() => new Map<string, string>());
  const [importQueueItems, setImportQueueItems] = useState<CalendarImportQueueItem[]>([]);
  const [cleanlyCalendarEvents, setCleanlyCalendarEvents] = useState<CleanlyCalendarEvent[]>([]);
  const [selectedCleanlyCalendarEventId, setSelectedCleanlyCalendarEventId] = useState<string>();
  const [isQueueReviewOpen, setIsQueueReviewOpen] = useState(false);
  const [queueDecisionDrafts, setQueueDecisionDrafts] = useState(() => new Map<string, QueueDecisionDraft>());
  const [queueApprovalMenuOpenId, setQueueApprovalMenuOpenId] = useState<string>();
  const [isQueueBulkApprovalMenuOpen, setIsQueueBulkApprovalMenuOpen] = useState(false);
  const [selectedQueueReviewItemIds, setSelectedQueueReviewItemIds] = useState<string[]>([]);
  const [selectedQueueSubmitterId, setSelectedQueueSubmitterId] = useState("all");
  const [isQueueRangeOpen, setIsQueueRangeOpen] = useState(false);
  const [queueRangePreset, setQueueRangePreset] = useState<CalendarDateRangePreset>("visible");
  const [queueRange, setQueueRange] = useState<CalendarDateRange>(() => createVisibleRange(format(new Date(), "yyyy-MM-dd"), format(addDays(new Date(), 30), "yyyy-MM-dd")));
  const [queueReviewFilter, setQueueReviewFilter] = useState<"all" | "chore" | "commitment" | "busy_only" | "full_details">("all");
  const [calendarSyncStatus, setCalendarSyncStatus] = useState<string>();
  const [syncModal, setSyncModal] = useState<CalendarSyncModal>("closed");
  const [isExportMode, setIsExportMode] = useState(false);
  const [isCalendarActionsOpen, setIsCalendarActionsOpen] = useState(false);
  const [connections, setConnections] = useState<CalendarConnectionSummary[]>([]);
  const [externalCalendars, setExternalCalendars] = useState<ExternalCalendarSummary[]>([]);
  const [calendarPreferences, setCalendarPreferences] = useState<CalendarPreferences>();
  const [importPolicies, setImportPolicies] = useState<CalendarImportPolicy[]>([]);
  const [myImportPolicy, setMyImportPolicy] = useState<CalendarImportPolicy>();
  const [importCandidates, setImportCandidates] = useState<CalendarImportCandidate[]>([]);
  const [selectedImportCandidateIds, setSelectedImportCandidateIds] = useState<string[]>([]);
  const [isImportApplyMenuOpen, setIsImportApplyMenuOpen] = useState(false);
  const [isImportRangeOpen, setIsImportRangeOpen] = useState(false);
  const [importRangePreset, setImportRangePreset] = useState<CalendarDateRangePreset>("visible");
  const [importRange, setImportRange] = useState<CalendarDateRange>(() => createVisibleRange(format(new Date(), "yyyy-MM-dd"), format(addDays(new Date(), 30), "yyyy-MM-dd")));
  const [exportRangePreset, setExportRangePreset] = useState<CalendarDateRangePreset>("visible");
  const [exportRange, setExportRange] = useState<CalendarDateRange>(() => createVisibleRange(format(new Date(), "yyyy-MM-dd"), format(addDays(new Date(), 30), "yyyy-MM-dd")));
  const [selectedExportEventIds, setSelectedExportEventIds] = useState<string[]>([]);
  const [shouldApplyExportPreselect, setShouldApplyExportPreselect] = useState(false);
  const [isMobileMonthViewport, setIsMobileMonthViewport] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= mobileMonthBreakpoint : false
  );
  const [selectedMobileMonthDateKey, setSelectedMobileMonthDateKey] = useState<string>();
  const [isCalendarFiltersOpen, setIsCalendarFiltersOpen] = useState(false);
  const choreEditorModalRef = useRef<HTMLFormElement>(null);
  const cleanlyEventModalRef = useRef<HTMLElement>(null);
  const modalTriggerRef = useRef<HTMLElement | null>(null);
  const calendarActionsButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMonthAgendaRef = useRef<HTMLElement>(null);

  const selectedHousehold = households.find((household) => household.id === filters.householdId) ?? households[0];
  const timeZone = selectedHousehold?.timeZone ?? "UTC";
  const isOwner = members.some((member) => member.userId === currentUserId && member.role === "owner");
  const visibleOccurrences = occurrences.filter((occurrence) =>
    (!filters.status || filters.status === "all" || occurrence.status === filters.status) &&
    (!filters.planningMode || filters.planningMode === "all" || occurrence.planningMode === filters.planningMode)
  );
  const selectedOccurrence = occurrences.find((occurrence) => occurrence.id === selectedOccurrenceId);
  const selectedCleanlyCalendarEvent = cleanlyCalendarEvents.find((event) => event.id === selectedCleanlyCalendarEventId);
  const currentUserImportPolicy = myImportPolicy ?? importPolicies.find((policy) => policy.memberId === currentUserId);
  const isImportBlocked = currentUserImportPolicy?.importQueueMode === "off";
  const visibleRange = useMemo(() => {
    const range = workspaceView === "list" ? listRange(timeZone) : rangeForView(focusDate, calendarScale, timeZone);
    return createVisibleRange(range.startOn, range.endOn);
  }, [calendarScale, focusDate, timeZone, workspaceView]);
  const isCalendarConnected = connections.some((connection) => connection.status === "connected");
  const pendingQueueItems = useMemo(() => importQueueItems.filter((item) => item.queueStatus === "pending"), [importQueueItems]);
  const visibleQueueItems = useMemo(() => pendingQueueItems.filter((item) => {
    const itemDate = formatInTimeZone(item.startsAt, timeZone, "yyyy-MM-dd");
    const matchesRange = isDateInRange(itemDate, queueRange);
    const matchesSubmitter = selectedQueueSubmitterId === "all" || item.submittedByUserId === selectedQueueSubmitterId;
    const matchesFilter = queueReviewFilter === "all" ||
      item.proposedType === queueReviewFilter ||
      item.detailLevel === queueReviewFilter;
    return matchesRange && matchesSubmitter && matchesFilter;
  }), [pendingQueueItems, queueRange, queueReviewFilter, selectedQueueSubmitterId, timeZone]);

  function restoreModalTriggerFocus() {
    modalTriggerRef.current?.focus();
    modalTriggerRef.current = null;
  }

  function closeChoreEditor() {
    setEditorMode("closed");
    restoreModalTriggerFocus();
  }

  function closeCleanlyCalendarEventDetail() {
    setSelectedCleanlyCalendarEventId(undefined);
    restoreModalTriggerFocus();
  }

  function focusableDialogElements(dialog: HTMLElement) {
    return Array.from(dialog.querySelectorAll<HTMLElement>([
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])"
    ].join(", "))).filter((element) => !element.hasAttribute("aria-hidden"));
  }

  useEffect(() => {
    if (!selectedHousehold) return;
    setFilters((current) => current.householdId ? current : { ...current, householdId: selectedHousehold.id });
  }, [selectedHousehold]);

  useEffect(() => {
    const modal = selectedCleanlyCalendarEvent
      ? cleanlyEventModalRef.current
      : editorMode !== "closed"
        ? choreEditorModalRef.current
        : null;
    if (!modal) return;
    const dialog = modal;

    const focusableElements = focusableDialogElements(dialog);
    const firstFocusable = focusableElements[0] ?? dialog;
    firstFocusable.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (selectedCleanlyCalendarEvent) {
          closeCleanlyCalendarEventDetail();
        } else {
          closeChoreEditor();
        }
        return;
      }

      if (event.key !== "Tab") return;
      const currentFocusableElements = focusableDialogElements(dialog);
      if (currentFocusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = currentFocusableElements[0];
      const lastElement = currentFocusableElements[currentFocusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      } else if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editorMode, selectedCleanlyCalendarEvent]);

  useEffect(() => {
    if (!selectedHousehold) return;
    let cancelled = false;
    void Promise.all([getCurrentUser(), listHouseholdMembers(selectedHousehold.id)])
      .then(([user, householdMembers]) => {
        if (!cancelled) {
          setCurrentUserId(user.id);
          setMembers(householdMembers);
        }
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedHousehold?.id]);

  useEffect(() => {
    if (!selectedHousehold || !isOwner) {
      setImportQueueItems([]);
      setImportPolicies([]);
      return;
    }
    let cancelled = false;
    void listCalendarImportQueue(selectedHousehold.id)
      .then((items) => {
        if (!cancelled) {
          setImportQueueItems(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImportQueueItems([]);
        }
      });
    void listCalendarImportPolicies(selectedHousehold.id)
      .then((policies) => {
        if (!cancelled) setImportPolicies(policies);
      })
      .catch(() => {
        if (!cancelled) setImportPolicies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, selectedHousehold?.id]);

  useEffect(() => {
    if (!selectedHousehold || !isOwner) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reviewImports") !== "1") return;
    setIsQueueReviewOpen(true);
    params.delete("reviewImports");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [isOwner, selectedHousehold]);

  useEffect(() => {
    if (!selectedHousehold) {
      setMyImportPolicy(undefined);
      return;
    }
    let cancelled = false;
    void getMyCalendarImportPolicy(selectedHousehold.id)
      .then((policy) => {
        if (!cancelled) setMyImportPolicy(policy);
      })
      .catch(() => {
        if (!cancelled) setMyImportPolicy(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedHousehold?.id]);

  useEffect(() => {
    if (!selectedHousehold) return;
    let cancelled = false;
    void Promise.all([
      listCalendarConnections(),
      listExternalCalendars(),
      getCalendarPreferences(selectedHousehold.id)
    ]).then(([loadedConnections, loadedCalendars, loadedPreferences]) => {
      if (cancelled) return;
      setConnections(loadedConnections);
      setExternalCalendars(loadedCalendars);
      setCalendarPreferences(loadedPreferences);
    }).catch(() => {
      if (!cancelled) setCalendarSyncStatus("Could not load calendar sync settings.");
    });
    return () => {
      cancelled = true;
    };
  }, [selectedHousehold?.id]);

  useEffect(() => {
    if (importRangePreset === "visible") setImportRange(visibleRange);
    if (exportRangePreset === "visible") setExportRange(visibleRange);
    if (queueRangePreset === "visible") setQueueRange(visibleRange);
  }, [exportRangePreset, importRangePreset, queueRangePreset, visibleRange]);

  useEffect(() => {
    const hasOpenFloatingSurface = isImportApplyMenuOpen ||
      isImportRangeOpen ||
      isQueueRangeOpen ||
      isQueueBulkApprovalMenuOpen ||
      isCalendarActionsOpen ||
      Boolean(queueApprovalMenuOpenId);
    if (!hasOpenFloatingSurface) return;

    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const clickedInsideFloatingSurface = target.closest([
        ".calendar-sync-apply-menu",
        ".calendar-sync-range-popover",
        ".calendar-sync-date-trigger",
        ".calendar-actions-menu",
        ".calendar-queue-approve-split"
      ].join(", "));
      if (clickedInsideFloatingSurface) return;

      setIsImportApplyMenuOpen(false);
      setIsImportRangeOpen(false);
      setIsQueueRangeOpen(false);
      setIsQueueBulkApprovalMenuOpen(false);
      setIsCalendarActionsOpen(false);
      setQueueApprovalMenuOpenId(undefined);
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    return () => document.removeEventListener("mousedown", handleDocumentMouseDown);
  }, [isCalendarActionsOpen, isImportApplyMenuOpen, isImportRangeOpen, isQueueBulkApprovalMenuOpen, isQueueRangeOpen, queueApprovalMenuOpenId]);

  useEffect(() => {
    if (syncModal !== "import") return;
    loadImportCandidates();
  }, [isCalendarConnected, selectedHousehold?.id, syncModal]);

  useEffect(() => {
    if (!selectedHousehold) return;
    let cancelled = false;
    setLoadState("loading");
    const range = workspaceView === "list" ? listRange(timeZone) : rangeForView(focusDate, calendarScale, timeZone);
    void listOccurrences(selectedHousehold.id, {
      ...range,
      ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {})
    }).then((loaded) => {
      if (!cancelled) {
        setOccurrences(loaded);
        setLoadState("ready");
      }
    }).catch(() => {
      if (!cancelled) setLoadState("error");
    });
    return () => {
      cancelled = true;
    };
  }, [calendarScale, filters.assignedUserId, focusDate, selectedHousehold?.id, timeZone, workspaceView]);

  useEffect(() => {
    if (!selectedHousehold) return;
    let cancelled = false;
    const range = workspaceView === "list" ? listRange(timeZone) : rangeForView(focusDate, calendarScale, timeZone);
    void listCleanlyCalendarEvents(selectedHousehold.id, { startAt: range.startAt, endAt: range.endAt })
      .then((events) => {
        if (!cancelled) setCleanlyCalendarEvents(events);
      })
      .catch(() => {
        if (!cancelled) setCleanlyCalendarEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [calendarScale, focusDate, selectedHousehold?.id, timeZone, workspaceView]);

  const choreTitles = useMemo(() => new Map(
    [...(selectedHousehold?.chores ?? []).map((chore) => [chore.id, chore.title] as const), ...createdChoreTitles]
  ), [createdChoreTitles, selectedHousehold]);

  const occurrenceDateBuckets = useMemo(() => {
    const groups = new Map<string, ChoreOccurrence[]>();
    for (const occurrence of visibleOccurrences) {
      for (const date of displayDates(occurrence)) {
        const key = dateKey(date);
        groups.set(key, [...(groups.get(key) ?? []), occurrence]);
      }
    }
    return groups;
  }, [visibleOccurrences]);

  const cleanlyEventDateBuckets = useMemo(() => {
    const groups = new Map<string, CleanlyCalendarEvent[]>();
    for (const event of cleanlyCalendarEvents) {
      const key = formatInTimeZone(event.startsAt, timeZone, "yyyy-MM-dd");
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return groups;
  }, [cleanlyCalendarEvents, timeZone]);

  const listGroups = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return Array.from(occurrenceDateBuckets.entries())
      .filter(([date]) => date >= today)
      .sort(([first], [second]) => first.localeCompare(second));
  }, [occurrenceDateBuckets]);

  const listStatusCounts = useMemo(() => {
    const listOccurrences = listGroups.flatMap(([, dateOccurrences]) => dateOccurrences);
    return {
      planned: listOccurrences.filter((occurrence) => occurrence.status === "planned").length,
      completed: listOccurrences.filter((occurrence) => occurrence.status === "completed").length,
      skipped: listOccurrences.filter((occurrence) => occurrence.status === "skipped").length
    };
  }, [listGroups]);

  const selectedImportSourceCalendarId = calendarPreferences?.selectedSourceCalendarIds[0] ?? "";
  const importCandidatesInRange = useMemo(() => importCandidates.filter((candidate) =>
    isDateInRange(formatInTimeZone(candidate.startsAt, timeZone, "yyyy-MM-dd"), importRange) &&
    candidate.sourceExternalCalendarId === selectedImportSourceCalendarId
  ), [importCandidates, importRange, selectedImportSourceCalendarId, timeZone]);

  const eligibleExportEvents = useMemo(() => cleanlyCalendarEvents.filter((event) =>
    event.status === "active" &&
    isDateInRange(formatInTimeZone(event.startsAt, timeZone, "yyyy-MM-dd"), exportRange) &&
    (!calendarPreferences || calendarPreferences.exportContentMode === "both" || calendarPreferences.exportContentMode === `${event.type}s`)
  ), [calendarPreferences, cleanlyCalendarEvents, exportRange, timeZone]);

  useEffect(() => {
    if (!isExportMode || !shouldApplyExportPreselect) return;
    setSelectedExportEventIds(eligibleExportEvents.map((event) => event.id));
    setShouldApplyExportPreselect(false);
  }, [eligibleExportEvents, isExportMode, shouldApplyExportPreselect]);

  const monthDates = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(focusDate), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(focusDate), { weekStartsOn: 0 })
  }), [focusDate]);

  useEffect(() => {
    function syncMobileMonthViewport() {
      setIsMobileMonthViewport(window.innerWidth <= mobileMonthBreakpoint);
    }

    syncMobileMonthViewport();
    window.addEventListener("resize", syncMobileMonthViewport);
    return () => window.removeEventListener("resize", syncMobileMonthViewport);
  }, []);

  useEffect(() => {
    if (!isMobileMonthViewport) setIsCalendarFiltersOpen(false);
  }, [isMobileMonthViewport]);

  useEffect(() => {
    if (calendarScale !== "month" || monthDates.length === 0) return;

    const todayKey = format(new Date(), "yyyy-MM-dd");
    const visibleToday = monthDates.some((date) => dateKey(date) === todayKey);
    const firstFocusedMonthDate = monthDates.find((date) => format(date, "yyyy-MM") === format(focusDate, "yyyy-MM"));
    setSelectedMobileMonthDateKey(
      visibleToday ? todayKey : firstFocusedMonthDate ? dateKey(firstFocusedMonthDate) : dateKey(monthDates[0])
    );
  }, [calendarScale, focusDate, monthDates]);

  const weekDates = useMemo(() => eachDayOfInterval({
    start: startOfWeek(focusDate, { weekStartsOn: 0 }),
    end: endOfWeek(focusDate, { weekStartsOn: 0 })
  }), [focusDate]);

  const periodLabel = calendarScale === "month"
    ? formatInTimeZone(focusDate, timeZone, "MMMM yyyy")
    : calendarScale === "week"
      ? `${format(weekDates[0], "MMM d")} - ${format(weekDates[weekDates.length - 1], "MMM d, yyyy")}`
      : format(focusDate, "EEEE, MMM d, yyyy");

  const periodUnit = calendarScale;

  function moveFocusDate(direction: -1 | 1) {
    setFocusDate((date) =>
      calendarScale === "month"
        ? addMonths(date, direction)
        : calendarScale === "week"
          ? addWeeks(date, direction)
          : addDays(date, direction)
    );
  }

  function occurrenceTitle(occurrence: ChoreOccurrence) {
    return choreTitles.get(occurrence.choreId) ?? "Scheduled chore";
  }

  function monthItemsForDate(date: Date) {
    const key = dateKey(date);
    const occurrencesForDay = occurrenceDateBuckets.get(key) ?? [];
    const activeOccurrences = occurrencesForDay.filter((occurrence) => occurrence.status !== "completed");
    const orderedOccurrences = orderCompletedLast(occurrencesForDay);
    const cleanlyEventsForDay = cleanlyEventDateBuckets.get(key) ?? [];
    return {
      cleanlyEventsForDay,
      hasAllCompleted: occurrencesForDay.length > 0 && activeOccurrences.length === 0,
      itemCount: cleanlyEventsForDay.length + occurrencesForDay.length,
      orderedOccurrences
    };
  }

  function selectMobileMonthDate(nextDateKey: string) {
    setSelectedMobileMonthDateKey(nextDateKey);
    if (!isMobileMonthViewport) return;
    window.setTimeout(() => {
      mobileMonthAgendaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function assignedMemberLabel(occurrence: ChoreOccurrence) {
    return memberDisplayName(occurrence.assignedUserId);
  }

  function memberForUserId(userId?: string) {
    if (!userId) return undefined;
    return members.find((item) => item.userId === userId || item.clerkUserId === userId);
  }

  function memberDisplayName(userId?: string, fallback = "Unknown member") {
    if (!userId) return "Unassigned";
    const member = memberForUserId(userId);
    if (member) return memberLabel(member);
    if (userId === currentUserId) return "You";
    return fallback;
  }

  function memberInitials(userId?: string) {
    const label = memberDisplayName(userId, "Unknown");
    const initials = label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
    return initials || "?";
  }

  function renderIdentityToken(label: string, initials: string) {
    return (
      <span className="calendar-identity-token" role="img" aria-label={label}>
        <span aria-hidden="true">{initials}</span>
        <span className="calendar-identity-tooltip" role="tooltip">{label}</span>
      </span>
    );
  }

  function assigneeIdentity(occurrence: ChoreOccurrence) {
    const label = `Assigned to ${assignedMemberLabel(occurrence)}`;
    return renderIdentityToken(label, memberInitials(occurrence.assignedUserId));
  }

  function cleanlyEventSourceLabel(event: CleanlyCalendarEvent) {
    return event.source === "google" ? "Google Calendar" : "Manual event";
  }

  function eventDurationLabel(event: CleanlyCalendarEvent) {
    const minutes = Math.max(1, Math.round((Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60000));
    return `${minutes} min`;
  }

  function cleanlyEventTimeLine(event: CleanlyCalendarEvent) {
    return renderTimeSummary(formatInTimeZone(event.startsAt, timeZone, "h:mm a"), eventDurationLabel(event));
  }

  function renderTimeSummary(startLabel: string, durationLabel: string) {
    return (
      <span className="calendar-time-summary">
        <span>{startLabel}</span>
        <span>{durationLabel}</span>
      </span>
    );
  }

  function seedDraftAssignees(draft: ScheduleDraft): ScheduleDraft {
    const firstMember = members[0]?.userId ?? currentUserId ?? "";
    return {
      ...draft,
      assignment: {
        ...draft.assignment,
        memberUserIds: draft.assignment.memberUserIds.length ? draft.assignment.memberUserIds : [firstMember].filter(Boolean)
      }
    };
  }

  function openCreateEditor(trigger?: HTMLElement) {
    setIsCalendarActionsOpen(false);
    modalTriggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setSelectedCleanlyCalendarEventId(undefined);
    setSelectedOccurrenceId(undefined);
    setEditorStatus(undefined);
    setScheduleAccordionOpen(false);
    setCompletionCheckIn(undefined);
    setEditorDraft({
      title: "",
      instructions: "",
      tags: "",
      startTime: "",
      schedules: [seedDraftAssignees(createDefaultOneTimeScheduleDraft())]
    });
    setEditorMode("create");
  }

  function draftFromOccurrence(occurrence: ChoreOccurrence): EditorDraft {
    const chore = selectedHousehold?.chores.find((item) => item.id === occurrence.choreId);
    const scheduleDraft = (occurrence.planningMode === "flexible"
      ? {
          ...createEmptyFlexibleScheduleDraft(),
          key: occurrence.scheduleId,
          recurrence: { frequency: "one_time", interval: 1 },
          flexibleWindowRule: "each_selected_day",
          startsOn: occurrence.eligibleStartOn,
          estimatedMinutes: occurrence.estimatedMinutes,
          assignment: { mode: "fixed", memberUserIds: [occurrence.assignedUserId] }
        }
      : {
          ...createEmptyTimedScheduleDraft(),
          key: occurrence.scheduleId,
          recurrence: { frequency: "one_time", interval: 1 },
          startsOn: occurrence.eligibleStartOn,
          localStartTime: occurrence.plannedStartAt ? formatInTimeZone(occurrence.plannedStartAt, timeZone, "HH:mm") : "09:00",
          localEndTime: occurrence.plannedEndAt ? formatInTimeZone(occurrence.plannedEndAt, timeZone, "HH:mm") : "10:00",
          assignment: { mode: "fixed", memberUserIds: [occurrence.assignedUserId] }
        }) as ScheduleDraft;
    return {
      choreId: occurrence.choreId,
      title: occurrenceTitle(occurrence),
      instructions: chore?.instructions ?? "",
      tags: chore?.tags?.join(", ") ?? "",
      startTime: occurrence.plannedStartAt ? formatInTimeZone(occurrence.plannedStartAt, timeZone, "HH:mm") : "",
      schedules: [seedDraftAssignees(scheduleDraft)]
    };
  }

  function loadScheduleDetailsForEditor(occurrence: ChoreOccurrence) {
    if (!selectedHousehold) return;

    void listSchedules(selectedHousehold.id, occurrence.choreId)
      .then((loadedSchedules) => {
        setEditorDraft((current) => current?.choreId === occurrence.choreId ? {
          ...current,
          schedules: loadedSchedules.map(scheduleToDraft)
        } : current);
      })
      .catch(() => setEditorStatus("Could not load schedule details."));
  }

  function openViewEditor(occurrence: ChoreOccurrence, trigger?: HTMLElement) {
    modalTriggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setSelectedCleanlyCalendarEventId(undefined);
    setSelectedOccurrenceId(occurrence.id);
    setEditorStatus(undefined);
    setScheduleAccordionOpen(false);
    setCompletionCheckIn(undefined);
    setEditorDraft(draftFromOccurrence(occurrence));
    loadScheduleDetailsForEditor(occurrence);
    setEditorMode("view");
  }

  function openEditEditor(occurrence: ChoreOccurrence, trigger?: HTMLElement) {
    modalTriggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setSelectedCleanlyCalendarEventId(undefined);
    setSelectedOccurrenceId(occurrence.id);
    setEditorStatus(undefined);
    setScheduleAccordionOpen(false);
    setCompletionCheckIn(undefined);
    setEditorDraft(draftFromOccurrence(occurrence));
    loadScheduleDetailsForEditor(occurrence);
    setEditorMode("edit");
  }

  function updateScheduleDraft(index: number, update: Partial<ScheduleDraft>) {
    setEditorDraft((current) => current ? {
      ...current,
      schedules: current.schedules.map((schedule, scheduleIndex) =>
        scheduleIndex === index ? ({ ...schedule, ...update } as ScheduleDraft) : schedule
      )
    } : current);
  }

  function updatePrimarySchedule(update: Partial<ScheduleDraft>) {
    updateScheduleDraft(0, update);
  }

  function updatePrimaryRecurrenceFrequency(frequency: ScheduleInput["recurrence"]["frequency"]) {
    if (!editorDraft?.schedules[0]) return;
    const schedule = editorDraft.schedules[0];
    updatePrimarySchedule({
      recurrence: {
        ...schedule.recurrence,
        frequency,
        weekDays: frequency === "weekly" ? (schedule.recurrence.weekDays ?? [parseISO(schedule.startsOn).getDay()]) : undefined,
        monthlyPattern: frequency === "monthly" ? (schedule.recurrence.monthlyPattern ?? "day_of_month") : undefined,
        monthlyDay: frequency === "monthly" ? (schedule.recurrence.monthlyDay ?? parseISO(schedule.startsOn).getDate()) : undefined,
        monthlyWeek: frequency === "monthly" ? (schedule.recurrence.monthlyWeek ?? weekOfMonth(schedule.startsOn)) : undefined,
        monthlyWeekday: frequency === "monthly" ? (schedule.recurrence.monthlyWeekday ?? weekdayIndex(schedule.startsOn)) : undefined
      }
    });
  }

  async function saveCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedHousehold || !editorDraft) return;
    try {
      const schedules = editorDraft.schedules.map(({ key: _key, ...schedule }) => {
        if (editorDraft.startTime.trim() && schedule.planningMode === "flexible") {
          return {
            planningMode: "timed" as const,
            recurrence: schedule.recurrence,
            startsOn: schedule.startsOn,
            ...(schedule.endsOn ? { endsOn: schedule.endsOn } : {}),
            assignment: schedule.assignment,
            localStartTime: editorDraft.startTime,
            localEndTime: timeAfterMinutes(editorDraft.startTime, schedule.estimatedMinutes)
          };
        }
        return schedule;
      });
      const created = await createScheduledChore(selectedHousehold.id, {
        chore: {
          title: editorDraft.title,
          source: "manual",
          ...(editorDraft.instructions.trim() ? { instructions: editorDraft.instructions.trim() } : {}),
          tags: tagsFromText(editorDraft.tags)
        },
        schedules
      });
      selectedHousehold.chores.push({ ...created.chore, recommendations: [] });
      setCreatedChoreTitles((current) => new Map(current).set(created.chore.id, created.chore.title));
      await reloadOccurrences();
      setEditorMode("closed");
      setEditorDraft(undefined);
      setEditorStatus("Chore saved.");
    } catch {
      setEditorStatus("Could not save chore.");
    }
  }

  async function saveUpdate(occurrence: ChoreOccurrence, localStart: string, minutes: number, assignedUserId: string) {
    if (!selectedHousehold || !occurrence.plannedStartAt) return;
    const plannedStart = fromZonedTime(localStart, timeZone);
    const updated = await updateOccurrence(selectedHousehold.id, occurrence.id, {
      plannedStartAt: plannedStart.toISOString(),
      plannedEndAt: addMinutes(plannedStart, minutes).toISOString(),
      assignedUserId
    });
    setOccurrences((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  async function reloadOccurrences() {
    if (!selectedHousehold) return;
    const range = workspaceView === "list" ? listRange(timeZone) : rangeForView(focusDate, calendarScale, timeZone);
    const loaded = await listOccurrences(selectedHousehold.id, {
      ...range,
      ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {})
    });
    setOccurrences(loaded);
  }

  async function reloadCleanlyCalendarEvents() {
    if (!selectedHousehold) return;
    const range = workspaceView === "list" ? listRange(timeZone) : rangeForView(focusDate, calendarScale, timeZone);
    const events = await listCleanlyCalendarEvents(selectedHousehold.id, { startAt: range.startAt, endAt: range.endAt });
    setCleanlyCalendarEvents(events);
  }

  async function handleScheduleSeriesSave() {
    if (!selectedHousehold || !editorDraft) return;
    try {
      const savedSchedules = await Promise.all(editorDraft.schedules.map(({ key, ...schedule }) =>
        updateScheduleApi(selectedHousehold.id, key, schedule)
      ));
      setEditorDraft((current) => current ? {
        ...current,
        schedules: savedSchedules.map(scheduleToDraft)
      } : current);
      await reloadOccurrences();
      setEditorStatus("Schedule saved.");
    } catch {
      setEditorStatus("Could not save schedule.");
    }
  }

  async function handleSkip() {
    if (!selectedHousehold || !selectedOccurrence) return;
    const updated = await skipOccurrence(selectedHousehold.id, selectedOccurrence.id);
    setOccurrences((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  async function handleComplete(occurrence: ChoreOccurrence, checkIn?: CompletionCheckInInput) {
    if (!selectedHousehold) return;
    const updated = await completeOccurrence(selectedHousehold.id, occurrence.id, checkIn);
    setOccurrences((current) =>
      current.map((item) => item.id === updated.id ? updated : item)
    );
    if (selectedOccurrenceId === occurrence.id) {
      setEditorMode("closed");
      setSelectedOccurrenceId(undefined);
    }
  }

  function openQueueReviewModal() {
    setIsQueueReviewOpen(true);
    setCalendarSyncStatus(undefined);
    setQueueRange(visibleRange);
    setQueueRangePreset("visible");
    setQueueReviewFilter("all");
    setSelectedQueueSubmitterId("all");
    setIsQueueBulkApprovalMenuOpen(false);
  }

  function stageQueueDecision(item: CalendarImportQueueItem, decision: QueueDecisionDraft["decision"], proposedType = item.proposedType) {
    setQueueDecisionDrafts((current) => {
      const next = new Map(current);
      next.set(item.id, { decision, proposedType });
      return next;
    });
    setQueueApprovalMenuOpenId(undefined);
    setIsQueueBulkApprovalMenuOpen(false);
  }

  function clearQueueDecision(itemId: string) {
    setQueueDecisionDrafts((current) => {
      const next = new Map(current);
      next.delete(itemId);
      return next;
    });
    setQueueApprovalMenuOpenId(undefined);
    setIsQueueBulkApprovalMenuOpen(false);
  }

  function toggleQueueReviewSelection(itemId: string) {
    setSelectedQueueReviewItemIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
    );
  }

  function selectVisibleQueueReviewItems() {
    setSelectedQueueReviewItemIds(visibleQueueItems.map((item) => item.id));
  }

  function clearQueueReviewSelection() {
    setSelectedQueueReviewItemIds([]);
  }

  function stageSelectedQueueDecision(decision: QueueDecisionDraft["decision"], proposedType: CalendarImportQueueItem["proposedType"]) {
    if (!selectedQueueReviewItemIds.length) return;
    const selectedItems = visibleQueueItems.filter((item) => selectedQueueReviewItemIds.includes(item.id));
    setQueueDecisionDrafts((current) => {
      const next = new Map(current);
      selectedItems.forEach((item) => {
        next.set(item.id, { decision, proposedType: decision === "approve" ? proposedType : item.proposedType });
      });
      return next;
    });
    setIsQueueBulkApprovalMenuOpen(false);
  }

  async function submitQueueDecisionDrafts() {
    if (!selectedHousehold || !queueDecisionDrafts.size) return;
    const stagedEntries = Array.from(queueDecisionDrafts.entries());
    const updatedItems = await Promise.all(stagedEntries.map(([itemId, draft]) =>
      decideCalendarImportQueueItem(selectedHousehold.id, itemId, {
        decision: draft.decision,
        proposedType: draft.proposedType
      })
    ));
    setImportQueueItems((current) => current.map((item) =>
      updatedItems.find((updated) => updated.id === item.id) ?? item
    ));
    setQueueDecisionDrafts(new Map());
    setQueueApprovalMenuOpenId(undefined);
    setIsQueueBulkApprovalMenuOpen(false);
    setSelectedQueueReviewItemIds([]);
    if (updatedItems.some((item) => item.createdCleanlyEventId)) {
      await reloadCleanlyCalendarEvents();
    }
    setIsQueueReviewOpen(false);
    setCalendarSyncStatus(`${updatedItems.length} import decision${updatedItems.length === 1 ? "" : "s"} submitted.`);
  }

  async function handleDrop(slot: string) {
    const occurrence = occurrences.find((item) => item.id === draggingId);
    if (!occurrence?.plannedStartAt) return;
    const date = formatInTimeZone(occurrence.plannedStartAt, timeZone, "yyyy-MM-dd");
    await saveUpdate(occurrence, `${date}T${slot}`, durationInMinutes(occurrence), occurrence.assignedUserId);
    setDraggingId(undefined);
  }

  function occurrenceDateLine(occurrence: ChoreOccurrence) {
    if (occurrence.planningMode === "flexible") {
      return `Anytime / ${durationInMinutes(occurrence)} min`;
    }
    return `${occurrence.plannedStartAt ? formatInTimeZone(occurrence.plannedStartAt, timeZone, "h:mm a") : "Anytime"} / ${durationInMinutes(occurrence)} min`;
  }

  function occurrenceTimeSummary(occurrence: ChoreOccurrence) {
    const startLabel = occurrence.planningMode === "flexible" || !occurrence.plannedStartAt
      ? "Anytime"
      : formatInTimeZone(occurrence.plannedStartAt, timeZone, "h:mm a");
    return renderTimeSummary(startLabel, `${durationInMinutes(occurrence)} min`);
  }

  function occurrenceStatusLabel(occurrence: ChoreOccurrence) {
    return occurrence.status === "completed" ? "Completed" : occurrence.status === "skipped" ? "Skipped" : "Planned";
  }

  function occurrenceCompletionLine(occurrence: ChoreOccurrence) {
    return occurrence.completedAt
      ? `Completed ${formatInTimeZone(occurrence.completedAt, timeZone, "h:mm a")}`
      : occurrenceStatusLabel(occurrence);
  }

  function isFlexibleOverdue(occurrence: ChoreOccurrence) {
    return occurrence.planningMode === "flexible" &&
      occurrence.status === "planned" &&
      occurrence.eligibleEndOn < format(new Date(), "yyyy-MM-dd");
  }

  function occurrencePrimaryDate(occurrence: ChoreOccurrence) {
    if (occurrence.status === "completed" && occurrence.completedAt) {
      return formatInTimeZone(occurrence.completedAt, timeZone, "yyyy-MM-dd");
    }
    return occurrence.plannedStartAt
      ? formatInTimeZone(occurrence.plannedStartAt, timeZone, "yyyy-MM-dd")
      : occurrence.eligibleStartOn;
  }

  function relatedOccurrences(status: "upcoming" | "history") {
    if (!selectedOccurrence) return [];
    return occurrences
      .filter((occurrence) =>
        occurrence.choreId === selectedOccurrence.choreId &&
        occurrence.scheduleId === selectedOccurrence.scheduleId &&
        (status === "upcoming" ? occurrence.status === "planned" : occurrence.status !== "planned")
      )
      .sort((first, second) => occurrencePrimaryDate(first).localeCompare(occurrencePrimaryDate(second)));
  }

  function relatedOccurrenceDateRows(status: "upcoming" | "history") {
    return relatedOccurrences(status)
      .flatMap((occurrence) => displayDates(occurrence).map((date) => ({ occurrence, date })))
      .sort((first, second) => dateKey(first.date).localeCompare(dateKey(second.date)));
  }

  function selectedOccurrenceCanRebaseFuture() {
    const selectedSchedule = editorDraft?.schedules.find((schedule) => schedule.key === selectedOccurrence?.scheduleId);
    return Boolean(
      selectedSchedule &&
      selectedSchedule.recurrence.frequency !== "one_time" &&
      selectedSchedule.recurrence.frequency !== "daily"
    );
  }

  function renderChoreViewDetailSections() {
    if (!selectedOccurrence || !editorDraft) return null;
    const selectedChore = selectedHousehold?.chores.find((item) => item.id === selectedOccurrence.choreId);
    const sourceLabel = selectedChore?.source === "google-calendar" ? "Google Calendar" : "Manual chore";
    const upcomingRows = relatedOccurrenceDateRows("upcoming").slice(0, 4);
    const historyRows = relatedOccurrenceDateRows("history").slice(0, 4);

    return (
      <>
        <div className="chore-detail-meta-grid">
          <div>
            <span>Assigned to</span>
            <strong>{assignedMemberLabel(selectedOccurrence)}</strong>
          </div>
          <div>
            <span>When</span>
            <strong>{occurrenceDateLine(selectedOccurrence)}</strong>
          </div>
          <div>
            <span>Date</span>
            <strong>{format(parseISO(occurrencePrimaryDate(selectedOccurrence)), "EEEE, MMM d")}</strong>
          </div>
          <div>
            <span>Source</span>
            <strong>{sourceLabel}</strong>
          </div>
        </div>
        {editorDraft.instructions ? (
          <section className="schedule-card">
            <strong>Instructions</strong>
            <span>{editorDraft.instructions}</span>
          </section>
        ) : null}
        {editorDraft.tags ? (
          <section className="schedule-card">
            <strong>Tags</strong>
            <span>{editorDraft.tags}</span>
          </section>
        ) : null}
        <section className="schedule-occurrence-section" aria-label="Upcoming occurrences">
          <h3>Upcoming Occurrences</h3>
          <div className="schedule-occurrence-list">
            {upcomingRows.map(({ occurrence, date }) => (
              <article className="schedule-occurrence-row" key={`${occurrence.id}-${dateKey(date)}`}>
                <span>{format(date, "EEEE, MMM d")}</span>
                <span>{occurrenceDateLine(occurrence)}</span>
              </article>
            ))}
          </div>
        </section>
        <section className="schedule-occurrence-section" aria-label="Historical occurrences">
          <h3>History</h3>
          <div className="schedule-occurrence-list">
            {historyRows.length === 0 ? <p className="schedule-occurrence-empty">This event has no history yet.</p> : null}
            {historyRows.map(({ occurrence, date }) => (
              <article className="schedule-occurrence-row" key={`${occurrence.id}-${dateKey(date)}`}>
                <span>{format(date, "EEEE, MMM d")}</span>
                <span>{capitalize(occurrence.status)}</span>
              </article>
            ))}
          </div>
        </section>
      </>
    );
  }

  function startCompletionCheckIn() {
    setScheduleAccordionOpen(false);
    setCompletionCheckIn({
      completedOnTime: true,
      durationAccurate: true,
      rebaseFutureOccurrences: false
    });
  }

  function renderOccurrenceCompact(occurrence: ChoreOccurrence, date: Date, density: OccurrenceCardDensity) {
    const title = occurrenceTitle(occurrence);
    const assigneeToken = assigneeIdentity(occurrence);
    return (
      <button
        aria-label={`View ${title}`}
        className={`calendar-work-item calendar-chore-row is-chore ${density === "summary" ? "is-summary" : ""} ${occurrence.status === "completed" ? "is-completed" : ""} ${occurrence.status === "skipped" ? "is-skipped" : ""}`}
        draggable={isOwner && calendarScale !== "month" && occurrence.status === "planned" && occurrence.planningMode === "timed"}
        key={`${occurrence.id}-${dateKey(date)}`}
        onClick={(event) => openViewEditor(occurrence, event.currentTarget)}
        onDragStart={() => setDraggingId(occurrence.id)}
        title={title}
        type="button"
      >
        {occurrence.status === "completed" ? (
          <span className="calendar-status-icon" aria-hidden="true">✓</span>
        ) : null}
        <span className="calendar-chore-main">
          <span className="calendar-chore-title">{title}</span>
          {density === "summary" ? (
            <>
              <span className="calendar-chore-detail">
                {occurrenceTimeSummary(occurrence)}
              </span>
              {isFlexibleOverdue(occurrence) ? <span className="occurrence-overdue-badge">Overdue</span> : null}
            </>
          ) : null}
        </span>
        <span className="calendar-chore-assignee">
          {assigneeToken}
        </span>
      </button>
    );
  }

  function renderMonthOccurrence(occurrence: ChoreOccurrence, date: Date) {
    const title = occurrenceTitle(occurrence);
    const assigneeToken = assigneeIdentity(occurrence);
    return (
      <button
        aria-label={`View ${title}`}
        className={`calendar-work-item calendar-chore-row is-chore ${occurrence.status === "completed" ? "is-completed" : ""} ${occurrence.status === "skipped" ? "is-skipped" : ""}`}
        key={`${occurrence.id}-${dateKey(date)}`}
        onClick={(event) => openViewEditor(occurrence, event.currentTarget)}
        title={title}
        type="button"
      >
        {occurrence.status === "completed" ? (
          <span className="calendar-status-icon" aria-hidden="true">✓</span>
        ) : null}
        <span className="calendar-chore-main">
          <span className="calendar-chore-title">{title}</span>
        </span>
        <span className="calendar-chore-assignee">
          {assigneeToken}
        </span>
      </button>
    );
  }

  function renderAgendaOccurrence(occurrence: ChoreOccurrence, date: Date) {
    const title = occurrenceTitle(occurrence);
    return (
      <button
        aria-label={`View ${title}`}
        className={`calendar-work-item calendar-chore-row calendar-agenda-row is-chore is-${occurrence.status}`}
        key={`${occurrence.id}-${dateKey(date)}`}
        onClick={(event) => openViewEditor(occurrence, event.currentTarget)}
        title={title}
        type="button"
      >
        {occurrence.status === "completed" ? (
          <span className="calendar-status-icon" aria-hidden="true">✓</span>
        ) : null}
        <span className="calendar-chore-main">
          <span className="calendar-chore-title">{title}</span>
          <span className="calendar-chore-detail">{occurrence.status === "completed" ? occurrenceCompletionLine(occurrence) : occurrenceDateLine(occurrence)}</span>
        </span>
        <span className="calendar-chore-meta">
          <span>{assigneeIdentity(occurrence)}</span>
          <span>{durationInMinutes(occurrence)} min</span>
        </span>
        <span className={`agenda-status-chip is-${occurrence.status}`}>{occurrenceStatusLabel(occurrence)}</span>
      </button>
    );
  }

  function renderCleanlyCalendarEvent(event: CleanlyCalendarEvent, compact = true) {
    const isSelectedForExport = selectedExportEventIds.includes(event.id);
    const isEligibleForExport = eligibleExportEvents.some((eligibleEvent) => eligibleEvent.id === event.id);
    const className = `calendar-work-item calendar-chore-row calendar-cleanly-event is-${event.type}${isExportMode ? " is-export-selectable" : ""}${isSelectedForExport ? " is-selected-for-export" : ""}${isExportMode && !isEligibleForExport ? " is-export-muted" : ""}`;
    const content = (
      <>
        <span className="calendar-chore-main">
          <span className="calendar-chore-title">{event.privacyTitle}</span>
          {!compact ? (
            <span className="calendar-chore-detail">
              {cleanlyEventTimeLine(event)}
            </span>
          ) : null}
        </span>
      </>
    );

    return isExportMode ? (
      <button
        aria-label={`${isSelectedForExport ? "Deselect" : "Select"} ${event.privacyTitle}`}
        aria-pressed={isSelectedForExport}
        className={className}
        disabled={!isEligibleForExport}
        key={event.id}
        onClick={() => toggleExportEvent(event.id)}
        title={event.privacyTitle}
        type="button"
      >
        {content}
      </button>
    ) : (
      <button
        aria-label={`View ${event.privacyTitle}`}
        className={className}
        key={event.id}
        onClick={(clickEvent) => {
          modalTriggerRef.current = clickEvent.currentTarget;
          setEditorMode("closed");
          setSelectedCleanlyCalendarEventId(event.id);
        }}
        title={event.privacyTitle}
        type="button"
      >
        {content}
      </button>
    );
  }

  function saveCalendarPreference(update: CalendarPreferences) {
    void updateCalendarPreferences(update)
      .then(setCalendarPreferences)
      .catch(() => setCalendarSyncStatus("Could not save calendar preferences."));
  }

  function chooseImportSourceCalendar(calendarId: string) {
    if (!calendarPreferences) return;
    setImportCandidates([]);
    setSelectedImportCandidateIds([]);
    void updateCalendarPreferences({
      ...calendarPreferences,
      selectedSourceCalendarIds: calendarId ? [calendarId] : []
    })
      .then((updatedPreferences) => {
        setCalendarPreferences(updatedPreferences);
        if (calendarId) loadImportCandidates();
      })
      .catch(() => setCalendarSyncStatus("Could not save calendar preferences."));
  }

  function loadImportCandidates() {
    if (!selectedHousehold || !isCalendarConnected) return;
    void listCalendarImportCandidates(selectedHousehold.id)
      .then((candidates) => {
        setImportCandidates(candidates);
        setSelectedImportCandidateIds([]);
      })
      .catch(() => setCalendarSyncStatus("Could not load calendar events to review."));
  }

  function handleConnectGoogleCalendar() {
    void startGoogleCalendarConnection()
      .then((result) => {
        if (result.authUrl) {
          window.location.assign(result.authUrl);
          return;
        }
        setCalendarSyncStatus(result.message);
      })
      .catch(() => setCalendarSyncStatus("Could not start Google Calendar connection."));
  }

  function openImportModal() {
    setIsCalendarActionsOpen(false);
    setSyncModal("import");
    setCalendarSyncStatus(undefined);
  }

  function startExportMode() {
    setIsCalendarActionsOpen(false);
    setIsExportMode(true);
    setSyncModal("closed");
    setCalendarSyncStatus(undefined);
    setExportRange(visibleRange);
    setExportRangePreset("visible");
    setSelectedExportEventIds([]);
  }

  function exitExportMode() {
    setIsExportMode(false);
    setSelectedExportEventIds([]);
  }

  function toggleImportCandidate(candidateId: string) {
    setSelectedImportCandidateIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : [...current, candidateId]
    );
  }

  function selectVisibleImportCandidates() {
    setSelectedImportCandidateIds(importCandidatesInRange.map((candidate) => candidate.id));
  }

  function clearSelectedImportCandidates() {
    setSelectedImportCandidateIds([]);
    setIsImportApplyMenuOpen(false);
  }

  function updateImportCandidateType(candidateId: string, proposedType: CalendarImportCandidate["proposedType"]) {
    setImportCandidates((current) => current.map((candidate) =>
      candidate.id === candidateId ? { ...candidate, proposedType } : candidate
    ));
  }

  function applyImportBatchType(proposedType: CalendarImportCandidate["proposedType"]) {
    setImportCandidates((current) => current.map((candidate) =>
      selectedImportCandidateIds.includes(candidate.id) ? { ...candidate, proposedType } : candidate
    ));
  }

  function updateImportCandidateDetailLevel(candidateId: string, detailLevel: CalendarImportCandidate["detailLevel"]) {
    setImportCandidates((current) => current.map((candidate) =>
      candidate.id === candidateId ? { ...candidate, detailLevel } : candidate
    ));
  }

  function applyImportBatchDetailLevel(detailLevel: CalendarImportCandidate["detailLevel"]) {
    setImportCandidates((current) => current.map((candidate) =>
      selectedImportCandidateIds.includes(candidate.id) ? { ...candidate, detailLevel } : candidate
    ));
    setIsImportApplyMenuOpen(false);
  }

  function handleImportBatchType(proposedType: CalendarImportCandidate["proposedType"]) {
    applyImportBatchType(proposedType);
    setIsImportApplyMenuOpen(false);
  }

  function sharedImportTitle(candidate: CalendarImportCandidate) {
    return candidate.detailLevel === "full_details" ? candidate.title : "Busy";
  }

  function handleSubmitEventsToCleanly() {
    if (!selectedHousehold) return;
    const selectedEvents = importCandidates
      .filter((candidate) => selectedImportCandidateIds.includes(candidate.id))
      .map((candidate) => ({
        ...candidate,
        detailLevel: candidate.detailLevel,
        privacyTitle: sharedImportTitle(candidate)
      }));
    void submitCalendarImportEvents(selectedHousehold.id, selectedEvents)
      .then(async (result) => {
        setCalendarSyncStatus(result.status === "auto_ready" ? "Selected events were added to Clenella." : "Selected events were sent to the owner queue.");
        setSyncModal("closed");
        setImportCandidates([]);
        setSelectedImportCandidateIds([]);
        if (result.status === "auto_ready") {
          await reloadCleanlyCalendarEvents();
        }
        if (isOwner) {
          void listCalendarImportQueue(selectedHousehold.id).then((items) => {
            setImportQueueItems(items);
          });
        }
      })
      .catch(() => setCalendarSyncStatus("Could not send selected events to Clenella."));
  }

  function toggleExportEvent(eventId: string) {
    if (!isExportMode) return;
    setSelectedExportEventIds((current) =>
      current.includes(eventId)
        ? current.filter((id) => id !== eventId)
        : [...current, eventId]
    );
  }

  function handleExportCleanlyEvents() {
    if (!selectedHousehold) return;
    void exportCleanlyCalendarEvents(selectedHousehold.id, selectedExportEventIds)
      .then((result) => {
        setCalendarSyncStatus(`${result.exported} calendar event${result.exported === 1 ? "" : "s"} exported.`);
        exitExportMode();
      })
      .catch(() => setCalendarSyncStatus("Could not export calendar events. Choose an export destination in Settings first."));
  }

  function renderCalendarSyncModal() {
    if (syncModal === "closed") return null;

    return (
      <div
        className="chore-editor-backdrop calendar-sync-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setIsImportApplyMenuOpen(false);
            setIsImportRangeOpen(false);
            setSyncModal("closed");
          }
        }}
        role="presentation"
      >
        <section className="chore-editor-modal calendar-sync-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-sync-modal-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Work my calendar</p>
              <h2 id="calendar-sync-modal-heading">Import calendar events</h2>
            </div>
            <button aria-label="Close dialog" className="icon-button modal-close-button" onClick={() => setSyncModal("closed")} type="button" />
          </div>

          {!isCalendarConnected ? (
            <section className="calendar-sync-intro-panel">
              <p className="eyebrow">First, connect Google Calendar</p>
              <h3>Then Clenella can help you choose what moves between calendars.</h3>
              <p>
                Import and export stay independent. You can export Clenella work without importing personal events,
                and imported events only reach the shared calendar after the right review path.
              </p>
              <button onClick={handleConnectGoogleCalendar} type="button">Connect Google Calendar</button>
            </section>
          ) : (
            <div className="calendar-sync-modal-body">
              {isImportBlocked ? (
                <section className="sync-blocked-state" aria-label="Import disabled">
                  <p className="eyebrow">Import disabled</p>
                  <h3>Your household owner has turned off Google Calendar imports for this member.</h3>
                  <p>You can still manage your connection and export settings, but events cannot be sent into the shared Clenella queue right now.</p>
                </section>
              ) : null}
              {calendarPreferences ? (
                <section className="calendar-sync-filter-strip" aria-label="Import settings">
                  <span>
                    <strong>From</strong>
                  </span>
                  <label>
                    <span className="sr-only">From calendar</span>
                    <select
                      aria-label="From calendar"
                      value={selectedImportSourceCalendarId}
                      onChange={(event) => chooseImportSourceCalendar(event.target.value)}
                    >
                      <option value="">Choose a calendar</option>
                      {externalCalendars.map((calendar) => (
                        <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
                      ))}
                    </select>
                  </label>
                  <span className="calendar-sync-filter-spacer" aria-hidden="true" />
                  <span className="calendar-sync-range-count">{importCandidatesInRange.length} in range</span>
                  <button
                    aria-controls="import-range-popover"
                    aria-expanded={isImportRangeOpen}
                    className="calendar-sync-date-trigger"
                    onClick={() => setIsImportRangeOpen((current) => !current)}
                    type="button"
                  >
                    {formatInTimeZone(`${importRange.startOn}T00:00:00.000Z`, "UTC", "MMM d")} - {formatInTimeZone(`${importRange.endOn}T00:00:00.000Z`, "UTC", "MMM d")}
                  </button>
                  {isImportRangeOpen ? (
                    <div className="calendar-sync-range-popover" id="import-range-popover" role="dialog" aria-label="Import date range">
                      <div className="calendar-sync-range-popover-heading">
                        <div>
                          <p className="eyebrow">Date range</p>
                          <h3>Choose events to show</h3>
                        </div>
                        <span>{formatInTimeZone(`${importRange.startOn}T00:00:00.000Z`, "UTC", "MMM d")} - {formatInTimeZone(`${importRange.endOn}T00:00:00.000Z`, "UTC", "MMM d")}</span>
                      </div>
                      <DateRangePicker
                        idPrefix="import-events-range"
                        label="Import date range"
                        onPresetChange={(nextPreset, nextRange) => {
                          setImportRangePreset(nextPreset);
                          setImportRange(nextRange);
                          if (nextPreset !== "custom") setIsImportRangeOpen(false);
                        }}
                        onRangeChange={(nextRange) => {
                          setImportRangePreset("custom");
                          setImportRange(nextRange);
                        }}
                        preset={importRangePreset}
                        range={importRange}
                        variant="panel"
                        visibleRange={visibleRange}
                      />
                    </div>
                  ) : null}
                </section>
              ) : null}
              <section className="calendar-sync-event-panel" aria-label="Events available to import">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Available events</p>
                    <h3>Choose what Clenella can use</h3>
                  </div>
                  <div className="calendar-sync-event-actions">
                    <button
                      className="section-action"
                      disabled={!importCandidatesInRange.length || isImportBlocked}
                      onClick={selectVisibleImportCandidates}
                      type="button"
                    >
                      Select all visible
                    </button>
                    <button
                      className="quiet-link"
                      disabled={selectedImportCandidateIds.length === 0}
                      onClick={clearSelectedImportCandidates}
                      type="button"
                    >
                      Clear selection
                    </button>
                  </div>
                </div>
                <div className="calendar-sync-selection-line">
                  <span>
                    {selectedImportCandidateIds.length
                      ? "Use row controls, or apply one change to selected events."
                      : "Select events one by one, or select all visible events."}
                  </span>
                  <div className="calendar-sync-apply-menu">
                    <span className="calendar-sync-selected-count">{selectedImportCandidateIds.length} selected</span>
                    <button
                      aria-expanded={isImportApplyMenuOpen}
                      disabled={selectedImportCandidateIds.length === 0 || isImportBlocked}
                      onClick={() => setIsImportApplyMenuOpen((current) => !current)}
                      type="button"
                    >
                      Apply to selected
                    </button>
                    {isImportApplyMenuOpen ? (
                      <div className="calendar-sync-apply-menu-list" role="menu">
                        <button onClick={() => handleImportBatchType("commitment")} role="menuitem" type="button">Set as commitments</button>
                        <button onClick={() => handleImportBatchType("chore")} role="menuitem" type="button">Set as chores</button>
                        <button onClick={() => applyImportBatchDetailLevel("busy_only")} role="menuitem" type="button">Hide details</button>
                        <button onClick={() => applyImportBatchDetailLevel("full_details")} role="menuitem" type="button">Show details</button>
                      </div>
                    ) : null}
                  </div>
                </div>
                {importCandidatesInRange.length ? (
                  <ul className="calendar-sync-event-list">
                    {importCandidatesInRange.map((candidate) => (
                      <li key={candidate.id}>
                        <label className="calendar-sync-event-check">
                          <input
                            aria-label={`Select ${candidate.title}`}
                            checked={selectedImportCandidateIds.includes(candidate.id)}
                            onChange={() => toggleImportCandidate(candidate.id)}
                            type="checkbox"
                          />
                          <span>
                            <strong>{candidate.title}</strong>
                            <small>{formatInTimeZone(candidate.startsAt, timeZone, "MMM d, h:mm a")} - {formatInTimeZone(candidate.endsAt, timeZone, "h:mm a")}</small>
                            <small className="calendar-sync-share-preview">
                              Clenella shares as <span>{sharedImportTitle(candidate)}</span>
                            </small>
                          </span>
                        </label>
                        <label className="calendar-sync-detail-toggle">
                          <input
                            aria-label={`Hide details for ${candidate.title}`}
                            checked={candidate.detailLevel === "busy_only"}
                            onChange={(event) => updateImportCandidateDetailLevel(candidate.id, event.target.checked ? "busy_only" : "full_details")}
                            type="checkbox"
                          />
                          Hide details
                        </label>
                        <select
                          aria-label={`${candidate.title} import type`}
                          value={candidate.proposedType}
                          onChange={(event) => updateImportCandidateType(candidate.id, event.target.value as CalendarImportCandidate["proposedType"])}
                        >
                          <option value="commitment">Commitment</option>
                          <option value="chore">Chore</option>
                        </select>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-state">
                    {selectedImportSourceCalendarId
                      ? "No Google Calendar events match this range yet."
                      : "Choose a Google Calendar to review events."}
                  </p>
                )}
              </section>
              <div className="form-actions modal-actions">
                <button className="section-action" onClick={() => setSyncModal("closed")} type="button">Cancel</button>
                <button disabled={selectedImportCandidateIds.length === 0 || isImportBlocked} onClick={handleSubmitEventsToCleanly} type="button">Send selected to Clenella</button>
              </div>
            </div>
          )}
          {calendarSyncStatus ? <p role="status" className="section-summary">{calendarSyncStatus}</p> : null}
        </section>
      </div>
    );
  }

  function renderMonthCalendar() {
    const rangeLabel = format(focusDate, "MMMM yyyy");
    const monthWeeks = Array.from({ length: Math.ceil(monthDates.length / 7) }, (_item, index) =>
      monthDates.slice(index * 7, index * 7 + 7)
    );
    return (
      <section className="calendar-month-panel">
        <div className="calendar-desktop-month-surface">
          <div className="calendar-month-grid" role="grid" aria-label={`${rangeLabel} month calendar`}>
            <div className="calendar-month-week calendar-month-week-header" role="row">
              {weekdays.map((weekday) => (
                <div className="calendar-weekday-header" key={weekday.value} role="columnheader">{weekday.label}</div>
              ))}
            </div>
            {monthWeeks.map((weekDatesInMonth) => (
              <div className="calendar-month-week" key={dateKey(weekDatesInMonth[0])} role="row">
                {weekDatesInMonth.map((date) => {
                  const key = dateKey(date);
                  const isCurrentMonth = format(date, "yyyy-MM") === format(focusDate, "yyyy-MM");
                  const { cleanlyEventsForDay, hasAllCompleted, orderedOccurrences } = monthItemsForDate(date);
                  return (
                    <article
                      aria-label={longDateLabel(date)}
                      className={`calendar-day-cell ${isCurrentMonth ? "" : "is-outside-month"} ${hasAllCompleted ? "is-all-completed" : ""} ${key === format(new Date(), "yyyy-MM-dd") ? "is-today" : ""}`}
                      key={key}
                      role="gridcell"
                    >
                      <div className="calendar-day-cell-header">
                        <span>{format(date, "d")}</span>
                        {key === format(new Date(), "yyyy-MM-dd") ? <strong>Today</strong> : null}
                      </div>
                      <div className="calendar-day-active-events">
                        {cleanlyEventsForDay.map((event) => renderCleanlyCalendarEvent(event))}
                        {orderedOccurrences.map((occurrence) => renderMonthOccurrence(occurrence, date))}
                      </div>
                    </article>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {isMobileMonthViewport ? renderMobileMonthCalendar(monthWeeks, rangeLabel) : null}
      </section>
    );
  }

  function renderMobileMonthCalendar(monthWeeks: Date[][], rangeLabel: string) {
    const todayKey = format(new Date(), "yyyy-MM-dd");
    const firstFocusedMonthDate = monthDates.find((date) => format(date, "yyyy-MM") === format(focusDate, "yyyy-MM"));
    const fallbackSelectedDate = monthDates.find((date) => dateKey(date) === todayKey) ?? firstFocusedMonthDate ?? monthDates[0];
    const selectedDate = monthDates.find((date) => dateKey(date) === selectedMobileMonthDateKey) ?? fallbackSelectedDate;
    const selectedDateKey = dateKey(selectedDate);
    const selectedItems = monthItemsForDate(selectedDate);
    const selectedHasItems = selectedItems.itemCount > 0;

    return (
      <div className="calendar-mobile-month-panel">
        <div className="calendar-mobile-month-grid" role="grid" aria-label={`${rangeLabel} mobile month calendar`}>
          <div className="calendar-mobile-month-week calendar-mobile-month-week-header" role="row">
            {weekdays.map((weekday) => (
              <div className="calendar-mobile-weekday-header" key={weekday.value} role="columnheader">{weekday.label.slice(0, 1)}</div>
            ))}
          </div>
          {monthWeeks.map((weekDatesInMonth) => (
            <div className="calendar-mobile-month-week" key={dateKey(weekDatesInMonth[0])} role="row">
              {weekDatesInMonth.map((date) => {
                const key = dateKey(date);
                const isCurrentMonth = format(date, "yyyy-MM") === format(focusDate, "yyyy-MM");
                const { hasAllCompleted, itemCount } = monthItemsForDate(date);
                const isSelected = key === selectedDateKey;
                const itemLabel = `${itemCount} ${itemCount === 1 ? "item" : "items"}`;
                return (
                  <div className="calendar-mobile-month-cell" key={key} role="gridcell">
                    <button
                      aria-label={`Select ${longDateLabel(date)}, ${itemLabel}`}
                      aria-pressed={isSelected}
                      className={`calendar-mobile-day-button ${isCurrentMonth ? "" : "is-outside-month"} ${hasAllCompleted ? "is-all-completed" : ""} ${key === todayKey ? "is-today" : ""}`}
                      onClick={() => selectMobileMonthDate(key)}
                      type="button"
                    >
                      <span className="calendar-mobile-day-number">{format(date, "d")}</span>
                      <span className="calendar-mobile-month-markers" aria-hidden="true">
                        {Array.from({ length: Math.min(itemCount, 3) }, (_item, index) => (
                          <span className="calendar-mobile-month-dot" key={`${key}-dot-${index}`} />
                        ))}
                      </span>
                      {itemCount > 0 ? <span className="calendar-mobile-month-count">{itemCount}</span> : null}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <section className="calendar-mobile-selected-agenda" aria-label="Selected day agenda" ref={mobileMonthAgendaRef}>
          <header className="calendar-mobile-selected-agenda-header">
            <h3>{longDateLabel(selectedDate)}</h3>
            <span>{selectedItems.itemCount} {selectedItems.itemCount === 1 ? "item" : "items"}</span>
          </header>
          <div className="calendar-mobile-selected-agenda-list" aria-live="polite">
            {selectedHasItems ? (
              <>
                {selectedItems.cleanlyEventsForDay.map((event) => renderCleanlyCalendarEvent(event, false))}
                {selectedItems.orderedOccurrences.map((occurrence) => renderOccurrenceCompact(occurrence, selectedDate, "summary"))}
              </>
            ) : (
              <p className="calendar-mobile-selected-agenda-empty">No work scheduled for this day.</p>
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderCalendarColumns(dates: Date[], label: string, density: OccurrenceCardDensity) {
    return (
      <section className={`calendar-column-grid ${dates.length > 1 ? "has-time-rail" : ""}`} aria-label={label} role="grid">
        {dates.length > 1 ? (
          <div className="calendar-time-rail" aria-hidden="true">
            <span className="calendar-time-rail-header-spacer" />
            <span className="calendar-time-rail-anytime-label">Anytime</span>
            <span className="calendar-time-rail-separator" />
            {timedSlots.map((slot, index) => <span key={slot} style={{ gridRow: index + 4 }}>{timeSlotLabel(slot)}</span>)}
          </div>
        ) : null}
        {dates.map((date) => renderCalendarDayColumn(date, density, dates.length === 1))}
      </section>
    );
  }

  function renderCalendarDayColumn(date: Date, density: OccurrenceCardDensity, showSlotLabels: boolean) {
    const key = dateKey(date);
    const occurrencesForDay = occurrenceDateBuckets.get(key) ?? [];
    const completedOccurrences = occurrencesForDay.filter((occurrence) => occurrence.status === "completed");
    const activeOccurrences = occurrencesForDay.filter((occurrence) => occurrence.status !== "completed");
    const orderedOccurrences = [...activeOccurrences, ...completedOccurrences];
    const flexibleOccurrences = orderedOccurrences.filter((occurrence) => occurrence.planningMode === "flexible");
    const cleanlyEventsForDay = cleanlyEventDateBuckets.get(key) ?? [];
    return (
      <section className="calendar-column" key={key}>
        <h3 aria-label={longDateLabel(date)} role="columnheader">{showSlotLabels ? longDateLabel(date) : format(date, "EEE, MMM d")}</h3>
        <div className={`calendar-column-anytime ${showSlotLabels ? "has-slot-label" : ""}`}>
          {showSlotLabels ? <span className="calendar-column-anytime-label">Anytime</span> : null}
          <div className="calendar-column-anytime-main">
            {flexibleOccurrences.map((occurrence) => renderOccurrenceCompact(occurrence, date, density))}
          </div>
        </div>
        <div className="calendar-column-hour-separator has-top-divider" aria-hidden="true" />
        <div className="calendar-column-slots">
          {timedSlots.map((slot) => {
            const timedOccurrences = activeOccurrences.filter((occurrence) =>
              occurrence.plannedStartAt &&
              formatInTimeZone(occurrence.plannedStartAt, timeZone, "HH:mm").startsWith(slot.slice(0, 2))
            );
            const completedTimedOccurrences = completedOccurrences.filter((occurrence) =>
              occurrence.plannedStartAt &&
              formatInTimeZone(occurrence.plannedStartAt, timeZone, "HH:mm").startsWith(slot.slice(0, 2))
            );
            const orderedTimedOccurrences = [...timedOccurrences, ...completedTimedOccurrences];
            const cleanlyEventsForSlot = cleanlyEventsForDay.filter((event) =>
              formatInTimeZone(event.startsAt, timeZone, "HH:mm").startsWith(slot.slice(0, 2))
            );
            return (
              <div
                aria-label={`${longDateLabel(date)} ${slot} time slot`}
                className={`calendar-time-slot ${showSlotLabels ? "" : "hide-slot-label"}`}
                key={`${key}-${slot}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => void handleDrop(slot)}
              >
                {showSlotLabels ? <span>{timeSlotLabel(slot)}</span> : null}
                <div>
                  {cleanlyEventsForSlot.map((event) => renderCleanlyCalendarEvent(event, false))}
                  {orderedTimedOccurrences.map((occurrence) => renderOccurrenceCompact(occurrence, date, density))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  function renderCalendarImportQueue() {
    if (!isOwner || pendingQueueItems.length === 0) return null;
    const stagedCount = queueDecisionDrafts.size;
    const selectedCount = selectedQueueReviewItemIds.length;
    const remainingCount = Math.max(pendingQueueItems.length - stagedCount, 0);

    return (
      <>
        <section className="calendar-import-queue" aria-labelledby="calendar-import-queue-heading" role="region" aria-label="Calendar import queue">
          <div className="calendar-queue-entry-copy">
            <p className="eyebrow">Owner review</p>
            <h2 id="calendar-import-queue-heading">Calendar imports need review</h2>
            <p>Approve or reject imported events sent by family members.</p>
          </div>
          <span className="calendar-queue-review-button-wrap">
            <button className="section-action" onClick={openQueueReviewModal} type="button">Review imports</button>
            <span className="calendar-queue-badge" aria-label={`${pendingQueueItems.length} imports need review`}>{pendingQueueItems.length}</span>
          </span>
        </section>
        {isQueueReviewOpen ? (
          <div
            className="calendar-sync-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setIsQueueRangeOpen(false);
                setIsQueueBulkApprovalMenuOpen(false);
                setQueueApprovalMenuOpenId(undefined);
                setIsQueueReviewOpen(false);
              }
            }}
            role="presentation"
          >
            <section className="calendar-sync-modal calendar-queue-review-modal" aria-label="Review calendar imports" role="dialog">
              <div className="modal-heading">
                <div>
                  <p className="eyebrow">Owner review</p>
                  <h2>Review calendar imports</h2>
                </div>
                <button aria-label="Close dialog" className="modal-close-button" onClick={() => setIsQueueReviewOpen(false)} type="button">x</button>
              </div>
              <div className="calendar-sync-filter-strip" aria-label="Queue review settings">
                <span><strong>From</strong></span>
                <label>
                  <span className="sr-only">Submitted by</span>
                  <select
                    aria-label="Submitted by"
                    onChange={(event) => {
                      setSelectedQueueSubmitterId(event.target.value);
                      setSelectedQueueReviewItemIds([]);
                    }}
                    value={selectedQueueSubmitterId}
                  >
                    <option value="all">All family members</option>
                    {members.map((member) => (
                      <option key={member.userId} value={member.userId}>{memberLabel(member)}</option>
                    ))}
                  </select>
                </label>
                <span className="calendar-sync-filter-spacer" aria-hidden="true" />
                <span className="calendar-sync-range-count">{visibleQueueItems.length} in range</span>
                <button
                  aria-controls="queue-review-range-popover"
                  aria-expanded={isQueueRangeOpen}
                  className="calendar-sync-date-trigger"
                  onClick={() => setIsQueueRangeOpen((current) => !current)}
                  type="button"
                >
                  {formatInTimeZone(`${queueRange.startOn}T00:00:00.000Z`, "UTC", "MMM d")} - {formatInTimeZone(`${queueRange.endOn}T00:00:00.000Z`, "UTC", "MMM d")}
                </button>
                {isQueueRangeOpen ? (
                  <div className="calendar-sync-range-popover" id="queue-review-range-popover" role="dialog" aria-label="Queue date range">
                    <div className="calendar-sync-range-popover-heading">
                      <div>
                        <p className="eyebrow">Date range</p>
                        <h3>Choose imports to review</h3>
                      </div>
                      <span>{formatInTimeZone(`${queueRange.startOn}T00:00:00.000Z`, "UTC", "MMM d")} - {formatInTimeZone(`${queueRange.endOn}T00:00:00.000Z`, "UTC", "MMM d")}</span>
                    </div>
                    <DateRangePicker
                      idPrefix="queue-review-range"
                      label="Queue date range"
                      onPresetChange={(nextPreset, nextRange) => {
                        setQueueRangePreset(nextPreset);
                        setQueueRange(nextRange);
                        setSelectedQueueReviewItemIds([]);
                        if (nextPreset !== "custom") setIsQueueRangeOpen(false);
                      }}
                      onRangeChange={(nextRange) => {
                        setQueueRangePreset("custom");
                        setQueueRange(nextRange);
                        setSelectedQueueReviewItemIds([]);
                      }}
                      preset={queueRangePreset}
                      range={queueRange}
                      variant="panel"
                      visibleRange={visibleRange}
                    />
                  </div>
                ) : null}
              </div>
              <div className="calendar-queue-filter-row" aria-label="Queue filters">
                {[
                  { label: "Pending", value: "all" },
                  { label: "Chores", value: "chore" },
                  { label: "Commitments", value: "commitment" },
                  { label: "Full details", value: "full_details" },
                  { label: "Busy only", value: "busy_only" }
                ].map((filter) => (
                  <button
                    aria-pressed={queueReviewFilter === filter.value}
                    className="section-action"
                    key={filter.value}
                    onClick={() => setQueueReviewFilter(filter.value as typeof queueReviewFilter)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <div className="calendar-sync-selection-line">
                <span><strong>{selectedCount} selected.</strong> Stage decisions now, or open one row at a time.</span>
                <div className="calendar-sync-apply-menu">
                  <span className="calendar-queue-selection-controls">
                    <button className="calendar-queue-selection-button" onClick={selectVisibleQueueReviewItems} type="button">Select all visible</button>
                    <button className="calendar-queue-selection-button" disabled={!selectedCount} onClick={clearQueueReviewSelection} type="button">Clear selection</button>
                  </span>
                  <span className="calendar-queue-bulk-decision-controls">
                    <button className="section-action" disabled={!selectedCount} onClick={() => stageSelectedQueueDecision("reject", "chore")} type="button">Reject selected</button>
                    <span className="calendar-queue-approve-split is-bulk">
                      <button disabled={!selectedCount} onClick={() => stageSelectedQueueDecision("approve", "chore")} type="button">Approve selected</button>
                      <button
                        aria-expanded={isQueueBulkApprovalMenuOpen}
                        aria-label="Approval options for selected imports"
                        className="calendar-queue-approve-menu-button"
                        disabled={!selectedCount}
                        onClick={() => setIsQueueBulkApprovalMenuOpen((current) => !current)}
                        type="button"
                      >
                        <span className="calendar-queue-chevron" aria-hidden="true" />
                      </button>
                      {isQueueBulkApprovalMenuOpen ? (
                        <span className="calendar-queue-approve-menu" role="menu">
                          <button onClick={() => stageSelectedQueueDecision("approve", "chore")} role="menuitem" type="button">Approve as chore</button>
                          <button onClick={() => stageSelectedQueueDecision("approve", "commitment")} role="menuitem" type="button">Approve as commitment</button>
                        </span>
                      ) : null}
                    </span>
                  </span>
                </div>
              </div>
              <div className="calendar-queue-review-list">
                {visibleQueueItems.map((item) => {
                  const draft = queueDecisionDrafts.get(item.id);
                  const isApprovalMenuOpen = queueApprovalMenuOpenId === item.id;
                  return (
                    <article className="calendar-queue-review-row" key={item.id}>
                      <input
                        aria-label={`Select ${item.privacyTitle}`}
                        checked={selectedQueueReviewItemIds.includes(item.id)}
                        onChange={() => toggleQueueReviewSelection(item.id)}
                        type="checkbox"
                      />
                      <span className="calendar-queue-event-copy">
                        <strong>{item.privacyTitle}</strong>
                        <span>{formatInTimeZone(item.startsAt, timeZone, "MMM d, h:mm a")} - {formatInTimeZone(item.endsAt, timeZone, "h:mm a")} / {item.submittedByName} / {item.detailLevel === "busy_only" ? "Busy only" : "Full details"} / submitted as {item.proposedType}</span>
                      </span>
                      <span className="calendar-queue-decision-actions">
                        {draft ? (
                          <>
                            <span className={`calendar-queue-decision-chip is-${draft.decision}`}>
                              {draft.decision === "approve" ? `Approved as ${draft.proposedType}` : "Rejected"}
                            </span>
                            <span className="calendar-queue-approve-split">
                              <button
                                aria-expanded={isApprovalMenuOpen}
                                aria-label={`Edit decision for ${item.privacyTitle}`}
                                className="section-action"
                                onClick={() => setQueueApprovalMenuOpenId((current) => current === item.id ? undefined : item.id)}
                                type="button"
                              >
                                Edit
                              </button>
                              {isApprovalMenuOpen ? (
                                <span className="calendar-queue-approve-menu" role="menu">
                                  <button onClick={() => stageQueueDecision(item, "approve", "chore")} role="menuitem" type="button">Approve as chore</button>
                                  <button onClick={() => stageQueueDecision(item, "approve", "commitment")} role="menuitem" type="button">Approve as commitment</button>
                                  <button onClick={() => stageQueueDecision(item, "reject", item.proposedType)} role="menuitem" type="button">Reject</button>
                                  <button onClick={() => clearQueueDecision(item.id)} role="menuitem" type="button">Clear decision</button>
                                </span>
                              ) : null}
                            </span>
                          </>
                        ) : (
                          <>
                            <button className="section-action" onClick={() => stageQueueDecision(item, "reject", item.proposedType)} type="button">Reject</button>
                            <span className="calendar-queue-approve-split">
                              <button onClick={() => stageQueueDecision(item, "approve", item.proposedType)} type="button">Approve</button>
                              <button
                                aria-expanded={isApprovalMenuOpen}
                                aria-label={`Approval options for ${item.privacyTitle}`}
                                className="calendar-queue-approve-menu-button"
                                onClick={() => setQueueApprovalMenuOpenId((current) => current === item.id ? undefined : item.id)}
                                type="button"
                              >
                                <span className="calendar-queue-chevron" aria-hidden="true" />
                              </button>
                              {isApprovalMenuOpen ? (
                                <span className="calendar-queue-approve-menu" role="menu">
                                  <button onClick={() => stageQueueDecision(item, "approve", "chore")} role="menuitem" type="button">Approve as chore</button>
                                  <button onClick={() => stageQueueDecision(item, "approve", "commitment")} role="menuitem" type="button">Approve as commitment</button>
                                </span>
                              ) : null}
                            </span>
                          </>
                        )}
                      </span>
                    </article>
                  );
                })}
              </div>
              <footer className="calendar-queue-review-footer">
                <span><strong>{stagedCount} decision{stagedCount === 1 ? "" : "s"} staged.</strong> {remainingCount} import{remainingCount === 1 ? "" : "s"} still need review.</span>
                <div className="form-actions">
                  <button className="section-action" onClick={() => setIsQueueReviewOpen(false)} type="button">Cancel</button>
                  <button disabled={!stagedCount} onClick={() => void submitQueueDecisionDrafts()} type="button">
                    Submit {stagedCount} decision{stagedCount === 1 ? "" : "s"}
                  </button>
                </div>
              </footer>
            </section>
          </div>
        ) : (
          null
        )}
      </>
    );
  }

  if (isLoading) return <div className="calendar-page operational-page"><p>Loading calendar...</p></div>;

  if (!selectedHousehold) {
    return (
      <div className="calendar-page operational-page">
        <header className="page-command-header">
          <div>
            <p className="eyebrow">Calendar</p>
            <h1>Calendar</h1>
            <p className="lede">Calendar planning starts once you belong to a household.</p>
          </div>
        </header>
        <section className="setup-empty-state first-home-empty-state" aria-labelledby="calendar-empty-heading">
          <div>
            <p className="eyebrow">No household yet</p>
            <h2 id="calendar-empty-heading">Add or join a household</h2>
            <p>Once you belong to a household, you can schedule chores, import events, and review shared calendar work.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="calendar-page operational-page">
      <header className="page-command-header">
        <div>
          <h1>Calendar</h1>
          <div className="command-metrics" aria-label="Calendar status summary">
            <span>{selectedHousehold?.name ?? "No household"}</span>
            <span>{periodLabel}</span>
            <span>{visibleOccurrences.filter((occurrence) => occurrence.status !== "completed").length} open</span>
            <span>{visibleOccurrences.filter((occurrence) => occurrence.status === "completed").length} completed</span>
          </div>
        </div>
        {!isExportMode ? (
          <div className="calendar-header-actions" aria-label="Calendar header actions">
            <button onClick={(event) => openCreateEditor(event.currentTarget)} type="button">Add event</button>
            <div
              className="calendar-actions-menu"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                setIsCalendarActionsOpen(false);
                calendarActionsButtonRef.current?.focus();
              }}
            >
              <button
                ref={calendarActionsButtonRef}
                aria-controls="calendar-actions-menu"
                aria-expanded={isCalendarActionsOpen}
                aria-haspopup="true"
                className="section-action calendar-actions-menu-trigger"
                onClick={() => setIsCalendarActionsOpen((isOpen) => !isOpen)}
                type="button"
              >
                Calendar actions
              </button>
              {isCalendarActionsOpen ? (
                <div className="calendar-actions-popover" id="calendar-actions-menu" role="region" aria-label="Calendar actions menu">
                  <button onClick={openImportModal} type="button">Import events</button>
                  <button onClick={startExportMode} type="button">Export events</button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>
      {calendarSyncStatus && syncModal === "closed" ? <p role="status" className="section-summary">{calendarSyncStatus}</p> : null}
      {!isExportMode ? renderCalendarImportQueue() : null}
      {renderCalendarSyncModal()}
      {isExportMode ? (
        <section className="calendar-export-mode-banner" role="status">
          <span>Export mode: choose a range, select eligible events, then export to your calendar.</span>
          <button className="section-action" onClick={exitExportMode} type="button">Exit export mode</button>
        </section>
      ) : null}

      <section className="calendar-workspace-shell has-external-tabs" aria-label="Calendar workspace">
            <div className="calendar-workspace-panel-header">
              <nav className="calendar-workspace-tabs" role="tablist" aria-label="Workspace view">
                {(["calendar", "list"] as WorkspaceView[]).map((option) => (
                  <button
                    aria-selected={workspaceView === option}
                    key={option}
                    onClick={() => setWorkspaceView(option)}
                    role="tab"
                    type="button"
                  >
                    {capitalize(option)}
                  </button>
                ))}
              </nav>
            </div>

            <div className="panel calendar-workspace-panel">
            <section className="calendar-control-panel" aria-label="Calendar controls">
              {workspaceView === "calendar" ? (
                <div className="calendar-command-row">
                  <section className={`calendar-view-toggle ${isMobileMonthViewport ? "is-mobile-full-width" : ""}`} aria-label="Calendar scale">
                    {scaleOptions.map((option) => (
                      <button aria-pressed={calendarScale === option} key={option} onClick={() => setCalendarScale(option)} type="button">
                        {capitalize(option)}
                      </button>
                    ))}
                  </section>
                  <div className="calendar-period-controls">
                    <button aria-label={`Previous ${periodUnit}`} className="section-action calendar-period-button" onClick={() => moveFocusDate(-1)} type="button">
                      <ChevronIcon direction="previous" />
                    </button>
                    <strong>{periodLabel}</strong>
                    <button aria-label={`Next ${periodUnit}`} className="section-action calendar-period-button" onClick={() => moveFocusDate(1)} type="button">
                      <ChevronIcon direction="next" />
                    </button>
                  </div>
                </div>
              ) : null}

              <section className="calendar-work-legend" aria-label="Calendar item types">
                <span className="calendar-legend-item is-chore">
                  <span aria-hidden="true" />
                  Chores
                </span>
                <span className="calendar-legend-item is-commitment">
                  <span aria-hidden="true" />
                  Commitments
                </span>
              </section>

              <section className={`calendar-filter-card ${isMobileMonthViewport ? "is-mobile" : ""} ${isMobileMonthViewport && !isCalendarFiltersOpen ? "is-collapsed" : ""}`} aria-label="Calendar filters">
                {!isMobileMonthViewport ? <h2>Filters</h2> : null}
                {isMobileMonthViewport ? (
                  <button
                    aria-controls="calendar-filter-panel"
                    aria-expanded={isCalendarFiltersOpen}
                    className="calendar-filter-toggle"
                    onClick={() => setIsCalendarFiltersOpen((isOpen) => !isOpen)}
                    type="button"
                  >
                    <FilterIcon />
                    Filters
                  </button>
                ) : null}
                {!isMobileMonthViewport || isCalendarFiltersOpen ? (
                  <div className="calendar-filter-panel" id="calendar-filter-panel">
                    <label>
                      Household
                      <select value={selectedHousehold.id} onChange={(event) => setFilters((current) => ({ ...current, householdId: event.target.value, assignedUserId: undefined }))}>
                        {households.map((household) => <option key={household.id} value={household.id}>{household.name}</option>)}
                      </select>
                    </label>
                    <label>
                      Member
                      <select value={filters.assignedUserId ?? ""} onChange={(event) => setFilters((current) => ({ ...current, assignedUserId: event.target.value || undefined }))}>
                        <option value="">Everyone</option>
                        {members.map((member) => <option key={member.userId} value={member.userId}>{memberLabel(member)}</option>)}
                      </select>
                    </label>
                    <label>
                      Status
                      <select value={filters.status ?? "all"} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                        <option value="all">All work</option>
                        <option value="planned">Planned</option>
                        <option value="completed">Completed</option>
                        <option value="skipped">Skipped</option>
                      </select>
                    </label>
                    <label>
                      Planning mode
                      <select value={filters.planningMode ?? "all"} onChange={(event) => setFilters((current) => ({ ...current, planningMode: event.target.value }))}>
                        <option value="all">All</option>
                        <option value="timed">Timed</option>
                        <option value="flexible">Anytime</option>
                      </select>
                    </label>
                  </div>
                ) : null}
              </section>
            </section>

            <div className={isExportMode ? "calendar-export-layout" : "calendar-export-layout is-standard"}>
              {isExportMode ? (
                <CalendarExportPreselectPanel
                  eligibleEvents={eligibleExportEvents}
                  preferences={calendarPreferences}
                  range={exportRange}
                  rangePreset={exportRangePreset}
                  selectedEventIds={selectedExportEventIds}
                  visibleRange={visibleRange}
                  onClearSelection={() => setSelectedExportEventIds([])}
                  onExportContentChange={(mode) => {
                    if (!calendarPreferences) return;
                    saveCalendarPreference({
                      ...calendarPreferences,
                      exportContentMode: mode
                    });
                    setShouldApplyExportPreselect(true);
                  }}
                  onRangeChange={(nextRange) => {
                    setExportRangePreset("custom");
                    setExportRange(nextRange);
                    setShouldApplyExportPreselect(true);
                  }}
                  onRangePresetChange={(nextPreset, nextRange) => {
                    setExportRangePreset(nextPreset);
                    setExportRange(nextRange);
                    setShouldApplyExportPreselect(true);
                  }}
                />
              ) : null}

              <div className="calendar-export-calendar-surface">
                {loadState === "error" ? <section className="calendar-empty-state">Could not load scheduled chores.</section> : null}

                {workspaceView === "calendar" && loadState === "ready" ? (
                  <div className="calendar-workspace-content">
                    {calendarScale === "month" ? (
                      renderMonthCalendar()
                    ) : calendarScale === "week" ? (
                      renderCalendarColumns(weekDates, `Week of ${format(weekDates[0], "MMM d, yyyy")}`, "title")
                    ) : (
                      renderCalendarColumns([focusDate], `${longDateLabel(focusDate)} day calendar`, "summary")
                    )}
                  </div>
                ) : null}

                {workspaceView === "list" ? (
                  <section className="calendar-list-group calendar-agenda" aria-label="Chore agenda">
                  <div className="agenda-header">
                    <div>
                      <p className="eyebrow">Agenda</p>
                      <h2>Upcoming and completed work</h2>
                    </div>
                    <div className="agenda-summary" aria-label="Agenda summary">
                      <span>{listStatusCounts.planned} planned</span>
                      <span>{listStatusCounts.completed} completed</span>
                      <span>{listStatusCounts.skipped} skipped</span>
                    </div>
                  </div>
                  {listGroups.map(([date, dateOccurrences]) => (
                    <section className="calendar-list-day" key={date}>
                      <h3>{format(parseISO(date), "EEEE, MMM d")}</h3>
                      <div className="calendar-list-day-items">
                        {orderCompletedLast(dateOccurrences)
                          .map((occurrence) => renderAgendaOccurrence(occurrence, parseISO(date)))}
                      </div>
                    </section>
                  ))}
                  </section>
                ) : null}
              </div>

              {isExportMode ? (
                <CalendarExportReviewPanel
                  eligibleEvents={eligibleExportEvents}
                  externalCalendars={externalCalendars}
                  preferences={calendarPreferences}
                  selectedEventIds={selectedExportEventIds}
                  onDestinationCalendarChange={(calendarId) => {
                    if (!calendarPreferences) return;
                    saveCalendarPreference({
                      ...calendarPreferences,
                      destinationExternalCalendarId: calendarId || undefined
                    });
                  }}
                  onExport={handleExportCleanlyEvents}
                />
              ) : null}

            </div>
            </div>
          </section>

          {editorMode !== "closed" && editorDraft ? (
            <div
              className={`chore-editor-backdrop ${editorMode === "view" ? "is-detail-view is-centered-detail-view" : ""}`}
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) closeChoreEditor();
              }}
              role="presentation"
            >
              <form
                aria-label={editorMode === "create" ? "New chore" : editorMode === "view" ? "Chore details" : "Edit chore"}
                aria-modal="true"
                className={`chore-editor-modal ${editorMode === "view" ? "is-detail-view" : ""}`}
                ref={choreEditorModalRef}
                role="dialog"
                onSubmit={(event) => {
                  if (editorMode === "create") {
                    void saveCreate(event);
                    return;
                  }
                  if (editorMode === "edit") {
                    event.preventDefault();
                    void handleScheduleSeriesSave();
                    return;
                  }
                  event.preventDefault();
                }}
              >
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">{editorMode === "create" ? "New chore" : editorMode === "view" ? "Chore details" : "Edit chore"}</p>
                    <h2>{editorMode === "create" ? "Chore Details" : editorDraft.title}</h2>
                  </div>
                  <button aria-label="Close dialog" className="icon-button modal-close-button" onClick={closeChoreEditor} type="button" />
                </div>
                {editorMode === "view" && selectedOccurrence ? (
                  <section className="chore-view-details">
                    {completionCheckIn ? (
                      <>
                        <section className="completion-check-in" aria-label="Completion check-in">
                          <h3>Before completing</h3>
                          <label className="checkbox-field">
                            <input
                              checked={completionCheckIn.completedOnTime}
                              onChange={(event) => setCompletionCheckIn({ ...completionCheckIn, completedOnTime: event.target.checked })}
                              type="checkbox"
                            />
                            This was done on time
                          </label>
                          <label className="checkbox-field">
                            <input
                              checked={completionCheckIn.durationAccurate}
                              onChange={(event) => setCompletionCheckIn({ ...completionCheckIn, durationAccurate: event.target.checked })}
                              type="checkbox"
                            />
                            The estimated duration still feels accurate
                          </label>
                          {selectedOccurrenceCanRebaseFuture() ? (
                            <label className="checkbox-field">
                              <input
                                checked={completionCheckIn.rebaseFutureOccurrences}
                                onChange={(event) => setCompletionCheckIn({ ...completionCheckIn, rebaseFutureOccurrences: event.target.checked })}
                                type="checkbox"
                              />
                              Base future occurrences on this completion date
                            </label>
                          ) : null}
                        </section>
                        <section className="schedule-accordion">
                          <button
                            aria-expanded={scheduleAccordionOpen}
                            className="schedule-accordion-summary"
                            onClick={() => setScheduleAccordionOpen((isOpen) => !isOpen)}
                            type="button"
                          >
                            <span>
                              <strong>Chore details</strong>
                              <span>{`${editorDraft.title} · ${occurrenceDateLine(selectedOccurrence)} · ${assignedMemberLabel(selectedOccurrence)}`}</span>
                            </span>
                            <span>{scheduleAccordionOpen ? "Hide details" : "Show details"}</span>
                          </button>
                          {scheduleAccordionOpen ? (
                            <div className="schedule-accordion-body chore-details-drawer-body">
                              {renderChoreViewDetailSections()}
                            </div>
                          ) : null}
                        </section>
                      </>
                    ) : (
                      renderChoreViewDetailSections()
                    )}
                  </section>
                ) : null}
                {editorMode !== "view" ? (
                  <>
                <div className="field-grid aligned-field-grid">
                  <label className="aligned-field">
                    Chore title
                    <input disabled={editorMode === "edit"} value={editorDraft.title} onChange={(event) => setEditorDraft({ ...editorDraft, title: event.target.value })} required />
                    {editorMode === "create" || editorMode === "edit" ? <span className="field-help-placeholder" aria-hidden="true" /> : null}
                  </label>
                  <label className="aligned-field">
                    Tags
                    <input
                      aria-describedby={editorMode === "create" ? "chore-tags-help" : undefined}
                      disabled={editorMode === "edit"}
                      value={editorDraft.tags}
                      onChange={(event) => setEditorDraft({ ...editorDraft, tags: event.target.value })}
                    />
                    {editorMode === "create" ? (
                      <span className="field-help" id="chore-tags-help">Optional labels like bathroom, outdoor, or deep clean. Tags help group chores and give optimization more context.</span>
                    ) : null}
                  </label>
                </div>
                <label>
                  Instructions
                  <textarea
                    aria-describedby={editorMode === "create" ? "chore-instructions-help" : undefined}
                    disabled={editorMode === "edit"}
                    value={editorDraft.instructions}
                    onChange={(event) => setEditorDraft({ ...editorDraft, instructions: event.target.value })}
                  />
                  {editorMode === "create" ? (
                    <span className="field-help" id="chore-instructions-help">Add steps, scope, or preferences. This helps future optimization understand what the chore includes.</span>
                  ) : null}
                </label>
                {editorDraft.schedules[0] ? (
                  <section className="create-schedule-panel" aria-label="Chore schedule">
                    <div className="panel-heading">
                      <div>
                        <p className="eyebrow">Schedule</p>
                        <h3>When should this happen?</h3>
                        <p className="section-help">Choose the first date, optional timing, owner, and whether this chore repeats.</p>
                      </div>
                    </div>
                    <div className="field-grid aligned-field-grid">
                      <label className="aligned-field">
                        Date
                        <input
                          disabled={editorMode === "edit" && !isOwner}
                          type="date"
                          value={editorDraft.schedules[0].startsOn}
                          onChange={(event) => updatePrimarySchedule({
                            startsOn: event.target.value,
                            recurrence: {
                              ...editorDraft.schedules[0].recurrence,
                              ...(editorDraft.schedules[0].recurrence.frequency === "monthly"
                                ? {
                                    monthlyDay: parseISO(event.target.value).getDate(),
                                    monthlyWeek: weekOfMonth(event.target.value),
                                    monthlyWeekday: weekdayIndex(event.target.value)
                                  }
                                : {})
                            }
                          })}
                        />
                        <span className="field-help-placeholder" aria-hidden="true" />
                      </label>
                      <label className="aligned-field">
                        Assignee
                        <select
                          disabled={editorMode === "edit" && !isOwner}
                          value={editorDraft.schedules[0].assignment.memberUserIds[0] ?? ""}
                          onChange={(event) => updatePrimarySchedule({ assignment: { mode: "fixed", memberUserIds: [event.target.value] } })}
                        >
                          {members.map((member) => <option key={member.userId} value={member.userId}>{memberLabel(member)}</option>)}
                        </select>
                        <span className="field-help-placeholder" aria-hidden="true" />
                      </label>
                      <label className="aligned-field">
                        Start time (optional)
                        <input
                          aria-describedby="chore-start-time-help"
                          disabled={editorMode === "edit" && !isOwner}
                          type="time"
                          value={editorDraft.schedules[0].planningMode === "timed" ? editorDraft.schedules[0].localStartTime : editorDraft.startTime}
                          onChange={(event) => {
                            if (editorDraft.schedules[0].planningMode === "timed") {
                              updatePrimarySchedule({
                                localStartTime: event.target.value,
                                localEndTime: timeAfterMinutes(event.target.value, minutesBetween(editorDraft.schedules[0].localStartTime, editorDraft.schedules[0].localEndTime))
                              });
                            } else {
                              setEditorDraft({ ...editorDraft, startTime: event.target.value });
                            }
                          }}
                        />
                        <span className="field-help" id="chore-start-time-help">Leave blank if this can be done anytime on the selected day.</span>
                      </label>
                      <label className="aligned-field">
                        Estimated duration
                        <input
                          aria-describedby="chore-duration-help"
                          disabled={editorMode === "edit" && !isOwner}
                          min="1"
                          type="number"
                          value={editorDraft.schedules[0].planningMode === "flexible"
                            ? editorDraft.schedules[0].estimatedMinutes
                            : minutesBetween(editorDraft.schedules[0].localStartTime, editorDraft.schedules[0].localEndTime)}
                          onChange={(event) => {
                            const minutes = Number(event.target.value);
                            if (editorDraft.schedules[0].planningMode === "timed") {
                              updatePrimarySchedule({ localEndTime: timeAfterMinutes(editorDraft.schedules[0].localStartTime, minutes) });
                            } else {
                              updatePrimarySchedule({ estimatedMinutes: minutes });
                            }
                          }}
                        />
                        <span className="field-help" id="chore-duration-help">Used for flexible chores. If you add a start time, the end time is calculated from this duration.</span>
                      </label>
                    </div>
                    <div className="repeat-segmented-field">
                      <span className="sr-only">Repeat</span>
                      <div className="segmented-control" aria-label="Repeat">
                        <button
                          aria-pressed={editorDraft.schedules[0].recurrence.frequency === "one_time"}
                          disabled={editorMode === "edit" && !isOwner}
                          onClick={() => updatePrimaryRecurrenceFrequency("one_time")}
                          type="button"
                        >
                          Does not repeat
                        </button>
                        <button
                          aria-pressed={editorDraft.schedules[0].recurrence.frequency !== "one_time"}
                          disabled={editorMode === "edit" && !isOwner}
                          onClick={() => updatePrimaryRecurrenceFrequency(editorDraft.schedules[0].recurrence.frequency === "one_time" ? "daily" : editorDraft.schedules[0].recurrence.frequency)}
                          type="button"
                        >
                          Repeats
                        </button>
                      </div>
                    </div>
                  </section>
                ) : null}
                {editorDraft.schedules[0] && editorDraft.schedules[0].recurrence.frequency !== "one_time" ? (
                  <div className="recurrence-panel">
                    <div className="recurrence-sentence">
                      <span>Repeats every</span>
                      <label>
                        <span className="sr-only">Repeat interval</span>
                        <input
                          aria-label="Repeat interval"
                          disabled={editorMode === "edit" && !isOwner}
                          min="1"
                          type="number"
                          value={editorDraft.schedules[0].recurrence.interval}
                          onChange={(event) => updatePrimarySchedule({
                            recurrence: {
                              ...editorDraft.schedules[0].recurrence,
                              interval: Number(event.target.value)
                            }
                          })}
                        />
                      </label>
                      <label>
                        <span className="sr-only">Repeat unit</span>
                        <select
                          aria-label="Repeat unit"
                          disabled={editorMode === "edit" && !isOwner}
                          value={editorDraft.schedules[0].recurrence.frequency}
                          onChange={(event) => updatePrimaryRecurrenceFrequency(event.target.value as ScheduleInput["recurrence"]["frequency"])}
                        >
                          <option value="daily">day(s)</option>
                          <option value="weekly">week(s)</option>
                          <option value="monthly">month(s)</option>
                          <option value="yearly">year(s)</option>
                        </select>
                      </label>
                    </div>
                    {editorDraft.schedules[0].recurrence.frequency === "weekly" ? (
                      <fieldset className="schedule-assignees">
                        <legend>Days</legend>
                        {weekdays.map((weekday) => (
                          <label className="checkbox-field" key={weekday.value}>
                            <input
                              checked={Boolean(editorDraft.schedules[0].recurrence.weekDays?.includes(weekday.value))}
                              disabled={editorMode === "edit" && !isOwner}
                              onChange={(event) => {
                                const currentDays = editorDraft.schedules[0].recurrence.weekDays ?? [];
                                updatePrimarySchedule({
                                  recurrence: {
                                    ...editorDraft.schedules[0].recurrence,
                                    weekDays: event.target.checked
                                      ? [...new Set([...currentDays, weekday.value])].sort()
                                      : currentDays.filter((day) => day !== weekday.value)
                                  }
                                });
                              }}
                              type="checkbox"
                            />
                            {weekday.label}
                          </label>
                        ))}
                      </fieldset>
                    ) : null}
                    {editorDraft.schedules[0].recurrence.frequency === "monthly" ? (
                      <fieldset className="schedule-assignees">
                        <legend>Monthly pattern</legend>
                        <label className="checkbox-field">
                          <input
                            checked={(editorDraft.schedules[0].recurrence.monthlyPattern ?? "day_of_month") === "day_of_month"}
                            disabled={editorMode === "edit" && !isOwner}
                            name="monthly-pattern"
                            onChange={() => updatePrimarySchedule({
                              recurrence: {
                                ...editorDraft.schedules[0].recurrence,
                                monthlyPattern: "day_of_month",
                                monthlyDay: parseISO(editorDraft.schedules[0].startsOn).getDate(),
                                monthlyWeek: undefined,
                                monthlyWeekday: undefined
                              }
                            })}
                            type="radio"
                          />
                          On day {parseISO(editorDraft.schedules[0].startsOn).getDate()} of the month
                        </label>
                        <label className="checkbox-field">
                          <input
                            checked={editorDraft.schedules[0].recurrence.monthlyPattern === "weekday_of_month"}
                            disabled={editorMode === "edit" && !isOwner}
                            name="monthly-pattern"
                            onChange={() => updatePrimarySchedule({
                              recurrence: {
                                ...editorDraft.schedules[0].recurrence,
                                monthlyPattern: "weekday_of_month",
                                monthlyDay: undefined,
                                monthlyWeek: weekOfMonth(editorDraft.schedules[0].startsOn),
                                monthlyWeekday: weekdayIndex(editorDraft.schedules[0].startsOn)
                              }
                            })}
                            type="radio"
                          />
                          On the {monthlyWeekdayLabel(editorDraft.schedules[0].startsOn)}
                        </label>
                      </fieldset>
                    ) : null}
                  </div>
                ) : null}
                {editorMode === "edit" && !isOwner ? (
                  <p className="empty-state">Schedule details are available for review. Only household owners can change the schedule.</p>
                ) : null}
                  </>
                ) : null}
                {editorStatus ? <p role="status">{editorStatus}</p> : null}
                {editorMode === "view" && selectedOccurrence ? (
                  <div className="form-actions modal-actions">
                    <button className="section-action" onClick={closeChoreEditor} type="button">Close</button>
                    <div className="modal-action-group">
                      {completionCheckIn ? (
                        <button onClick={() => void handleComplete(selectedOccurrence, completionCheckIn)} type="button">Submit</button>
                      ) : (
                        <>
                          {selectedOccurrence.status === "planned" && selectedOccurrence.assignedUserId === currentUserId ? (
                          <button className="section-action" onClick={startCompletionCheckIn} type="button">Complete chore</button>
                          ) : null}
                          <button onClick={(event) => openEditEditor(selectedOccurrence, event.currentTarget)} type="button">Edit</button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="form-actions modal-actions">
                    <button className="section-action" onClick={closeChoreEditor} type="button">Cancel</button>
                    {editorMode === "create" || editorMode === "edit" ? <button type="submit">{editorMode === "create" ? "Add event" : "Save changes"}</button> : null}
                    {editorMode === "edit" && selectedOccurrence ? <button className="section-action" onClick={() => void handleSkip()} type="button">Skip occurrence</button> : null}
                  </div>
                )}
              </form>
            </div>
          ) : null}
          {selectedCleanlyCalendarEvent ? (
            <div
              className="chore-editor-backdrop is-detail-view is-centered-detail-view"
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) closeCleanlyCalendarEventDetail();
              }}
              role="presentation"
            >
              <section
                aria-label="Calendar event details"
                aria-modal="true"
                className="chore-editor-modal calendar-event-detail-modal is-detail-view"
                ref={cleanlyEventModalRef}
                role="dialog"
                tabIndex={-1}
              >
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Calendar event details</p>
                    <h2>{selectedCleanlyCalendarEvent.privacyTitle}</h2>
                  </div>
                  <button
                    aria-label="Close dialog"
                    className="icon-button modal-close-button"
                    onClick={closeCleanlyCalendarEventDetail}
                    type="button"
                  />
                </div>
                <div className="chore-detail-meta-grid">
                  <div>
                    <span>When</span>
                    <strong>
                      {formatInTimeZone(selectedCleanlyCalendarEvent.startsAt, timeZone, "MMM d, h:mm a")} - {formatInTimeZone(selectedCleanlyCalendarEvent.endsAt, timeZone, "h:mm a")}
                    </strong>
                  </div>
                  <div>
                    <span>Duration</span>
                    <strong>{eventDurationLabel(selectedCleanlyCalendarEvent)}</strong>
                  </div>
                  <div>
                    <span>Source</span>
                    <strong>{cleanlyEventSourceLabel(selectedCleanlyCalendarEvent)}</strong>
                  </div>
                  <div>
                    <span>Imported by</span>
                    <strong>{memberDisplayName(selectedCleanlyCalendarEvent.createdByUserId)}</strong>
                  </div>
                </div>
                <div className="form-actions modal-actions">
                  <button className="section-action" onClick={closeCleanlyCalendarEventDetail} type="button">Close</button>
                </div>
              </section>
            </div>
          ) : null}
    </div>
  );
}
