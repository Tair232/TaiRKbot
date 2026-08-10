import { DiscordSDK } from "@discord/embedded-app-sdk";
import "./style.css";

const app = document.querySelector("#app");

const state = {
  sdk: null,
  auth: null,
  accessToken: null,
  guildId: null,
  channelId: null,
  selected: null,
  results: [],
  connectedChannel: null,
  mode: "library",
  karaoke: null,
  lyricMap: [],
  pollTimer: null,
  visualTimer: null,
};

const popular = [
  "Кино",
  "Король и Шут",
  "Сектор Газа",
  "Ария",
  "Кипелов",
  "Три дня дождя",
  "Дайте танк (!)",
  "Молчат Дома",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDuration(seconds) {
  if (!seconds) return "—";
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function formatClock(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const min = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function firstLyricsLines(track) {
  const source = track.syncedLyrics || track.plainLyrics || "";
  return source
    .split("\n")
    .map((line) => line.replace(/^\[\d{1,3}:\d{2}(?:[.:]\d+)?\]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function parseSyncedLyrics(source = "") {
  return String(source)
    .split("\n")
    .map((line) => {
      const match = line.match(/^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/);
      if (!match) return null;

      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fractionRaw = match[3] || "0";
      const fractionMs = Number(fractionRaw.padEnd(3, "0").slice(0, 3));
      const text = match[4].trim();

      return {
        timeMs: (minutes * 60 + seconds) * 1000 + fractionMs,
        text: text || "♪",
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timeMs - b.timeMs);
}

function statusMessage(text, type = "info") {
  const el = document.querySelector("#status");
  if (!el) return;
  el.textContent = text;
  el.dataset.type = type;
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${state.accessToken}`,
  };
}

function errorMessage(code) {
  const messages = {
    USER_NOT_IN_VOICE: "Сначала зайди в голосовой канал.",
    CHANNEL_NOT_JOINABLE: "Бот не может подключиться к этому каналу.",
    CHANNEL_NOT_SPEAKABLE: "У бота нет права «Говорить» в этом канале.",
    BOT_NOT_READY: "Бот ещё не вошёл в Discord. Проверь токен на Bothost.",
    GUILD_NOT_FOUND: "Бота нет на этом сервере Discord.",
    VOICE_CONNECTION_FAILED: "Не удалось установить voice-соединение.",
    AUDIO_NOT_FOUND: "Не удалось найти подходящую запись этой песни.",
    AUDIO_STREAM_FAILED: "Нашли песню, но не удалось получить аудиопоток.",
    AUDIO_PLAYER_ERROR: "Discord не смог воспроизвести аудиопоток.",
    TRACK_INVALID: "Некорректные данные песни.",
  };
  return messages[code] || `Ошибка: ${code}`;
}

function render() {
  if (state.mode === "karaoke" && state.selected) {
    renderKaraoke();
    return;
  }
  renderLibrary();
}

function renderLibrary() {
  const user = state.auth?.user;
  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">♪</div>
          <div>
            <strong>КАРАОКЕ</strong>
            <span>русские песни внутри Discord</span>
          </div>
        </div>
        <div class="user-chip">
          ${user?.avatar ? `<img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64" alt="">` : `<div class="avatar-fallback">${escapeHtml(user?.username?.[0] || "?")}</div>`}
          <span>${escapeHtml(user?.global_name || user?.username || "Discord")}</span>
        </div>
      </header>

      <section class="hero">
        <div class="eyebrow">РУССКОЕ КАРАОКЕ</div>
        <h1>Что будем петь?</h1>
        <p>Найди песню или исполнителя. Синхронный текст ставим выше в выдаче.</p>
        <label class="searchbox">
          <span>⌕</span>
          <input id="search" autocomplete="off" placeholder="Например: Кино — Группа крови" />
          <kbd>Enter</kbd>
        </label>
        <div class="chips">
          ${popular.map((name) => `<button class="chip" data-search="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("")}
        </div>
      </section>

      <div id="status" class="status" data-type="info">Готово к поиску</div>

      <section class="content-grid">
        <div class="results-panel">
          <div class="section-title">
            <span>${state.results.length ? "Результаты" : "Популярное"}</span>
            <small>${state.results.length ? `${state.results.length} вариантов` : "нажми исполнителя выше"}</small>
          </div>
          <div id="results" class="results">
            ${state.results.length ? state.results.map(trackCard).join("") : emptyState()}
          </div>
        </div>

        <aside class="now-panel">
          ${state.selected ? selectedCard(state.selected) : `
            <div class="vinyl">♪</div>
            <h2>Песня не выбрана</h2>
            <p>Найди трек слева — здесь появятся текст и кнопка запуска караоке.</p>
          `}
        </aside>
      </section>
    </main>
  `;

  bindLibraryEvents();
}

function emptyState() {
  return `
    <div class="empty">
      <div class="empty-icon">♫</div>
      <strong>Начни с поиска</strong>
      <span>Мы используем LRCLIB и отдаём приоритет кириллице и синхронному тексту.</span>
    </div>
  `;
}

function trackCard(track) {
  const selected = state.selected?.id === track.id;
  return `
    <button class="track ${selected ? "selected" : ""}" data-track-id="${track.id}">
      <div class="cover"><span>♪</span></div>
      <div class="track-main">
        <strong>${escapeHtml(track.title)}</strong>
        <span>${escapeHtml(track.artist)}</span>
        <div class="badges">
          ${track.hasSyncedLyrics ? `<em>● Синхронный текст</em>` : track.hasLyrics ? `<em>Текст</em>` : `<em class="muted">Без текста</em>`}
          ${track.instrumental ? `<em>Инструментал</em>` : ""}
        </div>
      </div>
      <div class="duration">${formatDuration(track.duration)}</div>
      <div class="arrow">›</div>
    </button>
  `;
}

function selectedCard(track) {
  const lines = firstLyricsLines(track);
  return `
    <div class="selected-head">
      <div class="big-cover">♪</div>
      <div>
        <div class="eyebrow">ВЫБРАНО</div>
        <h2>${escapeHtml(track.title)}</h2>
        <p>${escapeHtml(track.artist)} · ${formatDuration(track.duration)}</p>
      </div>
    </div>

    <div class="lyrics-preview">
      ${lines.length ? lines.map((line, i) => `<div class="lyric-line ${i === 1 ? "active" : ""}">${escapeHtml(line)}</div>`).join("") : `<div class="lyric-line muted-line">Для этой версии текста пока нет.</div>`}
    </div>

    <div class="voice-card">
      <div>
        <strong>${state.connectedChannel ? `Подключено: ${escapeHtml(state.connectedChannel)}` : "Голосовой канал"}</strong>
        <span>${state.connectedChannel ? "Бот уже в твоём канале" : "Можно подключить заранее или просто нажать «Начать петь»"}</span>
      </div>
      ${state.connectedChannel
        ? `<button id="leaveVoice" class="secondary">Отключить</button>`
        : `<button id="joinVoice" class="primary">Подключить</button>`}
    </div>

    <button id="startKaraoke" class="sing-button ready">
      <span>▶</span>
      НАЧАТЬ ПЕТЬ
      <small>${track.hasSyncedLyrics ? "синхронный текст готов" : "музыка запустится, но тайминг текста может отсутствовать"}</small>
    </button>
  `;
}

function bindLibraryEvents() {
  const input = document.querySelector("#search");
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") doSearch(input.value);
  });

  document.querySelectorAll("[data-search]").forEach((button) => {
    button.addEventListener("click", () => {
      input.value = button.dataset.search;
      doSearch(button.dataset.search);
    });
  });

  document.querySelectorAll("[data-track-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = Number(button.dataset.trackId);
      state.selected = state.results.find((track) => track.id === id) || null;
      render();
    });
  });

  document.querySelector("#joinVoice")?.addEventListener("click", joinVoice);
  document.querySelector("#leaveVoice")?.addEventListener("click", leaveVoice);
  document.querySelector("#startKaraoke")?.addEventListener("click", startSelectedKaraoke);
}

async function doSearch(query) {
  const q = String(query || "").trim();
  if (q.length < 2) {
    statusMessage("Введи хотя бы 2 символа", "warn");
    return;
  }

  statusMessage(`Ищем «${q}»…`, "loading");
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "SEARCH_FAILED");
    state.results = data.results || [];
    state.selected = state.results[0] || null;
    render();
    statusMessage(state.results.length ? "Нашёл. Выбери подходящую версию песни." : "Ничего не нашлось", state.results.length ? "ok" : "warn");
  } catch (error) {
    console.error(error);
    statusMessage("Не удалось получить песни. Попробуй ещё раз.", "error");
  }
}

async function joinVoice() {
  if (!state.guildId) {
    statusMessage("Запусти Activity внутри сервера Discord, а не в ЛС.", "warn");
    return;
  }

  statusMessage("Подключаем бота к твоему голосовому каналу…", "loading");
  try {
    const response = await fetch("/api/voice/join", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ guildId: state.guildId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "VOICE_JOIN_FAILED");
    state.connectedChannel = data.channelName;
    render();
    statusMessage(`Бот подключён к «${data.channelName}»`, "ok");
  } catch (error) {
    statusMessage(errorMessage(error.message), "error");
  }
}

async function leaveVoice() {
  try {
    await fetch("/api/voice/leave", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ guildId: state.guildId }),
    });
  } finally {
    stopKaraokeLoops();
    state.connectedChannel = null;
    state.karaoke = null;
    state.mode = "library";
    render();
    statusMessage("Бот отключён от голосового канала", "info");
  }
}

