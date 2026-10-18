"use client";

import { useCallback, useEffect, useState } from "react";
import "./county.css";

type ForumStat = {
  id: string; name: string; fid: number; topics: number | null; posts: number | null;
  lastPostAt: string | null; lastPostBy: string | null; change24h?: number | null;
};
type TrendKey = "surge" | "rising" | "steady" | "falling" | "quiet" | "offline";
type ForumTrend = { key: TrendKey; label: string; description: string; freshness: number; postsPerDay: number | null; change24h: number | null; change6h: number | null; previous6h: number | null };
type Verification = {
  status: "verified" | "waiting" | "wrong-user" | "offline" | "unreadable";
  message: string; verifiedThisRequest: boolean; lastActionAt: string | null;
  lastActionName: string | null; lastActionArea: string | null; totalVerifiedActions: number;
  hoursSinceLastAction: number | null;
};
type JournalEntry = { day: number; eventTitle: string; choiceTitle: string; official: string; at: string; delta: { popularity?: number; trust?: number; activityBonus?: number } };
type CountyState = { day: number; treasury: number; popularity: number; security: number; infrastructure: number; trust: number; activityBonus: number; decisions: number; journal: JournalEntry[] };
type GameData = {
  state: CountyState;
  forum: { rows: ForumStat[]; totalPosts: number; totalTopics: number; online: boolean; sourceNote: string; trend: ForumTrend };
  activity: number;
  trend: ForumTrend;
  dutyTask: { title: string; description: string; recommendedBoardId: number };
  verification: Verification;
  updatedAt: string;
};

const money = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("zh-TW");
const shortTime = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
};
const boardUrl = (fid: number) => "https://www.wongmingempire.com/bbswm/forum.php?mod=post&action=newthread&fid=" + fid;
const boardsFallback: ForumStat[] = [
  { id: "square", name: "延興廣場", fid: 53, topics: null, posts: null, lastPostAt: null, lastPostBy: null },
  { id: "garden", name: "暢揮園", fid: 56, topics: null, posts: null, lastPostAt: null, lastPostBy: null },
  { id: "hall", name: "永享堂", fid: 55, topics: null, posts: null, lastPostAt: null, lastPostBy: null },
  { id: "government", name: "延興郡政府", fid: 367, topics: null, posts: null, lastPostAt: null, lastPostBy: null }
];

