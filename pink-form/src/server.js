require("dotenv").config();
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const { connectDb } = require("./db");
const modulesRouter = require("./routes/modules");
const submissionsRouter = require("./routes/submissions");
const seedRouter = require("./routes/seed");

const app = express();
const port = Number(process.env.PORT || 4000);
const frontendDistPath = path.join(__dirname, "../frontend/dist");
const legacyPublicPath = path.join(__dirname, "../public");

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/modules", modulesRouter);
app.use("/api/submissions", submissionsRouter);
app.use("/api/seed", seedRouter);

if (require("fs").existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    return res.sendFile(path.join(frontendDistPath, "index.html"));
  });
} else {
  app.use(express.static(legacyPublicPath));
}

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error." });
});

connectDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB", error);
    process.exit(1);
  });
