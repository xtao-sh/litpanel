import { rebuildFrontend, getRuntimeSummary } from "../src/service-manager.mjs";

console.log("Rebuilding frontend for desktop MVP...");
console.log(getRuntimeSummary());

await rebuildFrontend();

console.log("Frontend build completed.");
