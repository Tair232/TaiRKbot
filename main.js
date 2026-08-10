import { DiscordSDK } from "@discord/embedded-app-sdk";
import "./style.css";

const app = document.querySelector("#app");

const state = {
  sdk: null,
  auth: null,
  accessToken: null,
  guildId: null,
  channelId: null,

  query: "",
  results: [],
  selected: null,
  searching: false,

  room: {
    current: null,
    queue: [],
    myInvites: [],
    myDrafts: [],
  },

  mode: "library",
  watchingCurrent: false,
  activeLyricIndex: -999,

  roomPoll: null,
  visualTimer: null,
  searchTimer: null,
  roomSignature: "",
};

const popular = [
  "Кино",
  "Король и Шут",
  "Дайте танк (!)",
  "Три дня дождя",
  "Сектор Газа",
  "Ария",
  "Кипелов",
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

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${state.accessToken}`,
  };
}

function me() {
  return state.auth?.user || null;
}

function myId() {
  return me()?.id || "";
}

function currentOwnedByMe() {
  return state.room.current?.owner?.id === myId();
}

function errorMessage(code) {
  const messages = {
    USER_NOT_IN_VOICE: "Сначала зайди в голосовой канал.",
    CHANNEL_NOT_JOINABLE: "Бот не может подключиться к этому каналу.",
    CHANNEL_NOT_SPEAKABLE: "У бота нет права «Говорить» в этом канале.",
    BOT_NOT_READY: "Бот ещё не вошёл в Discord.",
    GUILD_NOT_FOUND: "Бота нет на этом сервере Discord.",
    VOICE_CONNECTION_FAILED: "Не удалось подключиться к voice.",
    AUDIO_NOT_FOUND: "Не удалось найти подходящее аудио.",
    AUDIO_SEARCH_FAILED: "YouTube-поиск временно не сработал.",
    AUDIO_DOWNLOAD_FAILED: "Не удалось получить аудиопоток.",
    AUDIO_TRANSCODE_FAILED: "FFmpeg не смог подготовить аудио.",
    USER_QUEUE_LIMIT: "У тебя уже есть одна песня в очереди.",
    NOT_SONG_OWNER: "Управлять этой песней может только тот, кто её поставил.",
    DUET_DRAFT_EXISTS: "У тебя уже есть незавершённый дуо-инвайт.",
    DUET_INVITE_REQUIRED: "Выбери хотя бы одного человека.",
    INVITEE_NOT_IN_VOICE: "Кто-то из приглашённых уже вышел из voice.",
    DUET_NEEDS_ACCEPTED: "Нужно, чтобы хотя бы один человек принял инвайт.",
    DUET_DRAFT_NOT_FOUND: "Этот инвайт уже не существует.",
    DUET_NOT_INVITED: "Этот инвайт предназначен другому человеку.",
    GUILD_NOT_ALLOWED: "Караоке работает только на двух разрешённых Discord-серверах.",
    VOICE_NOT_ALLOWED: "Караоке работает только в двух разрешённых голосовых каналах.",
  };
  return messages[code] || `Ошибка: ${code}`;
}

function toast(text, type = "info") {
  let box = document.querySelector("#toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast";
    document.body.appendChild(box);
  }
  box.textContent = text;
  box.dataset.type = type;
  box.classList.add("show");
  clearTimeout(box._timer);
  box._timer = setTimeout(() => box.classList.remove("show"), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${state.accessToken}`,
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP_${response.status}`);
  return data;
}

function trackPayload(track) {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    instrumental: track.instrumental,
    plainLyrics: track.plainLyrics,
    syncedLyrics: track.syncedLyrics,
  };
}

function firstLyricsLines(track) {
  return String(track?.syncedLyrics || track?.plainLyrics || "")
    .split("\n")
    .map((line) => line.replace(/^\[\d{1,3}:\d{2}(?:[.:]\d+)?\]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function avatarHtml(user) {
  if (user?.avatar && user?.id) {
    return `<img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64" alt="">`;
  }
  return `<span>${escapeHtml((user?.global_name || user?.username || "?").slice(0, 1))}</span>`;
}

