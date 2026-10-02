const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const hpp = require("hpp");
const { connectMongo, errorMiddleware, sanitizeMiddleware, requestLogger, logger } = require("@pink/shared");
const env = require("./config/env");
const serviceAuth = require("./middlewares/serviceAuth");
const formsRoutes = require("./routes/forms.route");
const formsPublicRoutes = require("./routes/formsPublic.routes");
const schemaFormsRoutes = require("./routes/schemaForms.routes");
const pinkFormSubmissionsRoutes = require("./routes/pinkFormSubmissions.routes");
const seedRoutes = require("./routes/seed.routes");

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(hpp());
app.use(sanitizeMiddleware);
app.use(requestLogger);

app.get("/health", (req, res) => res.json({ status: "ok", service: "forms" }));

// Public routes (no auth)
app.use("/submissions", pinkFormSubmissionsRoutes);
app.use("/seed", seedRoutes);
app.use("/public", formsPublicRoutes);

// Authenticated routes
app.use("/", serviceAuth, formsRoutes);
app.use("/schema-forms", serviceAuth, schemaFormsRoutes);

app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use(errorMiddleware);

async function bootstrap() {
  await connectMongo(env.MONGO_URI);
  logger.info("Forms service connected to MongoDB");
  app.listen(env.PORT, () => logger.info(`Forms service listening on port ${env.PORT}`));
}

bootstrap().catch((error) => {
  logger.error({ error }, "Forms service boot failure");
  process.exit(1);
});
