import axios from "axios";
import { normalizeBaseUrl } from "../config";
import { useAuthStore } from "../store/authStore";

export const apiClient = axios.create({
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  const { token, baseUrl } = useAuthStore.getState();
  config.baseURL = normalizeBaseUrl(baseUrl);
  config.headers = config.headers || {};
  config.headers.Accept = "application/json";

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  console.log("➡️ API REQUEST");
  console.log("URL:", `${config.baseURL}${config.url}`);
  console.log("METHOD:", config.method);
  console.log("HEADERS:", config.headers);
  console.log("PARAMS:", config.params);
  console.log("DATA:", config.data);

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      useAuthStore.getState().logout();
    }

    return Promise.reject(error);
  },
);
