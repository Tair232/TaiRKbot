import { Client, GatewayIntentBits, ActivityType } from "discord.js";
import {
  AudioPlayerStatus,
  EndBehaviorType,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
} from "@discordjs/voice";
import prism from "prism-media";
import { resolveAudio } from "./audio-provider.js";

const token =
  process.env.DISCORD_TOKEN ||
  process.env.DISCORD_BOT_TOKEN ||
  process.env.BOT_TOKEN;

const COUNTDOWN_MS = 3000;
const ANALYSIS_RATE = 16000;
const ANALYSIS_WINDOW = 2048;
const ANALYSIS_STEP = 1024;

export const bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

let loginPromise = null;
const karaokeSessions = new Map();

export async function startBot() {
  if (!token) {
    console.warn("[BOT] Токен не задан. Веб-часть запустится, но бот будет офлайн.");
    return false;
  }

  if (bot.isReady()) return true;
  if (loginPromise) return loginPromise;

  loginPromise = new Promise((resolve, reject) => {
    const onReady = () => {
      bot.user.setActivity("Русское караоке 🎤", {
        type: ActivityType.Playing,
      });
      console.log(`[BOT] Вошёл как ${bot.user.tag}`);
      resolve(true);
    };

    bot.once("clientReady", onReady);
    bot.login(token).catch(reject);
  }).finally(() => {
    loginPromise = null;
  });

  return loginPromise;
}

export function getBotState() {
  return {
    ready: bot.isReady(),
    user: bot.user
      ? { id: bot.user.id, username: bot.user.username, tag: bot.user.tag }
      : null,
    activeKaraokeSessions: [...karaokeSessions.values()].filter((session) =>
      ["resolving", "countdown", "buffering", "playing", "paused"].includes(session.status),
    ).length,
  };
}

export async function joinUsersVoiceChannel(guildId, userId) {
  if (!bot.isReady()) throw new Error("BOT_NOT_READY");

  const guild = bot.guilds.cache.get(guildId);
  if (!guild) throw new Error("GUILD_NOT_FOUND");

  const voiceState = guild.voiceStates.cache.get(userId);
  const channel = voiceState?.channel;

  if (!channel) throw new Error("USER_NOT_IN_VOICE");
  if (!channel.joinable) throw new Error("CHANNEL_NOT_JOINABLE");
  if (!channel.speakable) throw new Error("CHANNEL_NOT_SPEAKABLE");

  const previous = getVoiceConnection(guild.id);
  if (previous && previous.joinConfig.channelId === channel.id) {
    return { channelId: channel.id, channelName: channel.name, reused: true };
  }

  if (previous) previous.destroy();

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    // Обязательно false: receiver нужен для оценки голоса певца.
    selfDeaf: false,
    selfMute: false,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  } catch (error) {
    connection.destroy();
    throw new Error("VOICE_CONNECTION_FAILED", { cause: error });
  }

  return { channelId: channel.id, channelName: channel.name, reused: false };
}

function currentPositionMs(session) {
  const live = Math.max(0, Number(session.resource?.playbackDuration) || 0);
  if (live > 0) session.lastPositionMs = live;
  return Math.max(0, live || Number(session.lastPositionMs) || 0);
}

function freshScore() {
  return {
    compared: 0,
    pitchSum: 0,
    timingSum: 0,
    confidenceSum: 0,
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
    combo: 0,
    maxCombo: 0,
    live: null,
    startedAt: null,
    finalized: false,
    result: null,
  };
}

