import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ChannelType,
  Guild,
  MessageCreateOptions,
  MessageFlags,
  ModalSubmitInteraction,
  OverwriteResolvable,
  PermissionFlagsBits,
  StringSelectMenuInteraction,
  TextChannel,
} from 'discord.js';
import logger                                                          from '../../../utils/logging';
import { renderTemplate }                                              from '../builders/template';
import { insertTicket, setTicketChannel, countOpenTicketsByUser }     from '../../../database/tickets';
import { getActiveBlacklist }                                          from '../../../database/blacklist';
import { loadCategoryConfig, sanitizeChannelName }                    from '../config';

const FILE        = '@ticket/services/create';
const COOLDOWN_MS = 120_000;
const cooldowns   = new Map<string, number>();

export interface ModalField { label: string; value: string; }

// close + transcript toggle row — auch von components/close genutzt
export function buildTicketActionRow(categoryId: string, transcriptEnabled: boolean): ActionRowBuilder<ButtonBuilder> {
  const close = new ButtonBuilder()
    .setCustomId(`ticket_close:${categoryId}`)
    .setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger);
  const toggle = new ButtonBuilder()
    .setCustomId(`ticket_transcript_toggle:${categoryId}:${transcriptEnabled ? 'on' : 'off'}`)
    .setLabel(transcriptEnabled ? 'Transcript deaktivieren' : 'Transcript aktivieren')
    .setEmoji('📋')
    .setStyle(transcriptEnabled ? ButtonStyle.Secondary : ButtonStyle.Success);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(close, toggle);
}

// ── ticket erstellen ──────────────────────────────────────────────────────────

export async function createTicket(
  categoryId:           string,
  interaction:          ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  extraVars:            Record<string, string> = {},
  channelNameOverride?: string,
  modalFields?:         ModalField[],
): Promise<void> {
  const category = loadCategoryConfig(categoryId);
  if (!category) {
    logger.warn(`Category not found: ${categoryId}.json`, FILE);
    await interaction.reply({ content: 'Unbekannte Kategorie.', flags: MessageFlags.Ephemeral });
    return;
  }

  const guild = interaction.guild as Guild;
  const user  = interaction.user;
  const now   = new Date();

  // blacklist check
  const bl = await getActiveBlacklist(user.id).catch(() => null);
  if (bl) {
    const ts = bl.expires_at ? Math.floor(new Date(bl.expires_at).getTime() / 1000) : null;
    await interaction.reply({
      components: [{ type: 17, accent_color: 0xED4245, components: [
        { type: 10, content: '### Du kannst kein Ticket erstellen.' },
        { type: 14, divider: true },
        { type: 10, content: `**Grund:** ${bl.reason}\n${ts ? `**Läuft ab:** <t:${ts}:F> (<t:${ts}:R>)` : '**Dauer:** Permanent'}` },
      ]}] as never,
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  // cooldown
  const remaining = COOLDOWN_MS - (Date.now() - (cooldowns.get(user.id) ?? 0));
  if (remaining > 0) {
    await interaction.reply({ content: `Bitte warte noch **${Math.ceil(remaining / 1000)}s**.`, flags: MessageFlags.Ephemeral });
    return;
  }
  cooldowns.set(user.id, Date.now());

  // max offene tickets
  if (category.maxOpenPerUser > 0) {
    const open = await countOpenTicketsByUser({ userId: user.id, categoryId });
    if (open >= category.maxOpenPerUser) {
      await interaction.reply({
        content: `Du hast bereits **${open}** offene${open !== 1 ? '' : 's'} Ticket in dieser Kategorie.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  const ticketId = await insertTicket({ categoryId, createdBy: user.id });
  const ts       = String(Math.floor(now.getTime() / 1000));

  const vars: Record<string, string> = {
    username:   user.username,
    mention:    `<@${user.id}>`,
    ticketId:   String(ticketId).padStart(4, '0'),
    date:       now.toISOString().slice(0, 10),
    timestamp:  ts,
    userAvatar: user.displayAvatarURL({ size: 64 }),
    greeting:   (category.message.greeting ?? `Hey <@${user.id}>`).replace(/\{mention\}/g, `<@${user.id}>`).replace(/\{username\}/g, user.username),
    body:       (category.message.body ?? 'Bitte beschreibe dein Anliegen.').replace(/\{mention\}/g, `<@${user.id}>`).replace(/\{username\}/g, user.username),
    ...extraVars,
  };

  const channelName = sanitizeChannelName(
    (channelNameOverride ?? category.channelName).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`),
  );

  const perms: OverwriteResolvable[] = [
    { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ...(category.staffRoleId ? [{
      id:    category.staffRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
    }] : []),
  ];

  const ticketChannel = (await guild.channels.create({
    name: channelName, type: ChannelType.GuildText,
    permissionOverwrites: perms,
    ...(category.categoryId ? { parent: category.categoryId } : {}),
  })) as TextChannel;

  await setTicketChannel(ticketId, ticketChannel.id);

  const rendered = renderTemplate(category.message.type, vars);
  const closeRow = buildTicketActionRow(categoryId, true);
  const payload: MessageCreateOptions = {};

  if (rendered.type === 'container') {
    const containers = [...(rendered.components ?? [])] as Record<string, unknown>[];
    if (containers.length) {
      const last  = { ...containers[containers.length - 1] } as Record<string, unknown>;
      const inner = Array.isArray(last['components']) ? [...last['components']] : [];

      if (modalFields?.length) {
        inner.push({ type: 14, divider: true });
        for (const f of modalFields)
          inner.push({ type: 10, content: `**${f.label}**\n\`\`\`\n${f.value.trim() || 'N/A'}\n\`\`\`` });
      }
      inner.push({ type: 14, divider: true });
      inner.push({ type: 10, content: `-# Ticket #${vars.ticketId}  ·  Opened on <t:${ts}:D> at <t:${ts}:t>` });
      last['components'] = inner;
      containers[containers.length - 1] = last;
    }
    payload.flags      = rendered.flags;
    payload.components = [...containers, closeRow] as unknown as MessageCreateOptions['components'];
  } else {
    if (rendered.content) payload.content = rendered.content;
    if (rendered.embeds)  payload.embeds  = rendered.embeds;
    payload.components = [closeRow];
  }

  const firstMsg = await ticketChannel.send(payload);
  await firstMsg.pin().catch(() => null);

  await interaction.reply({ content: `${ticketChannel}`, flags: MessageFlags.Ephemeral });
  logger.info(`Ticket #${vars.ticketId} opened by ${user.username} [${categoryId}] → #${channelName}`, FILE);
}
