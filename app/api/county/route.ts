import { list, put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ForumStat = { id: string; name: string; topics: number | null; posts: number | null };
type Delta = { treasury?: number; popularity?: number; security?: number; infrastructure?: number; trust?: number; activityBonus?: number };
type Choice = { id: string; title: string; description: string; delta: Delta };
type EventTemplate = { id: string; icon: string; title: string; description: string; choices: Choice[] };
type JournalEntry = { day: number; eventTitle: string; choiceTitle: string; official: string; at: string; delta: Delta };
type CountyState = { day: number; treasury: number; popularity: number; security: number; infrastructure: number; trust: number; activityBonus: number; decisions: number; journal: JournalEntry[]; lastForumStats?: ForumStat[] };

const STATE_PATH = "yanxing-county/state.json";
const FORUM_URL = "https://www.wongmingempire.com/bbswm/forum.php?gid=366";
// Public-forum snapshot observed during research on 2026-10-19. It is clearly marked offline unless a live read succeeds.
const initialForums: ForumStat[] = [
  { id: "square", name: "延興廣場", topics: 10174, posts: 140445 },
  { id: "garden", name: "暢揮園", topics: 465, posts: 3706 },
  { id: "hall", name: "永享堂", topics: 225, posts: 1834 },
  { id: "government", name: "延興郡政府", topics: 30, posts: 202 }
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

async function readState(): Promise<CountyState> {
  if (!tokenReady()) throw new Error("尚未連接雲端儲存，請在 Vercel 為此專案連接 Blob 儲存空間。");
  const result = await list({ prefix: STATE_PATH, limit: 10 });
  const match = result.blobs.find((blob) => blob.pathname === STATE_PATH);
  if (!match) return initialState();
  const response = await fetch(match.url, { cache: "no-store" });
  if (!response.ok) throw new Error("讀取雲端郡務存檔失敗。");
  const data = await response.json() as CountyState;
  return { ...initialState(), ...data, journal: Array.isArray(data.journal) ? data.journal : [] };
}

async function saveState(state: CountyState) {
  await put(STATE_PATH, JSON.stringify(state), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json"
  });
}

function cleanText(html: string) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim();
}

function num(value: string) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

let forumCache: { at: number; rows: ForumStat[]; ok: boolean } | null = null;