function singerDots(singers = []) {
  if (!singers.length) return "";
  return `
    <div class="singer-dots">
      ${singers.map((s) => `<i style="--dot:${escapeHtml(s.color || "#999")}" title="${escapeHtml(s.name)}"></i>`).join("")}
      <span>${singers.map((s) => escapeHtml(s.name)).join(" · ")}</span>
    </div>
  `;
}


function roomSignature(room = state.room) {
  return JSON.stringify({
    current: room.current
      ? {
          id: room.current.id,
          status: room.current.status,
          owner: room.current.owner?.id,
          singers: (room.current.singers || []).map((s) => s.id),
        }
      : null,
    queue: (room.queue || []).map((item) => [item.id, item.owner?.id]),
    invites: (room.myInvites || []).map((draft) => [
      draft.id,
      ...(draft.participants || []).map((person) => `${person.id}:${person.status}`),
    ]),
    drafts: (room.myDrafts || []).map((draft) => [
      draft.id,
      ...(draft.participants || []).map((person) => `${person.id}:${person.status}`),
    ]),
  });
}

function renderLibraryPreservingSearch() {
  const input = document.querySelector("#search");
  const hadFocus = document.activeElement === input;
  const selectionStart = input?.selectionStart ?? state.query.length;
  const selectionEnd = input?.selectionEnd ?? selectionStart;

  renderLibrary();

  if (!hadFocus) return;

  const nextInput = document.querySelector("#search");
  if (!nextInput) return;

  requestAnimationFrame(() => {
    nextInput.focus({ preventScroll: true });
    const max = nextInput.value.length;
    nextInput.setSelectionRange(
      Math.min(selectionStart, max),
      Math.min(selectionEnd, max),
    );
  });
}

function setSearchBusy(busy) {
  state.searching = busy;
  const box = document.querySelector(".searchbox");
  if (!box) return;

  let spinner = box.querySelector(".tiny-spinner");
  const kbd = box.querySelector("kbd");

  if (busy) {
    if (kbd) kbd.remove();
    if (!spinner) {
      spinner = document.createElement("i");
      spinner.className = "tiny-spinner";
      box.appendChild(spinner);
    }
  } else {
    spinner?.remove();
    if (!box.querySelector("kbd")) {
      const hint = document.createElement("kbd");
      hint.textContent = "Enter";
      box.appendChild(hint);
    }
  }
}

function render() {
  if (state.mode === "karaoke" && state.room.current) {
    renderKaraoke();
    return;
  }
  renderLibrary();
}

function renderLibrary() {
  const user = me();
  const current = state.room.current;
  const queue = state.room.queue || [];
  const invites = state.room.myInvites || [];
  const drafts = state.room.myDrafts || [];

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
          <div class="avatar">${avatarHtml(user)}</div>
          <span>${escapeHtml(user?.global_name || user?.username || "Discord")}</span>
        </div>
      </header>

      ${invites.length ? `
        <section class="invite-stack">
          ${invites.map(inviteCard).join("")}
        </section>
      ` : ""}

      ${current ? `
        <section class="now-live">
          <div class="live-pulse"></div>
          <div class="now-live-main">
            <small>СЕЙЧАС ПОЮТ</small>
            <strong>${escapeHtml(current.track.title)}</strong>
            <span>${escapeHtml(current.track.artist)} · поставил ${escapeHtml(current.owner.name)}</span>
            ${singerDots(current.singers)}
          </div>
          <button id="followCurrent" class="primary compact">Следить за текстом</button>
        </section>
      ` : ""}

      <section class="hero">
        <div class="eyebrow">ПОИСК ПЕСЕН</div>
        <h1>Что будем петь?</h1>
        <p>Ищи как на YouTube: название, исполнителя, часть фразы или даже транслитом.</p>

        <label class="searchbox">
          <span>⌕</span>
          <input id="search" autocomplete="off" value="${escapeHtml(state.query)}" placeholder="Кино группа крови, kishlak, три дня дождя..." />
          ${state.searching ? `<i class="tiny-spinner"></i>` : `<kbd>Enter</kbd>`}
        </label>

        <div class="chips">
          ${popular.map((name) => `<button class="chip" data-search="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("")}
        </div>
      </section>

      <section class="library-layout">
        <div class="results-panel">
          <div class="section-title">
            <span>${state.query ? `Результаты по «${escapeHtml(state.query)}»` : "Поиск"}</span>
            <small>${state.results.length ? `${state.results.length} вариантов` : "начни вводить название"}</small>
          </div>
          <div class="results">
            ${state.results.length
              ? state.results.map(trackCard).join("")
              : `<div class="empty"><div>♫</div><strong>Пиши что угодно</strong><span>Поиск запускается прямо во время ввода.</span></div>`}
          </div>
        </div>

        <aside class="side-column">
          <section class="side-card selected-card">
            ${state.selected ? selectedMarkup(state.selected) : `
              <div class="vinyl">♪</div>
              <h2>Песня не выбрана</h2>
              <p>Нажми на результат поиска — здесь появятся кнопки соло и дуо.</p>
            `}
          </section>

          ${drafts.length ? `
            <section class="side-card">
              <div class="side-heading">
                <strong>Дуо-инвайт</strong>
                <span>ждём ответы</span>
              </div>
              ${drafts.map(draftMarkup).join("")}
            </section>
          ` : ""}

          <section class="side-card queue-card">
            <div class="side-heading">
              <strong>Очередь</strong>
              <span>${queue.length ? `${queue.length} пес.` : "пусто"}</span>
            </div>
            ${queue.length
              ? queue.map(queueMarkup).join("")
              : `<div class="queue-empty">Следующая песня появится здесь.</div>`}
          </section>
        </aside>
      </section>
    </main>

    <div id="modalRoot"></div>
  `;

  bindLibrary();
}

function inviteCard(draft) {
  const invited = draft.participants.find((p) => p.id === myId());
  return `
    <article class="invite-card">
      <div class="invite-icon">🎤</div>
      <div>
        <small>ИНВАЙТ В ДУО</small>
        <strong>${escapeHtml(draft.owner.name)} зовёт тебя петь</strong>
        <span>${escapeHtml(draft.track.artist)} — ${escapeHtml(draft.track.title)}</span>
      </div>
      <div class="invite-actions">
        <button class="primary compact" data-invite-accept="${draft.id}">Принять</button>
        <button class="secondary compact" data-invite-decline="${draft.id}">Отказаться</button>
      </div>
    </article>
  `;
}

function trackCard(track) {
  const selected = state.selected?.id === track.id;
  return `
    <button class="track ${selected ? "selected" : ""}" data-track-id="${track.id}">
      <div class="cover"><span>♪</span></div>
      <div class="track-main">
        <strong>${escapeHtml(track.title)}</strong>
        <span>${escapeHtml(track.artist)}${track.album ? ` · ${escapeHtml(track.album)}` : ""}</span>
        <div class="badges">
          ${track.hasSyncedLyrics ? `<em>● синхронный текст</em>` : track.hasLyrics ? `<em>текст</em>` : `<em class="muted">без текста</em>`}
        </div>
      </div>
      <div class="duration">${formatDuration(track.duration)}</div>
      <div class="arrow">›</div>
    </button>
  `;
}

function selectedMarkup(track) {
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
      ${lines.length
        ? lines.map((line, i) => `<div class="${i === 1 ? "active" : ""}">${escapeHtml(line)}</div>`).join("")
        : `<div class="muted-line">Текста нет — музыка всё равно может играть.</div>`}
    </div>

    <div class="sing-actions">
      <button id="singSolo" class="sing-button">
        <span>🎙</span>
        <div><strong>Спеть одному</strong><small>${state.room.current ? "добавится в очередь" : "начать сейчас"}</small></div>
      </button>
      <button id="openDuet" class="sing-button alt">
        <span>👥</span>
        <div><strong>Дуо / группа</strong><small>до 4 человек · только по инвайтам</small></div>
      </button>
    </div>
  `;
}

