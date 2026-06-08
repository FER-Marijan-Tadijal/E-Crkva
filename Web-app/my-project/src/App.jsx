import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ErrorState } from "./components/ErrorState";
import { LoadingState } from "./components/LoadingState";
import { appConfig } from "./config";
import { useLogin } from "./hooks/useLogin";
import { useAuthStore } from "./store/authStore";
import { DashboardPage } from "./pages/DashboardPage";
import { DevicePage } from "./pages/DevicePage";
import { HistoryPage } from "./pages/HistoryPage";
import "./App.css";

function App() {
  const token = useAuthStore((state) => state.token);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const authEpoch = useAuthStore((state) => state.authEpoch);
  const login = useLogin();

  useEffect(() => {
    console.log("Auth epoch:", authEpoch);
    console.log(appConfig);
    if (
      hasHydrated &&
      !token &&
      !login.isPending &&
      appConfig.baseUrl &&
      appConfig.username &&
      appConfig.password
    ) {
      login.mutate({
        baseUrl: appConfig.baseUrl,
        username: appConfig.username,
        password: appConfig.password,
      });
    }
  }, [authEpoch, hasHydrated, login, token]);

  if (!hasHydrated || (!token && login.isPending)) {
    return (
      <LoadingState
        label="Connecting to ThingsBoard"
        description="Using the fixed tenant credentials to restore the dashboard session."
      />
    );
  }

  if (!token && login.isError) {
    return (
      <ErrorState
        title="Connection failed"
        message={
          login.error?.message ||
          "Could not authenticate with ThingsBoard using the configured tenant credentials."
        }
        onRetry={() =>
          login.mutate({
            baseUrl: appConfig.baseUrl,
            username: appConfig.username,
            password: appConfig.password,
          })
        }
      />
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/devices/:deviceId?" element={<DevicePage />} />
        <Route path="/history/:deviceId?" element={<HistoryPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
