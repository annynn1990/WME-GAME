"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess, Square } from "chess.js";

type MatchState = {
  status: "waiting" | "active" | "finished" | "idle";
  matchId?: string;
  color?: "w" | "b";
  opponent?: string | null;
  fen?: string;
  turn?: "w" | "b";
  turnDeadline?: number;
  winner?: "w" | "b" | null;
  reason?: "checkmate" | "timeout" | "resign" | "draw" | null;
  lastMove?: { from: string; to: string; san: string } | null;
  serverNow?: number;
};

type Ranking = { name: string; wins: number; losses: number; draws: number; games: number; score: number };

const files = ["a","b","c","d","e","f","g","h"];
const pieces: Record<string,string> = { p:"♟",r:"♜",n:"♞",b:"♝",q:"♛",k:"♚",P:"♙",R:"♖",N:"♘",B:"♗",Q:"♕",K:"♔" };

function getSessionId() {
  const key = "wme-game-session";
  let sid = localStorage.getItem(key);
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem(key, sid);
  }
  return sid;
}

export default function Home() {
  const [name, setName] = useState("遊民");
  const [sessionId, setSessionId] = useState("");
  const [state, setState] = useState<MatchState>({status:"idle"});
  const [selected, setSelected] = useState<Square | null>(null);
  const [remaining, setRemaining] = useState(30);
  const [offset, setOffset] = useState(0);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [message, setMessage] = useState("正在連線至公園棋園…");

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== "https://www.wongmingempire.com") return;
      if (event.data?.type !== "WME_MEMBER") return;
      const incoming = String(event.data.username || "").trim();
      setName(incoming || "遊民");
    };
    window.addEventListener("message", handler);
    try { window.parent?.postMessage({ type:"WME_GAME_READY" }, "https://www.wongmingempire.com"); } catch {}
    return () => window.removeEventListener("message", handler);
  }, []);

  function sync(data: MatchState) {
    setState(data);
    setMessage(
      data.status === "waiting" ? "正在公園裡尋找對手…" :
      data.status === "active" ? (data.color === data.turn ? "輪到你落子" : \`等待 \${data.opponent || "對手"} 落子\`) :
      data.status === "finished" ? finishText(data) : "準備進入棋園…"
    );
    if (data.serverNow) setOffset(data.serverNow - Date.now());
  }

  async function join() {
    if (!sessionId) return;
    try {
      const r = await fetch("/api/matches", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"join",sessionId,name}), cache:"no-store"
      });
      const data = await r.json();
      if (!r.ok) { setMessage(data.error || "配對服務暫時忙碌"); return; }
      sync(data);
    } catch { setMessage("無法連線至雲端棋園"); }
  }

  useEffect(() => {
    if (!sessionId) return;
    const timer = window.setTimeout(join, 700);
    return () => window.clearTimeout(timer);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const poll = window.setInterval(async () => {
      try {
        const r = await fetch("/api/matches?sessionId=" + encodeURIComponent(sessionId), {cache:"no-store"});
        if (r.ok) sync(await r.json());
      } catch {}
    }, 900);
    return () => window.clearInterval(poll);
  }, [sessionId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (state.status !== "active" || !state.turnDeadline || !state.serverNow) return;
      if (state.turn === state.color) {
        setRemaining(Math.max(0, Math.ceil((state.turnDeadline - (Date.now()+offset))/1000)));
      } else setRemaining(30);
    }, 200);
    return () => window.clearInterval(timer);
  }, [state.status,state.turn,state.color,state.turnDeadline,state.serverNow,offset]);

  useEffect(() => {
    fetch("/api/rankings",{cache:"no-store"}).then(r=>r.ok?r.json():[]).then(setRankings).catch(()=>{});
    const timer=window.setInterval(()=>fetch("/api/rankings",{cache:"no-store"}).then(r=>r.ok?r.json():[]).then(setRankings).catch(()=>{}),5000);
    return()=>window.clearInterval(timer);
  },[]);

  function finishText(data: MatchState) {
    if (data.reason === "draw") return "本局和棋";
    if (!data.winner) return "本局結束";
    if (data.winner === data.color) return data.reason === "timeout" ? "對手超時，你獲勝" : data.reason === "resign" ? "對手認輸，你獲勝" : "將死！你獲勝";
    return data.reason === "timeout" ? "你超時，對手獲勝" : data.reason === "resign" ? "你認輸，對手獲勝" : "你被將死";
  }

  async function move(from: Square,to: Square) {
    if (state.status!=="active" || !state.matchId || state.color!==state.turn) return;
    setSelected(null);
    try {
      const r=await fetch("/api/matches",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"move",matchId:state.matchId,sessionId,from,to,promotion:"q"})});
      const data=await r.json();
      if (!r.ok) setMessage(data.error||"此步無效"); else sync(data);
    } catch { setMessage("網路暫時中斷，棋局會在重新連線後同步"); }
  }

  async function resign() {
    if (state.status!=="active" || !state.matchId) return;
    const r=await fetch("/api/matches",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"resign",matchId:state.matchId,sessionId})});
    if (r.ok) sync(await r.json());
  }

  async function again() {
    setSelected(null); setMessage("再次尋找對手…");
    fetch("/api/matches",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"join",sessionId,name})}).then(r=>r.json()).then(sync).catch(()=>{});
  }

  useEffect(() => {
    const leave=()=>{ if(sessionId) navigator.sendBeacon("/api/matches",new Blob([JSON.stringify({action:"leave",sessionId})],{type:"application/json"})); };
    window.addEventListener("pagehide",leave);
    return()=>window.removeEventListener("pagehide",leave);
  },[sessionId]);

  const board=useMemo(()=>state.fen?new Chess(state.fen).board():[],[state.fen]);
  const squares=useMemo(()=>{
    const rows=state.color==="b"?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];
    const cols=state.color==="b"?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];
    return rows.flatMap(ri=>cols.map(ci=>({ri,ci,sq:(files[ci]+(8-ri)) as Square})));
  },[state.color]);

  function clickSquare(square:Square) {
    if(state.status!=="active"||state.color!==state.turn||!state.fen)return;
    const current=new Chess(state.fen);
    const piece=current.get(square);
    if(selected){if(selected===square)return setSelected(null);move(selected,square);return;}
    if(piece&&piece.color===state.color)setSelected(square);
  }

  return <main className="park">
    <header><div><div className="eyebrow">WONGMING EMPIRE</div><h1>公園象棋</h1><p>黃名帝國線上棋園</p></div><div className="member"><span>論壇會員</span><strong>{name}</strong></div></header>
    <section className="layout"><div className="game-card">
      <div className="game-top"><div><span className="dot red"/>紅方：{state.color==="w"?name:(state.opponent||"等待")}</div>
      <div className={remaining<=5&&state.status==="active"&&state.turn===state.color?"timer danger":"timer"}>{state.status==="waiting"?"配對中":state.status==="active"?\`思考 \${remaining}s\`:"本局結束"}</div>
      <div><span className="dot black"/>黑方：{state.color==="b"?name:(state.opponent||"等待")}</div></div>
      {state.status==="waiting"?<div className="waiting"><div className="bench">♟</div><h2>公園棋桌正在等候對手</h2><p>{message}</p><div className="waiting-line"><span/>尋找另一位黃名帝國會員<span/></div></div>
      :state.fen?<div className="board">{squares.map(({ri,ci,sq})=>{const piece=board[ri]?.[ci];const dark=(ri+ci)%2===1;return <button key={sq} className={\`square \${dark?"dark":""} \${selected===sq?"selected":""}\`} onClick={()=>clickSquare(sq)}>{piece&&<span className={piece.color==="w"?"white-piece":"black-piece"}>{pieces[piece.color==="w"?piece.type.toUpperCase():piece.type]}</span>}{state.color!=="b"&&ci===0&&<small>{8-ri}</small>}{state.color!=="b"&&ri===7&&<i>{files[ci]}</i>}</button>})}</div>
      :<div className="waiting"><div className="bench">♜</div><h2>{message}</h2></div>}
      <div className="status">{message}</div>
      {state.status==="active"&&state.matchId&&<button className="resign" onClick={resign}>認輸並結束本局</button>}
      {state.status==="finished"&&<div className="result"><strong>{finishText(state)}</strong><button onClick={again}>再找一位對手</button></div>}
      <p className="rules">線上對局由雲端棋局狀態同步。每回合思考時間固定 30 秒，超時由伺服器判定；遊戲內沒有暱稱輸入欄位，名稱來自黃名帝國論壇會員資訊，未取得名稱時顯示「遊民」。</p>
    </div>
    <aside><div className="side-card"><h2>公園排行榜</h2><p className="muted">雲端記憶・永久累積</p><div className="rank-head"><span>名次／棋手</span><span>積分</span></div>
      {rankings.length===0?<div className="empty">尚無完整對局紀錄</div>:rankings.slice(0,10).map((r,i)=><div className="rank-row" key={r.name}><b>{i+1}</b><span>{r.name}<small>{r.games} 局・{r.wins} 勝</small></span><strong>{r.score}</strong></div>)}
    </div><div className="side-card note"><h2>棋園規則</h2><p>登入黃名帝國論壇後進入遊戲，系統自動帶入會員帳號。沒有會員名稱時顯示「遊民」。</p><p>兩名玩家各自在自己的瀏覽器開啟遊戲即可配對；棋步、回合與倒數由雲端保存並同步。</p></div></aside></section>
  </main>;
}
