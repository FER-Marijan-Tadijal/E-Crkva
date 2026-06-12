import { useMemo, useState, useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ControlPanel } from "../components/ControlPanel";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { useDeviceActions } from "../hooks/useDeviceActions";
import { useDeviceHistory } from "../hooks/useDeviceHistory";
import { useDeviceLatest } from "../hooks/useDeviceLatest";
import { useDevices } from "../hooks/useDevices";
import {
  formatRelativeTime,
  formatTelemetryValue,
  getDeviceId,
  getDeviceName,
  getDeviceStatus,
  resolveEsp32Device,
  telemetrySeriesToChartData,
} from "../utils/telemetry";

const PATTERN_PRESETS = [
  { label: "Normal", value: "10;1 1 1 1" },
  { label: "Alert", value: "15;4 3 2 1" },
  { label: "Critical", value: "20;5 5 5 5" },
];

export function DevicePage() {
  const { deviceId = "" } = useParams();
  const devicesQuery = useDevices();
  const devices = devicesQuery.data || [];

  const device = useMemo(() => {
    return devices.find((d) => getDeviceId(d) === deviceId);
  }, [devices, deviceId]);

  const resolvedDeviceId = getDeviceId(device);
  const historyStartTs = useMemo(() => Date.now() - 6 * 60 * 60 * 1000, []);
  const historyEndTs = useMemo(() => Date.now(), []);
  const rpcMutation = useDeviceActions();
  const [pattern, setPattern] = useState(PATTERN_PRESETS[0].value);
  const latestQuery = useDeviceLatest(resolvedDeviceId, {
    refetchInterval: 15000,
  });
  const historyQuery = useDeviceHistory(
    resolvedDeviceId,
    "loudness,bell_state",
    historyStartTs,
    historyEndTs,
    {
      refetchInterval: 15000,
    },
  );

  useEffect(() => {
    console.log("historyQuery:", historyQuery);
  }, []);

  if (devicesQuery.isLoading) {
    return (
      <LoadingState
        label="Loading device"
        description="Finding the requested church device and its latest telemetry."
      />
    );
  }

  if (!device) {
    return (
      <ErrorState
        title="Device not found"
        message="No ESP32 device was returned by ThingsBoard for this tenant."
        onRetry={devicesQuery.refetch}
      />
    );
  }

  if (latestQuery.isLoading) {
    return (
      <LoadingState
        label="Loading telemetry"
        description="Pulling the latest stored values from the backend database."
      />
    );
  }

  if (latestQuery.isError) {
    return (
      <ErrorState
        message={latestQuery.error?.message || "Telemetry request failed."}
        onRetry={latestQuery.refetch}
      />
    );
  }

  const snapshot = latestQuery.data || {};
  const status = getDeviceStatus(snapshot);

  if (historyQuery.isLoading) {
    return (
      <LoadingState
        label="Loading history"
        description="Reading loudness telemetry from the backend database."
      />
    );
  }

  if (historyQuery.isError) {
    return (
      <ErrorState
        message={historyQuery.error?.message || "History request failed."}
        onRetry={historyQuery.refetch}
      />
    );
  }

  const loudnessSeries = telemetrySeriesToChartData(
    historyQuery.data?.loudness || [],
  );
  const bellStateSeries = telemetrySeriesToChartData(
    historyQuery.data?.bell_state || [],
  );
  const latestTimestamp =
    snapshot.ts || loudnessSeries.at(-1)?.timestamp || null;

  const handleRpc = async (method, params = {}) => {
    await rpcMutation.mutateAsync({
      deviceId: resolvedDeviceId,
      method,
      params,
    });
    await Promise.all([latestQuery.refetch(), historyQuery.refetch()]);
  };

  const handlePattern = async () => {
    await handleRpc("bell.pattern", { pattern });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Device detail"
        title={getDeviceName(device)}
        description="Inspect live telemetry from the ESP32 bell tower, see the recent loudness trend, and control the bell through RPC commands."
        action={
          <Link
            to="/"
            className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10"
          >
            Back to dashboard
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Status"
          value={status.label}
          tone={status.tone}
          hint={`Last update ${formatRelativeTime(latestTimestamp)}`}
        />
        <MetricCard
          label="Loudness"
          value={`${formatTelemetryValue("loudness", snapshot.loudness)} dB`}
          hint="Current microphone telemetry"
        />
        {/* <MetricCard
          label="LTE signal"
          value={formatTelemetryValue("lte_signal", snapshot.lte_signal)}
          hint="Cellular connectivity strength"
        /> */}
        <MetricCard
          label="Bell pattern"
          value={formatTelemetryValue("last_pattern", snapshot.last_pattern)}
          hint="Most recent ringing pattern"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-5 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-amber-300/80">
                Live telemetry
              </p>
              <h3 className="mt-2 text-xl font-semibold text-slate-50">
                Microphone loudness trend
              </h3>
            </div>
            <div className="text-right text-sm text-slate-400">
              <p>{loudnessSeries.length} loudness samples</p>
            </div>
          </div>

          <div className="mt-6 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={loudnessSeries}>
                <defs>
                  <linearGradient id="loudnessFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.45} />
                    <stop
                      offset="100%"
                      stopColor="#fbbf24"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
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
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#fbbf24"
                  fill="url(#loudnessFill)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="space-y-5">
          <ControlPanel
            pattern={pattern}
            onPatternChange={setPattern}
            patternOptions={PATTERN_PRESETS}
            onRing={() => handleRpc("bell.ring")}
            onReset={() => handleRpc("bell.reset")}
            onSendPattern={handlePattern}
            isLoading={rpcMutation.isPending}
          />

          <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-5 shadow-lg shadow-black/20">
            <h3 className="text-xl font-semibold text-slate-50">
              Recent values
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ValueBox
                label="Bell state"
                value={formatTelemetryValue("bell_state", snapshot.bell_state)}
              />
              <ValueBox
                label="Last pattern"
                value={formatTelemetryValue(
                  "last_pattern",
                  snapshot.last_pattern,
                )}
              />
              <ValueBox
                label="ESP online"
                value={formatTelemetryValue("esp_online", snapshot.esp_online)}
              />
              <ValueBox
                label="Last ring time"
                value={formatTelemetryValue(
                  "last_ring_time",
                  snapshot.last_ring_time,
                )}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ValueBox({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-100">{value}</p>
    </div>
  );
}
