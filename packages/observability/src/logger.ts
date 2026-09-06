import { redact } from './redaction.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

/**
 * A structured console logger with redaction applied at emit. The OTel/Loki
 * transport is wired in a later Sprint 0 pass; the redaction boundary is here now
 * so no log line is ever added without it (NFR-35).
 */
export function createLogger(bindings: Record<string, unknown> = {}): Logger {
  function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const line = redact({
      level,
      time: new Date().toISOString(),
      msg: message,
      ...bindings,
      ...context,
    });
    console[level === 'debug' ? 'log' : level](JSON.stringify(line));
  }

  return {
    debug: (m, c) => emit('debug', m, c),
    info: (m, c) => emit('info', m, c),
    warn: (m, c) => emit('warn', m, c),
    error: (m, c) => emit('error', m, c),
    child: (extra) => createLogger({ ...bindings, ...extra }),
  };
}
