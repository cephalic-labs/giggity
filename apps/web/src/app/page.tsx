"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type AuthMode = "chooser" | "register" | "login";

type RegisterForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  currentZone: string;
};

type LoginForm = {
  email: string;
  password: string;
};

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("chooser");
  const [registerForm, setRegisterForm] = useState<RegisterForm>({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    currentZone: "ZONE_A",
  });
  const [loginForm, setLoginForm] = useState<LoginForm>({
    email: "",
    password: "",
  });
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const confirmMatches =
    registerForm.confirmPassword.length > 0 &&
    registerForm.password === registerForm.confirmPassword;
  const confirmMismatch =
    registerForm.confirmPassword.length > 0 &&
    registerForm.password !== registerForm.confirmPassword;

  const persistAuthContext = async (
    accessToken: string,
    refreshToken: string,
  ) => {
    const meRes = await fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!meRes.ok) {
      throw new Error("Unable to load your worker profile.");
    }

    const me = (await meRes.json()) as { user_id: number; role: string; email: string };
    const userRes = await fetch(`${API_BASE}/api/v1/users/${me.user_id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!userRes.ok) {
      throw new Error("Unable to load account details.");
    }

    const user = (await userRes.json()) as { name: string; current_zone: string };

    localStorage.setItem("giggity_access_token", accessToken);
    localStorage.setItem("giggity_refresh_token", refreshToken);
    localStorage.setItem("giggity_user_id", me.user_id.toString());
    localStorage.setItem("giggity_role", me.role);
    localStorage.setItem("giggity_zone", user.current_zone);
    localStorage.setItem("giggity_worker_name", user.name);
  };

  const signIn = async (email: string, password: string) => {
    const tokenRes = await fetch(`${API_BASE}/api/v1/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        password,
      }),
    });

    if (!tokenRes.ok) {
      throw new Error("Invalid email or password.");
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
    };

    await persistAuthContext(tokenData.access_token, tokenData.refresh_token);
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (registerForm.password !== registerForm.confirmPassword) {
      setErrorMessage("Password and confirm password do not match.");
      return;
    }

    setLoading(true);

    try {
      const userRes = await fetch(`${API_BASE}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: registerForm.name.trim(),
          email: registerForm.email.trim(),
          phone: registerForm.phone.trim(),
          password: registerForm.password,
          current_zone: registerForm.currentZone,
        }),
      });

      if (userRes.status === 409) {
        setErrorMessage("Email already registered. Please sign in.");
        setMode("login");
        setLoginForm((previous) => ({
          ...previous,
          email: registerForm.email.trim(),
        }));
        return;
      }

      if (!userRes.ok) {
        throw new Error("Unable to register worker profile right now.");
      }

      await signIn(registerForm.email, registerForm.password);
      router.push("/dashboard");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong. Try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      await signIn(loginForm.email, loginForm.password);
      router.push("/dashboard");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong. Try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage(null);
    setSuccessMessage(null);
    if (nextMode === "register") {
      setSuccessMessage("Create your account to activate weekly protection.");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-4 py-10 md:px-8">
      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-stretch">
        <section className="rise space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/12 bg-white/80 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.22em]">
            <ShieldAlert size={14} className="text-orange-700" />
            Zero-Touch Income Insurance
          </div>

          <div className="space-y-4">
            <h1 className="max-w-xl leading-tight text-[var(--color-ink)]">
              Income cover that behaves like emergency infrastructure.
            </h1>

            <p className="max-w-xl text-lg leading-relaxed text-black/70">
              Register once, buy weekly protection in under a minute, and let the system
              trigger support automatically when disruptions escalate.
            </p>
          </div>

          <div className="surface-card-elevated p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="metric-label">Real-time Disruption Sensor</h3>
              <span className="metric-label">LIVE FEED</span>
            </div>
            <div className="signal-ribbon h-6 rounded-xl">
              <span style={{ width: "72%" }} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="metric-label">NORMAL</p>
                <p className="text-sm font-semibold text-green-700">40%</p>
              </div>
              <div className="text-center">
                <p className="metric-label">STRESSED</p>
                <p className="text-sm font-semibold text-amber-700">66%</p>
              </div>
              <div className="text-center">
                <p className="metric-label">CRITICAL</p>
                <p className="text-sm font-semibold text-red-700">88%</p>
              </div>
            </div>
          </div>
        </section>

        <section
          className={`surface-card-elevated rise p-7 md:p-8 ${mode === "chooser" ? "flex min-h-[100px] flex-col" : ""}`}
        >
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 p-2.5">
              <Sparkles size={20} className="text-orange-700" />
            </div>
            <div>
              <h2 className="text-2xl">
                {mode === "chooser"
                  ? "Get started"
                  : mode === "register"
                    ? "Create your protection profile"
                    : "Sign in to your account"}
              </h2>
              <p className="text-sm text-black/60">
                {mode === "chooser"
                  ? "Choose how you want to continue"
                  : mode === "register"
                    ? "Secure onboarding in under 60 seconds"
                    : "Continue your weekly protection workflow"}
              </p>
            </div>
          </div>

          {mode === "chooser" ? (
            <div className="mt-auto space-y-3">
              <h1 className="mb-3 text-center leading-tight text-[var(--color-ink)]">
                giggity
              </h1>

              <button
                type="button"
                onClick={() => switchMode("register")}
                className="accent-btn flex w-full items-center justify-center gap-2 px-5 py-3.5 text-base font-semibold"
              >
                Register
                <ArrowRight size={18} />
              </button>

              <button
                type="button"
                onClick={() => switchMode("login")}
                className="w-full rounded-xl border border-black/15 bg-white/70 px-5 py-3 text-sm font-semibold text-black/80 transition hover:border-black/25 hover:bg-white"
              >
                Login
              </button>
            </div>
          ) : mode === "register" ? (
            <form onSubmit={handleRegister} className="space-y-4">
              <label className="block text-sm">
                <span className="mb-2 block font-medium text-black/85">Full name</span>
                <input
                  value={registerForm.name}
                  onChange={(event) =>
                    setRegisterForm((previous) => ({ ...previous, name: event.target.value }))
                  }
                  required
                  autoComplete="name"
                  className="w-full rounded-xl border border-black/15 bg-white/70 px-4 py-3 outline-none transition duration-200 backdrop-blur-sm focus:border-orange-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(194,65,12,0.1)]"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-2 block font-medium text-black/85">Email</span>
                <input
                  type="email"
                  value={registerForm.email}
                  onChange={(event) =>
                    setRegisterForm((previous) => ({ ...previous, email: event.target.value }))
                  }
                  required
                  autoComplete="email"
                  className="w-full rounded-xl border border-black/15 bg-white/70 px-4 py-3 outline-none transition duration-200 backdrop-blur-sm focus:border-orange-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(194,65,12,0.1)]"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-2 block font-medium text-black/85">Phone</span>
                <input
                  value={registerForm.phone}
                  onChange={(event) =>
                    setRegisterForm((previous) => ({ ...previous, phone: event.target.value }))
                  }
                  required
                  autoComplete="tel"
                  className="w-full rounded-xl border border-black/15 bg-white/70 px-4 py-3 outline-none transition duration-200 backdrop-blur-sm focus:border-orange-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(194,65,12,0.1)]"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-2 block font-medium text-black/85">Password</span>
                <div className="relative">
                  <input
                    type={showRegisterPassword ? "text" : "password"}
                    value={registerForm.password}
                    onChange={(event) =>
                      setRegisterForm((previous) => ({ ...previous, password: event.target.value }))
                    }
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-black/15 bg-white/70 px-4 py-3 pr-12 outline-none transition duration-200 backdrop-blur-sm focus:border-orange-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(194,65,12,0.1)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegisterPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-black/60 transition hover:bg-black/5 hover:text-black/85"
                    aria-label={showRegisterPassword ? "Hide password" : "Show password"}
                  >
                    {showRegisterPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <label className="block text-sm">
                <span className="mb-2 block font-medium text-black/85">Confirm password</span>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={registerForm.confirmPassword}
                    onChange={(event) =>
                      setRegisterForm((previous) => ({ ...previous, confirmPassword: event.target.value }))
                    }
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={`w-full rounded-xl border bg-white/70 px-4 py-3 pr-12 outline-none transition duration-200 backdrop-blur-sm focus:bg-white ${confirmMismatch ? "border-red-500 focus:border-red-600 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""} ${confirmMatches ? "border-green-500 focus:border-green-600 focus:shadow-[0_0_0_3px_rgba(22,163,74,0.12)]" : ""} ${!confirmMatches && !confirmMismatch ? "border-black/15 focus:border-orange-600 focus:shadow-[0_0_0_3px_rgba(194,65,12,0.1)]" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-black/60 transition hover:bg-black/5 hover:text-black/85"
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {confirmMismatch ? (
                  <span className="mt-1 block text-xs font-medium text-red-700">Passwords do not match.</span>
                ) : null}
                {confirmMatches ? (
                  <span className="mt-1 block text-xs font-medium text-green-700">Passwords match.</span>
                ) : null}
              </label>

              <label className="block text-sm">
                <span className="mb-2 block font-medium text-black/85">Service Zone</span>
                <select
                  value={registerForm.currentZone}
                  onChange={(event) =>
                    setRegisterForm((previous) => ({ ...previous, currentZone: event.target.value }))
                  }
                  className="w-full rounded-xl border border-black/15 bg-white/70 px-4 py-3 outline-none transition duration-200 backdrop-blur-sm focus:border-orange-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(194,65,12,0.1)]"
                >
                  <option value="ZONE_A">Zone A</option>
                  <option value="ZONE_B">Zone B</option>
                  <option value="ZONE_C">Zone C</option>
                </select>
              </label>

              {errorMessage ? (
                <p className="rounded-lg border border-red-300/50 bg-gradient-to-br from-red-50 to-pink-50 px-4 py-3 text-sm font-medium text-red-700">
                  {errorMessage}
                </p>
              ) : null}

              {successMessage ? (
                <p className="rounded-lg border border-green-300/50 bg-gradient-to-br from-green-50 to-emerald-50 px-4 py-3 text-sm font-medium text-green-700">
                  {successMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading || confirmMismatch}
                className="accent-btn flex w-full items-center justify-center gap-2 px-5 py-3.5 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                Create Account
                <ArrowRight size={18} />
              </button>

              <button
                type="button"
                onClick={() => switchMode("login")}
                className="w-full rounded-xl border border-black/15 bg-white/70 px-5 py-3 text-sm font-semibold text-black/80 transition hover:border-black/25 hover:bg-white"
              >
                Already registered? Login
              </button>

              <button
                type="button"
                onClick={() => switchMode("chooser")}
                className="w-full rounded-xl border border-black/10 bg-transparent px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-black/55 transition hover:border-black/20 hover:text-black/80"
              >
                Back
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <label className="block text-sm">
                <span className="mb-2 block font-medium text-black/85">Email</span>
                <input
                  type="email"
                  value={loginForm.email}
                  onChange={(event) =>
                    setLoginForm((previous) => ({ ...previous, email: event.target.value }))
                  }
                  required
                  autoComplete="email"
                  className="w-full rounded-xl border border-black/15 bg-white/70 px-4 py-3 outline-none transition duration-200 backdrop-blur-sm focus:border-orange-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(194,65,12,0.1)]"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-2 block font-medium text-black/85">Password</span>
                <div className="relative">
                  <input
                    type={showLoginPassword ? "text" : "password"}
                    value={loginForm.password}
                    onChange={(event) =>
                      setLoginForm((previous) => ({ ...previous, password: event.target.value }))
                    }
                    required
                    minLength={8}
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-black/15 bg-white/70 px-4 py-3 pr-12 outline-none transition duration-200 backdrop-blur-sm focus:border-orange-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(194,65,12,0.1)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-black/60 transition hover:bg-black/5 hover:text-black/85"
                    aria-label={showLoginPassword ? "Hide password" : "Show password"}
                  >
                    {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              {errorMessage ? (
                <p className="rounded-lg border border-red-300/50 bg-gradient-to-br from-red-50 to-pink-50 px-4 py-3 text-sm font-medium text-red-700">
                  {errorMessage}
                </p>
              ) : null}

              {successMessage ? (
                <p className="rounded-lg border border-green-300/50 bg-gradient-to-br from-green-50 to-emerald-50 px-4 py-3 text-sm font-medium text-green-700">
                  {successMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="accent-btn flex w-full items-center justify-center gap-2 px-5 py-3.5 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                Login
                <ArrowRight size={18} />
              </button>

              <button
                type="button"
                onClick={() => switchMode("register")}
                className="w-full rounded-xl border border-black/15 bg-white/70 px-5 py-3 text-sm font-semibold text-black/80 transition hover:border-black/25 hover:bg-white"
              >
                New here? Register
              </button>

              <button
                type="button"
                onClick={() => switchMode("chooser")}
                className="w-full rounded-xl border border-black/10 bg-transparent px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-black/55 transition hover:border-black/20 hover:text-black/80"
              >
                Back
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
