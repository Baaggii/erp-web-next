import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { testConnection } from "../db/index.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { logger } from "./middlewares/logging.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import companyRoutes from "./routes/companies.js";
import settingsRoutes from "./routes/settings.js";
import userCompanyRoutes from "./routes/user_companies.js";
import rolePermissionRoutes from "./routes/role_permissions.js";
import moduleRoutes from "./routes/modules.js";
import companyModuleRoutes from "./routes/company_modules.js";
import tableRoutes from "./routes/tables.js";
import { requireAuth } from "./middlewares/auth.js";

dotenv.config();

// Polyfill for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(logger);

// Health-check: also verify DB connection
app.get("/api/auth/health", async (req, res, next) => {
  try {
    const dbResult = await testConnection();
    if (!dbResult.ok) throw dbResult.error;
    res.json({ status: "ok" });
  } catch (err) {
    next(err);
  }
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", requireAuth, userRoutes);
app.use("/api/companies", requireAuth, companyRoutes);
app.use("/api/settings", requireAuth, settingsRoutes);
app.use("/api/user_companies", requireAuth, userCompanyRoutes);
app.use("/api/role_permissions", requireAuth, rolePermissionRoutes);
app.use("/api/modules", requireAuth, moduleRoutes);
app.use("/api/company_modules", requireAuth, companyModuleRoutes);
app.use("/api/tables", requireAuth, tableRoutes);

// Serve static React build and fallback to index.html
// NOTE: adjust this path to where your SPA build actually lives.
// If your build outputs to /home/mgtmn/erp.mgt.mn, update to:
const buildDir = path.resolve(__dirname, "../../../erp.mgt.mn");
app.use(express.static(buildDir));
app.get("*", (req, res) => res.sendFile(path.join(buildDir, "index.html")));

// Error middleware (must be last)
app.use(errorHandler);

const port = process.env.PORT || 3002;
app.listen(port, () =>
  console.log(`✅ ERP API & SPA listening on port ${port}`),
);
