import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { addBlacklist, removeBlacklist, getAllTimedBlacklist, purgeExpiredBlacklist } from '../../../database/blacklist';
import logger from '../../../utils/logging';

const FILE       = '@cmd/blacklist';
const MAX_TIMOUT = 2_147_483_647; // node.js timeout limit ~24.8 tage

// ── duration parser ───────────────────────────────────────────────────────────

// gibt undefined zurück wenn ungültig, null für permanent, Date für zeitlich
export function parseDuration(raw: string): Date | null | undefined {
  if (raw.toLowerCase() === 'permanent') return null;
  const m = raw.match(/^(\d+)([mhdw])$/i);
  if (!m) return undefined;
  const ms: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return new Date(Date.now() + parseInt(m[1], 10) * (ms[m[2].toLowerCase()] ?? 0));
}

// ── auto-expiry scheduler ─────────────────────────────────────────────────────

export function scheduleExpiry(userId: string, expiresAt: Date): void {
  const delay = expiresAt.getTime() - Date.now();
  if (delay <= 0) { removeBlacklist(userId).catch(() => null); return; }
  setTimeout(async () => {
    // chunked weil node.js setTimeout limit
    if (Date.now() < expiresAt.getTime()) { scheduleExpiry(userId, expiresAt); return; }
    await removeBlacklist(userId).catch(() => null);
  }, Math.min(delay, MAX_TIMOUT));
}

export async function scheduleBlacklistExpiry(): Promise<void> {
  try {
    await purgeExpiredBlacklist();
    const entries = await getAllTimedBlacklist();
    entries.forEach(e => { if (e.expires_at) scheduleExpiry(e.user_id, new Date(e.expires_at)); });
  } catch (err) {
    logger.warn(`Blacklist scheduler error: ${(err as Error).message}`, FILE);
  }
}

// ── /blacklist ────────────────────────────────────────────────────────────────

export async function onCommandBlacklist(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    const target = interaction.options.getUser('user', true);
    const raw    = interaction.options.getString('dauer', true);
    const grund  = interaction.options.getString('grund', true);
    const expiry = parseDuration(raw);

    if (expiry === undefined) {
      await interaction.reply({ content: 'Ungültige Dauer. Nutze z.B. `1d`, `7d`, `2w` oder `permanent`.', flags: MessageFlags.Ephemeral });
      return;
    }

    await addBlacklist({ userId: target.id, reason: grund, expiresAt: expiry, createdBy: interaction.user.id });
    if (expiry) scheduleExpiry(target.id, expiry);

    const expiryText = expiry ? `bis <t:${Math.floor(expiry.getTime() / 1000)}:F>` : 'permanent';
    await interaction.reply({
      components: [{ type: 17, components: [
        { type: 10, content: `**<@${target.id}> wurde gesperrt.**` },
        { type: 14, divider: false },
        { type: 10, content: `**Grund:** ${grund}\n**Dauer:** ${expiryText}` },
      ]}] as never,
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    logger.info(`Blacklist: ${target.username} (${target.id}) banned by ${interaction.user.username} — ${raw}`, FILE);

  } else if (sub === 'remove') {
    const target  = interaction.options.getUser('user', true);
    const removed = await removeBlacklist(target.id);
    if (!removed) {
      await interaction.reply({ content: `<@${target.id}> ist nicht gesperrt.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      components: [{ type: 17, components: [{ type: 10, content: `**<@${target.id}> wurde entsperrt.**` }] }] as never,
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    logger.info(`Blacklist: ${target.username} (${target.id}) unbanned by ${interaction.user.username}`, FILE);
  }
}
