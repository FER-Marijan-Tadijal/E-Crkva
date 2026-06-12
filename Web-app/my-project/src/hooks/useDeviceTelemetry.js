import { useQuery } from "@tanstack/react-query";
import { fetchDeviceTelemetry } from "../api/thingsboard";

export function useDeviceTelemetry(deviceId, keys, options = {}) {
  return useQuery({
    queryKey: ["device-telemetry", deviceId, keys],
    queryFn: () => fetchDeviceTelemetry(deviceId, keys),
    enabled: Boolean(deviceId),
    refetchInterval: options.refetchInterval ?? 7000,
    ...options,
  });
}
