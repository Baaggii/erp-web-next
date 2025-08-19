import express from 'express';
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser
} from '../controllers/userController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
router.get('/', requireAuth, listUsers);
router.post(
  '/',
  requireAuth,
  (req, res, next) => {
    res.locals.logTable = 'users';
    next();
  },
  createUser,
);
router.put(
  '/:id',
  requireAuth,
  (req, res, next) => {
    res.locals.logTable = 'users';
    res.locals.logRecordId = req.params.id;
    next();
  },
  updateUser,
);
router.delete(
  '/:id',
  requireAuth,
  (req, res, next) => {
    res.locals.logTable = 'users';
    res.locals.logRecordId = req.params.id;
    next();
  },
  deleteUser,
);
export default router;
