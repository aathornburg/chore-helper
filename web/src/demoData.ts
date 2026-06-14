export const demoHousehold = {
  name: "Thornburg home",
  homeType: "House",
  rooms: 8,
  flooring: "Hardwood, tile, and carpet",
  contextCompleteness: 72
};

export const demoPeople = [
  { name: "Alan", role: "Planning and weekend resets", load: "42%" },
  { name: "Partner", role: "Recurring calendar owner", load: "46%" },
  { name: "Shared", role: "Rotating and as-needed work", load: "12%" }
];

export const demoPlanHealth = [
  {
    label: "Coverage gaps",
    value: "4",
    detail: "Outdoor, appliance, and seasonal chores need review.",
    tone: "attention"
  },
  {
    label: "Cadence risks",
    value: "6",
    detail: "Several chores may be too infrequent for the household profile.",
    tone: "warning"
  },
  {
    label: "Duration concerns",
    value: "3",
    detail: "Bathroom and floor chores look shorter than typical expert estimates.",
    tone: "strong"
  },
  {
    label: "Recommendation confidence",
    value: "82%",
    detail: "Demo confidence based on known home context and current chore coverage.",
    tone: "good"
  }
];

export const demoTasks = [
  { title: "Clean bathrooms", cadence: "Weekly", owner: "Shared", signal: "Duration risk" },
  { title: "Vacuum bedrooms", cadence: "Weekly", owner: "Alan", signal: "Pet hair coverage" },
  { title: "Kitchen reset", cadence: "Daily", owner: "Partner", signal: "Healthy cadence" },
  { title: "HVAC filter check", cadence: "Monthly", owner: "Shared", signal: "Imported reminder" }
];

export const demoWeek = [
  { day: "Mon", chores: ["Kitchen reset"] },
  { day: "Tue", chores: ["Vacuum bedrooms"] },
  { day: "Wed", chores: ["Bathrooms"] },
  { day: "Thu", chores: ["Laundry reset"] },
  { day: "Fri", chores: ["Kitchen reset"] },
  { day: "Sat", chores: ["Floors", "Outdoor sweep"] },
  { day: "Sun", chores: ["Plan review"] }
];

export const setupChecklist = [
  { label: "Confirm household rooms", complete: true },
  { label: "Add people and workload preferences", complete: false },
  { label: "Connect Google Calendar", complete: false },
  { label: "Review first recommendation set", complete: true }
];
