import { useEffect, useState } from "react";
import type { HouseholdBaseline } from "@chore-helper/shared";
import { PlanReview } from "./PlanReview";
import { createHousehold, getHousehold, saveBaseline } from "./api";
import { FamilyPage } from "./pages/FamilyPage";
import { LandingPage } from "./pages/LandingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";
import { TodayDashboard } from "./pages/TodayDashboard";
import { normalizePath } from "./routes";
import type { HouseholdSetupState, SetupFormValues } from "./types";
import { parseFlooring, parseList } from "./utils/household";
import "./App.css";

const householdStorageKey = "chore-helper:household-id";

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

  useEffect(() => {
    const savedHouseholdId = window.localStorage.getItem(householdStorageKey);
    if (!savedHouseholdId) return;
    const activeHouseholdId = savedHouseholdId;

    let cancelled = false;

    async function restoreHousehold() {
      try {
        const household = await getHousehold(activeHouseholdId);
        if (cancelled) return;

        setHouseholdSetup({
          householdId: household.id,
          householdName: household.name,
          baseline: household.baseline,
          setupComplete: Boolean(household.baseline)
        });
      } catch {
        window.localStorage.removeItem(householdStorageKey);
      }
    }

    void restoreHousehold();

    return () => {
      cancelled = true;
    };
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
    window.localStorage.setItem(householdStorageKey, household.id);
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

export default App;
