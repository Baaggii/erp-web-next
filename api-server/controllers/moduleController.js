import { listModules as dbListModules } from "../../db/index.js";

export async function listModules(req, res, next) {
  try {
    const modules = await dbListModules();
    res.json(modules);
  } catch (err) {
    next(err);
  }
}
