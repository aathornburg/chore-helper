/*
  This route list is a lightweight alternative to Angular's RouterModule
  configuration. Each path is a known route, and `normalizePath` ensures
  unknown URLs default back to `/`.
*/
export const routes = ["/today", "/optimize","/households", "/chores", "/family", "/settings"] as const;

export type AppRoute = (typeof routes)[number];

export function normalizePath(pathname: string): AppRoute | "/" {
  return routes.includes(pathname as AppRoute) ? (pathname as AppRoute) : "/";
}
