import { useAuth } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { configureApiAuth } from "../api";

export function ApiAuthBridge({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded } = useAuth();
  const [apiAuthReady, setApiAuthReady] = useState(false);

  useEffect(() => {
    configureApiAuth(() => getToken());
    setApiAuthReady(true);

    return () => {
      configureApiAuth(async () => null);
      setApiAuthReady(false);
    };
  }, [getToken]);

  if (!isLoaded || !apiAuthReady) return null;

  return <>{children}</>;
}
