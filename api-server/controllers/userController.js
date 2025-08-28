import {
  listUsersByCompany,
  getUserById,
  createUser as dbCreateUser,
  updateUser as dbUpdateUser,
  deleteUserById as dbDeleteUser,
  getEmploymentSession,
} from '../../db/index.js';

export async function listUsers(req, res, next) {
  try {
    const companyId = req.query.companyId || req.user.companyId;
    const session = await getEmploymentSession(req.user.empid, companyId);
    if (!session) return res.sendStatus(403);
    const users = await listUsersByCompany(companyId);
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
      empid: req.body.empid,
      password: req.body.password,
      created_by: req.user.empid
    });
    res.locals.logRecordId = newUser.id;
    res.status(201).json(newUser);
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req, res, next) {
  try {
    const updated = await dbUpdateUser(req.params.id);
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