function ensureSession(guildId) {
  let session = karaokeSessions.get(guildId);
  if (session) return session;

  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Pause,
    },
  });

  session = {
    guildId,
    player,
    resource: null,
    status: "idle",
    track: null,
    source: null,
    channelId: null,
    channelName: null,
    singerId: null,
    error: null,
    updatedAt: Date.now(),
    countdownEndsAt: null,
    countdownTimer: null,
    generation: 0,
    lastPositionMs: 0,
    referencePitches: [],
    referenceStream: null,
    capture: null,
    score: freshScore(),
  };

  player.on(AudioPlayerStatus.Buffering, () => {
    if (session.status !== "countdown") session.status = "buffering";
    session.updatedAt = Date.now();
  });

  player.on(AudioPlayerStatus.Playing, () => {
    session.status = "playing";
    session.countdownEndsAt = null;
    session.score.startedAt ||= Date.now();
    session.updatedAt = Date.now();
  });

  player.on(AudioPlayerStatus.Paused, () => {
    session.status = "paused";
    session.updatedAt = Date.now();
  });

  player.on(AudioPlayerStatus.AutoPaused, () => {
    session.status = "paused";
    session.updatedAt = Date.now();
  });

  player.on(AudioPlayerStatus.Idle, () => {
    currentPositionMs(session);
    if (!["stopped", "error", "idle"].includes(session.status)) {
      session.status = "finished";
      finalizeScore(session);
    }
    stopSingerCapture(session);
    session.updatedAt = Date.now();
  });

  player.on("error", (error) => {
    console.error(`[AUDIO ${guildId}]`, error);
    currentPositionMs(session);
    session.status = "error";
    session.error = error?.message || "AUDIO_PLAYER_ERROR";
    stopSingerCapture(session);
    session.updatedAt = Date.now();
  });

  karaokeSessions.set(guildId, session);
  return session;
}

function publicTrack(track) {
  if (!track) return null;
  return {
    id: track.id ?? null,
    title: track.title,
    artist: track.artist,
    album: track.album || "",
    duration: Number(track.duration) || 0,
    instrumental: Boolean(track.instrumental),
  };
}

function publicScore(session) {
  const score = session?.score;
  if (!score) return null;
  return {
    compared: score.compared,
    combo: score.combo,
    maxCombo: score.maxCombo,
    perfect: score.perfect,
    great: score.great,
    good: score.good,
    miss: score.miss,
    live: score.live,
    result: score.result,
  };
}

function publicSession(session) {
  if (!session) {
    return {
      active: false,
      status: "idle",
      positionMs: 0,
      track: null,
      source: null,
      score: null,
    };
  }

  return {
    active: ["resolving", "countdown", "buffering", "playing", "paused"].includes(session.status),
    status: session.status,
    positionMs: currentPositionMs(session),
    track: publicTrack(session.track),
    source: session.source,
    channelId: session.channelId,
    channelName: session.channelName,
    countdownEndsAt: session.countdownEndsAt,
    score: publicScore(session),
    error: session.error,
    updatedAt: session.updatedAt,
  };
}

function estimatePitch(buffer, sampleRate = ANALYSIS_RATE) {
  const count = Math.floor(buffer.length / 2);
  if (count < 512) return null;

  const samples = new Float64Array(count);
  let mean = 0;
  for (let i = 0; i < count; i += 1) {
    const value = buffer.readInt16LE(i * 2) / 32768;
    samples[i] = value;
    mean += value;
  }
  mean /= count;

  let energy = 0;
  for (let i = 0; i < count; i += 1) {
    samples[i] -= mean;
    energy += samples[i] * samples[i];
  }
  const rms = Math.sqrt(energy / count);
  if (rms < 0.012) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / 950));
  const maxLag = Math.min(count - 2, Math.ceil(sampleRate / 70));
  let bestLag = 0;
  let bestCorr = -1;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let xy = 0;
    let xx = 0;
    let yy = 0;
    const limit = count - lag;
    for (let i = 0; i < limit; i += 1) {
      const a = samples[i];
      const b = samples[i + lag];
      xy += a * b;
      xx += a * a;
      yy += b * b;
    }
    const corr = xy / Math.sqrt(Math.max(1e-12, xx * yy));
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  if (!bestLag || bestCorr < 0.46) return null;

  return {
    hz: sampleRate / bestLag,
    confidence: Math.max(0, Math.min(1, (bestCorr - 0.42) / 0.58)),
    rms,
  };
}

class PitchWindowTracker {
  constructor(onPitch) {
    this.onPitch = onPitch;
    this.pending = Buffer.alloc(0);
    this.sampleCursor = 0;
  }

