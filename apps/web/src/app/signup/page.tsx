"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { API_BASE, signIn } from "@/lib/auth";

const ZONES = [
  { value: "ZONE_A", label: "Zone A — Bangalore (BTM Layout)", risk: "Low" },
  { value: "ZONE_B", label: "Zone B — Mumbai (Andheri East)", risk: "Medium" },
  { value: "ZONE_C", label: "Zone C — Delhi (Laxmi Nagar)", risk: "High" },
  { value: "ZONE_D", label: "Zone D — Hyderabad (Madhapur)", risk: "Low" },
  { value: "ZONE_E", label: "Zone E — Chennai (T. Nagar)", risk: "Low" },
  { value: "ZONE_F", label: "Zone F — Kolkata (New Market)", risk: "Medium" },
];

type CollectivePricingStatus = {
  zone: string;
  city: string;
  neighbourhood: string;
  pool_size: number;
  base_premium: number;
  current_premium: number;
  current_discount_rate: number;
  next_tier_pool_size: number | null;
  workers_needed_for_next_tier: number;
  discount_unlocked_at_next_tier: number;
  countdown_message: string;
};

const RISK_COLOR: Record<string, string> = {
  Low: "text-emerald-600",
  Medium: "text-amber-600",
  High: "text-[#C0392B]",
};

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    currentZone: "ZONE_A",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectiveStatus, setCollectiveStatus] = useState<CollectivePricingStatus | null>(null);
  const [collectiveLoading, setCollectiveLoading] = useState(true);

  const selectedZone = ZONES.find((z) => z.value === form.currentZone)!;

  useEffect(() => {
    let isMounted = true;

    const loadCollectivePricing = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/pricing/collective?zone=${form.currentZone}`);
        if (!res.ok) {
          throw new Error("Unable to load collective pricing");
        }

        const data = (await res.json()) as CollectivePricingStatus;
        if (isMounted) {
          setCollectiveStatus(data);
        }
      } catch {
        if (isMounted) {
          setCollectiveStatus(null);
        }
      } finally {
        if (isMounted) {
          setCollectiveLoading(false);
        }
      }
    };

    setCollectiveLoading(true);
    void loadCollectivePricing();
    const intervalId = window.setInterval(() => {
      void loadCollectivePricing();
    }, 20000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [form.currentZone]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const userRes = await fetch(`${API_BASE}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
          current_zone: form.currentZone,
        }),
      });

      if (userRes.status === 409) {
        setError("Email already registered.");
        return;
      }

      if (!userRes.ok) {
        throw new Error("Unable to register at this time.");
      }

      await signIn(form.email, form.password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F4F0] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-[#1A1A1A]/10 p-10 space-y-8">
        <div className="space-y-2">
          <Link href="/" className="text-2xl font-serif font-black tracking-tighter text-[#1A1A1A] block mb-8">
            Giggity
          </Link>
          <h1 className="text-3xl font-serif italic font-bold">Create Account</h1>
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#1A1A1A]/50">
            Secure onboarding in under 60 seconds.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Full Name"
            placeholder="John Doe"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            placeholder="john@example.com"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="Phone"
            placeholder="+91 98765 43210"
            required
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            label="Password"
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Input
            label="Confirm Password"
            type="password"
            required
            error={
              form.confirmPassword && form.password !== form.confirmPassword
                ? "Passwords do not match"
                : undefined
            }
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
          />

          {/* Zone Selector */}
          <div className="space-y-2">
            <label className="block font-mono text-[10px] uppercase tracking-widest text-[#1A1A1A]/60">
              Service Zone
            </label>
            <select
              value={form.currentZone}
              onChange={(e) => setForm({ ...form, currentZone: e.target.value })}
              className="w-full border border-[#1A1A1A]/10 bg-white px-4 py-3 font-body text-sm outline-none transition-all focus:border-[#C0392B] cursor-pointer"
            >
              {ZONES.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>

            {/* Zone risk indicator */}
            <div className="flex items-center gap-2 pt-1">
              <MapPin size={12} className="text-[#1A1A1A]/40" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#1A1A1A]/40">
                Risk tier:
              </span>
              <span className={`font-mono text-[10px] uppercase tracking-widest font-bold ${RISK_COLOR[selectedZone.risk]}`}>
                {selectedZone.risk}
              </span>
            </div>

            <div className="mt-3 border border-[#1A1A1A]/10 bg-[#F4F4F0] p-3 space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#1A1A1A]/50">
                Collective Pricing
              </p>
              {collectiveLoading ? (
                <p className="font-body text-sm text-[#1A1A1A]/60">Updating live zone pool...</p>
              ) : collectiveStatus ? (
                <>
                  <p className="font-serif italic text-sm text-[#1A1A1A]">
                    {collectiveStatus.countdown_message}
                  </p>
                  <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-widest font-mono text-[#1A1A1A]/60">
                    <span>{collectiveStatus.pool_size} workers in pool</span>
                    <span>INR {collectiveStatus.current_premium.toFixed(0)}/week</span>
                  </div>
                </>
              ) : (
                <p className="font-body text-sm text-[#1A1A1A]/60">
                  Live collective pricing is temporarily unavailable.
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="p-4 border border-[#C0392B] bg-[#C0392B]/5 text-[#C0392B] font-mono text-[10px] uppercase tracking-widest">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Register Profile
          </Button>
        </form>

        <div className="pt-6 border-t border-[#1A1A1A]/5 text-center">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#1A1A1A]/50 mb-4">
            Already registered?
          </p>
          <Link href="/signin">
            <Button variant="outline" className="w-full">Sign In</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
