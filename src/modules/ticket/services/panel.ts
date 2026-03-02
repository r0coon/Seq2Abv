import {
  Client,
  Message,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageActionRowComponentBuilder,
  MessageFlags,
  MessageCreateOptions,
  MessageEditOptions,
} from 'discord.js';
import fs   from 'fs';
import path from 'path';
import logger             from '../../../utils/logging';
import { readGeneralConfig } from '../config';

const FILE        = '@ticket/services/panel';
const CONFIG_PATH = path.resolve(process.cwd(), 'config/ticket/channel-message.json');
// __dirname = dist/modules/ticket/services → 4 levels up = project root
const ROOT_DIR    = path.resolve(__dirname, '../../../..');

interface DropdownOption {
  label:        string;
  description?: string;
  emoji?:       string;
  value:        string;
}

interface DropdownConfig {
  placeholder:        string;
  customId:           string;
  placeholderOption?: DropdownOption;
  options:            DropdownOption[];
}

interface EmbedConfig {
  title?:       string;
  description?: string;
  color?:       number;
  footer?:      string;
}

interface PanelSection {
  label:        string;
  emoji?:       string;
  description?: string;
}

interface PanelBlockConfig {
  title:        string;
  description?: string;
  image?:       string;
  accentColor?: number;
  sections?:    PanelSection[];
}

interface PanelConfig {
  messageId: string | null;
  panel?:    PanelBlockConfig;
  embed:     EmbedConfig;
  dropdown?: DropdownConfig;
}

function readConfig(): PanelConfig {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as PanelConfig;
}

function saveMessageId(messageId: string): void {
  const config     = readConfig();
  config.messageId = messageId;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function buildInteractiveRows(config: PanelConfig): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  if (!config.dropdown) return [];

  const { dropdown } = config;
  const allOptions: DropdownOption[] = [
    ...(dropdown.placeholderOption ? [dropdown.placeholderOption] : []),
    ...dropdown.options,
  ];
  const select = new StringSelectMenuBuilder()
    .setCustomId(dropdown.customId)
    .setPlaceholder(dropdown.placeholder)
    .addOptions(allOptions.map((opt, idx) => {
      const o = new StringSelectMenuOptionBuilder().setLabel(opt.label).setValue(opt.value);
      if (opt.description) o.setDescription(opt.description);
      if (opt.emoji)       o.setEmoji(opt.emoji);
      if (idx === 0 && dropdown.placeholderOption) o.setDefault(true);
      return o;
    }));

  return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select)];
}

interface ContainerPayload {
  components: unknown[];
  flags:      number;
  files?:     { attachment: string; name: string }[];
}

function buildContainerPanel(config: PanelConfig, existingBannerUrl: string | null = null): ContainerPayload {
  const panelCfg  = config.panel!;
  const imagePath = panelCfg.image ? path.resolve(ROOT_DIR, panelCfg.image) : null;
  const hasImage  = !!(imagePath && fs.existsSync(imagePath));
  const bannerRef = existingBannerUrl ?? (hasImage ? 'attachment://banner.png' : null);

  const rawContainers: unknown[] = [];

  if (bannerRef) {
    rawContainers.push({
      type:         17,
      ...(panelCfg.accentColor != null ? { accent_color: panelCfg.accentColor } : {}),
      components: [{ type: 12, items: [{ media: { url: bannerRef } }] }],
    });
  }

  const sections: { label: string; emoji?: string; description?: string }[] =
    panelCfg.sections ?? config.dropdown?.options ?? [];

  const sectionsText = sections
    .map(s => {
      const prefix = s.emoji ? `${s.emoji}  ` : '';
      const desc   = s.description ? `\n${s.description}` : '';
      return `${prefix}**${s.label.toUpperCase()}**${desc}`;
    })
    .join('\n\n');

  const interactiveRows = buildInteractiveRows(config).map(r => r.toJSON());

  const mainComponents: unknown[] = [{ type: 10, content: `## ${panelCfg.title}` }];

  if (panelCfg.description || sectionsText) mainComponents.push({ type: 14, divider: true });
  if (panelCfg.description)                mainComponents.push({ type: 10, content: panelCfg.description });
  if (sectionsText) {
    mainComponents.push({ type: 14, divider: true });
    mainComponents.push({ type: 10, content: sectionsText });
  }
  if (interactiveRows.length > 0) {
    mainComponents.push({ type: 14, divider: false });
    mainComponents.push(...interactiveRows);
  }

  rawContainers.push({ type: 17, components: mainComponents });

  const needsUpload = !existingBannerUrl && hasImage && imagePath;
  return {
    components: rawContainers,
    flags:      MessageFlags.IsComponentsV2,
    ...(needsUpload ? { files: [{ attachment: imagePath!, name: 'banner.png' }] } : {}),
  };
}

export async function resetPanelDropdown(message: Message): Promise<void> {
  const config = readConfig();
  if (!config.panel) return;

  const bannerUrl = message.attachments.first()?.url ?? null;
  const built     = buildContainerPanel(config, bannerUrl);

  await message.edit({
    components: built.components as MessageEditOptions['components'],
    flags:      built.flags as number,
  });
}

function buildEmbedPanel(config: PanelConfig): { embed: EmbedBuilder; rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] } {
  const embed = new EmbedBuilder();
  if (config.embed.title)       embed.setTitle(config.embed.title);
  if (config.embed.description) embed.setDescription(config.embed.description);
  if (config.embed.color)       embed.setColor(config.embed.color);
  if (config.embed.footer)      embed.setFooter({ text: config.embed.footer });
  return { embed, rows: buildInteractiveRows(config) };
}

// ── Deploy ────────────────────────────────────────────────────────────────────

export async function deployPanel(client: Client): Promise<void> {
  if (!fs.existsSync(CONFIG_PATH)) {
    logger.error(`Config not found: ${CONFIG_PATH}`, FILE);
    return;
  }

  const config   = readConfig();
  const general  = readGeneralConfig();
  const channel  = await client.channels.fetch(general.panelChannelId).catch(() => null);

  if (!channel?.isTextBased()) {
    logger.error(`Panel channel not found: ${general.panelChannelId}`, FILE);
    return;
  }

  const textChannel  = channel as TextChannel;
  const useContainer = !!config.panel;

  let sendPayload: MessageCreateOptions;
  let editPayload: MessageEditOptions;

  if (useContainer) {
    const built = buildContainerPanel(config);
    const base  = {
      components: built.components as MessageCreateOptions['components'],
      flags:      built.flags as number,
      ...(built.files ? { files: built.files } : {}),
    };
    sendPayload = base;
    editPayload = base;
  } else {
    const { embed, rows } = buildEmbedPanel(config);
    sendPayload = { embeds: [embed], components: rows };
    editPayload = { embeds: [embed], components: rows };
  }

  if (config.messageId) {
    const existing = await textChannel.messages.fetch(config.messageId).catch(() => null);
    if (existing) {
      try {
        await existing.edit(editPayload);
        return;
      } catch (err) {
        logger.warn(`Panel edit failed (${(err as Error).message}) — sending new.`, FILE);
        await existing.delete().catch(() => null);
        saveMessageId('');
      }
    } else {
      saveMessageId('');
    }
  }

  const msg = await textChannel.send(sendPayload);
  saveMessageId(msg.id);
}
