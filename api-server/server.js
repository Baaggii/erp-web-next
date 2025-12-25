import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import express from "express";
import cookieParser from "cookie-parser";
import csrf from "csurf";
import { Server as SocketIOServer } from "socket.io";
import * as jwtService from "./services/jwtService.js";
import { getCookieName } from "./utils/cookieNames.js";
import { testConnection } from "../db/index.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { logger } from "./middlewares/logging.js";
import { activityLogger } from "./middlewares/activityLogger.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import companyRoutes from "./routes/companies.js";
import settingsRoutes from "./routes/settings.js";
import moduleRoutes from "./routes/modules.js";
import companyModuleRoutes from "./routes/company_modules.js";
import configRoutes from "./routes/config.js";
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
import posTxnEbarimtRoutes from "./routes/pos_txn_ebarimt.js";
import transactionEbarimtRoutes from "./routes/transaction_ebarimt.js";
import viewsRoutes from "./routes/views.js";
import transactionRoutes from "./routes/transactions.js";
import transactionImageRoutes from "./routes/transaction_images.js";
import transactionTemporaryRoutes from "./routes/transaction_temporaries.js";
import aiInventoryRoutes from "./routes/ai_inventory.js";
import { getGeneralConfig } from "./services/generalConfig.js";
import procedureRoutes from "./routes/procedures.js";
import procTriggerRoutes from "./routes/proc_triggers.js";
import reportProcedureRoutes from "./routes/report_procedures.js";
import generalConfigRoutes from "./routes/general_config.js";
import permissionsRoutes from "./routes/permissions.js";
import tenantTablesRoutes from "./routes/tenant_tables.js";
import reportAccessRoutes from "./routes/report_access.js";
import { requireAuth } from "./middlewares/auth.js";
import featureToggle from "./middlewares/featureToggle.js";
import reportBuilderRoutes from "./routes/report_builder.js";
import pendingRequestRoutes from "./routes/pending_request.js";
import reportApprovalRoutes from "./routes/report_approvals.js";
import activityLogRoutes from "./routes/user_activity_log.js";
import userSettingsRoutes from "./routes/user_settings.js";
import translationRoutes from "./routes/translations.js";
import snapshotArtifactRoutes from "./routes/report_snapshot_artifacts.js";
import tourRoutes from "./routes/tours.js";
import manualTranslationsRoutes from "./routes/manual_translations.js";
import posApiEndpointRoutes from "./routes/posapi_endpoints.js";
import posApiProxyRoutes from "./routes/posapi_proxy.js";
import posApiReferenceCodeRoutes from "./routes/posapi_reference_codes.js";

// Polyfill for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1); // behind a single reverse proxy

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(cookieParser());
app.use(csrf({ cookie: true }));          // <— csurf middleware
app.use(logger);
app.use(activityLogger);

// CSRF token endpoint
app.get("/api/csrf-token", (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: true, credentials: true },
});

// Authenticate sockets via JWT cookie and join per-user room
io.use((socket, next) => {
  try {
    const raw = socket.request.headers.cookie || "";
    const cookies = Object.fromEntries(
      raw.split(";").map((c) => {
        const [k, ...v] = c.trim().split("=");
        return [k, decodeURIComponent(v.join("="))];
      })
    );
    const token = cookies[getCookieName()];
    if (!token) return next(new Error("Authentication error"));
    const user = jwtService.verify(token);
    socket.user = user;
    socket.join(`user:${user.empid}`);
    return next();
  } catch {
    return next(new Error("Authentication error"));
  }
});

app.set("io", io);

// Serve uploaded images statically
const { config: imgCfg } = await getGeneralConfig();
const imgBase = imgCfg.images?.basePath || "uploads";
const projectRoot = path.resolve(__dirname, "../");
const uploadsRoot = path.isAbsolute(imgBase)
  ? imgBase
  : path.join(projectRoot, imgBase);
app.use(`/api/${imgBase}/:companyId`, (req, res, next) => {
  const dir = path.join(uploadsRoot, req.params.companyId);
  if (!fs.existsSync(dir)) return res.sendStatus(404);
  return express.static(dir)(req, res, next);
});

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
app.use("/api/modules", requireAuth, moduleRoutes);
app.use("/api/company_modules", requireAuth, companyModuleRoutes);
app.use("/api/coding_tables", requireAuth, codingTableRoutes);
app.use("/api/header_mappings", requireAuth, headerMappingRoutes);
app.use("/api/manual_translations", manualTranslationsRoutes);
app.use("/api/openai", featureToggle("aiApiEnabled"), openaiRoutes);
app.use("/api/ai_inventory", featureToggle("aiInventoryApiEnabled"), aiInventoryRoutes);
app.use("/api/display_fields", displayFieldRoutes);
app.use("/api/coding_table_configs", codingTableConfigRoutes);
app.use("/api/generated_sql", generatedSqlRoutes);
app.use("/api/transaction_forms", transactionFormRoutes);
app.use("/api/pos_txn_config", posTxnConfigRoutes);
app.use("/api/pos_txn_layout", posTxnLayoutRoutes);
app.use("/api/pos_txn_pending", posTxnPendingRoutes);
app.use("/api/pos_txn_post", posTxnPostRoutes);
app.use("/api/pos_txn_ebarimt", posTxnEbarimtRoutes);
app.use("/api/pos-txn-ebarimt", posTxnEbarimtRoutes);
app.use("/api/transaction_ebarimt", transactionEbarimtRoutes);
app.use("/api/views", viewsRoutes);
app.use("/api/procedures", requireAuth, procedureRoutes);
app.use("/api/proc_triggers", requireAuth, procTriggerRoutes);
app.use("/api/report_procedures", reportProcedureRoutes);
app.use("/api/report_access", reportAccessRoutes);
app.use("/api/tours", tourRoutes);
app.use("/api/report_builder", reportBuilderRoutes);
app.use("/api/transactions", requireAuth, transactionRoutes);
app.use("/api/transaction_images", transactionImageRoutes);
app.use("/api/transaction_temporaries", transactionTemporaryRoutes);
app.use("/api/tables", requireAuth, tableRoutes);
app.use("/api/general_config", requireAuth, generalConfigRoutes);
app.use("/api/tenant_tables", tenantTablesRoutes);
app.use("/api/permissions", permissionsRoutes);
app.use("/api/config", configRoutes);
app.use("/api/pending_request", pendingRequestRoutes);
app.use("/api/report_approvals", reportApprovalRoutes);
app.use("/api/report_snapshot_artifacts", snapshotArtifactRoutes);
app.use("/api/user/settings", userSettingsRoutes);
app.use("/api/user_activity_log", activityLogRoutes);
app.use("/api/translations", translationRoutes);
app.use("/api/posapi/endpoints", posApiEndpointRoutes);
app.use("/api/posapi/proxy", posApiProxyRoutes);
app.use("/api/posapi/reference-codes", posApiReferenceCodeRoutes);

// Serve static React build and fallback to index.html
const buildDir = path.resolve(__dirname, "../../../erp.mgt.mn");
app.use(express.static(buildDir));
app.get("*", (req, res) => res.sendFile(path.join(buildDir, "index.html")));

// Error middleware (must be last)
app.use(errorHandler);

const port = process.env.PORT || 3002;
server.listen(port, () =>
  console.log(`✅ ERP API & SPA listening on port ${port}`)
);
