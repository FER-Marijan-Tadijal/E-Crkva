import { useQuery } from "@tanstack/react-query";
import { fetchBackendLatestDeviceTelemetry } from "../api/backend";

export function useDeviceLatest(deviceId, options = {}) {
  return useQuery({
    queryKey: ["device-latest", deviceId],
    queryFn: () => fetchBackendLatestDeviceTelemetry(deviceId),
    enabled: Boolean(deviceId),
    refetchInterval: options.refetchInterval ?? 15000,
    ...options,
  });
}
