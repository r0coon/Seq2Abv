import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, TextChannel } from 'discord.js';
import { getTicketByChannel } from '../../../database/tickets';

// ── /add ──────────────────────────────────────────────────────────────────────

export async function onCommandAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel) return;

  const ticket = await getTicketByChannel(channel.id).catch(() => null);
  if (!ticket || ticket.closed_at) {
    await interaction.reply({ content: 'Kein aktives Ticket.', flags: MessageFlags.Ephemeral });
    return;
  }

  const target   = interaction.options.getUser('user', true);
  const existing = channel.permissionOverwrites.cache.get(target.id);
  if (existing?.allow.has(PermissionFlagsBits.ViewChannel)) {
    await interaction.reply({ content: `<@${target.id}> hat bereits Zugriff.`, flags: MessageFlags.Ephemeral });
    return;
  }

  await channel.permissionOverwrites.edit(target.id, {
    ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
  });
  await interaction.reply({ content: `✅ <@${target.id}> wurde hinzugefügt.` });
}
