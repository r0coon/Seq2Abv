import { Client, GatewayIntentBits, Collection } from 'discord.js';
import 'dotenv/config';
import logger from './utils/logging';
import { loadModules } from './modules';
import { initDb } from './database';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands  = new Collection();
client.cooldowns = new Collection();

client.once('clientReady', (c) => {
  logger.info(`Logged as ${c.user.tag} (${c.user.id})`, '@src/index.ts');
});

client.on('error', (err) => {
  logger.error(`Client error: ${err.message}`, '@src/index.ts');
});

(async () => {
  try {
    await initDb();
    await loadModules(client);
    await client.login(process.env.BOT_TOKEN);
  } catch (err) {
    logger.error(`Lfailed ${(err as Error).message}`, '@src/index.ts');
    process.exit(1);
  }
})();
