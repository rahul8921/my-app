import { Link, useLocation } from "wouter";
import { User, Menu, X, CarFront, Navigation } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useRideAuth as useAuth } from "@/hooks/use-ride-auth";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();
  const { user, isAuthenticated, login, logout } = useAuth();

  const isDriver = location.includes('/driver');

  return (
    <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center group-hover:scale-105 transition-transform">
                <Navigation className="w-5 h-5 fill-current" />
              </div>
              <span className="font-display font-bold text-xl tracking-tight text-foreground">
                RideNow
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {isAuthenticated ? (
              <>
                <Link 
                  href="/rider" 
                  className={cn(
                    "text-sm font-semibold transition-colors hover:text-primary",
                    !isDriver ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  Ride
                </Link>
                <Link 
                  href="/driver" 
                  className={cn(
                    "text-sm font-semibold transition-colors hover:text-primary",
                    isDriver ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  Drive
                </Link>
                <Link 
                  href="/history" 
                  className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors"
                >
                  History
                </Link>

                <div className="h-6 w-px bg-border mx-2" />

                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-bold text-foreground">{user?.username || 'User'}</span>
                    <button onClick={logout} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                      Sign out
                    </button>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-secondary border-2 border-border flex items-center justify-center overflow-hidden">
                    {user?.profileImage ? (
                      <img src={user.profileImage} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </>
            ) : (
              <button 
                onClick={login}
                className="px-6 py-2.5 rounded-full font-semibold bg-primary text-primary-foreground hover:shadow-lg hover:-translate-y-0.5 transition-all"
              >
                Sign In
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-lg text-foreground hover:bg-secondary transition-colors"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden absolute top-16 left-0 w-full bg-background border-b border-border shadow-xl px-4 py-6 flex flex-col gap-4">
          {isAuthenticated ? (
            <>
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                  <User className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-bold text-foreground">{user?.username}</div>
                  <div className="text-sm text-muted-foreground">{user?.email || 'Logged in'}</div>
                </div>
              </div>
              <Link href="/rider" onClick={() => setIsOpen(false)} className="font-semibold text-lg p-2 rounded-lg hover:bg-secondary">
                Ride
              </Link>
              <Link href="/driver" onClick={() => setIsOpen(false)} className="font-semibold text-lg p-2 rounded-lg hover:bg-secondary">
                Drive
              </Link>
              <Link href="/history" onClick={() => setIsOpen(false)} className="font-semibold text-lg p-2 rounded-lg hover:bg-secondary">
                Ride History
              </Link>
              <button onClick={() => { logout(); setIsOpen(false); }} className="text-left font-semibold text-lg p-2 text-destructive mt-4">
                Sign out
              </button>
            </>
          ) : (
            <button onClick={() => { login(); setIsOpen(false); }} className="w-full py-4 rounded-xl font-bold bg-primary text-primary-foreground">
              Sign In to RideNow
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
