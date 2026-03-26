import { useAuth } from "@workspace/replit-auth-web";
import { Crown } from "lucide-react";
import { motion } from "framer-motion";

export default function Login() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-background">
      {/* Background Image via BASE_URL */}
      <div className="absolute inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
          alt="Stadium background" 
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md px-6"
      >
        <div className="glass-panel rounded-3xl p-8 sm:p-12 flex flex-col items-center text-center">
          <div className="mb-8 relative">
            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
            <img 
              src={`${import.meta.env.BASE_URL}images/logo-icon.png`}
              alt="BetZone Logo"
              className="relative h-24 w-24 drop-shadow-2xl"
            />
          </div>
          
          <h1 className="text-4xl sm:text-5xl font-display font-black text-white mb-4 tracking-tight">
            Bet<span className="text-primary">Zone</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-10 leading-relaxed max-w-sm">
            The premium sports betting platform. Real-time odds, secure payouts, competitive action.
          </p>

          <button
            onClick={() => login()}
            className="group relative w-full py-4 rounded-xl font-bold text-lg bg-primary text-primary-foreground shadow-lg overflow-hidden transition-all hover:scale-[1.02] active:scale-95"
          >
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
            <span className="relative flex items-center justify-center gap-2">
              Enter Platform
            </span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
