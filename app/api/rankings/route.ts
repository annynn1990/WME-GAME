import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const key = "wme-game:rankings";

export async function GET() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return NextResponse.json([]);
  const redis = Redis.fromEnv();
  const data = (await redis.get<Array<{name:string;wins:number;losses:number;draws:number;games:number;score:number}>>(key)) || [];
  data.sort((a,b)=>b.score-a.score || b.wins-a.wins || a.name.localeCompare(b.name));
  return NextResponse.json(data);
}
