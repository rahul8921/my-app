import { useAuth } from "@workspace/replit-auth-web";
import { useListMatches, useListMyBets } from "@workspace/api-client-react";
import { MatchCard } from "@/components/MatchCard";
import { Trophy, Activity, History } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

type Filter = "all" | "live" | "upcoming" | "finished";

export default function Matches() {
  const { user } = useAuth();
  const { data: matches, isLoading: isLoadingMatches } = useListMatches({
    query: { refetchInterval: 30_000 }
  });
  const { data: bets } = useListMyBets({
    query: { enabled: user?.status === 'approved' }
  });
  
  const [filter, setFilter] = useState<Filter>("all");

  const isApproved = user?.status === 'approved';

  if (isLoadingMatches) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="h-10 w-48 bg-secondary animate-pulse rounded-lg mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-80 bg-secondary animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const statusOrder = (status: string) => {
    if (status === "live") return 0;
    if (status === "upcoming") return 1;
    return 2; // finished/completed
  };

  const filteredMatches = (matches?.filter(m => filter === "all" || m.status === filter) || [])
    .slice()
    .sort((a, b) => {
      const orderDiff = statusOrder(a.status) - statusOrder(b.status);
      if (orderDiff !== 0) return orderDiff;
      const aTime = new Date(a.matchDate).getTime();
      const bTime = new Date(b.matchDate).getTime();
      // upcoming & live: soonest first; finished: most recent first
      return a.status === "finished" ? bTime - aTime : aTime - bTime;
    });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10">
        <div>
          <h1 className="text-4xl sm:text-5xl font-display font-black text-white flex items-center gap-4">
            Sports Book
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Bet on live and upcoming matches with real-time odds.
          </p>
        </div>

        <div className="flex bg-secondary p-1 rounded-xl shadow-inner border border-white/5 overflow-x-auto">
          {[
            { id: "all", label: "All Matches", icon: Trophy },
            { id: "live", label: "Live", icon: Activity },
            { id: "upcoming", label: "Upcoming", icon: Trophy },
            { id: "finished", label: "Finished", icon: History },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as Filter)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                filter === f.id 
                  ? 'bg-card text-primary shadow-sm border border-white/5' 
                  : 'text-muted-foreground hover:text-white hover:bg-white/5'
              }`}
            >
              <f.icon className="h-4 w-4" />
              <span className="whitespace-nowrap">{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      {filteredMatches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-card rounded-3xl border border-dashed border-white/10">
          <Trophy className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-2xl font-display font-bold text-white mb-2">No matches found</h3>
          <p className="text-muted-foreground text-center">There are currently no {filter !== 'all' ? filter : ''} matches available.</p>
        </div>
      ) : (
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, staggerChildren: 0.1 }}
        >
          {filteredMatches.map((match) => {
            const userBet = bets?.find(b => b.matchId === match.id);
            return (
              <motion.div key={match.id} layout>
                <MatchCard 
                  match={match} 
                  userBet={userBet} 
                  isApproved={isApproved}
                />
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
