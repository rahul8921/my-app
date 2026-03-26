import { useState } from "react";
import { format } from "date-fns";
import { Coins, Crown, Skull } from "lucide-react";
import { Match, Bet } from "@workspace/api-client-react/src/generated/api.schemas";
import { usePlaceBet } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface MatchCardProps {
  match: Match;
  userBet?: Bet | null;
  isApproved: boolean;
}

export function MatchCard({ match, userBet, isApproved }: MatchCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [betTeam, setBetTeam] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const placeBet = usePlaceBet({
    mutation: {
      onSuccess: () => {
        toast({
          title: "Bet placed successfully!",
          description: `You bet ${formatCurrency(Number(betAmount))} on ${betTeam}`,
        });
        setDialogOpen(false);
        setBetAmount("");
        queryClient.invalidateQueries({ queryKey: ['/api/matches'] });
        queryClient.invalidateQueries({ queryKey: ['/api/bets'] });
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Failed to place bet",
          description: err?.message || "An error occurred",
        });
      }
    }
  });

  const totalPool = match.totalBetsTeam1 + match.totalBetsTeam2;
  
  // Calculate odds: If pool is 0, defaults to 50/50
  const team1Pct = totalPool === 0 ? 50 : Math.round((match.totalBetsTeam1 / totalPool) * 100);
  const team2Pct = totalPool === 0 ? 50 : Math.round((match.totalBetsTeam2 / totalPool) * 100);

  const isFinished = match.status === 'finished';
  const canBet = (match.status === 'upcoming' || match.status === 'live') && isApproved && !userBet;

  const handleBetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!betTeam || !betAmount || Number(betAmount) < 1) return;
    
    placeBet.mutate({
      data: {
        matchId: match.id,
        team: betTeam,
        amount: Number(betAmount)
      }
    });
  };

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-card border border-white/5 shadow-lg transition-all duration-300 hover:border-white/10 hover:shadow-xl hover:shadow-primary/5 flex flex-col">
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
      
      {/* Header */}
      <div className="relative px-6 py-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${
            match.status === 'live' ? 'bg-red-500 animate-pulse' : 
            match.status === 'upcoming' ? 'bg-blue-400' : 'bg-gray-500'
          }`} />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {match.status}
          </span>
        </div>
        <span className="text-sm font-medium text-muted-foreground">
          {format(new Date(match.matchDate), "MMM d, h:mm a")}
        </span>
      </div>

      {/* Body: Teams */}
      <div className="relative flex-1 p-6 flex flex-col gap-6">
        <div className="flex justify-between items-center w-full">
          {/* Team 1 */}
          <div className="flex flex-col items-center flex-1 gap-2">
            <div className="relative h-16 w-16 rounded-full bg-secondary border border-white/10 flex items-center justify-center text-xl font-bold text-white shadow-inner">
              {match.team1.substring(0, 3).toUpperCase()}
              {isFinished && match.winner === match.team1 && (
                <div className="absolute -top-3 -right-3 text-2xl drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]">👑</div>
              )}
              {isFinished && match.winner && match.winner !== match.team1 && (
                <div className="absolute -top-2 -right-2 text-xl opacity-50">💀</div>
              )}
            </div>
            <span className="font-display font-semibold text-lg text-center leading-tight">
              {match.team1}
            </span>
            <div className="flex items-center gap-1 text-sm text-primary font-medium bg-primary/10 px-2 py-1 rounded-md">
              {team1Pct}% Odds
            </div>
          </div>

          <div className="flex flex-col items-center justify-center px-4">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">VS</span>
          </div>

          {/* Team 2 */}
          <div className="flex flex-col items-center flex-1 gap-2">
            <div className="relative h-16 w-16 rounded-full bg-secondary border border-white/10 flex items-center justify-center text-xl font-bold text-white shadow-inner">
              {match.team2.substring(0, 3).toUpperCase()}
              {isFinished && match.winner === match.team2 && (
                <div className="absolute -top-3 -right-3 text-2xl drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]">👑</div>
              )}
              {isFinished && match.winner && match.winner !== match.team2 && (
                <div className="absolute -top-2 -right-2 text-xl opacity-50">💀</div>
              )}
            </div>
            <span className="font-display font-semibold text-lg text-center leading-tight">
              {match.team2}
            </span>
            <div className="flex items-center gap-1 text-sm text-primary font-medium bg-primary/10 px-2 py-1 rounded-md">
              {team2Pct}% Odds
            </div>
          </div>
        </div>

        {/* Total Pool */}
        <div className="flex flex-col items-center bg-secondary/30 rounded-xl p-3 border border-white/5">
          <span className="text-xs text-muted-foreground mb-1">Total Pool</span>
          <span className="flex items-center gap-1.5 font-display font-bold text-lg text-white">
            <Coins className="h-4 w-4 text-primary" />
            {formatCurrency(totalPool)}
          </span>
          <div className="w-full h-2 rounded-full bg-secondary mt-3 flex overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${team1Pct}%` }} />
            <div className="h-full bg-red-500" style={{ width: `${team2Pct}%` }} />
          </div>
        </div>

        {/* Existing Bet Info */}
        {userBet && (
          <div className={`p-4 rounded-xl border ${
            userBet.status === 'won' ? 'bg-green-500/10 border-green-500/30' : 
            userBet.status === 'lost' ? 'bg-red-500/10 border-red-500/30' : 
            'bg-primary/10 border-primary/30'
          }`}>
            <p className="text-sm text-center font-medium">
              You bet <span className="font-bold text-white">{formatCurrency(userBet.amount)}</span> on <span className="font-bold text-white">{userBet.team}</span>
            </p>
            {userBet.payout ? (
              <p className={`text-center font-bold mt-1 ${userBet.status === 'won' ? 'text-green-400' : 'text-red-400'}`}>
                {userBet.status === 'won' ? `Won ${formatCurrency(userBet.payout)}!` : 'Lost'}
              </p>
            ) : (
              <p className="text-xs text-center text-muted-foreground mt-1">Pending result...</p>
            )}
          </div>
        )}

        {/* Actions */}
        {canBet && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <button className="w-full py-3 px-4 rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200">
                Place Bet
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Place your bet</DialogTitle>
                <DialogDescription>
                  Choose a team and enter your wager amount.
                </DialogDescription>
              </DialogHeader>
              
              <form onSubmit={handleBetSubmit} className="mt-4 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  {[match.team1, match.team2].map(team => (
                    <button
                      key={team}
                      type="button"
                      onClick={() => setBetTeam(team)}
                      className={`py-4 px-4 rounded-xl font-display font-semibold text-lg transition-all border-2 ${
                        betTeam === team 
                          ? 'border-primary bg-primary/10 text-primary shadow-[0_0_15px_rgba(245,158,11,0.2)]' 
                          : 'border-white/10 bg-secondary hover:border-white/20 text-white'
                      }`}
                    >
                      {team}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground block">
                    Bet Amount (USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">$</span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={betAmount}
                      onChange={e => setBetAmount(e.target.value)}
                      placeholder="100"
                      className="w-full pl-8 pr-4 py-3 rounded-xl bg-background border-2 border-white/10 text-white font-display text-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!betTeam || !betAmount || Number(betAmount) < 1 || placeBet.isPending}
                  className="w-full py-4 rounded-xl font-bold text-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {placeBet.isPending ? "Processing..." : "Confirm Wager"}
                </button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