function draftMarkup(draft) {
  const accepted = draft.participants.filter((p) => p.status === "accepted").length;
  return `
    <div class="draft">
      <strong>${escapeHtml(draft.track.title)}</strong>
      <span>${draft.participants.map((p) => `${escapeHtml(p.name)} — ${p.status === "accepted" ? "✓" : p.status === "pending" ? "…" : "×"}`).join("<br>")}</span>
      <div class="draft-actions">
        <button class="primary compact" data-draft-start="${draft.id}" ${accepted < 2 ? "disabled" : ""}>${state.room.current ? "В очередь" : "Начать"}</button>
        <button class="secondary compact" data-draft-cancel="${draft.id}">Отмена</button>
      </div>
    </div>
  `;
}

function queueMarkup(item) {
  const mine = item.owner.id === myId();
  return `
    <div class="queue-item">
      <b>${item.position}</b>
      <div>
        <strong>${escapeHtml(item.track.title)}</strong>
        <span>${escapeHtml(item.owner.name)} · ${item.singers.length > 1 ? `${item.singers.length} поют` : "соло"}</span>
      </div>
      ${mine ? `<button class="icon-button" data-queue-remove="${item.id}" title="Убрать из очереди">×</button>` : ""}
    </div>
  `;
}

function bindLibrary() {
  const input = document.querySelector("#search");
  input?.addEventListener("input", () => {
    state.query = input.value;
    clearTimeout(state.searchTimer);

    if (state.query.trim().length < 2) {
      state.results = [];
      setSearchBusy(false);
      renderLibraryPreservingSearch();
      return;
    }

    // Не перерисовываем Activity на каждую букву.
    // Запрос запускается только после короткой паузы в наборе.
    state.searchTimer = setTimeout(() => doSearch(state.query), 420);
  });

  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      clearTimeout(state.searchTimer);
      doSearch(input.value);
    }
  });

  document.querySelectorAll("[data-search]").forEach((button) => {
    button.addEventListener("click", () => {
      state.query = button.dataset.search;
      doSearch(state.query);
    });
  });

  document.querySelectorAll("[data-track-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = Number(button.dataset.trackId);
      state.selected = state.results.find((track) => Number(track.id) === id) || null;
      render();
    });
  });

  document.querySelector("#singSolo")?.addEventListener("click", addSolo);
  document.querySelector("#openDuet")?.addEventListener("click", openDuetModal);
  document.querySelector("#followCurrent")?.addEventListener("click", followCurrent);

  document.querySelectorAll("[data-invite-accept]").forEach((button) => {
    button.addEventListener("click", () => respondInvite(button.dataset.inviteAccept, true));
  });
  document.querySelectorAll("[data-invite-decline]").forEach((button) => {
    button.addEventListener("click", () => respondInvite(button.dataset.inviteDecline, false));
  });

  document.querySelectorAll("[data-draft-start]").forEach((button) => {
    button.addEventListener("click", () => commitDraft(button.dataset.draftStart));
  });
  document.querySelectorAll("[data-draft-cancel]").forEach((button) => {
    button.addEventListener("click", () => cancelDraft(button.dataset.draftCancel));
  });

  document.querySelectorAll("[data-queue-remove]").forEach((button) => {
    button.addEventListener("click", () => removeQueue(button.dataset.queueRemove));
  });
}

