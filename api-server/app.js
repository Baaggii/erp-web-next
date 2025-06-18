import "dotenv/config";
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
import rolePermissionRoutes from "./routes/role_permissions.js";
import moduleRoutes from "./routes/modules.js";
import openaiRoutes from "./routes/openai.js";
import headerMappingRoutes from "./routes/header_mappings.js";
import relationDisplayRoutes from "./routes/relation_display_fields.js";

// Polyfill for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cookieParser());

// Setup CSRF protection using cookies
const csrfProtection = csurf({ cookie: true });
app.use(csrfProtection);

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

// Provide CSRF token for frontend
app.get("/api/csrf-token", (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/user_companies", userCompanyRoutes);
app.use("/api/role_permissions", rolePermissionRoutes);
app.use("/api/modules", moduleRoutes);
app.use("/api/header_mappings", headerMappingRoutes);
app.use("/api/relation_display_fields", relationDisplayRoutes);
app.use("/api/openai", openaiRoutes);

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
