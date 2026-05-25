import type { PrismaClient } from "@prisma/client";
import type {
  Chore,
  Household,
  HouseholdFloor,
  HouseholdInvitation,
  HouseholdMemberSummary,
  HouseholdProfile,
  HouseholdRoom,
  Recommendation,
  RecommendationConfidence,
  RecommendationDecision
} from "@chore-helper/shared";
import type { AppUser, HouseholdStore } from "./inMemoryStore.js";

function serializeOptionalList(values: string[]) {
  return JSON.stringify(values);
}

function deserializeOptionalList<T extends string>(value: string) {
  return JSON.parse(value) as T[];
}

function serializeDate(value: Date | null | undefined) {
  return value ? value.toISOString() : undefined;
}

function toHousehold(
  household: {
    id: string;
    name: string;
    timeZone: string;
    profile?: {
      homeType: string;
      hasPets: boolean;
      hasOutdoorSpace: boolean;
      notes: string | null;
    } | null;
  }
): Household {
  const profile = household.profile
    ? {
        homeType: household.profile.homeType as HouseholdProfile["homeType"],
        hasPets: household.profile.hasPets,
        hasOutdoorSpace: household.profile.hasOutdoorSpace,
        notes: household.profile.notes ?? undefined
      }
    : undefined;

  return {
    id: household.id,
    name: household.name,
    timeZone: household.timeZone,
    ...(profile ? { profile } : {})
  };
}

function toAppUser(user: { id: string; clerkUserId: string; primaryEmail?: string | null; displayName?: string | null }): AppUser {
  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    primaryEmail: user.primaryEmail ?? undefined,
    displayName: user.displayName ?? undefined
  };
}

function toInvitation(invitation: {
  id: string;
  householdId: string;
  recipientEmail: string;
  role: string;
  invitedByUserId: string;
  expiresAt: Date;
  acceptedAt?: Date | null;
  acceptedByUserId?: string | null;
  cancelledAt?: Date | null;
  createdAt: Date;
}): HouseholdInvitation {
  const status: HouseholdInvitation["status"] = invitation.cancelledAt
    ? "cancelled"
    : invitation.acceptedAt
      ? "accepted"
      : invitation.expiresAt.getTime() <= Date.now()
        ? "expired"
        : "pending";

  return {
    id: invitation.id,
    householdId: invitation.householdId,
    recipientEmail: invitation.recipientEmail,
    role: invitation.role as "member",
    status,
    invitedByUserId: invitation.invitedByUserId,
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: serializeDate(invitation.acceptedAt),
    acceptedByUserId: invitation.acceptedByUserId ?? undefined,
    cancelledAt: serializeDate(invitation.cancelledAt),
    createdAt: invitation.createdAt.toISOString()
  };
}

function toHouseholdRoom(room: {
  id: string;
  name: string;
  flooring: string;
  petImpact: string;
  robotVacuumCoverage: string;
  robotMopCoverage: string;
  notes?: string | null;
}, floorId: string): HouseholdRoom {
  return {
    id: room.id,
    floorId,
    name: room.name,
    flooring: deserializeOptionalList(room.flooring),
    petImpact: room.petImpact as HouseholdRoom["petImpact"],
    robotVacuumCoverage: room.robotVacuumCoverage as HouseholdRoom["robotVacuumCoverage"],
    robotMopCoverage: room.robotMopCoverage as HouseholdRoom["robotMopCoverage"],
    notes: room.notes ?? undefined
  };
}

function toHouseholdFloor(floor: {
  id: string;
  householdId: string;
  name: string;
  levelType: string;
  flooring: string;
  petImpact: string;
  robotVacuumCoverage: string;
  robotMopCoverage: string;
  notes?: string | null;
  rooms: Array<{
    id: string;
    name: string;
    flooring: string;
    petImpact: string;
    robotVacuumCoverage: string;
    robotMopCoverage: string;
    notes?: string | null;
  }>;
}): HouseholdFloor {
  return {
    id: floor.id,
    householdId: floor.householdId,
    name: floor.name,
    levelType: floor.levelType as HouseholdFloor["levelType"],
    flooring: deserializeOptionalList(floor.flooring),
    petImpact: floor.petImpact as HouseholdFloor["petImpact"],
    robotVacuumCoverage: floor.robotVacuumCoverage as HouseholdFloor["robotVacuumCoverage"],
    robotMopCoverage: floor.robotMopCoverage as HouseholdFloor["robotMopCoverage"],
    notes: floor.notes ?? undefined,
    rooms: floor.rooms.map((room) => toHouseholdRoom(room, floor.id))
  };
}

