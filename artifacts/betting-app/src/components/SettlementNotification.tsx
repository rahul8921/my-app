import { useEffect, useRef, useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useQuery } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { Trophy, X, Frown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Bet {
  id: number;
  matchId: number;
  team: string;
  amount: number;
  status: "pending" | "won" | "lost";
  payout?: number | null;
  match?: { team1: string; team2: string };
}

function getNotifiedKey(userId: string) {
  return `betzone_notified_${userId}`;
}

// Try localStorage first, fall back to sessionStorage (for Safari Private mode)
function getStorage(): Storage | null {
  try {
    localStorage.setItem("__test__", "1");
    localStorage.removeItem("__test__");
    return localStorage;
  } catch {
    try { return sessionStorage; } catch { return null; }
  }
}

function getNotifiedIds(userId: string): Set<number> {
  try {
    const store = getStorage();
    if (!store) return new Set();
    const raw = store.getItem(getNotifiedKey(userId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function markNotified(userId: string, ids: number[]) {
  try {
    const store = getStorage();
    if (!store) return;
    const existing = getNotifiedIds(userId);
    ids.forEach(id => existing.add(id));
    store.setItem(getNotifiedKey(userId), JSON.stringify([...existing]));
  } catch {
    // storage write failed — silent, notification just may show again next session
  }
}

export function SettlementNotification() {
  const { isAuthenticated, user } = useAuth();
  const [wonBets, setWonBets] = useState<Bet[]>([]);
  const [lostBets, setLostBets] = useState<Bet[]>([]);
  const [visible, setVisible] = useState(false);
  const confettiFired = useRef(false);

  const { data: bets } = useQuery<Bet[]>({
    queryKey: ["/api/bets", "settlement-check"],
    queryFn: () =>
      fetch(`${BASE}/api/bets`, { credentials: "include" }).then(r => r.json()),
    enabled: isAuthenticated,
    staleTime: 0,
  });

  useEffect(() => {
    if (!bets || !user?.id) return;

    const notifiedIds = getNotifiedIds(user.id);
    const newWon = bets.filter(b => b.status === "won" && !notifiedIds.has(b.id));
    const newLost = bets.filter(b => b.status === "lost" && !notifiedIds.has(b.id));

    if (newWon.length === 0 && newLost.length === 0) return;

    setWonBets(newWon);
    setLostBets(newLost);
    setVisible(true);
  }, [bets, user?.id]);

  // Confetti on win
  useEffect(() => {
    if (!visible || wonBets.length === 0 || confettiFired.current) return;
    confettiFired.current = true;

    const fire = (particleRatio: number, opts: confetti.Options) => {
      confetti({
        origin: { y: 0.6 },
        ...opts,
        particleCount: Math.floor(200 * particleRatio),
      });
    };

    fire(0.25, { spread: 26, startVelocity: 55, colors: ["#FFD700", "#FFA500"] });
    fire(0.2,  { spread: 60, colors: ["#ffffff", "#FFD700"] });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8, colors: ["#FFD700", "#ff6b6b"] });
    fire(0.1,  { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2, colors: ["#FFD700"] });
    fire(0.1,  { spread: 120, startVelocity: 45, colors: ["#ffffff", "#FFD700"] });
  }, [visible, wonBets]);

  // Escape key to dismiss
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible]);

  function dismiss() {
    if (!user?.id) {
      // Even if user id is missing, force-close the modal
      setVisible(false);
      setWonBets([]);
      setLostBets([]);
      confettiFired.current = false;
      return;
    }
    const allIds = [...wonBets, ...lostBets].map(b => b.id);
    markNotified(user.id, allIds);
    setVisible(false);
    setWonBets([]);
    setLostBets([]);
    confettiFired.current = false;
  }

  if (!visible || !isAuthenticated) return null;

  const totalPayout = wonBets.reduce((s, b) => s + (b.payout ?? 0), 0);
  const totalStaked = wonBets.reduce((s, b) => s + b.amount, 0);
  const netProfit = totalPayout - totalStaked;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
      {/* Backdrop — sits BEHIND the modal via z-index, no backdrop-filter to avoid Safari stacking bug */}
      <div
        className="absolute inset-0 bg-black/75"
        style={{ zIndex: 0 }}
        onClick={dismiss}
      />

      {/* Modal — explicitly above backdrop */}
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        style={{ zIndex: 1 }}
      >
        {/* Close button — large tap target for mobile */}
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute top-3 right-3 p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
          style={{ zIndex: 2 }}
        >
          <X className="h-5 w-5 text-white" />
        </button>

        {/* Won section */}
        {wonBets.length > 0 && (
          <div className="bg-gradient-to-br from-yellow-900/80 via-yellow-800/60 to-amber-900/80 px-6 pt-8 pb-6 text-center">
            <div className="text-5xl mb-3">🏆</div>
            <h2 className="text-2xl font-black text-yellow-300 mb-1">You Won!</h2>
            <p className="text-yellow-200/80 text-sm mb-5">
              {wonBets.length === 1
                ? `Your bet on ${wonBets[0].team} paid off!`
                : `${wonBets.length} bets settled in your favour!`}
            </p>

            <div className="space-y-2 mb-5">
              {wonBets.map(bet => (
                <div
                  key={bet.id}
                  className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-yellow-400" />
                    <span className="font-bold text-white text-sm">{bet.team}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-yellow-300/70">Payout</p>
                    <p className="font-black text-yellow-300 text-base">{formatCurrency(bet.payout ?? 0)}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-yellow-500/15 border border-yellow-500/30 rounded-xl px-4 py-3">
              <p className="text-xs text-yellow-300/70 mb-0.5">Net Profit</p>
              <p className="text-3xl font-black text-yellow-300">+{formatCurrency(netProfit)}</p>
            </div>
          </div>
        )}

        {/* Lost section */}
        {lostBets.length > 0 && (
          <div className={`px-6 py-5 text-center ${wonBets.length > 0 ? 'bg-gray-900/95 border-t border-white/10' : 'bg-gradient-to-br from-gray-900 to-red-950/60'}`}>
            {wonBets.length === 0 && (
              <div className="text-4xl mb-3">😔</div>
            )}
            <div className="flex items-center justify-center gap-2 mb-3">
              <Frown className={`h-4 w-4 ${wonBets.length > 0 ? 'text-red-400' : 'text-red-300'}`} />
              <h3 className={`font-bold ${wonBets.length > 0 ? 'text-red-400 text-sm' : 'text-red-300 text-lg'}`}>
                {wonBets.length > 0 ? 'Also lost:' : 'Better luck next time'}
              </h3>
            </div>
            <div className="space-y-2">
              {lostBets.map(bet => (
                <div
                  key={bet.id}
                  className="flex items-center justify-between bg-red-500/8 border border-red-500/15 rounded-xl px-4 py-2"
                >
                  <span className="text-sm text-white/70">{bet.team}</span>
                  <span className="text-sm font-semibold text-red-400">-{formatCurrency(bet.amount)}</span>
                </div>
              ))}
            </div>
            {wonBets.length === 0 && (
              <p className="text-xs text-white/40 mt-4">The next match could be yours 💪</p>
            )}
          </div>
        )}

        {/* Dismiss button — full-width, easy to tap */}
        <div className="bg-gray-900 border-t border-white/5 px-6 py-4">
          <button
            onClick={dismiss}
            className="w-full py-3 rounded-xl font-bold text-base bg-white/10 hover:bg-white/20 active:bg-white/25 text-white transition-colors"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
