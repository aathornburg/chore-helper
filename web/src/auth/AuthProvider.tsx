import { useAuth } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { configureApiAuth } from "../api";

export function ApiAuthBridge({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded } = useAuth();
  const [apiAuthReady, setApiAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    configureApiAuth(() => getToken());
    queueMicrotask(() => {
      if (!cancelled) setApiAuthReady(true);
    });

    return () => {
      cancelled = true;
      configureApiAuth(async () => null);
    };
  }, [getToken]);

  if (!isLoaded || !apiAuthReady) return null;

  return <>{children}</>;
}
