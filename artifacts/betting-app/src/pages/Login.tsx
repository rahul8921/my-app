import { useState } from "react";
import { Crown } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { FcGoogle } from "react-icons/fc";

type Mode = "login" | "register";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: username || email.split("@")[0] },
            emailRedirectTo: window.location.origin,
          },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setLoading(false);
          setError("✉️ Confirmation email sent! Click the link in your email, then come back and Sign In.");
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }

      window.location.href = "/";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-card border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-amber-600 shadow-lg shadow-primary/30 mb-4">
              <Crown className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-display font-black text-white">
              Bet<span className="text-primary">Zone</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {mode === "login" ? "Sign in to your account" : "Create a new account"}
            </p>
          </div>

          <div className="flex bg-secondary rounded-xl p-1 mb-6">
            <button
              onClick={() => { setMode("login"); setError(""); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${mode === "login" ? "bg-card text-white shadow-sm" : "text-muted-foreground hover:text-white"}`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode("register"); setError(""); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${mode === "register" ? "bg-card text-white shadow-sm" : "text-muted-foreground hover:text-white"}`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Username <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="your_username"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-white/10 text-white placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-white/10 text-white placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-white/10 text-white placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs text-muted-foreground">
              <span className="bg-card px-2">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-semibold text-sm bg-secondary border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <FcGoogle className="h-5 w-5" />
            Continue with Google
          </button>

          {mode === "register" && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              The first account created becomes admin and is auto-approved.
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
