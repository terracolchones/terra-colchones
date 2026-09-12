import { beforeEach } from "vitest";

// Fail closed if a worker somehow starts without the parent's preload guard.
beforeEach(() => {
  if (process.env.TERRA_LOCAL_SIMULATION !== "1" || !process.env.NODE_OPTIONS?.includes("local-network-guard.mjs")) {
    throw new Error("Local simulation protections are missing. Use npm run test:local.");
  }
});
