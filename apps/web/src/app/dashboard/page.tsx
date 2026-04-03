"use client";

import { useEffect, useState, useRef } from "react";
import {
  BadgeCheck,
  CreditCard,
  Landmark,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  LogOut,
  ShieldAlert,
  Activity,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

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
    if (typeof window === "undefined") return null;
    const accessToken = localStorage.getItem("giggity_access_token");
    const refreshToken = localStorage.getItem("giggity_refresh_token");
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken };
  };

  const refreshAccessToken = async (refreshToken: string) => {
    const refreshRes = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!refreshRes.ok) throw new Error("Session expired. Please sign in again.");
    const data = (await refreshRes.json()) as { access_token: string; refresh_token: string };
    localStorage.setItem("giggity_access_token", data.access_token);
    localStorage.setItem("giggity_refresh_token", data.refresh_token);
    return data.access_token;
  };

  const authFetch = async (input: string, init: RequestInit = {}) => {
    const tokens = getTokens();
    if (!tokens) throw new Error("No active session. Please sign in.");

    const run = async (accessToken: string) =>
      fetch(input, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${accessToken}`,
        },
      });

    let res = await run(tokens.accessToken);
    if (res.status === 401) {
      const newAccessToken = await refreshAccessToken(tokens.refreshToken);
      res = await run(newAccessToken);
    }
    return res;
  };

  const fetchDashboardData = async (currentContext: string) => {
    if (!workerId) {
      router.push("/signin");
      return;
    }

    try {
      const [qRes, pRes, cRes, lifecycleRes, payRes, payoutRes] = await Promise.all([
        authFetch(`${API_BASE}/api/v1/policy/quote?zone=${zone}&disruption_context=${currentContext}`),
        authFetch(`${API_BASE}/api/v1/policy/active/${workerId}`),
        authFetch(`${API_BASE}/api/v1/claims/${workerId}`),
        authFetch(`${API_BASE}/api/v1/claims/lifecycle/${workerId}`),
        authFetch(`${API_BASE}/api/v1/payments/${workerId}`),
        authFetch(`${API_BASE}/api/v1/payouts/${workerId}`),
      ]);

      if ([qRes, pRes, cRes, lifecycleRes, payRes, payoutRes].some((res) => !res.ok)) {
        throw new Error("Data synchronization failed.");
      }

      setQuote(await qRes.json());
      setPolicies(await pRes.json());
      setClaims(await cRes.json());
      setClaimLifecycle(await lifecycleRes.json());
      setPayments(await payRes.json());
      setPayouts(await payoutRes.json());
      setErrorMessage(null);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Connection lost.");
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
    if (!workerId || !quote) return;
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
      if (!checkoutRes.ok) throw new Error("Checkout failed.");
      const checkout = (await checkoutRes.json()) as { checkout_id: number };

      const confirmRes = await authFetch(`${API_BASE}/api/v1/payments/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkout_id: checkout.checkout_id, payment_success: true }),
      });
      if (!confirmRes.ok) throw new Error("Confirmation failed.");

      await fetchDashboardData(disruptionContext);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Transaction error.");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleTriggerPandemic = async () => {
    if (!workerId) return;
    setLoadingAction(true);
    try {
      const triggerRes = await authFetch(`${API_BASE}/api/v1/admin/triggers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone: zone, trigger_type: "PANDEMIC", severity: 0.9 }),
      });
      if (!triggerRes.ok) throw new Error("Simulation failed.");
      setTimeout(() => fetchDashboardData(disruptionContext), 700);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Simulation error.");
    } finally {
      setLoadingAction(false);
    }
  };

  const hasActivePolicy = policies.length > 0;
  const latestPayment = payments[0];

  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-[#F4F4F0] flex items-center justify-center p-8">
        <div className="font-mono text-[10px] uppercase tracking-widest flex items-center gap-3">
          <Loader2 className="animate-spin" size={14} />
          Synchronizing Security Board
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F4F0] text-[#1A1A1A] font-body selection:bg-[#C0392B] selection:text-white pb-20">
      {/* Header */}
      <header className="bg-[#F4F4F0] border-b border-[#1A1A1A]">
        <div className="max-w-[1080px] mx-auto px-6 md:px-12 py-8 flex justify-between items-end">
          <div className="space-y-4">
            <div className="text-4xl font-serif font-black tracking-tighter">Giggity</div>
            <div className="flex items-center gap-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-50 mb-1">Active Worker</p>
                <h1 className="font-serif italic font-bold text-xl">{workerName}</h1>
              </div>
              <div className="h-8 w-px bg-[#1A1A1A]/10" />
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-50 mb-1">Zone Assignment</p>
                <h2 className="font-serif italic font-bold text-xl">{zone.replace("_", " ")}</h2>
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => { localStorage.clear(); router.push("/signin"); }}
              className="p-3 border border-[#1A1A1A]/10 hover:border-[#C0392B] transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1080px] mx-auto px-6 md:px-12 mt-12 grid grid-cols-12 gap-8">
        {/* Left Column - Main Action */}
        <section className="col-span-12 lg:col-span-7 space-y-8">
          <div className="border border-[#1A1A1A] bg-white p-10 space-y-8">
            <div className="flex justify-between items-start border-b border-[#1A1A1A]/5 pb-8">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-50 mb-2 underline decoration-[#C0392B] underline-offset-4">disruption sensor</p>
                <h2 className="text-3xl font-serif italic font-bold">Weekly Protection</h2>
              </div>
              <select
                value={disruptionContext}
                onChange={(e) => setDisruptionContext(e.target.value)}
                className="font-mono text-[10px] uppercase tracking-widest border border-[#1A1A1A]/10 px-4 py-2 outline-none focus:border-[#C0392B]"
              >
                <option value="NORMAL">NORMAL</option>
                <option value="SEVERE_WEATHER">WEATHER</option>
                <option value="PANDEMIC">PANDEMIC</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-px bg-[#1A1A1A]/5 border-y border-[#1A1A1A]/5">
              <div className="py-8 bg-white pr-8">
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-40 mb-4">Weekly Premium</p>
                <p className="text-5xl font-serif font-black tracking-tighter">₹{quote?.recommended_premium ?? "--"}</p>
                <p className="mt-4 font-mono text-[10px] text-[#C0392B] uppercase tracking-widest">
                  {quote?.factors?.pricing_multiplier}x Multiplier Active
                </p>
              </div>
              <div className="py-8 bg-white pl-8 border-l border-[#1A1A1A]/5">
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-40 mb-4">Total Coverage</p>
                <p className="text-5xl font-serif font-black tracking-tighter">₹{quote?.cover_amount ?? "--"}</p>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-widest">
                  Risk Band: <span className="font-bold">{quote?.risk_level}</span>
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">Disruption Probability</p>
                <p className="font-mono text-[10px] uppercase tracking-widest">{quote?.disruption_context}</p>
              </div>
              <div className="h-px bg-[#1A1A1A]/10 w-full relative overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ 
                    width: disruptionContext === "PANDEMIC" ? "88%" : disruptionContext === "SEVERE_WEATHER" ? "66%" : "40%" 
                  }}
                  className="absolute h-full bg-[#C0392B]"
                />
              </div>
            </div>

            {!hasActivePolicy ? (
              <Button 
                onClick={handleCheckoutAndConfirm}
                disabled={loadingAction || !quote}
                className="w-full py-6 text-base"
              >
                {loadingAction ? <Loader2 className="animate-spin mr-2" size={18} /> : <Zap size={18} className="mr-2" />}
                Activate Protection Profile
              </Button>
            ) : (
              <div className="border border-[#C0392B] p-6 flex items-start gap-4 bg-[#C0392B]/5">
                <BadgeCheck size={24} className="text-[#C0392B] mt-1" />
                <div>
                  <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#C0392B] font-bold mb-1">Coverage Live</h3>
                  <p className="text-sm opacity-80 italic">Your weekly protection is active. Claims are auto-routed thru the Reality Engine.</p>
                </div>
              </div>
            )}
          </div>

          <div className="border border-[#1A1A1A] bg-[#1A1A1A] p-1 text-white">
            <div className="border border-white/10 p-10 space-y-8">
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-serif italic font-bold">Rollout Timeline</h3>
                {currentRole === "ADMIN" && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleTriggerPandemic}
                    disabled={loadingAction || !hasActivePolicy}
                    className="border-white/50 text-white hover:bg-white hover:text-[#1A1A1A]"
                  >
                    Simulate Pandemic
                  </Button>
                )}
              </div>
              
              <div className="space-y-6">
                {[
                  { step: "01", label: "Protocol Initialization", detail: `Quote generated for context: ${quote?.disruption_context}`, done: true },
                  { step: "02", label: "Premium Verification", detail: latestPayment ? `TX_REF: ${latestPayment.provider_ref} (${latestPayment.status})` : "Pending roll-out sequence", done: !!latestPayment },
                  { step: "03", label: "Claim Orchestration", detail: claimLifecycle.length > 0 ? `${claimLifecycle.length} lifecycle events detected` : "Awaiting sensor trigger", done: claimLifecycle.length > 0 },
                ].map((item, i) => (
                  <div key={i} className="flex gap-6 items-start">
                    <span className={`font-mono text-sm ${item.done ? "text-[#C0392B]" : "opacity-30"}`}>/{item.step}</span>
                    <div>
                      <h4 className={`text-sm font-bold uppercase tracking-widest ${item.done ? "" : "opacity-30"}`}>{item.label}</h4>
                      <p className="text-xs opacity-50 font-mono mt-1">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Right Column - Feeds */}
        <section className="col-span-12 lg:col-span-5 space-y-8">
          <div className="border border-[#1A1A1A] bg-white p-8">
            <div className="flex items-center gap-3 mb-8 border-b border-[#1A1A1A]/5 pb-4">
              <Activity size={18} className="text-[#C0392B]" />
              <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold">Lifecycle Feed</h3>
            </div>
            <div className="space-y-6 max-h-[400px] overflow-y-auto no-scrollbar">
              {claimLifecycle.length === 0 ? (
                <p className="text-xs opacity-40 italic py-8 text-center">No lifecycle events detected in current epoch.</p>
              ) : (
                claimLifecycle.map((event) => (
                  <div key={event.claim_id} className="border border-[#1A1A1A]/5 p-5 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-widest opacity-40 mb-1">Claim #{event.claim_id}</p>
                        <h4 className="font-serif italic font-bold">{event.trigger_type}</h4>
                      </div>
                      <span className={`font-mono text-[8px] uppercase tracking-widest px-2 py-1 ${event.claim_status === "APPROVED" ? "bg-[#C0392B] text-white" : "border border-[#1A1A1A]/10"}`}>
                        {event.claim_status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-[#1A1A1A]/5">
                      <p className="text-xs font-mono">Payout: {event.payout_status ?? "Syncing..."}</p>
                      {event.payout_amount && <span className="font-serif font-bold text-[#C0392B]">₹{event.payout_amount.toFixed(0)}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8">
            <article className="border border-[#1A1A1A] bg-white p-8">
              <div className="flex items-center gap-3 mb-6 border-b border-[#1A1A1A]/5 pb-4">
                <Landmark size={18} className="text-[#C0392B]" />
                <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold">Ledger: Claims</h3>
              </div>
              <div className="space-y-3">
                {claims.length === 0 ? (
                  <p className="text-xs opacity-40 italic">Empty ledger.</p>
                ) : (
                  claims.map((c) => (
                    <div key={c.id} className="flex justify-between items-center font-mono text-[10px] border-b border-[#1A1A1A]/5 pb-2">
                      <span className="opacity-50">#{c.id}</span>
                      <span className="font-bold">₹{c.amount}</span>
                      <span className={c.status === "APPROVED" ? "text-[#C0392B]" : ""}>{c.status}</span>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="border border-[#1A1A1A] bg-[#F4F4F0] p-8">
              <div className="flex items-center gap-3 mb-6 border-b border-[#1A1A1A]/10 pb-4">
                <ShieldAlert size={18} className="text-[#C0392B]" />
                <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold">Ledger: Payouts</h3>
              </div>
              <div className="space-y-3">
                {payouts.length === 0 ? (
                  <p className="text-xs opacity-40 italic">Empty ledger.</p>
                ) : (
                  payouts.map((p) => (
                    <div key={p.id} className="flex justify-between items-center font-mono text-[10px] border-b border-[#1A1A1A]/10 pb-2">
                      <span className="opacity-50">#{p.id}</span>
                      <span className="font-bold">₹{p.amount}</span>
                      <span className="text-[#C0392B]">{p.status}</span>
                    </div>
                  ))
                )}
              </div>
            </article>
          </div>
        </section>
      </main>

      {/* Persistence Error Overlay */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#C0392B] text-white p-6 border border-white/20 z-[100] flex gap-4 items-center"
          >
            <AlertTriangle size={20} />
            <p className="font-mono text-[10px] uppercase tracking-widest">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="ml-8 font-mono text-[10px] uppercase tracking-widest border border-white/30 px-3 py-1 hover:bg-white hover:text-[#C0392B]">Dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
