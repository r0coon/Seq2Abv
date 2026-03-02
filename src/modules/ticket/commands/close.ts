import { ChatInputCommandInteraction, MessageFlags, TextChannel } from 'discord.js';
import { getTicketByChannel }            from '../../../database/tickets';
import { loadCategoryConfig, hasPermission } from '../config';
import { performClose }                  from '../services/close';
import { buildCloseModal }               from '../builders/modal';

// ── /close ────────────────────────────────────────────────────────────────────

export async function onCommandClose(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel) return;

  const ticket = await getTicketByChannel(channel.id).catch(() => null);
  if (!ticket || ticket.closed_at) {
    await interaction.reply({ content: 'Kein aktives Ticket.', flags: MessageFlags.Ephemeral });
    return;
  }

  const config = loadCategoryConfig(ticket.category_id);
  if (!config) {
    await interaction.reply({ content: 'Kategorie-Config nicht gefunden.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!hasPermission(interaction, config)) {
    await interaction.reply({ content: 'Keine Berechtigung.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (config.requireCloseReason) {
    await interaction.showModal(buildCloseModal(ticket.category_id));
    return;
  }

  await performClose(interaction, channel, ticket.category_id);
}