  push(chunk) {
    if (!chunk?.length) return;
    this.pending = this.pending.length
      ? Buffer.concat([this.pending, chunk])
      : Buffer.from(chunk);

    const windowBytes = ANALYSIS_WINDOW * 2;
    const stepBytes = ANALYSIS_STEP * 2;

    while (this.pending.length >= windowBytes) {
      const window = this.pending.subarray(0, windowBytes);
      const pitch = estimatePitch(window);
      const timeMs = ((this.sampleCursor + ANALYSIS_WINDOW / 2) / ANALYSIS_RATE) * 1000;
      if (pitch) this.onPitch(pitch, timeMs);
      this.pending = this.pending.subarray(stepBytes);
      this.sampleCursor += ANALYSIS_STEP;
    }
  }
}

function downsampleDiscordPcm(chunk) {
  // Discord decoder: 48 kHz stereo signed 16-bit. Берём каждую третью stereo frame -> 16 kHz mono.
  const frames = Math.floor(chunk.length / 4);
  const outFrames = Math.floor(frames / 3);
  const out = Buffer.allocUnsafe(outFrames * 2);
  let outIndex = 0;

  for (let frame = 0; frame + 2 < frames; frame += 3) {
    const byte = frame * 4;
    const left = chunk.readInt16LE(byte);
    const right = chunk.readInt16LE(byte + 2);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((left + right) / 2))), outIndex * 2);
    outIndex += 1;
  }

  return out.subarray(0, outIndex * 2);
}

function pitchClassCents(aHz, bHz) {
  if (!(aHz > 0) || !(bHz > 0)) return 600;
  const raw = Math.abs(1200 * Math.log2(aHz / bHz));
  const mod = raw % 1200;
  return Math.min(mod, 1200 - mod);
}

function findReferenceMatches(points, positionMs, userHz) {
  if (!points.length) return null;
  const radius = 320;
  let best = null;

  // referencePitches отсортирован по времени. С конца обычно быстрее, т.к. playback идёт вперёд.
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    const offset = point.timeMs - positionMs;
    if (offset < -radius) break;
    if (offset > radius) continue;

    const cents = pitchClassCents(userHz, point.hz);
    const candidate = { ...point, cents, offsetMs: offset };
    if (
      !best ||
      candidate.cents < best.cents - 4 ||
      (Math.abs(candidate.cents - best.cents) <= 4 && Math.abs(candidate.offsetMs) < Math.abs(best.offsetMs))
    ) {
      best = candidate;
    }
  }

  return best;
}

function pitchPoints(cents) {
  if (cents <= 35) return { value: 100, verdict: "PERFECT" };
  if (cents <= 80) return { value: 91, verdict: "GREAT" };
  if (cents <= 150) return { value: 74, verdict: "GOOD" };
  if (cents <= 240) return { value: 42, verdict: "MISS" };
  return { value: 0, verdict: "MISS" };
}

function timingPoints(offsetMs) {
  const diff = Math.abs(offsetMs);
  if (diff <= 60) return 100;
  if (diff <= 120) return 88;
  if (diff <= 200) return 68;
  if (diff <= 260) return 46;
  return 25;
}

function addSingerPitch(session, pitch) {
  if (session.status !== "playing") return;
  const positionMs = currentPositionMs(session);
  const match = findReferenceMatches(session.referencePitches, positionMs, pitch.hz);
  if (!match) return;

  const scored = pitchPoints(match.cents);
  const timing = timingPoints(match.offsetMs);
  const score = session.score;

  score.compared += 1;
  score.pitchSum += scored.value;
  score.timingSum += timing;
  score.confidenceSum += pitch.confidence * 100;

  const key = scored.verdict.toLowerCase();
  score[key] += 1;

  if (scored.verdict === "MISS") {
    score.combo = 0;
  } else {
    score.combo += 1;
    score.maxCombo = Math.max(score.maxCombo, score.combo);
  }

  score.live = {
    verdict: scored.verdict,
    cents: Math.round(match.cents),
    combo: score.combo,
    accuracy: Math.round(score.pitchSum / score.compared),
  };
}

