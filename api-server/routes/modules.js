import express from "express";
import {
  listModules,
  saveModule,
  populatePermissions,
} from "../controllers/moduleController.js";
import { requireAuth } from "../middlewares/auth.js";

const router = express.Router();
router.get("/", requireAuth, listModules);
router.post("/", requireAuth, saveModule);
router.put("/:moduleKey", requireAuth, saveModule);
router.post("/populate", requireAuth, populatePermissions);
export default router;
