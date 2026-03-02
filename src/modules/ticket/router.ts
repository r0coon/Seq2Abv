import {
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import fs   from 'fs';
import path from 'path';

const CONFIG_PATH = path.resolve(process.cwd(), 'config/ticket/channel-message.json');

type ButtonHandler = (interaction: ButtonInteraction) => Promise<void>;
type SelectHandler = (interaction: StringSelectMenuInteraction) => Promise<void>;
type ModalHandler  = (interaction: ModalSubmitInteraction) => Promise<void>;

const buttonHandlers       = new Map<string, ButtonHandler>();
const buttonPrefixHandlers = new Map<string, ButtonHandler>();
const selectHandlers       = new Map<string, SelectHandler>();
const selectPrefixHandlers = new Map<string, SelectHandler>();
const modalPrefixHandlers  = new Map<string, ModalHandler>();

export function registerButton(customId: string, handler: ButtonHandler): void {
  buttonHandlers.set(customId, handler);
}

export function registerButtonPrefix(prefix: string, handler: ButtonHandler): void {
  buttonPrefixHandlers.set(prefix, handler);
}

export function registerSelect(customId: string, handler: SelectHandler): void {
  selectHandlers.set(customId, handler);
}

export function registerSelectPrefix(prefix: string, handler: SelectHandler): void {
  selectPrefixHandlers.set(prefix, handler);
}

export function registerModalPrefix(prefix: string, handler: ModalHandler): void {
  modalPrefixHandlers.set(prefix, handler);
}

export async function dispatchButton(interaction: ButtonInteraction): Promise<boolean> {
  const exact = buttonHandlers.get(interaction.customId);
  if (exact) { await exact(interaction); return true; }

  for (const [prefix, handler] of buttonPrefixHandlers) {
    if (interaction.customId.startsWith(prefix)) { await handler(interaction); return true; }
  }
  return false;
}

export async function dispatchSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  const exact = selectHandlers.get(interaction.customId);
  if (exact) { await exact(interaction); return true; }

  for (const [prefix, handler] of selectPrefixHandlers) {
    if (interaction.customId.startsWith(prefix)) { await handler(interaction); return true; }
  }
  return false;
}

export async function dispatchModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  for (const [prefix, handler] of modalPrefixHandlers) {
    if (interaction.customId.startsWith(prefix)) { await handler(interaction); return true; }
  }
  return false;
}

interface DropdownConfig { customId: string }
interface PanelConfig   { dropdown?: DropdownConfig }

export function registerPanelViews(
  onTicketCreate:          (category: string, interaction: ButtonInteraction | StringSelectMenuInteraction) => Promise<void>,
  onTicketClose:           (interaction: ButtonInteraction) => Promise<void>,
  onTranscriptToggle:      (interaction: ButtonInteraction) => Promise<void>,
  onModalCreate:           (interaction: ModalSubmitInteraction) => Promise<void>,
  onModalClose:            (interaction: ModalSubmitInteraction) => Promise<void>,
  onModalArchive:          (interaction: ModalSubmitInteraction) => Promise<void>,
  onSubCategorySelect:     (interaction: StringSelectMenuInteraction) => Promise<void>,
  onMoveSubCategorySelect: (interaction: StringSelectMenuInteraction) => Promise<void>,
): void {
  buttonHandlers.clear();
  buttonPrefixHandlers.clear();
  selectHandlers.clear();
  selectPrefixHandlers.clear();
  modalPrefixHandlers.clear();

  const config: PanelConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

  if (config.dropdown) registerSelect(config.dropdown.customId, (i) => onTicketCreate(i.values[0], i));

  registerButtonPrefix('ticket_close:',             onTicketClose);
  registerButtonPrefix('ticket_transcript_toggle:', onTranscriptToggle);

  registerModalPrefix('ticket_modal_create:',  onModalCreate);
  registerModalPrefix('ticket_modal_close:',   onModalClose);
  registerModalPrefix('ticket_modal_archive:', onModalArchive);

  registerSelectPrefix('ticket_subcategory_select:', onSubCategorySelect);
  registerSelectPrefix('ticket_move_subcategory:',   onMoveSubCategorySelect);
}