async function startSelectedKaraoke() {
  if (!state.guildId) {
    statusMessage("Запусти Activity внутри сервера Discord.", "warn");
    return;
  }
  if (!state.selected) return;

  const button = document.querySelector("#startKaraoke");
  if (button) {
    button.disabled = true;
    button.classList.add("loading-button");
    button.innerHTML = `<span class="tiny-spinner"></span> ИЩЕМ АУДИО… <small>обычно несколько секунд</small>`;
  }
  statusMessage("Ищем подходящую запись и подключаем бота…", "loading");

  try {
    const track = {
      id: state.selected.id,
      title: state.selected.title,
      artist: state.selected.artist,
      album: state.selected.album,
      duration: state.selected.duration,
      instrumental: state.selected.instrumental,
    };

    const response = await fetch("/api/karaoke/start", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ guildId: state.guildId, track }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "KARAOKE_START_FAILED");

    state.connectedChannel = data.channelName || state.connectedChannel;
    state.lyricMap = parseSyncedLyrics(state.selected.syncedLyrics);
    state.karaoke = {
      ...data,
      positionMs: Number(data.positionMs) || 0,
      sampledAt: performance.now(),
    };
    state.mode = "karaoke";
    render();
    startKaraokeLoops();
  } catch (error) {
    console.error(error);
    render();
    statusMessage(errorMessage(error.message), "error");
  }
}

