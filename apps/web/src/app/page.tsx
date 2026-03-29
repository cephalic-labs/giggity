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
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-4 py-10 md:px-8">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <section className="rise space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em]">
            <ShieldAlert size={14} />
            Pandemic Basic Payment Rollout
          </div>

          <h1 className="max-w-xl text-4xl leading-tight text-[var(--color-ink)] md:text-6xl">
            Income cover that behaves like emergency infrastructure.
          </h1>

          <p className="max-w-xl text-base leading-relaxed text-black/70 md:text-lg">
            Register once, buy weekly protection in under a minute, and let the system
            trigger support automatically when disruptions escalate.
          </p>

          <div className="surface-card p-5">
            <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-black/60">
              <span>Signal Readiness</span>
              <span>Realtime</span>
            </div>
            <div className="signal-ribbon h-4">
              <span style={{ width: "82%" }} />
            </div>
            <p className="mt-3 text-sm text-black/60">
              Differentiation anchor: the live disruption ribbon stays visible through
              onboarding and dashboard so workers always know current risk posture.
            </p>
          </div>
        </section>

        <section className="surface-card rise p-6 md:p-8">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl border border-black/10 bg-black/5 p-2">
              <Sparkles size={18} />
            </div>
            <h2 className="text-2xl">Start your protection profile</h2>
          </div>

          <form onSubmit={handleStart} className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Full name</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, name: event.target.value }))
                }
                required
                className="w-full rounded-xl border border-black/20 bg-white/80 px-4 py-3 outline-none transition focus:border-black/40"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, email: event.target.value }))
                }
                required
                className="w-full rounded-xl border border-black/20 bg-white/80 px-4 py-3 outline-none transition focus:border-black/40"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Phone</span>
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, phone: event.target.value }))
                }
                required
                className="w-full rounded-xl border border-black/20 bg-white/80 px-4 py-3 outline-none transition focus:border-black/40"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Active zone</span>
              <select
                value={form.currentZone}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, currentZone: event.target.value }))
                }
                className="w-full rounded-xl border border-black/20 bg-white/80 px-4 py-3 outline-none transition focus:border-black/40"
              >
                <option value="ZONE_A">ZONE_A</option>
                <option value="ZONE_B">ZONE_B</option>
                <option value="ZONE_C">ZONE_C</option>
              </select>
            </label>

            {errorMessage ? (
              <p className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="accent-btn flex w-full items-center justify-center gap-2 px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : null}
              Continue to Dashboard
              <ArrowRight size={17} />
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
