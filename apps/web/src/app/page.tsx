"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import {
  CloudRain,
  Thermometer,
  Wind,
  Lock,
  Gavel,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/Button";

// --- Components ---

const Reveal = ({ children, className = "", delay = 0 }: { children: React.ReactNode, className?: string, delay?: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const StatCounter = ({ target, suffix = "", prefix = "", decimals = 0 }: { target: number, suffix?: string, prefix?: string, decimals?: number }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (isInView) {
      const start = 0;
      const end = target;
      const duration = 2000;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 4); // Quart ease out
        const current = start + (end - start) * easedProgress;

        setCount(current);

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    }
  }, [isInView, target]);

  return (
    <span ref={ref} className="font-mono">
      {prefix}{count.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
};

// --- Sections ---

export default function LandingPage() {
  return (
    <div className="bg-[#F4F4F0] text-[#1A1A1A] font-body selection:bg-[#C0392B] selection:text-white">
      {/* Navigation */}
      <header className="bg-[#F4F4F0] border-b border-[#1A1A1A] sticky top-0 z-50">
        <div className="flex justify-between items-center w-full px-6 md:px-12 py-6 max-w-[1080px] mx-auto">
          <div className="text-3xl font-serif font-black tracking-tighter">Giggity</div>
          <nav className="hidden md:flex gap-12 items-center">
            <Link href="#" className="font-mono uppercase text-xs tracking-widest hover:text-[#C0392B] transition-colors">Protocol</Link>
            <Link href="#" className="text-[#C0392B] border-b border-[#C0392B] pb-1 font-mono uppercase text-xs tracking-widest">Claims</Link>
            <Link href="#" className="font-mono uppercase text-xs tracking-widest hover:text-[#C0392B] transition-colors">Network</Link>
          </nav>
          <Link href="/signup">
            <Button size="sm">Get Protected</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-[1080px] mx-auto px-6 md:px-12 overflow-x-hidden">
        {/* Hero */}
        <section className="py-20 md:py-32 grid grid-cols-1 md:grid-cols-12 gap-8 items-center border-b border-[#1A1A1A]/10">
          <div className="col-span-1 md:col-span-7">
            <Reveal>
              <h1 className="text-4xl md:text-[72px] font-serif font-black leading-[1.05] tracking-tighter mb-8">
                When it rains, you shouldn&apos;t <span className="italic text-[#C0392B]">lose.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="text-xl text-[#1A1A1A]/80 max-w-md leading-relaxed mb-12">
                Giggity detects heat, rain, AQI spikes, and lockdowns in real time. When your zone is disrupted, you&apos;re paid automatically. No claims. No forms. No waiting.
              </p>
            </Reveal>
            <Reveal delay={0.4} className="flex flex-col sm:flex-row gap-6 md:gap-8 items-center">
              <Link href="/signup" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto">Start Protection</Button>
              </Link>
              <Link href="#" className="font-mono text-xs uppercase tracking-widest underline decoration-[#C0392B] decoration-1 underline-offset-8 hover:text-[#C0392B] transition-colors">
                How it works
              </Link>
            </Reveal>
          </div>

          <div className="col-span-1 md:col-span-5 relative h-[400px] flex items-center justify-center mt-12 md:mt-0">
            <div className="grid grid-cols-2 gap-4 -rotate-3">
              {[
                { icon: <CloudRain className="text-[#C0392B]" />, label: "Precipitation", value: "Rain", dark: false },
                { icon: <Thermometer className="text-[#C0392B]" />, label: "Threshold", value: "Temp", dark: true },
                { icon: <Wind className="text-[#C0392B]" />, label: "Atmosphere", value: "AQI", dark: false },
                { icon: <Lock className="text-[#C0392B]" />, label: "Restriction", value: "Lockdown", dark: false },
              ].map((card, i) => (
                <motion.div
                  key={i}
                  animate={{
                    y: [0, -15, 0],
                    rotate: i % 2 === 0 ? [-3, -1, -3] : [-3, -5, -3]
                  }}
                  transition={{
                    duration: 6,
                    repeat: Infinity,
                    delay: i * 1.5,
                    ease: "easeInOut"
                  }}
                  className={`border border-[#1A1A1A] p-6 w-40 h-52 flex flex-col justify-between ${card.dark ? "bg-[#1A1A1A] text-white -mt-8" : "bg-white"} ${i === 3 ? "mt-8" : ""}`}
                >
                  {card.icon}
                  <div>
                    <div className="font-mono text-[10px] uppercase opacity-50 mb-1">{card.label}</div>
                    <div className="font-serif text-xl italic font-bold">{card.value}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Triggers */}
        <section className="py-24">
          <div className="mb-16">
            <div className="h-px bg-[#C0392B] w-full mb-4"></div>
            <div className="flex justify-between items-end">
              <h2 className="font-mono text-xs uppercase tracking-[0.3em]">Market Disruption Triggers</h2>
              <span className="font-serif italic text-2xl">The anatomy of a lost workday.</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 border border-[#1A1A1A] bg-[#1A1A1A] gap-px">
            {[
              { target: 70, suffix: "mm", title: "Rain", desc: "No orders. No income. No recourse.", sub: "Flood Protocol" },
              { target: 42, suffix: "°C", title: "Heat", desc: "Dangerous conditions. Stay hydrated.", sub: "Thermal Limit" },
              { target: 350, suffix: " AQI", title: "Air", desc: "Hazardous smoke. Protection active.", sub: "Health Redline" },
              { icon: <Gavel className="w-8 h-8 text-[#C0392B]" />, title: "Lockdown", desc: "Administrative freeze. Payout ready.", sub: "Admin Override" },
            ].map((stat, i) => (
              <Reveal key={i} delay={i * 0.1} className="bg-[#F4F4F0] p-10 flex flex-col h-full">
                <div className="text-4xl mb-6 text-[#C0392B]">
                  {stat.target ? <StatCounter target={stat.target} suffix={stat.suffix} /> : stat.icon}
                </div>
                <h3 className="font-serif text-xl font-bold mb-4">{stat.title}</h3>
                <p className="text-sm leading-relaxed mb-8 opacity-70 italic">{stat.desc}</p>
                <div className="mt-auto font-mono text-[10px] uppercase opacity-40">{stat.sub}</div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section className="py-24 border-t border-[#1A1A1A]/10">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-20">
            <div className="col-span-1 md:col-span-6">
              <h2 className="font-serif text-5xl font-black italic tracking-tighter leading-tight">Five Steps to Hardened Security</h2>
            </div>
            <div className="col-span-1 md:col-span-6 flex items-center">
              <p className="font-mono text-xs uppercase tracking-widest text-[#1A1A1A]/60 leading-relaxed">
                The giggity protocol is a seamless automated chain.<br /> Once active, the system handles everything. Precision is mandatory.
              </p>
            </div>
          </div>

          <div className="relative py-12 md:py-20 flex flex-col md:flex-row justify-between gap-12 md:gap-0">
            {/* Connector Line */}
            <div className="absolute top-0 md:top-1/2 left-1/2 md:left-0 w-px md:w-full h-full md:h-px border-l md:border-l-0 md:border-t border-[#1A1A1A]/20 -z-10 -translate-x-1/2 md:translate-x-0" />

            {[
              "Onboard & KYC",
              "View Weekly Quote",
              "Buy Protection",
              "Work Normally",
              "Receive Payout"
            ].map((step, i) => (
              <Reveal key={i} delay={i * 0.1} className="relative flex flex-col items-center w-full md:w-1/5 group">
                <span className="absolute -top-12 text-6xl font-mono opacity-5 select-none">{String(i + 1).padStart(2, '0')}</span>
                <div className={`w-12 h-12 flex items-center justify-center font-mono text-sm mb-6 border transition-colors z-10 ${i === 4 ? "bg-[#C0392B] border-[#C0392B] text-white" : "bg-[#1A1A1A] border-[#1A1A1A] text-white group-hover:bg-[#C0392B]"}`}>
                  {i + 1}
                </div>
                <h4 className="font-mono text-[10px] uppercase tracking-widest text-center px-2">{step}</h4>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section className="py-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { tier: "01", name: "LOW RISK", price: "20", items: ["Standard Payouts", "Single Zone Coverage"], active: false },
              { tier: "02", name: "MEDIUM RISK", price: "30", items: ["Enhanced Payouts", "Multi-Zone Dynamic", "AQI Coverage"], active: false, italic: true },
              { tier: "03", name: "HIGH RISK", price: "45", items: ["Maximum Yield", "Global Grid Access", "Lockdown Guaranteed"], active: true, italic: true }
            ].map((plan, i) => (
              <Reveal key={i} delay={i * 0.1} className={`flex flex-col border p-8 ${plan.active ? "border-2 border-[#C0392B] bg-white" : "border-[#1A1A1A]"}`}>
                <div className={`h-1 w-full mb-8 ${plan.active ? "bg-[#C0392B]" : "bg-[#1A1A1A]"}`} />
                <span className={`font-mono text-[10px] uppercase tracking-[0.2em] mb-2 ${plan.active ? "text-[#C0392B]" : "opacity-60"}`}>Tier {plan.tier}</span>
                <h3 className={`font-serif text-3xl font-bold mb-8 ${plan.italic ? "italic" : ""}`}>{plan.name}</h3>
                <ul className="space-y-4 mb-12 flex-grow">
                  {plan.items.map((item, j) => (
                    <li key={j} className="flex items-center gap-3 text-sm">
                      <Check size={14} className="text-[#C0392B]" /> {item}
                    </li>
                  ))}
                </ul>
                <div className="mb-10">
                  <span className="font-mono text-4xl font-bold">₹{plan.price}</span>
                  <span className="font-mono text-[10px] uppercase opacity-50 ml-1">/ Weekly</span>
                </div>
                <Button variant={plan.active ? "primary" : "outline"} className="w-full">
                  Select Plan
                </Button>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Trust/RCE */}
        <section className="py-24 md:py-32 bg-[#1A1A1A] text-[#F4F4F0] -mx-6 md:-mx-12 px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-start">
          <div>
            <h2 className="text-3xl md:text-5xl font-serif font-black mb-12 italic leading-tight">Reality <span className="text-[#C0392B]">Consistency</span> Engine.</h2>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#F4F4F0]/20">
                  <th className="py-4 text-left font-mono text-[10px] uppercase tracking-widest opacity-50">Score Band</th>
                  <th className="py-4 text-right font-mono text-[10px] uppercase tracking-widest opacity-50">Confidence</th>
                </tr>
              </thead>
              <tbody className="font-mono text-sm">
                {[
                  { band: "≤30%", label: "Audit Required", red: true },
                  { band: "30–60%", label: "Low Fidelity", red: false },
                  { band: "60–80%", label: "Verified", red: false },
                  { band: ">80%", label: "Absolute Truth", red: true },
                ].map((row, i) => (
                  <tr key={i} className={i !== 3 ? "border-b border-[#F4F4F0]/10" : ""}>
                    <td className="py-6">{row.band}</td>
                    <td className={`py-6 text-right ${row.red ? "text-[#C0392B]" : ""}`}>{row.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-10 pt-12">
            {[
              "High-precision GPS telemetry cross-referenced with regional satellite imagery for sub-meter accuracy.",
              "Deep device telemetry capturing accelerometer and battery heat data to confirm physical presence.",
              "Network signal triangulation ensuring the device is operating within the declared work radius.",
              "Peer cohort comparison: Analyzing neighborhood activity patterns to eliminate outliers and fraud."
            ].map((text, i) => (
              <div key={i} className="flex gap-6 items-start">
                <span className="font-mono text-[#C0392B] text-lg">/0{i + 1}</span>
                <p className="text-base opacity-80 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Scale */}
        <section className="py-24">
          <div className="mb-12">
            <h2 className="font-serif text-4xl font-black italic mb-2">Scale Hypothesis</h2>
            <div className="h-px bg-[#1A1A1A] w-32"></div>
          </div>
          <div className="border border-[#1A1A1A] overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="bg-[#1A1A1A] text-white font-mono text-[10px] uppercase tracking-widest">
                  <th className="p-6 text-left border-r border-white/10">Phase</th>
                  <th className="p-6 text-left border-r border-white/10">Workforce</th>
                  <th className="p-6 text-left border-r border-white/10">Market Depth</th>
                  <th className="p-6 text-left">Resilience Factor</th>
                </tr>
              </thead>
              <tbody className="font-mono text-sm">
                {[
                  { phase: "Pilot", workers: 1000, market: "Single Hub", factor: 1.2 },
                  { phase: "City", workers: 50000, market: "Metro-wide Grid", factor: 4.8 },
                  { phase: "Multi-city", workers: 250000, market: "Regional Sync", factor: 12.5 },
                  { phase: "National", workers: 1000000, market: "Total Coverage", factor: 44.0, highlight: true },
                ].map((row, i) => (
                  <tr key={i} className={`border-b border-[#1A1A1A] ${row.highlight ? "bg-[#1A1A1A]/5" : ""}`}>
                    <td className="p-6 border-r border-[#1A1A1A] font-bold">{row.phase}</td>
                    <td className="p-6 border-r border-[#1A1A1A] font-bold">
                      <StatCounter target={row.workers} suffix={row.phase === "National" ? "+" : ""} /> Workers
                    </td>
                    <td className="p-6 border-r border-[#1A1A1A]">{row.market}</td>
                    <td className={`p-6 font-bold ${row.highlight || i === 2 ? "text-[#C0392B]" : ""}`}>
                      <StatCounter target={row.factor} decimals={1} suffix="x" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-40 flex flex-col items-center text-center">
          <Reveal className="max-w-2xl">
            <h2 className="text-4xl md:text-6xl font-serif font-black mb-8 italic">
              Security is <span className="underline decoration-[#C0392B] underline-offset-[12px] decoration-4">Automated</span>.
            </h2>
            <p className="text-lg leading-relaxed mb-12 opacity-70 italic">
              There are those who hope for clear skies, and those who build the infrastructure to thrive when they&apos;re gray. Choose your alignment.
            </p>
            <div className="flex flex-col items-center gap-6">
              <Link href="/signup">
                <Button size="lg" className="px-16 py-8">Activate Protection</Button>
              </Link>
              <span className="font-mono text-[10px] uppercase opacity-40">Zero waiting. Instant verification.</span>
            </div>
          </Reveal>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#F4F4F0] border-t border-[#1A1A1A]">
        <div className="flex flex-col md:flex-row justify-between items-center w-full px-6 md:px-12 py-8 max-w-[1080px] mx-auto gap-4">
          <div className="font-mono text-[10px] tracking-tighter uppercase">
            © 2024 GIGGITY PARAMETRIC INSURANCE. ALL RIGHTS RESERVED.
          </div>
          <div className="flex gap-8">
            {["Terms", "Privacy", "Legal", "Docs"].map((link) => (
              <Link key={link} href="#" className="font-mono text-[10px] tracking-tighter uppercase opacity-50 hover:underline decoration-[#C0392B]">{link}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