function renderKaraoke() {
  const track = state.selected;
  const source = state.karaoke?.source;
  const durationMs = Math.max(1, Number(track.duration || source?.duration || 0) * 1000);

  app.innerHTML = `
    <main class="karaoke-shell">
      <header class="karaoke-topbar">
        <button id="backLibrary" class="ghost-button">← Каталог</button>
        <div class="karaoke-title-mini">
          <strong>${escapeHtml(track.title)}</strong>
          <span>${escapeHtml(track.artist)}</span>
        </div>
        <div class="live-pill"><i></i> КАРАОКЕ</div>
      </header>

      <section class="karaoke-stage">
        <div class="stage-glow"></div>
        <div class="stage-meta">
          <div class="eyebrow">СЕЙЧАС ИГРАЕТ</div>
          <h1>${escapeHtml(track.title)}</h1>
          <p>${escapeHtml(track.artist)}</p>
        </div>

        <div class="lyrics-stage ${state.lyricMap.length ? "" : "no-sync"}">
          <div id="lyricPrev" class="stage-lyric previous">${state.lyricMap.length ? "…" : "Синхронного текста для этой версии нет"}</div>
          <div id="lyricCurrent" class="stage-lyric current">${state.lyricMap.length ? "♪" : "Музыка всё равно играет"}</div>
          <div id="lyricNext" class="stage-lyric next">${state.lyricMap.length ? "…" : "Выбери другую версию трека, если нужен тайминг"}</div>
        </div>

        <div class="player-block">
          <div class="time-row">
            <span id="currentTime">0:00</span>
            <span id="durationTime">${formatClock(durationMs)}</span>
          </div>
          <div class="progress-track"><div id="progressBar" class="progress-bar"></div></div>
          <div class="player-controls">
            <button id="pauseResume" class="control-button">Ⅱ Пауза</button>
            <button id="stopKaraoke" class="control-button danger">■ Закончить</button>
          </div>
        </div>

        <div class="source-row">
          <span id="playbackStatus">Подключено к ${escapeHtml(state.connectedChannel || "voice")}</span>
          <span>${source ? `Аудио: ${escapeHtml(source.title)}` : "Аудио загружается…"}</span>
        </div>
      </section>
    </main>
  `;

  document.querySelector("#pauseResume")?.addEventListener("click", togglePause);
  document.querySelector("#stopKaraoke")?.addEventListener("click", stopCurrentKaraoke);
  document.querySelector("#backLibrary")?.addEventListener("click", async () => {
    if (["playing", "paused", "buffering", "resolving"].includes(state.karaoke?.status)) {
      await stopCurrentKaraoke();
      return;
    }
    stopKaraokeLoops();
    state.mode = "library";
    render();
  });

  updateKaraokeVisuals();
}

