import path from 'path';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: '\x1b[36m',
  INFO:  '\x1b[34m',
  WARN:  '\x1b[33m',
  ERROR: '\x1b[31m',
};
const RESET = '\x1b[0m';

function getTimestamp(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const dd   = String(now.getDate()).padStart(2, '0');
  const hh   = String(now.getHours()).padStart(2, '0');
  const min  = String(now.getMinutes()).padStart(2, '0');
  const ss   = String(now.getSeconds()).padStart(2, '0');
  const ms   = String(now.getMilliseconds()).padStart(3, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss},${ms}`;
}

function getCallerFile(): string {
  const err = new Error();
  const lines = err.stack?.split('\n') ?? [];
  // Zeilen 0 = Error, 1 = getCallerFile, 2 = log/info/warn/error, 3 = tatsächlicher Aufrufer
  const callerLine = lines[3] ?? lines[lines.length - 1] ?? '';
  const match = callerLine.match(/\((.+?):\d+:\d+\)/) ?? callerLine.match(/at (.+?):\d+:\d+/);
  if (!match) return 'unknown';
  const fullPath = match[1];
  const srcIndex = fullPath.indexOf(`${path.sep}src${path.sep}`);
  if (srcIndex !== -1) {
    return '@src' + fullPath.slice(srcIndex + 4).replace(/\\/g, '/');
  }
  return path.basename(fullPath);
}

function log(level: LogLevel, message: string, callerFile?: string): void {
  const file   = callerFile ?? getCallerFile();
  const ts     = getTimestamp();
  const color  = LEVEL_COLORS[level];
  const prefix = `${ts} - ${color}${level}${RESET} -`;
  console.log(`${prefix} ${file}${message ? ` ${message}` : ''}`);
}

const logger = {
  debug: (message = '', file?: string) => log('DEBUG', message, file),
  info:  (message = '', file?: string) => log('INFO',  message, file),
  warn:  (message = '', file?: string) => log('WARN',  message, file),
  error: (message = '', file?: string) => log('ERROR', message, file),
};

export default logger;
