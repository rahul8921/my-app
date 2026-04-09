import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";

interface LeaderboardEntry {
  id: string;
  username: string;
  profileImage?: string;
  totalBetAmount: number;
  totalWon: number;
  netBalance: number;
  totalBets: number;
}

interface JourneyData {
  matchKeys: string[];
  matchLabels: string[];
  users: { username: string; points: number[] }[];
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  return fetch(`${BASE}/api/leaderboard`, { credentials: "include" }).then(
    (r) => r.json()
  );
}

function fetchJourney(): Promise<JourneyData> {
  return fetch(`${BASE}/api/leaderboard/journey`, { credentials: "include" }).then(
    (r) => r.json()
  );
}

function Avatar({ entry }: { entry: LeaderboardEntry }) {
  if (entry.profileImage) {
    return (
      <img
        src={entry.profileImage}
        alt={entry.username}
        className="h-10 w-10 rounded-full object-cover ring-2 ring-white/10 flex-shrink-0"
      />
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
        @keyframes runner-bob {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-2px); }
        }
        @keyframes runner-legL {
          0%, 100% { transform: rotate(-32deg); }
          50%      { transform: rotate(28deg);  }
        }
        @keyframes runner-legR {
          0%, 100% { transform: rotate(28deg);  }
          50%      { transform: rotate(-32deg); }
        }
        @keyframes runner-armL {
          0%, 100% { transform: rotate(28deg);  }
          50%      { transform: rotate(-22deg); }
        }
        @keyframes runner-armR {
          0%, 100% { transform: rotate(-22deg); }
          50%      { transform: rotate(28deg);  }
        }
      `}</style>
      <svg
        width="30" height="40"
        viewBox="0 0 30 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ animation: "runner-bob 0.38s ease-in-out infinite" }}
      >
        {/* Head */}
        <circle cx="15" cy="5" r="4.5" fill="#94a3b8" />
        {/* Torso */}
        <line x1="15" y1="10" x2="15" y2="23"
          stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
        {/* Left arm – pivots from shoulder (15,13) */}
        <g style={{ animation: "runner-armL 0.38s ease-in-out infinite", transformOrigin: "15px 13px" }}>
          <line x1="15" y1="13" x2="7" y2="20"
            stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
        </g>
        {/* Right arm */}
        <g style={{ animation: "runner-armR 0.38s ease-in-out infinite", transformOrigin: "15px 13px" }}>
          <line x1="15" y1="13" x2="23" y2="20"
            stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
        </g>
        {/* Left leg – pivots from hip (15,23) */}
        <g style={{ animation: "runner-legL 0.38s ease-in-out infinite", transformOrigin: "15px 23px" }}>
          <line x1="15" y1="23" x2="9" y2="37"
            stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
        </g>
        {/* Right leg */}
        <g style={{ animation: "runner-legR 0.38s ease-in-out infinite", transformOrigin: "15px 23px" }}>
          <line x1="15" y1="23" x2="21" y2="37"
            stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    </>
  );
}

const LINE_COLORS = [
  "#f59e0b", "#22c55e", "#3b82f6", "#a855f7",
  "#ef4444", "#06b6d4", "#ec4899", "#84cc16",
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
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

export default function Leaderboard() {
  const { user } = useAuth();

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

  const topUser = entries[0];
  const bottomUser = entries[entries.length - 1];

  // Build chart data: [{ match: "M1", alice: -10, bob: 5 }, ...]
  const chartData = (journey?.matchKeys ?? []).map((key, idx) => {
    const point: Record<string, any> = { match: key, label: journey!.matchLabels[idx] };
    journey!.users.forEach((u) => { point[u.username] = u.points[idx] ?? 0; });
    return point;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
      <div>
        <h1 className="text-4xl font-display font-black text-white">
          Leaderboard
        </h1>
        <p className="text-muted-foreground mt-2">
          Ranked by net profit/loss across all settled bets.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="bg-card border border-white/5 rounded-2xl p-16 text-center text-muted-foreground">
          No approved users yet.
        </div>
      ) : (
        <>
          {/* Rankings table */}
          <div className="bg-card border border-white/5 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5 bg-secondary/20">
              <h2 className="font-display font-bold text-lg text-white">
                Player Rankings
              </h2>
            </div>
            <div className="divide-y divide-white/5">
              {entries.map((entry, index) => {
                const isTop = topUser && entry.id === topUser.id && entries.length > 1;
                const isBottom =
                  bottomUser &&
                  entry.id === bottomUser.id &&
                  entries.length > 1;
                const isSecond = index === 1 && entries.length > 2;
                const isMe = entry.id === user?.id;
                const positive = entry.netBalance >= 0;

                return (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-4 px-6 py-4 transition-colors ${
                      isMe ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-white/[0.02]"
                    }`}
                  >
                    {/* Rank */}
                    <div className="w-14 flex-shrink-0 flex items-center justify-center">
                      {isTop ? (
                        <span className="text-2xl" title="Top player">👑</span>
                      ) : isSecond ? (
                        <div title="Runner-up">
                          <RunnerIcon />
                        </div>
                      ) : isBottom ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 whitespace-nowrap">
                          LOSER
                        </span>
                      ) : (
                        <span className="text-lg font-bold text-muted-foreground">
                          #{index + 1}
                        </span>
                      )}
                    </div>

                    {/* Avatar */}
                    <Avatar entry={entry} />

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">
                        {entry.username}
                        {isMe && (
                          <span className="ml-2 text-xs text-primary font-normal">
                            (you)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.totalBets} bet{entry.totalBets !== 1 ? "s" : ""}
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="hidden sm:flex items-center gap-8 text-right">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Total Bet
                        </p>
                        <p className="text-sm font-medium text-white">
                          {formatCurrency(entry.totalBetAmount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Total Won
                        </p>
                        <p className="text-sm font-medium text-green-400">
                          {formatCurrency(entry.totalWon)}
                        </p>
                      </div>
                    </div>

                    {/* Net balance */}
                    <div className="text-right w-28 flex-shrink-0">
                      <p className="text-xs text-muted-foreground mb-1">
                        Net Balance
                      </p>
                      <p
                        className={`text-base font-bold ${positive ? "text-green-400" : "text-red-400"}`}
                      >
                        {positive ? "+" : ""}
                        {formatCurrency(entry.netBalance)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cumulative Journey chart */}
          <div className="bg-card border border-white/5 rounded-2xl p-6">
            <h2 className="font-display font-bold text-lg text-white mb-1">
              Cumulative Journey
            </h2>
            <p className="text-xs text-muted-foreground mb-6">
              Running balance after each match — from Match 1 onwards.
            </p>
            {chartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                No finished matches yet — chart will appear once results are set.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="match"
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="4 4" />
                  <Legend
                    wrapperStyle={{ paddingTop: 16, fontSize: 12, color: "#9ca3af" }}
                  />
                  {(journey?.users ?? []).map((u, i) => (
                    <Line
                      key={u.username}
                      type="monotone"
                      dataKey={u.username}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: LINE_COLORS[i % LINE_COLORS.length] }}
                      activeDot={{ r: 6 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}
