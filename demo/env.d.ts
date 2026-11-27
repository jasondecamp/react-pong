/// <reference types="vite/client" />

// Interfaces, not types: these merge with the declarations Vite ships.
/* eslint-disable @typescript-eslint/consistent-type-definitions */

interface ImportMetaEnv {
  /** The two-player server's address, such as `wss://react-pong-server.example.workers.dev`. */
  readonly VITE_PONG_SERVER?: string;
}

// Vite's own declaration of `import.meta.env` is an interface, which this extends.
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
