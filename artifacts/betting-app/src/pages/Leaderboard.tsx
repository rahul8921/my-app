import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
  BarChart, Bar, Cell,
} from "recharts";

interface LeaderboardEntry {
  id: string;
  username: string;
  profileImage?: string;
  totalBetAmount: number;
  totalWon: number;
  netBalance: number;
  totalBets: number;
  wins: number;
  losses: number;
  bestPayout: number;
  biggestBet: number;
  biggestLoss: number;
  underdogPlayed: number;
  underdogWins: number;
  underdogLosses: number;
}

interface JourneyData {
  matchKeys: string[];
  matchLabels: string[];
  users: { username: string; points: number[] }[];
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  return fetch(`${BASE}/api/leaderboard`, { credentials: "include" }).then((r) => r.json());
}

function fetchJourney(): Promise<JourneyData> {
  return fetch(`${BASE}/api/leaderboard/journey`, { credentials: "include" }).then((r) => r.json());
}

function Avatar({ entry }: { entry: LeaderboardEntry }) {
  if (entry.profileImage) {
    return (
      <img src={entry.profileImage} alt={entry.username}
        className="h-10 w-10 rounded-full object-cover ring-2 ring-white/10 flex-shrink-0" />
    );
  }
  return (
    <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center font-bold text-white text-sm ring-2 ring-white/10 flex-shrink-0">
      {entry.username[0]?.toUpperCase() || "?"}
    </div>
  );
}

function RunnerIcon() {
  return (
    <>
      <style>{`
        @keyframes rn-bounce { 0%,100%{transform:translateY(0px) rotate(-2deg)} 50%{transform:translateY(-4px) rotate(2deg)} }
        @keyframes rn-legF   { 0%,100%{transform:rotate(-40deg)} 50%{transform:rotate(35deg)} }
        @keyframes rn-legB   { 0%,100%{transform:rotate(35deg)}  50%{transform:rotate(-40deg)} }
        @keyframes rn-armF   { 0%,100%{transform:rotate(35deg)}  50%{transform:rotate(-30deg)} }
        @keyframes rn-armB   { 0%,100%{transform:rotate(-30deg)} 50%{transform:rotate(35deg)} }
        @keyframes rn-shine  { 0%,100%{opacity:0.6} 50%{opacity:1} }
        @keyframes crown-spin { 0%{transform:rotate(-15deg) scale(1)} 25%{transform:rotate(15deg) scale(1.15)} 50%{transform:rotate(-10deg) scale(1.1)} 75%{transform:rotate(12deg) scale(1.15)} 100%{transform:rotate(-15deg) scale(1)} }
      `}</style>
      <svg width="38" height="44" viewBox="0 0 38 44" fill="none"
        style={{ animation: "rn-bounce 0.42s ease-in-out infinite" }}>
        {/* Medal ribbon */}
        <rect x="15" y="0" width="8" height="5" rx="1.5"
          fill="url(#rb)" />
        {/* Medal circle */}
        <circle cx="19" cy="10" r="8" fill="url(#mg)" stroke="#cbd5e1" strokeWidth="1.2" />
        <circle cx="19" cy="10" r="5.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
        {/* 2 */}
        <text x="19" y="14" textAnchor="middle" fontSize="8" fontWeight="900"
          fill="white" fontFamily="system-ui,sans-serif"
          style={{ animation: "rn-shine 0.42s ease-in-out infinite" }}>2</text>

        {/* Body */}
        <g transform="translate(19,22)">
          {/* Torso */}
          <ellipse cx="0" cy="3" rx="3" ry="5" fill="#94a3b8" />
          {/* Head */}
          <circle cx="1" cy="-3" r="3.5" fill="#cbd5e1" />
          {/* Back arm */}
          <g style={{ animation: "rn-armB 0.42s ease-in-out infinite", transformOrigin: "0px 0px" }}>
            <line x1="0" y1="0" x2="-6" y2="5" stroke="#64748b" strokeWidth="2.2" strokeLinecap="round" />
          </g>
          {/* Front arm */}
          <g style={{ animation: "rn-armF 0.42s ease-in-out infinite", transformOrigin: "0px 0px" }}>
            <line x1="0" y1="0" x2="7" y2="4" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" />
          </g>
          {/* Back leg */}
          <g style={{ animation: "rn-legB 0.42s ease-in-out infinite", transformOrigin: "0px 6px" }}>
            <line x1="0" y1="6" x2="-5" y2="18" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="-5" y1="18" x2="-9" y2="21" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
          </g>
          {/* Front leg */}
          <g style={{ animation: "rn-legF 0.42s ease-in-out infinite", transformOrigin: "0px 6px" }}>
            <line x1="0" y1="6" x2="5" y2="18" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="5" y1="18" x2="9" y2="21" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
          </g>
          {/* Speed lines */}
          <line x1="-8" y1="2" x2="-14" y2="2" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          <line x1="-7" y1="6" x2="-12" y2="6" stroke="#475569" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
        </g>

        <defs>
          <linearGradient id="mg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="50%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>
          <linearGradient id="rb" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>
        </defs>
      </svg>
    </>
  );
}

