import { randomUUID } from "node:crypto";
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

const COUNTDOWN_MS = 3000;
const SINGER_COLORS = ["#a970ff", "#45d9ff", "#ff9d4d", "#5ee08b"];

export const ALLOWED_GUILD_IDS = new Set([
  "1492151172570808390",
  "1408910162579816571",
]);

export const ALLOWED_VOICE_CHANNEL_IDS = new Set([
  "1408910163238457489",
  "1536348043081949357",
]);

function assertAllowedGuild(guildId) {
  if (!ALLOWED_GUILD_IDS.has(String(guildId))) {
    throw new Error("GUILD_NOT_ALLOWED");
  }
}

function assertAllowedVoice(channelId) {
  if (!ALLOWED_VOICE_CHANNEL_IDS.has(String(channelId))) {
    throw new Error("VOICE_NOT_ALLOWED");
  }
}

async function leaveUnauthorizedGuilds() {
  for (const guild of bot.guilds.cache.values()) {
    if (ALLOWED_GUILD_IDS.has(guild.id)) continue;
    try {
      console.log(`[BOT] Покидаю неразрешённый сервер: ${guild.name} (${guild.id})`);
      await guild.leave();
    } catch (error) {
      console.warn(`[BOT] Не удалось покинуть сервер ${guild.id}:`, error?.message || error);
    }
  }
}

export const bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

let loginPromise = null;
const rooms = new Map();

export async function startBot() {
  if (!token) {
    console.warn("[BOT] Токен не задан. Веб-часть запустится, но бот будет офлайн.");
    return false;
  }

  if (bot.isReady()) return true;
  if (loginPromise) return loginPromise;

  loginPromise = new Promise((resolve, reject) => {
    bot.once("clientReady", async () => {
      bot.user.setActivity("Русское караоке 🎤", { type: ActivityType.Playing });
      console.log(`[BOT] Вошёл как ${bot.user.tag}`);
      await leaveUnauthorizedGuilds();
      resolve(true);
    });
    bot.login(token).catch(reject);
  }).finally(() => {
    loginPromise = null;
  });

  return loginPromise;
}

function userLabel(memberOrUser) {
  return (
    memberOrUser?.displayName ||
    memberOrUser?.globalName ||
    memberOrUser?.username ||
    "Discord"
  );
}

function roomFor(guildId) {
  assertAllowedGuild(guildId);

  let room = rooms.get(guildId);
  if (room) return room;

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });

  room = {
    guildId,
    player,
    current: null,
    queue: [],
    drafts: new Map(),
    advancing: false,
  };

  player.on(AudioPlayerStatus.Buffering, () => {
    if (room.current && room.current.status !== "countdown") {
      room.current.status = "buffering";
      room.current.updatedAt = Date.now();
    }
  });

  player.on(AudioPlayerStatus.Playing, () => {
    if (!room.current) return;
    room.current.status = "playing";
    room.current.countdownEndsAt = null;
    room.current.updatedAt = Date.now();
  });

  player.on(AudioPlayerStatus.Paused, () => {
    if (!room.current) return;
    room.current.status = "paused";
    room.current.updatedAt = Date.now();
  });

  player.on(AudioPlayerStatus.AutoPaused, () => {
    if (!room.current) return;
    room.current.status = "paused";
    room.current.updatedAt = Date.now();
  });

  player.on(AudioPlayerStatus.Idle, () => {
    const current = room.current;
    if (!current) return;

    if (!["stopped", "error"].includes(current.status)) {
      current.lastPositionMs = currentPositionMs(current);
      current.status = "finished";
      current.updatedAt = Date.now();
    }

    const currentId = current.id;
    setTimeout(() => {
      if (room.current?.id !== currentId) return;
      room.current = null;
      void advanceQueue(room);
    }, 850);
  });

  player.on("error", (error) => {
    console.error(`[AUDIO ${guildId}]`, error);
    if (!room.current) return;
    room.current.lastPositionMs = currentPositionMs(room.current);
    room.current.status = "error";
    room.current.error = error?.message || "AUDIO_PLAYER_ERROR";
    room.current.updatedAt = Date.now();

    const currentId = room.current.id;
    setTimeout(() => {
      if (room.current?.id !== currentId) return;
      room.current = null;
      void advanceQueue(room);
    }, 900);
  });

  rooms.set(guildId, room);
  return room;
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
    hasLyrics: Boolean(track.plainLyrics || track.syncedLyrics),
    hasSyncedLyrics: Boolean(track.syncedLyrics),
  };
}

