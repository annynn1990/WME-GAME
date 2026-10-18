"use client";

import { useEffect, useState } from "react";
import "./county.css";

type ForumStat = { id: string; name: string; topics: number | null; posts: number | null; lastPostAt: string | null; change24h?: number | null };
type Delta = { treasury?: number; popularity?: number; security?: number; infrastructure?: number; trust?: number; activityBonus?: number };
type Choice = { id: string; title: string; description: string; delta: Delta };
type GameEvent = { id: string; eventId: string; day: number; icon: string; title: string; description: string; choices: Choice[] };
type TrendKey = "surge" | "rising" | "steady" | "falling" | "quiet" | "offline";
type ForumTrend = { key: TrendKey; label: string; description: string; freshness: number; postsPerDay: number | null; change24h: number | null; change6h: number | null; previous6h: number | null };
type JournalEntry = { day: number; eventTitle: string; choiceTitle: string; official: string; at: string; delta: Delta };
type CountyState = { day: number; treasury: number; popularity: number; security: number; infrastructure: number; trust: number; activityBonus: number; decisions: number; journal: JournalEntry[]; lastForumStats?: ForumStat[] };
type GameData = { state: CountyState; forum: { rows: ForumStat[]; totalPosts: number; totalTopics: number; online: boolean; sourceNote: string; trend: ForumTrend }; activity: number; event: GameEvent; updatedAt: string };

const effectNames: Record<string, string> = { treasury: "郡庫", popularity: "民心", security: "治安", infrastructure: "建設", trust: "信任", activityBonus: "活躍" };
const money = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("zh-TW");
const signed = (n: number | null | undefined) => n == null ? "等待累積" : (n > 0 ? "+" : "") + n.toLocaleString("zh-TW");
const timeShort = (value: string | null) => {
  if (!value) return "暫無時間";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "時間不明";
  return date.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
};

