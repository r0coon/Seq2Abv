import fs from 'fs';
import path from 'path';
import { Client } from 'discord.js';
import { BotModule } from '../types/modules';
import logger from '../utils/logging';

const FILE = '@src/modules/index.ts';

export async function loadModules(client: Client): Promise<void> {
  const modulesDir = __dirname;
  const entries    = fs.readdirSync(modulesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const indexPath = path.join(modulesDir, entry.name, 'index.js');
    if (!fs.existsSync(indexPath)) continue;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(indexPath) as { default?: BotModule } & BotModule;
      const resolved: BotModule | undefined = mod.default ?? (typeof mod.setup === 'function' ? mod : undefined);

      if (!resolved) {
        logger.warn(`Module "${entry.name}" has no default export or setup function — skipped.`, FILE);
        continue;
      }

      await resolved.setup(client);
    } catch (err) {
      logger.error(`Failed to load module "${entry.name}": ${(err as Error).message}`, FILE);
    }
  }
}
