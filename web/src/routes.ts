export const routes = ["/today", "/setup", "/plan", "/family", "/settings"] as const;

export type AppRoute = (typeof routes)[number];

export function normalizePath(pathname: string): AppRoute | "/" {
  return routes.includes(pathname as AppRoute) ? (pathname as AppRoute) : "/";
}
