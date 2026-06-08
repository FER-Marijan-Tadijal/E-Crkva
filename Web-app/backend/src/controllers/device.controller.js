import { getLatestTelemetrySnapshot } from "../services/storage.service.js";

export const getLatestDeviceTelemetry = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const snapshot = await getLatestTelemetrySnapshot(deviceId);

    if (!snapshot) {
      return res.status(404).json({
        message: "No stored telemetry found for this device.",
      });
    }

    res.json(snapshot);
  } catch (error) {
    next(error);
  }
};
