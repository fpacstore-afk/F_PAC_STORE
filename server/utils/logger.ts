
import fs from 'fs';
import path from 'path';

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  AUDIT = 'AUDIT'
}

function sensitiveLogKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['token', 'authorization', 'password', 'secret', 'cvv', 'cardnumber',
    'apikey', 'privatekey', 'serviceaccount', 'cookie', 'cpf', 'phone', 'email', 'address']
    .some(part => normalized.includes(part));
}

export function redactLogText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\bBasic\s+[A-Za-z0-9+/]+=*/gi, 'Basic [REDACTED]')
    .replace(/(^|[\r\n])((?:cookie|set-cookie)\s*:\s*)[^\r\n]*/gi, '$1$2[REDACTED]')
    .replace(/([?&])([^=&#\s]+)=([^&#\s]*)/g, (match, separator, name) => {
      let decoded: string;
      try { decoded = decodeURIComponent(name.replace(/\+/g, ' ')); }
      catch { return separator + '[REDACTED]'; }
      return sensitiveLogKey(decoded) || /^(?:key|signature|code)$/i.test(decoded)
        ? `${separator}${name}=[REDACTED]` : match;
    })
    .replace(/(["']?([A-Za-z][A-Za-z0-9_-]*)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&}]+)/g,
      (match, prefix, name) => sensitiveLogKey(name) || /^(?:key|signature|code)$/i.test(name)
        ? prefix + '[REDACTED]' : match)
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----|$)/g, '[PRIVATE KEY REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]');
}

export function sanitizeLogData(obj: any, seen = new WeakSet<object>()): any {
  if (typeof obj === 'string') return redactLogText(obj);
  if (!obj || typeof obj !== 'object') return obj;
  if (seen.has(obj)) return '[CIRCULAR]';
  seen.add(obj);
  if (Array.isArray(obj)) return obj.map(value => sanitizeLogData(value, seen));
  if (obj instanceof Error) return { name: obj.name, message: redactLogText(obj.message) };
  
  const clean: any = {};
  
  for (const key of Object.keys(obj)) {
    if (sensitiveLogKey(key)) {
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
