import fs   from 'fs';
import path  from 'path';
import { APIEmbed, MessageFlags } from 'discord.js';
import logger from '../../../utils/logging';

const FILE     = '@ticket/builders/template';
// __dirname = dist/modules/ticket/builders → 4 levels up = project root
const TMPL_DIR = path.resolve(__dirname, '../../../../template');

export type MessageType = 'text' | 'embed' | 'container';

export interface RenderedMessage {
  type:        MessageType;
  content?:    string;
  embeds?:     APIEmbed[];
  components?: unknown[];
  flags?:      number;
}

function fill(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === 'string')
    return value.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  if (Array.isArray(value))
    return value.map(v => fill(v, vars));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, fill(v, vars)]));
  return value;
}

export function renderTemplate(type: MessageType, vars: Record<string, string>): RenderedMessage {
  const filePath = path.join(TMPL_DIR, type);

  if (!fs.existsSync(filePath)) {
    logger.warn(`Template file not found: template/${type} — falling back to container.`, FILE);
    return {
      type:       'container',
      components: [{ type: 17, components: [{ type: 10, content: '## Ticket' }, { type: 14, divider: false }] }],
      flags:      MessageFlags.IsComponentsV2,
    };
  }

  const raw = fs.readFileSync(filePath, 'utf-8');

  switch (type) {
    case 'text':
      return { type, content: fill(raw.trim(), vars) as string };

    case 'embed': {
      const data = fill(JSON.parse(raw), vars) as { content?: string; embeds?: APIEmbed[] };
      return { type, content: data.content || undefined, embeds: data.embeds ?? [] };
    }

    case 'container': {
      const parsed     = JSON.parse(raw);
      const components = fill(Array.isArray(parsed) ? parsed : [parsed], vars) as unknown[];
      return { type, components, flags: MessageFlags.IsComponentsV2 };
    }

    default:
      logger.warn(`Unknown message type: "${type as string}" — falling back to text.`, FILE);
      return { type: 'text', content: fill(raw.trim(), vars) as string };
  }
}
