import { useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

import { 
  useListUsers, 
  useGetAdminStats, 
  useListMatches, 
  useCreateMatch, 
  useSetMatchResult,
  useApproveUser,
  useRejectUser
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, UserCheck, Trophy, Activity, TrendingUp, CheckCircle, XCircle, Download, RefreshCw, Pencil, Clock
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function Admin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users } = useListUsers();
  const { data: stats } = useGetAdminStats();
  const { data: matches } = useListMatches();

  const approveUser = useApproveUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "User approved successfully" });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      }
    }
  });

  const rejectUser = useRejectUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "User rejected" });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      }
    }
  });

  const createMatch = useCreateMatch({
    mutation: {
      onSuccess: () => {
        toast({ title: "Match created successfully" });
        queryClient.invalidateQueries({ queryKey: ['/api/matches'] });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
        setCreateMatchOpen(false);
      },
      onError: (err) => toast({ variant: "destructive", title: "Error", description: err.message })
    }
  });

  const setMatchResult = useSetMatchResult({
    mutation: {
      onSuccess: () => {
        toast({ title: "Result updated" });
        queryClient.invalidateQueries({ queryKey: ['/api/matches'] });
      }
    }
  });

  const [createMatchOpen, setCreateMatchOpen] = useState(false);
  const [matchForm, setMatchForm] = useState({ team1: "", team2: "", matchDate: "" });
  const [importing, setImporting] = useState(false);
  const [fixingTimes, setFixingTimes] = useState(false);
  const [editMatchId, setEditMatchId] = useState<number | null>(null);
  const [editMatchDate, setEditMatchDate] = useState("");
  // per-match score text for manual result entry
  const [matchScores, setMatchScores] = useState<Record<number, string>>({});

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  async function handleFixAllTimes() {
    setFixingTimes(true);
    try {
      const res = await authFetch(`${BASE}/api/admin/fix-match-times`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fix failed");
      queryClient.invalidateQueries({ queryKey: ['/api/matches'] });
      toast({ title: `Fixed ${data.fixed} match time(s)`, description: "All matches now show 10:00 AM ET" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fix failed", description: err.message });
    } finally {
      setFixingTimes(false);
    }
  }

  async function handleEditMatchTime() {
    if (!editMatchId || !editMatchDate) return;
    const matchDateET = editMatchDate + ":00-04:00";
    try {
      const res = await authFetch(`${BASE}/api/matches/${editMatchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchDate: matchDateET }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      queryClient.invalidateQueries({ queryKey: ['/api/matches'] });
      toast({ title: "Match time updated" });
      setEditMatchId(null);
      setEditMatchDate("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update failed", description: err.message });
    }
  }

  async function handleSetResult(matchId: number, winner: string | null, score?: string) {
    try {
      const res = await authFetch(`${BASE}/api/matches/${matchId}/result`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "finished", winner, ...(score ? { score } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set result");
      toast({ title: "Result updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/matches'] });
      // Clear the score input for this match
      setMatchScores(prev => { const next = { ...prev }; delete next[matchId]; return next; });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  }

  async function handleImportMatches() {
    setImporting(true);
    try {
      const res = await authFetch(`${BASE}/api/admin/import-matches`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      queryClient.invalidateQueries({ queryKey: ['/api/matches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      if (data.imported === 0) {
        toast({ title: "No new matches found", description: `${data.skipped} already in your schedule.` });
      } else {
        toast({
          title: `Imported ${data.imported} match${data.imported !== 1 ? "es" : ""}`,
          description: data.skipped > 0 ? `${data.skipped} duplicate(s) skipped.` : "All matches added successfully.",
        });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Import failed", description: err.message });
    } finally {
      setImporting(false);
    }
  }

  const [showFinished, setShowFinished] = useState(false);
  const [finishedEditId, setFinishedEditId] = useState<number | null>(null);

  const pendingUsers = users?.filter(u => u.status === 'pending') || [];
  const allMatches = (matches || []).slice().sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());
  const activeMatches = allMatches.filter(m => m.status !== 'finished');
  const finishedMatches = allMatches.filter(m => m.status === 'finished');

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-display font-black text-white">Admin Control</h1>
        <p className="text-muted-foreground mt-2">Manage users, matches, and view platform statistics.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon={Users} label="Total Users" value={stats.totalUsers.toString()} />
          <StatCard icon={UserCheck} label="Pending Approvals" value={stats.pendingUsers.toString()} trend={stats.pendingUsers > 0} />
          <StatCard icon={TrendingUp} label="Total Volume" value={formatCurrency(stats.totalBetAmount)} />
          <StatCard icon={Activity} label="Active Matches" value={stats.activeMatches.toString()} />
        </div>
      )}

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="pending">Pending Approvals</TabsTrigger>
          <TabsTrigger value="users">All Users</TabsTrigger>
          <TabsTrigger value="matches">Manage Matches</TabsTrigger>
          <TabsTrigger value="bets">Manage Bets</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <div className="bg-card rounded-2xl border border-white/5 overflow-hidden">
            <div className="p-6 border-b border-white/5 bg-secondary/30">
              <h3 className="font-display font-bold text-lg text-white">Pending Registrations</h3>
            </div>
            {pendingUsers.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">No pending users.</div>
            ) : (
              <div className="divide-y divide-white/5">
                {pendingUsers.map(u => (
                  <div key={u.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center font-bold text-white">
                        {u.username?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-white">{u.username}</p>
                        <p className="text-sm text-muted-foreground">{format(new Date(u.createdAt), "MMM d, yyyy")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => rejectUser.mutate({ userId: u.id })}
                        disabled={rejectUser.isPending}
                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Reject"
                      >
                        <XCircle className="h-6 w-6" />
                      </button>
                      <button 
                        onClick={() => approveUser.mutate({ userId: u.id })}
                        disabled={approveUser.isPending}
                        className="p-2 text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
                        title="Approve"
                      >
                        <CheckCircle className="h-6 w-6" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="users">
          <div className="bg-card rounded-2xl border border-white/5 overflow-x-auto">
             <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-secondary/50 text-muted-foreground font-medium border-b border-white/5">
                  <tr>
                    <th className="px-6 py-4">Username</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Total Bets</th>
                    <th className="px-6 py-4 text-right">Volume</th>
                    <th className="px-6 py-4 text-right">Total Won</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users?.map(u => (
                    <tr key={u.id} className="hover:bg-white/[0.02]">
                      <td className="px-6 py-4 font-medium text-white">{u.username}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                          u.status === 'approved' ? 'bg-green-500/10 text-green-400' :
                          u.status === 'rejected' ? 'bg-red-500/10 text-red-400' :
                          'bg-amber-500/10 text-amber-400'
                        }`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">{u.totalBets}</td>
                      <td className="px-6 py-4 text-right font-medium text-white">{formatCurrency(u.totalBetAmount)}</td>
                      <td className="px-6 py-4 text-right font-medium text-green-400">{formatCurrency(u.totalWon)}</td>
                    </tr>
                  ))}
                </tbody>
             </table>
          </div>
        </TabsContent>

        <TabsContent value="matches">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleImportMatches}
                disabled={importing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-all flex items-center gap-2 disabled:opacity-60"
              >
                {importing
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Importing…</>
                  : <><Download className="h-4 w-4" /> Load from CricAPI</>
                }
              </button>
              <button
                onClick={handleFixAllTimes}
                disabled={fixingTimes}
                title="Shift all 6 AM ET matches to 10 AM ET"
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-all flex items-center gap-2 disabled:opacity-60"
              >
                {fixingTimes
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Fixing…</>
                  : <><Clock className="h-4 w-4" /> Fix All Times</>
                }
              </button>
            </div>

            <Dialog open={createMatchOpen} onOpenChange={setCreateMatchOpen}>
              <DialogTrigger asChild>
                <button className="px-4 py-2 bg-primary text-primary-foreground font-bold rounded-lg hover:shadow-lg shadow-primary/20 transition-all flex items-center gap-2">
                  <Trophy className="h-4 w-4" /> Create Match
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Match</DialogTitle>
                </DialogHeader>
                <form 
                  className="space-y-4 mt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!matchForm.team1 || !matchForm.team2 || !matchForm.matchDate) return;
                    // Treat datetime-local input as ET (UTC-4 / EDT) so server stores correct UTC
                    const matchDateET = matchForm.matchDate + ":00-04:00";
                    createMatch.mutate({ data: { ...matchForm, matchDate: matchDateET } });
                  }}
                >
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Team 1</label>
                    <input 
                      type="text" required
                      value={matchForm.team1} onChange={e => setMatchForm({...matchForm, team1: e.target.value})}
                      className="w-full px-4 py-2 rounded-lg bg-background border border-white/10 text-white focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Team 2</label>
                    <input 
                      type="text" required
                      value={matchForm.team2} onChange={e => setMatchForm({...matchForm, team2: e.target.value})}
                      className="w-full px-4 py-2 rounded-lg bg-background border border-white/10 text-white focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Match Date & Time <span className="text-xs text-primary/70">(enter in ET)</span></label>
                    <input 
                      type="datetime-local" required
                      value={matchForm.matchDate} onChange={e => setMatchForm({...matchForm, matchDate: e.target.value})}
                      className="w-full px-4 py-2 rounded-lg bg-background border border-white/10 text-white focus:outline-none focus:border-primary"
                    />
                  </div>
                  <button 
                    type="submit" disabled={createMatch.isPending}
                    className="w-full py-3 mt-4 bg-primary text-primary-foreground font-bold rounded-xl"
                  >
                    {createMatch.isPending ? "Creating..." : "Save Match"}
                  </button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeMatches.map(match => (
              <MatchAdminCard
                key={match.id}
                match={match}
                score={matchScores[match.id] ?? ""}
                onScoreChange={v => setMatchScores(prev => ({ ...prev, [match.id]: v }))}
                onSetResult={handleSetResult}
                onSetMatchResult={setMatchResult}
                onEditTime={() => {
                  const d = new Date(match.matchDate);
                  const offsetMs = -4 * 60 * 60 * 1000;
                  const etDate = new Date(d.getTime() + offsetMs);
                  setEditMatchId(match.id);
                  setEditMatchDate(etDate.toISOString().slice(0, 16));
                }}
              />
            ))}
          </div>

          {/* Finished Matches Section */}
          {finishedMatches.length > 0 && (
            <div className="mt-8">
              <button
                onClick={() => setShowFinished(v => !v)}
                className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-white transition-colors mb-4"
              >
                <span className={`transition-transform ${showFinished ? 'rotate-90' : ''}`}>▶</span>
                Finished Matches ({finishedMatches.length}) — click to edit incorrect results
              </button>

              {showFinished && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {finishedMatches.map(match => (
                    <div key={match.id} className="bg-card border border-amber-500/20 rounded-2xl p-6 relative">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-bold text-amber-500/70 bg-amber-500/10 px-2 py-0.5 rounded">FINISHED</span>
                        <span className="text-xs text-muted-foreground">
                          {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(new Date(match.matchDate))}
                        </span>
                      </div>

                      <h4 className="text-lg font-display font-bold text-white mb-1 text-center">
                        {match.team1} <span className="text-muted-foreground font-normal text-sm mx-2">vs</span> {match.team2}
                      </h4>

                      {match.winner && (
                        <p className="text-center text-xs text-green-400 font-semibold mb-4">
                          Winner: {match.winner}
                        </p>
                      )}

                      {finishedEditId === match.id ? (
                        <div className="space-y-3 border-t border-amber-500/20 pt-4 mt-2">
                          <p className="text-xs text-amber-400 font-medium text-center">
                            ⚠ Changing this will re-settle all bets for this match
                          </p>
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Updated Score / Result <span className="text-primary/60">(optional)</span></label>
                            <input
                              type="text"
                              placeholder={`e.g. ${match.team1}: 172/4  •  ${match.team2}: 168/8`}
                              value={matchScores[match.id] ?? ""}
                              onChange={e => setMatchScores(prev => ({ ...prev, [match.id]: e.target.value }))}
                              className="w-full px-3 py-2 rounded-lg bg-background border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500 mb-2"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => { handleSetResult(match.id, match.team1, matchScores[match.id]); setFinishedEditId(null); }}
                              className="py-2 px-2 rounded-lg border border-white/10 hover:border-primary hover:bg-primary/10 transition-colors text-xs font-bold"
                            >
                              {match.team1} Won
                            </button>
                            <button
                              onClick={() => { handleSetResult(match.id, match.team2, matchScores[match.id]); setFinishedEditId(null); }}
                              className="py-2 px-2 rounded-lg border border-white/10 hover:border-primary hover:bg-primary/10 transition-colors text-xs font-bold"
                            >
                              {match.team2} Won
                            </button>
                          </div>
                          <button
                            onClick={() => { handleSetResult(match.id, null, matchScores[match.id]); setFinishedEditId(null); }}
                            className="w-full py-2 rounded-lg border border-white/10 hover:border-white/30 hover:bg-secondary transition-colors text-xs font-semibold"
                          >
                            Draw / Cancel
                          </button>
                          <button
                            onClick={() => setFinishedEditId(null)}
                            className="w-full py-1.5 text-xs text-muted-foreground hover:text-white transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setFinishedEditId(match.id)}
                          className="w-full mt-2 py-2 rounded-lg border border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-500/5 transition-colors text-xs font-bold text-amber-400 flex items-center justify-center gap-1.5"
                        >
                          <Pencil className="h-3 w-3" /> Edit Result
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bets">
          <ManageBetsTab users={users || []} matches={allMatches} basePath={BASE} />
        </TabsContent>
      </Tabs>

      {/* Edit Match Time Dialog */}
      <Dialog open={editMatchId !== null} onOpenChange={(open) => { if (!open) { setEditMatchId(null); setEditMatchDate(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Match Time</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">New Date & Time <span className="text-xs text-primary/70">(enter in ET)</span></label>
              <input
                type="datetime-local"
                value={editMatchDate}
                onChange={e => setEditMatchDate(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-background border border-white/10 text-white focus:outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={handleEditMatchTime}
              className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl"
            >
              Save Time
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Manage Bets tab ──────────────────────────────────────────────────────────
type AdminBet = {
  id: number;
  userId: string;
  user: { id: string; username: string; email: string | null } | null;
  matchId: number;
  match: { id: number; team1: string; team2: string; matchDate: string; status: string; winner: string | null } | null;
  team: string;
  amount: number;
  payout: number | null;
  status: "pending" | "won" | "lost";
  createdAt: string;
};

function ManageBetsTab({ users, matches, basePath }: { users: any[]; matches: any[]; basePath: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allBets, refetch } = useQuery<AdminBet[]>({
    queryKey: ['/api/admin/all-bets'],
    queryFn: async () => {
      const res = await authFetch(`${basePath}/api/admin/all-bets`);
      if (!res.ok) throw new Error("Failed to load bets");
      return res.json();
    },
  });

  const approvedUsers = users.filter(u => u.status === 'approved');
  const bettableMatches = matches.filter(m => m.status === 'upcoming');

  const [formUserId, setFormUserId] = useState("");
  const [formMatchId, setFormMatchId] = useState<number | "">("");
  const [formTeam, setFormTeam] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editBetId, setEditBetId] = useState<number | null>(null);
  const [editTeam, setEditTeam] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const selectedMatch = bettableMatches.find(m => m.id === formMatchId);

  function invalidateBetsAndStats() {
    queryClient.invalidateQueries({ queryKey: ['/api/admin/all-bets'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/bets'] });
    refetch();
  }

  async function handleCreateBet(e: React.FormEvent) {
    e.preventDefault();
    if (!formUserId || !formMatchId || !formTeam) {
      toast({ variant: "destructive", title: "Missing fields", description: "Pick user, match, and team." });
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch(`${basePath}/api/admin/bets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: formUserId, matchId: formMatchId, team: formTeam }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create bet");
      toast({ title: "Bet placed", description: `$10 on ${formTeam} for ${approvedUsers.find(u => u.id === formUserId)?.username}` });
      setFormUserId(""); setFormMatchId(""); setFormTeam("");
      invalidateBetsAndStats();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed", description: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(bet: AdminBet) {
    setEditBetId(bet.id);
    setEditTeam(bet.team);
  }

  async function handleSaveEdit() {
    if (editBetId == null || !editTeam) return;
    setEditSubmitting(true);
    try {
      const res = await authFetch(`${basePath}/api/admin/bets/${editBetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team: editTeam }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      toast({ title: "Bet updated", description: `Team changed to ${editTeam}` });
      setEditBetId(null); setEditTeam("");
      invalidateBetsAndStats();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update failed", description: err.message });
    } finally {
      setEditSubmitting(false);
    }
  }

  const editingBet = allBets?.find(b => b.id === editBetId);

  return (
    <div className="space-y-6">
      {/* Create bet card */}
      <div className="bg-card border border-white/5 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5 bg-secondary/30">
          <h3 className="font-display font-bold text-lg text-white">Place Bet for User</h3>
          <p className="text-sm text-muted-foreground mt-1">Amount is fixed at $10. Match must be upcoming and not within 30 minutes of start.</p>
        </div>
        <form onSubmit={handleCreateBet} className="p-6 grid gap-4 md:grid-cols-4 items-end">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">User</label>
            <select
              value={formUserId}
              onChange={e => setFormUserId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-white/10 text-white text-sm focus:outline-none focus:border-primary"
            >
              <option value="">Select user…</option>
              {approvedUsers.map(u => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Match</label>
            <select
              value={formMatchId === "" ? "" : String(formMatchId)}
              onChange={e => { setFormMatchId(e.target.value ? Number(e.target.value) : ""); setFormTeam(""); }}
              className="w-full px-3 py-2 rounded-lg bg-background border border-white/10 text-white text-sm focus:outline-none focus:border-primary"
            >
              <option value="">Select match…</option>
              {bettableMatches.map(m => (
                <option key={m.id} value={m.id}>{m.team1} vs {m.team2} — {format(new Date(m.matchDate), "MMM d, h:mm a")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Team</label>
            <select
              value={formTeam}
              onChange={e => setFormTeam(e.target.value)}
              disabled={!selectedMatch}
              className="w-full px-3 py-2 rounded-lg bg-background border border-white/10 text-white text-sm focus:outline-none focus:border-primary disabled:opacity-50"
            >
              <option value="">Select team…</option>
              {selectedMatch && <option value={selectedMatch.team1}>{selectedMatch.team1}</option>}
              {selectedMatch && <option value={selectedMatch.team2}>{selectedMatch.team2}</option>}
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-lg transition-all disabled:opacity-60"
          >
            {submitting ? "Placing…" : "Place $10 Bet"}
          </button>
        </form>
      </div>

      {/* Bets table */}
      <div className="bg-card rounded-2xl border border-white/5 overflow-x-auto">
        <div className="p-6 border-b border-white/5 bg-secondary/30 flex items-center justify-between">
          <h3 className="font-display font-bold text-lg text-white">All Bets</h3>
          <span className="text-sm text-muted-foreground">{allBets?.length ?? 0} total</span>
        </div>
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-secondary/50 text-muted-foreground font-medium border-b border-white/5">
            <tr>
              <th className="px-6 py-3">User</th>
              <th className="px-6 py-3">Match</th>
              <th className="px-6 py-3">Team</th>
              <th className="px-6 py-3 text-right">Amount</th>
              <th className="px-6 py-3 text-right">Payout</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Placed</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(allBets ?? []).map(b => {
              const matchEditable = b.status === "pending" && b.match?.status === "upcoming"
                && new Date(b.match.matchDate).getTime() - 30 * 60 * 1000 > Date.now();
              return (
                <tr key={b.id} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-3 font-medium text-white">{b.user?.username ?? "—"}</td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {b.match ? `${b.match.team1} vs ${b.match.team2}` : "—"}
                  </td>
                  <td className="px-6 py-3 font-semibold text-white">{b.team}</td>
                  <td className="px-6 py-3 text-right">{formatCurrency(b.amount)}</td>
                  <td className="px-6 py-3 text-right text-green-400">{b.payout != null ? formatCurrency(b.payout) : "—"}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                      b.status === 'won' ? 'bg-green-500/10 text-green-400' :
                      b.status === 'lost' ? 'bg-red-500/10 text-red-400' :
                      'bg-amber-500/10 text-amber-400'
                    }`}>{b.status}</span>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground text-xs">{format(new Date(b.createdAt), "MMM d, h:mm a")}</td>
                  <td className="px-6 py-3 text-right">
                    {matchEditable ? (
                      <button
                        onClick={() => startEdit(b)}
                        className="px-3 py-1 text-xs font-semibold rounded-md border border-white/10 hover:border-primary hover:bg-primary/10 text-white transition-colors inline-flex items-center gap-1"
                      >
                        <Pencil className="h-3 w-3" /> Edit team
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">locked</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {allBets && allBets.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">No bets yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit team dialog */}
      <Dialog open={editBetId !== null} onOpenChange={(open) => { if (!open) { setEditBetId(null); setEditTeam(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Bet Team</DialogTitle>
          </DialogHeader>
          {editingBet?.match && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <span className="text-white font-medium">{editingBet.user?.username}</span> · {editingBet.match.team1} vs {editingBet.match.team2}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[editingBet.match.team1, editingBet.match.team2].map(t => (
                  <button
                    key={t}
                    onClick={() => setEditTeam(t)}
                    className={`py-3 px-4 rounded-lg border font-semibold transition-colors ${
                      editTeam === t
                        ? "border-primary bg-primary/15 text-white"
                        : "border-white/10 hover:border-white/30 text-muted-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setEditBetId(null); setEditTeam(""); }}
                  className="px-4 py-2 text-sm font-semibold rounded-lg border border-white/10 hover:border-white/30 text-muted-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editSubmitting || !editTeam || editTeam === editingBet.team}
                  className="px-4 py-2 text-sm font-bold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-all disabled:opacity-60"
                >
                  {editSubmitting ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MatchAdminCard({ match, score, onScoreChange, onSetResult, onSetMatchResult, onEditTime }: {
  match: any;
  score: string;
  onScoreChange: (v: string) => void;
  onSetResult: (matchId: number, winner: string | null, score?: string) => void;
  onSetMatchResult: any;
  onEditTime: () => void;
}) {
  return (
    <div className="bg-card border border-white/5 rounded-2xl p-6 relative">
      <div className="flex justify-between items-start mb-4">
        <button
          onClick={onEditTime}
          className="flex items-center gap-1 text-xs font-bold text-muted-foreground bg-secondary px-2 py-1 rounded hover:text-amber-400 transition-colors"
          title="Click to edit time"
        >
          <Pencil className="h-3 w-3" />
          {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(match.matchDate))} ET
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSetMatchResult.mutate({
              matchId: match.id,
              data: { status: match.status === 'upcoming' ? 'live' : 'upcoming', winner: null }
            })}
            className="text-xs text-blue-400 hover:underline"
          >
            Set {match.status === 'upcoming' ? 'Live' : 'Upcoming'}
          </button>
        </div>
      </div>

      <h4 className="text-xl font-display font-bold text-white mb-6 text-center">
        {match.team1} <span className="text-muted-foreground font-normal text-sm mx-2">vs</span> {match.team2}
      </h4>

      <div className="space-y-3">
        <p className="text-sm font-medium text-center text-muted-foreground mb-2">Conclude Match</p>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Final Score / Result <span className="text-primary/60">(optional)</span></label>
          <input
            type="text"
            placeholder={`e.g. ${match.team1}: 172/4  •  ${match.team2}: 168/8`}
            value={score}
            onChange={e => onScoreChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-background border border-white/10 text-white text-sm focus:outline-none focus:border-primary mb-2"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onSetResult(match.id, match.team1, score)}
            className="py-2 px-3 rounded-lg border border-white/10 hover:border-primary hover:bg-primary/10 transition-colors text-sm font-semibold"
          >
            {match.team1} Won
          </button>
          <button
            onClick={() => onSetResult(match.id, match.team2, score)}
            className="py-2 px-3 rounded-lg border border-white/10 hover:border-primary hover:bg-primary/10 transition-colors text-sm font-semibold"
          >
            {match.team2} Won
          </button>
        </div>
        <button
          onClick={() => onSetResult(match.id, null, score)}
          className="w-full py-2 px-3 rounded-lg border border-white/10 hover:border-white/30 hover:bg-secondary transition-colors text-sm font-semibold mt-2"
        >
          Draw / Cancel
        </button>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, trend = false }: { icon: any, label: string, value: string, trend?: boolean }) {
  return (
    <div className="bg-card border border-white/5 rounded-2xl p-6 flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-secondary rounded-xl text-primary">
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
          </span>
        )}
      </div>
      <div>
        <h3 className="text-3xl font-display font-bold text-white">{value}</h3>
        <p className="text-sm text-muted-foreground font-medium mt-1">{label}</p>
      </div>
    </div>
  );
}
