"use client";

import { useEffect, useMemo, useState } from "react";

type Color = "r" | "b";
type MatchState = {
  status: "waiting" | "active" | "finished" | "idle";
  matchId?: string;
  color?: Color;
  opponent?: string | null;
  fen?: string;
  turn?: Color;
  turnDeadline?: number;
  winner?: Color | null;
  reason?: "checkmate" | "timeout" | "resign" | "draw" | null;
  serverNow?: number;
};

type Ranking = {
  name: string;
  wins: number;
  losses: number;
  draws: number;
  games: number;
  score: number;
};

const files = ["a","b","c","d","e","f","g","h","i"];
const pieces: Record<string,string> = {
  k:"將", a:"士", b:"象", n:"馬", r:"車", c:"炮", p:"卒",
  K:"帥", A:"仕", B:"相", N:"馬", R:"俥", C:"炮", P:"兵"
};

function getSessionId() {
  const key = "wme-game-session";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}

export default function Home() {
  const [name, setName] = useState("遊民");
  const [sessionId, setSessionId] = useState("");
  const [state, setState] = useState<MatchState>({ status:"idle" });
  const [selected, setSelected] = useState("");
  const [remaining, setRemaining] = useState(30);
  const [offset, setOffset] = useState(0);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [message, setMessage] = useState("正在連線至公園棋園…");

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== "https://www.wongmingempire.com") return;
      if (event.data?.type !== "WME_MEMBER") return;
      setName(String(event.data.username || "").trim() || "遊民");
    }
    window.addEventListener("message", receive);
    window.parent?.postMessage({ type:"WME_GAME_READY" }, "https://www.wongmingempire.com");
    return () => window.removeEventListener("message", receive);
  }, []);

  function finishText(value: MatchState) {
    if (value.reason === "draw") return "本局和棋";
    if (!value.winner) return "本局結束";
    if (value.winner === value.color) {
      if (value.reason === "timeout") return "對手超時，你獲勝";
      if (value.reason === "resign") return "對手認輸，你獲勝";
      return "將死！你獲勝";
    }
    if (value.reason === "timeout") return "你超時，對手獲勝";
    if (value.reason === "resign") return "你認輸，對手獲勝";
    return "你被將死";
  }

  function sync(value: MatchState) {
    setState(value);
    if (value.serverNow) setOffset(value.serverNow - Date.now());
    if (value.status === "waiting") setMessage("正在公園裡尋找對手…");
    else if (value.status === "active") {
      setMessage(value.color === value.turn ? "輪到你落子" : "等待 " + (value.opponent || "對手") + " 落子");
    } else if (value.status === "finished") {
      setMessage(finishText(value));
    } else {
      setMessage("準備進入棋園…");
    }
  }

  async function readJson(response: Response) {
    const text = await response.text();
    if (!text.trim()) throw new Error("伺服器目前沒有回傳資料");
    try { return JSON.parse(text); }
    catch { throw new Error("伺服器回傳格式錯誤"); }
  }

  async function api(body: Record<string,unknown>) {
    const response = await fetch("/api/matches", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body),
      cache:"no-store"
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data.error || "服務暫時忙碌");
    return data as MatchState;
  }

  async function join() {
    if (!sessionId) return;
    try { sync(await api({action:"join", sessionId, name})); }
    catch (error) { setMessage(error instanceof Error ? error.message : "無法連線至雲端棋園"); }
  }

  useEffect(() => {
    if (!sessionId) return;
    const timer = window.setTimeout(join, 700);
    return () => window.clearTimeout(timer);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/matches?sessionId=" + encodeURIComponent(sessionId), {cache:"no-store"});
        if (response.ok) sync(await readJson(response));
      } catch {}
    }, 900);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (state.status === "active" && state.turnDeadline && state.turn === state.color) {
        setRemaining(Math.max(0, Math.ceil((state.turnDeadline - (Date.now() + offset)) / 1000)));
      } else if (state.status !== "active") {
        setRemaining(30);
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [state.status, state.turn, state.color, state.turnDeadline, offset]);

  useEffect(() => {
    async function loadRanking() {
      try {
        const response = await fetch("/api/rankings", {cache:"no-store"});
        if (response.ok) setRankings(await readJson(response));
      } catch {}
    }
    loadRanking();
    const timer = window.setInterval(loadRanking, 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function move(from:string, to:string) {
    if (state.status !== "active" || !state.matchId || state.color !== state.turn) return;
    setSelected("");
    try {
      sync(await api({action:"move", matchId:state.matchId, sessionId, from, to}));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "此步無效");
    }
  }

  async function resign() {
    if (!state.matchId) return;
    try { sync(await api({action:"resign", matchId:state.matchId, sessionId})); } catch {}
  }

  async function again() {
    setSelected("");
    setMessage("再次尋找對手…");
    try { sync(await api({action:"join", sessionId, name})); } catch {}
  }

  useEffect(() => {
    function leave() {
      if (!sessionId) return;
      navigator.sendBeacon("/api/matches", new Blob([
        JSON.stringify({action:"leave", sessionId})
      ], {type:"application/json"}));
    }
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [sessionId]);

  const board = useMemo(() => {
    if (!state.fen) return [] as string[][];
    return state.fen.split(" ")[0].split("/").map(row => {
      const cells:string[] = [];
      for (const char of row) {
        if (/[1-9]/.test(char)) {
          for (let i=0; i<Number(char); i++) cells.push("");
        } else cells.push(char);
      }
      return cells;
    });
  }, [state.fen]);

  const cells = useMemo(() => {
    const rows = state.color === "b" ? [9,8,7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7,8,9];
    const cols = state.color === "b" ? [8,7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7,8];
    return rows.flatMap(ri => cols.map(ci => ({ri, ci, sq:files[ci] + String(9-ri)})));
  }, [state.color]);

  function clickSquare(square:string) {
    if (state.status !== "active" || state.color !== state.turn) return;
    const index = Number(square.slice(1));
    const column = files.indexOf(square[0]);
    const row = 9 - index;
    const piece = board[row]?.[column];
    if (selected) {
      if (selected === square) setSelected("");
      else move(selected, square);
      return;
    }
    const mine = piece && (
      (state.color === "r" && piece === piece.toUpperCase()) ||
      (state.color === "b" && piece === piece.toLowerCase())
    );
    if (mine) setSelected(square);
  }

  return (
    <main className="park">
      <header>
        <div>
          <div className="eyebrow">WONGMING EMPIRE</div>
          <h1>公園象棋</h1>
          <p>黃名帝國線上棋園</p>
        </div>
        <div className="member"><span>論壇會員</span><strong>{name}</strong></div>
      </header>

      <section className="layout">
        <div className="game-card">
          <div className="game-top">
            <div><span className="dot red"/>紅方：{state.color === "r" ? name : (state.opponent || "等待")}</div>
            <div className={remaining <= 5 && state.status === "active" && state.turn === state.color ? "timer danger" : "timer"}>
              {state.status === "waiting" ? "配對中" : state.status === "active" ? "思考 " + remaining + "s" : "本局結束"}
            </div>
            <div><span className="dot black"/>黑方：{state.color === "b" ? name : (state.opponent || "等待")}</div>
          </div>

          {state.status === "waiting" ? (
            <div className="waiting"><div className="bench">象</div><h2>公園棋桌正在等候對手</h2><p>{message}</p></div>
          ) : state.fen ? (
            <div className="xiangqi-board">
              {cells.map(({ri,ci,sq}) => {
                const piece = board[ri]?.[ci];
                const classes = ["x-square"];
                if ((ri + ci) % 2 === 1) classes.push("dark");
                if (ri === 4 || ri === 5) classes.push("river");
                if (selected === sq) classes.push("selected");
                return (
                  <button key={sq} className={classes.join(" ")} onClick={() => clickSquare(sq)}>
                    {piece && <span className={piece === piece.toUpperCase() ? "red-piece" : "black-piece"}>{pieces[piece]}</span>}
                    {ci === 0 && <small>{9-ri}</small>}
                    {ri === 9 && <i>{files[ci]}</i>}
                    {ri === 4 && ci === 4 && <em>楚河</em>}
                    {ri === 5 && ci === 4 && <em>漢界</em>}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="waiting"><div className="bench">象</div><h2>{message}</h2></div>
          )}

          <div className="status">{message}</div>
          {state.status === "active" && <button className="resign" onClick={resign}>認輸並結束本局</button>}
          {state.status === "finished" && (
            <div className="result"><strong>{finishText(state)}</strong><button onClick={again}>再找一位對手</button></div>
          )}
          <p className="rules">真正中國象棋 9×10 棋盤。每回合思考時間固定 30 秒，超時由伺服器判定；暱稱只能來自黃名帝國論壇會員，未取得名稱時顯示「遊民」。</p>
        </div>

        <aside>
          <div className="side-card">
            <h2>公園排行榜</h2>
            <p className="muted">雲端記憶・永久累積</p>
            <div className="rank-head"><span>名次／棋手</span><span>積分</span></div>
            {rankings.length === 0 ? <div className="empty">尚無完整對局紀錄</div> : rankings.slice(0,10).map((rank,index) => (
              <div className="rank-row" key={rank.name}>
                <b>{index + 1}</b><span>{rank.name}<small>{rank.games} 局・{rank.wins} 勝</small></span><strong>{rank.score}</strong>
              </div>
            ))}
          </div>
          <div className="side-card note">
            <h2>棋園規則</h2>
            <p>兩名玩家各自在自己的瀏覽器開啟遊戲即可配對，棋步、回合與倒數由雲端保存。</p>
            <p>勝 3 分、和 1 分、敗 0 分，排行榜長期記憶。</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
