import { useEffect, useRef, useState } from "react";
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";
import type { AppNotification } from "@chore-helper/shared";
import { listMyNotifications, markMyNotificationsRead } from "./api";
import { ApiAuthBridge } from "./auth/AuthProvider";
import { OptimizePage } from "./pages/OptimizePage";
import { HouseholdsPage } from "./pages/HouseholdsPage";
import { CalendarPage } from "./pages/CalendarPage";
import { FamilyPage } from "./pages/FamilyPage";
import { LandingPage } from "./pages/LandingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TodayDashboard } from "./pages/TodayDashboard";
import { normalizePath } from "./routes";
import { AppDataProvider } from "./state/AppDataProvider";
import { useAppData } from "./state/useAppData";
import { BellIcon, CloseIcon, MenuIcon, SparklesIcon } from "./components/AppIcons";
import type { WeekStartDay } from "./types";

/*
  Importing CSS directly inside a React module is a bundler feature. With
  Vite this becomes an injected style during dev and a CSS chunk in build.
  In Webpack, this would be handled by `style-loader` / `css-loader`.
*/
import "./App.css";

const AUTH_REDIRECT_PATH = "/today";

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
        <LandingPage
          primaryAction={<SignUpButton forceRedirectUrl={AUTH_REDIRECT_PATH} mode="modal">Build my home plan</SignUpButton>}
          signInAction={<SignInButton forceRedirectUrl={AUTH_REDIRECT_PATH} mode="modal">Sign in</SignInButton>}
        />
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

