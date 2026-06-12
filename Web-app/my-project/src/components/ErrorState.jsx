export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}) {
  return (
    <div className="rounded-3xl border border-rose-500/20 bg-rose-950/40 p-6 text-rose-100 shadow-lg shadow-rose-950/20">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-rose-100/80">
        {message || "The dashboard could not complete the request."}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-full border border-rose-300/30 bg-white/5 px-4 py-2 text-sm font-medium text-rose-50 transition hover:bg-white/10"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
