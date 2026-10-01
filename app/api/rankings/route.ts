import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

type Ranking = { name:string; wins:number; losses:number; draws:number; games:number; score:number };
const key = "wme-game:rankings";

function db() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  return Redis.fromEnv();
}

export async function GET() {
  const redis = db();
  if (!redis) return NextResponse.json([]);
  const data = (await redis.get<Ranking[]>(key)) || [];
  return NextResponse.json(data.sort((a,b)=>b.score-a.score || b.wins-a.wins));
}

export async function POST(req: Request) {
  const redis = db();
  if (!redis) return NextResponse.json({ok:false, error:"Cloud memory is not configured"}, {status:503});
  const body = await req.json();
  const data = (await redis.get<Ranking[]>(key)) || [];
  const map = new Map(data.map(x=>[x.name,x]));
  const ensure = (name:string) => {
    const n = name?.trim() || "遊民";
    if (!map.has(n)) map.set(n,{name:n,wins:0,losses:0,draws:0,games:0,score:0});
    return map.get(n)!;
  };
  if (body.draw) {
    const p=ensure(body.draw); p.draws++; p.games++; p.score+=1;
  } else if (body.winner && body.loser) {
    const w=ensure(body.winner), l=ensure(body.loser);
    w.wins++; w.games++; w.score+=3;
    l.losses++; l.games++;
  } else return NextResponse.json({ok:false}, {status:400});
  const out=[...map.values()].sort((a,b)=>b.score-a.score || b.wins-a.wins);
  await redis.set(key,out);
  return NextResponse.json({ok:true});
}
