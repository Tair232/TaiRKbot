import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";
import {
  getBotState,
  joinUsersVoiceChannel,
  leaveVoiceChannel,
  startBot,
} from "./bot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || "1536334841631477772";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

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

    // Не логируем и не сохраняем access token.
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

const searchCache = new Map();
let lastLrclibRequestAt = 0;

function hasCyrillic(value = "") {
  return /[А-Яа-яЁё]/.test(value);
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

function rankRussianTrack(track, q) {
  let score = 0;
  const hay = `${track.artist} ${track.title}`.toLocaleLowerCase("ru-RU");
  const needle = q.toLocaleLowerCase("ru-RU");

  if (hasCyrillic(track.artist)) score += 30;
  if (hasCyrillic(track.title)) score += 25;
  if (track.hasSyncedLyrics) score += 20;
  else if (track.hasLyrics) score += 8;
  if (hay === needle) score += 25;
  if (track.title.toLocaleLowerCase("ru-RU") === needle) score += 15;
  if (hay.includes(needle)) score += 8;
  return score;
}

async function searchLrclib(query) {
  const q = query.trim();
  const cacheKey = q.toLocaleLowerCase("ru-RU");
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.data;

  // LRCLIB просит не спамить запросами: минимальный небольшой интервал.
  const elapsed = Date.now() - lastLrclibRequestAt;
  if (elapsed < 350) await new Promise((r) => setTimeout(r, 350 - elapsed));
  lastLrclibRequestAt = Date.now();

  const url = new URL("https://lrclib.net/api/search");
  url.searchParams.set("q", q);

  let response = await fetch(url, {
    headers: {
      "User-Agent": `RussianKaraokeDiscord/0.1 (Discord app ${CLIENT_ID})`,
      Accept: "application/json",
    },
  });

  if (response.status === 429) {
    const retryAfter = Math.min(Number(response.headers.get("retry-after") || 1), 5);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    response = await fetch(url, {
      headers: {
        "User-Agent": `RussianKaraokeDiscord/0.1 (Discord app ${CLIENT_ID})`,
        Accept: "application/json",
      },
    });
  }

  if (!response.ok) throw new Error(`LRCLIB_${response.status}`);

  const raw = await response.json();
  const data = raw
    .map(normalizeTrack)
    .map((track) => ({ ...track, _score: rankRussianTrack(track, q) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 12)
    .map(({ _score, ...track }) => track);

  searchCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

app.get("/api/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2 || q.length > 100) {
    return res.status(400).json({ error: "QUERY_LENGTH", results: [] });
  }

  try {
    const results = await searchLrclib(q);
    res.json({ results });
  } catch (error) {
    console.error("[SEARCH]", error);
    res.status(502).json({ error: "SEARCH_FAILED", results: [] });
  }
});

app.post("/api/voice/join", async (req, res) => {
  try {
    const user = await discordUserFromRequest(req);
    const guildId = String(req.body?.guildId || "");
    if (!guildId) return res.status(400).json({ error: "GUILD_REQUIRED" });

    const joined = await joinUsersVoiceChannel(guildId, user.id);
    res.json({ ok: true, user: { id: user.id, username: user.username }, ...joined });
  } catch (error) {
    const code = error?.message || "VOICE_JOIN_FAILED";
    const status = ["AUTH_REQUIRED", "AUTH_INVALID"].includes(code) ? 401 : 400;
    console.error("[VOICE JOIN]", code);
    res.status(status).json({ error: code });
  }
});

app.post("/api/voice/leave", async (req, res) => {
  try {
    await discordUserFromRequest(req);
    const guildId = String(req.body?.guildId || "");
    if (!guildId) return res.status(400).json({ error: "GUILD_REQUIRED" });
    res.json({ ok: true, disconnected: leaveVoiceChannel(guildId) });
  } catch (error) {
    const code = error?.message || "VOICE_LEAVE_FAILED";
    res.status(code.startsWith("AUTH_") ? 401 : 400).json({ error: code });
  }
});

async function buildActivity() {
  console.log("[WEB] Собираю Discord Activity...");
  await viteBuild({
    root: __dirname,
    logLevel: "info",
  });
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
