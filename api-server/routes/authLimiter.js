let rateLimit;

try {
  const mod = await import('express-rate-limit');
  rateLimit = mod.default ?? mod;
} catch {
  rateLimit = (options = {}) => {
    const windowMs = options.windowMs ?? 60 * 1000;
    const max = options.max ?? 5;
    const keyGenerator = options.keyGenerator ?? ((req) => req.ip);
    const statusCode = options.statusCode ?? 429;
    const message = options.message ?? { message: 'Too many requests' };
    const store = new Map();

    function resolveLimit(req, res) {
      return typeof max === 'function' ? max(req, res) : max;
    }

    return (req, res, next) => {
      const key = keyGenerator(req, res);
      const now = Date.now();
      let entry = store.get(key);
      if (!entry || now - entry.start >= windowMs) {
        entry = { count: 0, start: now };
        store.set(key, entry);
      }

      const limit = resolveLimit(req, res);
      if (entry.count >= limit) {
        if (typeof res.status === 'function') res.status(statusCode);
        if (typeof res.json === 'function') {
          res.json(message);
        } else if (typeof res.send === 'function') {
          res.send(message);
        } else if (typeof res.end === 'function') {
          res.end();
        }
        return;
      }

      entry.count += 1;
      next();
    };
  };
}

export function createAuthAttemptLimiter(options = {}) {
  return rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const username = String(req.body?.username || req.body?.empid || '').trim().toLowerCase();
      return username ? `${req.ip}:${username}` : req.ip;
    },
    message: {
      message: 'Too many authentication attempts. Please try again later.',
    },
    ...options,
  });
}