async function doSearch(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return;

  state.query = q;
  setSearchBusy(true);

  const requestQuery = q;
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "SEARCH_FAILED");

    if (state.query !== requestQuery) return;
    state.results = data.results || [];
    state.selected = state.results[0] || null;
  } catch (error) {
    console.error(error);
    toast("Поиск временно не сработал", "error");
  } finally {
    if (state.query === requestQuery) {
      setSearchBusy(false);
      renderLibraryPreservingSearch();
    }
  }
}

async function addSolo() {
  if (!state.selected) return;
  try {
    const data = await api("/api/song/solo", {
      method: "POST",
      body: JSON.stringify({
        guildId: state.guildId,
        track: trackPayload(state.selected),
      }),
    });
    state.room = data.room;
    if (data.started) {
      toast("Песня запускается", "ok");
      followCurrent();
    } else {
      toast(`Добавлено в очередь: №${data.queuePosition}`, "ok");
      render();
    }
  } catch (error) {
    toast(errorMessage(error.message), "error");
  }
}

async function openDuetModal() {
  if (!state.selected) return;

  // Модалка живёт вне #app, поэтому фоновые обновления Activity
  // больше не могут случайно её удалить.
  document.querySelector("#duetGlobalRoot")?.remove();

  const globalRoot = document.createElement("div");
  globalRoot.id = "duetGlobalRoot";
  document.body.appendChild(globalRoot);

  const close = () => globalRoot.remove();

  const drawShell = (content) => {
    globalRoot.innerHTML = `
      <div class="modal-backdrop" id="duetBackdrop">
        <section class="modal">
          <div class="modal-head">
            <div>
              <small>ДУО / ГРУППА</small>
              <h2>Кого позвать?</h2>
              <p>До трёх приглашённых. Никого не заставляем: каждый сам принимает инвайт.</p>
            </div>
            <button id="closeDuet" class="icon-button">×</button>
          </div>
          ${content}
        </section>
      </div>
    `;

    document.querySelector("#closeDuet")?.addEventListener("click", close);
    document.querySelector("#duetBackdrop")?.addEventListener("click", (event) => {
      if (event.target.id === "duetBackdrop") close();
    });
  };

  drawShell(`
    <div class="modal-loading">
      <div class="spinner"></div>
      <span>Смотрим, кто сейчас в voice…</span>
    </div>
  `);

  let data;
  try {
    data = await api(`/api/voice/members?guildId=${encodeURIComponent(state.guildId)}`);
  } catch (error) {
    drawShell(`
      <div class="modal-empty duet-empty-state">
        <div>👥</div>
        <strong>Пока некого приглашать</strong>
        <span>${escapeHtml(errorMessage(error.message))}</span>
      </div>
      <div class="together-note">
        <b>🎶 Дуо всё равно доступно</b>
        <span>Зайди в разрешённый voice или дождись друзей — окно больше не будет само закрываться.</span>
      </div>
      <button id="duetOkay" class="secondary wide">Понятно</button>
    `);
    document.querySelector("#duetOkay")?.addEventListener("click", close);
    return;
  }

  const others = (data.members || []).filter((member) => member.id !== myId());

  drawShell(`
    <div class="member-list">
      ${others.length ? others.map((member) => `
        <label class="member-row">
          <input type="checkbox" value="${member.id}" data-duet-member>
          <div class="member-avatar">${member.avatar ? `<img src="${escapeHtml(member.avatar)}" alt="">` : escapeHtml(member.name.slice(0,1))}</div>
          <div><strong>${escapeHtml(member.name)}</strong><span>в ${escapeHtml(data.channelName)}</span></div>
        </label>
      `).join("") : `
        <div class="modal-empty duet-empty-state">
          <div>🎙</div>
          <strong>Ты пока один в voice</strong>
          <span>Окно останется открытым. Когда кто-то зайдёт, закрой и открой его снова.</span>
        </div>
      `}
    </div>

    <div class="together-note">
      <b>🎶 Части вместе</b>
      <span>Повторяющиеся припевы и хуки автоматически получают режим «ВСЕ» и окрашиваются цветами всех певцов.</span>
    </div>

    <button id="sendDuetInvites" class="primary wide" ${others.length ? "" : "disabled"}>
      ${others.length ? "Отправить инвайты" : "Некого приглашать"}
    </button>
  `);

  document.querySelector("#sendDuetInvites")?.addEventListener("click", async () => {
    const selectedIds = [...document.querySelectorAll("[data-duet-member]:checked")]
      .map((input) => input.value)
      .slice(0, 3);

    if (!selectedIds.length) {
      toast("Выбери хотя бы одного человека", "warn");
      return;
    }

    try {
      await api("/api/duet/create", {
        method: "POST",
        body: JSON.stringify({
          guildId: state.guildId,
          track: trackPayload(state.selected),
          inviteeIds: selectedIds,
        }),
      });
      close();
      await refreshRoom(true);
      toast("Инвайты отправлены", "ok");
    } catch (error) {
      toast(errorMessage(error.message), "error");
    }
  });

  document.querySelectorAll("[data-duet-member]").forEach((input) => {
    input.addEventListener("change", () => {
      const checked = [...document.querySelectorAll("[data-duet-member]:checked")];
      if (checked.length > 3) {
        input.checked = false;
        toast("Максимум 4 певца вместе с тобой", "warn");
      }
    });
  });
}

