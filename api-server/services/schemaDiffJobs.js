import crypto from 'crypto';
import { buildSchemaDiff } from './schemaDiff.js';

class SchemaDiffJob {
  constructor(options) {
    this.id = crypto.randomUUID();
    this.userId = options.userId;
    this.adminUser = options.adminUser;
    this.sessionPermissions = options.sessionPermissions;
    this.schemaPath = options.schemaPath;
    this.schemaFile = options.schemaFile;
    this.allowDrops = options.allowDrops;
    this.status = 'queued';
    this.error = null;
    this.result = null;
    this.startedAt = null;
    this.finishedAt = null;
    this.progress = [];
    this.onProgress = options.onProgress;
  }

  emitProgress(message) {
    const payload = {
      jobId: this.id,
      message,
      at: new Date().toISOString(),
    };
    this.progress.push(payload);
    if (typeof this.onProgress === 'function') {
      this.onProgress(payload);
    }
  }

  async run() {
    this.status = 'running';
    this.startedAt = new Date().toISOString();
    const longRunningTimer = setTimeout(() => {
      this.emitProgress('Schema dump is taking longer than expected. Please stay on this tab if possible.');
    }, 60_000);
    try {
      this.emitProgress('Dumping current schema');
      const result = await buildSchemaDiff({
        user: this.adminUser,
        sessionPermissions: this.sessionPermissions,
        schemaPath: this.schemaPath,
        schemaFile: this.schemaFile,
        allowDrops: this.allowDrops,
        onProgress: (msg) => this.emitProgress(msg),
      });
      this.result = result;
      this.status = 'completed';
    } catch (err) {
      if (err.aborted) {
        this.status = 'cancelled';
      } else {
        this.status = 'failed';
      }
      this.error = {
        message: err.message,
        status: err.status,
        details: err.details,
      };
    } finally {
      clearTimeout(longRunningTimer);
      this.finishedAt = new Date().toISOString();
    }
    return this;
  }

  serialize() {
    return {
      id: this.id,
      status: this.status,
      error: this.error,
      result: this.result,
      progress: this.progress,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
    };
  }
}

const jobs = new Map();

export function enqueueSchemaDiffJob(options) {
  const job = new SchemaDiffJob(options);
  jobs.set(job.id, job);
  setImmediate(() => {
    job.run().catch(() => {});
  });
  return job;
}

export function getSchemaDiffJob(id) {
  return jobs.get(id) || null;
}

export function listSchemaDiffJobs() {
  return Array.from(jobs.values()).map((j) => j.serialize());
}
