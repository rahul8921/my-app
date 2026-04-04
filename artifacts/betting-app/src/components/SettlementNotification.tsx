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
  } catch { /* silent */ }
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

  useEffect(() => {
    if (!visible || wonBets.length === 0 || confettiFired.current) return;
    confettiFired.current = true;
    const fire = (particleRatio: number, opts: confetti.Options) =>
      confetti({ origin: { y: 0.6 }, ...opts, particleCount: Math.floor(200 * particleRatio) });
    fire(0.25, { spread: 26, startVelocity: 55, colors: ["#FFD700", "#FFA500"] });
    fire(0.2,  { spread: 60, colors: ["#ffffff", "#FFD700"] });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8, colors: ["#FFD700", "#ff6b6b"] });
    fire(0.1,  { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2, colors: ["#FFD700"] });
    fire(0.1,  { spread: 120, startVelocity: 45, colors: ["#ffffff", "#FFD700"] });
  }, [visible, wonBets]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible]);

  function dismiss() {
    const allIds = [...wonBets, ...lostBets].map(b => b.id);
    if (user?.id) markNotified(user.id, allIds);
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
    /*
     * The outer div IS the backdrop — clicking it dismisses the modal.
     * The inner card calls e.stopPropagation() so taps inside don't bubble up.
     * This avoids all iOS Safari z-index / onClick-on-div bugs entirely.
     */
    <div
      onClick={dismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        backgroundColor: "rgba(0,0,0,0.78)",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* Modal card — stopPropagation keeps taps inside from closing */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "28rem",
          borderRadius: "1rem",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 25px 50px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        {/* X close button — full button element, iOS fires events on buttons reliably */}
        <button
          onClick={dismiss}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "0.75rem",
            right: "0.75rem",
            zIndex: 10,
            padding: "0.625rem",
            borderRadius: "9999px",
            background: "rgba(0,0,0,0.5)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            touchAction: "manipulation",
          }}
        >
          <X style={{ width: "1.25rem", height: "1.25rem", color: "white" }} />
        </button>

        {/* Won section */}
        {wonBets.length > 0 && (
          <div style={{ background: "linear-gradient(135deg, #4a3000 0%, #3d2800 50%, #4a3500 100%)", padding: "2rem 1.5rem 1.5rem", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>🏆</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 900, color: "#fde68a", marginBottom: "0.25rem" }}>You Won!</h2>
            <p style={{ color: "rgba(253,230,138,0.75)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
              {wonBets.length === 1
                ? `Your bet on ${wonBets[0].team} paid off!`
                : `${wonBets.length} bets settled in your favour!`}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.25rem" }}>
              {wonBets.map(bet => (
                <div key={bet.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.2)", borderRadius: "0.75rem", padding: "0.625rem 1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Trophy style={{ width: "1rem", height: "1rem", color: "#fbbf24" }} />
                    <span style={{ fontWeight: 700, color: "white", fontSize: "0.875rem" }}>{bet.team}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: "0.75rem", color: "rgba(253,230,138,0.6)", margin: 0 }}>Payout</p>
                    <p style={{ fontWeight: 900, color: "#fde68a", fontSize: "1rem", margin: 0 }}>{formatCurrency(bet.payout ?? 0)}</p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: "0.75rem", padding: "0.75rem 1rem" }}>
              <p style={{ fontSize: "0.75rem", color: "rgba(253,230,138,0.6)", margin: "0 0 0.25rem" }}>Net Profit</p>
              <p style={{ fontSize: "1.875rem", fontWeight: 900, color: "#fde68a", margin: 0 }}>+{formatCurrency(netProfit)}</p>
            </div>
          </div>
        )}

        {/* Lost section */}
        {lostBets.length > 0 && (
          <div style={{ padding: "1.25rem 1.5rem", textAlign: "center", background: wonBets.length > 0 ? "#111827" : "linear-gradient(135deg, #111827 0%, #1f0a0a 100%)", borderTop: wonBets.length > 0 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
            {wonBets.length === 0 && <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>😔</div>}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <Frown style={{ width: "1rem", height: "1rem", color: wonBets.length > 0 ? "#f87171" : "#fca5a5" }} />
              <h3 style={{ fontWeight: 700, color: wonBets.length > 0 ? "#f87171" : "#fca5a5", fontSize: wonBets.length > 0 ? "0.875rem" : "1.125rem", margin: 0 }}>
                {wonBets.length > 0 ? "Also lost:" : "Better luck next time"}
              </h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {lostBets.map(bet => (
                <div key={bet.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: "0.75rem", padding: "0.5rem 1rem" }}>
                  <span style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.65)" }}>{bet.team}</span>
                  <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#f87171" }}>-{formatCurrency(bet.amount)}</span>
                </div>
              ))}
            </div>
            {wonBets.length === 0 && (
              <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.3)", marginTop: "1rem", marginBottom: 0 }}>The next match could be yours 💪</p>
            )}
          </div>
        )}

        {/* Got it button */}
        <div style={{ background: "#111827", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "1rem 1.5rem" }}>
          <button
            onClick={dismiss}
            style={{
              width: "100%",
              padding: "0.875rem",
              borderRadius: "0.75rem",
              fontWeight: 700,
              fontSize: "1rem",
              background: "rgba(255,255,255,0.12)",
              color: "white",
              border: "none",
              cursor: "pointer",
              touchAction: "manipulation",
            }}
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
