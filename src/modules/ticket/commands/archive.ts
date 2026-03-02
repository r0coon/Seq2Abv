import { ChatInputCommandInteraction, MessageFlags, TextChannel } from 'discord.js';
import { getTicketByChannel }   from '../../../database/tickets';
import { loadCategoryConfig }   from '../config';
import { performArchive }       from '../services/close';
import { buildArchiveModal }    from '../builders/modal';

// ── /archive ──────────────────────────────────────────────────────────────────

export async function onCommandArchive(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel) return;

  const ticket = await getTicketByChannel(channel.id).catch(() => null);
  if (!ticket || ticket.closed_at) {
    await interaction.reply({ content: 'Kein aktives Ticket.', flags: MessageFlags.Ephemeral });
    return;
  }

  const config = loadCategoryConfig(ticket.category_id);
  if (config?.requireCloseReason) {
    await interaction.showModal(buildArchiveModal(channel.id));
    return;
  }

  await performArchive(interaction, channel, ticket.category_id);
}
