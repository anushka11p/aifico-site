const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const db = require("../db");

const router = express.Router();

const REQUIRED_FIELDS = [
  "parentName", "studentName", "studentClass", "subject",
  "startDate", "endDate", "totalClasses", "totalFees", "advancePaid",
];

// All routes below require a signed-in user.
router.use(requireAuth);

// GET /api/bookings — list the current user's bookings
router.get("/", (req, res) => {
  const bookings = db.listBookingsForUser(req.user.id);
  res.json({ bookings });
});

// POST /api/bookings — create a booking
router.post("/", (req, res) => {
  const missing = REQUIRED_FIELDS.filter((f) => req.body[f] === undefined || req.body[f] === "");
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const booking = db.createBooking(req.user.id, req.body);
  res.status(201).json({ booking });
});

// POST /api/bookings/:id/mark-held — increments classesHeld, updates deduction status
router.post("/:id/mark-held", (req, res) => {
  const booking = db.markClassHeld(req.user.id, req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  res.json({ booking });
});

// POST /api/bookings/:id/reschedule  { newDate, reason }
router.post("/:id/reschedule", (req, res) => {
  const { newDate, reason } = req.body;
  if (!newDate) return res.status(400).json({ error: "newDate is required." });
  const booking = db.addReschedule(req.user.id, req.params.id, { newDate, reason });
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  res.json({ booking });
});

// PATCH /api/bookings/:id/status  { requestStatus?, deductionStatus? }
router.patch("/:id/status", (req, res) => {
  const { requestStatus, deductionStatus } = req.body;
  const booking = db.updateBookingStatus(req.user.id, req.params.id, { requestStatus, deductionStatus });
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  res.json({ booking });
});

module.exports = router;
