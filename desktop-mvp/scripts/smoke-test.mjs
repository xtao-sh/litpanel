import {
  FRONTEND_URL,
  BACKEND_URL,
  getLogPaths,
  getRuntimeSummary,
  startServices,
  stopServices,
} from "../src/service-manager.mjs";

async function main() {
  console.log("Runtime:");
  console.log(getRuntimeSummary());

  try {
    await startServices();

    const [backendResponse, frontendResponse] = await Promise.all([
      fetch(`${BACKEND_URL}/api/health`),
      fetch(FRONTEND_URL),
    ]);

    console.log("Backend /api/health:", backendResponse.status, await backendResponse.text());
    console.log("Frontend /:", frontendResponse.status);
  } finally {
    await stopServices();
    console.log("Stopped services.");
    console.log("Logs:", getLogPaths());
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