function beginReferenceAnalysis(session, stream) {
  session.referencePitches = [];
  session.referenceStream = stream || null;
  if (!stream) return;

  const tracker = new PitchWindowTracker((pitch, timeMs) => {
    if (pitch.confidence < 0.22) return;
    session.referencePitches.push({
      timeMs,
      hz: pitch.hz,
      confidence: pitch.confidence,
    });
  });

  stream.on("data", (chunk) => tracker.push(chunk));
  stream.on("error", (error) => {
    console.warn(`[SCORE ${session.guildId}] reference stream:`, error?.message || error);
  });
}

function startSingerCapture(session, connection, userId) {
  stopSingerCapture(session);

  try {
    const opusStream = connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.Manual },
    });
    const decoder = new prism.opus.Decoder({
      rate: 48000,
      channels: 2,
      frameSize: 960,
    });
    const tracker = new PitchWindowTracker((pitch) => addSingerPitch(session, pitch));

    opusStream.pipe(decoder);
    decoder.on("data", (chunk) => tracker.push(downsampleDiscordPcm(chunk)));
    decoder.on("error", (error) => {
      console.warn(`[SCORE ${session.guildId}] decoder:`, error?.message || error);
    });
    opusStream.on("error", (error) => {
      console.warn(`[SCORE ${session.guildId}] receive:`, error?.message || error);
    });

    session.capture = { opusStream, decoder };
    console.log(`[SCORE ${session.guildId}] Слушаем певца ${userId}`);
  } catch (error) {
    console.warn(`[SCORE ${session.guildId}] Не удалось включить оценку:`, error);
    session.capture = null;
  }
}

function stopSingerCapture(session) {
  const capture = session?.capture;
  if (!capture) return;
  session.capture = null;
  try { capture.opusStream?.destroy?.(); } catch {}
  try { capture.decoder?.destroy?.(); } catch {}
}

function stopReferenceAnalysis(session) {
  try { session?.referenceStream?.destroy?.(); } catch {}
  if (session) session.referenceStream = null;
}

function gradeForScore(total) {
  if (total >= 95) return "S+";
  if (total >= 90) return "S";
  if (total >= 82) return "A";
  if (total >= 72) return "B";
  if (total >= 60) return "C";
  return "D";
}

function finalizeScore(session) {
  const score = session.score;
  if (!score || score.finalized) return score?.result || null;
  score.finalized = true;

  const compared = score.compared;
  if (compared < 8) {
    score.result = {
      available: false,
      reason: "TOO_LITTLE_VOICE",
      compared,
      total: 0,
      grade: "—",
    };
    return score.result;
  }

  const pitch = score.pitchSum / compared;
  const timing = score.timingSum / compared;
  const stability = score.confidenceSum / compared;

  const elapsedMs = Math.max(1, currentPositionMs(session));
  const voicedMs = compared * (ANALYSIS_STEP / ANALYSIS_RATE) * 1000;
  const expectedVoicedMs = Math.max(10_000, elapsedMs * 0.24);
  const participation = Math.max(0, Math.min(1, voicedMs / expectedVoicedMs));

  const raw = pitch * 0.7 + timing * 0.2 + stability * 0.1;
  const total = Math.round(Math.max(0, Math.min(100, raw * (0.2 + participation * 0.8))));

  score.result = {
    available: true,
    beta: true,
    total,
    points: total * 1000,
    grade: gradeForScore(total),
    pitch: Math.round(pitch),
    timing: Math.round(timing),
    stability: Math.round(stability),
    participation: Math.round(participation * 100),
    compared,
    perfect: score.perfect,
    great: score.great,
    good: score.good,
    miss: score.miss,
    maxCombo: score.maxCombo,
  };

  console.log(`[SCORE ${session.guildId}] ${score.result.points} / ${score.result.grade}`, score.result);
  return score.result;
}

function clearCountdown(session) {
  if (session.countdownTimer) clearTimeout(session.countdownTimer);
  session.countdownTimer = null;
  session.countdownEndsAt = null;
}

