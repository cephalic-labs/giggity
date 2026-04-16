"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  BadgeCheck,
  LogOut,
  Zap,
  Activity,
  Landmark,
  ShieldCheck,
  CreditCard,
  CloudRain,
  Thermometer,
  Wind,
  Waves,
  AlertTriangle,
  Lock,
  BarChart3,
  Loader2,
  MapPin,
  TrendingUp,
  Users,
  FileText,
  DollarSign,
  Radio,
  FlaskConical,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import {
  LiveWeatherForecastDashboard,
  type ForecastData,
} from "@/components/dashboard/LiveWeatherForecastDashboard";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8000";

// ── Static zone metadata (mirrors backend ZONE_CONFIG) ───────────────────────
const ZONE_META: Record<string, { city: string; neighbourhood: string }> = {
  ZONE_A: { city: "Bangalore", neighbourhood: "BTM Layout" },
  ZONE_B: { city: "Mumbai", neighbourhood: "Dharavi" },
  ZONE_C: { city: "Delhi", neighbourhood: "Laxmi Nagar" },
  ZONE_D: { city: "Hyderabad", neighbourhood: "Madhapur" },
  ZONE_E: { city: "Chennai", neighbourhood: "T. Nagar" },
  ZONE_F: { city: "Kolkata", neighbourhood: "New Market" },
};

const ALL_ZONES = Object.entries(ZONE_META).map(([value, meta]) => ({
  value,
  label: `${value} — ${meta.city}`,
}));

const TRIGGER_TYPES = [
  { value: "HEAVY_RAIN",    label: "Heavy Rain",     icon: CloudRain },
  { value: "EXTREME_HEAT",  label: "Extreme Heat",   icon: Thermometer },
  { value: "AQI_SPIKE",     label: "AQI Spike",      icon: Wind },
  { value: "FLASH_FLOOD",   label: "Flash Flood",    icon: Waves },
  { value: "PANDEMIC",      label: "Pandemic",       icon: AlertTriangle },
  { value: "ZONE_LOCKDOWN", label: "Zone Lockdown",  icon: Lock },
];

const DISRUPTION_OPTIONS = [
  { value: "NORMAL",        label: "Normal" },
  { value: "HEAVY_RAIN",    label: "Heavy Rain" },
  { value: "EXTREME_HEAT",  label: "Extreme Heat" },
  { value: "AQI_SPIKE",     label: "AQI Spike" },
  { value: "PANDEMIC",      label: "Pandemic" },
  { value: "ZONE_LOCKDOWN", label: "Zone Lockdown" },
];

// ── Types ─────────────────────────────────────────────────────────────────────
type Quote = {
  zone: string;
  recommended_premium: number;
  cover_amount: number;
  risk_level: string;
  disruption_context: string;
  factors: { pricing_multiplier: number };
};

type Policy = {
  id: number;
  zone: string;
  premium_amount: number;
  cover_amount: number;
  status: string;
  start_date: string;
  end_date: string;
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
  premium_amount: number;
  cover_amount: number;
  status: string;
  provider_ref: string;
  created_at: string;
};

type Metrics = {
  total_workers: number;
  active_policies: number;
  total_triggers_fired: number;
  total_claims: number;
  claims_paid: number;
  total_payout_inr: number;
  scheduler_running: boolean;
};

type TriggerEvent = {
  id: number;
  zone: string;
  trigger_type: string;
  severity: number;
  timestamp: string;
};

type Tab = "coverage" | "activity" | "admin";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat("en-IN").format(Math.round(n));
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });

