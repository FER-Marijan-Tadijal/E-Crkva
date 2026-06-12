export function LoadingState({
  label = "Loading",
  description = "Please wait while data is being fetched.",
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/70 p-8 text-center shadow-2xl shadow-black/30 backdrop-blur">
        <div className="mx-auto mb-5 h-14 w-14 animate-pulse rounded-full border border-amber-300/40 bg-amber-300/10" />
        <h1 className="text-2xl font-semibold text-slate-50">{label}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
      </div>
    </div>
  );
}
