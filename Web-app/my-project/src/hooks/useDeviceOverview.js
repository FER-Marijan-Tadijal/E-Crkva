import { useQueries } from "@tanstack/react-query";
import { fetchDeviceTelemetry } from "../api/thingsboard";
import {
  getDeviceId,
  getDeviceStatus,
  telemetrySnapshot,
} from "../utils/telemetry";

const OVERVIEW_KEYS = [
  "loudness",
  "microphone_loudness",
  "bell_state",
  "last_pattern",
  "esp_online",
  "lte_signal",
  "last_ring_time",
];

export function useDeviceOverview(devices = []) {
  const telemetryQueries = useQueries({
    queries: devices.map((device) => ({
      queryKey: ["device-overview", getDeviceId(device)],
      queryFn: () => fetchDeviceTelemetry(getDeviceId(device), OVERVIEW_KEYS),
      enabled: Boolean(getDeviceId(device)),
      refetchInterval: 10000,
      staleTime: 5000,
    })),
  });

  const items = devices.map((device, index) => {
    const telemetryQuery = telemetryQueries[index];
    const snapshot = telemetrySnapshot(telemetryQuery.data || {});

    return {
      device,
      snapshot,
      status: getDeviceStatus(snapshot),
      query: telemetryQuery,
    };
  });

  const isLoading = telemetryQueries.some((query) => query.isLoading);

  return {
    items,
    isLoading,
  };
}
