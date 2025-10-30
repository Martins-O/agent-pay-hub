import pino, { Logger, LoggerOptions } from 'pino';
import { AppEnv } from '../config';

type LoggerBindings = Record<string, unknown>;

export function createLogger(env: AppEnv, bindings: LoggerBindings = {}): Logger {
  const options: LoggerOptions = {
    level: env.LOG_LEVEL,
    transport:
      env.LOG_JSON_ENABLED || env.NODE_ENV === 'production'
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard'
            }
          },
    base: bindings
  };

  return pino(options);
}
