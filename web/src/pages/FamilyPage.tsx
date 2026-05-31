import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AppUserProfile,
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
};

function memberLabel(member: HouseholdMemberSummary) {
  return member.displayName ?? member.primaryEmail ?? member.clerkUserId;
}

function roleLabel(role: HouseholdMemberSummary["role"]) {
  return role === "owner" ? "Owner" : "Member";
}

function invitationStatusLabel(status: HouseholdInvitation["status"]) {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

export function FamilyPage({ households, isLoading }: FamilyPageProps) {
  const [currentUser, setCurrentUser] = useState<AppUserProfile>();
  const [householdSummaries, setHouseholdSummaries] = useState<Record<string, FamilyHouseholdSummary>>({});
  const familySummary = useMemo(() => {
    const summaries = households.map((household) => householdSummaries[household.id]).filter(Boolean);
    return {
      members: summaries.reduce((total, summary) => total + summary.members, 0),
      pendingInvitations: summaries.reduce((total, summary) => total + summary.pendingInvitations, 0)
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
        currentSummary?.pendingInvitations === summary.pendingInvitations
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
  const [inviteEmail, setInviteEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string>();
  const [error, setError] = useState<string>();

  const isOwner = members.some((member) => member.userId === currentUserId && member.role === "owner");
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");

  useEffect(() => {
    onSummaryChange(household.id, {
      members: members.length,
      pendingInvitations: pendingInvitations.length
    });
  }, [household.id, members.length, onSummaryChange, pendingInvitations.length]);

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
        if (!cancelled) {
          setMembers(loadedMembers);
          setInvitations(loadedInvitations);
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
  }, [household.id]);

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
        <span>{household.timeZone}</span>
      </div>

      {isLoading ? <p className="section-summary">Loading family access...</p> : null}
      {error ? <p className="section-summary" role="status">{error}</p> : null}

      {!isLoading ? (
        <div className="family-panel-grid">
          <section aria-labelledby={`${household.id}-members`}>
            <div className="section-heading compact-heading">
              <h3 id={`${household.id}-members`}>Members</h3>
              <span>{members.length}</span>
            </div>
            <ul className="family-member-grid">
              {members.map((member) => (
                <li className="family-member-card" key={member.userId}>
                  <div className="family-member-card-main">
                    <span className={`role-pill ${member.role}`}>{roleLabel(member.role)}</span>
                    <strong>{memberLabel(member)}</strong>
                    <span>{member.primaryEmail && member.displayName ? member.primaryEmail : "Household collaborator"}</span>
                  </div>
                  <div className="family-compact-actions">
                    {isOwner && member.userId !== currentUserId ? (
                      <>
                        <button
                          aria-label={member.role === "owner"
                            ? `Make ${memberLabel(member)} a member`
                            : `Promote ${memberLabel(member)} to owner`}
                          disabled={Boolean(busyAction)}
                          onClick={() => void handleRoleChange(member)}
                          type="button"
                        >
                          {member.role === "owner" ? "Make member" : "Promote"}
                        </button>
                        <button
                          aria-label={`Remove ${memberLabel(member)}`}
                          className="subtle-action"
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

          <section aria-labelledby={`${household.id}-invitations`}>
            <div className="section-heading compact-heading">
              <h3 id={`${household.id}-invitations`}>Pending invitations</h3>
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
                        className="subtle-action"
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
