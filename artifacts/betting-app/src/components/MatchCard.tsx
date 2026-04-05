import { useState } from "react";
import { Coins, Pencil, Trash2, LogIn, Clock, Users } from "lucide-react";
import { Match, Bet } from "@workspace/api-client-react/src/generated/api.schemas";
import { usePlaceBet } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@workspace/replit-auth-web";

type MatchBet = { username: string; profileImage?: string | null; team: string; amount: number };
type MatchWithBets = Match & { bets?: MatchBet[] };

const TEAM_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  CSK:  { bg: '#1a1400', border: '#FFCB05', text: '#FFCB05', glow: '#FFCB0540' },
  MI:   { bg: '#00122b', border: '#004BA0', text: '#60a5fa', glow: '#004BA040' },
  RCB:  { bg: '#1a0002', border: '#E31B23', text: '#f87171', glow: '#E31B2340' },
  KKR:  { bg: '#0e001a', border: '#5B2D8E', text: '#c084fc', glow: '#5B2D8E40' },
  SRH:  { bg: '#1a0800', border: '#F7631B', text: '#fb923c', glow: '#F7631B40' },
  DC:   { bg: '#00101a', border: '#0078BC', text: '#38bdf8', glow: '#0078BC40' },
  PBKS: { bg: '#1a0000', border: '#C8102E', text: '#f87171', glow: '#C8102E40' },
  RR:   { bg: '#1a0010', border: '#EA1A85', text: '#f472b6', glow: '#EA1A8540' },
  GT:   { bg: '#001414', border: '#1C8068', text: '#2dd4bf', glow: '#1C806840' },
  LSG:  { bg: '#001020', border: '#41B6E6', text: '#7dd3fc', glow: '#41B6E640' },
};

function getTeamColor(team: string) {
  return TEAM_COLORS[team.toUpperCase()] ?? { bg: '#1a1a2e', border: '#6366f1', text: '#a5b4fc', glow: '#6366f140' };
}
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const TEAM_LOGO_NAMES = ["CSK", "MI", "RCB", "KKR", "SRH", "DC", "PBKS", "RR", "GT", "LSG"];
const TEAM_LOGOS: Record<string, string> = Object.fromEntries(
  TEAM_LOGO_NAMES.map(t => [t, `${BASE}/team-logos/${t}.png`])
);

function formatMatchDate(dateStr: string) {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date) + " ET";
}

