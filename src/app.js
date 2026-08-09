const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const path = require("path");
const env = require("./config/env");
const sanitizeMiddleware = require("./middlewares/sanitize.middleware");
const requestLogger = require("./middlewares/requestLogger.middleware");
const errorMiddleware = require("./middlewares/error.middleware");
const routes = require("./routes");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(sanitizeMiddleware);
app.use(hpp());
app.use(requestLogger);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === "production" ? 500 : 1000,
});
app.use(limiter);

app.use("/api/v1", routes);

try {
  const swaggerUi = require("swagger-ui-express");
  const YAML = require("yamljs");
  const docsPath = path.resolve(__dirname, "docs/openapi/openapi.yaml");
  const openapiDoc = YAML.load(docsPath);
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiDoc));
} catch {
  /* swagger docs optional — skip if yaml or module missing */
}

const fs = require("fs");
const publicDir = path.resolve(__dirname, "../api/public");
if (fs.existsSync(publicDir)) {
  const mimeTypes = {
    ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
    ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
    ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  };
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    let urlPath = req.path;
    if (urlPath === "/") urlPath = "/index.html";
    const filePath = path.join(publicDir, urlPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
      return fs.createReadStream(filePath).pipe(res);
    }
    const indexPath = path.join(publicDir, "index.html");
    if (fs.existsSync(indexPath)) {
      res.setHeader("Content-Type", "text/html");
      return fs.createReadStream(indexPath).pipe(res);
    }
    next();
  });
}

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});
app.use(errorMiddleware);

module.exports = app;
