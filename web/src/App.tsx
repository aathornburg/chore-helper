import { useEffect, useState } from "react";
import type { FlooringType, HomeType, HouseholdBaseline } from "@chore-helper/shared";
import {
  demoHousehold,
  setupChecklist
} from "./demoData";
import { PlanReview } from "./PlanReview";
import { createHousehold, saveBaseline } from "./api";
import "./App.css";

const routes = ["/today", "/setup", "/plan", "/family", "/settings"] as const;
type AppRoute = (typeof routes)[number];
const allowedFlooringTypes: FlooringType[] = ["carpet", "hardwood", "tile", "mixed", "unknown"];

type HouseholdSetupState = {
  householdId?: string;
  householdName: string;
  baseline?: HouseholdBaseline;
  setupComplete: boolean;
};

type SetupFormValues = {
  householdName: string;
  homeType: HomeType;
  rooms: string;
  flooring: string;
  hasPets: boolean;
  hasOutdoorSpace: boolean;
  notes: string;
};

function normalizePath(pathname: string) {
  return routes.includes(pathname as AppRoute) ? (pathname as AppRoute) : "/";
}

function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFlooring(value: string): FlooringType[] {
  const requestedTypes = parseList(value).map((item) => item.toLowerCase());
  const validTypes = requestedTypes.filter((item): item is FlooringType =>
    allowedFlooringTypes.includes(item as FlooringType)
  );

  return validTypes.length > 0 ? validTypes : ["unknown"];
}

function formatBaselineSummary(baseline: HouseholdBaseline) {
  return `${baseline.homeType} / ${baseline.rooms.length} rooms / ${baseline.flooring.join(", ")} / ${
    baseline.hasPets ? "pets" : "no pets"
  } / ${baseline.hasOutdoorSpace ? "outdoor space" : "no outdoor space"}`;
}

