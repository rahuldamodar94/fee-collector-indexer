import winston from "winston";

export interface LoggerOptions {
  level?: string;
  service: string;
  chainId?: number;
  chainName?: string;
}

let _logger: winston.Logger | undefined;

export function createLogger(opts: LoggerOptions): winston.Logger {
  const logger = winston.createLogger({
    level: opts.level ?? "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    defaultMeta: {
      service: opts.service,
      ...(opts.chainId !== undefined && { chainId: opts.chainId }),
      ...(opts.chainName && { chainName: opts.chainName }),
    },
    transports: [new winston.transports.Console()],
  });
  _logger = logger;
  return logger;
}

export function getLogger(): winston.Logger {
  if (!_logger) {
    throw new Error("logger not initialized, call createLogger() first");
  }
  return _logger;
}
