import { useState } from "react";
import { Coins, Pencil, Trash2, LogIn, Clock } from "lucide-react";
import { Match, Bet } from "@workspace/api-client-react/src/generated/api.schemas";
import { usePlaceBet } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@workspace/replit-auth-web";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatMatchDate(dateStr: string) {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date) + " IST";
}

interface MatchCardProps {
  match: Match;
  userBet?: Bet | null;
  isApproved: boolean;
}

export function MatchCard({ match, userBet, isApproved }: MatchCardProps) {
  const { toast } = useToast();
  const { isAuthenticated, user, login } = useAuth();
  const queryClient = useQueryClient();
  const [betTeam, setBetTeam] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<string>("");
  const [editAmount, setEditAmount] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const placeBet = usePlaceBet({
    mutation: {
      onSuccess: () => {
        toast({
          title: "Bet placed!",
          description: `You bet ${formatCurrency(Number(betAmount))} on ${betTeam}`,
        });
        setDialogOpen(false);
        setBetAmount("");
        setBetTeam(null);
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
  const team1Pct = totalPool === 0 ? 50 : Math.round((match.totalBetsTeam1 / totalPool) * 100);
  const team2Pct = totalPool === 0 ? 50 : Math.round((match.totalBetsTeam2 / totalPool) * 100);

  const isFinished = match.status === 'finished';
  const matchTimeUp = new Date() >= new Date(match.matchDate);
  const canBet = match.status === 'upcoming' && !matchTimeUp && isApproved && !userBet;
  const canEdit = !!userBet && match.status === 'upcoming' && !matchTimeUp && isApproved;

  const handleBetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!betTeam || !betAmount || Number(betAmount) < 1) return;
    placeBet.mutate({ data: { matchId: match.id, team: betTeam, amount: Number(betAmount) } });
  };

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userBet) return;
    setSaving(true);
    try {
      const payload: { amount?: number; team?: string } = {};
      const amt = parseFloat(editAmount);
      if (!isNaN(amt) && amt > 0 && amt !== userBet.amount) payload.amount = amt;
      if (editTeam && editTeam !== userBet.team) payload.team = editTeam;
      if (!payload.amount && !payload.team) {
        toast({ title: "No changes made" });
        setEditOpen(false);
        return;
      }
      const res = await fetch(`${BASE}/api/bets/${userBet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update bet");
      }
      toast({ title: "Bet updated!" });
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/matches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bets'] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!userBet) return;
    setCancelling(true);
    try {
      const res = await fetch(`${BASE}/api/bets/${userBet.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to cancel bet");
      }
      toast({ title: "Bet cancelled" });
      queryClient.invalidateQueries({ queryKey: ['/api/matches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bets'] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setCancelling(false);
    }
  }

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
          {formatMatchDate(match.matchDate)}
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
            <span className="font-display font-semibold text-lg text-center leading-tight">{match.team1}</span>
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
            <span className="font-display font-semibold text-lg text-center leading-tight">{match.team2}</span>
            <div className="flex items-center gap-1 text-sm text-primary font-medium bg-primary/10 px-2 py-1 rounded-md">
              {team2Pct}% Odds
            </div>
          </div>
        </div>

        {/* Live Score */}
        {match.score && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-1">Live Score</p>
            <p className="text-sm font-mono font-semibold text-white leading-relaxed">{match.score}</p>
          </div>
        )}

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
          <div className={`rounded-xl border ${
            userBet.status === 'won' ? 'bg-green-500/10 border-green-500/30' :
            userBet.status === 'lost' ? 'bg-red-500/10 border-red-500/30' :
            'bg-primary/10 border-primary/30'
          }`}>
            <div className="p-4">
              <p className="text-sm text-center font-medium">
                Your bet: <span className="font-bold text-white">{formatCurrency(userBet.amount)}</span> on{" "}
                <span className="font-bold text-white">{userBet.team}</span>
              </p>
              {userBet.payout ? (
                <p className={`text-center font-bold mt-1 ${userBet.status === 'won' ? 'text-green-400' : 'text-red-400'}`}>
                  {userBet.status === 'won' ? `Won ${formatCurrency(userBet.payout)}!` : 'Lost'}
                </p>
              ) : (
                <p className="text-xs text-center text-muted-foreground mt-1">Pending result…</p>
              )}
            </div>

            {/* Edit / Cancel row — only while match is editable */}
            {canEdit && (
              <div className="flex border-t border-white/10">
                <button
                  onClick={() => {
                    setEditTeam(userBet.team);
                    setEditAmount(userBet.amount.toString());
                    setEditOpen(true);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-blue-400 hover:bg-blue-500/10 transition-colors rounded-bl-xl"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit Bet
                </button>
                <div className="w-px bg-white/10" />
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/10 transition-colors rounded-br-xl disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {cancelling ? "Cancelling…" : "Cancel Bet"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Guest / Pending CTA — only on upcoming, bettable matches */}
        {!isFinished && !userBet && match.status === 'upcoming' && !matchTimeUp && !isApproved && (
          !isAuthenticated ? (
            <button
              onClick={() => login()}
              className="w-full py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all duration-200"
            >
              <LogIn className="h-4 w-4" />
              Sign In to Bet
            </button>
          ) : (
            <div className="w-full py-3 px-4 rounded-xl text-center text-sm font-semibold flex items-center justify-center gap-2 bg-secondary/50 border border-white/10 text-muted-foreground cursor-default">
              <Clock className="h-4 w-4" />
              {user?.status === 'pending' ? 'Awaiting Admin Approval' : 'Access Required to Bet'}
            </div>
          )
        )}

        {/* Place Bet button */}
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
                <DialogDescription>Choose a team and enter your wager amount.</DialogDescription>
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
                  <label className="text-sm font-medium text-muted-foreground block">Bet Amount (USD)</label>
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

        {/* Locked message — has bet but match is locked/live/finished and bet is pending */}
        {userBet && !canEdit && userBet.status === 'pending' && !isFinished && (
          <p className="text-xs text-center text-muted-foreground">Betting locked — match is {match.status}</p>
        )}
      </div>

      {/* Edit Bet Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => !o && setEditOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Your Bet</DialogTitle>
            <DialogDescription>Change your team or wager amount.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="mt-4 space-y-5">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Switch Team</label>
              <div className="grid grid-cols-2 gap-3">
                {[match.team1, match.team2].map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEditTeam(t)}
                    className={`py-3 px-4 rounded-xl border font-semibold text-sm transition-all ${
                      editTeam === t
                        ? 'border-primary bg-primary/20 text-white'
                        : 'border-white/10 text-muted-foreground hover:border-white/30'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Wager Amount</label>
              <input
                type="number"
                min="1"
                step="1"
                value={editAmount}
                onChange={e => setEditAmount(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-background border border-white/10 text-white focus:outline-none focus:border-primary"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-muted-foreground hover:text-white transition-colors text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
