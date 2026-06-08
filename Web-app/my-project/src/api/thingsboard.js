import axios from "axios";
import { apiClient } from "./client";
import { normalizeBaseUrl } from "../config";

const DEFAULT_DEVICE_PAGE_SIZE = 100;

export async function loginToThingsBoard({ baseUrl, username, password }) {
  const client = axios.create({
    baseURL: normalizeBaseUrl(baseUrl),
    timeout: 15000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  const response = await client.post("/api/auth/login", {
    username,
    password,
  });

  return response.data;
}

export function extractToken(loginResponse) {
  return (
    loginResponse?.token ||
    loginResponse?.jwtToken ||
    loginResponse?.accessToken ||
    loginResponse?.data?.token ||
    ""
  );
}

export async function fetchDevices() {
  const response = await apiClient.get("/api/tenant/devices", {
    params: {
      pageSize: DEFAULT_DEVICE_PAGE_SIZE,
      page: 0,
    },
  });

  const payload = response.data;

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.content)) {
    return payload.content;
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  return [];
}

export async function fetchDeviceTelemetry(deviceId, keys) {
  const response = await apiClient.get(
    `/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries`,
    {
      params: {
        keys: Array.isArray(keys) ? keys.join(",") : keys,
      },
    },
  );

  return response.data || {};
}

export async function fetchDeviceHistory({ deviceId, key, startTs, endTs }) {
  const response = await apiClient.get(
    `/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries`,
    {
      params: {
        keys: key,
        startTs,
        endTs,
      },
    },
  );

  return response.data || {};
}

export async function sendDeviceRpc({ deviceId, method, params }) {
  const response = await apiClient.post(`/api/plugins/rpc/oneway/${deviceId}`, {
    method,
    params,
  });

  return response.data;
}