function resetSessionForTrack(session, track, joined, userId) {
  clearCountdown(session);
  stopSingerCapture(session);
  stopReferenceAnalysis(session);
  session.player.stop(true);
  session.resource?.playStream?.destroy?.();

  session.resource = null;
  session.track = publicTrack(track);
  session.source = null;
  session.channelId = joined.channelId;
  session.channelName = joined.channelName;
  session.singerId = userId;
  session.status = "resolving";
  session.error = null;
  session.lastPositionMs = 0;
  session.referencePitches = [];
  session.score = freshScore();
  session.generation += 1;
  session.updatedAt = Date.now();
}

export async function startKaraoke(guildId, userId, track) {
  const joined = await joinUsersVoiceChannel(guildId, userId);
  const connection = getVoiceConnection(guildId);
  if (!connection) throw new Error("VOICE_CONNECTION_FAILED");

  const session = ensureSession(guildId);
  resetSessionForTrack(session, track, joined, userId);
  const generation = session.generation;

  try {
    console.log(`[KARAOKE ${guildId}] Ищем аудио: ${track.artist} — ${track.title}`);
    const audio = await resolveAudio(track);

    if (session.generation !== generation) throw new Error("KARAOKE_REPLACED");

    session.source = audio.source;
    beginReferenceAnalysis(session, audio.referencePcm);

    const resource = createAudioResource(audio.stream, {
      inputType: audio.inputType,
      metadata: {
        guildId,
        track: session.track,
        source: audio.source,
      },
    });

    session.resource = resource;
    connection.subscribe(session.player);

    session.status = "countdown";
    session.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    session.updatedAt = Date.now();

    session.countdownTimer = setTimeout(() => {
      session.countdownTimer = null;
      if (session.generation !== generation || session.status !== "countdown") return;

      session.status = "buffering";
      session.countdownEndsAt = null;
      session.updatedAt = Date.now();
      startSingerCapture(session, connection, userId);
      session.player.play(resource);
      console.log(`[KARAOKE ${guildId}] ▶ ${audio.source.title} (${audio.source.videoId})`);
    }, COUNTDOWN_MS);

    return publicSession(session);
  } catch (error) {
    clearCountdown(session);
    stopSingerCapture(session);
    stopReferenceAnalysis(session);
    session.player.stop(true);
    session.resource?.playStream?.destroy?.();
    session.status = "error";
    session.error = error?.message || "KARAOKE_START_FAILED";
    session.updatedAt = Date.now();
    console.error(`[KARAOKE ${guildId}] Не удалось запустить:`, error);
    throw error;
  }
}

export function getKaraokeState(guildId) {
  return publicSession(karaokeSessions.get(guildId));
}

export function pauseKaraoke(guildId) {
  const session = karaokeSessions.get(guildId);
  if (!session) throw new Error("KARAOKE_NOT_ACTIVE");
  if (session.status !== "playing") return publicSession(session);
  currentPositionMs(session);
  session.player.pause(true);
  session.status = "paused";
  session.updatedAt = Date.now();
  return publicSession(session);
}

export function resumeKaraoke(guildId) {
  const session = karaokeSessions.get(guildId);
  if (!session) throw new Error("KARAOKE_NOT_ACTIVE");
  if (session.status !== "paused") return publicSession(session);
  session.player.unpause();
  session.status = "playing";
  session.updatedAt = Date.now();
  return publicSession(session);
}

export function stopKaraoke(guildId) {
  const session = karaokeSessions.get(guildId);
  if (!session) return publicSession(null);

  currentPositionMs(session);
  clearCountdown(session);
  if (["playing", "paused", "buffering"].includes(session.status)) finalizeScore(session);
  session.status = "stopped";
  stopSingerCapture(session);
  stopReferenceAnalysis(session);
  session.player.stop(true);
  session.resource?.playStream?.destroy?.();
  session.resource = null;
  session.updatedAt = Date.now();
  return publicSession(session);
}

export function leaveVoiceChannel(guildId) {
  stopKaraoke(guildId);
  const connection = getVoiceConnection(guildId);
  if (!connection) return false;
  connection.destroy();
  return true;
}
