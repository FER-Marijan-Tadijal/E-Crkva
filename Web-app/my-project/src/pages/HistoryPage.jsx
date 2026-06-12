import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { useDeviceHistory } from "../hooks/useDeviceHistory";
import { useDevices } from "../hooks/useDevices";
import {
  getDeviceId,
  getDeviceName,
  resolveEsp32Device,
  telemetrySeriesToChartData,
} from "../utils/telemetry";

export function HistoryPage() {
  const { deviceId: routeDeviceId } = useParams();
  const devicesQuery = useDevices();
  const devices = devicesQuery.data || [];

  const device = useMemo(() => {
    if (!devices.length) return null;

    // 1. ako postoji deviceId u URL-u → koristi njega
    if (routeDeviceId) {
      return devices.find((d) => getDeviceId(d) === routeDeviceId) || null;
    }

    // 2. fallback → prvi ESP32
    return resolveEsp32Device(devices);
  }, [devices, routeDeviceId]);

  const resolvedDeviceId = getDeviceId(device);
  const startTs = useMemo(() => Date.now() - 24 * 60 * 60 * 1000, []);
  const endTs = useMemo(() => Date.now(), []);
  const historyQuery = useDeviceHistory(
    resolvedDeviceId,
    "loudness",
    startTs,
    endTs,
    {
      refetchInterval: 15000,
    },
  );

  if (devicesQuery.isLoading) {
    return (
      <LoadingState
        label="Loading history"
        description="Fetching the list of devices before building the chart."
      />
    );
  }

  if (devicesQuery.isError) {
    return (
      <ErrorState
        message={devicesQuery.error?.message || "Failed to load devices."}
        onRetry={devicesQuery.refetch}
      />
    );
  }

  if (!resolvedDeviceId) {
    return (
      <ErrorState
        title="ESP32 device not found"
        message="There is no ESP32 device available in the current ThingsBoard tenant."
      />
    );
  }

  if (routeDeviceId && routeDeviceId !== resolvedDeviceId) {
    return <Navigate to={`/history/${resolvedDeviceId}`} replace />;
  }

  if (historyQuery.isLoading) {
    return (
      <LoadingState
        label="Loading chart"
        description="Reading loudness telemetry for the selected tower."
      />
    );
  }

  if (historyQuery.isError) {
    return (
      <ErrorState
        message={
          historyQuery.error?.message || "Failed to load telemetry history."
        }
        onRetry={historyQuery.refetch}
      />
    );
  }

  const historyData = telemetrySeriesToChartData(
    historyQuery.data?.loudness || historyQuery.data?.microphone_loudness || [],
  );
  const currentDevice = device;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="History"
        title="Microphone loudness history"
        description="Review the last 24 hours of loudness telemetry across the selected device."
        action={
          <Link
            to={`/devices/${resolvedDeviceId}`}
            className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10"
          >
            Open device detail
          </Link>
        }
      />

      <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-5 shadow-lg shadow-black/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-amber-300/80">
              Selected device
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-50">
              {currentDevice ? getDeviceName(currentDevice) : "Select a device"}
            </h3>
          </div>

          <div className="min-w-[260px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
              Device
            </p>
            <p className="mt-2 font-medium text-slate-100">
              {currentDevice ? getDeviceName(currentDevice) : "ESP32 device"}
            </p>
          </div>
        </div>

        <div className="mt-6 h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historyData}>
              <CartesianGrid
                stroke="rgba(148, 163, 184, 0.15)"
                strokeDasharray="4 4"
              />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(value) =>
                  new Intl.DateTimeFormat("hr-HR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(value))
                }
                stroke="#94a3b8"
              />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  background: "#020617",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "16px",
                }}
                labelFormatter={(value) =>
                  new Date(value).toLocaleString("hr-HR")
                }
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#fbbf24"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
