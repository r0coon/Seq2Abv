import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { getTicketsByUser, TicketRow } from '../../../database/tickets';

// ── /history ──────────────────────────────────────────────────────────────────

export async function onCommandHistory(interaction: ChatInputCommandInteraction): Promise<void> {
  const target  = interaction.options.getUser('user', true);
  const tickets = await getTicketsByUser(target.id, 25).catch(() => [] as TicketRow[]);

  if (!tickets.length) {
    await interaction.reply({ content: `<@${target.id}> hat noch keine Tickets.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const openCount = tickets.filter(t => !t.closed_at).length;
  const lines     = tickets.map(t => {
    const id  = String(t.id).padStart(4, '0');
    const ts  = Math.floor(new Date(t.created_at).getTime() / 1000);
    const st  = t.closed_at
      ? `geschlossen <t:${Math.floor(new Date(t.closed_at).getTime() / 1000)}:R>`
      : '🟢 offen';
    return `\`#${id}\` · **${t.category_id}** · <t:${ts}:d> · ${st}`;
  });

  // in 10er chunks damit wir unterm limit bleiben
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += 10)
    chunks.push(lines.slice(i, i + 10).join('\n'));

  await interaction.reply({
    components: [{ type: 17, components: [
      { type: 10, content: `### Ticket-Verlauf\n-# <@${target.id}> · ${tickets.length} Tickets` },
      { type: 14, divider: true },
      { type: 10, content: `**Offen:** ${openCount}　　**Geschlossen:** ${tickets.length - openCount}` },
      { type: 14, divider: true },
      ...chunks.map(c => ({ type: 10, content: c })),
    ]}] as never,
    flags: (MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral) as never,
  });
}
