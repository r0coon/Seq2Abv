import { ChatInputCommandInteraction, MessageFlags, TextChannel } from 'discord.js';
import { getTicketByChannel } from '../../../database/tickets';
import logger                 from '../../../utils/logging';

// ── /summary ──────────────────────────────────────────────────────────────────

const OLLAMA_URL   = process.env.OLLAMA_URL   ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2';

export async function onCommandSummary(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel) return;

  const ticket = await getTicketByChannel(channel.id).catch(() => null);
  if (!ticket) {
    await interaction.reply({ content: 'Kein aktives Ticket.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();

  // alle nachrichten in chronologischer reihenfolge holen (älteste zuerst)
  // Discord liefert immer neueste-zuerst — batches deshalb vorne einfügen
  const batches: string[][] = [];
  try {
    let last: string | undefined;
    while (true) {
      const batch = await channel.messages.fetch({ limit: 100, ...(last ? { before: last } : {}) });
      if (!batch.size) break;
      const chunk: string[] = [];
      for (const m of [...batch.values()].reverse()) // innerhalb des batches: alt → neu
        if (!m.author.bot && m.content.trim()) chunk.push(`${m.author.username}: ${m.content.trim()}`);
      batches.unshift(chunk); // älterer batch kommt nach vorne
      last = batch.last()?.id;
      if (batch.size < 100) break;
    }
  } catch { /* ignore */ }

  const lines = batches.flat();

  if (!lines.length) {
    await interaction.editReply({ content: 'Keine Nachrichten gefunden.' });
    return;
  }

  // adaptiver prompt — mehr kontext = bissl mehr text erlaubt
  const long   = lines.length > 20;
  const prompt = long
    ? `Du bist ein präziser Support-Assistent. Analysiere das folgende Support-Ticket vollständig und fasse es auf Deutsch zusammen. Halte dich kurz: maximal 2–3 Sätze, maximal 60 Wörter. Nenne das Anliegen, den Verlauf (falls relevant) und den aktuellen Stand. Keine Begrüßung, kein "Der User", kein "Das Ticket" — direkt mit dem Thema beginnen.\n\nTicket:\n${lines.join('\n')}\n\nZusammenfassung:`
    : `Du bist ein präziser Support-Assistent. Fasse das folgende Ticket in EINEM einzigen Satz auf Deutsch zusammen (max. 30 Wörter). Nenne das Anliegen und den Stand. Keine Begrüßung, kein "Der User" — direkt mit dem Thema beginnen.\n\nTicket:\n${lines.join('\n')}\n\nZusammenfassung:`;

  try {
    const { default: axios } = await import('axios');
    const res     = await axios.post(`${OLLAMA_URL}/api/generate`, { model: OLLAMA_MODEL, prompt, stream: false }, { timeout: 60_000 });
    const summary = (res.data?.response as string ?? '').trim();
    if (!summary) throw new Error('Empty response');

    await interaction.editReply({
      components: [{ type: 17, components: [
        { type: 10, content: `### KI-Zusammenfassung\n-# ${channel.name} · Ticket \`#${String(ticket.id).padStart(4, '0')}\`` },
        { type: 14, divider: true },
        { type: 10, content: summary },
        { type: 14, divider: true },
        { type: 10, content: `-# ${OLLAMA_MODEL} · ${lines.length} Nachricht${lines.length !== 1 ? 'en' : ''} analysiert` },
      ]}] as never,
      flags: MessageFlags.IsComponentsV2 as never,
    });
    logger.info(`Summary generated for #${channel.name} by ${interaction.user.username}`, '@cmd/summary');
  } catch (err) {
    await interaction.editReply({ content: `KI fehlgeschlagen: ${(err as Error).message}` });
  }
}
