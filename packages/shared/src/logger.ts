import winston from "winston";

export interface LoggerOptions {
  level?: string;
  service: string;
  chainId?: number;
  chainName?: string;
}

export function createLogger(opts: LoggerOptions): winston.Logger {
  return winston.createLogger({
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
}
