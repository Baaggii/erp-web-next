import net from 'node:net';
import tls from 'node:tls';

class IncompleteResponseError extends Error {}

function encodeCommand(parts) {
  const segments = [`*${parts.length}\r\n`];
  for (const part of parts) {
    const value = String(part);
    segments.push(`$${Buffer.byteLength(value)}\r\n${value}\r\n`);
  }
  return segments.join('');
}

function parseRedisResponse(buffer, start = 0) {
  function parseAt(offset) {
    if (offset >= buffer.length) throw new IncompleteResponseError('No data');
    const type = String.fromCharCode(buffer[offset]);
    const lineEnd = buffer.indexOf('\r\n', offset);

    if (type === '+' || type === '-' || type === ':') {
      if (lineEnd < 0) throw new IncompleteResponseError('Incomplete line response');
      const payload = buffer.toString('utf8', offset + 1, lineEnd);
      if (type === '+') return { value: payload, next: lineEnd + 2 };
      if (type === ':') return { value: Number(payload), next: lineEnd + 2 };
      const err = new Error(payload);
      err.redis = true;
      throw err;
    }

    if (type === '$') {
      if (lineEnd < 0) throw new IncompleteResponseError('Incomplete bulk length');
      const len = Number(buffer.toString('utf8', offset + 1, lineEnd));
      if (len < 0) return { value: null, next: lineEnd + 2 };
      const startOfPayload = lineEnd + 2;
      const endOfPayload = startOfPayload + len;
      if (endOfPayload + 2 > buffer.length) throw new IncompleteResponseError('Incomplete bulk payload');
      const value = buffer.toString('utf8', startOfPayload, endOfPayload);
      return { value, next: endOfPayload + 2 };
    }

    if (type === '*') {
      if (lineEnd < 0) throw new IncompleteResponseError('Incomplete array length');
      const len = Number(buffer.toString('utf8', offset + 1, lineEnd));
      if (len < 0) return { value: null, next: lineEnd + 2 };
      let cursor = lineEnd + 2;
      const values = [];
      for (let i = 0; i < len; i += 1) {
        const parsed = parseAt(cursor);
        values.push(parsed.value);
        cursor = parsed.next;
      }
      return { value: values, next: cursor };
    }

    throw new Error(`Unsupported RESP type: ${type}`);
  }

  return parseAt(start);
}

function getRedisConfig() {
  const redisUrl = String(process.env.REDIS_URL || '').trim();
  if (!redisUrl) {
    throw new Error('REDIS_URL is required for messaging rate limiting');
  }
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: decodeURIComponent(parsed.username || ''),
    password: decodeURIComponent(parsed.password || ''),
    db: parsed.pathname ? Number(parsed.pathname.slice(1) || 0) : 0,
    tls: parsed.protocol === 'rediss:',
  };
}

function runRedisCommands(commands) {
  const cfg = getRedisConfig();
  return new Promise((resolve, reject) => {
    const socket = cfg.tls
      ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host })
      : net.createConnection({ host: cfg.host, port: cfg.port });

    let buffer = Buffer.alloc(0);
    const responses = [];
    let expectedResponses = 0;

    const cleanup = () => {
      socket.removeAllListeners();
      if (!socket.destroyed) socket.destroy();
    };

    socket.setTimeout(5000);
    socket.once('error', (err) => {
      cleanup();
      reject(err);
    });
    socket.once('timeout', () => {
      cleanup();
      reject(new Error('Redis command timed out'));
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        let cursor = 0;
        while (cursor < buffer.length) {
          const parsed = parseRedisResponse(buffer, cursor);
          responses.push(parsed.value);
          cursor = parsed.next;
          if (responses.length === expectedResponses) {
            cleanup();
            resolve(responses);
            return;
          }
        }
        buffer = buffer.subarray(cursor);
      } catch (error) {
        if (error instanceof IncompleteResponseError) {
          return;
        }
        cleanup();
        reject(error);
      }
    });

    socket.once('connect', () => {
      const allCommands = [];
      if (cfg.username || cfg.password) {
        allCommands.push(['AUTH', cfg.username || 'default', cfg.password]);
      }
      if (Number.isFinite(cfg.db) && cfg.db > 0) {
        allCommands.push(['SELECT', cfg.db]);
      }
      allCommands.push(...commands);
      expectedResponses = allCommands.length;
      socket.write(allCommands.map((cmd) => encodeCommand(cmd)).join(''));
    });
  });
}

export async function redisEval(script, keys = [], args = []) {
  const responses = await runRedisCommands([
    ['EVAL', script, keys.length, ...keys, ...args],
  ]);
  return responses[responses.length - 1];
}
