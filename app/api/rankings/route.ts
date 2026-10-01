import Redis from "ioredis";
import { NextResponse } from "next/server";

const key = "wme-game:rankings";

export async function GET() {
  if (!process.env.REDIS_URL) return NextResponse.json([]);
  const redis = new Redis(process.env.REDIS_URL!);
  const data = (await redis.get<Array<{name:string;wins:number;losses:number;draws:number;games:number;score:number}>>(key)) || [];
  data.sort((a,b)=>b.score-a.score || b.wins-a.wins || a.name.localeCompare(b.name));
  return NextResponse.json(data);
}
