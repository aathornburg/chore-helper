import { useEffect, useState } from "react";
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";
import { ApiAuthBridge } from "./auth/AuthProvider";
import { OptimizePage } from "./pages/OptimizePage";
import { HouseholdsPage } from "./pages/HouseholdsPage";
import { ChoresPage } from "./pages/ChoresPage";
import { FamilyPage } from "./pages/FamilyPage";
import { LandingPage } from "./pages/LandingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TodayDashboard } from "./pages/TodayDashboard";
import { normalizePath } from "./routes";
import { AppDataProvider, useAppData } from "./state/AppDataProvider";

/*
  Importing CSS directly inside a React module is a bundler feature. With
  Vite this becomes an injected style during dev and a CSS chunk in build.
  In Webpack, this would be handled by `style-loader` / `css-loader`.
*/
import "./App.css";

/*
  App is the top-level React component in this tree, similar to Angular's
  AppComponent. It sets up the root layout and wraps child routes with
  shared application context.

  In Angular, this would be the component declared in `bootstrapModule`
  and its template would contain `<router-outlet>` and any shared
  provider-scoped wrappers.
*/
function App() {
  return (
    <>
      <SignedOut>
        <SignedOutWorkspace />
      </SignedOut>
      <SignedIn>
        <ApiAuthBridge>
          <AppDataProvider authReady={true}>
            <AppRoutes />
          </AppDataProvider>
        </ApiAuthBridge>
      </SignedIn>
    </>
  );
}

function SignedOutWorkspace() {
  return (
    <div className="workspace-shell signed-out-shell">
      <header className="workspace-topbar">
        <a className="brand-mark" href="/">
          Cleainly
        </a>
      </header>
      <main className="workspace-main">
        <section className="workspace-hero first-time-hero">
          <div>
            <p className="eyebrow">Account required</p>
            <h1>Sign in to manage your households</h1>
            <p className="lede">Your household data loads after authentication.</p>
            <div className="form-actions">
              <SignInButton mode="modal">Sign in</SignInButton>
              <SignUpButton mode="modal">Sign up</SignUpButton>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function AppRoutes() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));
  const { addHousehold, householdSetup, households, isLoading } = useAppData();

  /*
    `useState` is similar to component-scoped state in Angular, though
    React keeps state local to the function component. This state controls
    the current route path.

    `useAppData()` is like injecting an Angular service into a
    component constructor; it gives access to shared application state and
    actions managed by a provider.

    This file does not use React Router. Instead, the route is determined
    by the current URL and rendered conditionally, which is analogous to
    a simplified Angular route config + `<router-outlet>` flow.
  */
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

  /*
    This manual navigation is roughly like calling `router.navigateByUrl`
    in Angular. The component manages browser history and updates local
    state to control which child component is rendered.
  */
  if (path === "/") {
    return <LandingPage onGetStarted={() => navigate("/today")} />;
  }

  return (
    <AppShell currentPath={path} onNavigate={navigate}>
      {path === "/today" ? (
        <TodayDashboard householdSetup={householdSetup} onNavigate={navigate} />
      ) : null}
      {path === "/households" ? (
        <HouseholdsPage households={households} isLoading={isLoading} onAddHousehold={addHousehold} />
      ) : null}
      {path === "/chores" ? (
        <ChoresPage households={households} householdsLoading={isLoading} />
      ) : null}
      {path === "/optimize" ? (
        <OptimizePage
          households={households}
          isLoading={isLoading}
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
    { label: "Households", path: "/households" },
    { label: "Chores", path: "/chores" },
    { label: "Optimize ✨", path: "/optimize" },
    { label: "Settings", path: "/settings" }
  ];

  /*
    AppShell functions like a shared layout component in Angular. Its
    template contains the navigation bar and a content region, similar to
    a shell component with `<router-outlet>`.

    In Angular this would likely be a `ShellComponent` with `routerLink`
    bindings instead of raw anchor click handlers.
  */
  return (
    <div className="workspace-shell">
      <header className="workspace-topbar">
        <a className="brand-mark" href="/" onClick={(event) => {
          event.preventDefault();
          onNavigate("/");
        }}>
          Cleainly
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
        <UserButton />
      </header>

      <main className="workspace-main">{children}</main>
    </div>
  );
}

export default App;
