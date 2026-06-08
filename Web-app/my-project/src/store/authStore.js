import { create } from "zustand";
import { persist } from "zustand/middleware";
import { appConfig, normalizeBaseUrl } from "../config";

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      username: appConfig.username,
      baseUrl: normalizeBaseUrl(appConfig.baseUrl),
      hasHydrated: false,
      authEpoch: 0,
      setAuth: ({ token, username, baseUrl }) =>
        set({
          token,
          username: username || get().username,
          baseUrl: normalizeBaseUrl(baseUrl || get().baseUrl),
          hasHydrated: true,
          authEpoch: get().authEpoch + 1,
        }),
      setBaseUrl: (baseUrl) => set({ baseUrl: normalizeBaseUrl(baseUrl) }),
      logout: () =>
        set({
          token: null,
          hasHydrated: true,
          authEpoch: get().authEpoch + 1,
        }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "church-bell-dashboard-auth",
      partialize: (state) => ({
        token: state.token,
        username: state.username,
        baseUrl: state.baseUrl,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (!error && state) {
          state.setHasHydrated(true);
        }
      },
    },
  ),
);
