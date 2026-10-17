const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { service: 'peerpal-backend' },
  // Pretty-print in dev; structured JSON in production (Render log drain reads JSON)
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service' } }
    : undefined,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token', '*.email'],
    censor: '[REDACTED]',
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({
      method:    req.method,
      url:       req.url,
      requestId: req.id,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

module.exports = logger;
