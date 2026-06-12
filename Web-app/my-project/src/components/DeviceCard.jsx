import { Link } from "react-router-dom";
import { formatTelemetryValue } from "../utils/telemetry";

const statusStyles = {
  success: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
  warning: "border-amber-400/20 bg-amber-500/10 text-amber-100",
  danger: "border-rose-400/20 bg-rose-500/10 text-rose-100",
  default: "border-white/10 bg-white/5 text-slate-200",
};

function Pill({ tone, children }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-medium ${statusStyles[tone] || statusStyles.default}`}
    >
      {children}
    </span>
  );
}

export function DeviceCard({ device, snapshot, status, error, loading }) {
  const name = device?.name || "Unnamed church";
  const deviceId = device?.id?.id || device?.id || "";
  const deviceType = device?.type || device?.deviceProfileName || "Device";

  return (
    <article className="flex h-full flex-col rounded-[1.75rem] border border-white/10 bg-slate-700/80 p-5 shadow-lg shadow-black/20 transition hover:-translate-y-1 hover:border-amber-300/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
            {deviceType}
          </p>
          <h3 className="mt-2 text-xl font-semibold text-slate-50">{name}</h3>
        </div>
        <Pill tone={status?.tone || "default"}>
          {status?.label || "Unknown"}
        </Pill>
      </div>

      <p className="mt-3 text-sm text-slate-400">ID: {deviceId || "N/A"}</p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-300">
          Fetching live telemetry...
        </p>
      ) : error ? (
        <p className="mt-4 text-sm text-rose-200">Telemetry unavailable.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Stat
            label="Loudness"
            value={`${formatTelemetryValue(
              "loudness",
              snapshot?.loudness ?? snapshot?.microphone_loudness,
            )} dB`}
          />
          {/* <Stat
            label="Signal"
            value={formatTelemetryValue("lte_signal", snapshot?.lte_signal)}
          />*/}
          <Stat
            label="Pattern"
            value={formatTelemetryValue("last_pattern", snapshot?.last_pattern)}
          />
          <Stat
            label="Last ring time"
            value={formatTelemetryValue(
              "last_ring_time",
              snapshot?.last_ring_time,
            )}
          />
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <Link
          to={`/devices/${deviceId}`}
          className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          Open detail
        </Link>
        <Link
          to={`/history/${deviceId}`}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10"
        >
          History
        </Link>
      </div>
    </article>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-100">{value}</p>
    </div>
  );
}
