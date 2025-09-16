import { listTriggerColumns } from '../../db/index.js';

export async function getTriggerColumns(req, res, next) {
  try {
    const { table } = req.query;
    if (!table) {
      return res.status(400).json({ message: 'table parameter is required' });
    }
    const columns = await listTriggerColumns(table);
    res.json({ columns });
  } catch (err) {
    next(err);
  }
}
