import { listInventoryTransactions } from '../../db/index.js';

export async function getInventoryTransactions(req, res, next) {
  try {
    const { startDate, endDate, branchId, page, perPage } = req.query;
    const result = await listInventoryTransactions({
      branchId,
      startDate,
      endDate,
      page: Number(page) || 1,
      perPage: Number(perPage) || 50,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
