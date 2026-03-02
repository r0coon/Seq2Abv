import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

export interface ModalFieldConfig {
  id:           string;
  label:        string;
  placeholder?: string;
  style:        'short' | 'paragraph';
  required?:    boolean;
  minLength?:   number;
  maxLength?:   number;
}

export interface CreateModalConfig {
  title:  string;
  fields: ModalFieldConfig[];
}

function textInput(field: ModalFieldConfig): ActionRowBuilder<TextInputBuilder> {
  const input = new TextInputBuilder()
    .setCustomId(field.id)
    .setLabel(field.label)
    .setStyle(field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(field.required ?? true);

  if (field.placeholder) input.setPlaceholder(field.placeholder);
  if (field.minLength)   input.setMinLength(field.minLength);
  if (field.maxLength)   input.setMaxLength(field.maxLength);

  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

export function buildCreateModal(categoryId: string, config: CreateModalConfig, subCategoryId?: string): ModalBuilder {
  const customId = subCategoryId
    ? `ticket_modal_create:${categoryId}:${subCategoryId}`
    : `ticket_modal_create:${categoryId}`;

  const modal = new ModalBuilder().setCustomId(customId).setTitle(config.title);
  modal.addComponents(config.fields.slice(0, 5).map(textInput));
  return modal;
}

function closeReasonInput(): ActionRowBuilder<TextInputBuilder> {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason for closing')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMinLength(10)
      .setMaxLength(500)
      .setPlaceholder('Please provide a reason for closing this ticket...'),
  );
}

export function buildCloseModal(categoryId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`ticket_modal_close:${categoryId}`)
    .setTitle('Close Ticket')
    .addComponents(closeReasonInput());
}

export function buildArchiveModal(channelId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`ticket_modal_archive:${channelId}`)
    .setTitle('Ticket archivieren')
    .addComponents(closeReasonInput());
}
