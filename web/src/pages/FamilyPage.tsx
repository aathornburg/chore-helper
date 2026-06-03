import { addDays, endOfWeek, format, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AppUserProfile,
  ChoreOccurrence,
  HouseholdAppData,
  HouseholdInvitation,
  HouseholdMemberSummary
} from "@chore-helper/shared";
import {
  cancelHouseholdInvitation,
  getCurrentUser,
  inviteHouseholdMember,
  listHouseholdInvitations,
  listHouseholdMembers,
  listOccurrences,
  removeHouseholdMember,
  updateHouseholdMemberRole
} from "../api";

type FamilyPageProps = {
  households: HouseholdAppData[];
  isLoading: boolean;
};

type FamilyPanelProps = {
  currentUserId?: string;
  household: HouseholdAppData;
  onSummaryChange: (householdId: string, summary: FamilyHouseholdSummary) => void;
};

type FamilyHouseholdSummary = {
  members: number;
  pendingInvitations: number;
  plannedMinutes: number;
  plannedChores: number;
};

type FamilyBoardRow = {
  member: HouseholdMemberSummary;
  minutes: number;
  occurrencesByDate: Record<string, ChoreOccurrence[]>;
};

const familyWeekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function memberLabel(member: HouseholdMemberSummary) {
  return member.displayName ?? member.primaryEmail ?? member.clerkUserId;
}

function roleLabel(role: HouseholdMemberSummary["role"]) {
  return role === "owner" ? "Owner" : "Member";
}

