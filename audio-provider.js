import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { StreamType } from "@discordjs/voice";

const execFileAsync = promisify(execFile);

const resolveCache = new Map();
const CACHE_TTL = 6 * 60 * 60_000;

function normalize(value = "") {
  return String(value)
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function tokens(value) {
  return new Set(
    normalize(value)
      .split(/\s+/)
      .filter((item) => item.length > 1),
  );
}

function tokenOverlap(a, b) {
  const left = tokens(a);
  const right = tokens(b);

  if (!left.size || !right.size) return 0;

  let same = 0;
  for (const token of left) {
    if (right.has(token)) same += 1;
  }

  return same / Math.max(left.size, right.size);
}

function scoreCandidate(candidate, track) {
  if (!candidate.videoId || candidate.isLive) return -10_000;

  const wantedTitle = normalize(track.title);
  const wantedArtist = normalize(track.artist);
  const title = normalize(candidate.title);
  const author = normalize(candidate.author);
  const all = `${title} ${author}`;

  let score = 0;

  score += tokenOverlap(candidate.title, track.title) * 90;
  score += tokenOverlap(
    `${candidate.title} ${candidate.author}`,
    track.artist,
  ) * 55;

  if (wantedTitle && title.includes(wantedTitle)) score += 45;
  if (wantedArtist && all.includes(wantedArtist)) score += 35;

  const targetDuration = Number(track.duration) || 0;
  if (targetDuration && candidate.duration) {
    const diff = Math.abs(targetDuration - candidate.duration);

    if (diff <= 3) score += 65;
    else if (diff <= 7) score += 45;
    else if (diff <= 15) score += 20;
    else if (diff <= 30) score -= 15;
    else score -= 80;
  }

  const searchText = `${candidate.title} ${candidate.author}`;

  if (/official audio|topic|официальн|provided to youtube/i.test(searchText)) {
    score += 16;
  }

  if (
    /cover|кавер|nightcore|sped up|slowed|remix|ремикс|live|concert|концерт|reaction|реакц/i.test(
      candidate.title,
    )
  ) {
    score -= 45;
  }

  if (
    /karaoke|караоке|instrumental|минус/i.test(candidate.title) &&
    !track.instrumental
  ) {
    score -= 55;
  }

  return score;
}

function entryToCandidate(entry) {
  return {
    videoId: String(entry?.id || entry?.url || ""),
    title: String(entry?.title || ""),
    author: String(
      entry?.channel ||
        entry?.uploader ||
        entry?.channel_name ||
        entry?.uploader_id ||
        "YouTube",
    ),
    duration: Number(entry?.duration) || 0,
    isLive: Boolean(entry?.is_live || entry?.live_status === "is_live"),
    thumbnail:
      entry?.thumbnail ||
      (Array.isArray(entry?.thumbnails)
        ? entry.thumbnails.at(-1)?.url
        : null) ||
      null,
  };
}

async function findBestCandidate(track) {
  const key = `${normalize(track.artist)}|${normalize(track.title)}|${Math.round(
    Number(track.duration) || 0,
  )}`;

  const cached = resolveCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return cached.value;
  }

  const query = `${track.artist} ${track.title}`.trim();

  console.log(`[AUDIO] yt-dlp search: ${query}`);

  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      "yt-dlp",
      [
        "--flat-playlist",
        "--dump-single-json",
        "--no-warnings",
        "--no-playlist",
        `ytsearch12:${query}`,
      ],
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        timeout: 30_000,
      },
    ));
  } catch (error) {
    console.error("[AUDIO] Ошибка поиска yt-dlp:", error?.stderr || error);
    throw new Error("AUDIO_SEARCH_FAILED", { cause: error });
  }

  let data;
  try {
    data = JSON.parse(stdout);
  } catch (error) {
    throw new Error("AUDIO_SEARCH_BAD_RESPONSE", { cause: error });
  }

  const entries = Array.isArray(data?.entries) ? data.entries : [];

  const ranked = entries
    .map(entryToCandidate)
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate, track),
    }))
    .filter((candidate) => candidate.videoId)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  if (!best || best.score < -100) {
    throw new Error("AUDIO_NOT_FOUND");
  }

  console.log(
    `[AUDIO] Выбрано: ${best.title} — ${best.author} (${best.duration || "?"} сек, score ${Math.round(best.score)})`,
  );

  resolveCache.set(key, {
    at: Date.now(),
    value: best,
  });

  return best;
}

