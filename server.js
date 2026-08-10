import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";
import {
  addSoloSong,
  cancelDuetDraft,
  commitDuetDraft,
  createDuetDraft,
  getBotState,
  getRoomState,
  getVoiceMembers,
  joinUsersVoiceChannel,
  leaveVoiceChannel,
  pauseKaraoke,
  removeQueuedSong,
  respondDuetDraft,
  resumeKaraoke,
  startBot,
  stopKaraoke,
} from "./bot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || "1536334841631477772";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, bot: getBotState(), clientId: CLIENT_ID });
});

app.get("/api/config", (_req, res) => {
  res.json({ clientId: CLIENT_ID, bot: getBotState() });
});

app.post("/api/token", async (req, res) => {
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  if (!code) return res.status(400).json({ error: "CODE_REQUIRED" });
  if (!CLIENT_SECRET) {
    return res.status(500).json({ error: "DISCORD_CLIENT_SECRET_NOT_CONFIGURED" });
  }

  try {
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.access_token) {
      console.error("[OAUTH] token exchange failed", response.status, data);
      return res.status(502).json({ error: "OAUTH_EXCHANGE_FAILED" });
    }

    res.json({ access_token: data.access_token });
  } catch (error) {
    console.error("[OAUTH]", error);
    res.status(502).json({ error: "OAUTH_NETWORK_ERROR" });
  }
});

