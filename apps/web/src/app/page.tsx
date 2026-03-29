"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, ShieldAlert, Sparkles } from "lucide-react";

const API_BASE = "http://localhost:8000";

type OnboardingForm = {
  name: string;
  email: string;
  phone: string;
  currentZone: string;
};

export default function Home() {
  const router = useRouter();
  const [form, setForm] = useState<OnboardingForm>({
    name: "Ravi Kumar",
    email: "ravi.kumar@example.com",
    phone: "+919876543210",
    currentZone: "ZONE_A",
  });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleStart = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      const userRes = await fetch(`${API_BASE}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          current_zone: form.currentZone,
        }),
      });

      let userId = 1;
      if (userRes.ok) {
        const data = await userRes.json();
        userId = data.id;
      } else {
        const usersRes = await fetch(`${API_BASE}/api/v1/users`);
        if (!usersRes.ok) {
          throw new Error("Unable to register worker profile right now.");
        }

        const users = (await usersRes.json()) as Array<{ id: number; email: string }>;
        const matchedUser = users.find((user) => user.email === form.email);
        if (!matchedUser) {
          throw new Error("Could not find an existing worker account.");
        }
        userId = matchedUser.id;
      }

      localStorage.setItem("giggity_user_id", userId.toString());
      localStorage.setItem("giggity_zone", form.currentZone);
      localStorage.setItem("giggity_worker_name", form.name);

      router.push("/dashboard");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong. Try again.",
      );
    } finally {
      setLoading(false);
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

        <section className="surface-card-elevated rise p-7 md:p-8">
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 p-2.5">
              <Sparkles size={20} className="text-orange-700" />
            </div>
            <div>
              <h2 className="text-2xl">Start your protection profile</h2>
              <p className="text-sm text-black/60">Takes 60 seconds</p>
            </div>
          </div>

          <form onSubmit={handleStart} className="space-y-4">
            <label className="block text-sm">
              <span className="mb-2 block font-medium text-black/85">Full name</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, name: event.target.value }))
                }
                required
                className="w-full rounded-xl border border-black/15 bg-white/70 px-4 py-3 outline-none transition duration-200 backdrop-blur-sm focus:border-orange-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(194,65,12,0.1)]"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-2 block font-medium text-black/85">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, email: event.target.value }))
                }
                required
                className="w-full rounded-xl border border-black/15 bg-white/70 px-4 py-3 outline-none transition duration-200 backdrop-blur-sm focus:border-orange-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(194,65,12,0.1)]"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-2 block font-medium text-black/85">Phone</span>
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, phone: event.target.value }))
                }
                required
                className="w-full rounded-xl border border-black/15 bg-white/70 px-4 py-3 outline-none transition duration-200 backdrop-blur-sm focus:border-orange-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(194,65,12,0.1)]"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-2 block font-medium text-black/85">Service Zone</span>
              <select
                value={form.currentZone}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, currentZone: event.target.value }))
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

            <button
              type="submit"
              disabled={loading}
              className="accent-btn flex w-full items-center justify-center gap-2 px-5 py-3.5 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : null}
              Continue to Dashboard
              <ArrowRight size={18} />
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
