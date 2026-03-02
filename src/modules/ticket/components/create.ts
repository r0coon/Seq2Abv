import {
  ActionRowBuilder,
  ButtonInteraction,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { loadCategoryConfig, loadSubCategories } from '../config';
import { buildCreateModal }                      from '../builders/modal';
import { createTicket, ModalField }              from '../services/create';
import { resetPanelDropdown }                    from '../services/panel';

// ── panel dropdown / ticket erstellen ────────────────────────────────────────

export async function onTicketCreate(
  category:    string,
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
  if (interaction.isStringSelectMenu() && interaction.message)
    resetPanelDropdown(interaction.message).catch(() => {});

  if (category === 'none') {
    await interaction.reply({ content: 'Bitte wähle eine Kategorie.', flags: MessageFlags.Ephemeral });
    return;
  }

  const config = loadCategoryConfig(category);

  if (config?.subCategoryDir) {
    const subs = Object.entries(loadSubCategories(config.subCategoryDir));
    if (subs.length) {
      const sel = new StringSelectMenuBuilder()
        .setCustomId(`ticket_subcategory_select:${category}`)
        .setPlaceholder('Rang auswählen...')
        .addOptions(subs.map(([id, s]) => {
          const opt = new StringSelectMenuOptionBuilder().setLabel(s.label).setValue(id);
          if (s.description) opt.setDescription(s.description);
          if (s.emoji)       opt.setEmoji(s.emoji);
          return opt;
        }));
      await interaction.reply({
        content:    '-# Rang auswählen:',
        components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(sel)],
        flags:      MessageFlags.Ephemeral,
      });
      return;
    }
  }

  if (config?.createModal) {
    await interaction.showModal(buildCreateModal(category, config.createModal));
    return;
  }

  await createTicket(category, interaction);
}

// ── sub-kategorie select ──────────────────────────────────────────────────────

export async function onSubCategorySelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const categoryId = interaction.customId.split(':')[1];
  const subId      = interaction.values[0];
  if (!categoryId || !subId) return;

  const config = loadCategoryConfig(categoryId);
  if (!config?.subCategoryDir) {
    await interaction.reply({ content: 'Kategorie nicht gefunden.', flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = loadSubCategories(config.subCategoryDir)[subId];
  if (!sub) {
    await interaction.reply({ content: 'Unbekannte Sub-Kategorie.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub.modal) {
    await interaction.showModal(buildCreateModal(categoryId, sub.modal, subId));
    return;
  }

  await createTicket(categoryId, interaction, { role: sub.label }, sub.channelName);
}

// ── modal create submit ───────────────────────────────────────────────────────

export async function onModalCreate(interaction: ModalSubmitInteraction): Promise<void> {
  const parts      = interaction.customId.split(':');
  const categoryId = parts[1];
  const subId      = parts[2] ?? null;
  if (!categoryId) return;

  const extraVars: Record<string, string> = {};
  let channelNameOverride: string | undefined;
  let fieldDefs: { id: string; label: string }[] = [];

  const cfg = loadCategoryConfig(categoryId);
  if (subId && cfg?.subCategoryDir) {
    const sub = loadSubCategories(cfg.subCategoryDir)[subId];
    if (sub?.channelName)   channelNameOverride = sub.channelName;
    if (sub?.label)         extraVars['role']   = sub.label;
    if (sub?.modal?.fields) fieldDefs           = sub.modal.fields;
  } else if (cfg?.createModal?.fields) {
    fieldDefs = cfg.createModal.fields;
  }

  for (const [id] of interaction.fields.fields) {
    try { extraVars[`field_${id}`] = interaction.fields.getTextInputValue(id); } catch { /* überspringen */ }
  }

  const modalFields: ModalField[] = fieldDefs.map(f => ({
    label: f.label,
    value: (() => { try { return interaction.fields.getTextInputValue(f.id); } catch { return ''; } })(),
  }));

  await createTicket(categoryId, interaction, extraVars, channelNameOverride, modalFields.length ? modalFields : undefined);
}
