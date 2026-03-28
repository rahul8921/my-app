import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { Crown, LayoutDashboard, Ticket, Trophy, LogOut, BarChart2, LogIn } from "lucide-react";
import { motion } from "framer-motion";
import { ProfilePhotoDialog } from "@/components/ProfilePhotoDialog";

export function Navbar() {
  const [location] = useLocation();
  const { user, isAuthenticated, logout, login } = useAuth();
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);

  const publicLinks = [
    { href: "/matches", label: "Matches", icon: Trophy },
    { href: "/leaderboard", label: "Leaderboard", icon: BarChart2 },
  ];

  const authLinks = [
    ...(user?.status === 'approved' ? [{ href: "/my-bets", label: "My Bets", icon: Ticket }] : []),
    ...(user?.isAdmin ? [{ href: "/admin", label: "Admin", icon: LayoutDashboard }] : []),
  ];

  const links = isAuthenticated ? [...publicLinks, ...authLinks] : publicLinks;

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-white/10 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-amber-600 shadow-lg shadow-primary/20">
              <Crown className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-white">
              Bet<span className="text-primary">Zone</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {links.map((link) => {
              const isActive = location === link.href;
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href} className="relative px-3 py-2 text-sm font-medium rounded-lg transition-colors hover:text-primary text-muted-foreground">
                  <span className={`flex items-center gap-2 relative z-10 ${isActive ? 'text-white' : ''}`}>
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="navbar-active"
                      className="absolute inset-0 rounded-lg bg-secondary/80 border border-white/5"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {isAuthenticated && user ? (
            <>
              <button
                onClick={() => setPhotoDialogOpen(true)}
                className="hidden sm:flex items-center gap-3 group"
                title="Change profile photo"
              >
                <div className="relative">
                  {user.profileImage ? (
                    <img src={user.profileImage} alt={user.username} className="h-8 w-8 rounded-full ring-2 ring-white/10 object-cover group-hover:ring-primary/60 transition-all" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-bold text-white ring-2 ring-white/10 group-hover:ring-primary/60 transition-all">
                      {user.username?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[8px] text-white font-bold leading-none">EDIT</span>
                  </div>
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-semibold text-white leading-none">{user.username}</span>
                  <span className="text-xs text-muted-foreground mt-1 leading-none capitalize">
                    {user.isAdmin ? 'Admin' : user.status}
                  </span>
                </div>
              </button>
              <button
                onClick={() => logout()}
                className="flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => login()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <LogIn className="h-4 w-4" />
              Sign In
            </button>
          )}
        </div>
      </div>

      {isAuthenticated && user && (
        <ProfilePhotoDialog
          open={photoDialogOpen}
          onClose={() => setPhotoDialogOpen(false)}
          currentPhoto={user.profileImage}
          username={user.username}
        />
      )}

      {/* Mobile nav */}
      <div className="flex md:hidden border-t border-white/5 bg-card/50 overflow-x-auto">
        {links.map((link) => {
          const isActive = location === link.href;
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} className={`flex-1 py-3 flex flex-col items-center gap-1 text-xs font-medium transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
              <Icon className="h-5 w-5" />
              {link.label}
            </Link>
          );
        })}
        {!isAuthenticated && (
          <button
            onClick={() => login()}
            className="flex-1 py-3 flex flex-col items-center gap-1 text-xs font-medium text-primary"
          >
            <LogIn className="h-5 w-5" />
            Sign In
          </button>
        )}
      </div>
    </nav>
  );
}
