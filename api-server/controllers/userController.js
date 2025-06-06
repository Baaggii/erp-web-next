import {
  listUsers as dbListUsers,
  listUsersByCompany,
  getUserById,
  createUser as dbCreateUser,
  updateUser as dbUpdateUser,
  deleteUserById as dbDeleteUser
} from '../../db/index.js';
import { requireAuth } from '../middlewares/auth.js';

export async function listUsers(req, res, next) {
  try {
    const companyId = req.query.companyId;
    const users = companyId
      ? await listUsersByCompany(companyId)
      : await dbListUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

export async function getUser(req, res, next) {
  try {
    const user = await getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function createUser(req, res, next) {
  try {
    const newUser = await dbCreateUser({
      ...req.body,
      role_id: req.body.roleId,
      created_by: req.user.empid
    });
    res.status(201).json(newUser);
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req, res, next) {
  try {
    const updated = await dbUpdateUser(req.params.id, {
      ...req.body,
      role_id: req.body.roleId
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req, res, next) {
  try {
    await dbDeleteUser(req.params.id);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}
