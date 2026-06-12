import {
  getLatestTelemetrySnapshot,
  getTelemetryHistory,
} from "../services/storage.service.js";

export const getHistoryData = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { keys, startTs, endTs } = req.query;

    const history = await getTelemetryHistory({
      deviceId,
      keys,
      startTs,
      endTs,
    });

    res.json(history);
  } catch (error) {
    next(error);
  }
};

export const getLatestData = async (req, res, next) => {
  try {
    const { deviceId } = req.params;

    res.json(await getLatestTelemetrySnapshot(deviceId));
  } catch (error) {
    next(error);
  }
};
