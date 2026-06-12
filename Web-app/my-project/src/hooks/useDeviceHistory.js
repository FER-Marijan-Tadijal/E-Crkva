import { useQuery } from "@tanstack/react-query";
import { fetchBackendDeviceHistory } from "../api/backend";

export function useDeviceHistory(deviceId, key, startTs, endTs, options = {}) {
  return useQuery({
    queryKey: ["device-history", deviceId, key, startTs, endTs],
    queryFn: () => fetchBackendDeviceHistory({ deviceId, key, startTs, endTs }),
    enabled: Boolean(deviceId && key && startTs && endTs),
    ...options,
  });
}
