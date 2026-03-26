import { useState } from "react";

import { useAuth } from "@workspace/replit-auth-web";
import { 
  useListUsers, 
  useGetAdminStats, 
  useListMatches, 
  useCreateMatch, 
  useSetMatchResult,
  useApproveUser,
  useRejectUser
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  const { user, isLoading } = useAuth();
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

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  async function handleFixAllTimes() {
    setFixingTimes(true);
    try {
      const res = await fetch(`${BASE}/api/admin/fix-match-times`, {
        method: "POST",
        credentials: "include",
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
      const res = await fetch(`${BASE}/api/matches/${editMatchId}`, {
        method: "PATCH",
        credentials: "include",
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

  async function handleImportMatches() {
    setImporting(true);
    try {
      const res = await fetch(`${BASE}/api/admin/import-matches`, {
        method: "POST",
        credentials: "include",
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

  if (isLoading) return null;
  if (!user?.isAdmin) {
    return <div className="p-8 text-center text-red-500">Access Denied</div>;
  }

  const pendingUsers = users?.filter(u => u.status === 'pending') || [];
  const activeMatches = matches?.filter(m => m.status !== 'finished') || [];

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
              <div key={match.id} className="bg-card border border-white/5 rounded-2xl p-6 relative">
                <div className="flex justify-between items-start mb-4">
                  <button
                    onClick={() => {
                      const d = new Date(match.matchDate);
                      const offsetMs = -4 * 60 * 60 * 1000;
                      const etDate = new Date(d.getTime() + offsetMs);
                      const etStr = etDate.toISOString().slice(0, 16);
                      setEditMatchId(match.id);
                      setEditMatchDate(etStr);
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-muted-foreground bg-secondary px-2 py-1 rounded hover:text-amber-400 transition-colors"
                    title="Click to edit time"
                  >
                    <Pencil className="h-3 w-3" />
                    {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(match.matchDate))} ET
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMatchResult.mutate({
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
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setMatchResult.mutate({ matchId: match.id, data: { status: 'finished', winner: match.team1 } })}
                      className="py-2 px-3 rounded-lg border border-white/10 hover:border-primary hover:bg-primary/10 transition-colors text-sm font-semibold"
                    >
                      {match.team1} Won
                    </button>
                    <button
                      onClick={() => setMatchResult.mutate({ matchId: match.id, data: { status: 'finished', winner: match.team2 } })}
                      className="py-2 px-3 rounded-lg border border-white/10 hover:border-primary hover:bg-primary/10 transition-colors text-sm font-semibold"
                    >
                      {match.team2} Won
                    </button>
                  </div>
                  <button
                      onClick={() => setMatchResult.mutate({ matchId: match.id, data: { status: 'finished', winner: null } })}
                      className="w-full py-2 px-3 rounded-lg border border-white/10 hover:border-white/30 hover:bg-secondary transition-colors text-sm font-semibold mt-2"
                    >
                      Draw / Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
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