async function respondInvite(draftId, accept) {
  try {
    await api("/api/duet/respond", {
      method: "POST",
      body: JSON.stringify({ guildId: state.guildId, draftId, accept }),
    });
    await refreshRoom(true);
    toast(accept ? "Ты в дуо 🎤" : "Инвайт отклонён", accept ? "ok" : "info");
  } catch (error) {
    toast(errorMessage(error.message), "error");
  }
}

async function commitDraft(draftId) {
  try {
    const data = await api("/api/duet/commit", {
      method: "POST",
      body: JSON.stringify({ guildId: state.guildId, draftId }),
    });
    state.room = data.room;
    if (data.started) {
      toast("Дуо запускается", "ok");
      followCurrent();
    } else {
      toast(`Дуо добавлено в очередь: №${data.queuePosition}`, "ok");
      render();
    }
  } catch (error) {
    toast(errorMessage(error.message), "error");
  }
}

async function cancelDraft(draftId) {
  try {
    await api("/api/duet/cancel", {
      method: "POST",
      body: JSON.stringify({ guildId: state.guildId, draftId }),
    });
    await refreshRoom(true);
  } catch (error) {
    toast(errorMessage(error.message), "error");
  }
}

async function removeQueue(queueId) {
  try {
    const data = await api("/api/queue/remove", {
      method: "POST",
      body: JSON.stringify({ guildId: state.guildId, queueId }),
    });
    state.room = {
      current: data.current,
      queue: data.queue,
      myInvites: data.myInvites,
      myDrafts: data.myDrafts,
    };
    render();
  } catch (error) {
    toast(errorMessage(error.message), "error");
  }
}

