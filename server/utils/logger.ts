
import fs from 'fs';
import path from 'path';

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  AUDIT = 'AUDIT'
}

export function redactLogText(value: string): string {
  return value
    .replace(/([?&](?:token|access_token|key|secret|signature|code|email|cpf|phone)=)[^&#\s]*/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]');
}

export function sanitizeLogData(obj: any, seen = new WeakSet<object>()): any {
  if (typeof obj === 'string') return redactLogText(obj);
  if (!obj || typeof obj !== 'object') return obj;
  if (seen.has(obj)) return '[CIRCULAR]';
  seen.add(obj);
  if (Array.isArray(obj)) return obj.map(value => sanitizeLogData(value, seen));
  if (obj instanceof Error) return { name: obj.name, message: redactLogText(obj.message) };
  
  const sensitiveKeys = ['token', 'authorization', 'password', 'secret', 'cvv', 'cardnumber', 'card_number', 'access_token', 'apikey', 'api_key', 'private_key', 'cpf', 'phone', 'email', 'address'];
  const clean: any = {};
  
  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(s => lowerKey.includes(s))) {
      clean[key] = '[REDACTED]';
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      clean[key] = sanitizeLogData(obj[key], seen);
    } else {
      clean[key] = sanitizeLogData(obj[key], seen);
    }
  }
  return clean;
}

export function log(level: LogLevel, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const sanitizedData = data ? sanitizeLogData(data) : null;
  
  const logString = `[${timestamp}] [${level}] ${redactLogText(message)} ${sanitizedData ? JSON.stringify(sanitizedData) : ''}\n`;
  
  // Console logging for real-time monitoring
  if (level === LogLevel.ERROR) {
    console.error(logString);
  } else if (level === LogLevel.WARN) {
    console.warn(logString);
  } else {
    console.log(logString);
  }

  // Skip disk logging in production/serverless
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    return;
  }

  try {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
    fs.appendFileSync(path.join(logDir, 'audit.log'), logString);
  } catch (e) {
    // Silently ignore log write errors
  }
}

export const logger = {
  info: (msg: string, data?: any) => log(LogLevel.INFO, msg, data),
  warn: (msg: string, data?: any) => log(LogLevel.WARN, msg, data),
  error: (msg: string, data?: any) => log(LogLevel.ERROR, msg, data),
  audit: (msg: string, data?: any) => log(LogLevel.AUDIT, msg, data)
};
