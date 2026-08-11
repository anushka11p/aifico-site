/**
 * Minimal file-based persistence layer.
 *
 * This exists so the app runs anywhere with zero external database setup.
 * Everything reads/writes a single JSON file on disk (server/data/db.json).
 *
 * To move to a real database later, replace the functions below with
 * queries against Postgres/MySQL/Mongo — the routes in routes/*.js only
 * call these functions, so that's the one file that needs to change.
 */

const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "data", "db.json");

function ensureDbFile() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], bookings: [] }, null, 2));
  }
}

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return { users: [], bookings: [] };
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ---------------- Users ----------------

function findOrCreateUser({ email, name, picture }) {
  const db = readDb();
  let user = db.users.find((u) => u.email === email);
  if (!user) {
    user = {
      id: "usr_" + Math.random().toString(36).slice(2, 10),
      email,
      name,
      picture: picture || "",
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    writeDb(db);
  }
  return user;
}

function getUserById(id) {
  const db = readDb();
  return db.users.find((u) => u.id === id) || null;
}

// ---------------- Bookings ----------------

function listBookingsForUser(userId) {
  const db = readDb();
  return db.bookings
    .filter((b) => b.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function createBooking(userId, fields) {
  const db = readDb();
  const booking = {
    id: "bk_" + Math.random().toString(36).slice(2, 10),
    userId,
    parentName: fields.parentName,
    studentName: fields.studentName,
    studentClass: fields.studentClass,
    subject: fields.subject,
    startDate: fields.startDate,
    endDate: fields.endDate,
    totalClasses: Number(fields.totalClasses),
    classesHeld: 0,
    requestStatus: fields.requestStatus || "requested",
    totalFees: Number(fields.totalFees),
    advancePaid: Number(fields.advancePaid || 0),
    deductionStatus: fields.deductionStatus || "pending",
    extraNeeded: Boolean(fields.extraNeeded),
    extraCount: fields.extraNeeded ? Number(fields.extraCount || 0) : 0,
    reschedules: [],
    createdAt: new Date().toISOString(),
  };
  db.bookings.push(booking);
  writeDb(db);
  return booking;
}

function getBooking(userId, bookingId) {
  const db = readDb();
  return db.bookings.find((b) => b.id === bookingId && b.userId === userId) || null;
}

function markClassHeld(userId, bookingId) {
  const db = readDb();
  const booking = db.bookings.find((b) => b.id === bookingId && b.userId === userId);
  if (!booking) return null;

  booking.classesHeld = Math.min(booking.totalClasses, booking.classesHeld + 1);
  if (booking.classesHeld >= booking.totalClasses) booking.deductionStatus = "cleared";
  else if (booking.classesHeld > 0) booking.deductionStatus = "partial";

  writeDb(db);
  return booking;
}

function addReschedule(userId, bookingId, { newDate, reason }) {
  const db = readDb();
  const booking = db.bookings.find((b) => b.id === bookingId && b.userId === userId);
  if (!booking) return null;

  booking.reschedules.push({
    id: "rs_" + Math.random().toString(36).slice(2, 8),
    newDate,
    reason: reason || "",
    loggedAt: new Date().toISOString(),
  });

  writeDb(db);
  return booking;
}

function updateBookingStatus(userId, bookingId, { requestStatus, deductionStatus }) {
  const db = readDb();
  const booking = db.bookings.find((b) => b.id === bookingId && b.userId === userId);
  if (!booking) return null;

  if (requestStatus) booking.requestStatus = requestStatus;
  if (deductionStatus) booking.deductionStatus = deductionStatus;

  writeDb(db);
  return booking;
}

module.exports = {
  findOrCreateUser,
  getUserById,
  listBookingsForUser,
  createBooking,
  getBooking,
  markClassHeld,
  addReschedule,
  updateBookingStatus,
};
