const tones = {
  default: "from-slate-800/90 to-slate-800/60 border-white/10",
  success: "from-emerald-500/40 to-emerald-500/20 border-emerald-400/20",
  warning: "from-amber-500/40 to-amber-500/20 border-amber-400/20",
  danger: "from-rose-500/40 to-rose-500/20 border-rose-400/20",
};

export function MetricCard({ label, value, hint, tone = "default" }) {
  return (
    <div
      className={`rounded-3xl border bg-gradient-to-br p-5 shadow-lg shadow-black/20 backdrop-blur ${tones[tone] || tones.default}`}
    >
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
        {label}
      </p>
      <div className="mt-3 text-3xl font-semibold text-slate-50">{value}</div>
      {hint ? (
        <p className="mt-2 text-sm leading-6 text-slate-300">{hint}</p>
      ) : null}
    </div>
  );
}
