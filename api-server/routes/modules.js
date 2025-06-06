import express from "express";
import { listModules } from "../controllers/moduleController.js";
import { requireAuth } from "../middlewares/auth.js";

const router = express.Router();
router.get("/", requireAuth, listModules);
export default router;
