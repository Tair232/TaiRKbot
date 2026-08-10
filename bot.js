import { Client, GatewayIntentBits, ActivityType } from "discord.js";
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
} from "@discordjs/voice";
import { resolveAudio } from "./audio-provider.js";

const token =
  process.env.DISCORD_TOKEN ||
  process.env.DISCORD_BOT_TOKEN ||
  process.env.BOT_TOKEN;

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
      ["resolving", "buffering", "playing", "paused"].includes(session.status),
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
    // Позже этот же connection.receiver будет слушать певца для оценки нот.
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
    error: null,
    updatedAt: Date.now(),
  };

  player.on(AudioPlayerStatus.Buffering, () => {
    session.status = "buffering";
    session.updatedAt = Date.now();
  });

  player.on(AudioPlayerStatus.Playing, () => {
    session.status = "playing";
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
    if (!["stopped", "error", "idle"].includes(session.status)) {
      session.status = "finished";
    }
    session.updatedAt = Date.now();
  });

  player.on("error", (error) => {
    console.error(`[AUDIO ${guildId}]`, error);
    session.status = "error";
    session.error = error?.message || "AUDIO_PLAYER_ERROR";
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

function publicSession(session) {
  if (!session) {
    return {
      active: false,
      status: "idle",
      positionMs: 0,
      track: null,
      source: null,
    };
  }

  return {
    active: ["resolving", "buffering", "playing", "paused"].includes(session.status),
    status: session.status,
    positionMs: Math.max(0, Number(session.resource?.playbackDuration) || 0),
    track: publicTrack(session.track),
    source: session.source,
    channelId: session.channelId,
    channelName: session.channelName,
    error: session.error,
    updatedAt: session.updatedAt,
  };
}

export async function startKaraoke(guildId, userId, track) {
  const joined = await joinUsersVoiceChannel(guildId, userId);
  const connection = getVoiceConnection(guildId);
  if (!connection) throw new Error("VOICE_CONNECTION_FAILED");

  const session = ensureSession(guildId);
  session.player.stop(true);
  session.resource?.playStream?.destroy?.();
  session.resource = null;
  session.track = publicTrack(track);
  session.source = null;
  session.channelId = joined.channelId;
  session.channelName = joined.channelName;
  session.status = "resolving";
  session.error = null;
  session.updatedAt = Date.now();

  try {
    console.log(`[KARAOKE ${guildId}] Ищем аудио: ${track.artist} — ${track.title}`);
    const audio = await resolveAudio(track);

    session.source = audio.source;
    session.status = "buffering";
    session.updatedAt = Date.now();

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
    session.player.play(resource);

    await entersState(session.player, AudioPlayerStatus.Playing, 20_000);
    console.log(`[KARAOKE ${guildId}] ▶ ${audio.source.title} (${audio.source.videoId})`);
    return publicSession(session);
  } catch (error) {
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
  session.status = "stopped";
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
