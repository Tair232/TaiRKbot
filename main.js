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

function firstLyricsLines(track) {
  const source = track.syncedLyrics || track.plainLyrics || "";
  return source
    .split("\n")
    .map((line) => line.replace(/^\[\d{2}:\d{2}(?:\.\d+)?\]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function statusMessage(text, type = "info") {
  const el = document.querySelector("#status");
  if (!el) return;
  el.textContent = text;
  el.dataset.type = type;
}

function render() {
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
            <p>Найди трек слева — здесь появятся текст и кнопка подключения бота.</p>
          `}
        </aside>
      </section>
    </main>
  `;

  bindEvents();
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
        <span>${state.connectedChannel ? "Бот уже в твоём канале" : "Сначала зайди в любой голосовой канал"}</span>
      </div>
      ${state.connectedChannel
        ? `<button id="leaveVoice" class="secondary">Отключить</button>`
        : `<button id="joinVoice" class="primary">Подключить бота</button>`}
    </div>

    <button class="sing-button" disabled>
      <span>▶</span>
      НАЧАТЬ ПЕТЬ
      <small>музыку подключим следующим этапом</small>
    </button>
  `;
}

function bindEvents() {
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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.accessToken}`,
      },
      body: JSON.stringify({ guildId: state.guildId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "VOICE_JOIN_FAILED");
    state.connectedChannel = data.channelName;
    render();
    statusMessage(`Бот подключён к «${data.channelName}»`, "ok");
  } catch (error) {
    const messages = {
      USER_NOT_IN_VOICE: "Сначала зайди в голосовой канал.",
      CHANNEL_NOT_JOINABLE: "Бот не может подключиться к этому каналу.",
      CHANNEL_NOT_SPEAKABLE: "У бота нет права «Говорить» в этом канале.",
      BOT_NOT_READY: "Бот ещё не вошёл в Discord. Проверь токен на Bothost.",
      GUILD_NOT_FOUND: "Бота нет на этом сервере Discord.",
    };
    statusMessage(messages[error.message] || `Ошибка подключения: ${error.message}`, "error");
  }
}

async function leaveVoice() {
  try {
    await fetch("/api/voice/leave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.accessToken}`,
      },
      body: JSON.stringify({ guildId: state.guildId }),
    });
  } finally {
    state.connectedChannel = null;
    render();
    statusMessage("Бот отключён от голосового канала", "info");
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
  // Small delay makes transient SDK handshake errors easier to distinguish from config errors.
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
