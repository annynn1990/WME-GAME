import { list, put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ForumStat = {
  id: string; name: string; fid: number; topics: number | null; posts: number | null;
  lastPostAt: string | null; lastPostBy: string | null; change24h?: number | null;
};
type TrendKey = "surge" | "rising" | "steady" | "falling" | "quiet" | "offline";
type ForumSample = { at: number; totalPosts: number; rows: ForumStat[] };
type ForumHistory = { samples: ForumSample[] };
type JournalEntry = {
  day: number; eventTitle: string; choiceTitle: string; official: string; at: string;
  delta: { popularity?: number; trust?: number; activityBonus?: number };
};
type CountyState = {
  day: number; treasury: number; popularity: number; security: number; infrastructure: number;
  trust: number; activityBonus: number; decisions: number; journal: JournalEntry[];
  lastVerifiedStats?: ForumStat[]; actionTimes?: number[]; lastActionAt?: number;
  lastActionName?: string; lastActionArea?: string; lastDecayAt?: number;
};
type ForumTrend = {
  key: TrendKey; label: string; description: string; freshness: number;
  postsPerDay: number | null; change24h: number | null; change6h: number | null; previous6h: number | null;
};
type Verification = {
  status: "verified" | "waiting" | "wrong-user" | "offline" | "unreadable";
  message: string; verifiedThisRequest: boolean; lastActionAt: string | null;
  lastActionName: string | null; lastActionArea: string | null; totalVerifiedActions: number;
  hoursSinceLastAction: number | null;
};

const STATE_PATH = "yanxing-county/state.json";
const HISTORY_PATH = "yanxing-county/forum-history/";
const FORUM_URL = "https://www.wongmingempire.com/bbswm/";
const DAY = 24 * 60 * 60 * 1000;
const HISTORY_INTERVAL = 10 * 60 * 1000;
const HISTORY_RETENTION = 7 * DAY;
const HISTORY_SLOT_MAX = 999999999;
const BOARDS: ForumStat[] = [
  { id: "square", name: "延興廣場", fid: 53, topics: null, posts: null, lastPostAt: null, lastPostBy: null },
  { id: "garden", name: "暢揮園", fid: 56, topics: null, posts: null, lastPostAt: null, lastPostBy: null },
  { id: "hall", name: "永享堂", fid: 55, topics: null, posts: null, lastPostAt: null, lastPostBy: null },
  { id: "government", name: "延興郡政府", fid: 367, topics: null, posts: null, lastPostAt: null, lastPostBy: null }
];
const FALLBACK_FORUMS: ForumStat[] = [
  { id: "square", name: "延興廣場", fid: 53, topics: 10174, posts: 140445, lastPostAt: "2026-10-13T15:35:00+08:00", lastPostBy: null },
  { id: "garden", name: "暢揮園", fid: 56, topics: 465, posts: 3706, lastPostAt: "2026-10-13T15:32:00+08:00", lastPostBy: null },
  { id: "hall", name: "永享堂", fid: 55, topics: 225, posts: 1834, lastPostAt: "2026-10-07T21:54:00+08:00", lastPostBy: null },
  { id: "government", name: "延興郡政府", fid: 367, topics: 30, posts: 202, lastPostAt: "2026-04-13T18:51:00+08:00", lastPostBy: null }
];

function initialState(): CountyState {
  const now = Date.now();
  return {
    day: 1, treasury: 120, popularity: 60, security: 62, infrastructure: 25,
    trust: 58, activityBonus: 0, decisions: 0, journal: [], actionTimes: [], lastDecayAt: now
  };
}
function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}
function normalizedName(value: string | null | undefined) {
  return String(value || "").normalize("NFKC").replace(/[\s\u3000]+/g, "").toLocaleLowerCase();
}
function tokenReady() { return Boolean(process.env.BLOB_READ_WRITE_TOKEN); }

