import { Chess, type Square } from "chess.js";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Player = { sid: string; name: string };
type Match = {
  id: string;
  white: Player;
  black: Player;
  fen: string;
  turn: "w" | "b";
  turnDeadline: number;
  status: "active" | "finished";
  winner: "w" | "b" | null;
  reason: "checkmate" | "timeout" | "resign" | "draw" | null;
  lastMove: { from: string; to: string; san: string } | null;
  createdAt: number;
  finishedAt?: number;
};

const QUEUE_KEY = "wme-game:match-queue";
const QUEUE_LOCK = "wme-game:queue-lock";
const RANKING_KEY = "wme-game:rankings";
const MATCH_TTL = 60 * 60;
const QUEUE_TTL = 10 * 60;
const TURN_MS = 30_000;

function redis() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  return Redis.fromEnv();
}

async function acquireLock(r: Redis, key: string, ttl = 5) {
  for (let i = 0; i < 8; i++) {
    const ok = await r.set(key, "1", { nx: true, ex: ttl });
    if (ok === "OK") return true;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  return false;
}

async function releaseLock(r: Redis, key: string) {
  try { await r.del(key); } catch {}
}

async function recordResult(r: Redis, winnerName: string | null, loserName: string | null, drawNames: string[]) {
  const lock = "wme-game:ranking-lock";
  const locked = await acquireLock(r, lock);
  if (!locked) return;

  try {
    const data = (await r.get<Array<{name:string;wins:number;losses:number;draws:number;games:number;score:number}>>(RANKING_KEY)) || [];
    const map = new Map(data.map(x => [x.name, x]));
    const ensure = (raw: string) => {
      const name = raw.trim() || "遊民";
      if (!map.has(name)) map.set(name, { name, wins:0, losses:0, draws:0, games:0, score:0 });
      return map.get(name)!;
    };

    if (winnerName && loserName) {
      const w = ensure(winnerName);
      const l = ensure(loserName);
      w.wins++; w.games++; w.score += 3;
      l.losses++; l.games++;
    } else {
      for (const raw of drawNames) {
        const d = ensure(raw);
        d.draws++; d.games++; d.score++;
      }
    }

    const sorted = [...map.values()].sort((a,b) => b.score-a.score || b.wins-a.wins || a.name.localeCompare(b.name));
    await r.set(RANKING_KEY, sorted);
  } finally {
    await releaseLock(r, lock);
  }
}

async function timeoutIfNeeded(r: Redis, match: Match) {
  if (match.status !== "active" || Date.now() < match.turnDeadline) return match;
  const winner = match.turn === "w" ? "b" : "w";
  const winnerName = winner === "w" ? match.white.name : match.black.name;
  const loserName = winner === "w" ? match.black.name : match.white.name;
  const finished: Match = {
    ...match,
    status: "finished",
    winner,
    reason: "timeout",
    finishedAt: Date.now()
  };
  await r.set("wme-game:match:" + match.id, finished, { ex: MATCH_TTL });
  await recordResult(r, winnerName, loserName, []);
  return finished;
}

function publicState(match: Match, sid: string) {
  const color = match.white.sid === sid ? "w" : match.black.sid === sid ? "b" : null;
  const opponent = color === "w" ? match.black.name : color === "b" ? match.white.name : null;
  return {
    matchId: match.id,
    color,
    opponent,
    fen: match.fen,
    turn: match.turn,
    turnDeadline: match.turnDeadline,
    status: match.status,
    winner: match.winner,
    reason: match.reason,
    lastMove: match.lastMove,
    serverNow: Date.now()
  };
}

function isPlayer(match: Match, sid: string) {
  return match.white.sid === sid || match.black.sid === sid;
}

export async function POST(req: Request) {
  const r = redis();
  if (!r) return NextResponse.json({ error: "Cloud memory is not configured." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const sid = String(body.sessionId || "");
  const name = String(body.name || "遊民").trim() || "遊民";

  if (!sid || sid.length < 12) return NextResponse.json({ error: "Invalid session." }, { status: 400 });

  if (action === "join") {
    const locked = await acquireLock(r, QUEUE_LOCK);
    if (!locked) return NextResponse.json({ error: "Matchmaking busy, please retry." }, { status: 503 });

    try {
      const playerKey = "wme-game:player:" + sid;
      const currentId = await r.get<string>(playerKey);

      if (currentId && currentId !== "QUEUE") {
        const current = await r.get<Match>("wme-game:match:" + currentId);
        if (current && current.status === "active" && isPlayer(current, sid)) {
          return NextResponse.json(publicState(current, sid));
        }
        await r.del(playerKey);
      }

      const rawQueue = (await r.lrange<string>(QUEUE_KEY, 0, 50)) || [];
      const now = Date.now();
      const candidates: Array<{sid:string;name:string;createdAt:number}> = [];

      for (const raw of rawQueue) {
        try {
          const p = JSON.parse(String(raw));
          if (p?.sid && now - Number(p.createdAt) < QUEUE_TTL * 1000) {
            candidates.push(p);
          } else {
            await r.lrem(QUEUE_KEY, 0, raw);
          }
        } catch {
          await r.lrem(QUEUE_KEY, 0, raw);
        }
      }

      for (const p of candidates.filter(x => x.sid === sid)) {
        await r.lrem(QUEUE_KEY, 0, JSON.stringify(p));
      }
      await r.del(playerKey);

      const opponent = candidates.find(p => p.sid !== sid);
      if (!opponent) {
        await r.lpush(QUEUE_KEY, JSON.stringify({ sid, name, createdAt: now }));
        await r.set(playerKey, "QUEUE", { ex: QUEUE_TTL });
        return NextResponse.json({ status: "waiting", serverNow: now });
      }

      await r.lrem(QUEUE_KEY, 0, JSON.stringify(opponent));
      const id = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const match: Match = {
        id,
        white: { sid: opponent.sid, name: opponent.name || "遊民" },
        black: { sid, name },
        fen: new Chess().fen(),
        turn: "w",
        turnDeadline: now + TURN_MS,
        status: "active",
        winner: null,
        reason: null,
        lastMove: null,
        createdAt: now
      };

      await r.set("wme-game:match:" + id, match, { ex: MATCH_TTL });
      await r.set("wme-game:player:" + opponent.sid, id, { ex: MATCH_TTL });
      await r.set(playerKey, id, { ex: MATCH_TTL });
      return NextResponse.json(publicState(match, sid));
    } finally {
      await releaseLock(r, QUEUE_LOCK);
    }
  }

  if (action === "move" || action === "resign") {
    const matchId = String(body.matchId || "");
    const lockKey = "wme-game:match-lock:" + matchId;
    const locked = await acquireLock(r, lockKey);
    if (!locked) return NextResponse.json({ error: "Game is busy, retry." }, { status: 409 });

    try {
      let match = await r.get<Match>("wme-game:match:" + matchId);
      if (!match || !isPlayer(match, sid)) return NextResponse.json({ error: "Match not found." }, { status: 404 });

      match = await timeoutIfNeeded(r, match);
      if (match.status === "finished") return NextResponse.json(publicState(match, sid));

      const color = match.white.sid === sid ? "w" : "b";
      if (match.turn !== color) return NextResponse.json({ error: "Not your turn." }, { status: 409 });

      if (action === "resign") {
        const winner = color === "w" ? "b" : "w";
        const finished: Match = { ...match, status:"finished", winner, reason:"resign", finishedAt:Date.now() };
        await r.set("wme-game:match:" + matchId, finished, { ex:MATCH_TTL });
        const winnerName = winner === "w" ? match.white.name : match.black.name;
        const loserName = winner === "w" ? match.black.name : match.white.name;
        await recordResult(r, winnerName, loserName, []);
        return NextResponse.json(publicState(finished, sid));
      }

      const next = new Chess(match.fen);
      const from = String(body.from || "") as Square;
      const to = String(body.to || "") as Square;
      const promotion = String(body.promotion || "q") as "q"|"r"|"b"|"n";
      const moved = next.move({ from, to, promotion });

      const checkmate = next.isCheckmate();
      const draw = next.isDraw();
      const updated: Match = {
        ...match,
        fen: next.fen(),
        turn: next.turn(),
        turnDeadline: Date.now() + TURN_MS,
        lastMove: { from, to, san:moved.san }
      };

      if (checkmate || draw) {
        updated.status = "finished";
        updated.winner = checkmate ? color : null;
        updated.reason = checkmate ? "checkmate" : "draw";
        updated.finishedAt = Date.now();
        if (checkmate) {
          const winnerName = color === "w" ? match.white.name : match.black.name;
          const loserName = color === "w" ? match.black.name : match.white.name;
          await recordResult(r, winnerName, loserName, []);
        } else {
          await recordResult(r, null, null, [match.white.name, match.black.name]);
        }
      }

      await r.set("wme-game:match:" + matchId, updated, { ex:MATCH_TTL });
      return NextResponse.json(publicState(updated, sid));
    } catch {
      return NextResponse.json({ error:"Invalid chess move." }, { status:400 });
    } finally {
      await releaseLock(r, lockKey);
    }
  }

  if (action === "leave") {
    const playerKey = "wme-game:player:" + sid;
    const currentId = await r.get<string>(playerKey);
    if (currentId === "QUEUE") {
      const queue = (await r.lrange<string>(QUEUE_KEY, 0, 100)) || [];
      for (const raw of queue) {
        try {
          const p = JSON.parse(String(raw));
          if (p?.sid === sid) await r.lrem(QUEUE_KEY, 0, raw);
        } catch {}
      }
      await r.del(playerKey);
    }
    return NextResponse.json({ ok:true });
  }

  return NextResponse.json({ error:"Unknown action." }, { status:400 });
}

export async function GET(req: Request) {
  const r = redis();
  if (!r) return NextResponse.json({ error:"Cloud memory is not configured." }, { status:503 });

  const url = new URL(req.url);
  const sid = url.searchParams.get("sessionId") || "";
  if (!sid) return NextResponse.json({ error:"Missing session." }, { status:400 });

  const playerKey = "wme-game:player:" + sid;
  const currentId = await r.get<string>(playerKey);

  if (!currentId) return NextResponse.json({ status:"idle" });
  if (currentId === "QUEUE") return NextResponse.json({ status:"waiting", serverNow:Date.now() });

  const lockKey = "wme-game:match-lock:" + currentId;
  const locked = await acquireLock(r, lockKey, 3);
  try {
    let match = await r.get<Match>("wme-game:match:" + currentId);
    if (!match || !isPlayer(match, sid)) {
      await r.del(playerKey);
      return NextResponse.json({ status:"idle" });
    }
    if (locked) match = await timeoutIfNeeded(r, match);
    return NextResponse.json(publicState(match, sid));
  } finally {
    if (locked) await releaseLock(r, lockKey);
  }
}
