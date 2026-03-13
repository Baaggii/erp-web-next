import express from "express";
import { pool } from "../../db/index.js";

const router = express.Router();

// Lightweight database probe used by readiness checks.
async function checkDatabase() {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

// Liveness endpoint: confirms the API process is up and responding.
router.get("/healthz", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "erp-api",
    uptime: process.uptime(),
  });
});

// Readiness endpoint: confirms API is running and database connectivity is healthy.
router.get("/readyz", async (_req, res) => {
  const dbConnected = await checkDatabase();
  if (!dbConnected) {
    return res.status(503).json({
      status: "not_ready",
      db: "disconnected",
    });
  }

  return res.status(200).json({
    status: "ready",
    db: "connected",
  });
});

// Version endpoint: exposes API service and runtime version details.
router.get("/version", (_req, res) => {
  res.status(200).json({
    service: "erp-api",
    version: process.env.APP_VERSION || "dev",
    node: process.version,
  });
});

export default router;