async function readJsonBlob<T>(path: string): Promise<T | null> {
  const result = await list({ prefix: path, limit: 10 });
  const blob = result.blobs.find((item) => item.pathname === path);
  if (!blob) return null;
  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) return null;
  return await response.json() as T;
}
async function readState(): Promise<CountyState> {
  if (!tokenReady()) throw new Error("雲端存檔尚未連線，請檢查 Vercel Blob 設定。");
  const data = await readJsonBlob<CountyState>(STATE_PATH);
  if (!data) return initialState();
  return {
    ...initialState(), ...data,
    journal: Array.isArray(data.journal) ? data.journal : [],
    actionTimes: Array.isArray(data.actionTimes) ? data.actionTimes : []
  };
}
async function saveState(state: CountyState) {
  await put(STATE_PATH, JSON.stringify(state), {
    access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json"
  });
}
function cleanText(html: string) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim();
}
function num(value: string) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
function lastPostTimestamp(text: string): string | null {
  const full = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})[ T]+(\d{1,2}):(\d{2})\b/);
  if (full) {
    const y = full[1], month = full[2].padStart(2, "0"), day = full[3].padStart(2, "0");
    const hour = full[4].padStart(2, "0"), minute = full[5];
    return y + "-" + month + "-" + day + "T" + hour + ":" + minute + ":00+08:00";
  }
  const short = text.match(/\b(\d{1,2})[-/.](\d{1,2})[ T]+(\d{1,2}):(\d{2})\b/);
  if (!short) return null;
  const month = short[1].padStart(2, "0"), day = short[2].padStart(2, "0");
  const hour = short[3].padStart(2, "0"), minute = short[4];
  const nowTaipei = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return nowTaipei.getUTCFullYear() + "-" + month + "-" + day + "T" + hour + ":" + minute + ":00+08:00";
}
function lastPoster(text: string): string | null {
  const match = text.match(/\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}\s+([^\s|]+)\s+(?=主題|主题)/);
  return match?.[1]?.trim() || null;
}
function forumAnchorPositions(html: string): Map<number, number> {
  const result = new Map<number, number>();
  for (const board of BOARDS) {
    const pattern = new RegExp(
      '<a\\b[^>]*href=["\\\'][^"\\\']*fid=' + board.fid + '(?:&|["\\\'])[^"\\\']*["\\\'][^>]*>([\\s\\S]*?)<\\/a>',
      "gi"
    );
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const label = cleanText(match[1]);
      if (label.includes(board.name)) {
        result.set(board.fid, match.index);
        break;
      }
    }
  }
  return result;
}
let forumCache: { at: number; rows: ForumStat[] } | null = null;
async function fetchForumStats(): Promise<{ rows: ForumStat[]; ok: boolean; checkedAt: string }> {
  const now = Date.now();
  if (forumCache && now - forumCache.at < 60_000) {
    return { rows: forumCache.rows, ok: true, checkedAt: new Date(forumCache.at).toISOString() };
  }
  try {
    const response = await fetch(FORUM_URL, {
      cache: "no-store",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; WongmingCountyDuty/2.0)",
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.7",
        "referer": "https://www.wongmingempire.com/bbswm/"
      },
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) throw new Error("Forum HTTP " + response.status);
    const html = await response.text();
    if (!html.includes("延興廣場") || html.length < 5000) throw new Error("論壇首頁未回傳預期版面");
    const positions = forumAnchorPositions(html);
    if (positions.size !== 4) throw new Error("無法辨認全部四個郡內版面");
    const ordered = [...positions.entries()].sort((a, b) => a[1] - b[1]);
    const rows: ForumStat[] = BOARDS.map((board) => ({ ...board }));
    let parsedCount = 0;
    for (const row of rows) {
      const start = positions.get(row.fid);
      if (start === undefined) continue;
      const index = ordered.findIndex(([fid]) => fid === row.fid);
      const end = index >= 0 && index + 1 < ordered.length ? ordered[index + 1][1] : Math.min(html.length, start + 6000);
      const segment = cleanText(html.slice(start, end));
      const topicMatch = segment.match(/(?:主題|主题)\s*[:：]?\s*([\d][\d,]*)/i);
      const postMatch = segment.match(/(?:帖數|帖数)\s*[:：]?\s*([\d][\d,]*)/i);
      if (!topicMatch || !postMatch) continue;
      row.topics = num(topicMatch[1]);
      row.posts = num(postMatch[1]);
      row.lastPostAt = lastPostTimestamp(segment);
      row.lastPostBy = lastPoster(segment);
      parsedCount++;
    }
    if (parsedCount !== 4) throw new Error("只成功解析 " + parsedCount + "/4 個郡內版面");
    forumCache = { at: now, rows };
    return { rows, ok: true, checkedAt: new Date(now).toISOString() };
  } catch {
    return { rows: (forumCache?.rows || FALLBACK_FORUMS).map((row) => ({ ...row })), ok: false, checkedAt: new Date().toISOString() };
  }
}
function totalPosts(rows: ForumStat[]) {
  return rows.reduce((sum, row) => sum + (row.posts || 0), 0);
}
function snapshotRows(rows: ForumStat[]) {
  return rows.map((row) => ({
    id: row.id, name: row.name, fid: row.fid, posts: row.posts, topics: row.topics,
    lastPostAt: row.lastPostAt, lastPostBy: row.lastPostBy
  }));
}
function historyPath(slot: number, rows: ForumStat[]) {
  const reversed = HISTORY_SLOT_MAX - slot;
  const fields = [String(reversed), String(totalPosts(rows))];
  for (const row of rows) {
    const last = row.lastPostAt ? Math.floor(new Date(row.lastPostAt).getTime() / 1000) : 0;
    fields.push(String(row.topics ?? -1), String(row.posts ?? -1), String(Number.isFinite(last) ? last : 0));
  }
  return HISTORY_PATH + fields.join("_") + ".json";
}
function parseHistoryBlob(pathname: string): ForumSample | null {
  const filename = pathname.slice(pathname.lastIndexOf("/") + 1).replace(/\.json$/, "");
  const fields = filename.split("_").map(Number);
  if (fields.length !== 14 || fields.some((value) => !Number.isFinite(value))) return null;
  const slot = HISTORY_SLOT_MAX - fields[0];
  if (slot < 0) return null;
  const rows: ForumStat[] = BOARDS.map((base, index) => {
    const offset = 2 + index * 3, topics = fields[offset], posts = fields[offset + 1], lastSeconds = fields[offset + 2];
    return { ...base, topics: topics < 0 ? null : topics, posts: posts < 0 ? null : posts,
      lastPostAt: lastSeconds > 0 ? new Date(lastSeconds * 1000).toISOString() : null, lastPostBy: null };
  });
  return { at: slot * HISTORY_INTERVAL, totalPosts: fields[1], rows };
}
async function readForumHistory(): Promise<ForumHistory> {
  try {
    const result = await list({ prefix: HISTORY_PATH, limit: 1000 });
    const samples = result.blobs.map((blob) => parseHistoryBlob(blob.pathname))
      .filter((sample): sample is ForumSample => Boolean(sample))
      .filter((sample) => Date.now() - sample.at <= HISTORY_RETENTION)
      .sort((a, b) => a.at - b.at);
    return { samples };
  } catch { return { samples: [] }; }
}
async function recordForumSample(rows: ForumStat[], history: ForumHistory): Promise<ForumHistory> {
  const now = Date.now(), slot = Math.floor(now / HISTORY_INTERVAL);
  const latest = history.samples.length ? history.samples[history.samples.length - 1] : null;
  if (latest && Math.floor(latest.at / HISTORY_INTERVAL) >= slot) return history;
  try {
    await put(historyPath(slot, rows), "{}", {
      access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json"
    });
    return {
      samples: [...history.samples, {
        at: slot * HISTORY_INTERVAL, totalPosts: totalPosts(rows), rows: snapshotRows(rows)
      }].filter((item) => now - item.at <= HISTORY_RETENTION).slice(-1000)
    };
  } catch { return history; }
}
function bestSampleBefore(history: ForumHistory, now: number, targetHours: number, toleranceHours: number) {
  const target = now - targetHours * 60 * 60_000;
  let best: ForumSample | null = null, bestDistance = Number.POSITIVE_INFINITY;
  for (const sample of history.samples) {
    if (sample.at > target) continue;
    const distance = (target - sample.at) / (60 * 60_000);
    if (distance <= toleranceHours && distance < bestDistance) { best = sample; bestDistance = distance; }
  }
  return best;
}
function calculateTrend(rows: ForumStat[], history: ForumHistory, online: boolean, now: number): ForumTrend {
  const ages = rows.map((row) => row.lastPostAt ? Math.max(0, (now - new Date(row.lastPostAt).getTime()) / 3_600_000) : null);
  const weights = [0.55, 0.20, 0.15, 0.10];
  let freshness = 0, weightUsed = 0;
  ages.forEach((age, index) => {
    if (age === null || !Number.isFinite(age)) return;
    freshness += Math.exp(-age / 36) * 100 * weights[index]; weightUsed += weights[index];
  });
  freshness = weightUsed ? freshness / weightUsed : 0;
  const baseline24 = bestSampleBefore(history, now, 24, 7);
  const baseline6 = bestSampleBefore(history, now, 6, 3);
  const baseline12 = bestSampleBefore(history, now, 12, 3);
  const change24h = baseline24 ? totalPosts(rows) - baseline24.totalPosts : null;
  const change6h = baseline6 ? totalPosts(rows) - baseline6.totalPosts : null;
  const previous6h = baseline6 && baseline12 ? baseline6.totalPosts - baseline12.totalPosts : null;
  const hours = baseline24 ? (now - baseline24.at) / 3_600_000 : baseline6 ? (now - baseline6.at) / 3_600_000 : null;
  const postsPerDay = change24h !== null && hours !== null && hours >= 12
    ? Math.max(0, change24h) / hours * 24
    : change6h !== null && hours !== null && hours >= 3
      ? Math.max(0, change6h) / hours * 24 : null;
  let key: TrendKey = "steady", label = "平穩觀察";
  let description = "持續監測論壇新帖與最後發帖時間；郡務只以真正的論壇活動作判斷。";
  if (!online) {
    key = "offline"; label = "論壇暫離線";
    description = "目前讀不到論壇即時數據，會保留最近可用資料，但不會驗收或獎勵未確認的行動。";
  } else if (change6h !== null && previous6h !== null && previous6h >= 8 && change6h <= previous6h * 0.45) {
    key = "falling"; label = "發帖增幅下降";
    description = "新帖增幅較前一時段明顯放慢，郡長官需要親自回到論壇帶動討論。";
  } else if (change6h !== null && change6h >= 20 && (previous6h === null || change6h >= previous6h * 1.6)) {
    key = "surge"; label = "論壇突然升溫";
    description = "新帖量突然增加，應把握熱度參與討論，讓新增的交流持續下去。";
  } else if (change6h !== null && change6h >= 4) {
    key = "rising"; label = "論壇人氣上升";
    description = "新帖正在增加，持續在實際版面參與可把熱度帶到不同區域。";
  } else if (ages.every((age) => age === null || age > 36)) {
    key = "quiet"; label = "分區長時間冷清";
    description = "四區最近缺少新帖子；若郡長官沒有親自發帖，民心和郡務評價會隨時間下降。";
  } else if (freshness >= 55) {
    key = "steady"; label = "近期仍有討論";
    description = "至少有分區仍在更新，郡長官要親自參與，而不是用遊戲按鈕代替論壇行動。";
  }
  return { key, label, description, freshness: clamp(freshness),
    postsPerDay: postsPerDay === null ? null : Math.round(postsPerDay * 10) / 10,
    change24h, change6h, previous6h };
}
function taskForTrend(trend: ForumTrend) {
  if (trend.key === "offline") return {
    title: "先恢復論壇連線", description: "即時版面資料不可用，現在無法驗收真實發帖。請稍後重新開啟遊戲。", recommendedBoardId: 53
  };
  if (trend.key === "quiet" || trend.key === "falling") return {
    title: "振興郡內討論", description: "請親自到暢揮園或延興廣場發表一篇有實質內容的新主題。成功發帖後，系統會核對版面帖數與最後發帖者。", recommendedBoardId: 56
  };
  if (trend.key === "surge") return {
    title: "延續論壇熱度", description: "請到延興廣場發表有內容的主題或參與居民討論。只有論壇本身出現可核對的新帖，才會算作郡長官行動。", recommendedBoardId: 53
  };
  if (trend.key === "rising") return {
    title: "維持參與增長", description: "趁居民參與增加，親自到延興廣場或暢揮園發表主題，帶動郡內持續交流。", recommendedBoardId: 53
  };
  return {
    title: "今日郡務：實際參與論壇", description: "請到延興郡所屬版面發新帖。瀏覽、登入、點擊或在遊戲內操作不算完成；必須有真實帖子，而且最後發帖者必須是當值郡長官。", recommendedBoardId: 53
  };
}
function applyDailyDecay(state: CountyState, now: number) {
  if (!state.lastDecayAt || !Number.isFinite(state.lastDecayAt)) {
    state.lastDecayAt = now;
    state.actionTimes = (state.actionTimes || []).filter((at) => now - at <= 90 * DAY);
    return true;
  }
  let changed = false;
  const start = state.lastDecayAt;
  const fullDays = Math.floor((now - start) / DAY);
  if (fullDays > 0) {
    const actions = state.actionTimes || [];
    for (let index = 0; index < fullDays; index++) {
      const windowStart = start + index * DAY;
      const windowEnd = windowStart + DAY;
      const acted = actions.some((at) => at >= windowStart && at < windowEnd);
      state.day += 1;
      if (!acted) {
        state.popularity = clamp(state.popularity - 4);
        state.trust = clamp(state.trust - 3);
        state.activityBonus = clamp(state.activityBonus - 2, 0, 20);
        state.decisions += 1;
        state.journal = [{
          day: state.day, eventTitle: "郡內缺少實際參與", choiceTitle: "24 小時內沒有驗證到當值官員發帖",
          official: state.lastActionName || "郡長官", at: new Date(windowEnd).toISOString(),
          delta: { popularity: -4, trust: -3, activityBonus: -2 }
        }, ...state.journal].slice(0, 24);
      }
    }
    state.lastDecayAt = start + fullDays * DAY;
    state.actionTimes = actions.filter((at) => now - at <= 90 * DAY);
    changed = true;
  }
  return changed;
}
function publicState(state: CountyState, stats: ForumStat[], online: boolean, history: ForumHistory, sourceNote: string, verification: Verification) {
  const now = Date.now(), trend = calculateTrend(stats, history, online, now);
  const baseline24 = bestSampleBefore(history, now, 24, 7);
  const rows = stats.map((row) => {
    const prev = baseline24?.rows.find((item) => item.id === row.id);
    return { ...row, change24h: prev && row.posts !== null && prev.posts !== null ? row.posts - prev.posts : null };
  });
  const growthScore = trend.postsPerDay === null ? trend.freshness : 100 * trend.postsPerDay / (trend.postsPerDay + 35);
  const activity = clamp(trend.freshness * 0.62 + growthScore * 0.30 + state.popularity * 0.06 + Math.min(4, state.activityBonus * 0.2));
  const totalTopics = rows.reduce((sum, row) => sum + (row.topics || 0), 0);
  return {
    state: {
      day: state.day, treasury: state.treasury, popularity: state.popularity, security: state.security,
      infrastructure: state.infrastructure, trust: state.trust, activityBonus: state.activityBonus,
      decisions: state.decisions, journal: state.journal
    },
    forum: { rows, totalPosts: totalPosts(rows), totalTopics, online, sourceNote, trend },
    activity, trend, dutyTask: taskForTrend(trend), verification,
    updatedAt: new Date(now).toISOString()
  };
}
async function chooseRows(forum: { rows: ForumStat[]; ok: boolean }, state: CountyState) {
  if (forum.ok) return { rows: forum.rows, online: true, sourceNote: "論壇即時首頁" };
  if (state.lastVerifiedStats?.length) return {
    rows: state.lastVerifiedStats, online: false, sourceNote: "最近一次可核對的論壇數據（非即時）"
  };
  return { rows: FALLBACK_FORUMS, online: false, sourceNote: "公開頁面快照（非即時）" };
}
function makeVerification(state: CountyState, official: string, online: boolean, verified: { name: string; area: string } | null, currentRows: ForumStat[]): Verification {
  const now = Date.now(), actions = state.actionTimes || [];
  const hoursSinceLastAction = state.lastActionAt ? Math.max(0, (now - state.lastActionAt) / 3_600_000) : null;
  if (!online) return {
    status: "offline", message: "論壇未能即時讀取，暫時不會驗收行動。", verifiedThisRequest: false,
    lastActionAt: state.lastActionAt ? new Date(state.lastActionAt).toISOString() : null,
    lastActionName: state.lastActionName || null, lastActionArea: state.lastActionArea || null,
    totalVerifiedActions: actions.length, hoursSinceLastAction
  };
  if (verified) return {
    status: "verified", message: "已核實 " + verified.name + " 在「" + verified.area + "」新增真實帖子；民心及信任已上升。",
    verifiedThisRequest: true, lastActionAt: new Date(now).toISOString(), lastActionName: verified.name,
    lastActionArea: verified.area, totalVerifiedActions: actions.length, hoursSinceLastAction: 0
  };
  if (official && state.lastActionName && normalizedName(state.lastActionName) === normalizedName(official) && state.lastActionAt) {
    return {
      status: "verified", message: "最近一次已核實的郡長官行動：在「" + (state.lastActionArea || "郡內版面") + "」發帖（" + new Date(state.lastActionAt).toLocaleString("zh-TW") + "）。",
      verifiedThisRequest: false, lastActionAt: new Date(state.lastActionAt).toISOString(),
      lastActionName: state.lastActionName, lastActionArea: state.lastActionArea || null,
      totalVerifiedActions: actions.length, hoursSinceLastAction
    };
  }
  const noAuthor = currentRows.some((row) => row.posts !== null && !row.lastPostBy);
  if (noAuthor) return {
    status: "unreadable", message: "已讀取部分版面統計，但論壇沒有提供可辨認的最新發帖者資料；不會冒認行動完成。",
    verifiedThisRequest: false, lastActionAt: state.lastActionAt ? new Date(state.lastActionAt).toISOString() : null,
    lastActionName: state.lastActionName || null, lastActionArea: state.lastActionArea || null,
    totalVerifiedActions: actions.length, hoursSinceLastAction
  };
  return {
    status: "waiting", message: "尚未驗收這位郡長官的新帖。請實際在下方其中一個論壇版面發帖；只有帖數增加且最後發帖者名稱相符，才會獲得治理評價。",
    verifiedThisRequest: false, lastActionAt: state.lastActionAt ? new Date(state.lastActionAt).toISOString() : null,
    lastActionName: state.lastActionName || null, lastActionArea: state.lastActionArea || null,
    totalVerifiedActions: actions.length, hoursSinceLastAction
  };
}
export async function GET(request: Request) {
  try {
    const state = await readState();
    const official = String(new URL(request.url).searchParams.get("official") || "").trim().slice(0, 40);
    const forum = await fetchForumStats();
    let history = await readForumHistory();
    let selection = await chooseRows(forum, state);
    if (forum.ok) history = await recordForumSample(forum.rows, history);

    let changed = false;
    let verified: { name: string; area: string } | null = null;
    if (selection.online) {
      const baseline = state.lastVerifiedStats;
      if (!baseline?.length) {
        state.lastVerifiedStats = snapshotRows(selection.rows);
        changed = true;
      } else if (official) {
        for (const row of selection.rows) {
          const prior = baseline.find((item) => item.id === row.id);
          const postGrowth = row.posts !== null && prior?.posts !== null && prior?.posts !== undefined && row.posts > prior.posts;
          if (postGrowth && row.lastPostBy && normalizedName(row.lastPostBy) === normalizedName(official)) {
            verified = { name: official, area: row.name };
            const now = Date.now();
            state.popularity = clamp(state.popularity + 3);
            state.trust = clamp(state.trust + 2);
            state.activityBonus = clamp(state.activityBonus + 2, 0, 20);
            state.lastActionAt = now;
            state.lastActionName = official;
            state.lastActionArea = row.name;
            state.actionTimes = [...(state.actionTimes || []), now].filter((at) => now - at <= 90 * DAY);
            state.decisions += 1;
            state.journal = [{
              day: state.day, eventTitle: "論壇實際行動已驗證",
              choiceTitle: "真實發帖已增加「" + row.name + "」的版面帖數",
              official, at: new Date(now).toISOString(),
              delta: { popularity: 3, trust: 2, activityBonus: 2 }
            }, ...state.journal].slice(0, 24);
            state.lastVerifiedStats = snapshotRows(selection.rows);
            changed = true;
            break;
          }
        }
      }
      // If a different member posted, keep the verification baseline; a later real post by the on-duty official can still be verified.
    }

    if (applyDailyDecay(state, Date.now())) changed = true;
    if (changed) await saveState(state);
    // A save or event refresh should not convert fallback counts into live statistics.
    selection = await chooseRows(forum, state);
    const verification = makeVerification(state, official, forum.ok, verified, selection.rows);
    const sourceNote = selection.sourceNote + (forum.ok ? "；每 60 秒輪詢，趨勢樣本每 10 分鐘記錄" : "");
    return NextResponse.json(
      publicState(state, selection.rows, selection.online, history, sourceNote, verification),
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "讀取郡務資料失敗。" }, { status: 503 });
  }
}
