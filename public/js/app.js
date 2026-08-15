/* =========================================================
   AIFICO booking app — frontend logic
   Talks to the Express API in server/ — English version
   ========================================================= */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

let currentUser = null;
let bookings = [];
let activeRescheduleId = null;

// ---------------- API helper ----------------
async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function showToast(message, type = "error") {
  const toast = $("#toast");
  toast.className = type === "success" ? "toast is-success" : "toast";
  toast.innerHTML = `<div class="toast__bar">${escapeHtml(message)}</div>`;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, 5000);
}

// ---------------- Formatting ----------------
const fmtMoney = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));
}

// ---------------- Status helper ----------------
function labelForStatus(status) {
  const dict = {
    requested: "Requested",
    booked: "Booked",
    confirmed: "Confirmed",
    pending: "Pending deduction",
    partial: "Partially deducted",
    cleared: "Fully settled"
  };
  return dict[status] || status;
}

// ---------------- Auth & Modals ----------------
async function loadConfigAndInitGoogle() {
  let clientId = "";
  try {
    const cfg = await api("/api/config");
    clientId = cfg.googleClientId || "";
  } catch { /* server not reachable yet */ }

  if (!window.google || !clientId) {
    $("#googleBtnHolder").innerHTML = `
      <button class="btn btn--ghost" disabled title="Server needs GOOGLE_CLIENT_ID configured — see server/.env.example">
        Sign in with Google (needs setup)
      </button>`;
    return;
  }

  google.accounts.id.initialize({
    client_id: clientId,
    callback: async (response) => {
      try {
        const { user } = await api("/api/auth/google", {
          method: "POST",
          body: JSON.stringify({ credential: response.credential }),
        });
        onSignedIn(user);
        showToast("Signed in successfully.", "success");
      } catch (err) {
        showToast(err.message);
      }
    },
  });
  google.accounts.id.renderButton($("#googleBtnHolder"), {
    theme: "outline", size: "large", width: 380, text: "continue_with",
  });
}

async function checkSession() {
  try {
    const { user } = await api("/api/auth/me");
    if (user) onSignedIn(user);
  } catch { /* not signed in */ }
}

function onSignedIn(user) {
  currentUser = user;
  renderAccount();
  closeSigninModal();
  showView("dashboard");
}

async function signOut() {
  try { await api("/api/auth/signout", { method: "POST" }); } catch { /* ignore */ }
  currentUser = null;
  bookings = [];
  renderAccount();
  showView("home");
}

function renderAccount() {
  const box = $("#accountBox");
  if (!currentUser) {
    box.innerHTML = `<button class="btn btn--secondary btn--sm" id="navLoginBtn">Login</button>`;
    $("#navLoginBtn").addEventListener("click", openSigninModal);
    return;
  }
  const initial = (currentUser.name || currentUser.email || "?").trim()[0].toUpperCase();
  box.innerHTML = `
    <div class="account__chip">
      <span class="account__avatar">${initial}</span>
      <span>${escapeHtml(currentUser.name || currentUser.email)}</span>
    </div>
    <button class="account__signout" id="signOutBtn">Sign out</button>`;
  $("#signOutBtn").addEventListener("click", signOut);
}

// ---------------- View switching ----------------
function showView(view) {
  if (view === "dashboard" && !currentUser) {
    openSigninModal();
    return;
  }

  $$(".tab").forEach(t => t.classList.toggle("is-active", t.dataset.view === view));
  
  if (view === "home") {
    $("#view-home").hidden = false;
    $("#view-dashboard").hidden = true;
    $("#summaryBar").hidden = true;
  } else if (view === "dashboard") {
    $("#view-home").hidden = true;
    $("#view-dashboard").hidden = false;
    $("#summaryBar").hidden = false;
    refreshBookings();
  }
}

// Wire up navbar tabs
$("#tab-home").addEventListener("click", () => showView("home"));
$("#tab-dashboard").addEventListener("click", () => showView("dashboard"));
$("#navBrand").addEventListener("click", () => showView("home"));

// Wire up other view switch actions
$("#heroDashboardBtn").addEventListener("click", () => showView("dashboard"));