function invitationStatusLabel(status: HouseholdInvitation["status"]) {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function buildFamilyOccurrenceRange(startDate: Date, endDate: Date, timeZone: string) {
  const startOn = format(startDate, "yyyy-MM-dd");
  const endOn = format(endDate, "yyyy-MM-dd");

  return {
    startAt: fromZonedTime(`${startOn}T00:00:00`, timeZone).toISOString(),
    endAt: fromZonedTime(`${endOn}T23:59:59`, timeZone).toISOString(),
    startOn,
    endOn
  };
}

function occurrenceDateKey(occurrence: ChoreOccurrence, timeZone: string) {
  return occurrence.plannedStartAt
    ? formatInTimeZone(occurrence.plannedStartAt, timeZone, "yyyy-MM-dd")
    : occurrence.eligibleStartOn;
}

function choreTitle(household: HouseholdAppData, occurrence: ChoreOccurrence) {
  return household.chores.find((chore) => chore.id === occurrence.choreId)?.title ?? "Scheduled chore";
}

function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

function loadStatusLabel(rows: FamilyBoardRow[]) {
  const activeRows = rows.filter((row) => row.minutes > 0);
  if (activeRows.length <= 1) return "Building";
  const max = Math.max(...activeRows.map((row) => row.minutes));
  const min = Math.min(...activeRows.map((row) => row.minutes));
  return max - min <= 45 ? "Good" : "Review";
}

export function FamilyPage({ households, isLoading }: FamilyPageProps) {
  const [currentUser, setCurrentUser] = useState<AppUserProfile>();
  const [householdSummaries, setHouseholdSummaries] = useState<Record<string, FamilyHouseholdSummary>>({});
  const familySummary = useMemo(() => {
    const summaries = households.map((household) => householdSummaries[household.id]).filter(Boolean);
    return {
      members: summaries.reduce((total, summary) => total + summary.members, 0),
      pendingInvitations: summaries.reduce((total, summary) => total + summary.pendingInvitations, 0),
      plannedMinutes: summaries.reduce((total, summary) => total + summary.plannedMinutes, 0),
      plannedChores: summaries.reduce((total, summary) => total + summary.plannedChores, 0)
    };
  }, [householdSummaries, households]);

  useEffect(() => {
    let cancelled = false;

    void getCurrentUser()
      .then((user) => {
        if (!cancelled) setCurrentUser(user);
      })
      .catch(() => {
        if (!cancelled) setCurrentUser(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSummaryChange = useCallback((householdId: string, summary: FamilyHouseholdSummary) => {
    setHouseholdSummaries((current) => {
      const currentSummary = current[householdId];

      if (
        currentSummary?.members === summary.members &&
        currentSummary?.pendingInvitations === summary.pendingInvitations &&
        currentSummary?.plannedMinutes === summary.plannedMinutes &&
        currentSummary?.plannedChores === summary.plannedChores
      ) {
        return current;
      }

      return { ...current, [householdId]: summary };
    });
  }, []);

  return (
    <div className="family-page operational-page">
      <header className="page-command-header">
        <div>
          <p className="eyebrow">Collaboration</p>
          <h1>Family</h1>
          <p className="lede">Invite household members and coordinate shared chore ownership.</p>
        </div>
      </header>

      <section className="family-collaboration-shell" aria-label="Household collaboration">
        <div className="family-collaboration-summary">
          <div>
            <span>Members</span>
            <strong>{isLoading ? "-" : familySummary.members}</strong>
            <p>People with household access</p>
          </div>
          <div>
            <span>Pending invitations</span>
            <strong>{isLoading ? "-" : familySummary.pendingInvitations}</strong>
            <p>Owner-managed invite queue</p>
          </div>
          <div>
            <span>This week</span>
            <strong>{isLoading ? "-" : familySummary.plannedChores}</strong>
            <p>Scheduled chores on the family board</p>
          </div>
          <div>
            <span>Chore load</span>
            <strong>{isLoading ? "-" : minutesLabel(familySummary.plannedMinutes)}</strong>
            <p>Estimated shared chore time</p>
          </div>
        </div>

        {isLoading ? <div className="empty-state">Loading household members...</div> : null}
        {!isLoading && households.length === 0 ? (
          <section className="placeholder-page">
            <h2>No households yet</h2>
            <p className="lede">Add a household before inviting family members.</p>
          </section>
        ) : null}
        <div className="family-household-list">
          {!isLoading ? households.map((household) => (
            <FamilyHouseholdPanel
              currentUserId={currentUser?.id}
              household={household}
              key={household.id}
              onSummaryChange={handleSummaryChange}
            />
          )) : null}
        </div>
      </section>
    </div>
  );
}

function FamilyHouseholdPanel({ currentUserId, household, onSummaryChange }: FamilyPanelProps) {
  const [members, setMembers] = useState<HouseholdMemberSummary[]>([]);
  const [invitations, setInvitations] = useState<HouseholdInvitation[]>([]);
  const [occurrences, setOccurrences] = useState<ChoreOccurrence[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string>();
  const [error, setError] = useState<string>();

  const isOwner = members.some((member) => member.userId === currentUserId && member.role === "owner");
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");
  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 0 }), []);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 0 }), [weekStart]);
  const dateKeys = useMemo(() => weekDates.map((date) => format(date, "yyyy-MM-dd")), [weekDates]);
  const boardRows = useMemo<FamilyBoardRow[]>(() => {
    return members.map((member) => {
      const memberOccurrences = occurrences.filter((occurrence) => occurrence.assignedUserId === member.userId);
      const occurrencesByDate = memberOccurrences.reduce<Record<string, ChoreOccurrence[]>>((groups, occurrence) => {
        const key = occurrenceDateKey(occurrence, household.timeZone);
        groups[key] = [...(groups[key] ?? []), occurrence];
        return groups;
      }, {});

      return {
        member,
        minutes: memberOccurrences
          .filter((occurrence) => occurrence.status === "planned")
          .reduce((total, occurrence) => total + occurrence.estimatedMinutes, 0),
        occurrencesByDate
      };
    });
  }, [household.timeZone, members, occurrences]);
  const plannedOccurrences = occurrences.filter((occurrence) => occurrence.status === "planned");
  const plannedMinutes = plannedOccurrences.reduce((total, occurrence) => total + occurrence.estimatedMinutes, 0);
  const loadStatus = loadStatusLabel(boardRows);
  const suggestedMove = useMemo(() => {
    const sortedRows = [...boardRows].sort((first, second) => second.minutes - first.minutes);
    const heavy = sortedRows[0];
    const light = sortedRows[sortedRows.length - 1];
    if (!heavy || !light || heavy.member.userId === light.member.userId || heavy.minutes - light.minutes <= 45) return undefined;
    const moveCandidate = Object.values(heavy.occurrencesByDate)
      .flat()
      .filter((occurrence) => occurrence.status === "planned")
      .sort((first, second) => second.estimatedMinutes - first.estimatedMinutes)[0];
    if (!moveCandidate) return undefined;

    return {
      title: choreTitle(household, moveCandidate),
      from: memberLabel(heavy.member),
      to: memberLabel(light.member)
    };
  }, [boardRows, household]);

  useEffect(() => {
    onSummaryChange(household.id, {
      members: members.length,
      pendingInvitations: pendingInvitations.length,
      plannedMinutes,
      plannedChores: plannedOccurrences.length
    });
  }, [household.id, members.length, onSummaryChange, pendingInvitations.length, plannedMinutes, plannedOccurrences.length]);

  useEffect(() => {
    let cancelled = false;

    async function loadFamilyData() {
      setIsLoading(true);
      setError(undefined);
      try {
        const [loadedMembers, loadedInvitations] = await Promise.all([
          listHouseholdMembers(household.id),
          listHouseholdInvitations(household.id)
        ]);
        const loadedOccurrences = await listOccurrences(
          household.id,
          buildFamilyOccurrenceRange(weekStart, weekEnd, household.timeZone)
        );
        if (!cancelled) {
          setMembers(loadedMembers);
          setInvitations(loadedInvitations);
          setOccurrences(loadedOccurrences);
        }
      } catch {
        if (!cancelled) setError("Could not load household members.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadFamilyData();
    return () => {
      cancelled = true;
    };
  }, [household.id, household.timeZone, weekEnd, weekStart]);

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!inviteEmail.trim()) return;

    setBusyAction("invite");
    setError(undefined);
    try {
      const invitation = await inviteHouseholdMember(household.id, inviteEmail.trim());
      setInvitations((current) => [...current, invitation]);
      setInviteEmail("");
    } catch {
      setError("Could not send invitation.");
    } finally {
      setBusyAction(undefined);
    }
  }

  async function handleRoleChange(member: HouseholdMemberSummary) {
    const nextRole = member.role === "owner" ? "member" : "owner";
    setBusyAction(`role-${member.userId}`);
    setError(undefined);
    try {
      const updated = await updateHouseholdMemberRole(household.id, member.userId, nextRole);
      setMembers((current) =>
        current.map((existing) =>
          existing.userId === updated.userId ? { ...existing, role: updated.role } : existing
        )
      );
    } catch {
      setError("Could not update member role.");
    } finally {
      setBusyAction(undefined);
    }
  }

  async function handleRemove(member: HouseholdMemberSummary) {
    setBusyAction(`remove-${member.userId}`);
    setError(undefined);
    try {
      await removeHouseholdMember(household.id, member.userId);
      setMembers((current) => current.filter((existing) => existing.userId !== member.userId));
    } catch {
      setError("Could not remove member.");
    } finally {
      setBusyAction(undefined);
    }
  }

  async function handleCancelInvitation(invitation: HouseholdInvitation) {
    setBusyAction(`invite-${invitation.id}`);
    setError(undefined);
    try {
      const cancelled = await cancelHouseholdInvitation(household.id, invitation.id);
      setInvitations((current) =>
        current.map((existing) => existing.id === cancelled.id ? cancelled : existing)
      );
    } catch {
      setError("Could not cancel invitation.");
    } finally {
      setBusyAction(undefined);
    }
  }

  return (
    <section className="family-household" aria-label={`${household.name} family access`}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Household</p>
          <h2>{household.name}</h2>
        </div>
      </div>

      {isLoading ? <p className="section-summary">Loading family access...</p> : null}
      {error ? <p className="section-summary" role="status">{error}</p> : null}

      {!isLoading ? (
        <div className="family-coordination-layout">
          <section className="family-board-panel" aria-label={`${household.name} weekly responsibility board`}>
            <div className="family-board-toolbar">
              <div>
                <p className="eyebrow">Household coordination</p>
                <h3>Week of {format(weekStart, "MMM d")}</h3>
              </div>
              <div className="family-board-key" aria-label="Calendar item key">
                <span className="family-key-item is-chore">Chores</span>
                <span className="family-key-item is-commitment">Commitments</span>
              </div>
            </div>

            <div className="family-responsibility-board">
              <div className="family-board-cell family-board-corner" />
              {weekDates.map((date, index) => (
                <div className="family-board-cell family-board-day" key={format(date, "yyyy-MM-dd")}>
                  <strong>{familyWeekdays[index]}</strong>
                  <span>{format(date, "d")}</span>
                </div>
              ))}
              {boardRows.map((row) => (
                <div className="family-board-row-fragment" key={row.member.userId}>
                  <div className="family-board-cell family-board-member">
                    <strong>{memberLabel(row.member)}</strong>
                    <span>{minutesLabel(row.minutes)}</span>
                  </div>
                  {dateKeys.map((dateKey) => {
                    const dayOccurrences = row.occurrencesByDate[dateKey] ?? [];
                    return (
                      <div className="family-board-cell family-board-work" key={`${row.member.userId}-${dateKey}`}>
                        {dayOccurrences.slice(0, 2).map((occurrence) => (
                          <span className={`family-board-chip is-${occurrence.status}`} key={occurrence.id}>
                            {choreTitle(household, occurrence)}
                          </span>
                        ))}
                        {dayOccurrences.length > 2 ? <small>+{dayOccurrences.length - 2} more</small> : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>

          <aside className="family-coordination-side">
            <section className="family-load-panel" aria-label={`${household.name} load check`}>
              <div className="section-heading compact-heading">
                <h3>Load check</h3>
                <span>{loadStatus}</span>
              </div>
              <div className="family-load-list">
                {boardRows.map((row) => (
                  <div className="family-load-row" key={row.member.userId}>
                    <div>
                      <strong>{memberLabel(row.member)}</strong>
                      <span>{minutesLabel(row.minutes)}</span>
                    </div>
                    <span className="family-load-track">
                      <i style={{ width: `${plannedMinutes > 0 ? Math.max(8, Math.round((row.minutes / plannedMinutes) * 100)) : 0}%` }} />
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="family-access-panel" aria-labelledby={`${household.id}-access`}>
              <div className="section-heading compact-heading">
                <h3 id={`${household.id}-access`}>Access</h3>
                <span>{members.length}</span>
              </div>
              <ul className="family-list">
                {members.map((member) => (
                  <li className="family-access-row" key={member.userId}>
                    <div>
                      <strong>{memberLabel(member)}</strong>
                      <span>{member.primaryEmail && member.displayName ? member.primaryEmail : "Household collaborator"}</span>
                    </div>
                    <div className="family-compact-actions">
                      <span className={`role-pill ${member.role}`}>{roleLabel(member.role)}</span>
                      {isOwner && member.userId !== currentUserId ? (
                        <>
                          <button
                            aria-label={member.role === "owner"
                              ? `Make ${memberLabel(member)} a member`
                              : `Promote ${memberLabel(member)} to owner`}
                            className="quiet-link"
                            disabled={Boolean(busyAction)}
                            onClick={() => void handleRoleChange(member)}
                            type="button"
                          >
                            {member.role === "owner" ? "Make member" : "Promote"}
                          </button>
                          <button
                            aria-label={`Remove ${memberLabel(member)}`}
                            className="quiet-link danger-link"
                            disabled={Boolean(busyAction)}
                            onClick={() => void handleRemove(member)}
                            type="button"
                          >
                            Remove
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </aside>

          <section className="family-action-panel family-suggestion-panel">
            <div>
              <p className="eyebrow">Suggested adjustment</p>
              {suggestedMove ? (
                <>
                  <h3>Move {suggestedMove.title} from {suggestedMove.from} to {suggestedMove.to}.</h3>
                  <p>That would bring this week closer to an even chore load.</p>
                </>
              ) : (
                <>
                  <h3>Weekly chore load looks steady.</h3>
                  <p>Cleanly will surface suggested handoffs when one person starts carrying too much.</p>
                </>
              )}
            </div>
          </section>

          <section className="family-action-panel family-invite-panel" aria-labelledby={`${household.id}-invitations`}>
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">Invite status</p>
                <h3 id={`${household.id}-invitations`}>Pending invitations</h3>
              </div>
              <span>{pendingInvitations.length}</span>
            </div>
            {isOwner ? (
              <form className="family-invite-form" onSubmit={handleInvite}>
                <label htmlFor={`${household.id}-invite`}>Invite by email</label>
                <div>
                  <input
                    id={`${household.id}-invite`}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="name@example.com"
                    type="email"
                    value={inviteEmail}
                  />
                  <button disabled={busyAction === "invite"} type="submit">Send invitation</button>
                </div>
              </form>
            ) : null}
            <ul className="family-list invitation-list">
              {pendingInvitations.map((invitation) => (
                <li className="family-invite-row" key={invitation.id}>
                  <div>
                    <strong>{invitation.recipientEmail}</strong>
                    <span>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span>
                  </div>
                  <div className="family-compact-actions">
                    <span className={`role-pill ${invitation.status}`}>
                      {invitationStatusLabel(invitation.status)}
                    </span>
                    {isOwner ? (
                      <button
                        aria-label={`Cancel invitation for ${invitation.recipientEmail}`}
                        className="quiet-link danger-link"
                        disabled={Boolean(busyAction)}
                        onClick={() => void handleCancelInvitation(invitation)}
                        type="button"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
              {pendingInvitations.length === 0 ? <li className="empty-state">No pending invitations.</li> : null}
            </ul>
            {invitations.some((invitation) => invitation.status !== "pending") ? (
              <ul className="family-list family-invite-history" aria-label={`${household.name} invitation history`}>
                {invitations.filter((invitation) => invitation.status !== "pending").map((invitation) => (
                  <li className="family-invite-row is-muted" key={invitation.id}>
                    <div>
                      <strong>{invitation.recipientEmail}</strong>
                      <span>Updated invitation</span>
                    </div>
                    <span className={`role-pill ${invitation.status}`}>
                      {invitationStatusLabel(invitation.status)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
