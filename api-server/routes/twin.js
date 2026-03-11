import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { listTwinState } from '../services/twinStateService.js';
import rateLimit from 'express-rate-limit';
import rateLimit from 'express-rate-limit';
import rateLimit from 'express-rate-limit';

const twinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

router.get('/plan', requireAuth, twinLimiter, async (req, res, next) => {
const twinRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs for these routes
});

router.get('/plan', twinRateLimiter, requireAuth, async (req, res, next) => {
const twinLimiter = rateLimit({
router.get('/budget', requireAuth, twinLimiter, async (req, res, next) => {
  max: 100, // limit each IP to 100 requests per windowMs for these routes
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

router.get('/budget', twinRateLimiter, requireAuth, async (req, res, next) => {

router.get('/risk', requireAuth, twinLimiter, async (req, res, next) => {
  try {
    res.json(await listTwinState('plan_state', req.user.companyId, req.query));
  } catch (error) {
    next(error);
  }
router.get('/risk', twinRateLimiter, requireAuth, async (req, res, next) => {

router.get('/task-load', requireAuth, twinLimiter, async (req, res, next) => {
  try {
    res.json(await listTwinState('budget_state', req.user.companyId, req.query));
  } catch (error) {
    next(error);
  }
router.get('/task-load', twinRateLimiter, requireAuth, async (req, res, next) => {

router.get('/resource', requireAuth, twinLimiter, async (req, res, next) => {
  try {
    res.json(await listTwinState('risk_state', req.user.companyId, req.query));
  } catch (error) {
    next(error);
  }
router.get('/resource', twinRateLimiter, requireAuth, async (req, res, next) => {

router.get('/task-load', requireAuth, async (req, res, next) => {
  try {
    res.json(await listTwinState('task_load', req.user.companyId, req.query));
  } catch (error) {
    next(error);
  }
});

router.get('/resource', requireAuth, async (req, res, next) => {
  try {
    res.json(await listTwinState('resource_state', req.user.companyId, req.query));
  } catch (error) {
    next(error);
  }
});

export default router;
