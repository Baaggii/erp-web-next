let rateLimit;

try {
  const mod = await import('express-rate-limit');
  rateLimit = mod.default ?? mod;
} catch {
  rateLimit = (options = {}) => {
    const windowMs = options.windowMs ?? 60 * 1000;
    const max = options.max ?? 5;
    const skipSuccessful = options.skipSuccessfulRequests ?? false;
    const keyGenerator = options.keyGenerator ?? ((req) => req.ip);
    const statusCode = options.statusCode ?? 429;
    const message = options.message ?? 'Too many requests';
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
      if (skipSuccessful && typeof res.on === 'function') {
        res.once('finish', () => {
          if (res.statusCode < 400 && entry.count > 0) {
            entry.count -= 1;
          }
        });
      }

      next();
    };
  };
}

export function createManualTranslationsLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000,
    max = (req) => (req.user ? 600 : 100),
    standardHeaders = true,
    legacyHeaders = false,
    skipSuccessfulRequests = true,
    keyGenerator = (req) => {
      if (req.user?.id) {
        const company = req.user.companyId ?? 'global';
        return `user:${req.user.id}:company:${company}`;
      }
      return req.ip;
    },
    ...rest
  } = options;

  return rateLimit({
    windowMs,
    max,
    standardHeaders,
    legacyHeaders,
    skipSuccessfulRequests,
    keyGenerator,
    ...rest,
  });
}
