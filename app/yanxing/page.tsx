"use client";

import { useEffect, useMemo, useState } from "react";
import "./county.css";

type ForumStat = { id: string; name: string; topics: number | null; posts: number | null };
type Delta = { treasury?: number; popularity?: number; security?: number; infrastructure?: number; trust?: number; activityBonus?: number };
type Choice = { id: string; title: string; description: string; delta: Delta };
type GameEvent = { id: string; eventId: string; day: number; icon: string; title: string; description: string; choices: Choice[] };
type JournalEntry = { day: number; eventTitle: string; choiceTitle: string; official: string; at: string; delta: Delta };
type CountyState = { day: number; treasury: number; popularity: number; security: number; infrastructure: number; trust: number; activityBonus: number; decisions: number; journal: JournalEntry[]; lastForumStats?: ForumStat[] };
type GameData = { state: CountyState; forum: { rows: ForumStat[]; totalPosts: number; totalTopics: number; online: boolean }; activity: number; event: GameEvent; updatedAt: string };

const metricMeta = [
  { key: "popularity", label: "民心", icon: "♥", tone: "pink" },
  { key: "security", label: "治安", icon: "⚔", tone: "blue" },
  { key: "infrastructure", label: "建設", icon: "⌂", tone: "green" },
  { key: "trust", label: "信任", icon: "✦", tone: "gold" }
] as const;

function fmt(n: number | null) { return n === null ? "—" : n.toLocaleString("zh-TW"); }
function signed(n: number | undefined) { if (!n) return "—"; return (n > 0 ? "+" : "") + n; }

