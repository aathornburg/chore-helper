import { useEffect, useState } from "react";
import { PlanReview } from "./PlanReview";
import { FamilyPage } from "./pages/FamilyPage";
import { LandingPage } from "./pages/LandingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";
import { TodayDashboard } from "./pages/TodayDashboard";
import { normalizePath } from "./routes";
import { HouseholdSetupProvider, useHouseholdSetup } from "./state/HouseholdSetupProvider";
import "./App.css";

function App() {
  return (
    <HouseholdSetupProvider>
      <AppRoutes />
    </HouseholdSetupProvider>
  );
}

function AppRoutes() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));
  const { addExistingChore, householdSetup, saveHouseholdContext } = useHouseholdSetup();

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

  if (path === "/") {
    return <LandingPage onGetStarted={() => navigate("/today")} />;
  }

  return (
    <AppShell currentPath={path} onNavigate={navigate}>
      {path === "/today" ? (
        <TodayDashboard householdSetup={householdSetup} onNavigate={navigate} />
      ) : null}
      {path === "/setup" ? (
        <SetupPage
          householdSetup={householdSetup}
          onAddChore={addExistingChore}
          onReviewChores={() => navigate("/plan")}
          onSave={saveHouseholdContext}
        />
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