const LINE_COLORS = ["#f59e0b","#22c55e","#3b82f6","#a855f7","#ef4444","#06b6d4","#ec4899","#84cc16"];

function PoopIcon({ count }: { count: 1 | 2 }) {
  return (
    <>
      <style>{`
        @keyframes poop-wobble {
          0%,100% { transform: rotate(-12deg) scale(1); }
          25%      { transform: rotate(10deg)  scale(1.15); }
          50%      { transform: rotate(-8deg)  scale(0.95); }
          75%      { transform: rotate(12deg)  scale(1.1); }
        }
        @keyframes poop-wobble2 {
          0%,100% { transform: rotate(10deg)  scale(1.05); }
          25%      { transform: rotate(-12deg) scale(0.95); }
          50%      { transform: rotate(8deg)   scale(1.12); }
          75%      { transform: rotate(-10deg) scale(1); }
        }
        @keyframes poop-bounce {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-4px); }
        }
        @keyframes poop-stink {
          0%,100% { opacity:0; transform: translateY(0px) scale(0.8); }
          50%      { opacity:0.7; transform: translateY(-6px) scale(1.1); }
        }
      `}</style>
      <div className={`flex ${count === 2 ? "gap-0.5" : ""} items-end relative`}
        style={{ animation: "poop-bounce 1.2s ease-in-out infinite" }}>
        {/* stink lines */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none">
          {["〜","〜"].map((s, i) => (
            <span key={i} className="text-[8px] text-green-400/60 font-bold"
              style={{ animation: `poop-stink ${0.9 + i * 0.3}s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }}>
              {s}
            </span>
          ))}
        </div>
        <span className="text-xl leading-none select-none"
          style={{ animation: "poop-wobble 0.9s ease-in-out infinite" }}
          title="Way down in the hole 💩">
          💩
        </span>
        {count === 2 && (
          <span className="text-xl leading-none select-none"
            style={{ animation: "poop-wobble2 0.9s ease-in-out infinite", animationDelay: "0.15s" }}
            title="Catastrophically bad 💩💩">
            💩
          </span>
        )}
      </div>
    </>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-white/10 rounded-xl px-4 py-3 shadow-2xl min-w-[160px]">
        <p className="text-white font-bold text-sm mb-2">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} className="text-xs flex items-center justify-between gap-4">
            <span style={{ color: p.color }}>{p.dataKey}</span>
            <span className={`font-semibold ${p.value >= 0 ? "text-green-400" : "text-red-400"}`}>
              {p.value >= 0 ? "+" : ""}{formatCurrency(p.value)}
            </span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ─── Rankings Tab ─────────────────────────────────────────────────────────────

function RankingsTab({ entries, journey, user }: {
  entries: LeaderboardEntry[];
  journey: JourneyData | undefined;
  user: any;
}) {
  const topUser = entries[0];
  const bottomUser = entries[entries.length - 1];

  const chartData = (journey?.matchKeys ?? []).map((key, idx) => {
    const point: Record<string, any> = { match: key, label: journey!.matchLabels[idx] };
    journey!.users.forEach((u) => { point[u.username] = u.points[idx] ?? 0; });
    return point;
  });

  return (
    <div className="space-y-8">
      {/* Rankings table */}
      <div className="bg-card border border-white/5 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5 bg-secondary/20">
          <h2 className="font-display font-bold text-lg text-white">Player Rankings</h2>
        </div>
        <div className="divide-y divide-white/5">
          {entries.map((entry, index) => {
            const isTop = topUser && entry.id === topUser.id && entries.length > 1;
            const isBottom = bottomUser && entry.id === bottomUser.id && entries.length > 1;
            const isSecond = index === 1 && entries.length > 2;
            const isMe = entry.id === user?.id;
            const positive = entry.netBalance >= 0;
            // poop tiers: -50 to -99 = 1 poop, -100+ = 2 poops, else LOSER badge
            const poopCount = isBottom
              ? entry.netBalance <= -100 ? 2 : entry.netBalance <= -50 ? 1 : 0
              : 0;

            return (
              <div key={entry.id}
                className={`flex items-center gap-4 px-6 py-4 transition-colors ${isMe ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-white/[0.02]"}`}>
                {/* Rank */}
                <div className="w-14 flex-shrink-0 flex items-center justify-center">
                  {isTop ? (
                    <span className="text-2xl" title="Top player" style={{ display: 'inline-block', animation: 'crown-spin 2s ease-in-out infinite' }}>
                      {/* Crown tiers: 0-49=1, 50-74=2, 75-99=3, 100-124=4, etc. */}
                      {'👑'.repeat(entry.netBalance < 50 ? 1 : 2 + Math.floor((entry.netBalance - 50) / 25))}
                    </span>
                  ) : isSecond ? (
                    <div title="Runner-up"><RunnerIcon /></div>
                  ) : poopCount > 0 ? (
                    <PoopIcon count={poopCount as 1 | 2} />
                  ) : isBottom ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 whitespace-nowrap">
                      LOSER
                    </span>
                  ) : (
                    <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                  )}
                </div>

                <Avatar entry={entry} />

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate">
                    {entry.username}
                    {isMe && <span className="ml-2 text-xs text-primary font-normal">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.totalBets} bet{entry.totalBets !== 1 ? "s" : ""}
                  </p>
                </div>

                <div className="hidden sm:flex items-center gap-8 text-right">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Bet</p>
                    <p className="text-sm font-medium text-white">{formatCurrency(entry.totalBetAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Won</p>
                    <p className="text-sm font-medium text-green-400">{formatCurrency(entry.totalWon)}</p>
                  </div>
                </div>

                <div className="text-right w-28 flex-shrink-0">
                  <p className="text-xs text-muted-foreground mb-1">Net Balance</p>
                  <p className={`text-base font-bold ${positive ? "text-green-400" : "text-red-400"}`}>
                    {positive ? "+" : ""}{formatCurrency(entry.netBalance)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cumulative Journey chart */}
      <div className="bg-card border border-white/5 rounded-2xl p-6">
        <h2 className="font-display font-bold text-lg text-white mb-1">Cumulative Journey</h2>
        <p className="text-xs text-muted-foreground mb-6">Running balance after each match.</p>
        {chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            No finished matches yet — chart will appear once results are set.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="match" tick={{ fill: "#9ca3af", fontSize: 12 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="4 4" />
              <Legend wrapperStyle={{ paddingTop: 16, fontSize: 12, color: "#9ca3af" }} />
              {(journey?.users ?? []).map((u, i) => (
                <Line key={u.username} type="monotone" dataKey={u.username}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2.5}
                  dot={{ r: 4, fill: LINE_COLORS[i % LINE_COLORS.length] }} activeDot={{ r: 6 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────

function StatsTab({ entries, isAdmin }: { entries: LeaderboardEntry[]; isAdmin: boolean }) {
  const barData = entries.map((e, i) => {
    const w = e.wins ?? 0;
    const l = e.losses ?? 0;
    return {
      name: e.username,
      Wins: w,
      Losses: l,
      Pending: Math.max(0, e.totalBets - w - l),
      color: LINE_COLORS[i % LINE_COLORS.length],
    };
  });

  const totalBets = entries.reduce((s, e) => s + e.totalBets, 0);
  const totalWins = entries.reduce((s, e) => s + (e.wins ?? 0), 0);
  const totalLosses = entries.reduce((s, e) => s + (e.losses ?? 0), 0);
  const totalPending = totalBets - totalWins - totalLosses;

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Bets", value: totalBets, color: "text-white" },
          { label: "Total Wins", value: totalWins, color: "text-green-400" },
          { label: "Total Losses", value: totalLosses, color: "text-red-400" },
          { label: "Pending", value: totalPending, color: "text-yellow-400" },
        ].map(card => (
          <div key={card.label} className="bg-card border border-white/5 rounded-2xl p-5 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{card.label}</p>
            <p className={`text-3xl font-black ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Per-player table */}
      <div className="bg-card border border-white/5 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5 bg-secondary/20">
          <h2 className="font-display font-bold text-lg text-white">Per-Player Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-3 font-medium">Player</th>
                <th className="text-center px-4 py-3 font-medium">Total Bets</th>
                <th className="text-center px-4 py-3 font-medium text-green-400">Wins</th>
                <th className="text-center px-4 py-3 font-medium text-red-400">Losses</th>
                <th className="text-center px-4 py-3 font-medium text-yellow-400">Pending</th>
                <th className="text-center px-4 py-3 font-medium">Win Rate</th>
                {isAdmin && (
                  <>
                    <th className="text-center px-4 py-3 font-medium text-purple-400">
                      <div>High Risk</div>
                      <div className="text-[10px] normal-case tracking-normal font-normal text-muted-foreground">Bet minority side</div>
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-green-300">
                      <div>Risk Wins</div>
                      <div className="text-[10px] normal-case tracking-normal font-normal text-muted-foreground">Won those bets</div>
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-red-300">
                      <div>Risk Losses</div>
                      <div className="text-[10px] normal-case tracking-normal font-normal text-muted-foreground">Lost those bets</div>
                    </th>
                  </>
                )}
                <th className="text-right px-6 py-3 font-medium">Net Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entries.map((entry, i) => {
                const wins = entry.wins ?? 0;
                const losses = entry.losses ?? 0;
                const pending = Math.max(0, entry.totalBets - wins - losses);
                const settled = wins + losses;
                const winRate = settled > 0 ? Math.round((wins / settled) * 100) : null;
                const positive = entry.netBalance >= 0;
                return (
                  <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }} />
                        <Avatar entry={entry} />
                        <span className="font-semibold text-white">{entry.username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center font-bold text-white">{entry.totalBets}</td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center gap-1 font-bold text-green-400">
                        ✓ {wins}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center gap-1 font-bold text-red-400">
                        ✗ {losses}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="font-medium text-yellow-400">{pending}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {winRate !== null ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className={`font-bold text-sm ${winRate >= 50 ? "text-green-400" : "text-red-400"}`}>
                            {winRate}%
                          </span>
                          <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className={`h-full rounded-full ${winRate >= 50 ? "bg-green-400" : "bg-red-400"}`}
                              style={{ width: `${winRate}%` }} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    {isAdmin && (
                      <>
                        <td className="px-4 py-4 text-center">
                          <span className="font-bold text-purple-400">{entry.underdogPlayed}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="font-bold text-green-300">{entry.underdogWins}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="font-bold text-red-300">{entry.underdogLosses}</span>
                        </td>
                      </>
                    )}
                    <td className="px-6 py-4 text-right">
                      <span className={`font-bold text-base ${positive ? "text-green-400" : "text-red-400"}`}>
                        {positive ? "+" : ""}{formatCurrency(entry.netBalance)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Wins vs Losses bar chart */}
      <div className="bg-card border border-white/5 rounded-2xl p-6">
        <h2 className="font-display font-bold text-lg text-white mb-1">Wins vs Losses</h2>
        <p className="text-xs text-muted-foreground mb-6">Settled bets only.</p>
        {barData.every(d => d.Wins === 0 && d.Losses === 0) ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            No settled bets yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
                labelStyle={{ color: "white", fontWeight: 700, marginBottom: 4 }}
                itemStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="Wins" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Losses" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Leaderboard() {
  const { user } = useAuth();
  const isAdmin = (user as any)?.isAdmin === true;
  const [tab, setTab] = useState<"rankings" | "stats">("rankings");

  const { data: entries = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboard"],
    queryFn: fetchLeaderboard,
    refetchInterval: 30000,
  });

  const { data: journey } = useQuery<JourneyData>({
    queryKey: ["/api/leaderboard/journey"],
    queryFn: fetchJourney,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center text-muted-foreground animate-pulse">
        Loading leaderboard…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-4xl font-display font-black text-white">Leaderboard</h1>
        <p className="text-muted-foreground mt-2">Ranked by net profit/loss across all settled bets.</p>
      </div>

      {entries.length === 0 ? (
        <div className="bg-card border border-white/5 rounded-2xl p-16 text-center text-muted-foreground">
          No approved users yet.
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 bg-secondary/30 rounded-xl p-1 w-fit">
            <button onClick={() => setTab("rankings")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === "rankings" ? "bg-primary text-white shadow" : "text-muted-foreground hover:text-white"}`}>
              🏆 Rankings
            </button>
            <button onClick={() => setTab("stats")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === "stats" ? "bg-primary text-white shadow" : "text-muted-foreground hover:text-white"}`}>
              📊 Stats Summary
            </button>
          </div>

          {tab === "rankings"
            ? <RankingsTab entries={entries} journey={journey} user={user} />
            : <StatsTab entries={entries} isAdmin={isAdmin} />
          }
        </>
      )}
    </div>
  );
}
