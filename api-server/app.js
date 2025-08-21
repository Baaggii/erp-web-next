import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cookieParser from "cookie-parser";
import csurf from "csurf";
import { testConnection } from "../db/index.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { logger } from "./middlewares/logging.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import companyRoutes from "./routes/companies.js";
import settingsRoutes from "./routes/settings.js";
import userCompanyRoutes from "./routes/user_companies.js";
import userActionRoutes from "./routes/user_actions.js";
import moduleRoutes from "./routes/modules.js";
import openaiRoutes from "./routes/openai.js";
import headerMappingRoutes from "./routes/header_mappings.js";
import displayFieldRoutes from "./routes/display_fields.js";
import codingTableConfigRoutes from "./routes/coding_table_configs.js";
import generatedSqlRoutes from "./routes/generated_sql.js";
import generalConfigRoutes from "./routes/general_config.js";
import permissionsRoutes from "./routes/permissions.js";
import notificationRoutes from "./routes/notifications.js";
import { getGeneralConfig } from "./services/generalConfig.js";

// Polyfill for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(cookieParser());

app.use(logger);

// Serve uploaded images statically before CSRF so image requests don't require tokens
const imgCfg = await getGeneralConfig();
const imgBase = imgCfg.images?.basePath || "uploads";
const projectRoot = path.resolve(__dirname, "../");
const uploadsDir = path.isAbsolute(imgBase)
  ? imgBase
  : path.join(projectRoot, imgBase);
if (fs.existsSync(uploadsDir)) {
  app.use(`/api/${imgBase}`, express.static(uploadsDir));
}

// Setup CSRF protection using cookies
const csrfProtection = csurf({ cookie: true });
app.use(csrfProtection);

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

// Provide CSRF token for frontend
app.get("/api/csrf-token", (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/auth", userActionRoutes);
app.use("/api/users", userRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/user_companies", userCompanyRoutes);
app.use("/api/modules", moduleRoutes);
app.use("/api/header_mappings", headerMappingRoutes);
app.use("/api/openai", openaiRoutes);
app.use("/api/display_fields", displayFieldRoutes);
app.use("/api/coding_table_configs", codingTableConfigRoutes);
app.use("/api/generated_sql", generatedSqlRoutes);
app.use("/api/general_config", generalConfigRoutes);
app.use("/api/permissions", permissionsRoutes);
app.use("/api/notifications", notificationRoutes);

// Serve static React build and fallback to index.html
// NOTE: adjust this path to where your SPA build actually lives.
const buildDir = path.resolve(__dirname, "../../../erp.mgt.mn");
app.use(express.static(buildDir));
app.get("*", (req, res) => res.sendFile(path.join(buildDir, "index.html")));

// Error middleware (must be last)
app.use(errorHandler);

const port = process.env.PORT || 3002;
app.listen(port, () =>
  console.log(`✅ ERP API & SPA listening on port ${port}`),
);
