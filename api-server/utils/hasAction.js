import { getUserLevelActions } from '../../db/index.js';

export async function hasAction(session, action) {
  if (session?.permissions?.[action]) return true;
  if (!session?.user_level) return false;
  if (!session.__userLevelActions) {
    session.__userLevelActions = await getUserLevelActions(session.user_level);
  }
  return !!session.__userLevelActions?.permissions?.[action];
}

export default hasAction;