function makeTailCollector(limit = 12_000) {
  let value = "";

  return {
    push(chunk) {
      value += chunk.toString("utf8");
      if (value.length > limit) value = value.slice(-limit);
    },
    get() {
      return value.trim();
    },
  };
}

function killProcess(child) {
  if (!child || child.killed) return;

  try {
    child.kill("SIGKILL");
  } catch {
    // Уже завершён.
  }
}

async function createOggOpusStream(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const ytErr = makeTailCollector();
  const ffErr = makeTailCollector();

  const downloader = spawn(
    "yt-dlp",
    [
      "--no-playlist",
      "--no-warnings",
      "--quiet",
      "--force-ipv4",
      "--js-runtimes",
      "node",
      "-f",
      "bestaudio/best",
      "-o",
      "-",
      url,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  /*
   * ВАЖНО:
   * Раньше здесь FFmpeg отдавал raw PCM (s16le).
   * Тогда @discordjs/voice должен был сам кодировать PCM -> Opus,
   * из-за чего требовался @discordjs/opus/opusscript.
   *
   * Теперь FFmpeg сам кодирует звук в Opus и заворачивает его в Ogg.
   * Discord.js только демультиплексирует готовые Opus-пакеты.
   */
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-vn",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-c:a",
      "libopus",
      "-b:a",
      "128k",
      "-vbr",
      "on",
      "-application",
      "audio",
      "-f",
      "ogg",
      "pipe:1",
    ],
    {
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  downloader.stderr.on("data", (chunk) => ytErr.push(chunk));
  ffmpeg.stderr.on("data", (chunk) => ffErr.push(chunk));

  ffmpeg.stdin.on("error", () => {});
  downloader.stdout.on("error", () => {});

  downloader.stdout.pipe(ffmpeg.stdin);

  const cleanup = () => {
    killProcess(downloader);
    killProcess(ffmpeg);
  };

  ffmpeg.stdout.once("close", cleanup);
  ffmpeg.stdout.once("error", cleanup);

  await new Promise((resolve, reject) => {
    let settled = false;

    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      downloader.off("exit", onDownloaderExit);
      ffmpeg.off("exit", onFfmpegExit);
      ffmpeg.stdout.off("readable", onReadable);
      fn(value);
    };

    const fail = (message, cause) => {
      cleanup();
      const error = new Error(message, { cause });
      error.ytdlp = ytErr.get();
      error.ffmpeg = ffErr.get();
      done(reject, error);
    };

    const onReadable = () => done(resolve);

    const onDownloaderExit = (code, signal) => {
      if (code === 0) return;

      fail(
        "AUDIO_DOWNLOAD_FAILED",
        new Error(
          `yt-dlp exit=${code} signal=${signal || "-"}\n${ytErr.get()}`,
        ),
      );
    };

    const onFfmpegExit = (code, signal) => {
      if (code === 0) return;

      fail(
        "AUDIO_TRANSCODE_FAILED",
        new Error(
          `ffmpeg exit=${code} signal=${signal || "-"}\n${ffErr.get()}`,
        ),
      );
    };

    ffmpeg.stdout.once("readable", onReadable);
    downloader.once("exit", onDownloaderExit);
    ffmpeg.once("exit", onFfmpegExit);

    const timer = setTimeout(() => {
      fail(
        "AUDIO_START_TIMEOUT",
        new Error(
          `Не получили аудио за 30 секунд.\nyt-dlp: ${ytErr.get()}\nffmpeg: ${ffErr.get()}`,
        ),
      );
    }, 30_000);
  });

  return ffmpeg.stdout;
}

export async function resolveAudio(track) {
  if (!track?.title || !track?.artist) {
    throw new Error("TRACK_INVALID");
  }

  const candidate = await findBestCandidate(track);
  const stream = await createOggOpusStream(candidate.videoId);

  return {
    stream,

    // Ключевой фикс: это уже готовый Opus в Ogg, а НЕ raw PCM.
    inputType: StreamType.OggOpus,

    source: {
      provider: "youtube-yt-dlp",
      videoId: candidate.videoId,
      title: candidate.title,
      author: candidate.author,
      duration: candidate.duration,
      thumbnail: candidate.thumbnail,
    },
  };
}
