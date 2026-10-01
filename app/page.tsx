"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess, Square } from "chess.js";

type Ranking = { name: string; wins: number; losses: number; draws: number; games: number; score: number };

const files = ["a","b","c","d","e","f","g","h"];
const pieces: Record<string,string> = {
  p:"♟", r:"♜", n:"♞", b:"♝", q:"♛", k:"♚",
  P:"♙", R:"♖", N:"♘", B:"♗", Q:"♕", K:"♔"
};

export default function Home() {
  const [name, setName] = useState("遊民");
  const [game, setGame] = useState(() => new Chess());
  const [selected, setSelected] = useState<Square | null>(null);
  const [turnTime, setTurnTime] = useState(30);
  const [status, setStatus] = useState("等待紅方落子");
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [result, setResult] = useState<string | null>(null);

  const board = useMemo(() => game.board(), [game]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== "https://www.wongmingempire.com") return;
      const incoming = event.data?.type === "WME_MEMBER"
        ? event.data.username
        : null;
      if (typeof incoming === "string" && incoming.trim()) setName(incoming.trim());
    };
    window.addEventListener("message", handler);
    window.parent?.postMessage({ type: "WME_GAME_READY" }, "https://www.wongmingempire.com");
    return () => window.removeEventListener("message", handler);
  }, []);

  async function loadRankings() {
    try {
      const r = await fetch("/api/rankings", { cache: "no-store" });
      if (r.ok) setRankings(await r.json());
    } catch {}
  }

  useEffect(() => { loadRankings(); }, []);

  useEffect(() => {
    if (result || game.isGameOver()) return;
    const timer = setInterval(() => {
      setTurnTime(t => {
        if (t <= 1) {
          const loser = game.turn() === "w" ? "紅方" : "黑方";
          finish(game.turn() === "w" ? "黑方" : "紅方", "timeout");
          return 30;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [game, result]);

  function finish(winner: "紅方"|"黑方", reason: string) {
    if (result) return;
    const text = reason === "timeout" ? winner + "因對手超時獲勝" : winner + "獲勝";
    setResult(text);
    setStatus(text);
    const winnerName = winner === "紅方" ? name : "對手";
    const loserName = winner === "紅方" ? "對手" : name;
    fetch("/api/rankings", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ winner: winnerName, loser: loserName })
    }).then(loadRankings).catch(()=>{});
  }

  function move(from: Square, to: Square) {
    try {
      const next = new Chess(game.fen());
      next.move({ from, to, promotion:"q" });
      setGame(next);
      setSelected(null);
      setTurnTime(30);
      if (next.isCheckmate()) {
        finish(next.turn() === "w" ? "黑方" : "紅方", "checkmate");
      } else if (next.isDraw()) {
        setResult("和棋");
        setStatus("和棋");
        fetch("/api/rankings", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ draw: name })
        }).then(loadRankings).catch(()=>{});
      } else {
        setStatus(next.turn() === "w" ? "紅方思考中" : "黑方思考中");
      }
    } catch {}
  }

  function clickSquare(square: Square) {
    if (result) return;
    const piece = game.get(square);
    if (selected) {
      if (selected === square) return setSelected(null);
      move(selected, square);
      return;
    }
    if (piece && piece.color === game.turn()) setSelected(square);
  }

  function reset() {
    setGame(new Chess());
    setSelected(null);
    setTurnTime(30);
    setStatus("等待紅方落子");
    setResult(null);
  }

  return (
    <main className="park">
      <header>
        <div>
          <div className="eyebrow">WONGMING EMPIRE</div>
          <h1>公園象棋</h1>
          <p>黃名帝國・公園棋局</p>
        </div>
        <div className="member">
          <span>棋手</span>
          <strong>{name}</strong>
        </div>
      </header>

      <section className="layout">
        <div className="game-card">
          <div className="game-top">
            <div><span className="dot red"/>紅方：{name}</div>
            <div className={turnTime <= 5 ? "timer danger" : "timer"}>思考 {turnTime}s</div>
            <div><span className="dot black"/>黑方：對手</div>
          </div>

          <div className="board" aria-label="公園象棋棋盤">
            {board.map((row, ri) => row.map((piece, ci) => {
              const sq = (files[ci] + (8-ri)) as Square;
              const dark = (ri + ci) % 2 === 1;
              const isSelected = selected === sq;
              return (
                <button key={sq} className={`square ${dark ? "dark":""} ${isSelected ? "selected":""}`} onClick={() => clickSquare(sq)}>
                  {piece && <span className={piece.color === "w" ? "white-piece" : "black-piece"}>{pieces[piece.color === "w" ? piece.type.toUpperCase() : piece.type]}</span>}
                  {ci === 0 && <small>{8-ri}</small>}
                  {ri === 7 && <i>{files[ci]}</i>}
                </button>
              );
            }))}
          </div>

          <div className="status">{status}</div>
          {result && <div className="result">{result}<button onClick={reset}>再開一局</button></div>}
          <p className="rules">每回合思考時間 30 秒。未設定暱稱的論壇會員會顯示為「遊民」。棋手名稱由黃名帝國論壇會員身分提供，遊戲內不能自行修改。</p>
        </div>

        <aside>
          <div className="side-card">
            <h2>公園排行榜</h2>
            <p className="muted">雲端記憶・永久累積</p>
            <div className="rank-head"><span>名次／棋手</span><span>積分</span></div>
            {rankings.length === 0 ? <div className="empty">尚無完整對局紀錄</div> :
              rankings.slice(0,10).map((r,i)=><div className="rank-row" key={r.name}><b>{i+1}</b><span>{r.name}<small>{r.games} 局・{r.wins} 勝</small></span><strong>{r.score}</strong></div>)}
          </div>
          <div className="side-card note">
            <h2>棋園規則</h2>
            <p>登入黃名帝國論壇後進入遊戲，系統自動帶入會員帳號。沒有會員暱稱時顯示「遊民」。</p>
            <p>排行資料保存於雲端，不因重新整理或換裝置而消失。</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
