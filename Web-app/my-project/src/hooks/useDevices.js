import { useQuery } from "@tanstack/react-query";
import { fetchDevices } from "../api/thingsboard";

export function useDevices() {
  return useQuery({
    queryKey: ["devices"],
    queryFn: fetchDevices,
    refetchInterval: 15000,
  });
}
