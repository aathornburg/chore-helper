/*
  These shared TypeScript types are like Angular model interfaces. They
  define the contract between frontend components, services, and backend
  APIs in a way that is enforced by the compiler.
*/
export type HomeType = "house" | "apartment" | "condo" | "townhouse" | "other";

export type FlooringType = "carpet" | "hardwood" | "tile" | "mixed" | "unknown";

export type HouseholdBaseline = {
  homeType: HomeType;
  rooms: string[];
  flooring: FlooringType[];
  hasPets: boolean;
  hasOutdoorSpace: boolean;
  notes?: string;
};

export type Household = {
  id: string;
  name: string;
  baseline?: HouseholdBaseline;
};

export type Chore = {
  id: string;
  householdId: string;
  title: string;
  cadence: string;
  estimatedMinutes: number;
  source: "manual" | "google-calendar";
  archivedAt?: string;
};

export type RecommendationConfidence = "low" | "medium" | "high";

export type Recommendation = {
  id: string;
  householdId: string;
  title: string;
  rationale: string;
  confidence: RecommendationConfidence;
  status: "pending" | "accepted" | "skipped";
  staleAt?: string;
};
