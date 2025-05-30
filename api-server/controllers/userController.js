import {
  findAllUsers,
  insertUser,
  modifyUser,
  deleteUserById
} from '../../db/index.js';

export async function listUsers(req, res, next) {
  try {
    const users = await findAllUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

export async function createUser(req, res, next) {
  try {
    const newUser = await insertUser(req.body);
    res.status(201).json(newUser);
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req, res, next) {
  try {
    const updated = await modifyUser(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req, res, next) {
  try {
    await deleteUserById(req.params.id);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}