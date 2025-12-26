import crypto from 'crypto';
import { buildSchemaDiff } from './schemaDiff.js';

const jobs = new Map();
const JOB_TTL_MS = 60 * 60 * 1000;
const LONG_RUNNING_WARNING_MS = 45 * 1000;

function scheduleCleanup(jobId) {
  setTimeout(() => jobs.delete(jobId), JOB_TTL_MS).unref?.();
}

function serializeJob(job) {
  const base = {
    id: job.id,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    warnings: job.warnings || [],
  };
  if (job.status === 'succeeded') {
    base.result = job.result;
  }
  if (job.error) base.error = job.error;
  return base;
}

export function getSchemaDiffJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return null;
  return serializeJob(job);
}

export function cancelSchemaDiffJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return { cancelled: false, reason: 'Job not found' };
  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
    return { cancelled: false, reason: 'Job already completed' };
  }
  job.status = 'cancelled';
  job.progress = 'Cancelling...';
  job.updatedAt = new Date().toISOString();
  job.controller.abort();
  return { cancelled: true };
}

function updateProgress(job, message) {
  job.progress = message;
  job.updatedAt = new Date().toISOString();
}

export function startSchemaDiffJob(options) {
  const id = crypto.randomUUID();
  const controller = new AbortController();
  const job = {
    id,
    status: 'queued',
    progress: 'Queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    controller,
    warnings: [],
    error: null,
    result: null,
  };
  jobs.set(id, job);

  const longRunningTimer = setTimeout(() => {
    job.warnings.push(
      'Schema diff is taking longer than expected. Please keep this tab open or cancel the job.',
    );
    updateProgress(job, 'Still running... this may take a while for large schemas.');
  }, LONG_RUNNING_WARNING_MS);

  setImmediate(async () => {
    job.status = 'running';
    updateProgress(job, 'Validating inputs...');
    try {
      const result = await buildSchemaDiff({
        ...options,
        signal: controller.signal,
        onProgress: (msg) => updateProgress(job, msg),
      });
      job.status = 'succeeded';
      job.result = result;
      updateProgress(job, 'Completed');
    } catch (err) {
      if (controller.signal.aborted || err?.aborted) {
        job.status = 'cancelled';
        job.error = { message: 'Schema diff job cancelled', details: err?.details };
        updateProgress(job, 'Cancelled');
      } else {
        job.status = 'failed';
        job.error = {
          message: err?.message || 'Schema diff failed',
          code: err?.code,
          details: err?.details,
        };
        updateProgress(job, 'Failed');
      }
    } finally {
      clearTimeout(longRunningTimer);
      job.completedAt = new Date().toISOString();
      scheduleCleanup(id);
    }
  });

  return serializeJob(job);
}