function publicSinger(singer, index = 0) {
  return {
    id: singer.id,
    name: singer.name || "Discord",
    color: singer.color || SINGER_COLORS[index % SINGER_COLORS.length],
  };
}

function currentPositionMs(current) {
  const live = Math.max(0, Number(current?.resource?.playbackDuration) || 0);
  if (current && live > 0) current.lastPositionMs = live;
  return Math.max(0, live || Number(current?.lastPositionMs) || 0);
}

function parseSyncedLyrics(source = "") {
  return String(source)
    .split("\n")
    .map((line) => {
      const match = line.match(/^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/);
      if (!match) return null;
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = Number((match[3] || "0").padEnd(3, "0").slice(0, 3));
      return {
        timeMs: (minutes * 60 + seconds) * 1000 + fraction,
        text: match[4].trim() || "♪",
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timeMs - b.timeMs);
}

function parsePlainLyrics(source = "") {
  return String(source)
    .split("\n")
    .map((line) => line.replace(/^\[\d{1,3}:\d{2}(?:[.:]\d+)?\]\s*/, "").trim())
    .filter(Boolean)
    .map((text, index) => ({ text, index }));
}

function normalizeLyric(value = "") {
  return String(value)
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function buildLyricPlan(track, singers) {
  const safeSingers = singers.length
    ? singers.slice(0, 4).map((singer, index) => ({
        ...singer,
        color: SINGER_COLORS[index],
      }))
    : [];

  const synced = parseSyncedLyrics(track.syncedLyrics || "");
  const source = synced.length ? synced : parsePlainLyrics(track.plainLyrics || "");
  const allIds = safeSingers.map((singer) => singer.id);

  if (!source.length) {
    return {
      synced: false,
      singers: safeSingers.map(publicSinger),
      lines: [],
    };
  }

  const frequency = new Map();
  for (const line of source) {
    const key = normalizeLyric(line.text);
    if (key.length >= 4) frequency.set(key, (frequency.get(key) || 0) + 1);
  }

  const occurrence = new Map();
  const lineBlock = safeSingers.length >= 4 ? 4 : safeSingers.length === 3 ? 5 : 6;
  let sectionSinger = 0;
  let inBlock = 0;
  let previousTime = null;

  const lines = source.map((line, index) => {
    const key = normalizeLyric(line.text);
    const repeatCount = frequency.get(key) || 0;
    const repeatIndex = occurrence.get(key) || 0;
    occurrence.set(key, repeatIndex + 1);

    const gap =
      synced.length && previousTime != null
        ? Number(line.timeMs) - Number(previousTime)
        : 0;

    const strongBreak = index > 0 && (gap > 3400 || inBlock >= lineBlock);
    if (strongBreak) {
      sectionSinger = safeSingers.length
        ? (sectionSinger + 1) % safeSingers.length
        : 0;
      inBlock = 0;
    }

    const hookLike =
      /^(о+|а+|эй|ла[\s-]?ла|на[\s-]?на|у+|yeah|hey)\b/i.test(key);

    // Повторяющийся припев: первая версия идёт одному человеку,
    // вторая/четвёртая и т.д. — всем вместе.
    const together =
      safeSingers.length > 1 &&
      (
        hookLike ||
        (repeatCount >= 2 && repeatIndex % 2 === 1)
      );

    const singerIds = together
      ? allIds
      : safeSingers.length
        ? [safeSingers[sectionSinger].id]
        : [];

    if (!together) inBlock += 1;
    if (synced.length) previousTime = Number(line.timeMs);

    return {
      index,
      timeMs: synced.length ? Number(line.timeMs) : null,
      text: line.text,
      singerIds,
      together,
    };
  });

  return {
    synced: Boolean(synced.length),
    singers: safeSingers.map(publicSinger),
    lines,
  };
}

function publicCurrent(current) {
  if (!current) return null;
  return {
    id: current.id,
    status: current.status,
    positionMs: currentPositionMs(current),
    track: publicTrack(current.track),
    source: current.source,
    owner: current.owner,
    singers: current.singers.map(publicSinger),
    lyricPlan: current.lyricPlan,
    channelId: current.channelId,
    channelName: current.channelName,
    countdownEndsAt: current.countdownEndsAt,
    error: current.error,
    updatedAt: current.updatedAt,
  };
}

function publicQueueItem(item, position) {
  return {
    id: item.id,
    position,
    owner: item.owner,
    track: publicTrack(item.track),
    singers: item.singers.map(publicSinger),
    createdAt: item.createdAt,
  };
}

function publicDraft(draft) {
  return {
    id: draft.id,
    owner: draft.owner,
    track: publicTrack(draft.track),
    participants: draft.participants.map((person, index) => ({
      id: person.id,
      name: person.name,
      status: person.status,
      color: SINGER_COLORS[index % SINGER_COLORS.length],
    })),
    createdAt: draft.createdAt,
  };
}

export function getBotState() {
  return {
    ready: bot.isReady(),
    user: bot.user
      ? { id: bot.user.id, username: bot.user.username, tag: bot.user.tag }
      : null,
    activeKaraokeSessions: [...rooms.values()].filter((room) => room.current).length,
  };
}

async function guildAndVoiceMember(guildId, userId) {
  if (!bot.isReady()) throw new Error("BOT_NOT_READY");

  assertAllowedGuild(guildId);

  const guild = bot.guilds.cache.get(guildId);
  if (!guild) throw new Error("GUILD_NOT_FOUND");

  const voiceState = guild.voiceStates.cache.get(userId);
  const channel = voiceState?.channel;
  if (!channel) throw new Error("USER_NOT_IN_VOICE");

  assertAllowedVoice(channel.id);

  return { guild, voiceState, channel };
}

export async function joinUsersVoiceChannel(guildId, userId) {
  const { guild, channel } = await guildAndVoiceMember(guildId, userId);

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
    selfDeaf: true,
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

export async function getVoiceMembers(guildId, userId) {
  const { channel } = await guildAndVoiceMember(guildId, userId);
  return {
    channelId: channel.id,
    channelName: channel.name,
    members: [...channel.members.values()]
      .filter((member) => !member.user.bot)
      .map((member) => ({
        id: member.id,
        name: userLabel(member),
        avatar:
          member.user.displayAvatarURL?.({ size: 64, extension: "png" }) || null,
      })),
  };
}

function publicRoom(room, userId) {
  const myInvites = [];
  const myDrafts = [];

  for (const draft of room.drafts.values()) {
    if (draft.owner.id === userId) myDrafts.push(publicDraft(draft));

    const me = draft.participants.find(
      (person) => person.id === userId && person.id !== draft.owner.id,
    );
    if (me?.status === "pending") myInvites.push(publicDraft(draft));
  }

  return {
    current: publicCurrent(room.current),
    queue: room.queue.map(publicQueueItem),
    myInvites,
    myDrafts,
  };
}

export function getRoomState(guildId, userId) {
  return publicRoom(roomFor(guildId), userId);
}

function singerFromMember(member) {
  return {
    id: member.id,
    name: userLabel(member),
  };
}

function ownerFromUser(user) {
  return {
    id: user.id,
    name: user.global_name || user.username || "Discord",
  };
}

function ensureQueueSlot(room, ownerId) {
  if (room.queue.some((item) => item.owner.id === ownerId)) {
    throw new Error("USER_QUEUE_LIMIT");
  }
}

async function startItem(room, item) {
  const { guild, channel } = await guildAndVoiceMember(room.guildId, item.owner.id);

  const channelMembers = new Set(
    [...channel.members.values()].filter((member) => !member.user.bot).map((member) => member.id),
  );

  const singers = item.singers
    .filter((singer) => channelMembers.has(singer.id))
    .slice(0, 4);

  if (!singers.some((singer) => singer.id === item.owner.id)) {
    singers.unshift(item.owner);
  }

  const connected = await joinUsersVoiceChannel(room.guildId, item.owner.id);
  const connection = getVoiceConnection(guild.id);
  if (!connection) throw new Error("VOICE_CONNECTION_FAILED");

  const current = {
    id: item.id,
    track: item.track,
    owner: item.owner,
    singers,
    lyricPlan: buildLyricPlan(item.track, singers),
    resource: null,
    source: null,
    status: "resolving",
    channelId: connected.channelId,
    channelName: connected.channelName,
    countdownEndsAt: null,
    countdownTimer: null,
    error: null,
    updatedAt: Date.now(),
    lastPositionMs: 0,
  };

  room.current = current;

  console.log(
    `[KARAOKE ${room.guildId}] Ищем аудио: ${item.track.artist} — ${item.track.title}`,
  );

  try {
    const audio = await resolveAudio(item.track);

    if (room.current?.id !== current.id) return;

    current.source = audio.source;
    current.resource = createAudioResource(audio.stream, {
      inputType: audio.inputType,
    });
    current.status = "countdown";
    current.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    current.updatedAt = Date.now();

    connection.subscribe(room.player);

    current.countdownTimer = setTimeout(() => {
      if (room.current?.id !== current.id) return;
      current.countdownTimer = null;
      current.countdownEndsAt = null;
      room.player.play(current.resource);
    }, COUNTDOWN_MS);

    console.log(
      `[KARAOKE ${room.guildId}] ▶ ${audio.source.title} | владелец ${item.owner.name} | певцов ${singers.length}`,
    );
  } catch (error) {
    console.error(`[KARAOKE ${room.guildId}] Не удалось запустить:`, error);
    current.status = "error";
    current.error = error?.message || "AUDIO_STREAM_FAILED";
    current.updatedAt = Date.now();

    const currentId = current.id;
    setTimeout(() => {
      if (room.current?.id !== currentId) return;
      room.current = null;
      void advanceQueue(room);
    }, 1000);
  }
}

async function advanceQueue(room) {
  if (room.advancing || room.current) return;
  room.advancing = true;

  try {
    while (!room.current && room.queue.length) {
      const next = room.queue.shift();

      try {
        await guildAndVoiceMember(room.guildId, next.owner.id);
      } catch (error) {
        console.log(
          `[QUEUE ${room.guildId}] Удалена песня ${next.owner.name}: владелец вышел из voice`,
        );
        continue;
      }

      try {
        await startItem(room, next);
      } catch (error) {
        console.error(`[QUEUE ${room.guildId}] Не удалось запустить следующий трек:`, error);
      }
    }
  } finally {
    room.advancing = false;
  }
}

async function addItem(room, item) {
  if (!room.current && room.queue.length === 0) {
    await startItem(room, item);
    return { started: true };
  }

  ensureQueueSlot(room, item.owner.id);
  room.queue.push(item);
  return { started: false, queuePosition: room.queue.length };
}

export async function addSoloSong(guildId, user, track) {
  await guildAndVoiceMember(guildId, user.id);
  const room = roomFor(guildId);
  const owner = ownerFromUser(user);

  const item = {
    id: randomUUID(),
    owner,
    singers: [owner],
    track,
    createdAt: Date.now(),
  };

  const result = await addItem(room, item);
  return { ...result, room: publicRoom(room, user.id) };
}

export async function createDuetDraft(guildId, user, track, inviteeIds) {
  const { channel } = await guildAndVoiceMember(guildId, user.id);
  const room = roomFor(guildId);

  if ([...room.drafts.values()].some((draft) => draft.owner.id === user.id)) {
    throw new Error("DUET_DRAFT_EXISTS");
  }

  const unique = [...new Set((inviteeIds || []).map(String))]
    .filter((id) => id && id !== user.id)
    .slice(0, 3);

  if (!unique.length) throw new Error("DUET_INVITE_REQUIRED");

  const members = new Map(
    [...channel.members.values()]
      .filter((member) => !member.user.bot)
      .map((member) => [member.id, member]),
  );

  for (const id of unique) {
    if (!members.has(id)) throw new Error("INVITEE_NOT_IN_VOICE");
  }

  const owner = ownerFromUser(user);
  const participants = [
    { ...owner, status: "accepted" },
    ...unique.map((id) => ({
      ...singerFromMember(members.get(id)),
      status: "pending",
    })),
  ];

  const draft = {
    id: randomUUID(),
    owner,
    track,
    participants,
    createdAt: Date.now(),
  };

  room.drafts.set(draft.id, draft);
  return publicDraft(draft);
}

export function respondDuetDraft(guildId, userId, draftId, accept) {
  const room = roomFor(guildId);
  const draft = room.drafts.get(draftId);
  if (!draft) throw new Error("DUET_DRAFT_NOT_FOUND");

  const participant = draft.participants.find(
    (person) => person.id === userId && person.id !== draft.owner.id,
  );
  if (!participant) throw new Error("DUET_NOT_INVITED");

  participant.status = accept ? "accepted" : "declined";
  return publicDraft(draft);
}

export async function commitDuetDraft(guildId, userId, draftId) {
  const room = roomFor(guildId);
  const draft = room.drafts.get(draftId);
  if (!draft) throw new Error("DUET_DRAFT_NOT_FOUND");
  if (draft.owner.id !== userId) throw new Error("NOT_SONG_OWNER");

  const accepted = draft.participants
    .filter((person) => person.status === "accepted")
    .slice(0, 4)
    .map(({ id, name }) => ({ id, name }));

  if (accepted.length < 2) throw new Error("DUET_NEEDS_ACCEPTED");

  room.drafts.delete(draftId);

  const item = {
    id: randomUUID(),
    owner: draft.owner,
    singers: accepted,
    track: draft.track,
    createdAt: Date.now(),
  };

  const result = await addItem(room, item);
  return { ...result, room: publicRoom(room, userId) };
}

export function cancelDuetDraft(guildId, userId, draftId) {
  const room = roomFor(guildId);
  const draft = room.drafts.get(draftId);
  if (!draft) return false;
  if (draft.owner.id !== userId) throw new Error("NOT_SONG_OWNER");
  room.drafts.delete(draftId);
  return true;
}

export function removeQueuedSong(guildId, userId, queueId) {
  const room = roomFor(guildId);
  const index = room.queue.findIndex((item) => item.id === queueId);
  if (index < 0) throw new Error("QUEUE_ITEM_NOT_FOUND");
  if (room.queue[index].owner.id !== userId) throw new Error("NOT_SONG_OWNER");

  room.queue.splice(index, 1);
  return publicRoom(room, userId);
}

export function pauseKaraoke(guildId, userId) {
  const room = roomFor(guildId);
  const current = room.current;
  if (!current) throw new Error("KARAOKE_NOT_ACTIVE");
  if (current.owner.id !== userId) throw new Error("NOT_SONG_OWNER");
  if (current.status !== "playing") throw new Error("KARAOKE_NOT_PLAYING");

  current.lastPositionMs = currentPositionMs(current);
  room.player.pause(true);
  return publicCurrent(current);
}

export function resumeKaraoke(guildId, userId) {
  const room = roomFor(guildId);
  const current = room.current;
  if (!current) throw new Error("KARAOKE_NOT_ACTIVE");
  if (current.owner.id !== userId) throw new Error("NOT_SONG_OWNER");
  if (current.status !== "paused") throw new Error("KARAOKE_NOT_PAUSED");

  room.player.unpause();
  return publicCurrent(current);
}

export function stopKaraoke(guildId, userId) {
  const room = roomFor(guildId);
  const current = room.current;
  if (!current) throw new Error("KARAOKE_NOT_ACTIVE");
  if (current.owner.id !== userId) throw new Error("NOT_SONG_OWNER");

  if (current.countdownTimer) clearTimeout(current.countdownTimer);
  current.lastPositionMs = currentPositionMs(current);
  current.status = "stopped";
  current.updatedAt = Date.now();

  room.current = null;
  room.player.stop(true);
  setTimeout(() => void advanceQueue(room), 100);
  return { stopped: true };
}

export function leaveVoiceChannel(guildId, userId) {
  const room = roomFor(guildId);
  if (room.current && room.current.owner.id !== userId) {
    throw new Error("NOT_SONG_OWNER");
  }

  if (room.current?.countdownTimer) clearTimeout(room.current.countdownTimer);
  room.current = null;
  room.player.stop(true);

  const connection = getVoiceConnection(guildId);
  if (!connection) return false;
  connection.destroy();
  return true;
}


bot.on("guildCreate", async (guild) => {
  if (ALLOWED_GUILD_IDS.has(guild.id)) return;

  console.log(`[BOT] Добавили на неразрешённый сервер ${guild.name} (${guild.id}) — выхожу.`);
  try {
    await guild.leave();
  } catch (error) {
    console.warn(`[BOT] Не удалось покинуть сервер ${guild.id}:`, error?.message || error);
  }
});

bot.on("voiceStateUpdate", (oldState, newState) => {
  const userId = oldState.id;
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  if (!oldChannelId || oldChannelId === newChannelId) return;

  const room = rooms.get(oldState.guild.id);
  if (!room) return;

  const before = room.queue.length;
  room.queue = room.queue.filter((item) => item.owner.id !== userId);
  if (room.queue.length !== before) {
    console.log(`[QUEUE ${oldState.guild.id}] Песня пользователя ${userId} удалена: он вышел из voice`);
  }

  for (const [draftId, draft] of room.drafts) {
    if (draft.owner.id === userId) {
      room.drafts.delete(draftId);
      continue;
    }
    const participant = draft.participants.find((person) => person.id === userId);
    if (participant && participant.status !== "declined") participant.status = "left";
  }

  const current = room.current;
  if (!current || current.channelId !== oldChannelId) return;

  if (current.owner.id === userId) {
    console.log(`[KARAOKE ${oldState.guild.id}] Владелец вышел из voice — песня остановлена`);
    if (current.countdownTimer) clearTimeout(current.countdownTimer);
    room.current = null;
    room.player.stop(true);
    setTimeout(() => void advanceQueue(room), 100);
    return;
  }

  if (current.singers.some((singer) => singer.id === userId)) {
    current.singers = current.singers.filter((singer) => singer.id !== userId);
    current.lyricPlan = buildLyricPlan(current.track, current.singers);
    current.updatedAt = Date.now();
  }
});