function followCurrent() {
  if (!state.room.current) return;
  state.mode = "karaoke";
  state.watchingCurrent = true;
  state.activeLyricIndex = -999;
  render();
}

function lyricStyle(line, plan) {
  const singerMap = new Map((plan.singers || []).map((s) => [s.id, s]));
  const assigned = (line.singerIds || []).map((id) => singerMap.get(id)).filter(Boolean);

  if (line.together && assigned.length > 1) {
    const colors = assigned.map((s) => s.color);
    return `--lyric-gradient:linear-gradient(90deg,${colors.join(",")});`;
  }

  const color = assigned[0]?.color || "#f2f2f5";
  return `--lyric-color:${escapeHtml(color)};`;
}

function lyricLabel(line, plan) {
  const singerMap = new Map((plan.singers || []).map((s) => [s.id, s]));
  if (line.together && (line.singerIds || []).length > 1) return "ВСЕ";
  const singer = singerMap.get(line.singerIds?.[0]);
  return singer?.name || "";
}

function renderKaraoke() {
  const current = state.room.current;
  if (!current) {
    state.mode = "library";
    render();
    return;
  }

  const plan = current.lyricPlan || { synced: false, singers: [], lines: [] };
  const owner = current.owner.id === myId();

  app.innerHTML = `
    <main class="karaoke-shell">
      <header class="karaoke-top">
        <button id="backLibrary" class="secondary compact">← Каталог</button>
        <div class="karaoke-track">
          <small>${owner ? "ТВОЯ ПЕСНЯ" : `ПОСТАВИЛ ${escapeHtml(current.owner.name)}`}</small>
          <strong>${escapeHtml(current.track.title)}</strong>
          <span>${escapeHtml(current.track.artist)}</span>
        </div>
        <div class="singer-legend">
          ${(plan.singers || []).map((s) => `<span style="--singer:${escapeHtml(s.color)}"><i></i>${escapeHtml(s.name)}</span>`).join("")}
        </div>
      </header>

      <section class="karaoke-stage">
        <div id="countdownOverlay" class="countdown ${current.status === "countdown" ? "" : "hidden"}">
          <span>ПРИГОТОВЬСЯ</span>
          <strong id="countdownNumber">3</strong>
        </div>

        ${plan.lines.length
          ? plan.synced
            ? `
              <div id="lyricsViewport" class="lyrics-viewport">
                <div class="lyrics-spacer"></div>
                ${plan.lines.map((line) => `
                  <div class="rolling-lyric ${line.together ? "together" : ""}" data-lyric-index="${line.index}" style="${lyricStyle(line, plan)}">
                    <small>${escapeHtml(lyricLabel(line, plan))}</small>
                    <span>${escapeHtml(line.text)}</span>
                  </div>
                `).join("")}
                <div class="lyrics-spacer"></div>
              </div>
            `
            : `
              <div class="manual-wrap">
                <div class="manual-hint">Текст без синхронизации — крути как хочешь</div>
                <div class="manual-lyrics">
                  ${plan.lines.map((line) => `
                    <div class="manual-line ${line.together ? "together" : ""}" style="${lyricStyle(line, plan)}">
                      <small>${escapeHtml(lyricLabel(line, plan))}</small>
                      <span>${escapeHtml(line.text)}</span>
                    </div>
                  `).join("")}
                </div>
              </div>
            `
          : `<div class="no-lyrics"><strong>Текста нет</strong><span>Музыка продолжает играть.</span></div>`}

        <div class="player-card">
          <div class="time-row">
            <span id="currentTime">${formatClock(current.positionMs)}</span>
            <span>${formatDuration(current.track.duration)}</span>
          </div>
          <div class="progress-track"><div id="progressBar" class="progress-bar"></div></div>

          <div class="player-bottom">
            <span id="playbackStatus">${statusLabel(current)}</span>
            ${owner ? `
              <div class="owner-controls">
                <button id="pauseResume" class="secondary compact">${current.status === "paused" ? "▶ Продолжить" : "Ⅱ Пауза"}</button>
                <button id="stopKaraoke" class="danger compact">■ Закончить</button>
              </div>
            ` : `<span class="follow-note">Только ${escapeHtml(current.owner.name)} может остановить песню</span>`}
          </div>
        </div>
      </section>
    </main>
  `;

  document.querySelector("#backLibrary")?.addEventListener("click", () => {
    state.mode = "library";
    state.watchingCurrent = false;
    render();
  });

  document.querySelector("#pauseResume")?.addEventListener("click", togglePause);
  document.querySelector("#stopKaraoke")?.addEventListener("click", stopCurrent);
  updateKaraokeVisuals();
}

