import { ChatInputCommandInteraction, MessageCreateOptions, MessageFlags, TextChannel } from 'discord.js';
import { getTicketByChannel } from '../../../database/tickets';
import { exportTranscript }   from '../services/transcript';

// ── /transcript ───────────────────────────────────────────────────────────────

export async function onCommandTranscript(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel) return;

  const ticket = await getTicketByChannel(channel.id).catch(() => null);
  if (!ticket || ticket.closed_at) {
    await interaction.reply({ content: 'Kein aktives Ticket.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const idStr    = String(ticket.id).padStart(4, '0');
  const filePath = await exportTranscript(channel, idStr, interaction.user.id);

  if (!filePath) {
    await interaction.editReply({ content: 'Transcript export fehlgeschlagen.' });
    return;
  }

  const sent = await interaction.user.send({
    content: `📄 Transcript für **${channel.name}** (Ticket #${idStr})`,
    files:   [{ attachment: filePath, name: `ticket-${idStr}.html` }],
  }).then(() => true).catch(() => false);

  await channel.send({
    components: [{ type: 17, components: [{ type: 10, content: `**<@${interaction.user.id}> erstellte ein Transcript**` }] }] as unknown as MessageCreateOptions['components'],
    flags: MessageFlags.IsComponentsV2,
  }).catch(() => null);

  await interaction.editReply({
    content: sent
      ? '✅ Transcript per DM geschickt.'
      : '⚠️ Erstellt, aber DM konnte nicht gesendet werden.',
  });
}
