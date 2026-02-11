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
import { getEmploymentSession, testConnection, pool } from "../db/index.js";
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
import jsonConversionRoutes from "./routes/json_conversion.js";
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
import reportConfigRoutes from "./routes/report_config.js";
import pendingRequestRoutes from "./routes/pending_request.js";
import reportApprovalRoutes from "./routes/report_approvals.js";
import activityLogRoutes from "./routes/user_activity_log.js";
import userSettingsRoutes from "./routes/user_settings.js";
import translationRoutes from "./routes/translations.js";
import notificationRoutes from "./routes/notifications.js";
import dashboardSectionRoutes from "./routes/dashboard_sections.js";
import snapshotArtifactRoutes from "./routes/report_snapshot_artifacts.js";
import tourRoutes from "./routes/tours.js";
import manualTranslationsRoutes from "./routes/manual_translations.js";
import posApiEndpointRoutes from "./routes/posapi_endpoints.js";
import posApiProxyRoutes from "./routes/posapi_proxy.js";
import posApiReferenceCodeRoutes from "./routes/posapi_reference_codes.js";
import cncProcessingRoutes from "./routes/cnc_processing.js";
import messagingRoutes from "./routes/messaging.js";
import reportRoutes from "./routes/report.js";
import { setNotificationEmitter } from "./services/transactionNotificationQueue.js";
import {
  setNotificationEmitter as setUnifiedNotificationEmitter,
  setNotificationStore as setUnifiedNotificationStore,
} from "./services/notificationService.js";
import {
  setMessagingIo,
  markOnline,
  markOffline,
  getMessagingSocketAccess,
} from "./services/messagingService.js";
import { incWebsocketConnections, renderPrometheusMetrics } from './services/messagingMetrics.js';

// Polyfill for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1); // behind a single reverse proxy

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  const allowedOrigin = String(process.env.ALLOWED_ORIGIN || "").trim();
  const connectSrc = allowedOrigin ? `'self' ${allowedOrigin}` : "'self'";
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src ${connectSrc}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join("; ");

  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains; preload");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});
app.use(csrf({ cookie: true }));          // <— csurf middleware
app.use(logger);
app.use(activityLogger);

// CSRF token endpoint
app.get("/api/csrf-token", (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const requestTimeoutMs = Number(process.env.SERVER_TIMEOUT_MS || 900000); // default 15 minutes for long conversions
if (Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0) {
  server.requestTimeout = requestTimeoutMs;
  if (typeof server.setTimeout === "function") {
    server.setTimeout(requestTimeoutMs);
  }
}
const headersTimeoutMs = Number(
  process.env.SERVER_HEADERS_TIMEOUT_MS || requestTimeoutMs + 5000
);
if (Number.isFinite(headersTimeoutMs) && headersTimeoutMs > 0) {
  server.headersTimeout = headersTimeoutMs;
}
const keepAliveTimeoutMs = Number(process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS || 120000);
if (Number.isFinite(keepAliveTimeoutMs) && keepAliveTimeoutMs > 0) {
  server.keepAliveTimeout = keepAliveTimeoutMs;
}
const socketPath = process.env.SOCKET_IO_PATH || "/api/socket.io";
const allowedOrigin = String(process.env.ALLOWED_ORIGIN || "").trim();
const SOCKET_AUTH_TTL_MS = 10 * 60 * 1000;

function parseCookieHeader(rawCookie = "") {
  if (!rawCookie) return {};
  return Object.fromEntries(
    rawCookie
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [k, ...v] = entry.split("=");
        return [k, decodeURIComponent(v.join("="))];
      }),
  );
}

function joinSocketScopes(socket, user, session) {
  const normalizedEmpId = String(user.empid || "").trim().toUpperCase();
  if (normalizedEmpId) {
    socket.join(`user:${normalizedEmpId}`);
  }
  const legacyEmpId = String(user.empid || "").trim();
  if (legacyEmpId && legacyEmpId !== normalizedEmpId) {
    socket.join(`user:${legacyEmpId}`);
  }
  socket.join(`emp:${user.empid}`);
  socket.join(`company:${user.companyId}`);
  if (session?.branch_id) {
    socket.join(`branch:${session.branch_id}`);
  }
  if (session?.department_id) {
    socket.join(`department:${session.department_id}`);
  }
}

async function authenticateSocket(socket) {
  const cookies = parseCookieHeader(socket.request.headers.cookie || "");
  const token = cookies[getCookieName()];
  if (!token) throw new Error("Authentication error");

  const user = jwtService.verify(token);
  const { scopedCompanyId, session } = await getMessagingSocketAccess({
    user,
    companyId: user.companyId,
    getSession: getEmploymentSession,
  });

  const scopedUser = { ...user, companyId: scopedCompanyId };
  socket.user = scopedUser;
  socket.messagingSession = session;
  socket.authenticatedAt = Date.now();
  joinSocketScopes(socket, scopedUser, session);
}

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigin || false,
    credentials: true,
  },
  path: socketPath,
  allowRequest: (req, callback) => {
    const origin = String(req.headers.origin || "").trim();
    if (allowedOrigin && origin !== allowedOrigin) {
      callback("Origin not allowed", false);
      return;
    }
    callback(null, true);
  },
});

// Authenticate sockets via JWT cookie and join per-user room
io.use(async (socket, next) => {
  try {
    await authenticateSocket(socket);
    return next();
  } catch {
    return next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  const user = socket.user;
  if (!user) return;

  markOnline(user.companyId, user.empid);
  incWebsocketConnections({ company_id: String(user.companyId) }, 1);

  socket.use(async (_packet, next) => {
    if (Date.now() - Number(socket.authenticatedAt || 0) <= SOCKET_AUTH_TTL_MS) {
      next();
      return;
    }

    try {
      await authenticateSocket(socket);
      next();
    } catch {
      next(new Error("Authentication expired"));
      socket.disconnect(true);
    }
  });

  socket.on("disconnect", () => {
    markOffline(user.companyId, user.empid);
    incWebsocketConnections({ company_id: String(user.companyId) }, -1);
  });
});

app.set("io", io);
setNotificationEmitter(io);
setUnifiedNotificationEmitter(io);
setUnifiedNotificationStore(pool);
setMessagingIo(io);

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


app.get("/metrics", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(renderPrometheusMetrics());
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
app.use("/api/json_conversion", requireAuth, jsonConversionRoutes);
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
app.use("/api/report", reportRoutes);
app.use("/api/report_access", reportAccessRoutes);
app.use("/api/tours", tourRoutes);
app.use("/api/report_builder", reportBuilderRoutes);
app.use("/api/report_config", reportConfigRoutes);
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
app.use("/api/notifications", notificationRoutes);
app.use("/api/dashboard_sections", dashboardSectionRoutes);
app.use("/api/posapi/endpoints", posApiEndpointRoutes);
app.use("/api/posapi/proxy", posApiProxyRoutes);
app.use("/api/posapi/reference-codes", posApiReferenceCodeRoutes);
app.use("/api/cnc_processing", cncProcessingRoutes);
app.use("/api", messagingRoutes);
app.use("/api/messaging", messagingRoutes);

// Serve static React build and fallback to index.html
const buildDir = path.resolve(__dirname, "../../../erp.mgt.mn");
app.use(express.static(buildDir));
app.get("*", (req, res) => res.sendFile(path.join(buildDir, "index.html")));

// Error middleware (must be last)
app.use(errorHandler);

const port = process.env.PORT || process.env.API_PORT || 3002;
server.listen(port, () =>
  console.log(`✅ ERP API & SPA listening on port ${port}`)
);
