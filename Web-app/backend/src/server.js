import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
import { config } from "./config.js";
import deviceRoutes from "./routes/device.routes.js";
import telemetryRoutes from "./routes/telemetry.routes.js";
import historyRoutes from "./routes/history.routes.js";

import { runAggregator } from "./jobs/aggregator.job.js";
import { ensureStorageReady } from "./services/storage.service.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/telemetry", telemetryRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/devices", deviceRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const deviceIds = config.thingsboardDeviceIds;
console.log("Configured ThingsBoard device IDs for aggregation:", deviceIds);
async function runAllAggregators() {
  await Promise.all(
    deviceIds.map((id) =>
      runAggregator(id).catch((error) => {
        console.error(`Aggregator failed for device ${id}:`, error.message);
      }),
    ),
  );
}

async function bootstrap() {
  await ensureStorageReady();

  try {
    await runAllAggregators();
  } catch (error) {
    console.warn("Initial ThingsBoard sync skipped:", error.message);
  }

  setInterval(() => {
    runAllAggregators().catch((error) => {
      console.error("Aggregator job failed:", error.message);
    });
  }, config.aggregatorIntervalMs);

  app.listen(config.port, () => {
    console.log(`Backend running on http://localhost:${config.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Backend startup failed:", error);
  process.exitCode = 1;
});
