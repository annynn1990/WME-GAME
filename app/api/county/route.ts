import { list, put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ForumStat = { id: string; name: string; topics: number | null; posts: number | null; lastPostAt: string | null; change24h?: number | null };
type Delta = { treasury?: number; popularity?: number; security?: number; infrastructure?: number; trust?: number; activityBonus?: number };
type Choice = { id: string; title: string; description: string; delta: Delta };
type EventTemplate = { id: string; icon: string; title: string; description: string; choices: Choice[] };
type JournalEntry = { day: number; eventTitle: string; choiceTitle: string; official: string; at: string; delta: Delta };
type CountyState = { day: number; treasury: number; popularity: number; security: number; infrastructure: number; trust: number; activityBonus: number; decisions: number; journal: JournalEntry[]; lastForumStats?: ForumStat[] };
type ForumSample = { at: number; totalPosts: number; rows: ForumStat[] };
type ForumHistory = { samples: ForumSample[] };
type TrendKey = "surge" | "rising" | "steady" | "falling" | "quiet" | "offline";
type ForumTrend = { key: TrendKey; label: string; description: string; freshness: number; postsPerDay: number | null; change24h: number | null; change6h: number | null; previous6h: number | null };

const STATE_PATH = "yanxing-county/state.json";
const HISTORY_PATH = "yanxing-county/forum-history/";
const FORUM_URL = "https://www.wongmingempire.com/bbswm/forum.php?gid=366";
const FALLBACK_FORUMS: ForumStat[] = [
  { id: "square", name: "延興廣場", topics: 10174, posts: 140445, lastPostAt: "2026-10-13T15:35:00+08:00" },
  { id: "garden", name: "暢揮園", topics: 465, posts: 3706, lastPostAt: "2026-10-13T15:32:00+08:00" },
  { id: "hall", name: "永享堂", topics: 225, posts: 1834, lastPostAt: "2026-10-07T21:54:00+08:00" },
  { id: "government", name: "延興郡政府", topics: 30, posts: 202, lastPostAt: "2026-04-13T18:51:00+08:00" }
];
const eventPool: EventTemplate[] = [
  { id: "market", icon: "🏮", title: "市集人潮減少", description: "商戶反映最近人流不足，擔心生意持續下滑。郡長官需要決定如何振興市集。", choices: [
    { id: "festival", title: "舉辦週末市集", description: "花費郡庫，吸引居民出門交流。", delta: { treasury: -16, popularity: 8, infrastructure: 2, activityBonus: 4 } },
    { id: "promo", title: "論壇商戶宣傳週", description: "鼓勵商戶在各區分享新品與活動。", delta: { treasury: -7, popularity: 4, trust: 3, activityBonus: 7 } },
    { id: "wait", title: "暫時觀察", description: "保留經費，但商戶可能繼續不滿。", delta: { popularity: -4, trust: -2 } }
  ]},
  { id: "flood", icon: "🌧️", title: "連日大雨與排水問題", description: "低窪街道積水，居民要求郡政府盡快處理。", choices: [
    { id: "drain", title: "立即清理排水", description: "支出較高，能改善公共設施與民心。", delta: { treasury: -20, infrastructure: 9, popularity: 3, trust: 4 } },
    { id: "sandbags", title: "先設臨時防水措施", description: "較省錢，但長期設施改善有限。", delta: { treasury: -9, security: 3, infrastructure: 3, trust: 1 } },
    { id: "ignore", title: "待雨勢減弱再處理", description: "節省開支，居民可能認為郡府反應遲緩。", delta: { popularity: -7, trust: -6, infrastructure: -3 } }
  ]},
  { id: "quiet", icon: "💬", title: "論壇討論轉淡", description: "各分區最近缺少新話題，居民參與感下降。", choices: [
    { id: "topic", title: "發起郡民話題月", description: "由各區輪流提出議題與活動。", delta: { treasury: -8, popularity: 5, trust: 3, activityBonus: 9 } },
    { id: "prize", title: "舉辦創作徵集", description: "以作品與討論帶動新帖。", delta: { treasury: -13, popularity: 6, activityBonus: 10 } },
    { id: "organic", title: "讓居民自由討論", description: "不額外花費，但短期效果有限。", delta: { trust: 2, activityBonus: 2 } }
  ]},
  { id: "complaint", icon: "📣", title: "居民提交聯署投訴", description: "一批居民對公共服務表達不滿，要求郡政府公開回應。", choices: [
    { id: "listen", title: "召開居民座談會", description: "聽取意見並公布處理期限。", delta: { treasury: -6, popularity: 7, trust: 9 } },
    { id: "review", title: "交由官員調查", description: "較有秩序，但回覆速度稍慢。", delta: { treasury: -4, security: 2, trust: 5, popularity: 2 } },
    { id: "dismiss", title: "認為問題不大", description: "暫時不用花錢，但容易損害信任。", delta: { popularity: -8, trust: -10 } }
  ]},
  { id: "festival", icon: "🎏", title: "郡民建議舉辦節慶", description: "居民提議辦一場郡慶，盼望增加認同感與交流。", choices: [
    { id: "grand", title: "籌辦大型郡慶", description: "花費較高，預期帶來高人氣。", delta: { treasury: -24, popularity: 10, trust: 5, activityBonus: 8 } },
    { id: "small", title: "舉辦小型文化日", description: "控制成本，穩健增加參與。", delta: { treasury: -10, popularity: 5, infrastructure: 1, activityBonus: 4 } },
    { id: "postpone", title: "等財政更充裕再辦", description: "暫存郡庫，居民熱情略減。", delta: { treasury: 8, popularity: -3 } }
  ]},
  { id: "security", icon: "🛡️", title: "夜間治安受到關注", description: "夜間設施不足的問題引起討論，居民希望郡政府加強巡查。", choices: [
    { id: "patrol", title: "增加巡查與通報", description: "安排官員巡視並建立回報流程。", delta: { treasury: -12, security: 10, trust: 4 } },
    { id: "lighting", title: "優先改善照明", description: "著重長期公共設施建設。", delta: { treasury: -18, security: 7, infrastructure: 8 } },
    { id: "notice", title: "先發安全公告", description: "成本最低，實際改善較有限。", delta: { security: 2, trust: 1 } }
  ]},
  { id: "road", icon: "🧱", title: "主要道路破損", description: "居民反映通行不便，商戶也擔心運輸受到影響。", choices: [
    { id: "repair", title: "立即修繕道路", description: "投入郡庫提升基建。", delta: { treasury: -22, infrastructure: 11, popularity: 4 } },
    { id: "patch", title: "先修補最嚴重路段", description: "成本中等，緩解主要問題。", delta: { treasury: -11, infrastructure: 6, popularity: 2 } },
    { id: "delay", title: "延後至下期預算", description: "保存資金，基建評價下降。", delta: { treasury: 6, infrastructure: -5, trust: -3 } }
  ]},
  { id: "culture", icon: "📚", title: "文化團體尋求支持", description: "本地社團希望郡府支持講座、展覽或居民創作。", choices: [
    { id: "library", title: "設立文化角落", description: "支持長期交流與知識分享。", delta: { treasury: -15, infrastructure: 5, popularity: 5, trust: 4, activityBonus: 5 } },
    { id: "contest", title: "舉辦創作比賽", description: "以公開參與帶動作品與新帖。", delta: { treasury: -10, popularity: 4, activityBonus: 8 } },
    { id: "private", title: "請社團自行籌款", description: "保留財政，但政府支持度下降。", delta: { treasury: 3, trust: -2 } }
  ]},
  { id: "budget", icon: "🪙", title: "郡庫出現結餘", description: "財政官報告目前有一筆可運用的結餘，郡長官可決定下一步。", choices: [
    { id: "invest", title: "投入基建基金", description: "用於長遠建設。", delta: { treasury: -12, infrastructure: 8, trust: 2 } },
    { id: "grant", title: "發放社區活動補助", description: "提高參與，但資金會減少。", delta: { treasury: -15, popularity: 5, activityBonus: 7 } },
    { id: "reserve", title: "保留為緊急預備金", description: "目前不求快速增長，為突發事件留後路。", delta: { treasury: 12, trust: 2 } }
  ]},
  { id: "rumour", icon: "🗞️", title: "不實消息在居民間流傳", description: "一則未經證實的消息引發爭議，郡政府需要處理資訊混亂。", choices: [
    { id: "facts", title: "公布核實資料", description: "以公開資料回應疑問。", delta: { treasury: -3, trust: 8, security: 2 } },
    { id: "dialogue", title: "與居民直接溝通", description: "花時間回應問題，有助恢復信任。", delta: { popularity: 3, trust: 6, activityBonus: 3 } },
    { id: "silent", title: "不作回應", description: "避免擴大話題，但可能讓猜測持續。", delta: { trust: -7, popularity: -3 } }
  ]},
  { id: "business", icon: "🏪", title: "新商戶申請進駐", description: "有商戶希望在延興郡開展業務，申請需要郡政府審批。", choices: [
    { id: "approve", title: "批准並提供指引", description: "鼓勵發展，增加公共收入與活力。", delta: { treasury: 12, popularity: 4, infrastructure: 2, activityBonus: 3 } },
    { id: "conditions", title: "附條件批准", description: "兼顧規範與發展。", delta: { treasury: 7, security: 2, trust: 2 } },
    { id: "reject", title: "暫不批准", description: "降低管理壓力，但錯失發展機會。", delta: { treasury: -2, popularity: -4 } }
  ]},
  { id: "staff", icon: "🧑‍💼", title: "郡府收到官員增援提案", description: "有人建議重新分配工作，改善辦事效率。", choices: [
    { id: "assign", title: "成立跨部門小組", description: "集中處理急務，提升施政能力。", delta: { treasury: -8, infrastructure: 3, trust: 6, security: 2 } },
    { id: "train", title: "安排官員培訓", description: "短期成本換取較穩定的治理。", delta: { treasury: -10, trust: 4, infrastructure: 4 } },
    { id: "statusquo", title: "維持現有人手", description: "保留資金，但不會立即改善效率。", delta: { treasury: 3 } }
  ]}
];
function initialState(): CountyState {
  return { day: 1, treasury: 120, popularity: 60, security: 62, infrastructure: 25, trust: 58, activityBonus: 0, decisions: 0, journal: [] };
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
  if (!tokenReady()) throw new Error("雲端存檔尚未設定，請檢查 Vercel Blob 連線。");
  const data = await readJsonBlob<CountyState>(STATE_PATH);
  if (!data) return initialState();
  return { ...initialState(), ...data, journal: Array.isArray(data.journal) ? data.journal : [] };
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

function escapeRegExp(value: string) {
  return value.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
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

function containerAround(html: string, index: number): string {
  const lower = html.toLowerCase();
  const candidates = ["<tr", "<li"];
  let bestStart = -1;
  let bestEnd = -1;
  for (const tag of candidates) {
    const start = lower.lastIndexOf(tag, index);
    const close = tag === "<tr" ? "</tr>" : "</li>";
    const end = lower.indexOf(close, index);
    if (start >= 0 && end >= index && end - start < 16000 && start > bestStart) {
      bestStart = start; bestEnd = end + close.length;
    }
  }
  if (bestStart >= 0 && bestEnd > bestStart) return html.slice(bestStart, bestEnd);
  return html.slice(Math.max(0, index - 400), Math.min(html.length, index + 2600));
}

let forumCache: { at: number; rows: ForumStat[] } | null = null;
async function fetchForumStats(): Promise<{ rows: ForumStat[]; ok: boolean; checkedAt: string }> {
  const now = Date.now();
  if (forumCache && now - forumCache.at < 90_000) {
    return { rows: forumCache.rows, ok: true, checkedAt: new Date(forumCache.at).toISOString() };
  }

  try {
    const response = await fetch(FORUM_URL, {
      cache: "no-store",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; WongmingCountyGame/1.0)",
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.7",
        "referer": "https://www.wongmingempire.com/bbswm/"
      },
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) throw new Error("Forum HTTP " + response.status);
    const html = await response.text();
    if (!html.includes("延興廣場") || html.length < 5000) throw new Error("Forum page did not contain expected board listings");

    const aliases: Record<string, string[]> = {
      square: ["延興廣場", "延兴广场"],
      garden: ["暢揮園", "畅挥园"],
      hall: ["永享堂"],
      government: ["延興郡政府", "延兴郡政府"]
    };
    const rows: ForumStat[] = FALLBACK_FORUMS.map((row) => ({ ...row, lastPostAt: null, change24h: null }));
    let parsedCount = 0;

    for (const row of rows) {
      let best: { topics: number | null; posts: number | null; lastPostAt: string | null } | null = null;
      for (const alias of aliases[row.id]) {
        const matcher = new RegExp(escapeRegExp(alias), "g");
        let match: RegExpExecArray | null;
        while ((match = matcher.exec(html)) !== null) {
          const chunk = containerAround(html, match.index);
          const text = cleanText(chunk);
          const topicMatch = text.match(/(?:主題|主题)\s*[:：]?\s*([\d][\d,]*)/i);
          const postMatch = text.match(/(?:帖數|帖数|帖子|貼子)\s*[:：]?\s*([\d][\d,]*)/i);
          if (topicMatch || postMatch) {
            best = {
              topics: topicMatch ? num(topicMatch[1]) : null,
              posts: postMatch ? num(postMatch[1]) : null,
              lastPostAt: lastPostTimestamp(text)
            };
            if (best.topics !== null && best.posts !== null) break;
          }
        }
        if (best?.topics !== null && best?.posts !== null) break;
      }
      if (best && (best.topics !== null || best.posts !== null)) {
        row.topics = best.topics ?? row.topics;
        row.posts = best.posts ?? row.posts;
        row.lastPostAt = best.lastPostAt;
        parsedCount++;
      }
    }

    if (parsedCount < 3) throw new Error("Only parsed " + parsedCount + "/4 forum categories");
    forumCache = { at: now, rows };
    return { rows, ok: true, checkedAt: new Date(now).toISOString() };
  } catch {
    const rows = forumCache?.rows || FALLBACK_FORUMS;
    return { rows: rows.map((row) => ({ ...row })), ok: false, checkedAt: new Date().toISOString() };
  }
}

const HISTORY_INTERVAL = 10 * 60_000;
const HISTORY_RETENTION = 7 * 24 * 60 * 60_000;
const HISTORY_SLOT_MAX = 999999999;
let historyCache: { at: number; history: ForumHistory } | null = null;

function historyPath(slot: number, rows: ForumStat[]) {
  // Inverted fixed-width timestamp makes newest snapshots sort first in Blob's pathname listing.
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
  if (!Number.isFinite(slot) || slot < 0) return null;
  const rows = FALLBACK_FORUMS.map((base, index) => {
    const offset = 2 + index * 3;
    const topicCount = fields[offset];
    const postCount = fields[offset + 1];
    const lastSeconds = fields[offset + 2];
    return {
      ...base,
      topics: topicCount < 0 ? null : topicCount,
      posts: postCount < 0 ? null : postCount,
      lastPostAt: lastSeconds > 0 ? new Date(lastSeconds * 1000).toISOString() : null
    };
  });
  return { at: slot * HISTORY_INTERVAL, totalPosts: fields[1], rows };
}

async function readForumHistory(): Promise<ForumHistory> {
  if (historyCache && Date.now() - historyCache.at < 45_000) return historyCache.history;
  try {
    const result = await list({ prefix: HISTORY_PATH, limit: 1000 });
    const samples = result.blobs
      .map((blob) => parseHistoryBlob(blob.pathname))
      .filter((sample): sample is ForumSample => Boolean(sample))
      .filter((sample) => Date.now() - sample.at <= HISTORY_RETENTION)
      .sort((a, b) => a.at - b.at);
    const history = { samples };
    historyCache = { at: Date.now(), history };
    return history;
  } catch {
    return historyCache?.history || { samples: [] };
  }
}

function totalPosts(rows: ForumStat[]) {
  return rows.reduce((sum, row) => sum + (row.posts || 0), 0);
}

async function recordForumSample(rows: ForumStat[]): Promise<ForumHistory> {
  const history = await readForumHistory();
  const now = Date.now();
  const slot = Math.floor(now / HISTORY_INTERVAL);
  const latest = history.samples.length ? history.samples[history.samples.length - 1] : null;
  if (latest && Math.floor(latest.at / HISTORY_INTERVAL) >= slot) return history;
  if (latest && now - latest.at < HISTORY_INTERVAL) return history;
  const path = historyPath(slot, rows);
  try {
    await put(path, "{}", {
      access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json"
    });
    const sample: ForumSample = { at: slot * HISTORY_INTERVAL, totalPosts: totalPosts(rows), rows: rows.map((row) => ({ ...row })) };
    const next = { samples: [...history.samples, sample].filter((item) => now - item.at <= HISTORY_RETENTION).slice(-1000) };
    historyCache = { at: now, history: next };
    return next;
  } catch {
    return history;
  }
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function bestSampleBefore(history: ForumHistory, now: number, targetHours: number, toleranceHours: number) {
  const target = now - targetHours * 60 * 60_000;
  let best: ForumSample | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const sample of history.samples) {
    if (sample.at > target) continue;
    const distance = (target - sample.at) / (60 * 60_000);
    if (distance <= toleranceHours && distance < bestDistance) {
      best = sample;
      bestDistance = distance;
    }
  }
  return best;
}

function calculateTrend(rows: ForumStat[], history: ForumHistory, online: boolean, now = Date.now()): ForumTrend {
  const ages = rows.map((row) => row.lastPostAt ? Math.max(0, (now - new Date(row.lastPostAt).getTime()) / 3_600_000) : null);
  const weights = [0.55, 0.20, 0.15, 0.10];
  let freshness = 0, usedWeight = 0;
  ages.forEach((age, index) => {
    if (age === null || !Number.isFinite(age)) return;
    freshness += Math.exp(-age / 36) * 100 * (weights[index] || 0.1);
    usedWeight += weights[index] || 0.1;
  });
  freshness = usedWeight > 0 ? freshness / usedWeight : 0;

  const currentTotal = totalPosts(rows);
  const baseline24 = bestSampleBefore(history, now, 24, 7);
  const baseline6 = bestSampleBefore(history, now, 6, 3);
  const baseline12 = bestSampleBefore(history, now, 12, 3);
  const change24h = baseline24 ? currentTotal - baseline24.totalPosts : null;
  const change6h = baseline6 ? currentTotal - baseline6.totalPosts : null;
  const previous6h = baseline6 && baseline12 ? baseline6.totalPosts - baseline12.totalPosts : null;
  const observedHours = baseline24 ? (now - baseline24.at) / 3_600_000 : baseline6 ? (now - baseline6.at) / 3_600_000 : null;
  const postsPerDay = change24h !== null && observedHours && observedHours >= 12
    ? Math.max(0, change24h) / observedHours * 24
    : change6h !== null && observedHours && observedHours >= 3
      ? Math.max(0, change6h) / observedHours * 24
      : null;

  let key: TrendKey = "steady", label = "平穩觀察";
  let description = "論壇互動大致平穩，持續觀察最新發帖和各分區動態。";
  if (!online) {
    key = "offline"; label = "論壇暫離線";
    description = "暫時無法取得最新論壇資料，先顯示最近可用的公開數據；暫不根據舊數據判斷升跌。";
  } else if (change6h !== null && previous6h !== null && previous6h >= 8 && change6h <= previous6h * 0.45) {
    key = "falling"; label = "新帖正在減少";
    description = "最近時段新增約 " + Math.max(0, change6h) + " 帖，較之前明顯放慢，郡府需要維持討論熱度。";
  } else if (change6h !== null && change6h >= 20 && (previous6h === null || change6h >= previous6h * 1.6)) {
    key = "surge"; label = "論壇突然升溫";
    description = "觀測時段新增約 " + change6h + " 帖，討論明顯升溫；應把握時機或避免話題失控。";
  } else if (change6h !== null && change6h >= 4) {
    key = "rising"; label = "論壇人氣上升";
    description = "觀測時段新增約 " + change6h + " 帖，郡內討論正逐步增加。";
  } else {
    const activeRecent = ages.filter((age) => age !== null && age <= 12).length;
    const activeToday = ages.filter((age) => age !== null && age <= 24).length;
    const noGrowthLongEnough = history.samples.length >= 2 &&
      history.samples[history.samples.length - 1].at - history.samples[0].at >= 18 * 60 * 60_000 && change24h === 0;
    if ((noGrowthLongEnough && activeRecent === 0) || (activeToday === 0 && ages.every((age) => age === null || age > 36))) {
      key = "quiet"; label = "分區逐漸冷清";
      description = "主要分區最近少有新帖，郡府需要主動帶動交流，否則活躍度會持續走低。";
    } else if (freshness >= 55) {
      key = "steady"; label = "互動維持活躍";
      description = "分區仍有近期發帖，暫時以維持良好交流、照顧新帖為主。";
    } else {
      key = "steady"; label = "平穩觀察";
      description = "尚未累積足夠的連續樣本判斷升跌，會繼續對照新帖數與最後發帖時間。";
    }
  }
  return {
    key, label, description, freshness: clamp(freshness),
    postsPerDay: postsPerDay === null ? null : Math.round(postsPerDay * 10) / 10,
    change24h, change6h, previous6h
  };
}

function eventForDay(day: number, trend: ForumTrend): EventTemplate & { eventId: string; day: number } {
  let chosen: EventTemplate;
  if (trend.key === "surge") {
    chosen = {
      id: "forum-surge", icon: "📈", title: "論壇討論突然升溫",
      description: "分區新帖明顯增加。郡長官可以把握熱度鼓勵更多交流，也要留意話題秩序與不同分區的參與機會。",
      choices: [
        { id: "surge-cross", title: "舉辦跨區交流活動", description: "把熱度帶到較少人參與的分區。", delta: { treasury: -12, popularity: 7, trust: 3, activityBonus: 5 } },
        { id: "surge-support", title: "置頂新手交流帖", description: "讓新會員更容易加入討論。", delta: { treasury: -5, popularity: 5, trust: 6, activityBonus: 3 } },
        { id: "surge-watch", title: "維持秩序、自然發展", description: "不額外花費，由官員留意討論秩序。", delta: { security: 3, trust: 2 } }
      ]
    };
  } else if (trend.key === "falling" || trend.key === "quiet") {
    chosen = {
      id: trend.key === "quiet" ? "forum-quiet" : "forum-falling",
      icon: "💬", title: trend.key === "quiet" ? "分區討論陷入沉寂" : "論壇新帖增幅放慢",
      description: trend.key === "quiet"
        ? "最新發帖時間顯示多個分區缺乏新話題。郡府需要採取行動，不能只靠累積帖子數維持表面活躍。"
        : "新增帖數較之前時段減少。請挑選一項措施，讓居民重新願意開帖和回覆。",
      choices: [
        { id: "quiet-official", title: "官員帶頭發起話題", description: "低成本開放問答，帶動居民回覆。", delta: { treasury: -5, popularity: 5, trust: 4, activityBonus: 7 } },
        { id: "quiet-event", title: "舉辦跨區接龍／徵文", description: "成本較高，但能鼓勵不同分區共同參與。", delta: { treasury: -14, popularity: 8, infrastructure: 1, activityBonus: 10 } },
        { id: "quiet-wait", title: "觀察一個階段", description: "保留經費，但人氣可能再下降。", delta: { treasury: 2, popularity: -3, trust: -2 } }
      ]
    };
  } else if (trend.key === "rising") {
    chosen = {
      id: "forum-rising", icon: "🗨️", title: "居民參與正在增加",
      description: "新帖數已有增長。郡府可以支援新話題、引導交流，或讓居民自行延續討論。",
      choices: [
        { id: "rising-welcome", title: "推動新人報到與回覆", description: "協助新會員融入各分區。", delta: { treasury: -4, popularity: 4, trust: 5, activityBonus: 4 } },
        { id: "rising-topic", title: "推出本週主題活動", description: "用活動把新帖增長延續下去。", delta: { treasury: -10, popularity: 6, activityBonus: 7 } },
        { id: "rising-organic", title: "維持自由交流", description: "不增加支出，先觀察熱度是否持續。", delta: { trust: 2, activityBonus: 1 } }
      ]
    };
  } else {
    const candidates = eventPool.filter((event) => event.id !== "quiet" && event.id !== "festival");
    const dayString = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const seed = Number(dayString) || 20261019;
    chosen = candidates[Math.abs(day * 17 + seed * 13 + Math.floor(day / 3) * 7) % candidates.length];
  }
  return { ...chosen, eventId: String(day) + "-" + chosen.id, day };
}

function activityScore(state: CountyState, trend: ForumTrend) {
  const growthScore = trend.postsPerDay === null ? trend.freshness : 100 * trend.postsPerDay / (trend.postsPerDay + 35);
  return clamp(trend.freshness * 0.62 + growthScore * 0.30 + state.popularity * 0.06 + Math.min(4, state.activityBonus * 0.2));
}

function publicState(state: CountyState, stats: ForumStat[], online: boolean, history: ForumHistory, sourceNote: string) {
  const now = Date.now();
  const trend = calculateTrend(stats, history, online, now);
  const baseline24 = bestSampleBefore(history, now, 24, 7);
  const rows = stats.map((row) => {
    const oldRow = baseline24?.rows.find((item) => item.id === row.id);
    return { ...row, change24h: oldRow && row.posts !== null && oldRow.posts !== null ? row.posts - oldRow.posts : null };
  });
  return {
    state,
    forum: {
      rows,
      totalPosts: totalPosts(rows),
      totalTopics: rows.reduce((sum, row) => sum + (row.topics || 0), 0),
      online, sourceNote, trend
    },
    activity: activityScore(state, trend),
    event: eventForDay(state.day, trend),
    updatedAt: new Date(now).toISOString()
  };
}

async function latestGameData(state: CountyState) {
  const forum = await fetchForumStats();
  let history = await readForumHistory();
  let rows: ForumStat[];
  let sourceNote: string;
  if (forum.ok) {
    rows = forum.rows;
    history = await recordForumSample(rows);
    sourceNote = "即時論壇頁面";
  } else if (history.samples.length) {
    rows = history.samples[history.samples.length - 1].rows;
    sourceNote = "上次成功同步的論壇數據（非即時）";
  } else if (state.lastForumStats?.length) {
    rows = state.lastForumStats;
    sourceNote = "上次郡務存檔中的論壇數據（非即時）";
  } else {
    rows = FALLBACK_FORUMS;
    sourceNote = "公開頁面快照（非即時）";
  }
  return publicState(state, rows, forum.ok, history, sourceNote);
}

export async function GET() {
  try {
    const state = await readState();
    const data = await latestGameData(state);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "讀取郡務資料失敗。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const state = await readState();
    const current = await latestGameData(state);
    const official = String(body.official || "郡長官").slice(0, 40);
    if (String(body.eventId || "") !== current.event.eventId) {
      return NextResponse.json({ error: "論壇狀態已更新，請按最新事件重新決策。", latest: current }, { status: 409 });
    }
    const choice = current.event.choices.find((item) => item.id === String(body.choiceId || ""));
    if (!choice) return NextResponse.json({ error: "找不到這個處理方案。" }, { status: 400 });

    const d = choice.delta;
    state.treasury = Math.max(-99, Math.min(9999, state.treasury + (d.treasury || 0)));
    state.popularity = clamp(state.popularity + (d.popularity || 0));
    state.security = clamp(state.security + (d.security || 0));
    state.infrastructure = clamp(state.infrastructure + (d.infrastructure || 0));
    state.trust = clamp(state.trust + (d.trust || 0));
    state.activityBonus = clamp(state.activityBonus + (d.activityBonus || 0), 0, 20);
    state.decisions += 1;
    state.journal = [{
      day: state.day, eventTitle: current.event.title, choiceTitle: choice.title, official,
      at: new Date().toISOString(), delta: d
    }, ...state.journal].slice(0, 16);
    state.day += 1;
    if (current.forum.online) state.lastForumStats = current.forum.rows;
    await saveState(state);
    const latest = await latestGameData(state);
    return NextResponse.json(latest, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法保存決策，請稍後重試。" }, { status: 503 });
  }
}
