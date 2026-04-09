import { useState } from "react";
import { supabase } from "@/lib/supabase";

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(url, {
    ...options,
    headers: { ...(options.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}
import { useQueryClient } from "@tanstack/react-query";
import { useListMyBets } from "@workspace/api-client-react";

import { formatCurrency } from "@/lib/utils";
import { ArrowRight, Ticket, Trophy, Pencil, Trash2, Lock } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function updateBet(betId: number, data: { amount?: number; team?: string }) {
  const res = await authFetch(`${BASE}/api/bets/${betId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update bet");
  }
  return res.json();
}

async function cancelBet(betId: number) {
  const res = await authFetch(`${BASE}/api/bets/${betId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to cancel bet");
  }
  return res.json();
}

interface EditState {
  betId: number;
  currentAmount: number;
  currentTeam: string;
  team1: string;
  team2: string;
}

export default function MyBets() {
  const { data: bets, isLoading } = useListMyBets();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editState, setEditState] = useState<EditState | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", team: "" });
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);

  function openEdit(bet: NonNullable<typeof bets>[0]) {
    if (!bet.match) return;
    setEditState({
      betId: bet.id,
      currentAmount: bet.amount,
      currentTeam: bet.team,
      team1: bet.match.team1,
      team2: bet.match.team2,
    });
    setEditForm({ amount: bet.amount.toString(), team: bet.team });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editState) return;
    setSaving(true);
    try {
      const payload: { amount?: number; team?: string } = {};
      const amt = parseFloat(editForm.amount);
      if (!isNaN(amt) && amt > 0 && amt !== editState.currentAmount) payload.amount = amt;
      if (editForm.team && editForm.team !== editState.currentTeam) payload.team = editForm.team;

      if (Object.keys(payload).length === 0) {
        toast({ title: "No changes made" });
        setEditState(null);
        return;
      }
      await updateBet(editState.betId, payload);
      toast({ title: "Bet updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/bets"] });
      setEditState(null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(betId: number) {
    if (!confirm("Are you sure you want to cancel this bet?")) return;
    setCancelling(betId);
    try {
      await cancelBet(betId);
      toast({ title: "Bet cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/bets"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setCancelling(null);
    }
  }

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
          {[...bets].sort((a, b) => new Date(a.match?.matchDate ?? 0).getTime() - new Date(b.match?.matchDate ?? 0).getTime()).map((bet) => {
            const match = bet.match;
            if (!match) return null;

            const isWon = bet.status === 'won';
            const isLost = bet.status === 'lost';
            const isPending = bet.status === 'pending';
            const isLive = match.status === 'live';
            const isFinished = match.status === 'finished';
            const bettingLockTime = new Date(new Date(match.matchDate).getTime() - 30 * 60 * 1000);
            const matchTimeUp = new Date() >= bettingLockTime;
            const isEditable = !matchTimeUp && match.status === 'upcoming';
            const isLocked = !isEditable;

            return (
              <div
                key={bet.id}
                className={`relative overflow-hidden flex flex-col p-6 rounded-2xl border transition-all ${
                  isWon ? 'bg-green-500/5 border-green-500/20 shadow-[0_0_30px_-10px_rgba(34,197,94,0.1)]' :
                  isLost ? 'bg-red-500/5 border-red-500/20' :
                  isLocked && !isFinished ? 'bg-red-500/5 border-red-500/20' :
                  'bg-card border-white/10'
                }`}
              >
                {/* Match Info */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(match.matchDate))} ET
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      isLive ? 'bg-red-500/20 text-red-400 animate-pulse' :
                      match.status === 'finished' ? 'bg-white/10 text-white/70' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {match.status}
                    </span>
                    {isEditable && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-primary/20 text-primary">
                        Editable
                      </span>
                    )}
                    {isLocked && !isFinished && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/15 text-red-400">
                        <Lock className="h-2.5 w-2.5" /> Betting Locked
                      </span>
                    )}
                  </div>
                  <h4 className="text-lg font-display font-bold text-white flex items-center gap-3">
                    <span className={bet.team === match.team1 ? 'text-primary' : ''}>{match.team1}</span>
                    <span className="text-muted-foreground text-sm font-normal">vs</span>
                    <span className={bet.team === match.team2 ? 'text-primary' : ''}>{match.team2}</span>
                  </h4>
                </div>

                {/* Bet Info */}
                <div className="flex items-center gap-6 w-full">
                  <div className="flex items-center gap-6 flex-1 bg-secondary/50 p-4 rounded-xl">
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
                        <p className="font-bold text-amber-400">Pending</p>
                      ) : isWon ? (
                        <p className="font-bold text-green-400 flex items-center justify-end gap-1 text-lg">
                          <Trophy className="h-4 w-4" />
                          +{formatCurrency(bet.payout || 0)}
                        </p>
                      ) : (
                        <p className="font-bold text-red-400">Lost</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Edit / Cancel row — only before match time */}
                {isEditable && (
                  <div className="flex gap-3 mt-4 pt-4 border-t border-white/5 w-full">
                    <button
                      onClick={() => openEdit(bet)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 font-semibold text-sm transition-colors"
                    >
                      <Pencil className="h-4 w-4" /> Edit Bet
                    </button>
                    <button
                      onClick={() => handleCancel(bet.id)}
                      disabled={cancelling === bet.id}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 font-semibold text-sm transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      {cancelling === bet.id ? "Cancelling…" : "Cancel Bet"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Bet Dialog */}
      <Dialog open={!!editState} onOpenChange={(open) => !open && setEditState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Bet</DialogTitle>
          </DialogHeader>
          {editState && (
            <form onSubmit={handleSave} className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Switch Team
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[editState.team1, editState.team2].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEditForm(f => ({ ...f, team: t }))}
                      className={`py-3 px-4 rounded-xl border font-semibold text-sm transition-all ${
                        editForm.team === t
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
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Wager Amount
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={editForm.amount}
                  onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-white/10 text-white focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditState(null)}
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
