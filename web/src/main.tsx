import { StrictMode } from 'react'
import { ClerkProvider } from '@clerk/clerk-react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/*
  This is the React bootstrap entrypoint, similar to Angular's
  `main.ts` where `platformBrowserDynamic().bootstrapModule(AppModule)`
  is called.

  In a Webpack or Vite app, this file is the startup bundle's entrypoint.
  When using Vite, the dev server handles module loading and HMR, while
  a Webpack setup would use its own runtime loader and chunk manifest.
*/
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!clerkPublishableKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <App />
    </ClerkProvider>
  </StrictMode>,
)
