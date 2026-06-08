export const appConfig = {
  baseUrl: import.meta.env.VITE_THINGSBOARD_BASE_URL || "",
  username: import.meta.env.VITE_THINGSBOARD_USERNAME || "",
  password: import.meta.env.VITE_THINGSBOARD_PASSWORD || "",
  backendBaseUrl:
    import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:4000",
};

export function normalizeBaseUrl(baseUrl) {
  return (baseUrl || appConfig.baseUrl || "").replace(/\/+$/, "");
}

export function normalizeBackendBaseUrl(baseUrl) {
  return (baseUrl || appConfig.backendBaseUrl || "").replace(/\/+$/, "");
}