const CLAIM_STATUS_CLASS: Record<string, string> = {
  APPROVED: "bg-emerald-100 text-emerald-700",
  PAID: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  REJECTED: "bg-red-100 text-red-700",
};

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter();

  // Auth / identity
  const workerId = typeof window !== "undefined" ? localStorage.getItem("giggity_user_id") : null;
  const workerName = typeof window !== "undefined" ? (localStorage.getItem("giggity_worker_name") ?? "Worker") : "Worker";
  const zone = typeof window !== "undefined" ? (localStorage.getItem("giggity_zone") || "ZONE_A") : "ZONE_A";
  const role = typeof window !== "undefined" ? (localStorage.getItem("giggity_role") ?? "WORKER") : "WORKER";
  const isAdmin = role === "ADMIN";

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>("coverage");

  // Worker data
  const [quote, setQuote] = useState<Quote | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [lifecycle, setLifecycle] = useState<ClaimLifecycleEvent[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [disruptionCtx, setDisruptionCtx] = useState("NORMAL");

  // Admin data
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [triggers, setTriggers] = useState<TriggerEvent[]>([]);
  const [forecast, setForecast] = useState<ForecastData[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "error" | "success" } | null>(null);

  // Admin trigger sim state
  const [simZone, setSimZone] = useState(zone);
  const [simType, setSimType] = useState("HEAVY_RAIN");
  const [simSeverity, setSimSeverity] = useState(0.85);

  // Admin seed demo state
  const [seedEmail, setSeedEmail] = useState("demo@giggity.dev");
  const [seedPassword, setSeedPassword] = useState("Demo@1234");

  const showToast = (msg: string, type: "error" | "success" = "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Auth helpers ─────────────────────────────────────────────────────────────
  const refreshToken = async (rt: string) => {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) throw new Error("Session expired.");
    const data = (await res.json()) as { access_token: string; refresh_token: string };
    localStorage.setItem("giggity_access_token", data.access_token);
    localStorage.setItem("giggity_refresh_token", data.refresh_token);
    return data.access_token;
  };

  const authFetch = useCallback(async (url: string, init: RequestInit = {}): Promise<Response> => {
    const at = localStorage.getItem("giggity_access_token");
    const rt = localStorage.getItem("giggity_refresh_token");
    if (!at || !rt) throw new Error("No session.");

    const withAuth = (token: string) =>
      fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });

    let res = await withAuth(at);
    if (res.status === 401) {
      const newAt = await refreshToken(rt);
      res = await withAuth(newAt);
    }
    return res;
  }, []);

  // ── Data fetchers ─────────────────────────────────────────────────────────────
  const fetchWorkerData = useCallback(async (ctx: string) => {
    if (!workerId) { router.push("/signin"); return; }
    try {
      const [qR, pR, cR, lcR, pmR, poR] = await Promise.all([
        authFetch(`${API_BASE}/api/v1/policy/quote?zone=${zone}&disruption_context=${ctx}`),
        authFetch(`${API_BASE}/api/v1/policy/active/${workerId}`),
        authFetch(`${API_BASE}/api/v1/claims/${workerId}`),
        authFetch(`${API_BASE}/api/v1/claims/lifecycle/${workerId}`),
        authFetch(`${API_BASE}/api/v1/payments/${workerId}`),
        authFetch(`${API_BASE}/api/v1/payouts/${workerId}`),
      ]);
      if ([qR, pR, cR, lcR, pmR, poR].some((r) => !r.ok)) throw new Error("Data sync failed.");
      setQuote(await qR.json());
      setPolicies(await pR.json());
      setClaims(await cR.json());
      setLifecycle(await lcR.json());
      setPayments(await pmR.json());
      setPayouts(await poR.json());
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Connection error.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, workerId, zone, router]);

  const fetchAdminData = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const fetchForecast = async () => {
        const primary = await fetch(`${API_BASE}/admin/forecast`);
        if (primary.ok) return primary;

        if (!API_BASE.includes("localhost:8000")) {
          const localFallback = await fetch("http://localhost:8000/admin/forecast");
          if (localFallback.ok) return localFallback;
        }

        return primary;
      };

      const [mR, tR, fR] = await Promise.allSettled([
        authFetch(`${API_BASE}/api/v1/admin/metrics`),
        authFetch(`${API_BASE}/api/v1/admin/triggers`),
        fetchForecast(),
      ]);

      if (mR.status === "fulfilled" && mR.value.ok) {
        setMetrics(await mR.value.json());
      }

      if (tR.status === "fulfilled" && tR.value.ok) {
        setTriggers(await tR.value.json());
      }

      if (fR.status === "fulfilled" && fR.value.ok) {
        setForecast(await fR.value.json());
      }
    } catch {
      // non-fatal
    }
  }, [authFetch, isAdmin]);

  // ── Polling ───────────────────────────────────────────────────────────────────
  const ctxRef = useRef(disruptionCtx);
  ctxRef.current = disruptionCtx;

  useEffect(() => {
    fetchWorkerData(ctxRef.current);
    if (isAdmin) fetchAdminData();
    const id = setInterval(() => {
      fetchWorkerData(ctxRef.current);
      if (isAdmin) fetchAdminData();
    }, 8000);
    return () => clearInterval(id);
  }, [fetchWorkerData, fetchAdminData, isAdmin]);

  // Re-fetch quote when disruption context changes
  useEffect(() => {
    if (!isLoading) fetchWorkerData(disruptionCtx);
  }, [disruptionCtx]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────────────────
  const handleBuyPolicy = async () => {
    if (!workerId || !quote) return;
    setLoadingAction("buy");
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);
    try {
      const ckR = await authFetch(`${API_BASE}/api/v1/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worker_id: Number(workerId),
          zone,
          premium_amount: quote.recommended_premium,
          cover_amount: quote.cover_amount,
          end_date: endDate.toISOString(),
        }),
      });
      if (!ckR.ok) throw new Error("Checkout failed.");
      const ck = (await ckR.json()) as { checkout_id: number };

      const cfR = await authFetch(`${API_BASE}/api/v1/payments/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkout_id: ck.checkout_id, payment_success: true }),
      });
      if (!cfR.ok) throw new Error("Payment failed.");
      showToast("Policy activated!", "success");
      await fetchWorkerData(disruptionCtx);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Transaction error.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleFireTrigger = async () => {
    setLoadingAction("trigger");
    try {
      const res = await authFetch(`${API_BASE}/api/v1/admin/triggers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone: simZone, trigger_type: simType, severity: simSeverity }),
      });
      if (!res.ok) throw new Error("Trigger failed.");
      showToast(`${simType} fired for ${simZone}`, "success");
      await Promise.all([fetchWorkerData(disruptionCtx), fetchAdminData()]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Trigger error.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSeedDemo = async () => {
    setLoadingAction("seed");
    try {
      const res = await authFetch(`${API_BASE}/api/v1/admin/seed-demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Demo Worker",
          email: seedEmail,
          phone: "+910000000000",
          zone: simZone,
          create_active_policy: true,
          password: seedPassword,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? "Seed failed.");
      }
      showToast("Demo worker seeded!", "success");
      await fetchAdminData();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Seed error.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push("/signin");
  };

  // ── Derived state ─────────────────────────────────────────────────────────────
  const hasActivePolicy = policies.some((p) => p.status === "ACTIVE");
  const zoneMeta = ZONE_META[zone] ?? { city: zone, neighbourhood: "" };
  const totalPaid = payouts.filter((p) => p.status === "RELEASED").reduce((s, p) => s + p.amount, 0);

  // ── Loading screen ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F4F4F0] flex items-center justify-center">
        <div className="font-mono text-[10px] uppercase tracking-widest flex items-center gap-3 text-[#1A1A1A]/50">
          <Loader2 className="animate-spin" size={14} />
          Syncing your coverage board...
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F4F4F0] text-[#1A1A1A] font-body pb-24">

      {/* ── Header ── */}
      <header className="bg-[#F4F4F0] border-b border-[#1A1A1A]/10 sticky top-0 z-40">
        <div className="max-w-[1200px] mx-auto px-6 md:px-12 py-5 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <span className="text-2xl font-serif font-black tracking-tighter">Giggity</span>
            <div className="hidden md:flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[#1A1A1A]/40">
              <MapPin size={11} />
              <span>{zoneMeta.city}, {zoneMeta.neighbourhood}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {isAdmin && (
              <span className="font-mono text-[9px] uppercase tracking-widest px-2 py-1 bg-[#1A1A1A] text-[#F4F4F0]">
                Admin
              </span>
            )}
            <div className="hidden md:block text-right">
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#1A1A1A]/40">Signed in as</p>
              <p className="font-serif italic font-bold text-sm">{workerName}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 border border-[#1A1A1A]/10 hover:border-[#C0392B] transition-colors cursor-pointer"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-[1200px] mx-auto px-6 md:px-12">
          <div className="flex gap-0 -mb-px">
            {(["coverage", "activity", ...(isAdmin ? ["admin"] : [])] as Tab[]).map((tab) => {
              const labels: Record<Tab, string> = { coverage: "Coverage", activity: "Activity", admin: "Admin" };
              const icons: Record<Tab, React.ReactNode> = {
                coverage: <ShieldCheck size={13} />,
                activity: <Activity size={13} />,
                admin: <BarChart3 size={13} />,
              };
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-2 px-5 py-3 font-mono text-[10px] uppercase tracking-widest border-b-2 transition-colors cursor-pointer ${
                    activeTab === tab
                      ? "border-[#C0392B] text-[#C0392B]"
                      : "border-transparent text-[#1A1A1A]/40 hover:text-[#1A1A1A]"
                  }`}
                >
                  {icons[tab]}
                  {labels[tab]}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 md:px-12 mt-10">

        {/* ════════════════════ COVERAGE TAB ════════════════════ */}
        {activeTab === "coverage" && (
          <div className="grid grid-cols-12 gap-6">

            {/* Zone info strip */}
            <div className="col-span-12 border border-[#1A1A1A]/10 bg-white p-6 flex flex-wrap gap-8 items-center">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40 mb-1">Your Zone</p>
                <p className="font-serif font-bold text-lg">{zone.replace("_", " ")}</p>
              </div>
              <div className="w-px h-8 bg-[#1A1A1A]/10" />
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40 mb-1">City</p>
                <p className="font-serif font-bold text-lg">{zoneMeta.city}</p>
              </div>
              <div className="w-px h-8 bg-[#1A1A1A]/10" />
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40 mb-1">Neighbourhood</p>
                <p className="font-serif font-bold text-lg">{zoneMeta.neighbourhood}</p>
              </div>
              <div className="w-px h-8 bg-[#1A1A1A]/10" />
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40 mb-1">Risk Tier</p>
                <p className={`font-mono text-xs uppercase tracking-widest font-bold ${
                  quote?.risk_level === "High" ? "text-[#C0392B]"
                  : quote?.risk_level === "Medium" ? "text-amber-600"
                  : "text-emerald-600"
                }`}>{quote?.risk_level ?? "—"}</p>
              </div>
              <div className="ml-auto">
                {hasActivePolicy
                  ? <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-600"><BadgeCheck size={14} /> Active</span>
                  : <span className="font-mono text-[10px] uppercase tracking-widest text-[#1A1A1A]/40">No active policy</span>
                }
              </div>
            </div>

            {/* Quote card */}
            <div className="col-span-12 lg:col-span-7 border border-[#1A1A1A] bg-white p-8 space-y-8">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40 mb-1">ML-Priced Quote</p>
                  <h2 className="text-2xl font-serif font-black italic">Weekly Protection</h2>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <label className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40">Scenario</label>
                  <select
                    value={disruptionCtx}
                    onChange={(e) => setDisruptionCtx(e.target.value)}
                    className="font-mono text-[10px] uppercase tracking-widest border border-[#1A1A1A]/10 px-3 py-1.5 outline-none focus:border-[#C0392B] cursor-pointer bg-white"
                  >
                    {DISRUPTION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Premium / Coverage split */}
              <div className="grid grid-cols-2 gap-px bg-[#1A1A1A]/5">
                <div className="bg-white py-8 pr-8">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40 mb-3">Weekly Premium</p>
                  <p className="text-5xl font-serif font-black tracking-tighter">
                    ₹{quote ? fmt(quote.recommended_premium) : "—"}
                  </p>
                  <p className="mt-3 font-mono text-[9px] text-[#C0392B] uppercase tracking-widest">
                    {quote?.factors?.pricing_multiplier}× multiplier
                  </p>
                </div>
                <div className="bg-white py-8 pl-8 border-l border-[#1A1A1A]/5">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40 mb-3">Coverage</p>
                  <p className="text-5xl font-serif font-black tracking-tighter">
                    ₹{quote ? fmt(quote.cover_amount) : "—"}
                  </p>
                  <p className="mt-3 font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40">
                    Scenario: {quote?.disruption_context ?? "—"}
                  </p>
                </div>
              </div>

              {/* CTA */}
              {!hasActivePolicy ? (
                <Button
                  onClick={handleBuyPolicy}
                  disabled={loadingAction === "buy" || !quote}
                  className="w-full py-5 text-sm"
                >
                  {loadingAction === "buy"
                    ? <><Loader2 className="animate-spin mr-2" size={16} />Processing...</>
                    : <><Zap size={16} className="mr-2" />Activate Weekly Protection</>
                  }
                </Button>
              ) : (
                <div className="border border-emerald-200 bg-emerald-50 p-5 flex items-center gap-4">
                  <BadgeCheck size={20} className="text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-emerald-700 font-bold mb-0.5">Coverage Live</p>
                    <p className="text-sm text-emerald-700/80">Your policy is active. Claims are auto-processed by the engine.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Active policies */}
            <div className="col-span-12 lg:col-span-5 border border-[#1A1A1A]/10 bg-white p-8 space-y-6">
              <div className="flex items-center gap-3 border-b border-[#1A1A1A]/5 pb-4">
                <FileText size={15} className="text-[#C0392B]" />
                <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold">Active Policies</h3>
                <span className="ml-auto font-mono text-[10px] bg-[#1A1A1A] text-white px-2 py-0.5">{policies.length}</span>
              </div>
              <div className="space-y-4 max-h-72 overflow-y-auto">
                {policies.length === 0 ? (
                  <p className="text-xs text-[#1A1A1A]/40 italic py-4 text-center">No policies yet.</p>
                ) : (
                  policies.map((p) => (
                    <div key={p.id} className="border border-[#1A1A1A]/5 p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40">Policy #{p.id}</span>
                        <span className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 ${
                          p.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-[#1A1A1A]/5"
                        }`}>{p.status}</span>
                      </div>
                      <div className="flex justify-between font-mono text-xs">
                        <span>Premium <strong>₹{fmt(p.premium_amount)}</strong></span>
                        <span>Cover <strong>₹{fmt(p.cover_amount)}</strong></span>
                      </div>
                      <div className="font-mono text-[9px] text-[#1A1A1A]/40">
                        {fmtDate(p.start_date)} → {fmtDate(p.end_date)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════ ACTIVITY TAB ════════════════════ */}
        {activeTab === "activity" && (
          <div className="grid grid-cols-12 gap-6">

            {/* Summary strip */}
            <div className="col-span-12 grid grid-cols-3 border border-[#1A1A1A]/10 bg-white divide-x divide-[#1A1A1A]/5">
              {[
                { label: "Total Claims", value: claims.length, icon: <FileText size={16} /> },
                { label: "Payouts Received", value: payouts.length, icon: <DollarSign size={16} /> },
                { label: "Total Paid Out", value: `₹${fmt(totalPaid)}`, icon: <TrendingUp size={16} /> },
              ].map((stat) => (
                <div key={stat.label} className="p-6 flex items-center gap-4">
                  <span className="text-[#C0392B]">{stat.icon}</span>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40 mb-1">{stat.label}</p>
                    <p className="font-serif font-black text-2xl tracking-tighter">{stat.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Lifecycle feed */}
            <div className="col-span-12 lg:col-span-7 border border-[#1A1A1A]/10 bg-white p-8">
              <div className="flex items-center gap-3 border-b border-[#1A1A1A]/5 pb-4 mb-6">
                <Activity size={15} className="text-[#C0392B]" />
                <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold">Claim Lifecycle Feed</h3>
                <span className="ml-auto font-mono text-[9px] text-[#1A1A1A]/30 animate-pulse">● Live</span>
              </div>
              <div className="space-y-4 max-h-[500px] overflow-y-auto">
                {lifecycle.length === 0 ? (
                  <p className="text-xs text-[#1A1A1A]/40 italic py-8 text-center">No events yet. Triggers auto-create claims.</p>
                ) : (
                  lifecycle.map((ev) => (
                    <div key={`${ev.claim_id}-${ev.trigger_type}`} className="border border-[#1A1A1A]/5 p-5 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40 mb-1">
                            Claim #{ev.claim_id} · {fmtDate(ev.created_at)}
                          </p>
                          <h4 className="font-serif italic font-bold">{ev.trigger_type.replace(/_/g, " ")}</h4>
                          <p className="font-mono text-[9px] text-[#1A1A1A]/40 mt-1">
                            Severity {(ev.trigger_severity * 100).toFixed(0)}%
                          </p>
                        </div>
                        <span className={`font-mono text-[9px] uppercase tracking-widest px-2 py-1 ${
                          CLAIM_STATUS_CLASS[ev.claim_status] ?? "bg-[#1A1A1A]/5"
                        }`}>
                          {ev.claim_status}
                        </span>
                      </div>
                      {ev.payout_amount && (
                        <div className="flex justify-between items-center pt-3 border-t border-[#1A1A1A]/5">
                          <span className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40">
                            Payout: {ev.payout_status}
                          </span>
                          <span className="font-serif font-black text-lg text-[#C0392B]">
                            ₹{fmt(ev.payout_amount)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right column: claims + payouts + payments */}
            <div className="col-span-12 lg:col-span-5 space-y-6">

              {/* Claims ledger */}
              <div className="border border-[#1A1A1A]/10 bg-white p-6">
                <div className="flex items-center gap-3 border-b border-[#1A1A1A]/5 pb-3 mb-4">
                  <Landmark size={14} className="text-[#C0392B]" />
                  <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold">Claims</h3>
                </div>
                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {claims.length === 0 ? (
                    <p className="text-xs text-[#1A1A1A]/40 italic">No claims.</p>
                  ) : (
                    claims.map((c) => (
                      <div key={c.id} className="flex justify-between items-center font-mono text-[10px] border-b border-[#1A1A1A]/5 pb-2">
                        <span className="text-[#1A1A1A]/40">#{c.id} {fmtDate(c.created_at)}</span>
                        <span className="font-bold">₹{fmt(c.amount)}</span>
                        <span className={`px-1.5 py-0.5 text-[9px] uppercase ${CLAIM_STATUS_CLASS[c.status] ?? ""}`}>{c.status}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Payouts ledger */}
              <div className="border border-[#1A1A1A]/10 bg-white p-6">
                <div className="flex items-center gap-3 border-b border-[#1A1A1A]/5 pb-3 mb-4">
                  <DollarSign size={14} className="text-[#C0392B]" />
                  <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold">Payouts</h3>
                </div>
                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {payouts.length === 0 ? (
                    <p className="text-xs text-[#1A1A1A]/40 italic">No payouts yet.</p>
                  ) : (
                    payouts.map((p) => (
                      <div key={p.id} className="flex justify-between items-center font-mono text-[10px] border-b border-[#1A1A1A]/5 pb-2">
                        <span className="text-[#1A1A1A]/40">#{p.id}</span>
                        <span className="font-bold text-emerald-600">₹{fmt(p.amount)}</span>
                        <span className="text-emerald-600 uppercase text-[9px]">{p.status}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Payment history */}
              <div className="border border-[#1A1A1A]/10 bg-white p-6">
                <div className="flex items-center gap-3 border-b border-[#1A1A1A]/5 pb-3 mb-4">
                  <CreditCard size={14} className="text-[#C0392B]" />
                  <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold">Payments</h3>
                </div>
                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {payments.length === 0 ? (
                    <p className="text-xs text-[#1A1A1A]/40 italic">No payments.</p>
                  ) : (
                    payments.map((p) => (
                      <div key={p.id} className="flex justify-between items-center font-mono text-[10px] border-b border-[#1A1A1A]/5 pb-2">
                        <span className="text-[#1A1A1A]/40 truncate max-w-[120px]">{p.provider_ref}</span>
                        <span className="font-bold">₹{fmt(p.premium_amount)}</span>
                        <span className="uppercase text-[9px] text-emerald-600">{p.status}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════ ADMIN TAB ════════════════════ */}
        {activeTab === "admin" && isAdmin && (
          <div className="space-y-8">

            {/* Metrics grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: "Workers", value: metrics?.total_workers ?? "—", icon: <Users size={16} /> },
                { label: "Active Policies", value: metrics?.active_policies ?? "—", icon: <ShieldCheck size={16} /> },
                { label: "Triggers Fired", value: metrics?.total_triggers_fired ?? "—", icon: <Radio size={16} /> },
                { label: "Total Claims", value: metrics?.total_claims ?? "—", icon: <FileText size={16} /> },
                { label: "Claims Paid", value: metrics?.claims_paid ?? "—", icon: <BadgeCheck size={16} /> },
                { label: "Paid Out (₹)", value: metrics ? fmt(metrics.total_payout_inr) : "—", icon: <DollarSign size={16} /> },
              ].map((m) => (
                <div key={m.label} className="border border-[#1A1A1A]/10 bg-white p-5 space-y-3">
                  <span className="text-[#C0392B]">{m.icon}</span>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40">{m.label}</p>
                  <p className="font-serif font-black text-2xl tracking-tighter">{m.value}</p>
                </div>
              ))}
            </div>

            {metrics && (
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40">
                <span className={`w-2 h-2 ${metrics.scheduler_running ? "bg-emerald-500" : "bg-[#C0392B]"}`} />
                Scheduler: {metrics.scheduler_running ? "Running" : "Stopped"}
              </div>
            )}

            {/* Live Forecast Grid */}
            {forecast.length > 0 && <LiveWeatherForecastDashboard forecast={forecast} />}

            <div className="grid grid-cols-12 gap-6">

              {/* Trigger simulator */}
              <div className="col-span-12 lg:col-span-5 border border-[#1A1A1A] bg-white p-8 space-y-6">
                <div className="flex items-center gap-3 border-b border-[#1A1A1A]/5 pb-4">
                  <FlaskConical size={15} className="text-[#C0392B]" />
                  <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold">Trigger Simulator</h3>
                </div>

                {/* Zone */}
                <div className="space-y-2">
                  <label className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/50">Zone</label>
                  <select
                    value={simZone}
                    onChange={(e) => setSimZone(e.target.value)}
                    className="w-full border border-[#1A1A1A]/10 bg-white px-4 py-2.5 font-mono text-xs outline-none focus:border-[#C0392B] cursor-pointer"
                  >
                    {ALL_ZONES.map((z) => (
                      <option key={z.value} value={z.value}>{z.label}</option>
                    ))}
                  </select>
                </div>

                {/* Trigger type grid */}
                <div className="space-y-2">
                  <label className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/50">Trigger Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {TRIGGER_TYPES.map((t) => {
                      const Icon = t.icon;
                      return (
                        <button
                          key={t.value}
                          onClick={() => setSimType(t.value)}
                          className={`flex items-center gap-2 px-3 py-2.5 border font-mono text-[9px] uppercase tracking-widest transition-colors cursor-pointer ${
                            simType === t.value
                              ? "border-[#C0392B] bg-[#C0392B] text-white"
                              : "border-[#1A1A1A]/10 hover:border-[#1A1A1A]/30"
                          }`}
                        >
                          <Icon size={12} />
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Severity slider */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/50">Severity</label>
                    <span className="font-mono text-xs font-bold text-[#C0392B]">{(simSeverity * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={simSeverity}
                    onChange={(e) => setSimSeverity(Number(e.target.value))}
                    className="w-full accent-[#C0392B] cursor-pointer"
                  />
                  <div className="flex justify-between font-mono text-[8px] text-[#1A1A1A]/30 uppercase">
                    <span>Minor</span><span>Severe</span>
                  </div>
                </div>

                <Button
                  onClick={handleFireTrigger}
                  disabled={loadingAction === "trigger"}
                  className="w-full py-4"
                >
                  {loadingAction === "trigger"
                    ? <><Loader2 className="animate-spin mr-2" size={14} />Firing...</>
                    : <><Radio size={14} className="mr-2" />Fire Trigger</>
                  }
                </Button>
              </div>

              {/* Seed demo + Trigger history */}
              <div className="col-span-12 lg:col-span-7 space-y-6">

                {/* Seed demo */}
                <div className="border border-[#1A1A1A]/10 bg-white p-6 space-y-4">
                  <div className="flex items-center gap-3 border-b border-[#1A1A1A]/5 pb-3">
                    <Users size={14} className="text-[#C0392B]" />
                    <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold">Seed Demo Worker</h3>
                  </div>
                  <div className="space-y-2">
                    <input
                      type="email"
                      value={seedEmail}
                      onChange={(e) => setSeedEmail(e.target.value)}
                      placeholder="demo@giggity.dev"
                      className="w-full border border-[#1A1A1A]/10 px-3 py-2 font-mono text-xs outline-none focus:border-[#C0392B] bg-white"
                    />
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={seedPassword}
                        onChange={(e) => setSeedPassword(e.target.value)}
                        placeholder="Password (min 8 chars)"
                        className="flex-1 border border-[#1A1A1A]/10 px-3 py-2 font-mono text-xs outline-none focus:border-[#C0392B] bg-white"
                      />
                      <Button
                        onClick={handleSeedDemo}
                        disabled={loadingAction === "seed"}
                        size="sm"
                        variant="outline"
                      >
                        {loadingAction === "seed" ? <Loader2 className="animate-spin" size={13} /> : "Seed"}
                      </Button>
                    </div>
                  </div>
                  <p className="font-mono text-[9px] text-[#1A1A1A]/30 uppercase tracking-widest">
                    Creates a worker with active policy in the selected zone. Sign in with these credentials.
                  </p>
                </div>

                {/* Recent trigger history */}
                <div className="border border-[#1A1A1A]/10 bg-white p-6">
                  <div className="flex items-center gap-3 border-b border-[#1A1A1A]/5 pb-3 mb-4">
                    <Activity size={14} className="text-[#C0392B]" />
                    <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold">Recent Triggers</h3>
                    <span className="ml-auto font-mono text-[9px] text-[#1A1A1A]/30 animate-pulse">● Live</span>
                  </div>
                  <div className="max-h-[340px] overflow-y-auto space-y-2">
                    {triggers.length === 0 ? (
                      <p className="text-xs text-[#1A1A1A]/40 italic py-4 text-center">No triggers fired yet.</p>
                    ) : (
                      [...triggers].reverse().map((t) => (
                        <div key={t.id} className="flex items-center gap-3 font-mono text-[10px] border-b border-[#1A1A1A]/5 pb-2">
                          <span className="text-[#1A1A1A]/30 w-6 shrink-0">#{t.id}</span>
                          <span className="font-bold w-20 shrink-0 text-[9px] uppercase">{t.zone.replace("_", " ")}</span>
                          <span className="flex-1 text-[9px] uppercase tracking-widest">{t.trigger_type.replace(/_/g, " ")}</span>
                          <span className={`text-[9px] font-bold ${t.severity >= 0.8 ? "text-[#C0392B]" : "text-amber-600"}`}>
                            {(t.severity * 100).toFixed(0)}%
                          </span>
                          <span className="text-[#1A1A1A]/30 text-[8px] w-16 text-right shrink-0">
                            {fmtDate(t.timestamp)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-4 border ${
              toast.type === "success"
                ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                : "bg-[#C0392B] border-[#C0392B] text-white"
            }`}
          >
            <span className="font-mono text-[10px] uppercase tracking-widest">{toast.msg}</span>
            <button
              onClick={() => setToast(null)}
              className="font-mono text-[9px] uppercase tracking-widest border border-current px-2 py-0.5 hover:bg-black/10 cursor-pointer"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
