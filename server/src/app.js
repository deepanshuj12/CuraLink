const express = require("express");
const cors = require("cors");
require("dotenv").config();
const researchRouter = require("./routes/researchRoutes");
const authRouter = require("./routes/authRoutes");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "medical-research-assistant" });
});

app.use("/api/auth", authRouter);
app.use("/api/research", researchRouter);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    error: "Internal server error",
    detail: error?.message || "Unexpected failure",
  });
});

module.exports = app;
