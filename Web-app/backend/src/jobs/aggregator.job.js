import { config } from "../config.js";
import {
  ensureStorageReady,
  saveTelemetrySample,
} from "../services/storage.service.js";
import { fetchDeviceTelemetryFromThingsBoard } from "../services/thingsboard.service.js";

function latestPoint(points = []) {
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }

  return points.reduce((latest, current) => {
    if (!latest) {
      return current;
    }

    return Number(current.ts) > Number(latest.ts) ? current : latest;
  }, null);
}

function normalizeValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "boolean" || typeof value === "number") {
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

function hasMeaningfulValue(sample) {
  return [
    sample.microphone_loudness,
    sample.bell_state,
    sample.last_pattern,
    sample.last_ring_time,
    sample.esp_online,
    sample.lte_signal,
  ].some((value) => value !== null && value !== undefined);
}

export async function runAggregator(deviceId = config.thingsboardDeviceId) {
  await ensureStorageReady();

  if (!deviceId) {
    throw new Error("THINGSBOARD_DEVICE_ID is not configured.");
  }

  const telemetry = await fetchDeviceTelemetryFromThingsBoard(
    deviceId,
    config.telemetryKeys,
  );

  console.log(
    "Aggregating telemetry for device:",
    deviceId,
    "Telemetry:",
    telemetry,
  );

  const latestLoudness = latestPoint(telemetry.microphone_loudness);
  const latestBellState = latestPoint(telemetry.bell_state);
  const latestPattern = latestPoint(telemetry.last_pattern);
  const latestRingTime = latestPoint(telemetry.last_ring_time);
  const latestEspOnline = latestPoint(telemetry.esp_online);
  const latestLteSignal = latestPoint(telemetry.lte_signal);

  const sample = {
    deviceId,
    ts:
      Math.max(
        ...[
          latestLoudness?.ts,
          latestBellState?.ts,
          latestPattern?.ts,
          latestRingTime?.ts,
          latestEspOnline?.ts,
          latestLteSignal?.ts,
        ]
          .map((value) => Number(value))
          .filter(Number.isFinite),
      ) || Date.now(),
    loudness: normalizeValue(latestLoudness?.value),
    bell_state: normalizeValue(latestBellState?.value),
    last_pattern: normalizeValue(latestPattern?.value),
    last_ring_time: normalizeValue(latestRingTime?.value),
    esp_online: normalizeValue(latestEspOnline?.value),
    lte_signal: normalizeValue(latestLteSignal?.value),
    rawPayload: telemetry,
  };

  if (!hasMeaningfulValue(sample)) {
    return null;
  }

  await saveTelemetrySample(sample);

  return sample;
}