function estimatedPositionMs() {
  if (!state.karaoke) return 0;
  const base = Number(state.karaoke.positionMs) || 0;
  if (state.karaoke.status !== "playing") return base;
  return base + Math.max(0, performance.now() - Number(state.karaoke.sampledAt || performance.now()));
}

function activeLyricIndex(positionMs) {
  const lines = state.lyricMap;
  if (!lines.length) return -1;
  let low = 0;
  let high = lines.length - 1;
  let answer = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lines[mid].timeMs <= positionMs) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return answer;
}

function updateKaraokeVisuals() {
  if (state.mode !== "karaoke" || !state.karaoke) return;

  const sourceDuration = Number(state.karaoke.source?.duration) || 0;
  const durationMs = Math.max(1, Number(state.selected?.duration || sourceDuration || 0) * 1000);
  const positionMs = Math.min(estimatedPositionMs(), durationMs || Infinity);
  const ratio = Math.max(0, Math.min(1, positionMs / durationMs));

  const currentTime = document.querySelector("#currentTime");
  const progressBar = document.querySelector("#progressBar");
  if (currentTime) currentTime.textContent = formatClock(positionMs);
  if (progressBar) progressBar.style.width = `${ratio * 100}%`;

  if (state.lyricMap.length) {
    const index = activeLyricIndex(positionMs);
    const prev = document.querySelector("#lyricPrev");
    const current = document.querySelector("#lyricCurrent");
    const next = document.querySelector("#lyricNext");
    if (prev) prev.textContent = index > 0 ? state.lyricMap[index - 1].text : "";
    if (current) current.textContent = index >= 0 ? state.lyricMap[index].text : "♪";
    if (next) next.textContent = index + 1 < state.lyricMap.length ? state.lyricMap[index + 1].text : "";
  }

  const pause = document.querySelector("#pauseResume");
  if (pause) {
    pause.textContent = state.karaoke.status === "paused" ? "▶ Продолжить" : "Ⅱ Пауза";
    pause.disabled = !["playing", "paused"].includes(state.karaoke.status);
  }

  const status = document.querySelector("#playbackStatus");
  if (status) {
    const labels = {
      resolving: "Ищем аудио…",
      buffering: "Буферизация…",
      playing: `Играет в ${state.connectedChannel || "voice"}`,
      paused: "Пауза",
      finished: "Песня закончилась",
      error: "Ошибка воспроизведения",
      stopped: "Остановлено",
    };
    status.textContent = labels[state.karaoke.status] || state.karaoke.status;
  }
}

