require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const db = require("./db");
const authRoutes = require("./routes/auth");
const bookingRoutes = require("./routes/bookings");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ---- API ----
app.use("/api/auth", authRoutes);
app.use("/api/bookings", bookingRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Public, non-secret config the frontend needs (the OAuth Client ID is
// meant to be public — it's the client SECRET that must never ship to
// the browser, and this app never sends that one to the frontend).
app.get("/api/config", (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || "" });
});

// ---- Static frontend (public/) ----
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

// Anything not matched by the API falls back to the app shell.
app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

db.initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`AIFICO booking server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err.message);
    process.exit(1);
  });
