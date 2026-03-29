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

  const fetchDashboardData = async (currentContext: string) => {
    if (!workerId) {
      router.push("/");
      return;
    }

    try {
      const [qRes, pRes, cRes, lifecycleRes, payRes, payoutRes] = await Promise.all([
        fetch(
          `${API_BASE}/api/v1/policy/quote?zone=${zone}&disruption_context=${currentContext}`,
        ),
        fetch(`${API_BASE}/api/v1/policy/active/${workerId}`),
        fetch(`${API_BASE}/api/v1/claims/${workerId}`),
        fetch(`${API_BASE}/api/v1/claims/lifecycle/${workerId}`),
        fetch(`${API_BASE}/api/v1/payments/${workerId}`),
        fetch(`${API_BASE}/api/v1/payouts/${workerId}`),
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
      const checkoutRes = await fetch(`${API_BASE}/api/v1/payments/checkout`, {
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

      const confirmRes = await fetch(`${API_BASE}/api/v1/payments/confirm`, {
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
      const triggerRes = await fetch(`${API_BASE}/api/v1/admin/triggers`, {
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
      <header className="surface-card rise flex items-center justify-between p-4 md:p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-black/55">
            Worker Protection Command
          </p>
          <h1 className="text-3xl">giggity</h1>
          <p className="text-sm text-black/65">
            {workerName} | Worker #{workerId ?? "-"} | {zone}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/")}
            className="rounded-xl border border-black/15 bg-white/75 px-3 py-2 text-sm font-medium"
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
            className="rounded-xl border border-black/15 bg-white/75 p-2"
            aria-label="Log out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="surface-card rise p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-black/55">
              Disruption Context
            </p>
            <h2 className="text-2xl">Weekly Payment Rollout</h2>
          </div>
          <select
            value={disruptionContext}
            onChange={(event) => setDisruptionContext(event.target.value)}
            className="rounded-xl border border-black/20 bg-white px-4 py-2 text-sm"
          >
            <option value="NORMAL">NORMAL</option>
            <option value="SEVERE_WEATHER">SEVERE_WEATHER</option>
            <option value="PANDEMIC">PANDEMIC</option>
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-black/15 bg-white/90 p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-black/55">Premium</p>
            <p className="mt-1 text-4xl font-semibold">Rs {quote?.recommended_premium ?? "--"}</p>
            <p className="mt-2 text-sm text-black/65">
              Multiplier {quote?.factors?.pricing_multiplier ?? "--"}x under {quote?.disruption_context}
            </p>
          </article>

          <article className="rounded-2xl border border-black/15 bg-white/90 p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-black/55">Coverage</p>
            <p className="mt-1 text-4xl font-semibold">Rs {quote?.cover_amount ?? "--"}</p>
            <p className="mt-2 text-sm text-black/65">Risk band: {quote?.risk_level ?? "--"}</p>
          </article>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.14em] text-black/55">
            <span>Disruption ribbon</span>
            <span>{quote?.disruption_context ?? "--"}</span>
          </div>
          <div className="signal-ribbon h-5">
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
            className="accent-btn mt-6 flex w-full items-center justify-center gap-2 px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loadingAction ? <Loader2 className="animate-spin" size={18} /> : <CreditCard size={18} />}
            Run Basic Payment Rollout
          </button>
        ) : (
          <div className="mt-6 rounded-2xl border border-emerald-600/35 bg-emerald-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-emerald-700">
              <BadgeCheck size={18} />
              <p className="text-sm font-semibold uppercase tracking-[0.14em]">
                Policy Active
              </p>
            </div>
            <p className="text-sm text-emerald-900/80">
              Your weekly cover is live. Claims now move through automatic payout routing.
            </p>
          </div>
        )}
      </section>

      <section className="surface-card rise p-5 md:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-2xl">Rollout Timeline</h3>
          <button
            onClick={handleTriggerPandemic}
            disabled={loadingAction || !hasActivePolicy}
            className="rounded-xl border border-black/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Simulate Pandemic Trigger
          </button>
        </div>

        <ul className="space-y-3">
          <li className="rounded-xl border border-black/15 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-black/55">Step 1</p>
            <p className="font-semibold">Quote generated with disruption context</p>
            <p className="text-sm text-black/70">{quote?.disruption_context} and zone {quote?.zone}</p>
          </li>
          <li className="rounded-xl border border-black/15 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-black/55">Step 2</p>
            <p className="font-semibold">Payment gateway simulation</p>
            <p className="text-sm text-black/70">
              {latestPayment
                ? `Latest transaction ${latestPayment.provider_ref} is ${latestPayment.status}`
                : "No payment attempt yet"}
            </p>
          </li>
          <li className="rounded-xl border border-black/15 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-black/55">Step 3</p>
            <p className="font-semibold">Auto claim and payout release</p>
            <p className="text-sm text-black/70">
              {claimLifecycle.length > 0
                ? `${claimLifecycle.length} lifecycle event(s) recorded with explicit payout states.`
                : "No payout lifecycle yet"}
            </p>
          </li>
        </ul>
      </section>

      <section className="surface-card p-5">
        <h4 className="mb-3 text-xl">Pandemic Lifecycle Feed</h4>
        <div className="space-y-2">
          {claimLifecycle.length === 0 ? (
            <p className="text-sm text-black/65">No lifecycle events yet.</p>
          ) : (
            claimLifecycle.map((event) => (
              <div
                key={event.claim_id}
                className="rounded-xl border border-black/12 bg-white/80 px-3 py-2 text-sm"
              >
                <p className="font-semibold">
                  Claim #{event.claim_id} | {event.trigger_type}
                </p>
                <p className="text-black/70">
                  Severity {event.trigger_severity} | Claim {event.claim_status} | Payout {event.payout_status ?? "N/A"}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="surface-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Landmark size={16} />
            <h4 className="text-xl">Claims</h4>
          </div>
          <div className="space-y-2">
            {claims.length === 0 ? (
              <p className="text-sm text-black/65">No claims yet.</p>
            ) : (
              claims.map((claim) => (
                <div key={claim.id} className="rounded-xl border border-black/12 bg-white/80 px-3 py-2 text-sm">
                  Claim #{claim.id} | Rs {claim.amount} | {claim.status}
                </div>
              ))
            )}
          </div>
        </article>

        <article className="surface-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert size={16} />
            <h4 className="text-xl">Payouts</h4>
          </div>
          <div className="space-y-2">
            {payouts.length === 0 ? (
              <p className="text-sm text-black/65">No payouts yet.</p>
            ) : (
              payouts.map((payout) => (
                <div key={payout.id} className="rounded-xl border border-black/12 bg-white/80 px-3 py-2 text-sm">
                  Rs {payout.amount} | {payout.status}
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
            exit={{ opacity: 0, y: 8 }}
            className="surface-card rounded-2xl border-red-300 bg-red-50 p-4"
          >
            <p className="text-sm font-medium text-red-700">{errorMessage}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
