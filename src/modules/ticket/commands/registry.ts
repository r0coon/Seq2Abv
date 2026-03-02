import { SlashCommandBuilder } from 'discord.js';
import type { Guild }          from 'discord.js';
import fs                      from 'fs';
import path                    from 'path';
import { CATS_DIR }            from '../config';
import logger                  from '../../../utils/logging';

// kategorien für /move choices laden
function loadCategoryChoices(): { name: string; value: string }[] {
  try {
    return fs.readdirSync(CATS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const id  = f.replace('.json', '');
        const raw = JSON.parse(fs.readFileSync(path.join(CATS_DIR, f), 'utf-8'));
        return { name: (raw.label as string | undefined) ?? id, value: id };
      })
      .slice(0, 25);
  } catch { return []; }
}

export const ticketCommands = [
  new SlashCommandBuilder().setName('close').setDescription('Close the current ticket'),

  new SlashCommandBuilder().setName('add').setDescription('Add a user to this ticket')
    .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true)),

  new SlashCommandBuilder().setName('remove').setDescription('Remove a user from this ticket')
    .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true)),

  new SlashCommandBuilder().setName('transcript').setDescription('Export a transcript via DM'),

  new SlashCommandBuilder().setName('archive').setDescription('Ticket archivieren'),

  new SlashCommandBuilder().setName('history').setDescription('Ticket-Verlauf eines Users')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),

  new SlashCommandBuilder().setName('summary').setDescription('KI-Zusammenfassung generieren'),

  new SlashCommandBuilder().setName('move').setDescription('Ticket in andere Kategorie verschieben')
    .addStringOption(o =>
      o.setName('kategorie').setDescription('Ziel-Kategorie').setRequired(true).addChoices(...loadCategoryChoices()),
    ),

  new SlashCommandBuilder().setName('blacklist').setDescription('User sperren / entsperren')
    .addSubcommand(s => s.setName('add').setDescription('User sperren')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addStringOption(o => o.setName('dauer').setDescription('z.B. 1d, 7d, permanent').setRequired(true))
      .addStringOption(o => o.setName('grund').setDescription('Grund').setRequired(true)),
    )
    .addSubcommand(s => s.setName('remove').setDescription('User entsperren')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),
    ),
];

export async function registerCommands(guild: Guild): Promise<void> {
  try {
    await guild.commands.set(ticketCommands.map(c => c.toJSON()));
  } catch (err) {
    logger.error(`Commands registrieren fehlgeschlagen: ${(err as Error).message}`, '@cmd/registry');
  }
}
