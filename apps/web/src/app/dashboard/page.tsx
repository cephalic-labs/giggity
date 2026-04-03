"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  CreditCard,
  Landmark,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

const API_BASE = "http://localhost:8000";

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type Quote = {
  zone: string;
  recommended_premium: number;
  cover_amount: number;
  risk_level: string;
  disruption_context: string;
  factors: {
    pricing_multiplier: number;
  };
};

type Policy = {
  id: number;
  cover_amount: number;
  status: string;
};

type Claim = {
  id: number;
  amount: number;
  status: string;
  created_at: string;
};

type ClaimLifecycleEvent = {
  claim_id: number;
  trigger_type: string;
  trigger_severity: number;
  claim_status: string;
  payout_status: string | null;
  payout_amount: number | null;
  created_at: string;
};

type Payout = {
  id: number;
  amount: number;
  status: string;
  created_at: string;
};

type Payment = {
  id: number;
  status: string;
  premium_amount: number;
  provider_ref: string;
};

export default function Dashboard() {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimLifecycle, setClaimLifecycle] = useState<ClaimLifecycleEvent[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingAction, setLoadingAction] = useState<boolean>(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [disruptionContext, setDisruptionContext] = useState("PANDEMIC");

  const workerId = typeof window !== "undefined" ? localStorage.getItem("giggity_user_id") : null;
  const workerName =
    typeof window !== "undefined"
      ? localStorage.getItem("giggity_worker_name") ?? "Worker"
      : "Worker";
  const zone = typeof window !== "undefined" ? localStorage.getItem("giggity_zone") || "ZONE_A" : "ZONE_A";
  const currentRole =
    typeof window !== "undefined" ? localStorage.getItem("giggity_role") ?? "WORKER" : "WORKER";

  const getTokens = (): AuthTokens | null => {
    if (typeof window === "undefined") {
      return null;
    }
    const accessToken = localStorage.getItem("giggity_access_token");
    const refreshToken = localStorage.getItem("giggity_refresh_token");
    if (!accessToken || !refreshToken) {
      return null;
    }
    return { accessToken, refreshToken };
  };

  const refreshAccessToken = async (refreshToken: string) => {
    const refreshRes = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!refreshRes.ok) {
      throw new Error("Session expired. Please sign in again.");
    }
    const data = (await refreshRes.json()) as {
      access_token: string;
      refresh_token: string;
    };
    localStorage.setItem("giggity_access_token", data.access_token);
    localStorage.setItem("giggity_refresh_token", data.refresh_token);
    return data.access_token;
  };

  const authFetch = async (input: string, init: RequestInit = {}) => {
    const tokens = getTokens();
    if (!tokens) {
      throw new Error("No active session. Please sign in.");
    }

    const run = async (accessToken: string) =>
      fetch(input, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${accessToken}`,
        },
      });

    let res = await run(tokens.accessToken);
    if (res.status !== 401) {
      return res;
    }

    const newAccessToken = await refreshAccessToken(tokens.refreshToken);
    res = await run(newAccessToken);
    return res;
  };

  const fetchDashboardData = async (currentContext: string) => {
    if (!workerId) {
      router.push("/");
      return;
    }

    try {
      const [qRes, pRes, cRes, lifecycleRes, payRes, payoutRes] = await Promise.all([
        authFetch(
          `${API_BASE}/api/v1/policy/quote?zone=${zone}&disruption_context=${currentContext}`,
        ),
        authFetch(`${API_BASE}/api/v1/policy/active/${workerId}`),
        authFetch(`${API_BASE}/api/v1/claims/${workerId}`),
        authFetch(`${API_BASE}/api/v1/claims/lifecycle/${workerId}`),
        authFetch(`${API_BASE}/api/v1/payments/${workerId}`),
        authFetch(`${API_BASE}/api/v1/payouts/${workerId}`),
      ]);

      if ([qRes, pRes, cRes, lifecycleRes, payRes, payoutRes].some((res) => !res.ok)) {
        throw new Error("Could not load dashboard data. Check backend availability.");
      }

      const quoteData = (await qRes.json()) as Quote;
      const policyData = (await pRes.json()) as Policy[];
      const claimData = (await cRes.json()) as Claim[];
      const lifecycleData = (await lifecycleRes.json()) as ClaimLifecycleEvent[];
      const paymentData = (await payRes.json()) as Payment[];
      const payoutData = (await payoutRes.json()) as Payout[];

      setQuote(quoteData);
      setPolicies(policyData);
      setClaims(claimData);
      setClaimLifecycle(lifecycleData);
      setPayments(paymentData);
      setPayouts(payoutData);
      setErrorMessage(null);
    } catch (e) {
      setErrorMessage(
        e instanceof Error ? e.message : "Something went wrong while loading data.",
      );
    } finally {
      setIsInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(disruptionContext);
    const interval = setInterval(() => fetchDashboardData(disruptionContext), 8000);
    return () => clearInterval(interval);
  }, [router, disruptionContext]);

  const handleCheckoutAndConfirm = async () => {
    if (!workerId || !quote) {
      return;
    }

    setLoadingAction(true);

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);

    try {
      const checkoutRes = await authFetch(`${API_BASE}/api/v1/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worker_id: Number(workerId),
          zone: zone,
          premium_amount: quote.recommended_premium,
          cover_amount: quote.cover_amount,
          end_date: endDate.toISOString(),
        }),
      });

      if (!checkoutRes.ok) {
        throw new Error("Unable to initiate payment checkout.");
      }

      const checkout = (await checkoutRes.json()) as { checkout_id: number };

      const confirmRes = await authFetch(`${API_BASE}/api/v1/payments/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkout_id: checkout.checkout_id,
          payment_success: true,
        }),
      });

      if (!confirmRes.ok) {
        throw new Error("Payment confirmation failed.");
      }

      await fetchDashboardData(disruptionContext);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to complete payment rollout.",
      );
    } finally {
      setLoadingAction(false);
    }
  };

  const handleTriggerPandemic = async () => {
    if (!workerId) {
      return;
    }

    setLoadingAction(true);

    try {
      const triggerRes = await authFetch(`${API_BASE}/api/v1/admin/triggers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zone: zone,
          trigger_type: "PANDEMIC",
          severity: 0.9,
        }),
      });

      if (!triggerRes.ok) {
        throw new Error("Unable to trigger pandemic simulation.");
      }

      setTimeout(() => fetchDashboardData(disruptionContext), 700);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to run simulation.",
      );
    } finally {
      setLoadingAction(false);
    }
  };

  const hasActivePolicy = policies.length > 0;
  const latestPayment = payments[0];

  if (isInitialLoading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-4">
        <div className="surface-card flex items-center gap-3 px-6 py-4 text-sm">
          <Loader2 className="animate-spin" size={18} />
          Loading worker protection board...
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 md:px-8">
      <header className="surface-card-elevated rise flex items-center justify-between p-5 md:p-6">
        <div>
          <p className="metric-label mb-1">Worker Protection Command</p>
          <h1 className="text-3xl">giggity</h1>
          <p className="text-sm text-black/65">
            {workerName} • Zone {zone.split("_")[1]}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/")}
            className="rounded-xl border border-black/15 bg-white/70 px-3 py-2 text-sm font-medium transition hover:bg-white hover:border-black/25"
          >
            <span className="inline-flex items-center gap-2">
              <ArrowLeft size={16} />
              Edit Profile
            </span>
          </button>
          <button
            onClick={() => {
              localStorage.clear();
              router.push("/");
            }}
            className="rounded-xl border border-black/15 bg-white/70 p-2.5 transition hover:bg-white hover:border-red-300"
            aria-label="Log out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="surface-card-elevated rise p-6 md:p-7">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="metric-label mb-2">Disruption Context</p>
            <h2 className="text-2xl">Weekly Payment Rollout</h2>
          </div>
          <select
            value={disruptionContext}
            onChange={(event) => setDisruptionContext(event.target.value)}
            className="w-full rounded-xl border border-black/15 bg-white/80 px-4 py-2.5 text-sm font-medium transition md:w-auto focus:border-orange-600 focus:shadow-[0_0_0_3px_rgba(194,65,12,0.1)]"
          >
            <option value="NORMAL">NORMAL</option>
            <option value="SEVERE_WEATHER">SEVERE WEATHER</option>
            <option value="PANDEMIC">PANDEMIC</option>
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="metric-card">
            <p className="metric-label">Weekly Premium</p>
            <p className="metric-value">Rs {quote?.recommended_premium ?? "--"}</p>
            <p className="mt-3 text-xs text-black/60">
              <span className="font-semibold text-orange-700">{quote?.factors?.pricing_multiplier ?? "--"}x</span> multiplier in {quote?.disruption_context}
            </p>
          </div>

          <div className="metric-card">
            <p className="metric-label">Coverage Amount</p>
            <p className="metric-value">Rs {quote?.cover_amount ?? "--"}</p>
            <p className="mt-3 text-xs text-black/60">
              Risk Band: <span className="font-semibold text-black/80">{quote?.risk_level ?? "--"}</span>
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="metric-label">Disruption Ribbon</h3>
            <span className="metric-label">{quote?.disruption_context ?? "--"}</span>
          </div>
          <div
            className="signal-ribbon h-7 rounded-full"
            style={{
              background: disruptionContext === "PANDEMIC" 
                ? "linear-gradient(90deg, #dcfce7 0%, #fed7aa 100%)"
                : disruptionContext === "SEVERE_WEATHER"
                  ? "linear-gradient(90deg, #dbeafe 0%, #fed7aa 100%)"
                  : "linear-gradient(90deg, #fef3c7 0%, #dbeafe 100%)",
            }}
          >
            <span
              style={{
                width:
                  disruptionContext === "PANDEMIC"
                    ? "88%"
                    : disruptionContext === "SEVERE_WEATHER"
                      ? "66%"
                      : "40%",
              }}
            />
          </div>
        </div>

        {!hasActivePolicy ? (
          <button
            onClick={handleCheckoutAndConfirm}
            disabled={loadingAction || !quote}
            className="accent-btn mt-6 flex w-full items-center justify-center gap-2 px-5 py-4 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingAction ? <Loader2 className="animate-spin" size={20} /> : <CreditCard size={20} />}
            Run Basic Payment Rollout
          </button>
        ) : (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-600/30 bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
            <div className="flex-shrink-0">
              <BadgeCheck size={22} className="text-emerald-700" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">
                Policy Active
              </p>
              <p className="mt-1 text-sm text-emerald-900/80">
                Your weekly protection is live and claims are auto-routed.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="surface-card-elevated rise p-6 md:p-7">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h3 className="text-2xl">Rollout Timeline</h3>
          <button
            onClick={handleTriggerPandemic}
            disabled={loadingAction || !hasActivePolicy || currentRole !== "ADMIN"}
            className="w-full rounded-xl border border-black/15 bg-white/80 px-4 py-2.5 text-sm font-semibold transition md:w-auto hover:bg-white hover:border-black/25 disabled:opacity-50"
          >
            {loadingAction ? <Loader2 className="inline mr-2 animate-spin" size={16} /> : null}
            Simulate Pandemic Trigger
          </button>
        </div>

        {currentRole !== "ADMIN" ? (
          <p className="mb-3 text-xs font-medium text-black/55">
            Trigger simulation is restricted to admin accounts.
          </p>
        ) : null}

        <ul className="space-y-3">
          <li className="metric-card">
            <div className="mb-2 flex items-center gap-2">
              <span className="state-badge active">
                <span className="h-1.5 w-1.5 rounded-full bg-green-700" />
                Step 1
              </span>
            </div>
            <p className="text-sm font-semibold">Quote generated with disruption context</p>
            <p className="text-sm text-black/70">{quote?.disruption_context} • zone {zone}</p>
          </li>
          <li className="metric-card">
            <div className="mb-2 flex items-center gap-2">
              <span className={`state-badge ${latestPayment ? "active" : "pending"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${latestPayment ? "bg-green-700" : "bg-amber-700"}`} />
                Step 2
              </span>
            </div>
            <p className="text-sm font-semibold">Payment gateway simulation</p>
            <p className="text-sm text-black/70">
              {latestPayment
                ? `Latest transaction: ${latestPayment.provider_ref} (${latestPayment.status})`
                : "No payment attempt yet"}
            </p>
          </li>
          <li className="metric-card">
            <div className="mb-2 flex items-center gap-2">
              <span className={`state-badge ${claimLifecycle.length > 0 ? "active" : "pending"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${claimLifecycle.length > 0 ? "bg-green-700" : "bg-amber-700"}`} />
                Step 3
              </span>
            </div>
            <p className="text-sm font-semibold">Auto claim and payout release</p>
            <p className="text-sm text-black/70">
              {claimLifecycle.length > 0
                ? `${claimLifecycle.length} lifecycle event(s) with explicit payout states.`
                : "No payout lifecycle yet"}
            </p>
          </li>
        </ul>
      </section>

      <section className="surface-card-elevated p-6 md:p-7">
        <h4 className="mb-5 text-2xl">Pandemic Lifecycle Feed</h4>
        <div className="space-y-3">
          {claimLifecycle.length === 0 ? (
            <div className="rounded-xl border border-black/10 bg-white/50 p-6 text-center">
              <p className="text-sm text-black/60">No lifecycle events yet. Trigger a simulation to see live claim progression.</p>
            </div>
          ) : (
            claimLifecycle.map((event) => (
              <div
                key={event.claim_id}
                className="metric-card"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="font-semibold text-black/85">Claim #{event.claim_id}</span>
                      <span className="text-xs text-black/60">•</span>
                      <span className="text-sm font-medium text-orange-700">{event.trigger_type}</span>
                    </div>
                    <p className="text-sm text-black/70">
                      Severity <span className="font-semibold">{(event.trigger_severity * 100).toFixed(0)}%</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`state-badge ${event.claim_status === "APPROVED" ? "active" : "pending"}`}>
                      Claim {event.claim_status}
                    </span>
                    <span className={`state-badge ${event.payout_status === "RELEASED" ? "active" : event.payout_status ? "risk" : "pending"}`}>
                      Payout {event.payout_status ?? "N/A"}
                    </span>
                  </div>
                </div>
                {event.payout_amount ? (
                  <p className="mt-3 text-sm font-semibold text-green-700">
                    ↳ Rs {event.payout_amount.toFixed(2)}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="surface-card-elevated p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 p-2">
              <Landmark size={18} className="text-blue-700" />
            </div>
            <h4 className="text-xl">Claims</h4>
          </div>
          <div className="space-y-2">
            {claims.length === 0 ? (
              <div className="rounded-lg border border-black/10 bg-white/50 p-4 text-center">
                <p className="text-sm text-black/60">No claims yet.</p>
              </div>
            ) : (
              claims.map((claim) => (
                <div key={claim.id} className="metric-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-black/60">Claim #{claim.id}</p>
                      <p className="text-sm font-semibold">Rs {claim.amount}</p>
                    </div>
                    <span className={`state-badge ${claim.status === "APPROVED" ? "active" : "pending"}`}>
                      {claim.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="surface-card-elevated p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-red-100 to-orange-100 p-2">
              <ShieldAlert size={18} className="text-red-700" />
            </div>
            <h4 className="text-xl">Payouts</h4>
          </div>
          <div className="space-y-2">
            {payouts.length === 0 ? (
              <div className="rounded-lg border border-black/10 bg-white/50 p-4 text-center">
                <p className="text-sm text-black/60">No payouts yet.</p>
              </div>
            ) : (
              payouts.map((payout) => (
                <div key={payout.id} className="metric-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-black/60">Payout #{payout.id}</p>
                      <p className="text-sm font-semibold">Rs {payout.amount}</p>
                    </div>
                    <span className={`state-badge ${payout.status === "RELEASED" ? "active" : "pending"}`}>
                      {payout.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <AnimatePresence>
        {errorMessage ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="surface-card-elevated border-red-300/50 bg-gradient-to-br from-red-50 to-pink-50 p-5"
          >
            <div className="flex gap-3">
              <AlertTriangle className="flex-shrink-0 text-red-700" size={20} />
              <p className="text-sm font-medium text-red-700">{errorMessage}</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
