import { Client, GatewayIntentBits, ActivityType } from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";

const token =
  process.env.DISCORD_TOKEN ||
  process.env.DISCORD_BOT_TOKEN ||
  process.env.BOT_TOKEN;

export const bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

let loginPromise = null;

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

    bot.once("ready", onReady);
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
  };
}

export async function joinUsersVoiceChannel(guildId, userId) {
  if (!bot.isReady()) throw new Error("BOT_NOT_READY");

  const guild = bot.guilds.cache.get(guildId);
  if (!guild) throw new Error("GUILD_NOT_FOUND");

  // GuildVoiceStates intent keeps this cache updated without requiring
  // the privileged Server Members intent.
  const voiceState = guild.voiceStates.cache.get(userId);
  const channel = voiceState?.channel;

  if (!channel) throw new Error("USER_NOT_IN_VOICE");
  if (!channel.joinable) throw new Error("CHANNEL_NOT_JOINABLE");
  if (!channel.speakable) throw new Error("CHANNEL_NOT_SPEAKABLE");

  const previous = getVoiceConnection(guild.id);
  if (previous && previous.joinConfig.channelId === channel.id) {
    return { channelId: channel.id, channelName: channel.name, reused: true };
  }
  previous?.destroy();

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    // Нам понадобится receive-аудио для будущего определения нот.
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

export function leaveVoiceChannel(guildId) {
  const connection = getVoiceConnection(guildId);
  if (!connection) return false;
  connection.destroy();
  return true;
}
