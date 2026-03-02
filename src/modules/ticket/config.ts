import { GuildMember }                  from 'discord.js';
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
}                                        from 'discord.js';
import fs                               from 'fs';
import path                             from 'path';
import type { CategoryConfig, SubCategoryConfig, GeneralConfig } from './types';

const ROOT = process.cwd();

export const CATS_DIR     = path.resolve(ROOT, 'config/ticket/categories');
export const SUBCATS_BASE = path.resolve(ROOT, 'config/ticket');
const GENERAL_PATH        = path.resolve(ROOT, 'config/ticket/general-config.json');

export function readGeneralConfig(): GeneralConfig {
  return JSON.parse(fs.readFileSync(GENERAL_PATH, 'utf-8')) as GeneralConfig;
}

export function loadCategoryConfig(id: string): CategoryConfig | null {
  const f = path.join(CATS_DIR, `${id}.json`);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf-8')) as CategoryConfig; }
  catch { return null; }
}

export function loadSubCategories(dirName: string): Record<string, SubCategoryConfig> {
  const dir = path.join(SUBCATS_BASE, dirName);
  if (!fs.existsSync(dir)) return {};
  const out: Record<string, SubCategoryConfig> = {};
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try { out[path.basename(file, '.json')] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as SubCategoryConfig; }
    catch { /* kaputtes json überspringen */ }
  }
  return out;
}

export function sanitizeChannelName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}

type AnyI = ButtonInteraction | ModalSubmitInteraction | ChatInputCommandInteraction;

export function getRoleIds(i: AnyI): string[] {
  const m = i.member;
  if (!m) return [];
  return m instanceof GuildMember ? [...m.roles.cache.keys()] : m.roles as string[];
}

export function hasPermission(i: AnyI, cfg: CategoryConfig): boolean {
  if (cfg.closePermissions.everyone) return true;
  const roles = getRoleIds(i);
  if (roles.includes(cfg.staffRoleId)) return true;
  return cfg.closePermissions.roles.some(r => roles.includes(String(r)));
}