export default function YanxingCountyGame() {
  const [data, setData] = useState<GameData | null>(null);
  const [official, setOfficial] = useState("郡長官");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== "https://www.wongmingempire.com") return;
      if (event.data?.type === "WME_MEMBER") {
        const name = String(event.data.username || "").trim();
        if (name) setOfficial(name);
      }
    };
    window.addEventListener("message", receive);
    window.parent?.postMessage({ type: "WME_GAME_READY" }, "https://www.wongmingempire.com");
    return () => window.removeEventListener("message", receive);
  }, []);

  async function refresh(silent = false) {
    try {
      const response = await fetch("/api/county", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "讀取郡務資料失敗");
      setData(result as GameData);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "雲端連線失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => refresh(true), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const update = () => setClock(new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }));
    update();
    const timer = window.setInterval(update, 30000);
    return () => window.clearInterval(timer);
  }, []);

  async function decide(choice: Choice) {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    setToast("");
    try {
      const response = await fetch("/api/county", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: data.event.eventId, choiceId: choice.id, official }),
        cache: "no-store"
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.latest) setData(result.latest as GameData);
        throw new Error(result.error || "決策未能保存");
      }
      setData(result as GameData);
      setToast("已執行：" + choice.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : "決策未能保存");
    } finally {
      setBusy(false);
    }
  }

  const d = data;
  if (loading && !d) return <main className="county-shell compact-shell"><div className="compact-loading">延興郡物語 <span>正在同步論壇……</span></div></main>;
  if (!d) return <main className="county-shell compact-shell"><div className="compact-loading">無法開啟郡務存檔<p>{error}</p><button onClick={() => refresh()}>重試</button></div></main>;

  const trend = d.forum.trend;
  const trendClass = trend.key === "surge" || trend.key === "rising" ? "up" : trend.key === "falling" || trend.key === "quiet" ? "down" : trend.key === "offline" ? "offline" : "steady";

  return <main className="county-shell compact-shell">
    <header className="compact-header">
      <div className="compact-brand"><span className="tiny-seal">延</span><div><h1>延興郡物語</h1><p>論壇活躍 × 郡務經營</p></div></div>
      <div className="compact-header-right"><label htmlFor="official">當值</label><input id="official" value={official} maxLength={40} onChange={(e) => setOfficial(e.target.value)} /><span>第 {d.state.day} 日</span></div>
    </header>

    <section className="live-strip">
      <div className="live-title"><span className={d.forum.online ? "live-dot" : "live-dot off"}/><b>{d.forum.online ? "論壇連動中" : "論壇資料暫離線"}</b><small>{clock} 更新</small></div>
      <span className={"trend-chip " + trendClass}>{trend.key === "surge" ? "↗" : trend.key === "rising" ? "↑" : trend.key === "falling" || trend.key === "quiet" ? "↓" : trend.key === "offline" ? "!" : "＝"} {trend.label}</span>
      <p>{trend.description}</p>
    </section>

    <section className="compact-stats">
      <div className="hero-stat"><small>論壇活躍度</small><strong>{d.activity}<em>/100</em></strong><div className="activity-track"><i style={{ width: d.activity + "%" }}/></div><span>{trend.postsPerDay == null ? "累積趨勢樣本中" : "推算 " + money(Math.round(trend.postsPerDay)) + " 帖／日"}</span></div>
      <div className="mini-stat"><small>四區總帖數</small><strong>{money(d.forum.totalPosts)}</strong><span>總主題 {money(d.forum.totalTopics)}</span></div>
      <div className="mini-stat"><small>近 24 小時新增</small><strong className={trend.change24h != null && trend.change24h > 0 ? "good-number" : ""}>{signed(trend.change24h)}</strong><span>有足夠歷史樣本後顯示</span></div>
      <div className="mini-stat"><small>郡庫</small><strong>{money(d.state.treasury)}<em>枚</em></strong><span>已處理 {d.state.decisions} 件事件</span></div>
    </section>

    <section className="compact-columns">
      <div className="compact-main">
        <section className="compact-panel">
          <div className="compact-section-head"><h2>分區現況</h2><a href="https://www.wongmingempire.com/bbswm/forum.php?gid=366" target="_blank" rel="noreferrer">開啟論壇 ↗</a></div>
          <div className="district-list">{d.forum.rows.map((row, index) => {
            const bars = row.posts != null && d.forum.totalPosts ? Math.max(3, Math.round(row.posts / d.forum.totalPosts * 100)) : 3;
            return <div className="district-line" key={row.id}><span className={"district-index i" + index}>{["廣","園","堂","府"][index]}</span><div className="district-middle"><b>{row.name}</b><div className="district-bar"><i style={{ width: bars + "%" }}/></div><small>最後發帖 {timeShort(row.lastPostAt)}</small></div><div className="district-numbers"><b>{money(row.posts)}</b><small>{row.change24h == null ? "24h —" : "24h " + signed(row.change24h)}</small></div></div>;
          })}</div>
          <div className="compact-data-note">{d.forum.sourceNote} · 頁面每分鐘更新；趨勢由雲端歷史快照比對。</div>
        </section>

        <section className="compact-panel condition-panel">
          <div className="compact-section-head"><h2>郡政指標</h2><span>選擇事件會改變數值</span></div>
          <div className="condition-grid">{([{name:"民心",val:d.state.popularity},{name:"治安",val:d.state.security},{name:"建設",val:d.state.infrastructure},{name:"信任",val:d.state.trust}] as const).map((item) => <div className="condition-item" key={item.name}><div><b>{item.name}</b><strong>{item.val}</strong></div><div className="condition-track"><i style={{ width: item.val + "%" }}/></div></div>)}</div>
        </section>
      </div>

      <section className="compact-panel decision-panel">
        <div className="decision-heading"><span className="decision-icon">{d.event.icon}</span><div><small>郡長官待處理</small><h2>{d.event.title}</h2></div></div>
        <p className="decision-description">{d.event.description}</p>
        <div className="decision-options">{d.event.choices.map((choice, index) => <button className="decision-option" key={choice.id} disabled={busy} onClick={() => decide(choice)}><span className="option-n">{index + 1}</span><span className="option-main"><b>{choice.title}</b><small>{choice.description}</small><span className="option-effects">{Object.entries(choice.delta).filter(([, value]) => value).map(([key, value]) => <em className={(value || 0) > 0 ? "effect-plus" : "effect-minus"} key={key}>{effectNames[key]} {signed(value)}</em>)}</span></span><span className="option-go">›</span></button>)}</div>
        <div className="decision-footer">{busy ? "雲端保存中……" : "決策會即時同步給所有玩家"}{toast && <span className="success-inline">{toast}</span>}</div>
      </section>
    </section>

    {error && <div className="compact-error"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
    <footer className="compact-footer"><span>延興郡政府・像素郡務模擬</span><button onClick={() => setShowLog(!showLog)}>{showLog ? "收起紀錄" : "郡務紀錄 (" + d.state.journal.length + ")"}</button><button onClick={() => refresh()}>↻ 同步</button></footer>
    {showLog && <section className="compact-panel log-panel">{d.state.journal.length === 0 ? <p>目前沒有決策紀錄。</p> : d.state.journal.map((entry, i) => <div className="log-line" key={entry.at + i}><b>第 {entry.day} 日 · {entry.eventTitle}</b><span>{entry.choiceTitle}／{entry.official}／{timeShort(entry.at)}</span></div>)}</section>}
  </main>;
}
