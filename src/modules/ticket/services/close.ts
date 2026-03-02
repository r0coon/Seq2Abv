// schliessung, benachrichtigungen, archivierung
import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  MessageCreateOptions,
  MessageFlags,
  ModalSubmitInteraction,
  TextChannel,
} from 'discord.js';
import { closeTicket, getTicketByChannel, TicketRow } from '../../../database/tickets';
import { exportTranscript }                           from './transcript';
import { readGeneralConfig }                          from '../config';
import logger                                         from '../../../utils/logging';

const FILE = '@ticket/services/close';

type CloseI = ButtonInteraction | ModalSubmitInteraction | ChatInputCommandInteraction;

// ── close container (DM + log) ────────────────────────────────────────────────

export function buildCloseContainer(
  channelName:    string,
  closedById:     string,
  ticketIdStr:    string,
  closeReason?:   string,
  transcriptUrl?: string,
): unknown {
  const now   = Math.floor(Date.now() / 1000);
  const comps: unknown[] = [
    { type: 10, content: '### ᴛɪᴄᴋᴇᴛ ɢᴇꜱᴄʜʟᴏꜱꜱᴇɴ' },
    { type: 14, divider: false },
    { type: 10, content: `Dein Ticket **${channelName}** wurde geschlossen.` },
    { type: 14, divider: true },
    { type: 10, content: `**von:** \u3000 **Datum:**\n<@${closedById}> \u3000 <t:${now}:F>` },
  ];
  if (closeReason) {
    comps.push({ type: 14, divider: false });
    comps.push({ type: 10, content: `**Grund:**\n\`\`\`\n${closeReason}\n\`\`\`` });
  }
  comps.push({ type: 14, divider: true });
  comps.push({ type: 10, content: `-# Ticket-ID: ${ticketIdStr}` });
  if (transcriptUrl) {
    comps.push({ type: 14, divider: false });
    comps.push({ type: 1, components: [{ type: 2, style: 5, label: 'Transkript', emoji: { name: '📄' }, url: transcriptUrl }] });
  }
  return { type: 17, components: comps };
}

// ── notification (DM + log + transcript kanal) ────────────────────────────────

