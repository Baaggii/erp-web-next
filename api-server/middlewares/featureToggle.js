import { getGeneralConfig } from '../services/generalConfig.js';

export default function featureToggle(flag) {
  return async function (req, res, next) {
    try {
      const cfg = await getGeneralConfig();
      if (cfg.general?.[flag]) return next();
      res.status(404).json({ message: 'Feature disabled' });
    } catch (err) {
      next(err);
    }
  };
}
