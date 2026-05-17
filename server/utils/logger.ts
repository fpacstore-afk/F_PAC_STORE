
import fs from 'fs';
import path from 'path';

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  AUDIT = 'AUDIT'
}

export function log(level: LogLevel, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    data: data || null
  };

  const logString = `[${timestamp}] [${level}] ${message} ${data ? JSON.stringify(data) : ''}\n`;
  
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
