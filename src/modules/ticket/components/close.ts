import { ButtonInteraction, MessageFlags, ModalSubmitInteraction, TextChannel } from 'discord.js';
import { getTicketByChannel, toggleTranscript } from '../../../database/tickets';
import { loadCategoryConfig, hasPermission }    from '../config';
import { performClose, performArchive }         from '../services/close';
import { buildCloseModal }                      from '../builders/modal';
import { buildTicketActionRow }                 from '../services/create';

// ── ticket_close button ───────────────────────────────────────────────────────

export async function onTicketClose(interaction: ButtonInteraction): Promise<void> {
  const channel    = interaction.channel as TextChannel | null;
  const categoryId = interaction.customId.split(':')[1];
  if (!channel || !categoryId) return;

  const config = loadCategoryConfig(categoryId);
  if (!config) {
    await interaction.reply({ content: 'Config nicht gefunden.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!hasPermission(interaction, config)) {
    await interaction.reply({ content: 'Keine Berechtigung.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (config.requireCloseReason) {
    await interaction.showModal(buildCloseModal(categoryId));
    return;
  }
  await performClose(interaction, channel, categoryId);
}

// ── transcript toggle ─────────────────────────────────────────────────────────

export async function onTranscriptToggle(interaction: ButtonInteraction): Promise<void> {
  const [, categoryId] = interaction.customId.split(':');
  const channel        = interaction.channel as TextChannel | null;
  if (!channel) return;

  const ticket = await getTicketByChannel(channel.id).catch(() => null);
  if (!ticket || ticket.closed_at !== null) {
    await interaction.reply({ content: 'Kein aktives Ticket.', flags: MessageFlags.Ephemeral });
    return;
  }

  const newState = await toggleTranscript(channel.id).catch(() => true);
  const comps    = [...(interaction.message.components ?? [])];
  await interaction.update({ components: [...comps.slice(0, -1), buildTicketActionRow(categoryId, newState)] as never });
}

// ── modal close submit ────────────────────────────────────────────────────────

export async function onModalClose(interaction: ModalSubmitInteraction): Promise<void> {
  const channel    = interaction.channel as TextChannel | null;
  const categoryId = interaction.customId.split(':')[1];
  if (!channel || !categoryId) return;

  const config = loadCategoryConfig(categoryId);
  if (!config) {
    await interaction.reply({ content: 'Config nicht gefunden.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!hasPermission(interaction, config)) {
    await interaction.reply({ content: 'Keine Berechtigung.', flags: MessageFlags.Ephemeral });
    return;
  }
  await performClose(interaction, channel, categoryId, interaction.fields.getTextInputValue('reason'));
}

// ── modal archive submit ──────────────────────────────────────────────────────

export async function onModalArchive(interaction: ModalSubmitInteraction): Promise<void> {
  const channelId = interaction.customId.split(':')[1];
  const channel   = interaction.channel as TextChannel | null;
  if (!channel || channel.id !== channelId) return;

  const ticket = await getTicketByChannel(channel.id).catch(() => null);
  if (!ticket) return;

  await performArchive(interaction, channel, ticket.category_id, interaction.fields.getTextInputValue('reason'));
}
