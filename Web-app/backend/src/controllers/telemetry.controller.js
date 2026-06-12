import { saveTelemetrySample } from "../services/storage.service.js";

export const ingestTelemetry = async (req, res, next) => {
  try {
    const sample = req.body || {};

    await saveTelemetrySample({
      deviceId: sample.deviceId,
      ts: sample.ts,
      loudness: sample.microphone_loudness,
      bell_state: sample.bell_state,
      last_pattern: sample.last_pattern,
      last_ring_time: sample.last_ring_time,
      esp_online: sample.esp_online,
      lte_signal: sample.lte_signal,
      rawPayload: sample.rawPayload || sample,
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};
