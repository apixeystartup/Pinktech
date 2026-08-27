const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const hpp = require("hpp");
const { connectMongo, errorMiddleware, sanitizeMiddleware, requestLogger, logger } = require("@pink/shared");
const env = require("./config/env");
const serviceAuth = require("./middlewares/serviceAuth");
const orgExplorerRoutes = require("./routes/orgExplorer.route");
const positionsRoutes = require("./routes/positions.route");
const assignmentsRoutes = require("./routes/assignments.route");
const importsRoutes = require("./routes/imports.route");

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(hpp());
app.use(sanitizeMiddleware);
app.use(requestLogger);

app.get("/health", (req, res) => res.json({ status: "ok", service: "org" }));

app.use("/", serviceAuth, orgExplorerRoutes);
app.use("/positions", serviceAuth, positionsRoutes);
app.use("/assignments", serviceAuth, assignmentsRoutes);
app.use("/imports", serviceAuth, importsRoutes);

app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use(errorMiddleware);

async function bootstrap() {
  await connectMongo(env.MONGO_URI);
  logger.info("Org service connected to MongoDB");
  app.listen(env.PORT, () => logger.info(`Org service listening on port ${env.PORT}`));
}

bootstrap().catch((error) => {
  logger.error({ error }, "Org service boot failure");
  process.exit(1);
});