// ---------------- Modal Overlays ----------------
function openSigninModal() {
  $("#signinOverlay").hidden = false;
}
function closeSigninModal() {
  $("#signinOverlay").hidden = true;
}
$("#signinClose").addEventListener("click", closeSigninModal);
$("#signinOverlay").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeSigninModal(); });

// Booking Modal Actions
function openBookingModal() {
  if (!currentUser) {
    openSigninModal();
    return;
  }
  $("#bookingOverlay").hidden = false;
}
function closeBookingModal() {
  $("#bookingOverlay").hidden = true;
  $("#bookingForm").reset();
  $("#extraCountField").hidden = true;
}
$("#heroBookBtn").addEventListener("click", openBookingModal);
$("#emptyBookBtn").addEventListener("click", openBookingModal);
$("#summaryAddBtn").addEventListener("click", openBookingModal);
$("#ctaEnquireBtn").addEventListener("click", openBookingModal);
$("#bookingClose").addEventListener("click", closeBookingModal);
$("#bookingCancelBtn").addEventListener("click", closeBookingModal);
$("#bookingOverlay").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeBookingModal(); });

// Booking form input logic
const extraNeeded = $("#extraNeeded");
extraNeeded.addEventListener("change", () => {
  $("#extraCountField").hidden = !extraNeeded.checked;
});

// Submit booking form
$("#bookingForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const submitBtn = $("#submitBookingBtn");

  const payload = {
    parentName: fd.get("parentName").trim(),
    studentName: fd.get("studentName").trim(),
    studentClass: fd.get("studentClass").trim(),
    subject: fd.get("subject").trim(),
    startDate: fd.get("startDate"),
    endDate: fd.get("endDate"),
    totalClasses: fd.get("totalClasses"),
    requestStatus: fd.get("requestStatus"),
    totalFees: fd.get("totalFees"),
    advancePaid: fd.get("advancePaid"),
    deductionStatus: fd.get("deductionStatus"),
    extraNeeded: fd.get("extraNeeded") === "on",
    extraCount: fd.get("extraNeeded") === "on" ? fd.get("extraCount") : 0,
  };

  submitBtn.disabled = true;
  submitBtn.textContent = "Saving…";
  try {
    await api("/api/bookings", { method: "POST", body: JSON.stringify(payload) });
    closeBookingModal();
    showToast("Booking confirmed.", "success");
    showView("dashboard");
  } catch (err) {
    showToast(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirm Booking";
  }
});

// ---------------- Dashboard / ledger table ----------------
async function refreshBookings() {
  try {
    const data = await api("/api/bookings");
    bookings = data.bookings;
    renderBookings();
  } catch (err) {
    showToast(err.message);
  }
}

function renderBookings() {
  const empty = $("#emptyState");
  const scroll = $("#tableScroll");
  const body = $("#bookingsBody");

  renderSummary();

  if (!bookings.length) {
    empty.hidden = false;
    scroll.hidden = true;
    return;
  }
  empty.hidden = true;
  scroll.hidden = false;

  body.innerHTML = bookings.map(b => {
    const paidPct = b.totalFees ? Math.min(100, Math.round((b.advancePaid / b.totalFees) * 100)) : 0;
    const remainingClasses = Math.max(0, b.totalClasses - b.classesHeld);
    const allHeld = b.classesHeld >= b.totalClasses;

    return `
      <tr data-id="${b.id}">
        <td>
          <div class="cell-title">${escapeHtml(b.studentName)}</div>
          <div class="cell-sub">Parent: ${escapeHtml(b.parentName)} · ${escapeHtml(b.studentClass)}</div>
        </td>
        <td>${escapeHtml(b.subject)}</td>
        <td class="cell-mono">
          ${fmtDate(b.startDate)} → ${fmtDate(b.endDate)}
          ${b.reschedules.length ? `<div class="cell-sub">${b.reschedules.length} reschedule(s)</div>` : ""}
        </td>
        <td class="cell-mono">
          ${b.classesHeld}/${b.totalClasses} held
          <div class="cell-sub">${remainingClasses} remaining${b.extraNeeded ? ` · +${b.extraCount} extra requested` : ""}</div>
        </td>
        <td>
          <div class="cell-mono">${fmtMoney(b.advancePaid)} / ${fmtMoney(b.totalFees)}</div>
          <div class="fee-bar"><div class="fee-bar__fill" style="width:${paidPct}%"></div></div>
        </td>
        <td>
          <div><span class="badge badge--${b.requestStatus}">${labelForStatus(b.requestStatus)}</span></div>
          <div style="margin-top:6px;"><span class="badge badge--${b.deductionStatus}">${labelForStatus(b.deductionStatus)}</span></div>
        </td>
        <td>
          <div class="row-actions">
            <button class="btn--text" data-action="reschedule" data-id="${b.id}">Reschedule</button>
            <button class="btn--text" data-action="mark-held" data-id="${b.id}" ${allHeld ? "disabled" : ""}>Mark class held</button>
          </div>
        </td>
      </tr>`;
  }).join("");

  $$('[data-action="reschedule"]', body).forEach(btn =>
    btn.addEventListener("click", () => openReschedule(btn.dataset.id)));
  $$('[data-action="mark-held"]', body).forEach(btn =>
    btn.addEventListener("click", () => markClassHeld(btn.dataset.id)));
}

