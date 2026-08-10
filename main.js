:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #f8f8fb;
  background: #0b0c10;
  font-synthesis: none;
  --panel: rgba(23, 24, 31, 0.88);
  --panel-2: rgba(31, 32, 42, 0.9);
  --line: rgba(255,255,255,.09);
  --muted: #9ea0ad;
  --accent: #ff395f;
  --accent-2: #9b5cff;
}
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; min-height: 100vh; background:
  radial-gradient(circle at 10% 0%, rgba(155,92,255,.22), transparent 30%),
  radial-gradient(circle at 90% 0%, rgba(255,57,95,.18), transparent 28%),
  #0b0c10; }
button, input { font: inherit; }
button { color: inherit; }
.shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 42px; }
.topbar { display:flex; align-items:center; justify-content:space-between; gap:16px; padding-bottom: 28px; }
.brand { display:flex; align-items:center; gap:12px; }
.brand-mark { width:42px; height:42px; border-radius:14px; display:grid; place-items:center; font-size:22px; font-weight:900; background:linear-gradient(135deg,var(--accent),var(--accent-2)); box-shadow:0 10px 30px rgba(155,92,255,.22); }
.brand strong { display:block; letter-spacing:.12em; }
.brand span { color:var(--muted); font-size:12px; }
.user-chip { display:flex; align-items:center; gap:8px; border:1px solid var(--line); background:rgba(255,255,255,.04); padding:6px 10px 6px 6px; border-radius:999px; font-size:13px; }
.user-chip img,.avatar-fallback { width:28px; height:28px; border-radius:50%; object-fit:cover; background:#2c2d36; display:grid; place-items:center; }
.hero { padding: 34px 0 24px; max-width: 860px; }
.eyebrow { color:#ff6a86; font-weight:800; letter-spacing:.16em; font-size:11px; }
.hero h1 { font-size:clamp(36px,7vw,72px); line-height:.98; margin:10px 0 12px; letter-spacing:-.055em; }
.hero p { margin:0 0 22px; color:var(--muted); font-size:15px; }
.searchbox { height:62px; display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:12px; padding:0 18px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.075); border-radius:18px; backdrop-filter:blur(12px); box-shadow:0 20px 50px rgba(0,0,0,.18); }
.searchbox > span { font-size:28px; color:#d5d5dc; transform:translateY(-2px); }
.searchbox input { width:100%; border:0; outline:0; color:white; background:transparent; font-size:17px; }
.searchbox input::placeholder { color:#777986; }
kbd { color:#777986; border:1px solid var(--line); padding:4px 7px; border-radius:7px; font-size:10px; }
.chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
.chip { border:1px solid var(--line); background:rgba(255,255,255,.04); border-radius:999px; padding:8px 12px; cursor:pointer; color:#c9cad2; font-size:12px; transition:.18s ease; }
.chip:hover { background:rgba(255,255,255,.1); color:white; transform:translateY(-1px); }
.status { min-height:38px; display:inline-flex; align-items:center; border-radius:10px; padding:8px 12px; margin:2px 0 14px; font-size:12px; color:var(--muted); background:rgba(255,255,255,.04); }
.status[data-type="ok"] { color:#83e6b2; }
.status[data-type="error"] { color:#ff8299; }
.status[data-type="warn"] { color:#ffd27d; }
.status[data-type="loading"] { color:#d7c8ff; }
.content-grid { display:grid; grid-template-columns:minmax(0,1.45fr) minmax(300px,.75fr); gap:16px; align-items:start; }
.results-panel,.now-panel { border:1px solid var(--line); background:var(--panel); border-radius:22px; backdrop-filter:blur(18px); overflow:hidden; }
.results-panel { padding:18px; }
.section-title { display:flex; justify-content:space-between; align-items:end; margin-bottom:12px; }
.section-title span { font-size:14px; font-weight:800; }
.section-title small { color:var(--muted); }
.results { display:grid; gap:8px; }
.track { width:100%; border:1px solid transparent; background:rgba(255,255,255,.035); padding:10px; border-radius:14px; display:grid; grid-template-columns:48px minmax(0,1fr) auto auto; gap:12px; align-items:center; text-align:left; cursor:pointer; transition:.18s ease; }
.track:hover { background:rgba(255,255,255,.075); }
.track.selected { border-color:rgba(255,74,111,.48); background:linear-gradient(90deg,rgba(255,57,95,.10),rgba(155,92,255,.06)); }
.cover,.big-cover { display:grid; place-items:center; background:linear-gradient(135deg,#272932,#15161b); border:1px solid var(--line); color:#777a87; }
.cover { width:48px; height:48px; border-radius:11px; font-size:20px; }
.track-main { min-width:0; }
.track-main strong,.track-main > span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.track-main strong { font-size:13px; }
.track-main > span { color:var(--muted); font-size:12px; margin-top:2px; }
.badges { display:flex; flex-wrap:wrap; gap:5px; margin-top:7px; }
.badges em { font-style:normal; font-size:9px; color:#cbbdff; background:rgba(155,92,255,.12); padding:3px 6px; border-radius:999px; }
.badges em.muted { color:#858793; background:rgba(255,255,255,.04); }
.duration { color:var(--muted); font-size:11px; }
.arrow { font-size:24px; color:#696b76; }
.empty { min-height:310px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; color:var(--muted); padding:30px; }
.empty-icon { width:66px; height:66px; border-radius:22px; display:grid; place-items:center; background:rgba(255,255,255,.05); font-size:28px; color:#646672; margin-bottom:14px; }
.empty strong { color:#e8e8ed; margin-bottom:5px; }
.empty span { font-size:12px; max-width:360px; }
.now-panel { padding:20px; position:sticky; top:16px; min-height:380px; }
.vinyl { width:120px; height:120px; margin:22px auto; border-radius:50%; display:grid; place-items:center; background:radial-gradient(circle,#17181e 0 14%,#3c3d46 15% 17%,#15161a 18% 33%,#292a31 34% 36%,#111217 37%); color:#8c8f9d; font-size:26px; }
.now-panel > h2,.now-panel > p { text-align:center; }
.now-panel > h2 { margin:8px 0; }
.now-panel > p { color:var(--muted); font-size:13px; }
.selected-head { display:flex; gap:14px; align-items:center; }
.big-cover { width:72px; height:72px; flex:none; border-radius:18px; font-size:27px; }
.selected-head h2 { margin:5px 0 3px; font-size:19px; line-height:1.1; }
.selected-head p { margin:0; color:var(--muted); font-size:12px; }
.lyrics-preview { margin:22px 0; padding:18px 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line); text-align:center; display:grid; gap:8px; }
.lyric-line { color:#838590; font-size:12px; }
.lyric-line.active { color:white; font-size:15px; font-weight:800; }
.muted-line { color:#676975; }
.voice-card { display:flex; align-items:center; justify-content:space-between; gap:10px; background:rgba(255,255,255,.04); border-radius:14px; padding:12px; }
.voice-card strong,.voice-card span { display:block; }
.voice-card strong { font-size:12px; }
.voice-card span { color:var(--muted); font-size:10px; margin-top:2px; }
.primary,.secondary { border:0; border-radius:10px; padding:9px 11px; cursor:pointer; font-weight:700; font-size:11px; white-space:nowrap; }
.primary { background:white; color:#101116; }
.secondary { background:rgba(255,255,255,.08); }
.sing-button { width:100%; margin-top:12px; border:0; border-radius:14px; min-height:60px; background:linear-gradient(135deg,var(--accent),var(--accent-2)); display:grid; grid-template-columns:auto 1fr; grid-template-rows:auto auto; column-gap:9px; justify-content:center; align-items:center; padding:10px 20px; font-weight:900; opacity:.42; cursor:not-allowed; }
.sing-button > span { grid-row:1 / 3; font-size:16px; }
.sing-button small { font-weight:500; opacity:.8; font-size:9px; }
.boot,.fatal { min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:30px; }
.boot span,.fatal p,.fatal-help { color:var(--muted); }
.spinner { width:44px; height:44px; border-radius:50%; border:3px solid rgba(255,255,255,.08); border-top-color:#b596ff; animation:spin .8s linear infinite; margin-bottom:16px; }
@keyframes spin { to { transform:rotate(360deg); } }
.fatal-icon { width:58px; height:58px; border-radius:18px; display:grid; place-items:center; background:rgba(255,57,95,.14); color:#ff718d; font-size:26px; font-weight:900; }
.fatal h1 { margin:16px 0 8px; font-size:24px; }
.fatal p { margin:0; font-family:ui-monospace,monospace; }
.fatal-help { margin-top:18px; max-width:520px; font-size:12px; }
@media (max-width: 820px) {
  .content-grid { grid-template-columns:1fr; }
  .now-panel { position:static; }
  .shell { width:min(100% - 20px,1180px); padding-top:12px; }
  .hero { padding-top:20px; }
  kbd { display:none; }
  .searchbox { grid-template-columns:auto 1fr; }
}
@media (max-width: 520px) {
  .brand span,.user-chip span,.duration { display:none; }
  .hero h1 { font-size:44px; }
  .track { grid-template-columns:44px minmax(0,1fr) auto; }
  .track .cover { width:44px; height:44px; }
  .arrow { display:none; }
}

/* --- Karaoke player v0.2 --- */
.sing-button.ready { opacity:1; cursor:pointer; transition:transform .18s ease, filter .18s ease; }
.sing-button.ready:hover { transform:translateY(-1px); filter:brightness(1.08); }
.sing-button:disabled { cursor:wait; }
.loading-button { grid-template-columns:auto 1fr; }
.tiny-spinner { width:15px; height:15px; border-radius:50%; border:2px solid rgba(255,255,255,.3); border-top-color:white; animation:spin .75s linear infinite; grid-row:1 / 3; }

.karaoke-shell { min-height:100vh; width:min(1180px,calc(100% - 32px)); margin:0 auto; padding:20px 0 36px; display:flex; flex-direction:column; }
.karaoke-topbar { height:54px; display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:16px; }
.ghost-button { justify-self:start; border:1px solid var(--line); background:rgba(255,255,255,.05); color:#d9dae1; border-radius:11px; padding:9px 12px; cursor:pointer; }
.karaoke-title-mini { text-align:center; min-width:0; }
.karaoke-title-mini strong,.karaoke-title-mini span { display:block; max-width:420px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.karaoke-title-mini strong { font-size:12px; }
.karaoke-title-mini span { color:var(--muted); font-size:10px; margin-top:2px; }
.live-pill { justify-self:end; display:flex; align-items:center; gap:7px; padding:7px 10px; border:1px solid rgba(255,57,95,.28); background:rgba(255,57,95,.08); color:#ff7993; border-radius:999px; font-size:10px; font-weight:900; letter-spacing:.08em; }
.live-pill i { width:7px; height:7px; border-radius:50%; background:#ff496c; box-shadow:0 0 0 4px rgba(255,73,108,.11); }
.karaoke-stage { flex:1; min-height:620px; margin-top:14px; border:1px solid var(--line); border-radius:28px; overflow:hidden; position:relative; background:linear-gradient(180deg,rgba(28,27,38,.9),rgba(11,12,16,.96)); display:flex; flex-direction:column; align-items:center; padding:48px clamp(18px,5vw,64px) 24px; box-shadow:0 30px 80px rgba(0,0,0,.28); }
.stage-glow { pointer-events:none; position:absolute; inset:-30% 10% auto; height:430px; background:radial-gradient(ellipse,rgba(155,92,255,.24),rgba(255,57,95,.12) 38%,transparent 70%); filter:blur(25px); }
.stage-meta { position:relative; text-align:center; z-index:1; }
.stage-meta h1 { margin:8px 0 4px; font-size:clamp(26px,4vw,46px); line-height:1; letter-spacing:-.04em; }
.stage-meta p { margin:0; color:var(--muted); }
.lyrics-stage { position:relative; z-index:1; width:min(900px,100%); flex:1; min-height:300px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:22px; padding:36px 0; }
.stage-lyric { width:100%; transition:opacity .18s ease, transform .18s ease; text-wrap:balance; }
.stage-lyric.previous,.stage-lyric.next { color:#777986; font-size:clamp(14px,2vw,21px); opacity:.68; }
.stage-lyric.current { color:#fff; font-size:clamp(27px,5vw,54px); font-weight:900; line-height:1.08; letter-spacing:-.035em; text-shadow:0 8px 35px rgba(155,92,255,.22); }
.lyrics-stage.no-sync .stage-lyric.current { font-size:clamp(23px,4vw,42px); }
.player-block { position:relative; z-index:1; width:min(820px,100%); }
.time-row { display:flex; justify-content:space-between; color:#989aa5; font-size:11px; font-variant-numeric:tabular-nums; margin-bottom:8px; }
.progress-track { width:100%; height:7px; border-radius:999px; background:rgba(255,255,255,.08); overflow:hidden; box-shadow:inset 0 1px 2px rgba(0,0,0,.35); }
.progress-bar { width:0; height:100%; border-radius:inherit; background:linear-gradient(90deg,var(--accent),var(--accent-2)); transition:width .1s linear; }
.player-controls { display:flex; justify-content:center; gap:9px; margin-top:16px; }
.control-button { min-width:126px; border:1px solid var(--line); background:rgba(255,255,255,.08); color:white; border-radius:12px; padding:11px 14px; cursor:pointer; font-weight:800; font-size:12px; }
.control-button:hover { background:rgba(255,255,255,.12); }
.control-button:disabled { opacity:.4; cursor:not-allowed; }
.control-button.danger { color:#ff8ba1; background:rgba(255,57,95,.08); border-color:rgba(255,57,95,.18); }
.source-row { position:relative; z-index:1; width:100%; display:flex; justify-content:space-between; gap:15px; padding-top:22px; margin-top:22px; border-top:1px solid var(--line); color:#777986; font-size:10px; }
.source-row span:last-child { text-align:right; max-width:55%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

@media (max-width: 700px) {
  .karaoke-shell { width:min(100% - 16px,1180px); padding-top:8px; }
  .karaoke-topbar { grid-template-columns:auto 1fr auto; }
  .karaoke-title-mini span { display:none; }
  .live-pill { font-size:0; padding:8px; }
  .karaoke-stage { min-height:calc(100vh - 80px); margin-top:8px; border-radius:20px; padding:30px 16px 18px; }
  .lyrics-stage { min-height:280px; gap:16px; }
  .source-row { flex-direction:column; text-align:center; }
  .source-row span:last-child { max-width:100%; text-align:center; }
}

/* --- Karaoke QOL v0.3 --- */
.countdown-overlay { position:absolute; inset:0; z-index:20; display:grid; place-items:center; align-content:center; gap:8px; background:rgba(8,9,13,.78); backdrop-filter:blur(16px); transition:opacity .18s ease, visibility .18s ease; }
.countdown-overlay.hidden { opacity:0; visibility:hidden; pointer-events:none; }
.countdown-overlay span { font-size:12px; letter-spacing:.22em; font-weight:900; color:#c9cad2; }
.countdown-overlay strong { font-size:clamp(92px,20vw,190px); line-height:.85; letter-spacing:-.07em; text-shadow:0 15px 55px rgba(155,92,255,.45); animation:countPulse .8s ease-in-out infinite alternate; }
@keyframes countPulse { from { transform:scale(.92); opacity:.78; } to { transform:scale(1); opacity:1; } }

.lyrics-stage.synced { padding:18px 0; min-height:320px; }
.lyrics-viewport { width:100%; height:340px; overflow:hidden; position:relative; scroll-behavior:smooth; mask-image:linear-gradient(to bottom,transparent 0,#000 17%,#000 83%,transparent 100%); }
.lyrics-rail { padding:145px 0; }
.rolling-lyric { width:100%; padding:10px 12px; color:#777986; opacity:.36; font-size:clamp(14px,2vw,21px); font-weight:700; line-height:1.2; transform:scale(.96); transition:color .45s ease,opacity .45s ease,transform .45s cubic-bezier(.2,.8,.2,1),font-size .45s ease; text-wrap:balance; }
.rolling-lyric.passed { opacity:.22; }
.rolling-lyric.upcoming { opacity:.48; }
.rolling-lyric.active { color:#fff; opacity:1; transform:scale(1); font-size:clamp(28px,5vw,54px); font-weight:900; letter-spacing:-.035em; text-shadow:0 8px 35px rgba(155,92,255,.25); }

.lyrics-stage.no-sync { width:min(900px,100%); min-height:320px; padding:18px 0; }
.manual-lyrics-wrap { width:100%; }
.manual-hint { margin-bottom:12px; color:#858794; font-size:10px; font-weight:900; letter-spacing:.13em; }
.manual-lyrics { width:100%; height:320px; overflow-y:auto; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.24) transparent; padding:42px clamp(8px,3vw,28px); border:1px solid rgba(255,255,255,.07); background:rgba(255,255,255,.025); border-radius:18px; text-align:center; scroll-behavior:smooth; }
.manual-lyrics div { margin:0 0 18px; color:#e5e5eb; font-size:clamp(18px,3vw,31px); line-height:1.25; font-weight:750; text-wrap:balance; }
.manual-lyrics div:last-child { margin-bottom:70px; }
.manual-lyrics.empty-manual { display:grid; place-items:center; align-content:center; gap:8px; color:var(--muted); }
.manual-lyrics.empty-manual strong { color:white; font-size:22px; }

.live-score-row { position:relative; z-index:2; width:min(760px,100%); display:grid; grid-template-columns:1fr 1.3fr 1fr; gap:8px; margin:0 0 18px; }
.live-score-card { border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.035); border-radius:13px; padding:9px 12px; text-align:center; }
.live-score-card span { display:block; color:#777986; font-size:9px; font-weight:900; letter-spacing:.12em; }
.live-score-card strong { display:block; margin-top:4px; font-size:16px; }
.verdict-card strong[data-verdict="PERFECT"] { color:#82ffd0; }
.verdict-card strong[data-verdict="GREAT"] { color:#a6c8ff; }
.verdict-card strong[data-verdict="GOOD"] { color:#ffe18a; }
.verdict-card strong[data-verdict="MISS"] { color:#ff7993; }

.result-shell { min-height:100vh; display:grid; place-items:center; width:min(980px,calc(100% - 28px)); margin:0 auto; padding:28px 0; }
.result-card { width:min(780px,100%); position:relative; overflow:hidden; border:1px solid var(--line); background:linear-gradient(180deg,rgba(28,27,38,.95),rgba(11,12,16,.98)); border-radius:28px; padding:36px clamp(20px,6vw,64px); text-align:center; box-shadow:0 30px 90px rgba(0,0,0,.34); }
.result-card::before { content:""; position:absolute; inset:-180px 10% auto; height:340px; background:radial-gradient(ellipse,rgba(155,92,255,.28),rgba(255,57,95,.12) 42%,transparent 72%); filter:blur(20px); pointer-events:none; }
.result-card > * { position:relative; }
.result-eyebrow { color:#ff6a86; font-weight:900; letter-spacing:.18em; font-size:10px; }
.result-card h1 { margin:10px 0 4px; font-size:clamp(28px,5vw,48px); letter-spacing:-.045em; }
.result-artist { margin:0 0 26px; color:var(--muted); }
.grade-orb { width:105px; height:105px; margin:0 auto 14px; border-radius:50%; display:grid; place-items:center; font-size:43px; font-weight:1000; background:linear-gradient(135deg,rgba(255,57,95,.95),rgba(155,92,255,.95)); box-shadow:0 18px 48px rgba(155,92,255,.3); }
.big-result-score { font-size:clamp(48px,10vw,86px); line-height:.95; font-weight:1000; letter-spacing:-.065em; font-variant-numeric:tabular-nums; }
.result-caption { margin-top:7px; color:#777986; font-size:9px; letter-spacing:.15em; font-weight:900; }
.result-bars { display:grid; gap:13px; margin:32px 0 24px; text-align:left; }
.result-bar-row > div:first-child { display:flex; justify-content:space-between; margin-bottom:6px; font-size:12px; }
.result-bar-row span { color:#a8a9b2; }
.result-bar-track { height:8px; border-radius:999px; background:rgba(255,255,255,.07); overflow:hidden; }
.result-bar-track i { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,var(--accent),var(--accent-2)); }
.hit-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
.hit-grid div { border:1px solid rgba(255,255,255,.07); border-radius:13px; padding:12px 8px; background:rgba(255,255,255,.025); }
.hit-grid strong { display:block; font-size:22px; }
.hit-grid span { color:#858794; font-size:8px; letter-spacing:.08em; font-weight:900; }
.max-combo { margin:18px 0 0; color:#c6c7cf; }
.beta-note { margin:20px auto 0; max-width:600px; color:#727481; font-size:11px; line-height:1.5; }
.no-score { padding:32px 0 22px; }
.no-score-icon { width:86px; height:86px; margin:0 auto 15px; border-radius:50%; display:grid; place-items:center; font-size:40px; background:rgba(255,255,255,.06); }
.no-score h2 { margin:0 0 8px; }
.no-score p { margin:0; color:var(--muted); }
.result-actions { display:flex; justify-content:center; gap:9px; margin-top:28px; }
.result-button { min-width:150px; border-radius:12px; padding:12px 16px; cursor:pointer; }

@media (max-width:700px) {
  .lyrics-viewport,.manual-lyrics { height:290px; }
  .lyrics-rail { padding:120px 0; }
  .live-score-row { grid-template-columns:1fr 1.2fr 1fr; }
  .live-score-card { padding:8px 5px; }
  .hit-grid { grid-template-columns:repeat(2,1fr); }
  .result-actions { flex-direction:column; }
  .result-button { width:100%; }
}


/* === 0.4 · Smule-like note highway === */
.pitch-guide-card {
  position: relative;
  z-index: 2;
  width: min(980px, 100%);
  margin: 24px auto 4px;
  border: 1px solid rgba(255,255,255,.085);
  border-radius: 20px;
  background:
    radial-gradient(circle at 72% 10%, rgba(97,207,255,.08), transparent 36%),
    linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.018));
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.035);
}
.pitch-guide-head {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 15px 8px;
  border-bottom: 1px solid rgba(255,255,255,.055);
}
.pitch-guide-head > div:first-child {
  display: flex;
  align-items: baseline;
  gap: 9px;
}
.pitch-kicker {
  color: #777986;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .13em;
}
#singerNote {
  font-size: 20px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.pitch-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #858793;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: .08em;
}
.pitch-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.pitch-legend i {
  display: inline-block;
  flex: 0 0 auto;
}
.legend-target {
  width: 20px;
  height: 6px;
  border-radius: 999px;
  background: rgba(170,111,246,.85);
  box-shadow: 0 0 12px rgba(170,111,246,.35);
}
.legend-voice {
  width: 16px;
  height: 3px;
  border-radius: 999px;
  background: #4ae7ff;
  box-shadow: 0 0 10px rgba(74,231,255,.7);
}
.pitch-canvas-wrap {
  position: relative;
  height: 220px;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(255,255,255,.018), transparent 22%, transparent 78%, rgba(255,255,255,.012)),
    rgba(4,5,9,.28);
}
.pitch-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.pitch-playhead {
  position: absolute;
  left: 27%;
  top: 0;
  bottom: 0;
  width: 1px;
  pointer-events: none;
}
.pitch-playhead i {
  position: absolute;
  inset: 0 auto 0 0;
  width: 2px;
  background: linear-gradient(180deg, transparent 0, rgba(255,255,255,.28) 11%, rgba(255,255,255,.82) 47%, rgba(255,255,255,.28) 89%, transparent);
  box-shadow: 0 0 18px rgba(255,255,255,.18);
}
.pitch-playhead span {
  position: absolute;
  top: 9px;
  left: 7px;
  color: rgba(255,255,255,.38);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .12em;
}
.pitch-waiting {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: rgba(255,255,255,.34);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .05em;
  pointer-events: none;
  transition: opacity .2s ease;
}
.pitch-waiting.hidden {
  opacity: 0;
}

@media (max-width: 720px) {
  .pitch-guide-card { margin-top: 16px; border-radius: 16px; }
  .pitch-canvas-wrap { height: 178px; }
  .pitch-guide-head { padding-inline: 11px; }
  .pitch-legend { gap: 8px; font-size: 8px; }
  .pitch-kicker { display: none; }
  #singerNote { font-size: 18px; }
}

@media (max-width: 480px) {
  .pitch-legend span:first-child { display: none; }
  .pitch-canvas-wrap { height: 158px; }
}
