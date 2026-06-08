import axios from "axios";
import { config } from "../config.js";

let cachedToken = "";

function requireThingsBoardConfig() {
  if (!config.thingsboardBaseUrl) {
    throw new Error("THINGSBOARD_BASE_URL is not configured.");
  }

  if (!config.thingsboardUsername || !config.thingsboardPassword) {
    throw new Error(
      "THINGSBOARD_USERNAME or THINGSBOARD_PASSWORD is not configured.",
    );
  }
}

async function loginToThingsBoard() {
  requireThingsBoardConfig();

  const response = await axios.post(
    `${config.thingsboardBaseUrl}/api/auth/login`,
    {
      username: config.thingsboardUsername,
      password: config.thingsboardPassword,
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 15000,
    },
  );

  cachedToken =
    response.data?.token ||
    response.data?.jwtToken ||
    response.data?.accessToken ||
    response.data?.data?.token ||
    "";

  if (!cachedToken) {
    throw new Error("ThingsBoard login did not return a token.");
  }

  return cachedToken;
}

async function getThingsBoardToken(forceRefresh = false) {
  if (!forceRefresh && cachedToken) {
    return cachedToken;
  }

  return loginToThingsBoard();
}

function normalizeKeys(keys) {
  if (Array.isArray(keys)) {
    return keys.filter(Boolean);
  }

  if (typeof keys === "string") {
    return keys
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);
  }

  return config.telemetryKeys;
}

export async function fetchDeviceTelemetryFromThingsBoard(deviceId, keys) {
  const requestedKeys = normalizeKeys(keys);
  const token = await getThingsBoardToken();

  console.log("keys", keys, "requestedKeys", requestedKeys);

  const request = async (authToken) => {
    const response = await axios.get(
      `${config.thingsboardBaseUrl}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries`,
      {
        params: {
          keys: requestedKeys.join(","),
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: "application/json",
        },
        timeout: 15000,
      },
    );
    console.log("ThingsBoard response data:", response.data);

    return response.data || {};
  };

  try {
    return await request(token);
  } catch (error) {
    if (error?.response?.status === 401) {
      const refreshedToken = await getThingsBoardToken(true);
      return request(refreshedToken);
    }

    throw error;
  }
}