function renderSummary() {
  const count = bookings.length;
  const totalFees = bookings.reduce((sum, b) => sum + Number(b.totalFees || 0), 0);
  const totalPaid = bookings.reduce((sum, b) => sum + Number(b.advancePaid || 0), 0);

  $("#summaryText").textContent = count
    ? `${count} booking${count === 1 ? "" : "s"} · ${fmtMoney(totalPaid)} of ${fmtMoney(totalFees)} collected`
    : "No bookings yet";

  const progressWrap = $("#summaryProgressWrap");
  if (!count || !totalFees) {
    progressWrap.hidden = true;
    return;
  }
  const pct = Math.min(100, Math.round((totalPaid / totalFees) * 100));
  progressWrap.hidden = false;
  $("#summaryProgressFill").style.width = pct + "%";
  $("#summaryProgressLabel").textContent = pct + "% collected";
}

async function markClassHeld(id) {
  try {
    const { booking } = await api(`/api/bookings/${id}/mark-held`, { method: "POST" });
    bookings = bookings.map(b => (b.id === id ? booking : b));
    renderBookings();
    showToast("Class marked as held.", "success");
  } catch (err) {
    showToast(err.message);
  }
}

// ---------------- Reschedule modal ----------------
function openReschedule(id) {
  activeRescheduleId = id;
  const b = bookings.find(x => x.id === id);
  if (!b) return;
  $("#rescheduleSubtitle").textContent = `${b.studentName} · ${b.subject}`;
  renderRescheduleLog(b);
  $("#rescheduleOverlay").hidden = false;
}
function renderRescheduleLog(b) {
  const log = $("#rescheduleLog");
  if (!b.reschedules.length) { log.innerHTML = ""; return; }
  log.innerHTML = `<div class="cell-sub" style="margin-bottom:8px;">Reschedule history</div>` +
    b.reschedules.map(r => `
      <div class="reschedule-log__item"><strong>${fmtDate(r.newDate)}</strong> — ${escapeHtml(r.reason || "no reason given")}</div>
    `).join("");
}
$("#rescheduleClose").addEventListener("click", closeReschedule);
$("#rescheduleOverlay").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeReschedule(); });
function closeReschedule() {
  $("#rescheduleOverlay").hidden = true;
  $("#rescheduleForm").reset();
  activeRescheduleId = null;
}

$("#rescheduleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const { booking } = await api(`/api/bookings/${activeRescheduleId}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ newDate: fd.get("newDate"), reason: fd.get("reason") }),
    });
    bookings = bookings.map(b => (b.id === booking.id ? booking : b));
    renderRescheduleLog(booking);
    renderBookings();
    e.target.reset();
    showToast("Reschedule saved.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---------------- Init ----------------
window.addEventListener("load", () => {
  loadConfigAndInitGoogle();
  checkSession();
  renderAccount();
});