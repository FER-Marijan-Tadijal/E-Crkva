import { useMutation } from "@tanstack/react-query";
import { sendDeviceRpc } from "../api/thingsboard";

export function useDeviceActions() {
  return useMutation({
    mutationFn: sendDeviceRpc,
  });
}
