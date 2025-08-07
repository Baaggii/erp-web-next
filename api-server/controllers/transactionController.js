import { listTransactions } from '../../db/index.js';

export async function getTransactions(req, res, next) {
  try {
    const {
      table,
      startDate,
      endDate,
      branchId,
      page,
      perPage,
      refCol,
      refVal,
    } = req.query;
    const result = await listTransactions({
      table,
      branchId,
      startDate,
      endDate,
      page: Number(page) || 1,
      perPage: Number(perPage) || 50,
      refCol,
      refVal,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
