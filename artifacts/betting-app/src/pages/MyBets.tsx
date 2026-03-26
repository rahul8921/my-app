import { useListMyBets } from "@workspace/api-client-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { ArrowRight, Ticket, Trophy } from "lucide-react";
import { Link } from "wouter";

export default function MyBets() {
  const { data: bets, isLoading } = useListMyBets();

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="h-10 w-48 bg-secondary animate-pulse rounded-lg mb-8" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-secondary animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="flex items-center gap-4 mb-10">
        <div className="p-3 bg-primary/10 text-primary rounded-xl">
          <Ticket className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-4xl font-display font-black text-white">Bet History</h1>
          <p className="text-muted-foreground mt-1">Review your past wagers and current active bets.</p>
        </div>
      </div>

      {!bets || bets.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-3xl border border-dashed border-white/10">
          <Ticket className="h-16 w-16 mx-auto text-muted-foreground opacity-50 mb-4" />
          <h3 className="text-2xl font-display font-bold text-white mb-2">No bets placed yet</h3>
          <p className="text-muted-foreground mb-6">Head over to the matches page to place your first bet.</p>
          <Link href="/matches" className="inline-flex items-center justify-center px-6 py-3 rounded-xl font-bold bg-primary text-primary-foreground shadow-lg hover:shadow-primary/30 transition-all">
            Browse Matches
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bets.map((bet) => {
            const match = bet.match;
            if (!match) return null;
            
            const isWon = bet.status === 'won';
            const isLost = bet.status === 'lost';
            const isPending = bet.status === 'pending';

            return (
              <div 
                key={bet.id} 
                className={`relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between p-6 rounded-2xl border transition-all ${
                  isWon ? 'bg-green-500/5 border-green-500/20 shadow-[0_0_30px_-10px_rgba(34,197,94,0.1)]' :
                  isLost ? 'bg-red-500/5 border-red-500/20' :
                  'bg-card border-white/10'
                }`}
              >
                {/* Match Info */}
                <div className="flex-1 mb-4 md:mb-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {format(new Date(match.matchDate), "MMM d, yyyy • h:mm a")}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      match.status === 'live' ? 'bg-red-500/20 text-red-400' : 
                      match.status === 'finished' ? 'bg-white/10 text-white/70' : 
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {match.status}
                    </span>
                  </div>
                  <h4 className="text-lg font-display font-bold text-white flex items-center gap-3">
                    <span className={bet.team === match.team1 ? 'text-primary' : ''}>{match.team1}</span>
                    <span className="text-muted-foreground text-sm font-normal">vs</span>
                    <span className={bet.team === match.team2 ? 'text-primary' : ''}>{match.team2}</span>
                  </h4>
                </div>

                {/* Bet Info */}
                <div className="flex items-center gap-8 w-full md:w-auto bg-secondary/50 md:bg-transparent p-4 md:p-0 rounded-xl">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Your Pick</p>
                    <p className="font-bold text-white">{bet.team}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Wager</p>
                    <p className="font-bold text-white">{formatCurrency(bet.amount)}</p>
                  </div>
                  
                  {/* Result */}
                  <div className="flex-1 text-right border-l border-white/10 pl-6">
                    <p className="text-xs text-muted-foreground mb-1">Result</p>
                    {isPending ? (
                      <p className="font-bold text-amber-400 flex items-center justify-end gap-1">
                        Pending
                      </p>
                    ) : isWon ? (
                      <p className="font-bold text-green-400 flex items-center justify-end gap-1 text-lg">
                        <Trophy className="h-4 w-4" />
                        +{formatCurrency(bet.payout || 0)}
                      </p>
                    ) : (
                      <p className="font-bold text-red-400 flex items-center justify-end gap-1">
                        Lost
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
