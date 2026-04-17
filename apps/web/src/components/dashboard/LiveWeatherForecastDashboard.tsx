import { CloudRain, Flame, ShieldAlert, TrendingUp, Waves } from "lucide-react";

export type ForecastData = {
  zone: string;
  risk: string;
  confidence: number;
  features: {
    heat: number;
    rain: number;
  };
  active_policies: number;
  expected_payouts: number;
  payout_inr: number;
  premium_change: string;
};

type LiveWeatherForecastDashboardProps = {
  forecast: ForecastData[];
  lastUpdated?: string | null;
};

const riskBadgeClass = (risk: string) => {
  const value = risk.toLowerCase();
  if (value === "high" || value === "rain" || value === "heat") {
    return "bg-[#C0392B] text-white";
  }
  if (value === "medium") {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-emerald-100 text-emerald-900";
};

const riskLabel = (risk: string) => {
  const value = risk.toLowerCase();
  if (value === "rain") return "High Rain";
  if (value === "heat") return "High Heat";
  if (value === "none") return "Low";
  return risk.charAt(0).toUpperCase() + risk.slice(1);
};

const inrFmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

export function LiveWeatherForecastDashboard({ forecast, lastUpdated = null }: LiveWeatherForecastDashboardProps) {
  const safeForecast = forecast.filter((item) => typeof item.zone === "string");
  const updatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  const summary = safeForecast.reduce(
    (acc, item) => {
      acc.totalHeat += item.features.heat;
      acc.totalRain += item.features.rain;
      acc.totalPayout += item.payout_inr;
      acc.totalPolicies += item.active_policies;
      acc.highRiskCount +=
        item.risk.toLowerCase() === "high" ||
        item.risk.toLowerCase() === "rain" ||
        item.risk.toLowerCase() === "heat"
          ? 1
          : 0;
      return acc;
    },
    {
      totalHeat: 0,
      totalRain: 0,
      totalPayout: 0,
      totalPolicies: 0,
      highRiskCount: 0,
    }
  );

  const zoneCount = safeForecast.length || 1;
  const avgHeat = summary.totalHeat / zoneCount;
  const avgRain = summary.totalRain / zoneCount;
  const maxConfidence = Math.max(...safeForecast.map((item) => item.confidence), 0);

  const topPayoutZone = [...safeForecast].sort((a, b) => b.payout_inr - a.payout_inr)[0] ?? null;

  return (
    <section className="border border-[#1A1A1A]/10 bg-white p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#1A1A1A]/5 pb-4">
        <div className="flex items-center gap-2">
          <CloudRain size={15} className="text-[#C0392B]" />
          <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold">Live Weather Forecast</h3>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/35">Open-Meteo</span>
        <span className="ml-auto font-mono text-[9px] text-[#1A1A1A]/30 animate-pulse">
          {updatedLabel ? `Updated ${updatedLabel}` : "Live"}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border border-[#1A1A1A]/10 p-4 bg-[#F4F4F0]/40">
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/50 mb-2">Avg Heat</p>
          <p className="font-serif font-black text-3xl tracking-tight">{avgHeat.toFixed(1)}C</p>
        </div>
        <div className="border border-[#1A1A1A]/10 p-4 bg-[#F4F4F0]/40">
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/50 mb-2">Avg Rain</p>
          <p className="font-serif font-black text-3xl tracking-tight">{avgRain.toFixed(1)}mm</p>
        </div>
        <div className="border border-[#1A1A1A]/10 p-4 bg-[#F4F4F0]/40">
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/50 mb-2">High Risk Zones</p>
          <p className="font-serif font-black text-3xl tracking-tight">{summary.highRiskCount}</p>
        </div>
        <div className="border border-[#1A1A1A]/10 p-4 bg-[#F4F4F0]/40">
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/50 mb-2">Max Confidence</p>
          <p className="font-serif font-black text-3xl tracking-tight">{(maxConfidence * 100).toFixed(0)}%</p>
        </div>
      </div>

      {topPayoutZone && (
        <div className="border border-[#1A1A1A] p-4 md:p-5 flex flex-wrap items-center gap-4 bg-[linear-gradient(90deg,#ffffff_0%,#fff6f4_100%)]">
          <ShieldAlert size={18} className="text-[#C0392B]" />
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/45">Highest Payout Pressure</p>
            <p className="font-serif font-bold text-lg">{topPayoutZone.zone.toUpperCase()} · Rs {inrFmt(topPayoutZone.payout_inr)}</p>
          </div>
          <div className="ml-auto font-mono text-[10px] uppercase tracking-widest text-[#C0392B]">
            {topPayoutZone.expected_payouts} expected payouts
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {safeForecast.map((item) => {
          const confidencePct = Math.max(0, Math.min(100, Math.round(item.confidence * 100)));
          const rainPct = Math.max(0, Math.min(100, Math.round((item.features.rain / 120) * 100)));
          const heatPct = Math.max(0, Math.min(100, Math.round((item.features.heat / 50) * 100)));

          return (
            <article key={item.zone} className="border border-[#1A1A1A]/10 p-4 md:p-5 space-y-4">
              <div className="flex items-center gap-3">
                <h4 className="font-mono text-xs font-bold uppercase tracking-widest">{item.zone.toUpperCase()}</h4>
                <span className={`px-2 py-1 rounded text-[8px] font-bold uppercase ${riskBadgeClass(item.risk)}`}>
                  {riskLabel(item.risk)}
                </span>
                <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/45">
                  confidence {confidencePct}%
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/50">
                  <span className="flex items-center gap-1"><Flame size={11} /> Heat</span>
                  <span>{item.features.heat.toFixed(1)}C</span>
                </div>
                <div className="h-1.5 bg-[#1A1A1A]/10 overflow-hidden">
                  <div className="h-full bg-[#C0392B]" style={{ width: `${heatPct}%` }} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/50">
                  <span className="flex items-center gap-1"><Waves size={11} /> Rain</span>
                  <span>{item.features.rain.toFixed(1)}mm</span>
                </div>
                <div className="h-1.5 bg-[#1A1A1A]/10 overflow-hidden">
                  <div className="h-full bg-[#1A1A1A]" style={{ width: `${rainPct}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#1A1A1A]/5 font-mono text-[9px] uppercase tracking-widest">
                <div>
                  <p className="text-[#1A1A1A]/40 mb-1">Policies</p>
                  <p className="font-bold text-[#1A1A1A]">{item.active_policies}</p>
                </div>
                <div>
                  <p className="text-[#1A1A1A]/40 mb-1">Payouts</p>
                  <p className="font-bold text-[#1A1A1A]">{item.expected_payouts}</p>
                </div>
                <div>
                  <p className="text-[#1A1A1A]/40 mb-1 flex items-center gap-1"><TrendingUp size={10} /> Premium</p>
                  <p className="font-bold text-amber-700">{item.premium_change}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="border-t border-[#1A1A1A]/5 pt-4 flex flex-wrap gap-4 justify-between font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/45">
        <span>Total projected payout: Rs {inrFmt(summary.totalPayout)}</span>
        <span>Total active policies: {summary.totalPolicies}</span>
      </div>
    </section>
  );
}
