/**
 * Postgres-backed persistence layer.
 *
 * Replaces the old JSON-file version. All function names are unchanged —
 * routes/*.js just needed `await` added in front of each call, since
 * these are now real (async) database queries instead of synchronous
 * file reads/writes.
 *
 * Requires a DATABASE_URL env var.
 */

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      picture TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      parent_name TEXT,
      student_name TEXT,
      student_class TEXT,
      subject TEXT,
      start_date TEXT,
      end_date TEXT,
      total_classes INTEGER,
      classes_held INTEGER NOT NULL DEFAULT 0,
      request_status TEXT NOT NULL DEFAULT 'requested',
      total_fees NUMERIC,
      advance_paid NUMERIC NOT NULL DEFAULT 0,
      deduction_status TEXT NOT NULL DEFAULT 'pending',
      extra_needed BOOLEAN NOT NULL DEFAULT false,
      extra_count INTEGER NOT NULL DEFAULT 0,
      reschedules JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

function rowToBooking(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    parentName: row.parent_name,
    studentName: row.student_name,
    studentClass: row.student_class,
    subject: row.subject,
    startDate: row.start_date,
    endDate: row.end_date,
    totalClasses: row.total_classes,
    classesHeld: row.classes_held,
    requestStatus: row.request_status,
    totalFees: Number(row.total_fees),
    advancePaid: Number(row.advance_paid),
    deductionStatus: row.deduction_status,
    extraNeeded: row.extra_needed,
    extraCount: row.extra_count,
    reschedules: row.reschedules,
    createdAt: row.created_at,
  };
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture || "",
    createdAt: row.created_at,
  };
}

function newId(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 10);
}

// ---------------- Users ----------------

async function findOrCreateUser({ email, name, picture }) {
  const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  if (existing.rows[0]) return rowToUser(existing.rows[0]);

  const id = newId("usr");
  const inserted = await pool.query(
    `INSERT INTO users (id, email, name, picture) VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, email, name, picture || ""]
  );
  return rowToUser(inserted.rows[0]);
}

async function getUserById(id) {
  const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return rowToUser(result.rows[0]);
}

// ---------------- Bookings ----------------

async function listBookingsForUser(userId) {
  const result = await pool.query(
    "SELECT * FROM bookings WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
  return result.rows.map(rowToBooking);
}

async function createBooking(userId, fields) {
  const id = newId("bk");
  const result = await pool.query(
    `INSERT INTO bookings (
      id, user_id, parent_name, student_name, student_class, subject,
      start_date, end_date, total_classes, classes_held, request_status,
      total_fees, advance_paid, deduction_status, extra_needed, extra_count
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12,$13,$14,$15)
    RETURNING *`,
    [
      id,
      userId,
      fields.parentName,
      fields.studentName,
      fields.studentClass,
      fields.subject,
      fields.startDate,
      fields.endDate,
      Number(fields.totalClasses),
      fields.requestStatus || "requested",
      Number(fields.totalFees),
      Number(fields.advancePaid || 0),
      fields.deductionStatus || "pending",
      Boolean(fields.extraNeeded),
      fields.extraNeeded ? Number(fields.extraCount || 0) : 0,
    ]
  );
  return rowToBooking(result.rows[0]);
}

async function getBooking(userId, bookingId) {
  const result = await pool.query(
    "SELECT * FROM bookings WHERE id = $1 AND user_id = $2",
    [bookingId, userId]
  );
  return rowToBooking(result.rows[0]);
}

async function markClassHeld(userId, bookingId) {
  const existing = await getBooking(userId, bookingId);
  if (!existing) return null;

  const classesHeld = Math.min(existing.totalClasses, existing.classesHeld + 1);
  const deductionStatus =
    classesHeld >= existing.totalClasses ? "cleared" : classesHeld > 0 ? "partial" : existing.deductionStatus;

  const result = await pool.query(
    `UPDATE bookings SET classes_held = $1, deduction_status = $2
     WHERE id = $3 AND user_id = $4 RETURNING *`,
    [classesHeld, deductionStatus, bookingId, userId]
  );
  return rowToBooking(result.rows[0]);
}

async function addReschedule(userId, bookingId, { newDate, reason }) {
  const existing = await getBooking(userId, bookingId);
  if (!existing) return null;

  const entry = {
    id: newId("rs"),
    newDate,
    reason: reason || "",
    loggedAt: new Date().toISOString(),
  };
  const reschedules = [...existing.reschedules, entry];

  const result = await pool.query(
    `UPDATE bookings SET reschedules = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
    [JSON.stringify(reschedules), bookingId, userId]
  );
  return rowToBooking(result.rows[0]);
}

async function updateBookingStatus(userId, bookingId, { requestStatus, deductionStatus }) {
  const existing = await getBooking(userId, bookingId);
  if (!existing) return null;

  const result = await pool.query(
    `UPDATE bookings SET request_status = $1, deduction_status = $2
     WHERE id = $3 AND user_id = $4 RETURNING *`,
    [
      requestStatus || existing.requestStatus,
      deductionStatus || existing.deductionStatus,
      bookingId,
      userId,
    ]
  );
  return rowToBooking(result.rows[0]);
}

module.exports = {
  initDb,
  findOrCreateUser,
  getUserById,
  listBookingsForUser,
  createBooking,
  getBooking,
  markClassHeld,
  addReschedule,
  updateBookingStatus,
};