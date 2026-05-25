/*
  These shared TypeScript types are like Angular model interfaces. They
  define the contract between frontend components, services, and backend
  APIs in a way that is enforced by the compiler.
*/
export type HomeType = "house" | "apartment" | "condo" | "townhouse" | "other";

export type HouseholdProfile = {
  homeType: HomeType;
  hasPets: boolean;
  hasOutdoorSpace: boolean;
  notes?: string;
};

export type CoverageLevel = "none" | "partial" | "most" | "all";
export type PetImpact = "none" | "low" | "medium" | "high";
export type RoomOverride<T> = T | "inherit";

export type FlooringSurface =
  | "hardwood"
  | "tile"
  | "carpet"
  | "rugs"
  | "vinyl"
  | "laminate"
  | "concrete"
  | "mats"
  | "mixed"
  | "other";

export type FloorLevelType = "upstairs" | "main" | "basement" | "other";

export type HouseholdRoom = {
  id: string;
  floorId: string;
  name: string;
  flooring: FlooringSurface[];
  petImpact: RoomOverride<PetImpact>;
  robotVacuumCoverage: RoomOverride<CoverageLevel>;
  robotMopCoverage: RoomOverride<CoverageLevel>;
  notes?: string;
};

export type HouseholdFloor = {
  id: string;
  householdId: string;
  name: string;
  levelType: FloorLevelType;
  flooring: FlooringSurface[];
  petImpact: PetImpact;
  robotVacuumCoverage: CoverageLevel;
  robotMopCoverage: CoverageLevel;
  notes?: string;
  rooms: HouseholdRoom[];
};

export type HouseholdStructure = {
  householdId: string;
  floors: HouseholdFloor[];
};

export type Household = {
  id: string;
  name: string;
  profile?: HouseholdProfile;
};

export type AppUserProfile = {
  id: string;
  clerkUserId: string;
};

export type Chore = {
  id: string;
  householdId: string;
  householdName?: string;
  title: string;
  cadence: string;
  estimatedMinutes: number;
  source: "manual" | "google-calendar";
  archivedAt?: string;
};

export type ChoreReviewState = "unreviewed" | "recommendation-pending" | "reviewed";

export type RecommendationConfidence = "low" | "medium" | "high";
export type RecommendationDecision = "pending" | "accepted" | "declined" | "applied";

export type Recommendation = {
  id: string;
  householdId: string;
  affectedChoreId?: string;
  title: string;
  rationale: string;
  confidence: RecommendationConfidence;
  status: "pending" | "accepted" | "skipped";
  decision?: RecommendationDecision;
  proposedCadence?: string;
  proposedEstimatedMinutes?: number;
  staleAt?: string;
};

export type ChoreAppData = Chore & {
  recommendations: Recommendation[];
};

export type HouseholdAppData = Household & {
  structure: HouseholdStructure;
  chores: ChoreAppData[];
  recommendations: Recommendation[];
};