export async function sendCloseNotification(
  client:       Client,
  channel:      TextChannel,
  ticket:       TicketRow | null,
  closedById:   string,
  closeReason?: string,
): Promise<void> {
  const idStr = ticket ? String(ticket.id).padStart(4, '0') : '????';
  const cfg   = readGeneralConfig();

  const transcriptPath = (ticket?.transcript_enabled ?? true)
    ? await exportTranscript(channel, idStr, ticket?.created_by ?? closedById)
    : null;
  const files = transcriptPath ? [{ attachment: transcriptPath, name: `ticket-${idStr}.html` }] : [];

  // ── log kanal ─────────────────────────────────────────────────────────────
  let transcriptUrl: string | null = null;
  if (cfg.logChannelId) {
    try {
      const lch = (await client.channels.fetch(cfg.logChannelId).catch(() => null)) as TextChannel | null;
      if (lch) {
        const msg = await lch.send({
          components: [buildCloseContainer(channel.name, closedById, idStr, closeReason)] as never,
          flags: MessageFlags.IsComponentsV2,
          files,
        });
        transcriptUrl = msg.attachments.first()?.url ?? null;
      }
    } catch { /* ignore */ }
  }

  // ── alle user im channel sammeln ──────────────────────────────────────────
  const participants = new Set<string>();
  try {
    let last: string | undefined;
    while (true) {
      const batch = await channel.messages.fetch({ limit: 100, ...(last ? { before: last } : {}) });
      if (!batch.size) break;
      batch.forEach(m => { if (!m.author.bot) participants.add(m.author.id); });
      last = batch.last()?.id;
      if (batch.size < 100) break;
    }
  } catch { /* ignore */ }

  // ── transcript channel ────────────────────────────────────────────────────
  if (cfg.transcriptChannelId) {
    try {
      const tch = (await client.channels.fetch(cfg.transcriptChannelId).catch(() => null)) as TextChannel | null;
      if (tch) {
        const openedAt = ticket?.created_at ? new Date(ticket.created_at) : null;
        const closedAt = new Date();
        const openedTs = openedAt ? Math.floor(openedAt.getTime() / 1000) : null;
        const closedTs = Math.floor(closedAt.getTime() / 1000);

        let dur = 'Unbekannt';
        if (openedAt) {
          const d = closedAt.getTime() - openedAt.getTime();
          const parts: string[] = [];
          const days = Math.floor(d / 86_400_000);
          const hrs  = Math.floor((d % 86_400_000) / 3_600_000);
          const mins = Math.floor((d % 3_600_000) / 60_000);
          if (days) parts.push(`${days}d`);
          if (hrs)  parts.push(`${hrs}h`);
          if (mins) parts.push(`${mins}m`);
          dur = parts.length ? parts.join(' ') : '< 1m';
        }

        const pList = participants.size ? [...participants].map(id => `<@${id}>`).join(', ') : '*Keine*';
        const infoComps: unknown[] = [
          { type: 10, content: `### ${channel.name}\n-# Ticket \`#${idStr}\` · geschlossen · Offen für: ${dur}` },
          { type: 14, divider: true },
          { type: 10, content: `**Erstellt von:** <@${ticket?.created_by ?? '?'}>\n**Geschlossen von:** <@${closedById}>` },
          { type: 14, divider: false },
          { type: 10, content: `**Geöffnet:** ${openedTs ? `<t:${openedTs}:F>` : 'Unbekannt'}\n**Geschlossen:** <t:${closedTs}:F>` },
          { type: 14, divider: true },
          { type: 10, content: `**Teilnehmer**\n${pList}` },
        ];
        if (closeReason) {
          infoComps.push({ type: 14, divider: true });
          infoComps.push({ type: 10, content: `**Schließgrund**\n\`\`\`\n${closeReason}\n\`\`\`` });
        }
        await tch.send({ components: [{ type: 17, components: infoComps }] as never, flags: MessageFlags.IsComponentsV2, files });
      }
    } catch { /* ignore */ }
  }

  // ── DM an ersteller ───────────────────────────────────────────────────────
  if (ticket?.created_by) {
    const user = await client.users.fetch(ticket.created_by).catch(() => null);
    if (user) {
      await user.send({
        components: [buildCloseContainer(channel.name, closedById, idStr, closeReason, transcriptUrl ?? undefined)] as never,
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => null);
    }
  }
}

// ── performClose ──────────────────────────────────────────────────────────────

export async function performClose(
  interaction:  CloseI,
  channel:      TextChannel,
  _categoryId:  string,
  closeReason?: string,
): Promise<void> {
  if (interaction.isButton()) await interaction.deferUpdate();
  else await interaction.reply({ content: 'Closing...', flags: MessageFlags.Ephemeral });

  const ticket = await getTicketByChannel(channel.id).catch(() => null);
  await closeTicket({ channelId: channel.id, closedBy: interaction.user.id, closeReason }).catch(() => null);

  const comps: unknown[] = [{ type: 10, content: `**Das Ticket wurde von <@${interaction.user.id}> geschlossen.**` }];
  if (closeReason) {
    comps.push({ type: 14, divider: true });
    comps.push({ type: 10, content: `**Grund**\n\`\`\`\n${closeReason}\n\`\`\`` });
  }
  await channel.send({
    components: [{ type: 17, accent_color: 0xED4245, components: comps }] as unknown as MessageCreateOptions['components'],
    flags: MessageFlags.IsComponentsV2,
  }).catch(() => null);

  logger.info(`Ticket closed by ${interaction.user.username} in #${channel.name}`, FILE);

  sendCloseNotification(interaction.client, channel, ticket, interaction.user.id, closeReason)
    .then(() => channel.delete().catch(() => null))
    .catch(err => { logger.error(`Close notify error: ${(err as Error).message}`, FILE); channel.delete().catch(() => null); });
}

// ── performArchive ────────────────────────────────────────────────────────────

export async function performArchive(
  interaction:  CloseI,
  channel:      TextChannel,
  _categoryId:  string,
  closeReason?: string,
): Promise<void> {
  if (interaction.isButton()) await interaction.deferUpdate();
  else await interaction.reply({ content: 'Archiviere...', flags: MessageFlags.Ephemeral });

  const cfg  = readGeneralConfig();
  const fail = async (msg: string) => {
    if (!interaction.isButton()) await (interaction as ChatInputCommandInteraction).editReply({ content: msg });
  };

  if (!cfg.archiveCategoryId) { await fail('Keine Archiv-Kategorie konfiguriert.'); return; }
  if (channel.parentId === cfg.archiveCategoryId) { await fail('Bereits archiviert.'); return; }

  const ticket = await getTicketByChannel(channel.id).catch(() => null);
  await closeTicket({ channelId: channel.id, closedBy: interaction.user.id, closeReason }).catch(() => null);

  const comps: unknown[] = [{ type: 10, content: `**Das Ticket wurde von <@${interaction.user.id}> archiviert.**` }];
  if (closeReason) {
    comps.push({ type: 14, divider: true });
    comps.push({ type: 10, content: `**Grund**\n\`\`\`\n${closeReason}\n\`\`\`` });
  }
  await channel.send({
    components: [{ type: 17, accent_color: 0xFEE75C, components: comps }] as unknown as MessageCreateOptions['components'],
    flags: MessageFlags.IsComponentsV2,
  }).catch(() => null);

  logger.info(`Ticket archived by ${interaction.user.username} in #${channel.name}`, FILE);

  await sendCloseNotification(interaction.client, channel, ticket, interaction.user.id, closeReason);
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: false });
  await channel.setParent(cfg.archiveCategoryId, { lockPermissions: false });
}
