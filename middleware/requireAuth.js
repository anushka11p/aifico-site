const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.aifico_session;
  if (!token) {
    return res.status(401).json({ error: "Not signed in." });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email, name, picture }
    next();
  } catch {
    return res.status(401).json({ error: "Session expired, please sign in again." });
  }
}

module.exports = requireAuth;