function AppRoutes() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));
  const [weekStartDay, setWeekStartDayState] = useState<WeekStartDay>(() =>
    window.localStorage.getItem("cleanly:week-start-day") === "monday" ? "monday" : "sunday"
  );
  const { addHousehold, households, isLoading, loadError, reloadHouseholds } = useAppData();

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
    setPath(normalizePath(window.location.pathname));
  }

  function setWeekStartDay(nextWeekStartDay: WeekStartDay) {
    window.localStorage.setItem("cleanly:week-start-day", nextWeekStartDay);
    setWeekStartDayState(nextWeekStartDay);
  }

  /*
    This manual navigation is roughly like calling `router.navigateByUrl`
    in Angular. The component manages browser history and updates local
    state to control which child component is rendered.
  */
  if (path === "/") {
    return (
      <AppShell currentPath="/today" onNavigate={navigate}>
        <TodayDashboard
          households={households}
          isLoading={isLoading}
          loadError={loadError}
          onNavigate={navigate}
          weekStartDay={weekStartDay}
        />
      </AppShell>
    );
  }

  return (
    <AppShell currentPath={path} onNavigate={navigate}>
      {path === "/today" ? (
        <TodayDashboard
          households={households}
          isLoading={isLoading}
          loadError={loadError}
          onNavigate={navigate}
          weekStartDay={weekStartDay}
        />
      ) : null}
      {path === "/calendar" ? (
        <CalendarPage households={households} isLoading={isLoading} onNavigate={navigate} />
      ) : null}
      {path === "/households" ? (
        <HouseholdsPage households={households} isLoading={isLoading} onAddHousehold={addHousehold} onReload={reloadHouseholds} />
      ) : null}
      {path === "/optimize" ? (
        <OptimizePage
          households={households}
          isLoading={isLoading}
        />
      ) : null}
      {path === "/family" ? <FamilyPage households={households} isLoading={isLoading} /> : null}
      {path === "/settings" ? (
        <SettingsPage households={households} onWeekStartDayChange={setWeekStartDay} weekStartDay={weekStartDay} />
      ) : null}
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
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadTaskCount, setUnreadTaskCount] = useState(0);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const navItems = [
    { label: "Optimize", path: "/optimize", emphasis: true },
    { label: "Today", path: "/today" },
    { label: "Calendar", path: "/calendar" },
    { label: "My Home", path: "/households" },
    { label: "Family", path: "/family" },
    { label: "Settings", path: "/settings" }
  ];

  async function refreshNotifications() {
    try {
      const response = await listMyNotifications();
      setNotifications(response.notifications);
      setUnreadTaskCount(response.unreadTaskCount);
    } catch {
      setNotifications([]);
      setUnreadTaskCount(0);
    }
  }

  useEffect(() => {
    void refreshNotifications();

    function handleFocus() {
      void refreshNotifications();
    }

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  useEffect(() => {
    if (!isNotificationsOpen) return;

    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && notificationsRef.current?.contains(target)) return;
      setIsNotificationsOpen(false);
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsNotificationsOpen(false);
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [isNotificationsOpen]);

  async function openNotifications() {
    const nextOpen = !isNotificationsOpen;
    setIsNotificationsOpen(nextOpen);
    if (!nextOpen) return;

    const unreadIds = notifications.filter((notification) => !notification.readAt).map((notification) => notification.id);
    if (!unreadIds.length) return;
    setNotifications((current) => current.map((notification) =>
      unreadIds.includes(notification.id)
        ? { ...notification, readAt: new Date().toISOString() }
        : notification
    ));
    setUnreadTaskCount(0);
    try {
      const response = await markMyNotificationsRead(unreadIds);
      setUnreadTaskCount(response.unreadTaskCount);
    } catch {
      void refreshNotifications();
    }
  }

  function pendingCountLabel(notification: AppNotification) {
    const count = typeof notification.metadata.pendingCount === "number" ? notification.metadata.pendingCount : undefined;
    return count === undefined ? undefined : `${count} pending`;
  }

  function openNotification(notification: AppNotification) {
    setIsNotificationsOpen(false);
    onNavigate(notification.targetPath);
  }

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
        <div className="workspace-brand-cluster">
          <button
            aria-label={isNavOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isNavOpen}
            className="workspace-menu-button"
            onClick={() => setIsNavOpen((current) => !current)}
            type="button"
          >
            {isNavOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
          <a className="brand-mark" href="/" onClick={(event) => {
            event.preventDefault();
            onNavigate("/");
            setIsNavOpen(false);
          }}>
            <img alt="" aria-hidden="true" className="brand-logo" src="/clenella-logo.svg" />
            Clenella
          </a>
        </div>
        <nav className="workspace-nav workspace-nav-mobile-overlay" aria-label="Primary" data-open={isNavOpen ? "true" : "false"}>
          {navItems.map((item) => (
            <a
              aria-current={currentPath === item.path ? "page" : undefined}
              className={item.emphasis ? "is-primary-nav-action" : undefined}
              href={item.path}
              key={item.path}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(item.path);
                setIsNavOpen(false);
              }}
            >
              {item.emphasis ? <SparklesIcon /> : null}
              {item.label}
            </a>
          ))}
        </nav>
        <div className="workspace-user-actions" ref={notificationsRef}>
          <button
            aria-expanded={isNotificationsOpen}
            aria-label={unreadTaskCount > 0 ? `Notifications, ${unreadTaskCount} unread` : "Notifications"}
            className="workspace-icon-button workspace-notification-button"
            onClick={() => void openNotifications()}
            type="button"
          >
            <BellIcon />
            {unreadTaskCount > 0 ? <span className="workspace-notification-badge">{unreadTaskCount}</span> : null}
          </button>
          {isNotificationsOpen ? (
            <section className="workspace-notification-popover" role="dialog" aria-label="Notifications">
              {notifications.length ? (
                <div className="workspace-notification-list">
                  {notifications.map((notification) => (
                    <button
                      aria-label={`${notification.title.replace("Calendar imports need review", "Review imports")} for ${notification.householdName ?? "household"}${pendingCountLabel(notification) ? `, ${pendingCountLabel(notification)}` : ""}`}
                      className="workspace-notification-row"
                      key={notification.id}
                      onClick={() => openNotification(notification)}
                      type="button"
                    >
                      <span>
                        <strong>{notification.title}</strong>
                        <small>{notification.householdName}</small>
                      </span>
                      <span>
                        {pendingCountLabel(notification) ? <small>{pendingCountLabel(notification)}</small> : null}
                        <strong>Review imports</strong>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="workspace-notification-empty">No new notifications.</p>
              )}
            </section>
          ) : null}
          <UserButton />
        </div>
      </header>

      <main className="workspace-main">{children}</main>
    </div>
  );
}

export default App;