function statusLabel(current) {
  const labels = {
    resolving: "Ищем аудио…",
    countdown: "Старт через 3 секунды",
    buffering: "Буферизация…",
    playing: `Играет в ${current.channelName || "voice"}`,
    paused: "Пауза",
    finished: "Песня закончилась",
    error: "Ошибка воспроизведения",
  };
  return labels[current.status] || current.status;
}

function estimatedPositionMs() {
  const current = state.room.current;
  if (!current) return 0;

  const base = Number(current.positionMs) || 0;
  if (current.status !== "playing") return base;

  const sampledAt = Number(current.sampledAt || performance.now());
  return base + Math.max(0, performance.now() - sampledAt);
}

function activeLyricIndex(positionMs, lines) {
  let low = 0;
  let high = lines.length - 1;
  let answer = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (Number(lines[mid].timeMs) <= positionMs) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return answer;
}

function updateKaraokeVisuals() {
  if (state.mode !== "karaoke") return;
  const current = state.room.current;
  if (!current) return;

  const durationMs = Math.max(1, Number(current.track.duration || current.source?.duration || 0) * 1000);
  const positionMs = Math.min(estimatedPositionMs(), durationMs || Infinity);
  const ratio = Math.max(0, Math.min(1, positionMs / durationMs));

  const currentTime = document.querySelector("#currentTime");
  const bar = document.querySelector("#progressBar");
  if (currentTime) currentTime.textContent = formatClock(positionMs);
  if (bar) bar.style.width = `${ratio * 100}%`;

  const plan = current.lyricPlan;
  if (plan?.synced && plan.lines?.length) {
    const index = activeLyricIndex(positionMs, plan.lines);
    if (index !== state.activeLyricIndex) {
      state.activeLyricIndex = index;

      document.querySelectorAll(".rolling-lyric").forEach((line) => {
        const i = Number(line.dataset.lyricIndex);
        line.classList.toggle("active", i === index);
        line.classList.toggle("passed", i < index);
      });

      const viewport = document.querySelector("#lyricsViewport");
      const active = document.querySelector(`[data-lyric-index="${Math.max(0, index)}"]`);
      if (viewport && active) {
        const target = active.offsetTop - viewport.clientHeight / 2 + active.offsetHeight / 2;
        viewport.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
      }
    }
  }

  const overlay = document.querySelector("#countdownOverlay");
  const number = document.querySelector("#countdownNumber");
  if (overlay) {
    const left = Number(current.countdownEndsAt || 0) - Date.now();
    const show = current.status === "countdown" && left > 0;
    overlay.classList.toggle("hidden", !show);
    if (show && number) number.textContent = String(Math.max(1, Math.ceil(left / 1000)));
  }

  const status = document.querySelector("#playbackStatus");
  if (status) status.textContent = statusLabel(current);
}

