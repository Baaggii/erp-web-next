import { deleteTour, getTour, listTours, saveTour } from '../services/tours.js';

export async function listOrGetToursHandler(req, res, next) {
  try {
    const { pageKey, path } = req.query || {};
    if (pageKey || path) {
      const tour = await getTour({ pageKey, path }, req.user.companyId);
      res.json(tour ?? null);
      return;
    }
    const tours = await listTours(req.user.companyId);
    res.json(tours);
  } catch (err) {
    next(err);
  }
}

export async function saveTourHandler(req, res, next) {
  try {
    const { pageKey } = req.params;
    const payload = req.body || {};
    const saved = await saveTour(pageKey, payload, req.user.companyId);
    res.json(saved);
  } catch (err) {
    next(err);
  }
}

export async function deleteTourHandler(req, res, next) {
  try {
    const { pageKey } = req.params;
    const removed = await deleteTour(pageKey, req.user.companyId);
    res.json({ success: removed });
  } catch (err) {
    next(err);
  }
}
