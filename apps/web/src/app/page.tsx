"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, ArrowRight, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    try {
      // Simulate registering a user
      const userRes = await fetch("http://localhost:8000/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Ravi Kumar",
          email: "ravi.kumar@example.com",
          phone: "+919876543210",
          current_zone: "ZONE_A"
        })
      });
      
      let userId = 1;
      if (userRes.ok) {
        const data = await userRes.json();
        userId = data.id;
      } else {
        // If already registered, fetch all and pick the first
        const usersRes = await fetch("http://localhost:8000/api/v1/users");
        const users = await usersRes.json();
        if (users.length > 0) userId = users[0].id;
      }
      
      // Store current user ID in localStorage for simulation
      localStorage.setItem("giggity_user_id", userId.toString());
      localStorage.setItem("giggity_zone", "ZONE_A");
      
      router.push("/dashboard");
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative Blob */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl opacity-50 z-0"></div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="glass-panel p-8 md:p-12 w-full max-w-md flex flex-col items-center text-center z-10"
      >
        <div className="bg-blue-500/10 p-4 rounded-full mb-6 border border-blue-500/20">
          <Shield className="w-10 h-10 text-blue-400" />
        </div>
        
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-white">giggity</h1>
        <p className="text-zinc-400 max-w-sm mb-10 text-sm">
          AI-Powered Income Insurance for your gig shifts. Never lose income due to bad weather again.
        </p>

        <button 
          onClick={handleStart}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Protect My Shift
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </motion.div>
    </main>
  );
}