async function togglePause() {
  const current = state.room.current;
  if (!current) return;
  const route = current.status === "paused" ? "resume" : "pause";

  try {
    await api(`/api/karaoke/${route}`, {
      method: "POST",
      body: JSON.stringify({ guildId: state.guildId }),
    });
    await refreshRoom(false);
  } catch (error) {
    toast(errorMessage(error.message), "error");
  }
}

async function stopCurrent() {
  try {
    await api("/api/karaoke/stop", {
      method: "POST",
      body: JSON.stringify({ guildId: state.guildId }),
    });
    state.mode = "library";
    state.watchingCurrent = false;
    await refreshRoom(true);
  } catch (error) {
    toast(errorMessage(error.message), "error");
  }
}

async function refreshRoom(shouldRender = false) {
  if (!state.guildId || !state.accessToken) return;

  try {
    const oldCurrentId = state.room.current?.id;
    const oldSignature = state.roomSignature || roomSignature(state.room);

    const data = await api(`/api/room/state?guildId=${encodeURIComponent(state.guildId)}`);
    state.room = {
      current: data.current
        ? { ...data.current, sampledAt: performance.now() }
        : null,
      queue: data.queue || [],
      myInvites: data.myInvites || [],
      myDrafts: data.myDrafts || [],
    };

    const newSignature = roomSignature(state.room);
    const roomChanged = oldSignature !== newSignature;
    state.roomSignature = newSignature;

    if (state.mode === "karaoke") {
      if (!state.room.current) {
        state.mode = "library";
        state.watchingCurrent = false;
        render();
        return;
      }

      if (oldCurrentId !== state.room.current.id) {
        state.activeLyricIndex = -999;
        render();
        return;
      }

      updateKaraokeVisuals();
      return;
    }

    if (shouldRender || roomChanged) {
      renderLibraryPreservingSearch();
    }
  } catch (error) {
    console.debug("room poll", error);
  }
}

async function initDiscord() {
  app.innerHTML = `
    <div class="boot">
      <div class="spinner"></div>
      <strong>Запускаем караоке…</strong>
      <span>Подключаемся к Discord</span>
    </div>
  `;

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
  state.auth = await state.sdk.commands.authenticate({
    access_token: state.accessToken,
  });

  if (!state.auth) throw new Error("DISCORD_AUTH_FAILED");

  await refreshRoom(false);
  render();

  state.roomPoll = setInterval(() => refreshRoom(false), 850);
  state.visualTimer = setInterval(updateKaraokeVisuals, 80);
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
        Открывай эту страницу через Discord Activity. Проверь Client Secret и URL Mapping.
      </div>
    </div>
  `;
});
