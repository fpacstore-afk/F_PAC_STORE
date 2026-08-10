
import fs from 'fs';
import path from 'path';

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  AUDIT = 'AUDIT'
}

function sanitizeLogData(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeLogData);
  
  const sensitiveKeys = ['token', 'authorization', 'password', 'secret', 'cvv', 'cardnumber', 'card_number', 'access_token', 'apikey', 'api_key', 'private_key'];
  const clean: any = {};
  
  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(s => lowerKey.includes(s))) {
      clean[key] = '[REDACTED]';
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      clean[key] = sanitizeLogData(obj[key]);
    } else {
      clean[key] = obj[key];
    }
  }
  return clean;
}

export function log(level: LogLevel, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const sanitizedData = data ? sanitizeLogData(data) : null;
  
  const logString = `[${timestamp}] [${level}] ${message} ${sanitizedData ? JSON.stringify(sanitizedData) : ''}\n`;
  
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
