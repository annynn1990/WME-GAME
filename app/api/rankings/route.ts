import Redis from "ioredis";
import { NextResponse } from "next/server";

const key = "wme-game:rankings";
type Ranking = { name: string; wins: number; losses: number; draws: number; games: number; score: number };

export async function GET() {
  if (!process.env.REDIS_URL) return NextResponse.json([]);
  const redis = new Redis(process.env.REDIS_URL);
  try {
    const raw = await redis.get(key);
    const data: Ranking[] = raw ? JSON.parse(String(raw)) : [];
    data.sort((a, b) => b.score - a.score || b.wins - a.wins || a.name.localeCompare(b.name));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([], { status: 200 });
  } finally {
    await redis.quit();
  }
}