export default function YanxingCountyGame() {
  const [data, setData] = useState<GameData | null>(null);
  const [official, setOfficial] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [clock, setClock] = useState("");

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setSyncing(true);
    try {
      const name = official.trim();
      const url = "/api/county" + (name ? "?official=" + encodeURIComponent(name) : "");
      const response = await fetch(url, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "讀取郡務資料失敗");
      setData(result as GameData);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "雲端連線失敗");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [official]);

  useEffect(() => {
    const savedName = document.querySelector<HTMLElement>("[data-wme-member]");
    if (savedName?.dataset.wmeMember) setOfficial(savedName.dataset.wmeMember);
    const receive = (event: MessageEvent) => {
      if (event.origin !== "https://www.wongmingempire.com") return;
      if (event.data?.type === "WME_MEMBER" && String(event.data.username || "").trim()) {
        setOfficial(String(event.data.username).trim().slice(0, 40));
      }
    };
    window.addEventListener("message", receive);
    window.parent?.postMessage({ type: "WME_GAME_READY" }, "https://www.wongmingempire.com");
    return () => window.removeEventListener("message", receive);
  }, []);

  useEffect(() => {
    void refresh(true);
    const timer = window.setInterval(() => void refresh(true), 60000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const update = () => setClock(new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }));
    update();
    const timer = window.setInterval(update, 30000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading && !data) return <main className="county-shell forum-shell"><div className="forum-loading">延興郡政府　正在讀取論壇數據……</div></main>;
  if (!data) return <main className="county-shell forum-shell"><div className="forum-loading">暫時無法讀取郡務資料<p>{error}</p><button className="forum-button" onClick={() => void refresh()}>重新讀取</button></div></main>;

  const rows = data.forum.rows?.length ? data.forum.rows : boardsFallback;
  const trendClass = data.trend.key === "surge" || data.trend.key === "rising" ? "trend-up" :
    data.trend.key === "falling" || data.trend.key === "quiet" ? "trend-down" : data.trend.key === "offline" ? "trend-offline" : "trend-normal";
  const statusText: Record<Verification["status"], string> = {
    verified: data.verification.verifiedThisRequest ? "已驗證新帖" : "最近一次行動已驗證",
    waiting: "等待實際發帖",
    "wrong-user": "發帖者不符",
    offline: "論壇離線，暫停驗收",
    unreadable: "暫時無法辨認發帖者"
  };
  const progress = (n: number) => Math.max(0, Math.min(100, n));

  return <main className="county-shell forum-shell">
    <header className="forum-header">
      <div className="forum-logo">延</div>
      <div className="forum-title"><h1>延興郡政府</h1><p>郡務活動・論壇實績監察</p></div>
      <div className="forum-header-right"><span>黃名帝國　›　延興郡</span><b>第 {data.state.day} 日</b></div>
    </header>

    <div className="forum-tabs"><span className="tab-active">郡務總覽</span><a href="https://www.wongmingempire.com/bbswm/forum.php?gid=366" target="_blank" rel="noreferrer">延興郡論壇 ↗</a><span className="tab-state">{data.forum.online ? "● 即時同步" : "● 使用舊資料"}</span></div>

    <section className="forum-overview">
      <div className="overview-main">
        <div className="forum-breadcrumb">郡政府公告　›　活動與民心監察</div>
        <h2>郡內活動概況</h2>
        <p className="trend-description">{data.trend.description}</p>
        <div className="activity-score-row"><div><small>論壇活躍度</small><strong>{data.activity}<em>/100</em></strong></div><div className="score-bar"><i style={{ width: progress(data.activity) + "%" }}/></div><span className={"trend-label " + trendClass}>{data.trend.label}</span></div>
      </div>
      <div className="overview-numbers">
        <div><small>四區累計帖子</small><strong>{money(data.forum.totalPosts)}</strong></div>
        <div><small>24 小時帖子變化</small><strong className={data.trend.change24h != null && data.trend.change24h > 0 ? "number-up" : ""}>{data.trend.change24h == null ? "樣本不足" : (data.trend.change24h > 0 ? "+" : "") + money(data.trend.change24h)}</strong></div>
        <div><small>最近推算發帖速度</small><strong>{data.trend.postsPerDay == null ? "收集中" : money(Math.round(data.trend.postsPerDay)) + " 帖/日"}</strong></div>
      </div>
    </section>

    <section className="forum-columns">
      <div className="forum-left">
        <section className="forum-module">
          <div className="module-heading"><h2>各版面實況</h2><span>按最新可取得數據排列</span></div>
          <div className="board-table">
            <div className="board-table-head"><span>版面</span><span>帖子 / 主題</span><span>最後發帖</span><span>新增（24h）</span><span>操作</span></div>
            {rows.map((row) => <div className="board-table-row" key={row.id}>
              <div className="board-name"><span className="board-folder">▰</span><span><b>{row.name}</b><small>fid={row.fid}</small></span></div>
              <div className="board-count"><b>{money(row.posts)}</b><small>{money(row.topics)} 主題</small></div>
              <div className="board-last"><b>{row.lastPostBy || "—"}</b><small>{shortTime(row.lastPostAt)}</small></div>
              <div className={"board-change " + (row.change24h != null && row.change24h > 0 ? "number-up" : "")}>{row.change24h == null ? "—" : (row.change24h > 0 ? "+" : "") + money(row.change24h)}</div>
              <div><a className="board-link" href={boardUrl(row.fid)} target="_blank" rel="noreferrer">前往發帖</a></div>
            </div>)}
          </div>
          <div className="module-footnote">資料來源：{data.forum.sourceNote}。首次建立基準後，系統才可比較帖子增量。</div>
        </section>

        <section className="forum-module county-indicators">
          <div className="module-heading"><h2>郡政指標</h2><span>無實際發帖則逐日衰退</span></div>
          <div className="county-indicator-grid">
            {([{ name: "民心", value: data.state.popularity, note: "每 24 小時無行動 −4" }, { name: "信任", value: data.state.trust, note: "每 24 小時無行動 −3" }, { name: "活動加成", value: data.state.activityBonus, note: "無行動逐日減少", max: 20 }, { name: "郡庫", value: data.state.treasury, note: "可用於後續郡務" }] as const).map((metric) =>
              <div className="county-indicator" key={metric.name}><div><b>{metric.name}</b><strong>{money(metric.value)}{metric.max ? <small>/{metric.max}</small> : ""}</strong></div>
                {metric.max ? <div className="indicator-bar"><i style={{ width: progress(metric.value / metric.max * 100) + "%" }}/></div> : metric.value >= 0 ? <div className="indicator-bar"><i style={{ width: progress(metric.value / (metric.name === "郡庫" ? 300 : 100) * 100) + "%" }}/></div> : null}
                <small>{metric.note}</small></div>
            )}
          </div>
        </section>
      </div>

      <div className="forum-right">
        <section className="forum-module duty-module">
          <div className="module-heading"><h2>郡長官當值紀錄</h2><span>真人行動驗收</span></div>
          <div className="duty-summary"><div className="duty-stamp">公務</div><div><b>{data.dutyTask.title}</b><p>{data.dutyTask.description}</p></div></div>
          <div className="official-input"><label htmlFor="official">當值官員論壇用戶名稱</label><div><input id="official" value={official} onChange={(e) => setOfficial(e.target.value)} maxLength={40} placeholder="請輸入與論壇完全相同的名稱"/><button className="forum-button" disabled={syncing} onClick={() => void refresh()}>{syncing ? "核對中…" : "核對新帖"}</button></div><small>若論壇模板未傳入會員名稱，請手動填寫。名稱必須與最後發帖者一致。</small></div>
          <div className={"verification-box verify-" + data.verification.status}><div className="verify-heading"><b>{statusText[data.verification.status]}</b><span>{data.verification.totalVerifiedActions} 次已核實行動</span></div><p>{data.verification.message}</p>
            {data.verification.lastActionAt && <small>上次核實：{shortTime(data.verification.lastActionAt)} · {data.verification.lastActionArea || "郡內版面"}</small>}
          </div>
          <div className="duty-steps"><b>完成當值的方式</b><ol><li>點選左側版面的「前往發帖」。</li><li>在黃名帝國論壇真正發布新主題。</li><li>返回本頁按「核對新帖」；只有版面帖數增加、最後發帖者與名稱相符，才會增加民心與信任。</li></ol></div>
        </section>
        <section className="forum-module">
          <div className="module-heading"><h2>郡務日誌</h2><button className="text-button" onClick={() => setShowLog(!showLog)}>{showLog ? "收起" : "查看全部"}</button></div>
          {!showLog && <div className="journal-preview">{data.state.journal.slice(0, 3).map((item, index) => <div className="journal-row" key={item.at + index}><span className="journal-bullet">{item.delta.popularity && item.delta.popularity > 0 ? "＋" : item.delta.popularity && item.delta.popularity < 0 ? "−" : "·"}</span><span><b>{item.eventTitle}</b><small>{item.choiceTitle}</small></span><time>{shortTime(item.at)}</time></div>)}{data.state.journal.length === 0 && <p className="empty-log">目前尚未有郡務紀錄。</p>}</div>}
          {showLog && <div className="journal-preview">{data.state.journal.map((item, index) => <div className="journal-row" key={item.at + index}><span className="journal-bullet">{item.delta.popularity && item.delta.popularity > 0 ? "＋" : item.delta.popularity && item.delta.popularity < 0 ? "−" : "·"}</span><span><b>{item.eventTitle}</b><small>{item.choiceTitle} · {item.official}</small></span><time>{shortTime(item.at)}</time></div>)}</div>}
        </section>
      </div>
    </section>

    {error && <div className="forum-error">{error}<button onClick={() => setError("")}>關閉</button></div>}
    <footer className="forum-footer"><span>黃名帝國・延興郡政府</span><span>雲端共享郡務存檔　|　{data.forum.online ? "論壇同步正常" : "論壇同步待恢復"}</span><span>最後檢查 {clock || shortTime(data.updatedAt)}</span></footer>
  </main>;
}
