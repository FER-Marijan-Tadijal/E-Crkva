export function ControlPanel({
  pattern,
  onPatternChange,
  patternOptions = [],
  onRing,
  onReset,
  onSendPattern,
  isLoading,
}) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-5 shadow-lg shadow-black/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-amber-300/80">
            Bell control
          </p>
          <h3 className="mt-2 text-xl font-semibold text-slate-50">
            RPC commands
          </h3>
          <p className="mt-2 text-sm text-slate-300">
            Send one-way commands to ring, reset, or trigger a pattern.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onRing}
            disabled={isLoading}
            className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Ring bell
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={isLoading}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex-1">
          <span className="mb-2 block text-xs uppercase tracking-[0.3em] text-slate-500">
            Pattern preset
          </span>
          <select
            value={pattern}
            onChange={(event) => onPatternChange(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-50 outline-none transition focus:border-amber-300/40"
          >
            {patternOptions.map((option) => (
              <option
                key={option.value}
                value={option.value}
                className="bg-slate-950"
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onSendPattern}
          disabled={isLoading || !pattern.trim()}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send pattern
        </button>
      </div>
    </div>
  );
}
