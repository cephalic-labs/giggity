"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { signIn } from "@/lib/auth";

export default function SigninPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const accessToken = window.localStorage.getItem("giggity_access_token");
    const refreshToken = window.localStorage.getItem("giggity_refresh_token");
    const workerId = window.localStorage.getItem("giggity_user_id");

    if (accessToken && refreshToken && workerId) {
      router.replace("/dashboard");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
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
          <h1 className="text-3xl font-serif italic font-bold">Sign In</h1>
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#1A1A1A]/50">
            Continue your weekly protection workflow.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Email"
            type="email"
            placeholder="john@example.com"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="Password"
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />

          {error && (
            <div className="p-4 border border-[#C0392B] bg-[#C0392B]/5 text-[#C0392B] font-mono text-[10px] uppercase tracking-widest">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign In
          </Button>
        </form>

        <div className="pt-6 border-t border-[#1A1A1A]/5 text-center">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#1A1A1A]/50 mb-4">
            New here?
          </p>
          <Link href="/signup">
            <Button variant="outline" className="w-full">Register</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