async function fetchForumStats(): Promise<{ rows: ForumStat[]; ok: boolean }> {
  if (forumCache && Date.now() - forumCache.at < 90_000) return { rows: forumCache.rows, ok: forumCache.ok };
  try {
    const response = await fetch(FORUM_URL, {
      cache: "no-store",
      headers: { "user-agent": "WongmingCountyGame/1.0 (+public forum activity stats)" },
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) throw new Error("Forum returned " + response.status);
    const html = await response.text();
    const aliases: Record<string, string[]> = {
      square: ["延興廣場", "延兴广场"],
      garden: ["暢揮園", "畅挥园"],
      hall: ["永享堂"],
      government: ["延興郡政府", "延兴郡政府"]
    };
    const hits: { id: string; at: number; alias: string }[] = [];
    for (const row of initialForums) {
      for (const alias of aliases[row.id]) {
        const re = new RegExp(alias, "g");
        let match: RegExpExecArray | null;
        while ((match = re.exec(html)) !== null) {
          const preceding = html.slice(Math.max(0, match.index - 700), match.index);
          // Prefer the actual forum listing (anchor/link region), not document metadata or a mention in another forum.
          if (/<a\b/i.test(preceding) && !/<\/a>[\s\S]{0,80}<a\b/i.test(preceding.slice(-180))) {
            hits.push({ id: row.id, at: match.index, alias });
            break;
          }
        }
      }
    }
    const byId = new Map<string, {at:number; alias:string}>();
    for (const hit of hits.sort((a,b)=>a.at-b.at)) if (!byId.has(hit.id)) byId.set(hit.id, hit);
    const ordered = [...byId.entries()].sort((a,b)=>a[1].at-b[1].at);
    const rows = initialForums.map((forum) => ({ ...forum }));
    let parsedCount = 0;
    for (let i = 0; i < ordered.length; i++) {
      const [id, hit] = ordered[i];
      const end = ordered[i + 1]?.[1].at ?? Math.min(html.length, hit.at + 3500);
      const segment = cleanText(html.slice(hit.at, end));
      const postsMatch = segment.match(/(?:帖數|帖数|帖子|貼子|文章|posts?)\s*[:：]?\s*([\d][\d,]*)/i);
      const topicsMatch = segment.match(/(?:主題|主题|threads?)\s*[:：]?\s*([\d][\d,]*)/i);
      const row = rows.find((item) => item.id === id);
      if (row && (postsMatch || topicsMatch)) {
        if (postsMatch) row.posts = num(postsMatch[1]);
        if (topicsMatch) row.topics = num(topicsMatch[1]);
        parsedCount++;
      }
    }
    const ok = parsedCount >= 2;
    const result = ok ? rows : (forumCache?.rows || initialForums);
    forumCache = { at: Date.now(), rows: result, ok };
    return { rows: result, ok };
  } catch {
    const result = forumCache?.rows || initialForums;
    return { rows: result, ok: forumCache?.ok || false };
  }
}

function clamp(value: number, min = 0, max = 100) { return Math.max(min, Math.min(max, Math.round(value))); }

function eventForDay(day: number): EventTemplate & { eventId: string; day: number } {
  const now = new Date();
  const dailySeed = now.getUTCFullYear() * 372 + now.getUTCMonth() * 31 + now.getUTCDate();
  const index = Math.abs((day * 17 + dailySeed * 13 + Math.floor(day / 3) * 7) % eventPool.length);
  const chosen = eventPool[index];
  return { ...chosen, eventId: String(day) + "-" + chosen.id, day };
}

function activityScore(stats: ForumStat[], state: CountyState) {
  const posts = stats.reduce((sum, row) => sum + (row.posts || 0), 0);
  const postBase = 78 * (posts / (posts + 250));
  return clamp(postBase + state.popularity * 0.12 + Math.min(10, state.activityBonus * 0.5));
}

function publicState(state: CountyState, stats: ForumStat[], online: boolean) {
  const totalPosts = stats.reduce((sum, row) => sum + (row.posts || 0), 0);
  const totalTopics = stats.reduce((sum, row) => sum + (row.topics || 0), 0);
  return {
    state,
    forum: { rows: stats, totalPosts, totalTopics, online },
    activity: activityScore(stats, state),
    event: eventForDay(state.day),
    updatedAt: new Date().toISOString()
  };
}

export async function GET() {
  try {
    const [state, forum] = await Promise.all([readState(), fetchForumStats()]);
    const rows = forum.ok ? forum.rows : (state.lastForumStats || forum.rows);
    return NextResponse.json(publicState(state, rows, forum.ok), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "讀取郡務資料失敗。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const state = await readState();
    const official = String(body.official || "郡長官").slice(0, 40);
    const event = eventForDay(state.day);
    if (String(body.eventId || "") !== event.eventId) {
      const forum = await fetchForumStats();
      return NextResponse.json({ error: "這項事件已更新，請以最新事件再作決定。", latest: publicState(state, forum.rows, forum.ok) }, { status: 409 });
    }
    const choice = event.choices.find((item) => item.id === String(body.choiceId || ""));
    if (!choice) return NextResponse.json({ error: "找不到這個處理方案。" }, { status: 400 });

    const d = choice.delta;
    state.treasury = Math.max(-99, Math.min(9999, state.treasury + (d.treasury || 0)));
    state.popularity = clamp(state.popularity + (d.popularity || 0));
    state.security = clamp(state.security + (d.security || 0));
    state.infrastructure = clamp(state.infrastructure + (d.infrastructure || 0));
    state.trust = clamp(state.trust + (d.trust || 0));
    state.activityBonus = clamp(state.activityBonus + (d.activityBonus || 0), 0, 20);
    state.decisions += 1;
    state.journal = [{ day: state.day, eventTitle: event.title, choiceTitle: choice.title, official, at: new Date().toISOString(), delta: d }, ...state.journal].slice(0, 24);
    state.day += 1;

    const forum = await fetchForumStats();
    if (forum.ok) state.lastForumStats = forum.rows;
    await saveState(state);
    const rows = forum.ok ? forum.rows : (state.lastForumStats || forum.rows);
    return NextResponse.json(publicState(state, rows, forum.ok), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法保存決策，請稍後重試。" }, { status: 503 });
  }
}
