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
router.post('/', requireAuth, createUser);
router.put('/:id', requireAuth, updateUser);
router.delete('/:id', requireAuth, deleteUser);
export default router;
