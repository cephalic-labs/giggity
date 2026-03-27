"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  MapPin,
  Wallet,
  CloudLightning,
  Activity,
  AlertTriangle,
  LogOut,
  RefreshCw,
  Gift,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function Dashboard() {
  const router = useRouter();
  const [quote, setQuote] = useState<any>(null);
  const [policies, setPolicies] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [loadingAction, setLoadingAction] = useState(false);

  // App initialization
  const fetchDashboardData = async () => {
    const userId = localStorage.getItem("giggity_user_id");
    const zone = localStorage.getItem("giggity_zone") || "ZONE_A";
    if (!userId) {
      router.push("/");
      return;
    }

    try {
      // Fetch Quote
      const qRes = await fetch(
        `http://localhost:8000/api/v1/policy/quote?zone=${zone}`,
      );
      setQuote(await qRes.json());

      // Fetch Active Policies
      const pRes = await fetch(
        `http://localhost:8000/api/v1/policy/active/${userId}`,
      );
      setPolicies(await pRes.json());

      // Fetch user claims
      const cRes = await fetch(`http://localhost:8000/api/v1/claims/${userId}`);
      setClaims(await cRes.json());
    } catch (e) {
      console.error("Fetch error:", e);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // Simulate web socket refresh every 5s for the demo
    const interval = setInterval(() => fetchDashboardData(), 5000);
    return () => clearInterval(interval);
  }, [router]);

  const handleBuyPolicy = async () => {
    setLoadingAction(true);
    const userId = localStorage.getItem("giggity_user_id");
    const zone = localStorage.getItem("giggity_zone") || "ZONE_A";

    // end_date logic 1 week from now
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);

    try {
      await fetch("http://localhost:8000/api/v1/policy/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worker_id: parseInt(userId!),
          zone: zone,
          premium_amount: quote?.recommended_premium || 25,
          cover_amount: quote?.cover_amount || 500,
          end_date: endDate.toISOString(),
        }),
      });
      await fetchDashboardData();
    } finally {
      setLoadingAction(false);
    }
  };

  // ADMIN Simulation Tool
  const handleTriggerDisruption = async () => {
    setLoadingAction(true);
    const zone = localStorage.getItem("giggity_zone") || "ZONE_A";

    try {
      await fetch("http://localhost:8000/api/v1/admin/triggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zone: zone,
          trigger_type: "HEAVY_RAIN",
          severity: 85.0, // mm of rain
        }),
      });
      // Give backend brief time to process zero-touch
      setTimeout(() => fetchDashboardData(), 1000);
    } finally {
      setLoadingAction(false);
    }
  };

  const hasActivePolicy = policies.length > 0;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
            giggity
          </h1>
          <p className="text-sm text-zinc-400">
            Worker ID: #
            {typeof window !== "undefined"
              ? localStorage.getItem("giggity_user_id")
              : "-"}
          </p>
        </div>
        <button
          onClick={() => {
            localStorage.clear();
            router.push("/");
          }}
          className="p-2 bg-zinc-800/50 rounded-full hover:bg-zinc-800 transition"
        >
          <LogOut size={18} />
        </button>
      </header>

      {/* Main Protection Card */}
      <motion.div
        layout
        className="glass-panel p-6 relative overflow-hidden group"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-2xl rounded-full -translate-y-1/2 translate-x-1/2"></div>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <MapPin className="text-blue-400" size={20} />
            <span className="font-semibold text-zinc-200">
              Current Zone: {quote?.zone || "Loading"}
            </span>
          </div>
          {quote?.risk_level === "High" ? (
            <span className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded-full font-medium border border-red-500/20">
              High Risk
            </span>
          ) : (
            <span className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded-full font-medium border border-green-500/20">
              Normal
            </span>
          )}
        </div>

        {hasActivePolicy ? (
          <div className="mt-6 flex flex-col items-center justify-center p-6 bg-blue-900/20 rounded-xl border border-blue-500/30">
            <BadgeCheck className="w-12 h-12 text-blue-400 mb-3" />
            <h3 className="text-lg font-bold text-white mb-1">Protected</h3>
            <p className="text-sm text-blue-200/80 text-center">
              Your income is secure. You will automatically receive ₹
              {policies[0].cover_amount} if a disruption occurs.
            </p>
          </div>
        ) : (
          <div className="mt-6">
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-zinc-400 text-sm mb-1">
                  Weekly Premium (ML Priced)
                </p>
                <div className="text-3xl font-bold text-white flex items-center gap-1">
                  ₹{quote?.recommended_premium || "--"}
                  <span className="text-sm font-normal text-zinc-500 ml-1">
                    / wk
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-zinc-400 text-sm mb-1">Coverage</p>
                <p className="text-lg font-semibold text-green-400">
                  ₹{quote?.cover_amount || "--"}
                </p>
              </div>
            </div>

            <button
              onClick={handleBuyPolicy}
              disabled={loadingAction || !quote}
              className="w-full mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-3 px-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
            >
              Buy Weekly Protection
            </button>
          </div>
        )}
      </motion.div>

      {/* Claims Visualizer (Zero Touch Highlight) */}
      <AnimatePresence>
        {claims.map((claim) => (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            key={claim.id}
            className="p-5 rounded-xl border border-emerald-500/30 bg-emerald-900/20 flex flex-col items-start relative overflow-hidden"
          >
            <div className="absolute right-0 bottom-0 w-24 h-24 bg-emerald-500/10 blur-2xl rounded-full"></div>
            <div className="flex items-center gap-3 w-full mb-2">
              <div className="bg-emerald-500/20 p-2 rounded-lg text-emerald-400">
                <Gift size={20} />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-emerald-300">
                  Auto-Payout Processed!
                </h4>
                <p className="text-xs text-emerald-200/70">
                  Seamless zero-touch claim
                </p>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-white">
                  ₹{claim.amount}
                </span>
              </div>
            </div>
            <p className="text-xs text-zinc-400 mt-2">
              Triggered automatically via weather sensors. The money is on the
              way to your linked account.
            </p>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="mt-8 border-t border-zinc-800 pt-6">
        <h4 className="text-xs font-bold text-zinc-500 tracking-widest uppercase mb-4 flex items-center gap-2">
          <Activity size={14} /> Admin / Demo Actions
        </h4>

        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={handleTriggerDisruption}
            disabled={loadingAction || !hasActivePolicy}
            className="bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 p-4 rounded-xl flex items-center justify-between transition group disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="bg-red-500/20 text-red-400 p-2 rounded-lg">
                <AlertTriangle size={18} />
              </div>
              <div className="text-left">
                <p className="font-medium text-white text-sm">
                  Simulate Heavy Rain
                </p>
                <p className="text-xs text-zinc-400">
                  Triggers Oracle & Claims Engine
                </p>
              </div>
            </div>
            <RefreshCw
              size={16}
              className="text-zinc-500 group-hover:rotate-180 transition duration-700"
            />
          </button>
        </div>
        <p className="text-[10px] text-zinc-600 mt-4 text-center">
          MVP Demo Platform - The trigger simulation automatically calls
          public/mock API logic and dispatches real-time payouts directly
          without a claims agent.
        </p>
      </div>
    </div>
  );
}
