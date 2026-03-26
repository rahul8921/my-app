import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  return fetch(`${BASE}/api/leaderboard`, { credentials: "include" }).then(
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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const val = payload[0].value as number;
    return (
      <div className="bg-card border border-white/10 rounded-xl px-4 py-3 shadow-2xl">
        <p className="text-white font-bold text-sm mb-1">{label}</p>
        <p
          className={`text-sm font-semibold ${val >= 0 ? "text-green-400" : "text-red-400"}`}
        >
          {val >= 0 ? "+" : ""}
          {formatCurrency(val)}
        </p>
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

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center text-muted-foreground animate-pulse">
        Loading leaderboard…
      </div>
    );
  }

  const topUser = entries[0];
  const bottomUser = entries[entries.length - 1];
  const chartData = entries.map((e) => ({
    name: e.username,
    balance: parseFloat(e.netBalance.toFixed(2)),
  }));

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
                    <div className="w-10 flex-shrink-0 text-center">
                      {isTop ? (
                        <span className="text-2xl" title="Top player">👑</span>
                      ) : isBottom ? (
                        <span className="text-2xl" title="Lowest player">💀</span>
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

                    {/* Net balance — always visible */}
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

          {/* Bar chart */}
          <div className="bg-card border border-white/5 rounded-2xl p-6">
            <h2 className="font-display font-bold text-lg text-white mb-6">
              Net Balance Chart
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 10, bottom: 30 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    v === 0 ? "0" : `${v > 0 ? "+" : ""}${v}`
                  }
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
                <Bar dataKey="balance" radius={[6, 6, 0, 0]} maxBarSize={60}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.balance > 0
                          ? "#22c55e"
                          : entry.balance < 0
                          ? "#ef4444"
                          : "#6b7280"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
