import { useMutation } from "@tanstack/react-query";
import { extractToken, loginToThingsBoard } from "../api/thingsboard";
import { useAuthStore } from "../store/authStore";

export function useLogin() {
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: loginToThingsBoard,
    onSuccess: (data, variables) => {
      const token = extractToken(data);

      if (!token) {
        throw new Error("Login succeeded, but the JWT token was missing.");
      }

      setAuth({
        token,
        username: variables.username,
        baseUrl: variables.baseUrl,
      });
    },
  });
}
