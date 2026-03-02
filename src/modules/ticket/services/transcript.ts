import * as discordTranscripts from 'discord-html-transcripts';
import { TextChannel }         from 'discord.js';
import fs                      from 'fs';
import path                    from 'path';
import logger                  from '../../../utils/logging';

const FILE    = '@ticket/services/transcript';
// __dirname = dist/modules/ticket/services → 4 levels up = project root
const OUT_DIR = path.resolve(__dirname, '../../../../assets/transcript');

/** no-op, kept for API compat */
export function warmupExporter(): void {}

/**
 * HTML transcript via discord-html-transcripts.
 * gespeichert als <ticketId><userId>.html in /assets/transcript/
 */
export async function exportTranscript(
  channel:  TextChannel,
  ticketId: number | string,
  userId:   string,
): Promise<string | null> {
  try { fs.mkdirSync(OUT_DIR, { recursive: true }); } catch { /* ignore */ }

  const outFile = path.join(OUT_DIR, `${ticketId}${userId}.html`);

  try {
    const html = await discordTranscripts.createTranscript(channel, {
      limit:      -1,
      returnType: discordTranscripts.ExportReturnType.String,
      poweredBy:  false,
      hydrate:    true,
      footerText: 'Exportiert: {number} Nachricht{s}',
    });

    fs.writeFileSync(outFile, html as string, 'utf8');
    return outFile;
  } catch (err) {
    logger.warn(`Transcript export failed (#${channel.name}): ${(err as Error).message}`, FILE);
    return null;
  }
}