function toChore(chore: {
  id: string;
  householdId: string;
  household?: { name: string } | null;
  title: string;
  cadence: string;
  estimatedMinutes: number;
  source: string;
  archivedAt?: Date | null;
}): Chore {
  return {
    id: chore.id,
    householdId: chore.householdId,
    householdName: chore.household?.name,
    title: chore.title,
    cadence: chore.cadence,
    estimatedMinutes: chore.estimatedMinutes,
    source: chore.source as Chore["source"],
    archivedAt: serializeDate(chore.archivedAt)
  };
}

function toRecommendation(recommendation: {
  id: string;
  householdId: string;
  affectedChoreId?: string | null;
  title: string;
  rationale: string;
  confidence: string;
  status: string;
  decision?: string | null;
  proposedCadence?: string | null;
  proposedEstimatedMinutes?: number | null;
  staleAt?: Date | null;
}): Recommendation {
  return {
    id: recommendation.id,
    householdId: recommendation.householdId,
    affectedChoreId: recommendation.affectedChoreId ?? undefined,
    title: recommendation.title,
    rationale: recommendation.rationale,
    confidence: recommendation.confidence as RecommendationConfidence,
    status: recommendation.status as Recommendation["status"],
    decision: (recommendation.decision ?? "pending") as RecommendationDecision,
    proposedCadence: recommendation.proposedCadence ?? undefined,
    proposedEstimatedMinutes: recommendation.proposedEstimatedMinutes ?? undefined,
    staleAt: serializeDate(recommendation.staleAt)
  };
}

