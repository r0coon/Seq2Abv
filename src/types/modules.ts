import { Client } from 'discord.js';

export interface BotModule {
  name: string;
  setup: (client: Client) => Promise<void> | void;
}
