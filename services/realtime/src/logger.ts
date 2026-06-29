import pino from "pino";

export function createLogger(config: { level: string; nodeEnv: string }) {
  return pino({
    level: config.level,
    ...(config.nodeEnv !== "production"
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:HH:MM:ss.l",
              ignore: "pid,hostname",
            },
          },
        }
      : {}),
  });
}

export type Logger = ReturnType<typeof createLogger>;
