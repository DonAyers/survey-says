/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL (e.g. "wss://survey-says.fly.dev") of the deployed Bun WS
   * server, used when the frontend is hosted separately (e.g. on Vercel).
   * Leave unset for local dev / same-host deployments. */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
