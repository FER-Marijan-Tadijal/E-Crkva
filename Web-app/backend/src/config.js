import dotenv from "dotenv";

dotenv.config();
console.log(
  "RAW ENV THINGSBOARD_DEVICE_IDS:",
  process.env.THINGSBOARD_DEVICE_IDS,
);

const DEFAULT_DEVICE_ID = "836f9fb0-6320-11f1-a544-db21b46190ed";

export const config = {
  port: Number(process.env.PORT || 4000),
  aggregatorIntervalMs: Number(
    process.env.AGGREGATOR_INTERVAL_MS || 15 * 60 * 1000,
  ),
  postgresUrl: process.env.POSTGRES_URL || process.env.DATABASE_URL || "",
  thingsboardBaseUrl: (
    process.env.THINGSBOARD_BASE_URL ||
    process.env.TB_BASE_URL ||
    ""
  ).replace(/\/+$/, ""),
  thingsboardUsername:
    process.env.THINGSBOARD_USERNAME || process.env.TB_USERNAME || "",
  thingsboardPassword:
    process.env.THINGSBOARD_PASSWORD || process.env.TB_PASSWORD || "",
  thingsboardDeviceId: process.env.THINGSBOARD_DEVICE_ID || DEFAULT_DEVICE_ID,
  thingsboardDeviceIds: (
    process.env.THINGSBOARD_DEVICE_IDS ||
    "836f9fb0-6320-11f1-a544-db21b46190ed,df276520-63fe-11f1-a544-db21b46190ed"
  )
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
  telemetryKeys: (
    process.env.THINGSBOARD_TELEMETRY_KEYS ||
    "microphone_loudness,bell_state,last_pattern,last_ring_time,esp_online,lte_signal"
  )
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean),
};
