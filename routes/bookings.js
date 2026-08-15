const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const db = require("../db");

const router = express.Router();

const REQUIRED_FIELDS = [
  "parentName", "studentName", "studentClass", "subject",
  "startDate", "endDate", "totalClasses", "totalFees", "advancePaid",
];

router.use(requireAuth);

router.get("/", async (req, res) => {
  const bookings = await db.listBookingsForUser(req.user.id);
  res.json({ bookings });
});

router.post("/", async (req, res) => {
  const missing = REQUIRED_FIELDS.filter((f) => req.body[f] === undefined || req.body[f] === "");
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const booking = await db.createBooking(req.user.id, req.body);
  res.status(201).json({ booking });
});

router.post("/:id/mark-held", async (req, res) => {
  const booking = await db.markClassHeld(req.user.id, req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  res.json({ booking });
});

router.post("/:id/reschedule", async (req, res) => {
  const { newDate, reason } = req.body;
  if (!newDate) return res.status(400).json({ error: "newDate is required." });
  const booking = await db.addReschedule(req.user.id, req.params.id, { newDate, reason });
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  res.json({ booking });
});

router.patch("/:id/status", async (req, res) => {
  const { requestStatus, deductionStatus } = req.body;
  const booking = await db.updateBookingStatus(req.user.id, req.params.id, { requestStatus, deductionStatus });
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  res.json({ booking });
});

module.exports = router;