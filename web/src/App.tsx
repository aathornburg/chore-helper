import { useEffect, useState } from "react";
import {
  demoChores,
  demoHousehold,
  demoPeople,
  demoPlanHealth,
  demoWeek,
  setupChecklist
} from "./demoData";
import { PlanReview } from "./PlanReview";
import "./App.css";

const routes = ["/today", "/plan", "/family", "/settings"] as const;
type AppRoute = (typeof routes)[number];

function normalizePath(pathname: string) {
  return routes.includes(pathname as AppRoute) ? (pathname as AppRoute) : "/";
}

function App() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));

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
      {path === "/today" ? <TodayDashboard onNavigate={navigate} /> : null}
      {path === "/plan" ? <PlanReview /> : null}
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
    { label: "Plan", path: "/plan" },
    { label: "Family", path: "/family" },
    { label: "Settings", path: "/settings" }
  ];

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
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
      </aside>

      <main className="workspace-main">{children}</main>
    </div>
  );
}

function TodayDashboard({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <div className="dashboard-page">
      <header className="workspace-hero">
        <div>
          <p className="eyebrow">Command center</p>
          <h1>Today</h1>
          <p className="lede">
            A high-level view of chore health, current routines, family load, and what needs expert
            review next.
          </p>
        </div>
        <button onClick={() => onNavigate("/plan")} type="button">Open Plan review</button>
      </header>

      <section className="panel plan-health-panel" aria-labelledby="plan-health-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Optimization overview</p>
            <h2 id="plan-health-heading">Plan health</h2>
          </div>
          <span>{demoHousehold.contextCompleteness}% context complete</span>
        </div>
        <div className="metric-grid">
          {demoPlanHealth.map((metric) => (
            <article className={`metric-card ${metric.tone}`} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel setup-panel" aria-labelledby="setup-heading">
          <div className="panel-heading">
            <h2 id="setup-heading">Setup checklist</h2>
            <span>{demoHousehold.name}</span>
          </div>
          <ul className="checklist">
            {setupChecklist.map((item) => (
              <li className={item.complete ? "complete" : ""} key={item.label}>
                <span>{item.complete ? "Done" : "Next"}</span>
                {item.label}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel" aria-labelledby="people-heading">
          <h2 id="people-heading">People</h2>
          <div className="people-list">
            {demoPeople.map((person) => (
              <article key={person.name}>
                <strong>{person.name}</strong>
                <span>{person.load}</span>
                <p>{person.role}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel wide-panel" aria-labelledby="chores-heading">
          <div className="panel-heading">
            <h2 id="chores-heading">Current chores</h2>
            <span>{demoChores.length} tracked routines</span>
          </div>
          <div className="chore-table">
            {demoChores.map((chore) => (
              <article key={chore.title}>
                <strong>{chore.title}</strong>
                <span>{chore.cadence}</span>
                <span>{chore.owner}</span>
                <em>{chore.signal}</em>
              </article>
            ))}
          </div>
        </section>

        <section className="panel wide-panel" aria-labelledby="week-heading">
          <div className="panel-heading">
            <h2 id="week-heading">Week view</h2>
            <span>{demoHousehold.homeType} / {demoHousehold.rooms} rooms</span>
          </div>
          <div className="week-strip">
            {demoWeek.map((day) => (
              <article key={day.day}>
                <strong>{day.day}</strong>
                {day.chores.map((chore) => (
                  <span key={chore}>{chore}</span>
                ))}
              </article>
            ))}
          </div>
        </section>
      </div>
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
