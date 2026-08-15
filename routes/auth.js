const express = require("express");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const db = require("../db");

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function issueSession(res, user) {
  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, picture: user.picture },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.cookie("aifico_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

router.post("/google", async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: "Missing Google credential." });

  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.startsWith("your-google")) {
    return res.status(500).json({
      error: "Server isn't configured with a real GOOGLE_CLIENT_ID yet. See server/.env.example.",
    });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const user = await db.findOrCreateUser({
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    });
    issueSession(res, user);
    res.json({ user: { id: user.id, email: user.email, name: user.name, picture: user.picture } });
  } catch (err) {
    console.error("Google verification failed:", err.message);
    res.status(401).json({ error: "Could not verify Google sign-in." });
  }
});

router.post("/demo", async (req, res) => {
  const demoAllowed = process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_LOGIN === "true";
  if (!demoAllowed) {
    return res.status(404).json({ error: "Not found." });
  }
  const user = await db.findOrCreateUser({
    email: "demo.parent@aifico.local",
    name: "Demo Parent",
    picture: "",
  });
  issueSession(res, user);
  res.json({ user: { id: user.id, email: user.email, name: user.name, picture: user.picture } });
});

router.get("/me", (req, res) => {
  const token = req.cookies && req.cookies.aifico_session;
  if (!token) return res.json({ user: null });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ user: payload });
  } catch {
    res.json({ user: null });
  }
});

router.post("/signout", (req, res) => {
  res.clearCookie("aifico_session");
  res.json({ ok: true });
});

module.exports = router;