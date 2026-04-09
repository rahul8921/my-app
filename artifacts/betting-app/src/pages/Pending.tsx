import { useAuth } from "@/hooks/use-auth";
import { Clock, ShieldX, LogOut } from "lucide-react";

export default function Pending() {
  const { user, logout } = useAuth();

  const isRejected = user?.status === 'rejected';

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full bg-card border border-white/10 rounded-3xl p-8 sm:p-10 text-center shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-amber-600" />
        
        {isRejected ? (
          <ShieldX className="h-16 w-16 text-destructive mx-auto mb-6" />
        ) : (
          <Clock className="h-16 w-16 text-amber-500 mx-auto mb-6 animate-pulse" />
        )}

        <h1 className="text-3xl font-display font-bold text-white mb-4">
          {isRejected ? "Access Denied" : "Awaiting Approval"}
        </h1>
        
        <p className="text-muted-foreground mb-8">
          {isRejected 
            ? "Your account registration has been rejected by an administrator. You cannot access the betting platform."
            : "Your account has been created successfully and is currently under review by an administrator. Please check back later."}
        </p>

        <button
          onClick={() => logout()}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-secondary text-white font-medium hover:bg-white/10 transition-colors"
        >
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </div>
    </div>
  );
}