export default function YanxingCountyGame() {
  const [data, setData] = useState<GameData | null>(null);
  const [official, setOfficial] = useState("郡長官");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [tab, setTab] = useState<"town" | "forums" | "records">("town");

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
    const timer = window.setInterval(() => refresh(true), 30000);
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
      setToast("決策已記錄： " + choice.title);
      setTab("town");
    } catch (e) {
      setError(e instanceof Error ? e.message : "決策未能保存");
    } finally {
      setBusy(false);
    }
  }

  const resources = useMemo(() => {
    if (!data) return [];
    return [
      { label: "郡庫", value: data.state.treasury, icon: "◈", unit: "枚", color: "coin" },
      { label: "累計發帖", value: data.forum.totalPosts, icon: "✉", unit: "帖", color: "post" },
      { label: "活躍度", value: data.activity, icon: "✦", unit: "分", color: "activity" }
    ];
  }, [data]);

  if (loading && !data) return <main className="county-shell"><div className="loading-card"><div className="pixel-spinner">✿</div><h1>延興郡物語</h1><p>正在打開郡政府檔案……</p></div></main>;

  if (!data) return <main className="county-shell"><div className="loading-card"><div className="pixel-spinner">!</div><h1>延興郡物語</h1><p>{error || "尚未連接郡務存檔。"}</p><button className="pixel-button" onClick={() => refresh()}>重新連線</button><p className="tiny-note">遊戲進度需要 Vercel Blob 雲端儲存；不會使用瀏覽器 localStorage。</p></div></main>;

  return (
    <main className="county-shell">
      <header className="county-header">
        <div className="brand-lockup">
          <div className="crest">延</div>
          <div><div className="overline">WONGMING EMPIRE · YANXING</div><h1>延興郡物語</h1><p>郡長官的像素治理日誌</p></div>
        </div>
        <div className="official-box"><label htmlFor="official">本次當值官員</label><input id="official" value={official} maxLength={40} onChange={(e) => setOfficial(e.target.value)} /><span>郡務決策將以此名稱記錄</span></div>
      </header>

      <section className="season-banner">
        <div className="season-copy"><span className="season-tag">郡政紀錄　第 {data.state.day} 日</span><h2>{data.state.popularity >= 75 ? "郡民同心，百業漸興！" : data.state.trust < 35 ? "郡府正努力重建信任……" : "今天的延興郡，也要好好經營。"}</h2><p>處理突發事件、鼓勵居民發帖，讓延興郡一天天熱鬧起來。</p></div>
        <div className="weather-stamp"><span>{data.event.icon}</span><small>今日事件</small><b>{data.event.title}</b></div>
        <div className="pixel-skyline" aria-hidden="true"><i className="cloud c1"/><i className="cloud c2"/><div className="sun"/><div className="building b1"><i/><i/><i/><i/></div><div className="building b2"><i/><i/><i/><i/><i/><i/></div><div className="building b3"><i/><i/><i/><i/></div><div className="tree">♣</div><div className="road"/></div>
      </section>

      <section className="resource-row">
        {resources.map((item) => <div className={"resource-card " + item.color} key={item.label}><span className="resource-icon">{item.icon}</span><div><small>{item.label}</small><strong>{fmt(item.value)}<em>{item.unit}</em></strong></div></div>)}
        <div className="resource-card day-card"><span className="resource-icon">▣</span><div><small>已處理事件</small><strong>{fmt(data.state.decisions)}<em>件</em></strong></div></div>
      </section>

      <nav className="game-tabs" aria-label="遊戲面板">
        <button className={tab === "town" ? "active" : ""} onClick={() => setTab("town")}>▦ 郡政中心</button>
        <button className={tab === "forums" ? "active" : ""} onClick={() => setTab("forums")}>✉ 論壇分區</button>
        <button className={tab === "records" ? "active" : ""} onClick={() => setTab("records")}>▤ 郡務日誌</button>
        <span className={"sync-pill " + (data.forum.online ? "online" : "offline")}><i/> {data.forum.online ? "論壇數據已同步" : "論壇連線暫不可用"}</span>
      </nav>

      {error && <div className="notice error-notice"><b>!</b><span>{error}</span><button onClick={() => setError("")}>關閉</button></div>}
      {toast && <div className="notice success-notice"><b>✓</b><span>{toast}</span><button onClick={() => setToast("")}>×</button></div>}

      {tab === "town" && <section className="dashboard-grid">
        <div className="main-column">
          <div className="panel town-panel">
            <div className="panel-heading"><div><span className="mini-label">YOUR DISTRICT</span><h2>延興郡街景</h2></div><span className="pixel-badge">第 {data.state.day} 日</span></div>
            <div className="town-map">
              <div className="map-sky"><span className="map-cloud cloud-a">☁</span><span className="map-cloud cloud-b">☁</span><span className="map-sun">✹</span></div>
              <div className="map-trees trees-left">♣　♣<br/>♣　 ♣</div>
              <div className="map-lawn lawn-top"/>
              <div className="map-road road-horizontal"/><div className="map-road road-vertical"/>
              <div className="plot hall-plot"><div className="pixel-building hall-building"><b>延</b><i/><i/><i/></div><small>郡政府</small></div>
              <div className="plot forum-plot"><div className="pixel-building forum-building"><b>✉</b><i/><i/><i/><i/></div><small>論壇廣場</small></div>
              <div className="plot garden-plot"><div className="pixel-building garden-building"><b>♣</b><i/><i/></div><small>暢揮園</small></div>
              <div className="plot hall2-plot"><div className="pixel-building hall2-building"><b>永</b><i/><i/><i/></div><small>永享堂</small></div>
              <div className="villager v1">●<i/></div><div className="villager v2">●<i/></div><div className="villager v3">●<i/></div>
              <div className="map-caption">延興郡・行政區域示意圖</div>
            </div>
            <div className="map-legend"><span><i className="legend-blue"/>行政設施</span><span><i className="legend-green"/>綠化與公共空間</span><span><i className="legend-orange"/>居民活動區</span></div>
          </div>

          <div className="panel metrics-panel">
            <div className="panel-heading"><div><span className="mini-label">DISTRICT CONDITION</span><h2>郡內狀況</h2></div><span className="subtle">每次決策都會影響數值</span></div>
            <div className="metric-list">
              {metricMeta.map((m) => {
                const val = data.state[m.key];
                const mood = val >= 70 ? "狀態良好" : val >= 40 ? "尚可維持" : "需要優先改善";
                return <div className="metric-line" key={m.key}><div className={"metric-symbol " + m.tone}>{m.icon}</div><div className="metric-info"><div className="metric-name"><b>{m.label}</b><span>{mood}</span></div><div className="meter"><i className={m.tone} style={{ width: val + "%" }}/></div></div><strong className="metric-score">{val}<small>/100</small></strong></div>;
              })}
            </div>
          </div>
        </div>

        <div className="side-column">
          <div className="panel event-panel">
            <div className="event-top"><span className="event-icon">{data.event.icon}</span><div><span className="mini-label">URGENT MATTER</span><h2>郡府突發事件</h2></div></div>
            <h3>{data.event.title}</h3><p className="event-description">{data.event.description}</p>
            <div className="event-rule"><span>⚑</span><p>請選擇一項處理方案。不同方案會改變郡庫與郡民對政府的評價。</p></div>
            <div className="choices">{data.event.choices.map((choice, index) => <button className="choice-card" key={choice.id} disabled={busy} onClick={() => decide(choice)}><span className="choice-number">{String(index + 1).padStart(2, "0")}</span><span className="choice-copy"><b>{choice.title}</b><small>{choice.description}</small><span className="choice-effects">{Object.entries(choice.delta).filter(([, value]) => value !== 0).map(([key, value]) => <em key={key} className={(value || 0) > 0 ? "plus" : "minus"}>{({treasury:"郡庫",popularity:"民心",security:"治安",infrastructure:"建設",trust:"信任",activityBonus:"活躍"})[key]} {signed(value)}</em>)}</span></span><span className="choice-arrow">›</span></button>)}</div>
            <div className="event-foot">{busy ? <><span className="loading-dot"/>正在保存郡務決策…</> : "選擇後將立即更新共用郡務存檔"}</div>
          </div>
          <div className="panel officials-panel"><div className="panel-heading"><div><span className="mini-label">DISTRICT OFFICE</span><h2>官員分工</h2></div><span className="tiny-crest">延</span></div><div className="official-row"><span className="official-avatar blue">令</span><div><b>郡長官</b><small>統籌郡務・事件裁決</small></div><span className="role-current">主理</span></div><div className="official-row"><span className="official-avatar green">財</span><div><b>財政官</b><small>郡庫・預算與補助</small></div><span className="role-tag">財政</span></div><div className="official-row"><span className="official-avatar orange">治</span><div><b>治安官</b><small>巡查・居民安全</small></div><span className="role-tag">治安</span></div><div className="official-row"><span className="official-avatar purple">文</span><div><b>文教官</b><small>文化・論壇活動</small></div><span className="role-tag">文教</span></div><p className="officials-note">目前為角色分工面板；未指定真實官員名單，因此以職務代稱。</p></div>
        </div>
      </section>}

      {tab === "forums" && <section className="panel forum-panel"><div className="panel-heading"><div><span className="mini-label">LIVE FORUM ACTIVITY</span><h2>四大分區・活躍概況</h2></div><div className={"sync-label " + (data.forum.online ? "on" : "off")}>{data.forum.online ? "● 已讀取論壇" : "● 暫用最近可用資料"}</div></div><p className="section-intro">帖數是郡活躍度的主要來源；發帖量愈高，活躍指數的基礎分愈高。郡務事件另可帶來少量活動加成。</p><div className="forum-cards">{data.forum.rows.map((forum, index) => <article className={"forum-card fc-" + index} key={forum.id}><div className="forum-card-top"><span>{["✉","♣","▤","⌂"][index]}</span><small>0{index + 1} / DISTRICT</small></div><h3>{forum.name}</h3><div className="forum-numbers"><div><small>發帖量</small><b>{fmt(forum.posts)}</b></div><div><small>主題數</small><b>{fmt(forum.topics)}</b></div></div><div className="forum-mini-meter"><i style={{ width: Math.min(100, ((forum.posts || 0) / Math.max(1, data.forum.totalPosts)) * 100) + "%" }}/></div><a href={"https://www.wongmingempire.com/bbswm/forum.php?gid=366"} target="_blank" rel="noreferrer">開啟論壇分區 ↗</a></article>)}</div><div className="activity-formula"><b>活躍度計算</b><span>分區累計帖子數（主要權重）＋ 郡民人氣 ＋ 郡務活動加成</span><strong>{data.activity}<small>/100</small></strong></div><p className="data-footnote">論壇網站若暫時拒絕讀取，遊戲會標示連線狀況，不會捏造即時帖數。數據約每 90 秒重新讀取。</p></section>}

      {tab === "records" && <section className="panel records-panel"><div className="panel-heading"><div><span className="mini-label">COUNTY DIARY</span><h2>郡務決策日誌</h2></div><span className="pixel-badge">{data.state.journal.length} 筆紀錄</span></div>{data.state.journal.length === 0 ? <div className="empty-journal"><span>📜</span><h3>郡務簿仍是空白</h3><p>處理今日事件後，決策與影響就會記錄在這裡。</p></div> : <div className="journal-list">{data.state.journal.map((entry, i) => <article className="journal-entry" key={entry.at + "-" + i}><div className="journal-day">第<strong>{entry.day}</strong>日</div><div className="journal-body"><small>{new Date(entry.at).toLocaleString("zh-TW") } · {entry.official}</small><h3>{entry.eventTitle}</h3><p>決策：{entry.choiceTitle}</p><div className="journal-deltas">{Object.entries(entry.delta).filter(([, value]) => value !== 0).map(([key, value]) => <em key={key} className={(value || 0) > 0 ? "plus" : "minus"}>{({treasury:"郡庫",popularity:"民心",security:"治安",infrastructure:"建設",trust:"信任",activityBonus:"活躍"})[key]} {signed(value)}</em>)}</div></div><span className="journal-check">✓</span></article>)}</div>}</section>}

      <footer className="county-footer"><div><span className="footer-crest">延</span><span><b>延興郡物語</b><small>黃名帝國・郡務模擬遊戲</small></span></div><span>雲端共享存檔 · 不使用 localStorage · v1.0</span><button onClick={() => refresh()} title="重新讀取雲端狀態">↻ 更新資料</button></footer>
    </main>
  );
}
