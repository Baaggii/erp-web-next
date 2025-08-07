import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cookieParser from "cookie-parser";
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
import codingTableRoutes from "./routes/coding_tables.js";
import openaiRoutes from "./routes/openai.js";
import headerMappingRoutes from "./routes/header_mappings.js";
import displayFieldRoutes from "./routes/display_fields.js";
import codingTableConfigRoutes from "./routes/coding_table_configs.js";
import generatedSqlRoutes from "./routes/generated_sql.js";
import transactionFormRoutes from "./routes/transaction_forms.js";
import posTxnConfigRoutes from "./routes/pos_txn_config.js";
import posTxnLayoutRoutes from "./routes/pos_txn_layout.js";
import posTxnPendingRoutes from "./routes/pos_txn_pending.js";
import posTxnPostRoutes from "./routes/pos_txn_post.js";
import viewsRoutes from "./routes/views.js";
import transactionRoutes from "./routes/transactions.js";
import transactionImageRoutes from "./routes/transaction_images.js";
import aiInventoryRoutes from "./routes/ai_inventory.js";
import { getGeneralConfig } from "./services/generalConfig.js";
import procedureRoutes from "./routes/procedures.js";
import procTriggerRoutes from "./routes/proc_triggers.js";
import reportProcedureRoutes from "./routes/report_procedures.js";
import generalConfigRoutes from "./routes/general_config.js";
import { requireAuth } from "./middlewares/auth.js";
import featureToggle from "./middlewares/featureToggle.js";

// Polyfill for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(cookieParser());
app.use(logger);

// Serve uploaded images statically
const imgCfg = await getGeneralConfig();
const imgBase = imgCfg.images?.basePath || "uploads";
const projectRoot = path.resolve(__dirname, "../");
const uploadsDir = path.isAbsolute(imgBase)
  ? imgBase
  : path.join(projectRoot, imgBase);
if (fs.existsSync(uploadsDir)) {
  app.use(`/api/${imgBase}`, express.static(uploadsDir));
}

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
app.use("/api/coding_tables", requireAuth, codingTableRoutes);
app.use("/api/header_mappings", requireAuth, headerMappingRoutes);
app.use("/api/openai", featureToggle('aiApiEnabled'), openaiRoutes);
app.use("/api/ai_inventory", featureToggle('aiInventoryApiEnabled'), aiInventoryRoutes);
app.use("/api/display_fields", displayFieldRoutes);
app.use("/api/coding_table_configs", codingTableConfigRoutes);
app.use("/api/generated_sql", generatedSqlRoutes);
app.use("/api/transaction_forms", transactionFormRoutes);
app.use("/api/pos_txn_config", posTxnConfigRoutes);
app.use("/api/pos_txn_layout", posTxnLayoutRoutes);
app.use("/api/pos_txn_pending", posTxnPendingRoutes);
app.use("/api/pos_txn_post", posTxnPostRoutes);
app.use("/api/views", viewsRoutes);
app.use("/api/procedures", requireAuth, procedureRoutes);
app.use("/api/proc_triggers", requireAuth, procTriggerRoutes);
app.use("/api/report_procedures", reportProcedureRoutes);
app.use("/api/transactions", requireAuth, transactionRoutes);
app.use("/api/transaction_images", transactionImageRoutes);
app.use("/api/tables", requireAuth, tableRoutes);
app.use("/api/general_config", requireAuth, generalConfigRoutes);

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
