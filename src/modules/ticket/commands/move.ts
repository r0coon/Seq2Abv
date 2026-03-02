import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  MessageActionRowComponentBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextChannel,
} from 'discord.js';
import { getTicketByChannel, updateTicketCategory } from '../../../database/tickets';
import { loadCategoryConfig, loadSubCategories, sanitizeChannelName } from '../config';
import type { SubCategoryConfig } from '../types';
import logger from '../../../utils/logging';

const FILE = '@cmd/move';

// ── shared move logic ─────────────────────────────────────────────────────────

export async function performMoveAction(
  channel:        TextChannel,
  ticket:         { id: number; category_id: string; created_by: string },
  targetCatId:    string,
  targetLabel:    string,
  discordCatId:   string | undefined,
  staffRoleId:    string | undefined,
  userId:         string,
  channelNamePat?: string,
): Promise<void> {
  if (channelNamePat) {
    let username = 'user';
    try { username = (await channel.guild.members.fetch(ticket.created_by)).user.username; } catch { /* fallback */ }
    const newName = sanitizeChannelName(
      channelNamePat
        .replace(/\{ticketId\}/g, String(ticket.id).padStart(4, '0'))
        .replace(/\{username\}/g, username)
        .replace(/\{mention\}/g,  username),
    );
    await channel.setName(newName).catch(() => null);
  }

  if (discordCatId) await channel.setParent(discordCatId, { lockPermissions: false });

  // alte staff-rolle weg, neue rein
  const oldCfg = loadCategoryConfig(ticket.category_id);
  if (oldCfg?.staffRoleId && oldCfg.staffRoleId !== staffRoleId)
    await channel.permissionOverwrites.delete(oldCfg.staffRoleId).catch(() => null);
  if (staffRoleId)
    await channel.permissionOverwrites.edit(staffRoleId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });

  await updateTicketCategory(channel.id, targetCatId);

  await channel.send({
    components: [{ type: 17, components: [{ type: 10, content: `**Ticket von <@${userId}> nach **${targetLabel}** verschoben.**` }] }] as never,
    flags: MessageFlags.IsComponentsV2,
  }).catch(() => null);

  logger.info(`Ticket #${ticket.id} → ${targetCatId} by ${userId}`, FILE);
}

// ── /move ─────────────────────────────────────────────────────────────────────

export async function onCommandMove(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel) return;

  const ticket = await getTicketByChannel(channel.id).catch(() => null);
  if (!ticket || ticket.closed_at) {
    await interaction.reply({ content: 'Kein aktives Ticket.', flags: MessageFlags.Ephemeral });
    return;
  }

  const targetId = interaction.options.getString('kategorie', true);
  if (targetId === ticket.category_id) {
    await interaction.reply({ content: 'Ticket ist bereits in dieser Kategorie.', flags: MessageFlags.Ephemeral });
    return;
  }

  const newCfg = loadCategoryConfig(targetId);
  if (!newCfg) {
    await interaction.reply({ content: 'Kategorie nicht gefunden.', flags: MessageFlags.Ephemeral });
    return;
  }

  // sub-kategorien dropdown wenn nötig
  if (newCfg.subCategoryDir) {
    const subs = Object.entries(loadSubCategories(newCfg.subCategoryDir));
    if (subs.length) {
      const select = new StringSelectMenuBuilder()
        .setCustomId(`ticket_move_subcategory:${targetId}`)
        .setPlaceholder('Rang auswählen...')
        .addOptions(subs.map(([id, s]) => {
          const opt = new StringSelectMenuOptionBuilder().setLabel(s.label).setValue(id);
          if (s.description) opt.setDescription(s.description);
          if (s.emoji)       opt.setEmoji(s.emoji);
          return opt;
        }));
      await interaction.reply({
        content:    `-# Rang für **${newCfg.label ?? targetId}** wählen:`,
        components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select)],
        flags:      MessageFlags.Ephemeral,
      });
      return;
    }
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    await performMoveAction(channel, ticket, targetId, newCfg.label ?? targetId, newCfg.categoryId, newCfg.staffRoleId, interaction.user.id, newCfg.channelName);
    await interaction.editReply({ content: `✅ In **${newCfg.label ?? targetId}** verschoben.` });
  } catch (err) {
    await interaction.editReply({ content: `Fehler: ${(err as Error).message}` });
  }
}

// ── ticket_move_subcategory select ────────────────────────────────────────────

export async function onMoveSubCategorySelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel) return;

  const ticket = await getTicketByChannel(channel.id).catch(() => null);
  if (!ticket || ticket.closed_at) {
    await interaction.reply({ content: 'Kein aktives Ticket.', flags: MessageFlags.Ephemeral });
    return;
  }

  const parentId  = interaction.customId.split(':')[1];
  const subId     = interaction.values[0];
  const parentCfg = loadCategoryConfig(parentId);
  const sub       = (parentCfg?.subCategoryDir ? loadSubCategories(parentCfg.subCategoryDir) : {})[subId] as SubCategoryConfig | undefined;

  if (!sub) {
    await interaction.reply({ content: 'Unter-Kategorie nicht gefunden.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();
  try {
    await performMoveAction(
      channel, ticket, parentId,
      `${parentCfg?.label ?? parentId} › ${sub.label}`,
      sub.categoryId  ?? parentCfg?.categoryId,
      sub.staffRoleId ?? parentCfg?.staffRoleId,
      interaction.user.id,
      sub.channelName ?? parentCfg?.channelName,
    );
    await interaction.editReply({ content: `✅ In **${sub.label}** verschoben.`, components: [] });
  } catch (err) {
    await interaction.editReply({ content: `Fehler: ${(err as Error).message}`, components: [] });
  }
}
