import axios from "axios";
import { appConfig, normalizeBackendBaseUrl } from "../config";

const backendClient = axios.create({
  baseURL: normalizeBackendBaseUrl(appConfig.backendBaseUrl),
  timeout: 15000,
  headers: {
    Accept: "application/json",
  },
});

export async function fetchBackendDeviceHistory({
  deviceId,
  key,
  startTs,
  endTs,
}) {
  const response = await backendClient.get(`/api/history/${deviceId}`, {
    params: {
      key,
      startTs,
      endTs,
    },
  });

  return response.data || {};
}

export async function fetchBackendLatestDeviceTelemetry(deviceId) {
  const response = await backendClient.get(`/api/devices/${deviceId}/latest`);
  return response.data || null;
}