async function pollKaraokeState() {
  if (state.mode !== "karaoke" || !state.guildId) return;
  try {
    const response = await fetch(`/api/karaoke/state?guildId=${encodeURIComponent(state.guildId)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) return;

    const oldStatus = state.karaoke?.status;
    state.karaoke = {
      ...state.karaoke,
      ...data,
      positionMs: Number(data.positionMs) || 0,
      sampledAt: performance.now(),
    };

    if (data.channelName) state.connectedChannel = data.channelName;
    updateKaraokeVisuals();

    if (data.status === "error" && oldStatus !== "error") {
      const current = document.querySelector("#lyricCurrent");
      if (current) current.textContent = errorMessage(data.error || "AUDIO_PLAYER_ERROR");
    }
  } catch (error) {
    console.debug("karaoke state poll", error);
  }
}

function startKaraokeLoops() {
  stopKaraokeLoops();
  state.pollTimer = setInterval(pollKaraokeState, 1000);
  state.visualTimer = setInterval(updateKaraokeVisuals, 100);
}

function stopKaraokeLoops() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  if (state.visualTimer) clearInterval(state.visualTimer);
  state.pollTimer = null;
  state.visualTimer = null;
}

async function karaokeControl(action) {
  const response = await fetch(`/api/karaoke/${action}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ guildId: state.guildId }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `KARAOKE_${action.toUpperCase()}_FAILED`);
  state.karaoke = {
    ...state.karaoke,
    ...data,
    positionMs: Number(data.positionMs) || 0,
    sampledAt: performance.now(),
  };
  updateKaraokeVisuals();
}

async function togglePause() {
  try {
    await karaokeControl(state.karaoke?.status === "paused" ? "resume" : "pause");
  } catch (error) {
    console.error(error);
  }
}

async function stopCurrentKaraoke() {
  try {
    await karaokeControl("stop");
  } catch (error) {
    console.error(error);
  } finally {
    stopKaraokeLoops();
    state.karaoke = null;
    state.mode = "library";
    render();
    statusMessage("Караоке остановлено. Бот остался в голосовом канале.", "info");
  }
}

async function initDiscord() {
  app.innerHTML = `<div class="boot"><div class="spinner"></div><strong>Запускаем караоке…</strong><span>Подключаемся к Discord</span></div>`;

  const configResponse = await fetch("/api/config");
  const config = await configResponse.json();

  state.sdk = new DiscordSDK(config.clientId);
  await state.sdk.ready();
  state.guildId = state.sdk.guildId;
  state.channelId = state.sdk.channelId;

  const { code } = await state.sdk.commands.authorize({
    client_id: config.clientId,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: ["identify", "guilds", "applications.commands"],
  });

  const tokenResponse = await fetch("/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(tokenData.error || "TOKEN_EXCHANGE_FAILED");
  }

  state.accessToken = tokenData.access_token;
  state.auth = await state.sdk.commands.authenticate({ access_token: state.accessToken });
  if (!state.auth) throw new Error("DISCORD_AUTH_FAILED");

  render();
}

initDiscord().catch(async (error) => {
  console.error(error);
  await sleep(250);
  app.innerHTML = `
    <div class="fatal">
      <div class="fatal-icon">!</div>
      <h1>Activity не смогла запуститься</h1>
      <p>${escapeHtml(error.message)}</p>
      <div class="fatal-help">
        Открывай эту страницу именно через Discord Activity. Если ошибка про Client Secret — добавь его в переменные Bothost.
      </div>
    </div>
  `;
});
