import { getEmploymentSession, getUserLevelActions } from "../../db/index.js";

export async function getUserActions(req, res, next) {
  try {
    const session = await getEmploymentSession(req.user.empid, req.user.companyId);
    const permissions = session?.user_level
      ? await getUserLevelActions(session.user_level)
      : {};
    res.json(permissions);
  } catch (err) {
    next(err);
  }
}