interface MatchCardProps {
  match: MatchWithBets;
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
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null);
  const [logoErrors, setLogoErrors] = useState<Set<string>>(new Set());

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

  // If match.score is saved JSON (from a previous CricAPI call), parse it directly
  const savedJsonScore = (() => {
    if (!match.score) return null;
    try {
      const p = JSON.parse(match.score) as { team1Score?: string; team2Score?: string; result?: string };
      if (p.team1Score || p.team2Score) return p;
    } catch { /* plain text score — handled in fallback */ }
    return null;
  })();

  const isLive = match.status === "live";
  const isFinished = match.status === "finished";

  // Live scores: always fresh on page load (staleTime: 0)
  // Finished scores: DB-first, call CricAPI once if not saved (staleTime: Infinity)
  // Live scorecard: current batsmen + bowler
  const { data: scorecardData } = useQuery<{
    found: boolean;
    matchStatus?: string;
    currentInnings?: string;
    batsmen?: Array<{ name: string; runs: number; balls: number; fours: number; sixes: number; sr: string }>;
    bowler?: { name: string; overs: string; runs: number; wickets: number; economy: string } | null;
    inningsSummary?: Array<{ inning: string; runs: number; wickets: number; overs: number }>;
  }>({
    queryKey: ["/api/scorecard", match.id, match.status],
    queryFn: () =>
      fetch(`${BASE}/api/scorecard?matchId=${match.id}`, { credentials: "include" })
        .then(r => r.json()),
    enabled: isLive,
    staleTime: 0,
    refetchInterval: isLive ? 30_000 : false,
    refetchOnWindowFocus: isLive,
  });

  const { data: scoreData, isFetching: scoreFetching } = useQuery<{
    found: boolean;
    status?: string;
    team1Score?: string;
    team2Score?: string;
    result?: string;
  }>({
    queryKey: ["/api/scores", match.team1, match.team2, match.status],
    queryFn: () =>
      fetch(
        `${BASE}/api/scores?team1=${encodeURIComponent(match.team1)}&team2=${encodeURIComponent(match.team2)}&matchId=${match.id}&matchStatus=${match.status}`,
        { credentials: "include" }
      ).then(r => r.json()),
    // Live: always fetch. Finished: only fetch if no score at all saved yet.
    enabled: isLive || (isFinished && !match.score),
    staleTime: isLive ? 0 : Infinity,
    refetchOnWindowFocus: isLive,
    // Auto-refresh every 30s while match is live
    refetchInterval: isLive ? 30_000 : false,
  });

  const liveScores = savedJsonScore
    ?? (scoreData?.found && (scoreData.team1Score || scoreData.team2Score) ? scoreData : null);

  const totalPool = match.totalBetsTeam1 + match.totalBetsTeam2;
  const team1Pct = totalPool === 0 ? 50 : Math.round((match.totalBetsTeam1 / totalPool) * 100);
  const team2Pct = totalPool === 0 ? 50 : Math.round((match.totalBetsTeam2 / totalPool) * 100);

  const matchTimeUp = new Date() >= new Date(match.matchDate);
  const canBet = match.status === 'upcoming' && !matchTimeUp && isApproved && !userBet;
  const canEdit = !!userBet && match.status === 'upcoming' && !matchTimeUp && isApproved;

  const handleBetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!betTeam) return;
    placeBet.mutate({ data: { matchId: match.id, team: betTeam, amount: 10 } });
  };

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userBet) return;
    setSaving(true);
    try {
      const payload: { amount?: number; team?: string } = {};
      if (editTeam && editTeam !== userBet.team) payload.team = editTeam;
      if (!payload.team) {
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
          {(() => {
            const c1 = getTeamColor(match.team1);
            const team1Bets = (match.bets ?? []).filter(b => b.team === match.team1);
            return (
              <div
                className="flex flex-col items-center flex-1 gap-2 relative cursor-default"
                onMouseEnter={() => setHoveredTeam(match.team1)}
                onMouseLeave={() => setHoveredTeam(null)}
              >
                <div
                  className="relative h-16 w-16 rounded-full border-2 flex items-center justify-center text-base font-black shadow-inner transition-transform duration-200 hover:scale-110 overflow-hidden"
                  style={{ backgroundColor: c1.bg, borderColor: c1.border, color: c1.text, boxShadow: `0 0 16px ${c1.glow}` }}
                >
                  {TEAM_LOGOS[match.team1.toUpperCase()] && !logoErrors.has(match.team1) ? (
                    <img
                      src={TEAM_LOGOS[match.team1.toUpperCase()]}
                      alt={match.team1}
                      className="h-11 w-11 object-contain"
                      onError={() => setLogoErrors(prev => new Set(prev).add(match.team1))}
                    />
                  ) : (
                    <span>{match.team1.substring(0, 3).toUpperCase()}</span>
                  )}
                  {isFinished && match.winner === match.team1 && (
                    <div className="absolute -top-3 -right-3 text-2xl drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]">👑</div>
                  )}
                  {isFinished && match.winner && match.winner !== match.team1 && (
                    <div className="absolute -top-2 -right-2 text-xl opacity-50">🫏</div>
                  )}
                </div>
                <span className="font-display font-semibold text-lg text-center leading-tight" style={{ color: c1.text }}>{match.team1}</span>
                <div className="flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-md" style={{ color: c1.text, backgroundColor: `${c1.border}20` }}>
                  {team1Pct}% Odds
                </div>
                {/* Hover bettor popup */}
                {hoveredTeam === match.team1 && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-52 bg-card border border-white/10 rounded-xl shadow-2xl p-3 pointer-events-none">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Users className="h-3 w-3" style={{ color: c1.text }} />
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: c1.text }}>{match.team1} backers</span>
                    </div>
                    {team1Bets.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No bets yet</p>
                    ) : (
                      <div className="space-y-1.5">
                        {team1Bets.map((b, i) => (
                          <div key={i} className="flex items-center gap-2">
                            {b.profileImage ? (
                              <img src={b.profileImage} className="h-5 w-5 rounded-full object-cover" alt={b.username} />
                            ) : (
                              <div className="h-5 w-5 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-white">
                                {b.username[0]?.toUpperCase()}
                              </div>
                            )}
                            <span className="text-xs text-white flex-1 truncate">{b.username}</span>
                            <span className="text-xs font-bold" style={{ color: c1.text }}>{formatCurrency(b.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="flex flex-col items-center justify-center px-4">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">VS</span>
          </div>

          {/* Team 2 */}
          {(() => {
            const c2 = getTeamColor(match.team2);
            const team2Bets = (match.bets ?? []).filter(b => b.team === match.team2);
            return (
              <div
                className="flex flex-col items-center flex-1 gap-2 relative cursor-default"
                onMouseEnter={() => setHoveredTeam(match.team2)}
                onMouseLeave={() => setHoveredTeam(null)}
              >
                <div
                  className="relative h-16 w-16 rounded-full border-2 flex items-center justify-center text-base font-black shadow-inner transition-transform duration-200 hover:scale-110 overflow-hidden"
                  style={{ backgroundColor: c2.bg, borderColor: c2.border, color: c2.text, boxShadow: `0 0 16px ${c2.glow}` }}
                >
                  {TEAM_LOGOS[match.team2.toUpperCase()] && !logoErrors.has(match.team2) ? (
                    <img
                      src={TEAM_LOGOS[match.team2.toUpperCase()]}
                      alt={match.team2}
                      className="h-11 w-11 object-contain"
                      onError={() => setLogoErrors(prev => new Set(prev).add(match.team2))}
                    />
                  ) : (
                    <span>{match.team2.substring(0, 3).toUpperCase()}</span>
                  )}
                  {isFinished && match.winner === match.team2 && (
                    <div className="absolute -top-3 -right-3 text-2xl drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]">👑</div>
                  )}
                  {isFinished && match.winner && match.winner !== match.team2 && (
                    <div className="absolute -top-2 -right-2 text-xl opacity-50">🫏</div>
                  )}
                </div>
                <span className="font-display font-semibold text-lg text-center leading-tight" style={{ color: c2.text }}>{match.team2}</span>
                <div className="flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-md" style={{ color: c2.text, backgroundColor: `${c2.border}20` }}>
                  {team2Pct}% Odds
                </div>
                {/* Hover bettor popup */}
                {hoveredTeam === match.team2 && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-52 bg-card border border-white/10 rounded-xl shadow-2xl p-3 pointer-events-none">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Users className="h-3 w-3" style={{ color: c2.text }} />
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: c2.text }}>{match.team2} backers</span>
                    </div>
                    {team2Bets.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No bets yet</p>
                    ) : (
                      <div className="space-y-1.5">
                        {team2Bets.map((b, i) => (
                          <div key={i} className="flex items-center gap-2">
                            {b.profileImage ? (
                              <img src={b.profileImage} className="h-5 w-5 rounded-full object-cover" alt={b.username} />
                            ) : (
                              <div className="h-5 w-5 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-white">
                                {b.username[0]?.toUpperCase()}
                              </div>
                            )}
                            <span className="text-xs text-white flex-1 truncate">{b.username}</span>
                            <span className="text-xs font-bold" style={{ color: c2.text }}>{formatCurrency(b.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Live / Final Scores — from proxy API */}
        {liveScores ? (
          <div className={`rounded-xl border overflow-hidden ${
            isFinished
              ? 'bg-yellow-500/8 border-yellow-500/20'
              : 'bg-red-500/8 border-red-500/20'
          }`}>
            {/* Header bar */}
            <div className={`flex items-center justify-center gap-2 px-3 py-1.5 ${
              isFinished ? 'bg-yellow-500/10' : 'bg-red-500/10'
            }`}>
              {!isFinished && (
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              )}
              <span className={`text-[10px] font-black uppercase tracking-widest ${
                isFinished ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {isFinished ? '🏆 Final Scores' : '🔴 Live Scores'}
              </span>
            </div>
            {/* Two-column score */}
            <div className="flex divide-x divide-white/10">
              <div className="flex-1 flex flex-col items-center py-2 px-3">
                <span className="text-[10px] font-bold text-muted-foreground mb-0.5">{match.team1}</span>
                <span className="font-mono font-bold text-white text-sm leading-snug">
                  {liveScores.team1Score || '—'}
                </span>
              </div>
              <div className="flex-1 flex flex-col items-center py-2 px-3">
                <span className="text-[10px] font-bold text-muted-foreground mb-0.5">{match.team2}</span>
                <span className="font-mono font-bold text-white text-sm leading-snug">
                  {liveScores.team2Score || '—'}
                </span>
              </div>
            </div>
            {/* Winner / result line if finished */}
            {isFinished && (liveScores.result || match.winner) && (
              <div className="text-center py-1.5 border-t border-yellow-500/15 text-[11px] font-bold text-yellow-300">
                {liveScores.result || `${match.winner} won!`}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Live match: show "in progress" banner while waiting for score */}
            {isLive && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/8 overflow-hidden">
                <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-red-500/10">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-red-400">🔴 Live</span>
                  {scoreFetching && (
                    <span className="text-[10px] text-red-400/60 ml-1">fetching score…</span>
                  )}
                </div>
                <p className="text-center text-xs text-muted-foreground py-2.5">
                  {scoreFetching ? "Fetching live score…" : "Score not available yet — refreshing every 30s"}
                </p>
              </div>
            )}
            {/* Fallback: stored score text */}
            {match.score && (
              <div className={`rounded-xl px-4 py-2.5 text-center border ${
                isFinished
                  ? 'bg-yellow-500/10 border-yellow-500/25'
                  : 'bg-red-500/10 border-red-500/20'
              }`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
                  isFinished ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {isFinished ? '🏆 Final Result' : '🔴 Live Score'}
                </p>
                <p className="text-sm font-mono font-semibold text-white leading-relaxed">{match.score}</p>
              </div>
            )}
            {/* Winner banner for finished matches with no score */}
            {isFinished && !match.score && match.winner && (
              <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-xl px-4 py-2.5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-400 mb-1">🏆 Match Winner</p>
                <p className="text-sm font-bold text-yellow-300">{match.winner} won!</p>
              </div>
            )}
          </>
        )}

        {/* Live Scorecard: current batsmen + bowler */}
        {isLive && scorecardData?.found && (scorecardData.batsmen?.length || scorecardData.bowler) && (
          <div className="rounded-xl border border-red-500/15 bg-red-500/5 overflow-hidden">
            {/* Innings header */}
            {scorecardData.currentInnings && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-red-500/10 border-b border-red-500/10">
                <span className="text-[10px] font-black uppercase tracking-widest text-red-400">
                  🏏 {scorecardData.currentInnings}
                </span>
              </div>
            )}

            <div className="p-2 space-y-2">
              {/* Batting */}
              {scorecardData.batsmen && scorecardData.batsmen.length > 0 && (
                <div>
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-2 px-1 mb-1">
                    <span className="text-[9px] font-bold uppercase text-muted-foreground">Batter</span>
                    <span className="text-[9px] font-bold uppercase text-muted-foreground text-right">R</span>
                    <span className="text-[9px] font-bold uppercase text-muted-foreground text-right">B</span>
                    <span className="text-[9px] font-bold uppercase text-muted-foreground text-right">4s</span>
                    <span className="text-[9px] font-bold uppercase text-muted-foreground text-right">6s</span>
                    <span className="text-[9px] font-bold uppercase text-muted-foreground text-right">SR</span>
                  </div>
                  {scorecardData.batsmen.map((b, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-2 px-1 py-0.5 rounded bg-white/[0.03]">
                      <span className="text-[11px] font-semibold text-white truncate">{b.name}</span>
                      <span className="text-[11px] font-bold text-white text-right">{b.runs}</span>
                      <span className="text-[11px] text-muted-foreground text-right">{b.balls}</span>
                      <span className="text-[11px] text-blue-400 text-right">{b.fours}</span>
                      <span className="text-[11px] text-purple-400 text-right">{b.sixes}</span>
                      <span className="text-[11px] text-yellow-400 text-right">{b.sr}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Divider */}
              {scorecardData.batsmen?.length > 0 && scorecardData.bowler && (
                <div className="h-px bg-white/5" />
              )}

              {/* Bowling */}
              {scorecardData.bowler && (
                <div>
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 px-1 mb-1">
                    <span className="text-[9px] font-bold uppercase text-muted-foreground">Bowler</span>
                    <span className="text-[9px] font-bold uppercase text-muted-foreground text-right">O</span>
                    <span className="text-[9px] font-bold uppercase text-muted-foreground text-right">R</span>
                    <span className="text-[9px] font-bold uppercase text-muted-foreground text-right">W</span>
                    <span className="text-[9px] font-bold uppercase text-muted-foreground text-right">Eco</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 px-1 py-0.5 rounded bg-white/[0.03]">
                    <span className="text-[11px] font-semibold text-white truncate">{scorecardData.bowler.name}</span>
                    <span className="text-[11px] text-muted-foreground text-right">{scorecardData.bowler.overs}</span>
                    <span className="text-[11px] text-white text-right">{scorecardData.bowler.runs}</span>
                    <span className="text-[11px] font-bold text-red-400 text-right">{scorecardData.bowler.wickets}</span>
                    <span className="text-[11px] text-yellow-400 text-right">{scorecardData.bowler.economy}</span>
                  </div>
                </div>
              )}
            </div>
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
                  <label className="text-sm font-medium text-muted-foreground block">Bet Amount (USD) <span className="text-primary font-bold">— fixed $10</span></label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">$</span>
                    <input
                      type="number"
                      min="10"
                      max="10"
                      step="1"
                      required
                      readOnly
                      value={10}
                      onChange={() => {}}
                      className="w-full pl-8 pr-4 py-3 rounded-xl bg-background border-2 border-white/10 text-white font-display text-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all opacity-70 cursor-not-allowed"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!betTeam || placeBet.isPending}
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
              <label className="block text-sm font-medium text-muted-foreground mb-1">Wager Amount <span className="text-primary font-bold">— fixed $10</span></label>
              <input
                type="number"
                min="10"
                max="10"
                step="1"
                readOnly
                value={10}
                onChange={() => {}}
                className="w-full px-4 py-2 rounded-lg bg-background border border-white/10 text-white opacity-70 cursor-not-allowed"
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