function App() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));
  const [householdSetup, setHouseholdSetup] = useState<HouseholdSetupState>({
    householdName: "Home",
    setupComplete: false
  });

  useEffect(() => {
    function handlePopState() {
      setPath(normalizePath(window.location.pathname));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(nextPath: string) {
    window.history.pushState({}, "", nextPath);
    setPath(normalizePath(nextPath));
  }

  async function handleSaveSetup(values: SetupFormValues) {
    const baseline: HouseholdBaseline = {
      homeType: values.homeType,
      rooms: parseList(values.rooms),
      flooring: parseFlooring(values.flooring),
      hasPets: values.hasPets,
      hasOutdoorSpace: values.hasOutdoorSpace,
      notes: values.notes
    };
    const existingHouseholdId = householdSetup.householdId;
    const household = existingHouseholdId
      ? { id: existingHouseholdId, name: values.householdName }
      : await createHousehold(values.householdName);
    const savedHousehold = await saveBaseline(household.id, baseline);

    setHouseholdSetup({
      householdId: household.id,
      householdName: savedHousehold.name || household.name || values.householdName,
      baseline: savedHousehold.baseline ?? baseline,
      setupComplete: true
    });
    navigate("/today");
  }

  if (path === "/") {
    return <LandingPage onGetStarted={() => navigate("/today")} />;
  }

  return (
    <AppShell currentPath={path} onNavigate={navigate}>
      {path === "/today" ? (
        <TodayDashboard householdSetup={householdSetup} onNavigate={navigate} />
      ) : null}
      {path === "/setup" ? (
        <SetupPage householdSetup={householdSetup} onSave={handleSaveSetup} />
      ) : null}
      {path === "/plan" ? (
        <PlanReview
          householdId={householdSetup.householdId}
          householdName={householdSetup.householdName}
          baseline={householdSetup.baseline}
        />
      ) : null}
      {path === "/family" ? <FamilyPage /> : null}
      {path === "/settings" ? <SettingsPage /> : null}
    </AppShell>
  );
}

function LandingPage({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Landing">
        <a href="/" onClick={(event) => event.preventDefault()}>
          Chore Helper
        </a>
        <button onClick={onGetStarted} type="button">Open app</button>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">A shared plan for the people who live there</p>
          <h1>Chore Helper</h1>
          <p className="hero-statement">
            Make household work visible, fair, and easier to adjust.
          </p>
          <p className="lede">
            Optimize recurring chores, catch missed routines, and turn family calendars into a
            clearer home operating rhythm.
          </p>
          <div className="hero-actions">
            <button onClick={onGetStarted} type="button">Get Started</button>
            <span>Demo household included for this first slice.</span>
          </div>
        </div>

        <div className="hero-preview" aria-label="Chore Helper dashboard preview">
          <div className="preview-toolbar">
            <span>Today</span>
            <span>Plan</span>
            <span>Family</span>
          </div>
          <div className="preview-grid">
            <div className="preview-card wide">
              <span>Plan health</span>
              <strong>82%</strong>
              <p>3 duration concerns need a second look.</p>
            </div>
            <div className="preview-card">
              <span>People</span>
              <strong>3</strong>
              <p>Shared workload view.</p>
            </div>
            <div className="preview-card">
              <span>Week view</span>
              <strong>12</strong>
              <p>Upcoming chores.</p>
            </div>
            <div className="preview-card wide accent-preview">
              <span>Expert recommendation</span>
              <p>Review bathroom duration before accepting calendar changes.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function AppShell({
  children,
  currentPath,
  onNavigate
}: {
  children: React.ReactNode;
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  const navItems = [
    { label: "Today", path: "/today" },
    { label: "Setup", path: "/setup" },
    { label: "Plan", path: "/plan" },
    { label: "Family", path: "/family" },
    { label: "Settings", path: "/settings" }
  ];

  return (
    <div className="workspace-shell">
      <header className="workspace-topbar">
        <a className="brand-mark" href="/" onClick={(event) => {
          event.preventDefault();
          onNavigate("/");
        }}>
          Chore Helper
        </a>
        <nav className="workspace-nav" aria-label="Primary">
          {navItems.map((item) => (
            <a
              aria-current={currentPath === item.path ? "page" : undefined}
              href={item.path}
              key={item.path}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(item.path);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="workspace-main">{children}</main>
    </div>
  );
}

function TodayDashboard({
  householdSetup,
  onNavigate
}: {
  householdSetup: HouseholdSetupState;
  onNavigate: (path: string) => void;
}) {
  if (householdSetup.setupComplete && householdSetup.baseline) {
    return (
      <div className="dashboard-page first-time-dashboard">
        <header className="workspace-hero first-time-hero">
          <div>
            <p className="eyebrow">Setup complete</p>
            <h1>Today</h1>
            <p className="lede">
              {householdSetup.householdName} is ready for a first expert chore review.
            </p>
            <p className="supporting-copy">{formatBaselineSummary(householdSetup.baseline)}</p>
          </div>
          <button onClick={() => onNavigate("/plan")} type="button">Review existing chores</button>
        </header>

        <div className="first-time-grid">
          <section className="panel setup-focus-panel" aria-labelledby="setup-complete-heading">
            <p className="eyebrow">Next best action</p>
            <h2 id="setup-complete-heading">Review the current chore plan</h2>
            <p>
              Add an existing chore from your current calendar so the assistant can evaluate
              cadence, duration, and missing coverage before suggesting manual changes.
            </p>
          </section>

          <section className="panel" aria-labelledby="saved-context-heading">
            <div className="panel-heading">
              <h2 id="saved-context-heading">Household context</h2>
              <span>Saved</span>
            </div>
            <div className="preview-health-list">
              <article>
                <strong>Home</strong>
                <p>{householdSetup.baseline.homeType}</p>
              </article>
              <article>
                <strong>Rooms</strong>
                <p>{householdSetup.baseline.rooms.join(", ")}</p>
              </article>
              <article>
                <strong>Floors</strong>
                <p>{householdSetup.baseline.flooring.join(", ")}</p>
              </article>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page first-time-dashboard">
      <header className="workspace-hero first-time-hero">
        <div>
          <p className="eyebrow">First household setup</p>
          <h1>Today</h1>
          <p className="lede">
            Let's get your household context set up.
          </p>
          <p className="supporting-copy">
            A few home details give the assistant enough context to review chores with better
            cadence, effort, and coverage recommendations.
          </p>
        </div>
        <button onClick={() => onNavigate("/setup")} type="button">Set up household</button>
      </header>

      <div className="first-time-grid">
        <section className="panel setup-focus-panel" aria-labelledby="next-step-heading">
          <p className="eyebrow">Next best action</p>
          <h2 id="next-step-heading">Start with household basics</h2>
          <p>
            Tell Chore Helper about the home type, rooms, floors, pets, outdoor space, and any
            notes that affect recurring work.
          </p>
          <button onClick={() => onNavigate("/setup")} type="button">Continue setup</button>
        </section>

        <section className="panel" aria-labelledby="plan-preview-heading">
          <div className="panel-heading">
            <h2 id="plan-preview-heading">Plan health preview</h2>
            <span>Unlocks after setup</span>
          </div>
          <div className="preview-health-list">
            <article>
              <strong>Coverage gaps</strong>
              <p>Spot chores missing from your current routine.</p>
            </article>
            <article>
              <strong>Cadence risks</strong>
              <p>Review chores that may be too frequent or too rare.</p>
            </article>
            <article>
              <strong>Duration concerns</strong>
              <p>Catch estimates that may be too short to be realistic.</p>
            </article>
          </div>
        </section>
      </div>

      <section className="panel" aria-labelledby="what-next-heading">
        <div className="panel-heading">
          <h2 id="what-next-heading">What comes next</h2>
          <span>{demoHousehold.name}</span>
        </div>
        <ol className="next-step-list">
          {setupChecklist.map((item) => (
            <li key={item.label}>
              <span>{item.complete ? "Ready" : "Later"}</span>
              {item.label}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function SetupPage({
  householdSetup,
  onSave
}: {
  householdSetup: HouseholdSetupState;
  onSave: (values: SetupFormValues) => Promise<void>;
}) {
  const [householdName, setHouseholdName] = useState(householdSetup.householdName);
  const [homeType, setHomeType] = useState<HomeType>(householdSetup.baseline?.homeType ?? "house");
  const [rooms, setRooms] = useState(
    householdSetup.baseline?.rooms.join(", ") ?? "kitchen, bathrooms, bedrooms"
  );
  const [flooring, setFlooring] = useState(
    householdSetup.baseline?.flooring.join(", ") ?? "hardwood, tile, carpet"
  );
  const [hasPets, setHasPets] = useState(householdSetup.baseline?.hasPets ?? true);
  const [hasOutdoorSpace, setHasOutdoorSpace] = useState(
    householdSetup.baseline?.hasOutdoorSpace ?? true
  );
  const [notes, setNotes] = useState(
    householdSetup.baseline?.notes ?? "We already use Google Calendar for recurring chores."
  );
  const [status, setStatus] = useState("Ready to save household basics.");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving household setup...");

    try {
      await onSave({
        householdName,
        homeType,
        rooms,
        flooring,
        hasPets,
        hasOutdoorSpace,
        notes
      });
    } catch {
      setStatus("Could not save household setup.");
    }
  }

  return (
    <div className="setup-page">
      <header className="workspace-hero compact-hero">
        <div>
          <p className="eyebrow">Household basics</p>
          <h1>Household setup</h1>
          <p className="lede">
            Start with the context the assistant needs before reviewing cadence, coverage, and
            estimated effort.
          </p>
        </div>
      </header>

      <form className="panel setup-form" onSubmit={handleSubmit}>
        <div className="field-grid">
          <label>
            Household name
            <input value={householdName} onChange={(event) => setHouseholdName(event.target.value)} />
          </label>

          <label>
            Home type
            <select value={homeType} onChange={(event) => setHomeType(event.target.value as HomeType)}>
              <option value="house">House</option>
              <option value="apartment">Apartment</option>
              <option value="condo">Condo</option>
              <option value="townhouse">Townhouse</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label>
            Rooms
            <input value={rooms} onChange={(event) => setRooms(event.target.value)} />
          </label>

          <label>
            Flooring
            <input value={flooring} onChange={(event) => setFlooring(event.target.value)} />
          </label>
        </div>

        <div className="choice-row">
          <label className="checkbox-field">
            <input
              checked={hasPets}
              onChange={(event) => setHasPets(event.target.checked)}
              type="checkbox"
            />
            Has pets
          </label>

          <label className="checkbox-field">
            <input
              checked={hasOutdoorSpace}
              onChange={(event) => setHasOutdoorSpace(event.target.checked)}
              type="checkbox"
            />
            Has outdoor space
          </label>
        </div>

        <label>
          Notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>

        <div className="form-footer">
          <button type="submit">Save basics</button>
          <span>People and calendar setup come later.</span>
        </div>
        <p className="status" role="status">{status}</p>
      </form>
    </div>
  );
}

function FamilyPage() {
  return (
    <section className="placeholder-page">
      <p className="eyebrow">Family</p>
      <h1>Family</h1>
      <p className="lede">
        This area will grow into household members, workload preferences, and shared responsibility
        views. For now, Today shows the demo family overview.
      </p>
    </section>
  );
}

function SettingsPage() {
  return (
    <section className="placeholder-page">
      <p className="eyebrow">Settings</p>
      <h1>Settings</h1>
      <p className="lede">
        Calendar connections, household defaults, and agent review preferences will live here in a
        later slice.
      </p>
    </section>
  );
}

export default App;
