import { Pool } from "pg";
import { config } from "../config.js";

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS telemetry_samples (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL,
    ts BIGINT NOT NULL,
    loudness DOUBLE PRECISION,
    bell_state TEXT,
    last_pattern TEXT,
    last_ring_time BIGINT,
    esp_online BOOLEAN,
    lte_signal DOUBLE PRECISION,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS telemetry_samples_device_ts_idx
    ON telemetry_samples (device_id, ts DESC);
`;

let pool;
let schemaReady = false;

function getPool() {
  if (!config.postgresUrl) {
    throw new Error("POSTGRES_URL is not configured.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: config.postgresUrl,
      max: 5,
    });

    pool.on("error", (error) => {
      console.error("Unexpected PostgreSQL pool error", error);
    });
  }

  return pool;
}

function normalizeValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  const trimmed = String(value).trim();

  if (trimmed === "") {
    return null;
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  const numericValue = Number(trimmed);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  return trimmed;
}

function normalizeBigIntValue(value) {
  const normalized = normalizeValue(value);

  if (normalized === null) {
    return null;
  }

  const numericValue = Number(normalized);
  return Number.isFinite(numericValue) ? Math.trunc(numericValue) : null;
}

function normalizeBooleanValue(value) {
  const normalized = normalizeValue(value);

  if (normalized === null) {
    return null;
  }

  if (typeof normalized === "boolean") {
    return normalized;
  }

  if (typeof normalized === "number") {
    return normalized !== 0;
  }

  const text = String(normalized).trim().toLowerCase();
  if (["true", "1", "online", "connected", "active"].includes(text)) {
    return true;
  }

  if (["false", "0", "offline", "disconnected", "idle"].includes(text)) {
    return false;
  }

  return null;
}

function normalizeNumberValue(value) {
  const normalized = normalizeValue(value);

  if (normalized === null) {
    return null;
  }

  const numericValue = Number(normalized);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function toTelemetryPoint(ts, value) {
  if (value === null || value === undefined) {
    return null;
  }

  return {
    ts: Math.trunc(Number(ts)),
    value,
  };
}

function serializeRow(row) {
  if (!row) {
    return {};
  }

  const payload = {};
  const keys = [
    "loudness",
    "bell_state",
    "last_pattern",
    "last_ring_time",
    "esp_online",
    "lte_signal",
  ];

  for (const key of keys) {
    const point = toTelemetryPoint(row.ts, row[key]);
    payload[key] = point ? [point] : [];
  }

  return payload;
}

export async function ensureStorageReady() {
  if (schemaReady) {
    return;
  }

  await getPool().query(CREATE_TABLE_SQL);
  schemaReady = true;
}

export async function saveTelemetrySample(sample) {
  await ensureStorageReady();

  const row = {
    device_id: sample.deviceId,
    ts: Math.trunc(Number(sample.ts || Date.now())),
    loudness: normalizeNumberValue(sample.loudness),
    bell_state:
      sample.bell_state === undefined
        ? null
        : normalizeValue(sample.bell_state),
    last_pattern:
      sample.last_pattern === undefined
        ? null
        : normalizeValue(sample.last_pattern),
    last_ring_time: normalizeBigIntValue(sample.last_ring_time),
    esp_online:
      sample.esp_online === undefined
        ? null
        : normalizeBooleanValue(sample.esp_online),
    lte_signal:
      sample.lte_signal === undefined
        ? null
        : normalizeNumberValue(sample.lte_signal),
    raw_payload: sample.rawPayload || {},
  };

  if (!row.device_id) {
    throw new Error("Cannot save telemetry without device_id.");
  }

  const hasMeaningfulValue =
    row.loudness !== null ||
    row.bell_state !== null ||
    row.last_pattern !== null ||
    row.last_ring_time !== null ||
    row.esp_online !== null ||
    row.lte_signal !== null;

  if (!hasMeaningfulValue) {
    return null;
  }

  await getPool().query(
    `
      INSERT INTO telemetry_samples (
        device_id,
        ts,
        loudness,
        bell_state,
        last_pattern,
        last_ring_time,
        esp_online,
        lte_signal,
        raw_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      row.device_id,
      row.ts,
      row.loudness,
      row.bell_state,
      row.last_pattern,
      row.last_ring_time,
      row.esp_online,
      row.lte_signal,
      row.raw_payload,
    ],
  );

  return row;
}

function normalizeRequestedKeys(keys) {
  if (Array.isArray(keys)) {
    return keys.filter(Boolean);
  }

  if (typeof keys === "string") {
    return keys
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);
  }

  return [
    "loudness",
    "bell_state",
    "last_pattern",
    "last_ring_time",
    "esp_online",
    "lte_signal",
  ];
}

export async function getTelemetryHistory({
  deviceId,
  keys,
  startTs = Date.now() - 24 * 60 * 60 * 1000,
  endTs = Date.now(),
}) {
  await ensureStorageReady();

  const requestedKeys = normalizeRequestedKeys(keys);

  const { rows } = await getPool().query(
    `
      SELECT
        ts,
        loudness,
        bell_state,
        last_pattern,
        last_ring_time,
        esp_online,
        lte_signal
      FROM telemetry_samples
      WHERE device_id = $1
        AND ts BETWEEN $2 AND $3
      ORDER BY ts ASC
      LIMIT 2000
    `,
    [deviceId, Math.trunc(Number(startTs)), Math.trunc(Number(endTs))],
  );

  return requestedKeys.reduce((snapshot, key) => {
    const column = key === "microphone_loudness" ? "loudness" : key;

    snapshot[key] = rows
      .map((row) => {
        if (row[column] === null || row[column] === undefined) {
          return null;
        }

        return {
          ts: Number(row.ts),
          value: row[column],
        };
      })
      .filter(Boolean);

    return snapshot;
  }, {});
}

export async function getLatestTelemetrySnapshot(deviceId) {
  await ensureStorageReady();

  const { rows } = await getPool().query(
    `
      SELECT
        ts,
        loudness,
        bell_state,
        last_pattern,
        last_ring_time,
        esp_online,
        lte_signal
      FROM telemetry_samples
      WHERE device_id = $1
      ORDER BY ts DESC
      LIMIT 1
    `,
    [deviceId],
  );

  return rows[0] || null;
}