export function createPrismaStore(prisma: PrismaClient): HouseholdStore {
  return {
    async upsertUserByClerkId(clerkUserId, profile = {}) {
      const user = await prisma.user.upsert({
        where: { clerkUserId },
        create: { clerkUserId, ...profile },
        update: profile
      });

      return toAppUser(user);
    },

    async getUserByClerkId(clerkUserId) {
      const user = await prisma.user.findUnique({
        where: { clerkUserId }
      });

      return user ? toAppUser(user) : undefined;
    },

    async userHasHouseholdAccess(userId, householdId) {
      const membershipCount = await prisma.householdMember.count({
        where: {
          userId,
          householdId
        }
      });

      return membershipCount > 0;
    },

    async getMembership(userId, householdId) {
      const membership = await prisma.householdMember.findUnique({
        where: {
          householdId_userId: {
            householdId,
            userId
          }
        }
      });

      return membership
        ? {
            householdId: membership.householdId,
            userId: membership.userId,
            role: membership.role as "owner" | "member"
          }
        : undefined;
    },

    async listHouseholdMembers(householdId) {
      const memberships = await prisma.householdMember.findMany({
        where: { householdId },
        include: { user: true },
        orderBy: { createdAt: "asc" }
      });

      return memberships.map((membership): HouseholdMemberSummary => ({
        householdId: membership.householdId,
        userId: membership.userId,
        clerkUserId: membership.user.clerkUserId,
        primaryEmail: membership.user.primaryEmail ?? undefined,
        displayName: membership.user.displayName ?? undefined,
        role: membership.role as "owner" | "member"
      }));
    },

    async updateMemberRole(householdId, userId, role) {
      return prisma.$transaction(async (tx) => {
        const membership = await tx.householdMember.findUnique({
          where: { householdId_userId: { householdId, userId } }
        });
        if (!membership) return { outcome: "not_found" as const };

        if (membership.role === "owner" && role === "member") {
          const ownerCount = await tx.householdMember.count({
            where: { householdId, role: "owner" }
          });
          if (ownerCount <= 1) return { outcome: "last_owner" as const };
        }

        const updated = await tx.householdMember.update({
          where: { householdId_userId: { householdId, userId } },
          data: { role }
        });

        return {
          outcome: "updated" as const,
          membership: {
            householdId: updated.householdId,
            userId: updated.userId,
            role: updated.role as "owner" | "member"
          }
        };
      }, { isolationLevel: "Serializable" });
    },

    async removeMember(householdId, userId) {
      return prisma.$transaction(async (tx) => {
        const membership = await tx.householdMember.findUnique({
          where: { householdId_userId: { householdId, userId } }
        });
        if (!membership) return { outcome: "not_found" as const };

        if (membership.role === "owner") {
          const ownerCount = await tx.householdMember.count({
            where: { householdId, role: "owner" }
          });
          if (ownerCount <= 1) return { outcome: "last_owner" as const };
        }

        const removed = await tx.householdMember.delete({
          where: { householdId_userId: { householdId, userId } }
        });

        return {
          outcome: "updated" as const,
          membership: {
            householdId: removed.householdId,
            userId: removed.userId,
            role: removed.role as "owner" | "member"
          }
        };
      }, { isolationLevel: "Serializable" });
    },

    async createInvitation(invitation) {
      const created = await prisma.householdInvitation.create({
        data: {
          householdId: invitation.householdId,
          recipientEmail: invitation.recipientEmail,
          tokenDigest: invitation.tokenDigest,
          invitedByUserId: invitation.invitedByUserId,
          expiresAt: new Date(invitation.expiresAt)
        }
      });

      return toInvitation(created);
    },

    async listInvitations(householdId) {
      const invitations = await prisma.householdInvitation.findMany({
        where: { householdId },
        orderBy: { createdAt: "desc" }
      });

      return invitations.map(toInvitation);
    },

    async cancelInvitation(householdId, invitationId, cancelledAt) {
      const invitation = await prisma.householdInvitation.findFirst({
        where: { id: invitationId, householdId }
      });
      if (!invitation || invitation.acceptedAt || invitation.cancelledAt) return undefined;

      const updated = await prisma.householdInvitation.update({
        where: { id: invitationId },
        data: { cancelledAt: new Date(cancelledAt) }
      });

      return toInvitation(updated);
    },

    async findInvitationByTokenDigest(tokenDigest) {
      const invitation = await prisma.householdInvitation.findUnique({
        where: { tokenDigest }
      });
      if (!invitation) return undefined;

      return {
        ...toInvitation(invitation),
        tokenDigest: invitation.tokenDigest
      };
    },

    async acceptInvitation(invitationId, userId, acceptedAt) {
      const invitation = await prisma.householdInvitation.findUnique({
        where: { id: invitationId }
      });
      if (!invitation || invitation.acceptedAt || invitation.cancelledAt) return undefined;

      const updated = await prisma.$transaction(async (tx) => {
        const nextInvitation = await tx.householdInvitation.update({
          where: { id: invitationId },
          data: {
            acceptedAt: new Date(acceptedAt),
            acceptedByUserId: userId
          }
        });
        await tx.householdMember.upsert({
          where: { householdId_userId: { householdId: invitation.householdId, userId } },
          create: { householdId: invitation.householdId, userId, role: "member" },
          update: {}
        });
        return nextInvitation;
      });

      return toInvitation(updated);
    },

    async listHouseholdsForUser(userId) {
      const households = await prisma.household.findMany({
        where: {
          members: {
            some: { userId }
          }
        },
        include: { profile: true },
        orderBy: { createdAt: "asc" }
      });

      return households.map(toHousehold);
    },

    async createHouseholdForUser(name, userId) {
      const household = await prisma.$transaction(async (tx) => {
        return tx.household.create({
          data: {
            id: crypto.randomUUID(),
            name,
            members: {
              create: {
                userId,
                role: "owner"
              }
            }
          },
          include: { profile: true }
        });
      });

      return toHousehold(household);
    },

    async createHousehold(name) {
      const household = await prisma.household.create({
        data: {
          id: crypto.randomUUID(),
          name
        },
        include: { profile: true }
      });

      return toHousehold(household);
    },

    async listHouseholds() {
      const households = await prisma.household.findMany({
        include: { profile: true },
        orderBy: { createdAt: "asc" }
      });

      return households.map(toHousehold);
    },

    async updateProfile(householdId, update) {
      const household = await prisma.household.findUnique({
        where: { id: householdId }
      });
      if (!household) return undefined;

      const updated = await prisma.household.update({
        where: { id: householdId },
        data: {
          name: update.name,
          profile: {
            upsert: {
              create: {
                homeType: update.profile.homeType,
                hasPets: update.profile.hasPets,
                hasOutdoorSpace: update.profile.hasOutdoorSpace,
                notes: update.profile.notes
              },
              update: {
                homeType: update.profile.homeType,
                hasPets: update.profile.hasPets,
                hasOutdoorSpace: update.profile.hasOutdoorSpace,
                notes: update.profile.notes
              }
            }
          }
        },
        include: { profile: true }
      });

      return toHousehold(updated);
    },

    async updateHouseholdSettings(householdId, update) {
      const household = await prisma.household.findUnique({
        where: { id: householdId }
      });
      if (!household) return undefined;

      const updated = await prisma.household.update({
        where: { id: householdId },
        data: { timeZone: update.timeZone },
        include: { profile: true }
      });

      return toHousehold(updated);
    },

    async getHousehold(householdId) {
      const household = await prisma.household.findUnique({
        where: { id: householdId },
        include: { profile: true }
      });

      return household ? toHousehold(household) : undefined;
    },

    async getHouseholdStructure(householdId) {
      const household = await prisma.household.findUnique({
        where: { id: householdId }
      });
      if (!household) return undefined;

      const floors = await prisma.householdFloor.findMany({
        where: { householdId },
        include: { rooms: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" }
      });

      return {
        householdId,
        floors: floors.map(toHouseholdFloor)
      };
    },

    async saveHouseholdStructure(householdId, floors) {
      const household = await prisma.household.findUnique({
        where: { id: householdId }
      });
      if (!household) return undefined;

      await prisma.$transaction(async (tx) => {
        await tx.householdFloor.deleteMany({ where: { householdId } });

        for (const [floorIndex, floor] of floors.entries()) {
          await tx.householdFloor.create({
            data: {
              id: floor.id,
              householdId,
              name: floor.name,
              levelType: floor.levelType,
              flooring: serializeOptionalList(floor.flooring),
              petImpact: floor.petImpact,
              robotVacuumCoverage: floor.robotVacuumCoverage,
              robotMopCoverage: floor.robotMopCoverage,
              notes: floor.notes,
              sortOrder: floorIndex,
              rooms: {
                create: floor.rooms.map((room, roomIndex) => ({
                  id: room.id,
                  name: room.name,
                  flooring: serializeOptionalList(room.flooring),
                  petImpact: room.petImpact,
                  robotVacuumCoverage: room.robotVacuumCoverage,
                  robotMopCoverage: room.robotMopCoverage,
                  notes: room.notes,
                  sortOrder: roomIndex
                }))
              }
            }
          });
        }
      });

      return this.getHouseholdStructure(householdId);
    },

    async createChore(chore) {
      const created = await prisma.$transaction(async (tx) => {
        const nextChore = await tx.chore.create({
          data: {
            id: crypto.randomUUID(),
            householdId: chore.householdId,
            title: chore.title,
            cadence: chore.cadence,
            estimatedMinutes: chore.estimatedMinutes,
            source: chore.source
          }
        });
        await tx.recommendation.updateMany({
          where: { householdId: chore.householdId, staleAt: null },
          data: { staleAt: new Date() }
        });
        return nextChore;
      });

      return toChore(created);
    },

    async updateChore(householdId, choreId, chore) {
      const existing = await prisma.chore.findFirst({
        where: { id: choreId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.$transaction(async (tx) => {
        const nextChore = await tx.chore.update({
          where: { id: choreId },
          data: chore
        });
        await tx.recommendation.updateMany({
          where: { householdId, staleAt: null },
          data: { staleAt: new Date() }
        });
        return nextChore;
      });

      return toChore(updated);
    },

    async archiveChore(householdId, choreId) {
      const existing = await prisma.chore.findFirst({
        where: { id: choreId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.$transaction(async (tx) => {
        const nextChore = await tx.chore.update({
          where: { id: choreId },
          data: { archivedAt: new Date() }
        });
        await tx.recommendation.updateMany({
          where: { householdId, staleAt: null },
          data: { staleAt: new Date() }
        });
        return nextChore;
      });

      return toChore(updated);
    },

    async restoreChore(householdId, choreId) {
      const existing = await prisma.chore.findFirst({
        where: { id: choreId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.$transaction(async (tx) => {
        const nextChore = await tx.chore.update({
          where: { id: choreId },
          data: { archivedAt: null }
        });
        await tx.recommendation.updateMany({
          where: { householdId, staleAt: null },
          data: { staleAt: new Date() }
        });
        return nextChore;
      });

      return toChore(updated);
    },

    async listChores(householdId, options = {}) {
      const chores = await prisma.chore.findMany({
        where: options.archivedOnly
          ? { householdId, archivedAt: { not: null } }
          : options.includeArchived
            ? { householdId }
            : { householdId, archivedAt: null },
        orderBy: { createdAt: "asc" }
      });

      return chores.map(toChore);
    },

    async listAllChores(options = {}) {
      const chores = await prisma.chore.findMany({
        where: options.archivedOnly
          ? { archivedAt: { not: null } }
          : options.includeArchived
            ? {}
            : { archivedAt: null },
        include: {
          household: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: "asc" }
      });

      return chores.map(toChore);
    },

    async saveRecommendations(householdId, recommendations) {
      await prisma.$transaction([
        prisma.recommendation.deleteMany({ where: { householdId } }),
        prisma.recommendation.createMany({
          data: recommendations.map((recommendation) => ({
            id: recommendation.id,
            householdId,
            title: recommendation.title,
            rationale: recommendation.rationale,
            confidence: recommendation.confidence,
            status: recommendation.status,
            affectedChoreId: recommendation.affectedChoreId,
            decision: recommendation.decision ?? "pending",
            proposedCadence: recommendation.proposedCadence,
            proposedEstimatedMinutes: recommendation.proposedEstimatedMinutes,
            staleAt: recommendation.staleAt ? new Date(recommendation.staleAt) : null
          }))
        })
      ]);

      return recommendations.map((recommendation) => ({
        ...recommendation,
        decision: recommendation.decision ?? "pending"
      }));
    },

    async markRecommendationsStale(householdId) {
      await prisma.recommendation.updateMany({
        where: { householdId, staleAt: null },
        data: { staleAt: new Date() }
      });
    },

    async listRecommendations(householdId) {
      const recommendations = await prisma.recommendation.findMany({
        where: { householdId },
        orderBy: { createdAt: "asc" }
      });

      return recommendations.map(toRecommendation);
    },

    async listAllRecommendations() {
      const recommendations = await prisma.recommendation.findMany({
        orderBy: { createdAt: "asc" }
      });

      return recommendations.map(toRecommendation);
    },

    async updateRecommendationDecision(householdId, recommendationId, update) {
      const existing = await prisma.recommendation.findFirst({
        where: { id: recommendationId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.recommendation.update({
        where: { id: recommendationId },
        data: { decision: update.decision }
      });

      return toRecommendation(updated);
    },

    async applyRecommendationDecisions(householdId) {
      return prisma.$transaction(async (tx) => {
        const accepted = await tx.recommendation.findMany({
          where: {
            householdId,
            staleAt: null,
            decision: "accepted"
          },
          orderBy: { createdAt: "asc" }
        });
        const declined = await tx.recommendation.findMany({
          where: {
            householdId,
            staleAt: null,
            decision: "declined"
          },
          orderBy: { createdAt: "asc" }
        });
        const applied: Recommendation[] = [];

        for (const recommendation of accepted) {
          if (!recommendation.affectedChoreId) continue;

          const chore = await tx.chore.findFirst({
            where: {
              id: recommendation.affectedChoreId,
              householdId
            }
          });
          if (!chore) continue;

          await tx.chore.update({
            where: { id: chore.id },
            data: {
              cadence: recommendation.proposedCadence ?? chore.cadence,
              estimatedMinutes: recommendation.proposedEstimatedMinutes ?? chore.estimatedMinutes
            }
          });

          const appliedRecommendation = await tx.recommendation.update({
            where: { id: recommendation.id },
            data: { decision: "applied" }
          });
          applied.push(toRecommendation(appliedRecommendation));
        }

        return {
          applied,
          declined: declined.map(toRecommendation)
        };
      });
    }
  };
}