async function discordUserFromRequest(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("AUTH_REQUIRED");

  const response = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${match[1]}` },
  });

  if (!response.ok) throw new Error("AUTH_INVALID");
  return response.json();
}

function authStatus(code) {
  if (["AUTH_REQUIRED", "AUTH_INVALID"].includes(code)) return 401;
  if (
    [
      "NOT_SONG_OWNER",
      "DUET_NOT_INVITED",
      "GUILD_NOT_ALLOWED",
      "VOICE_NOT_ALLOWED",
    ].includes(code)
  ) return 403;
  return 400;
}

function hasCyrillic(value = "") {
  return /[А-Яа-яЁё]/.test(value);
}

function normalizeSearch(value = "") {
  return String(value)
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const LAT_TO_RU = [
  ["shch", "щ"], ["sch", "щ"], ["yo", "ё"], ["zh", "ж"], ["kh", "х"],
  ["ts", "ц"], ["ch", "ч"], ["sh", "ш"], ["yu", "ю"], ["ya", "я"],
  ["ye", "е"],
];
function latinToRussian(value = "") {
  let out = String(value).toLowerCase();
  for (const [from, to] of LAT_TO_RU) out = out.replaceAll(from, to);
  const map = {
    a:"а", b:"б", v:"в", g:"г", d:"д", e:"е", z:"з", i:"и", j:"й",
    k:"к", l:"л", m:"м", n:"н", o:"о", p:"п", r:"р", s:"с", t:"т",
    u:"у", f:"ф", h:"х", c:"к", y:"ы", q:"к", w:"в", x:"кс",
  };
  return out.replace(/[a-z]/g, (ch) => map[ch] || ch);
}

function russianToLatin(value = "") {
  const map = {
    а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ё:"yo", ж:"zh", з:"z",
    и:"i", й:"y", к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r",
    с:"s", т:"t", у:"u", ф:"f", х:"h", ц:"ts", ч:"ch", ш:"sh",
    щ:"sch", ъ:"", ы:"y", ь:"", э:"e", ю:"yu", я:"ya",
  };
  return String(value).toLowerCase().replace(/[а-яё]/g, (ch) => map[ch] ?? ch);
}

function normalizeTrack(item) {
  return {
    id: item.id,
    title: item.trackName || item.name || "Без названия",
    artist: item.artistName || "Неизвестный исполнитель",
    album: item.albumName || "",
    duration: Number(item.duration) || 0,
    instrumental: Boolean(item.instrumental),
    hasLyrics: Boolean(item.plainLyrics || item.syncedLyrics),
    hasSyncedLyrics: Boolean(item.syncedLyrics),
    plainLyrics: item.plainLyrics || null,
    syncedLyrics: item.syncedLyrics || null,
  };
}

function tokens(value) {
  return normalizeSearch(value).split(/\s+/).filter(Boolean);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const next = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    next[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(
        next[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = next[j];
  }
  return prev[b.length];
}

function fuzzySimilarity(a, b) {
  const left = normalizeSearch(a);
  const right = normalizeSearch(b);
  if (!left || !right) return 0;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function rankTrack(track, query) {
  const q = normalizeSearch(query);
  const title = normalizeSearch(track.title);
  const artist = normalizeSearch(track.artist);
  const hay = `${artist} ${title}`.trim();
  const qTokens = tokens(q);

  let score = 0;
  if (title === q) score += 150;
  if (hay === q) score += 180;
  if (title.startsWith(q)) score += 80;
  if (artist.startsWith(q)) score += 60;
  if (hay.includes(q)) score += 65;

  let tokenHits = 0;
  for (const token of qTokens) {
    if (title.includes(token)) tokenHits += 1.2;
    else if (artist.includes(token)) tokenHits += 1;
    else if (hay.includes(token)) tokenHits += 0.7;
  }
  score += tokenHits * 28;

  score += Math.max(0, fuzzySimilarity(q, title)) * 45;
  score += Math.max(0, fuzzySimilarity(q, hay)) * 55;

  if (track.hasSyncedLyrics) score += 28;
  else if (track.hasLyrics) score += 10;

  if (hasCyrillic(track.artist)) score += 16;
  if (hasCyrillic(track.title)) score += 14;
  if (track.instrumental) score -= 10;

  return score;
}

const searchCache = new Map();
let lastLrclibRequestAt = 0;

async function lrclibFetch(url) {
  const elapsed = Date.now() - lastLrclibRequestAt;
  if (elapsed < 260) {
    await new Promise((resolve) => setTimeout(resolve, 260 - elapsed));
  }
  lastLrclibRequestAt = Date.now();

  let response = await fetch(url, {
    headers: {
      "User-Agent": `RussianKaraokeDiscord/0.5 (Discord app ${CLIENT_ID})`,
      Accept: "application/json",
    },
  });

  if (response.status === 429) {
    const retryAfter = Math.min(Number(response.headers.get("retry-after") || 1), 4);
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    response = await fetch(url, {
      headers: {
        "User-Agent": `RussianKaraokeDiscord/0.5 (Discord app ${CLIENT_ID})`,
        Accept: "application/json",
      },
    });
  }

  if (!response.ok) throw new Error(`LRCLIB_${response.status}`);
  return response.json();
}

async function searchLrclib(query) {
  const q = String(query).trim();
  const cacheKey = normalizeSearch(q);
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.data;

  const requests = [];
  const seenQueries = new Set();

  function pushQ(value) {
    const cleaned = String(value || "").trim();
    const key = normalizeSearch(cleaned);
    if (cleaned.length >= 2 && !seenQueries.has(key) && requests.length < 3) {
      seenQueries.add(key);
      const url = new URL("https://lrclib.net/api/search");
      url.searchParams.set("q", cleaned);
      requests.push(url);
    }
  }

  pushQ(q);

  const split = q.split(/\s*(?:—|–|-)\s*/).filter(Boolean);
  if (split.length >= 2 && requests.length < 3) {
    const url = new URL("https://lrclib.net/api/search");
    url.searchParams.set("artist_name", split[0]);
    url.searchParams.set("track_name", split.slice(1).join(" "));
    requests.push(url);
  }

  if (/^[a-z0-9\s'".,!()_-]+$/i.test(q)) {
    pushQ(latinToRussian(q));
  } else if (hasCyrillic(q)) {
    pushQ(russianToLatin(q));
  }

  const merged = new Map();

  for (const url of requests) {
    try {
      const raw = await lrclibFetch(url);
      for (const item of Array.isArray(raw) ? raw : []) {
        const track = normalizeTrack(item);
        const key =
          track.id != null
            ? `id:${track.id}`
            : `${normalizeSearch(track.artist)}|${normalizeSearch(track.title)}|${Math.round(track.duration)}`;
        if (!merged.has(key)) merged.set(key, track);
      }
    } catch (error) {
      console.warn("[SEARCH variant]", String(url), error?.message || error);
    }
  }

  const data = [...merged.values()]
    .map((track) => ({ ...track, _score: rankTrack(track, q) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 20)
    .map(({ _score, ...track }) => track);

  searchCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

app.get("/api/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2 || q.length > 120) {
    return res.status(400).json({ error: "QUERY_LENGTH", results: [] });
  }

  try {
    res.json({ results: await searchLrclib(q) });
  } catch (error) {
    console.error("[SEARCH]", error);
    res.status(502).json({ error: "SEARCH_FAILED", results: [] });
  }
});

function cleanTrackPayload(input) {
  const title = String(input?.title || "").trim().slice(0, 180);
  const artist = String(input?.artist || "").trim().slice(0, 180);
  if (!title || !artist) throw new Error("TRACK_INVALID");

  return {
    id: Number.isFinite(Number(input?.id)) ? Number(input.id) : null,
    title,
    artist,
    album: String(input?.album || "").trim().slice(0, 180),
    duration: Math.max(0, Math.min(Number(input?.duration) || 0, 60 * 60)),
    instrumental: Boolean(input?.instrumental),
    plainLyrics: String(input?.plainLyrics || "").slice(0, 40_000) || null,
    syncedLyrics: String(input?.syncedLyrics || "").slice(0, 40_000) || null,
  };
}

app.post("/api/voice/join", async (req, res) => {
  try {
    const user = await discordUserFromRequest(req);
    const guildId = String(req.body?.guildId || "");
    if (!guildId) return res.status(400).json({ error: "GUILD_REQUIRED" });
    const joined = await joinUsersVoiceChannel(guildId, user.id);
    res.json({ ok: true, ...joined });
  } catch (error) {
    const code = error?.message || "VOICE_JOIN_FAILED";
    res.status(authStatus(code)).json({ error: code });
  }
});

app.get("/api/voice/members", async (req, res) => {
  try {
    const user = await discordUserFromRequest(req);
    const guildId = String(req.query.guildId || "");
    if (!guildId) return res.status(400).json({ error: "GUILD_REQUIRED" });
    res.json({ ok: true, ...(await getVoiceMembers(guildId, user.id)) });
  } catch (error) {
    const code = error?.message || "VOICE_MEMBERS_FAILED";
    res.status(authStatus(code)).json({ error: code });
  }
});

app.post("/api/voice/leave", async (req, res) => {
  try {
    const user = await discordUserFromRequest(req);
    const guildId = String(req.body?.guildId || "");
    if (!guildId) return res.status(400).json({ error: "GUILD_REQUIRED" });
    res.json({ ok: true, disconnected: leaveVoiceChannel(guildId, user.id) });
  } catch (error) {
    const code = error?.message || "VOICE_LEAVE_FAILED";
    res.status(authStatus(code)).json({ error: code });
  }
});

app.get("/api/room/state", async (req, res) => {
  try {
    const user = await discordUserFromRequest(req);
    const guildId = String(req.query.guildId || "");
    if (!guildId) return res.status(400).json({ error: "GUILD_REQUIRED" });
    res.json({ ok: true, ...getRoomState(guildId, user.id) });
  } catch (error) {
    const code = error?.message || "ROOM_STATE_FAILED";
    res.status(authStatus(code)).json({ error: code });
  }
});

app.post("/api/song/solo", async (req, res) => {
  try {
    const user = await discordUserFromRequest(req);
    const guildId = String(req.body?.guildId || "");
    const track = cleanTrackPayload(req.body?.track);
    const result = await addSoloSong(guildId, user, track);
    res.json({ ok: true, ...result });
  } catch (error) {
    const code = error?.message || "SONG_ADD_FAILED";
    console.error("[SONG SOLO]", code, error?.cause || "");
    res.status(authStatus(code)).json({ error: code });
  }
});

app.post("/api/duet/create", async (req, res) => {
  try {
    const user = await discordUserFromRequest(req);
    const guildId = String(req.body?.guildId || "");
    const track = cleanTrackPayload(req.body?.track);
    const inviteeIds = Array.isArray(req.body?.inviteeIds) ? req.body.inviteeIds : [];
    const draft = await createDuetDraft(guildId, user, track, inviteeIds);
    res.json({ ok: true, draft });
  } catch (error) {
    const code = error?.message || "DUET_CREATE_FAILED";
    res.status(authStatus(code)).json({ error: code });
  }
});

app.post("/api/duet/respond", async (req, res) => {
  try {
    const user = await discordUserFromRequest(req);
    const guildId = String(req.body?.guildId || "");
    const draftId = String(req.body?.draftId || "");
    const accept = Boolean(req.body?.accept);
    const draft = respondDuetDraft(guildId, user.id, draftId, accept);
    res.json({ ok: true, draft });
  } catch (error) {
    const code = error?.message || "DUET_RESPOND_FAILED";
    res.status(authStatus(code)).json({ error: code });
  }
});

app.post("/api/duet/commit", async (req, res) => {
  try {
    const user = await discordUserFromRequest(req);
    const guildId = String(req.body?.guildId || "");
    const draftId = String(req.body?.draftId || "");
    const result = await commitDuetDraft(guildId, user.id, draftId);
    res.json({ ok: true, ...result });
  } catch (error) {
    const code = error?.message || "DUET_COMMIT_FAILED";
    res.status(authStatus(code)).json({ error: code });
  }
});

app.post("/api/duet/cancel", async (req, res) => {
  try {
    const user = await discordUserFromRequest(req);
    const guildId = String(req.body?.guildId || "");
    const draftId = String(req.body?.draftId || "");
    res.json({ ok: true, cancelled: cancelDuetDraft(guildId, user.id, draftId) });
  } catch (error) {
    const code = error?.message || "DUET_CANCEL_FAILED";
    res.status(authStatus(code)).json({ error: code });
  }
});

app.post("/api/queue/remove", async (req, res) => {
  try {
    const user = await discordUserFromRequest(req);
    const guildId = String(req.body?.guildId || "");
    const queueId = String(req.body?.queueId || "");
    res.json({ ok: true, ...removeQueuedSong(guildId, user.id, queueId) });
  } catch (error) {
    const code = error?.message || "QUEUE_REMOVE_FAILED";
    res.status(authStatus(code)).json({ error: code });
  }
});

for (const [route, handler] of [
  ["pause", pauseKaraoke],
  ["resume", resumeKaraoke],
  ["stop", stopKaraoke],
]) {
  app.post(`/api/karaoke/${route}`, async (req, res) => {
    try {
      const user = await discordUserFromRequest(req);
      const guildId = String(req.body?.guildId || "");
      if (!guildId) return res.status(400).json({ error: "GUILD_REQUIRED" });
      res.json({ ok: true, result: handler(guildId, user.id) });
    } catch (error) {
      const code = error?.message || `KARAOKE_${route.toUpperCase()}_FAILED`;
      res.status(authStatus(code)).json({ error: code });
    }
  });
}

async function buildActivity() {
  console.log("[WEB] Собираю Discord Activity...");
  await viteBuild({ root: __dirname, logLevel: "info" });
  console.log("[WEB] Activity собрана.");
}

await buildActivity();

app.use(express.static(path.join(__dirname, "dist"), {
  etag: true,
  maxAge: "1h",
}));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`[WEB] http://0.0.0.0:${PORT}`);
  try {
    await startBot();
  } catch (error) {
    console.error("[BOT] Не удалось войти:", error);
  }
});
