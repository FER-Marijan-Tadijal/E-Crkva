import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

const navItems = [
  { to: "/", label: "Dashboard" },
  // { to: "/history", label: "History" },
];

export function AppShell() {
  const username = useAuthStore((state) => state.username);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-7xl flex-col rounded-[2rem] border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <header className="border-b border-white/10 px-5 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-amber-300/80">
                ThingsBoard Church Network
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-50">
                Bell tower monitoring and control
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                Live telemetry, device health, and RPC control in one place.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <nav className="flex flex-wrap gap-2 rounded-full border border-white/10 bg-white/5 p-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      [
                        "rounded-full px-4 py-2 text-sm font-medium transition",
                        isActive
                          ? "bg-amber-300 text-slate-950"
                          : "text-slate-300 hover:bg-white/5 hover:text-slate-50",
                      ].join(" ")
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        </header>

        <main className="flex-1 px-5 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
