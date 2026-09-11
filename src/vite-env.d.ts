/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the AMMA API when frontend and API are served from different origins. Leave unset for same-origin. */
  readonly VITE_AMMA_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
