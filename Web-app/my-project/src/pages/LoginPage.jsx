import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { appConfig } from "../config";
import { useLogin } from "../hooks/useLogin";
import { useAuthStore } from "../store/authStore";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((state) => state.token);
  const login = useLogin();
  const autoAttempted = useRef(false);

  const initialValues = useMemo(
    () => ({
      baseUrl: appConfig.baseUrl,
      username: appConfig.username,
      password: appConfig.password,
    }),
    [],
  );

  const [form, setForm] = useState(initialValues);

  useEffect(() => {
    if (
      !autoAttempted.current &&
      initialValues.baseUrl &&
      initialValues.username &&
      initialValues.password
    ) {
      autoAttempted.current = true;
      login.mutate(initialValues, {
        onSuccess: () => {
          const target = location.state?.from?.pathname || "/";
          navigate(target, { replace: true });
        },
      });
    }
  }, [initialValues, login, location.state, navigate]);

  useEffect(() => {
    if (token) {
      navigate("/", { replace: true });
    }
  }, [navigate, token]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    login.mutate(form, {
      onSuccess: () => {
        const target = location.state?.from?.pathname || "/";
        navigate(target, { replace: true });
      },
    });
  };

  if (login.isSuccess) {
    return (
      <LoadingState
        label="Signing in"
        description="Preparing the live telemetry workspace."
      />
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-10">
          <p className="text-xs uppercase tracking-[0.4em] text-amber-300/80">
            ThingsBoard access
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
            Church bell tower operations dashboard
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            Sign in to monitor loudness, bell state, LTE health, and control the
            tower with RPC commands.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <InfoCard
              title="Live telemetry"
              text="Microphone loudness, ring events, signal strength"
            />
            <InfoCard
              title="Remote control"
              text="Ring, reset, or trigger patterns from one panel"
            />
            <InfoCard
              title="Auto refresh"
              text="Telemetry refreshes every few seconds without reloads"
            />
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8">
          <h2 className="text-2xl font-semibold text-slate-50">Sign in</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Use a ThingsBoard tenant user to access the dashboard.
          </p>

          {login.isError ? (
            <div className="mt-5">
              <ErrorState
                message={
                  login.error?.message ||
                  "Login failed. Check the API URL and credentials."
                }
              />
            </div>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <Field
              label="ThingsBoard base URL"
              value={form.baseUrl}
              onChange={(value) =>
                setForm((current) => ({ ...current, baseUrl: value }))
              }
              placeholder="http://localhost:8080"
            />
            <Field
              label="Username"
              value={form.username}
              onChange={(value) =>
                setForm((current) => ({ ...current, username: value }))
              }
              placeholder="tenant user"
            />
            <Field
              label="Password"
              type="password"
              value={form.password}
              onChange={(value) =>
                setForm((current) => ({ ...current, password: value }))
              }
              placeholder="••••••••"
            />

            <button
              type="submit"
              disabled={login.isPending}
              className="w-full rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {login.isPending ? "Signing in..." : "Open dashboard"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.3em] text-slate-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-amber-300/40"
      />
    </label>
  );
}

function InfoCard({ title, text }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <h3 className="text-sm font-semibold text-slate-50">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
    </article>
  );
}
