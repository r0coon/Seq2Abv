import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, TextChannel } from 'discord.js';
import { getTicketByChannel } from '../../../database/tickets';

// ── /remove ───────────────────────────────────────────────────────────────────

export async function onCommandRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel) return;

  const ticket = await getTicketByChannel(channel.id).catch(() => null);
  if (!ticket || ticket.closed_at) {
    await interaction.reply({ content: 'Kein aktives Ticket.', flags: MessageFlags.Ephemeral });
    return;
  }

  const target = interaction.options.getUser('user', true);
  if (target.id === ticket.created_by) {
    await interaction.reply({ content: 'Ersteller kann nicht entfernt werden.', flags: MessageFlags.Ephemeral });
    return;
  }

  const existing = channel.permissionOverwrites.cache.get(target.id);
  if (!existing?.allow.has(PermissionFlagsBits.ViewChannel)) {
    await interaction.reply({ content: `<@${target.id}> hat keinen Zugriff.`, flags: MessageFlags.Ephemeral });
    return;
  }

  await channel.permissionOverwrites.delete(target.id).catch(() => null);
  await interaction.reply({ content: `✅ <@${target.id}> wurde entfernt.` });
}
