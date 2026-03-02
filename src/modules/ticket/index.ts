import { ChatInputCommandInteraction, Client, MessageFlags } from 'discord.js';
import { BotModule }              from '../../types/modules';
import logger                     from '../../utils/logging';

import { deployPanel }            from './services/panel';
import { warmupExporter }         from './services/transcript';
import { registerPanelViews, dispatchButton, dispatchSelect, dispatchModal } from './router';

import { registerCommands }       from './commands/registry';

import { onCommandClose }         from './commands/close';
import { onCommandAdd }           from './commands/add';
import { onCommandRemove }        from './commands/remove';
import { onCommandTranscript }    from './commands/transcript';
import { onCommandArchive }       from './commands/archive';
import { onCommandHistory }       from './commands/history';
import { onCommandSummary }       from './commands/summary';
import { onCommandMove, onMoveSubCategorySelect } from './commands/move';
import { onCommandBlacklist, scheduleBlacklistExpiry } from './commands/blacklist';
import { onTicketCreate, onSubCategorySelect, onModalCreate } from './components/create';
import { onTicketClose, onTranscriptToggle, onModalClose, onModalArchive } from './components/close';

const FILE = '@src/modules/ticket/index.ts';

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    switch (interaction.commandName) {
      case 'close':      await onCommandClose(interaction);      break;
      case 'add':        await onCommandAdd(interaction);        break;
      case 'remove':     await onCommandRemove(interaction);     break;
      case 'transcript': await onCommandTranscript(interaction); break;
      case 'archive':    await onCommandArchive(interaction);    break;
      case 'history':    await onCommandHistory(interaction);    break;
      case 'summary':    await onCommandSummary(interaction);    break;
      case 'move':       await onCommandMove(interaction);       break;
      case 'blacklist':  await onCommandBlacklist(interaction);  break;
    }
  } catch (err) {
    logger.error(`Command /${interaction.commandName} error: ${(err as Error).message}`, FILE);
    const reply = { content: 'Ein Fehler ist aufgetreten.', flags: [MessageFlags.Ephemeral] as const };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => null);
    else await interaction.reply(reply).catch(() => null);
  }
}


const ticketModule: BotModule = {
  name: 'ticket',

  async setup(client: Client) {
    client.once('clientReady', async (c) => {
      warmupExporter();
      const guild = await c.guilds.fetch(process.env.GUILD_ID ?? '').catch(() => null);
      if (guild) await registerCommands(guild);
      registerPanelViews(onTicketCreate, onTicketClose, onTranscriptToggle, onModalCreate, onModalClose, onModalArchive, onSubCategorySelect, onMoveSubCategorySelect);
      await deployPanel(client);
      await scheduleBlacklistExpiry();
    });

    client.on('interactionCreate', async interaction => {
      try {
        if (interaction.isButton())           { await dispatchButton(interaction); return; }
        if (interaction.isStringSelectMenu()) { await dispatchSelect(interaction); return; }
        if (interaction.isModalSubmit())      { await dispatchModal(interaction);  return; }
        if (interaction.isChatInputCommand()) { await handleCommand(interaction);  return; }
      } catch (err) {
        const e = err as { code?: number; message?: string };
        if (e.code === 10062) return; // expired interaction, einfach ignorieren
        logger.error(`Interaction error: ${e.message ?? String(err)}`, FILE);
      }
    });

  },
};

export default ticketModule;
