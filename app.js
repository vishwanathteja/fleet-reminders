import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ===== SUPABASE CONFIG =====
const SUPABASE_URL = "https://vsrdlcafkrubktirwczq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NgIiYGeuJFv4x9N9sRrf3A_lRnWdTW9";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// ===== HELPERS =====
const $ = (id) => document.getElementById(id);
let selectedVehicleId = null;

const DEFAULT_NOTIFY = "julie@heartlandsign.com,teja@heartlandsign.com";
const DEFAULT_WARN_DAYS = 15;

function todayISO() {
  return new Date().toISOString().split("T")[0];
}
function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString();
}
function daysUntil(dateStr) {
  const now = new Date();
  const due = new Date(dateStr + "T00:00:00");
  return Math.ceil((due - now) / (1000 * 60 * 60 * 24));
}
function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function normalizeEmails(s) {
  if (!s) return DEFAULT_NOTIFY;
  return s
    .split(",")
    .map(x => x.trim())
    .filter(Boolean)
    .join(",");
}

// ===== AUTH UI =====
async function setAuthUI() {
  const { data: { session } } = await supabase.auth.getSession();
  const isAuthed = !!session;

  $("btnLogout").style.display = isAuthed ? "inline-block" : "none";
  $("btnSignUp").style.display = isAuthed ? "none" : "inline-block";
  $("btnSignIn").style.display = isAuthed ? "none" : "inline-block";
  $("authEmail").style.display = isAuthed ? "none" : "inline-block";
  $("authPassword").style.display = isAuthed ? "none" : "inline-block";

  $("authStatus").textContent = isAuthed
    ? `✅ Logged in as ${session.user.email}`
    : "❌ Not logged in";

  // Disable add form when logged out
  $("vehicleForm").querySelectorAll("input, button").forEach(el => el.disabled = !isAuthed);

  if (!isAuthed) {
    $("vehicles").innerHTML = `<div class="muted">Login to view vehicles.</div>`;
    $("vehicleDetails").style.display = "none";
    $("selectedVehicle").textContent = "Login to manage vehicles.";
    $("services").innerHTML = "";
    $("reminders").innerHTML = "";
    selectedVehicleId = null;
  }

  return isAuthed;
}

async function signUp() {
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  if (!email || !password) return alert("Enter email and password.");

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return alert(error.message);

  alert("Account created. Now click Sign In.");
}

async function signIn() {
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  if (!email || !password) return alert("Enter email and password.");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);

  await refreshAll();
}

async function logout() {
  await supabase.auth.signOut();
  await refreshAll();
}

// ===== DASHBOARD (DATE reminders only) =====
async function loadDashboard() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    $("dashboard").innerHTML = "<div class='muted'>Login to see reminders.</div>";
    return;
  }

  const { data: reminders, error } = await supabase
    .from("reminders")
    .select("id, name, reminder_type, due_date, warn_days, is_active, vehicle_id")
    .eq("reminder_type", "date")
    .eq("is_active", true);

  if (error) {
    $("dashboard").innerHTML = `<div class="muted">${error.message}</div>`;
    return;
  }

  const vehicleIds = Array.from(new Set((reminders || []).map(r => r.vehicle_id).filter(Boolean)));
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, name, type")
    .in("id", vehicleIds);

  const vmap = new Map((vehicles || []).map(v => [v.id, v]));

  const dueNow = [];
  const dueSoon = [];

  for (const r of reminders || []) {
    if (!r.due_date) continue;
    const d = daysUntil(r.due_date);
    const warnDays = Number.isFinite(r.warn_days) ? r.warn_days : DEFAULT_WARN_DAYS;
    const v = vmap.get(r.vehicle_id);
    const label = v ? `${v.name} (${v.type})` : "Vehicle";

    if (d <= 0) dueNow.push({ ...r, d, label });
    else if (d <= warnDays) dueSoon.push({ ...r, d, label });
  }

  dueNow.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
  dueSoon.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));

  const render = (arr, title) => {
    if (arr.length === 0) return `<div class="muted">${title}: none</div>`;
    return `
      <div style="margin:8px 0;"><b>${title}</b></div>
      <div class="list">
        ${arr.map(x => `
          <div class="item">
            <div>
              <div><b>${x.label}</b> — ${x.name}</div>
              <div class="muted">Due: ${fmtDate(x.due_date)} (${x.d} day(s))</div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  };

  $("dashboard").innerHTML =
    render(dueNow, "DUE") +
    `<div style="height:10px;"></div>` +
    render(dueSoon, `SOON (<= ${DEFAULT_WARN_DAYS} days unless reminder has warn_days set)`);
}

// ===== VEHICLES =====
async function loadVehicles() {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    $("vehicles").innerHTML = `<div class="muted">${error.message}</div>`;
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "list";

  (data || []).forEach(v => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <div><b>${v.name}</b> <span class="badge">${v.type}</span></div>
        <div class="muted">Miles: ${v.current_odometer ?? 0} • Hours: ${v.current_engine_hours ?? 0}</div>
      </div>
      <div><button class="secondary">Open</button></div>
    `;
    el.querySelector("button").onclick = () => loadVehicleDetails(v.id);
    wrap.appendChild(el);
  });

  $("vehicles").innerHTML = "";
  $("vehicles").appendChild(wrap);
}

// ===== SERVICES =====
async function addService(vehicleId, v) {
  const service_date = prompt("Service date (YYYY-MM-DD):", todayISO());
  if (!service_date) return;

  const category = prompt("Category (Oil/Brakes/Tires/DOT/etc):", "Oil");
  if (!category) return;

  const description = prompt("What was done / what changed?", "");
  if (!description) return;

  const payload = {
    vehicle_id: vehicleId,
    service_date,
    category,
    description,
    odometer: v.current_odometer ?? null,
    engine_hours: v.current_engine_hours ?? null,
  };

  const { error } = await supabase.from("services").insert(payload);
  if (error) return alert(error.message);

  await loadServices(vehicleId);
}

async function editService(service) {
  const service_date = prompt("Service date (YYYY-MM-DD):", service.service_date || todayISO());
  if (!service_date) return;

  const category = prompt("Category:", service.category || "Oil");
  if (!category) return;

  const description = prompt("Description:", service.description || "");
  if (!description) return;

  const odometer = prompt("Miles at service (optional):", service.odometer ?? "");
  const engine_hours = prompt("Engine hours (optional):", service.engine_hours ?? "");

  const payload = {
    service_date,
    category,
    description,
    odometer: odometer === "" ? null : safeNum(odometer, null),
    engine_hours: engine_hours === "" ? null : safeNum(engine_hours, null),
  };

  const { error } = await supabase.from("services").update(payload).eq("id", service.id);
  if (error) return alert(error.message);

  await loadServices(service.vehicle_id);
}

async function deleteService(serviceId, vehicleId) {
  if (!confirm("Delete this service record?")) return;
  const { error } = await supabase.from("services").delete().eq("id", serviceId);
  if (error) return alert(error.message);
  await loadServices(vehicleId);
}

async function loadServices(vehicleId) {
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("service_date", { ascending: false });

  if (error) {
    $("services").innerHTML = `<div class="muted">${error.message}</div>`;
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "list";

  (data || []).forEach(s => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <div><b>${s.category}</b> <span class="badge">${fmtDate(s.service_date)}</span></div>
        <div>${s.description}</div>
        <div class="muted">Miles: ${s.odometer ?? "-"} • Hours: ${s.engine_hours ?? "-"}</div>
      </div>
      <div class="row wrap" style="gap:8px;">
        <button class="secondary btnEdit">Edit</button>
        <button class="secondary btnDelete">Delete</button>
      </div>
    `;
    row.querySelector(".btnEdit").onclick = () => editService(s);
    row.querySelector(".btnDelete").onclick = () => deleteService(s.id, vehicleId);
    wrap.appendChild(row);
  });

  $("services").innerHTML = "";
  $("services").appendChild(wrap);
}

// ===== REMINDERS =====
async function addReminder(vehicleId) {
  const name = prompt("Reminder name (Insurance, DOT, Annual, Oil Change):", "Insurance");
  if (!name) return;

  const type = (prompt("Type: date / miles / hours", "date") || "").toLowerCase();
  if (!["date", "miles", "hours"].includes(type)) return alert("Type must be date/miles/hours");

  let payload = {
    vehicle_id: vehicleId,
    name,
    reminder_type: type,
    notify_emails: DEFAULT_NOTIFY,
    warn_days: DEFAULT_WARN_DAYS,
    is_active: true,
  };

  if (type === "date") {
    payload.due_date = prompt("Due date (YYYY-MM-DD):", todayISO());
    if (!payload.due_date) return;
  }

  if (type === "miles") {
    payload.due_odometer = safeNum(prompt("Due miles:"), NaN);
    if (!Number.isFinite(payload.due_odometer)) return alert("Due miles must be a number.");
  }

  if (type === "hours") {
    payload.due_engine_hours = safeNum(prompt("Due hours:"), NaN);
    if (!Number.isFinite(payload.due_engine_hours)) return alert("Due hours must be a number.");
  }

  const { error } = await supabase.from("reminders").insert(payload);
  if (error) return alert(error.message);

  await loadReminders(vehicleId);
}

async function quickAddDateReminder(vehicleId, name) {
  const due_date = prompt(`${name} due date (YYYY-MM-DD):`, todayISO());
  if (!due_date) return;

  const payload = {
    vehicle_id: vehicleId,
    name,
    reminder_type: "date",
    due_date,
    warn_days: DEFAULT_WARN_DAYS,
    notify_emails: DEFAULT_NOTIFY,
    is_active: true,
  };

  const { error } = await supabase.from("reminders").insert(payload);
  if (error) return alert(error.message);

  await loadReminders(vehicleId);
  await loadDashboard();
}

async function editReminder(r) {
  const is_active = confirm("Keep this reminder ACTIVE?\nOK = Active\nCancel = Inactive");
  const notify_emails = normalizeEmails(prompt("Notify emails (comma separated):", r.notify_emails || DEFAULT_NOTIFY));
  const warn_days = safeNum(prompt("Warn days (SOON window):", r.warn_days ?? DEFAULT_WARN_DAYS), DEFAULT_WARN_DAYS);

  const payload = { is_active, notify_emails, warn_days };

  if (r.reminder_type === "date") {
    const due_date = prompt("Due date (YYYY-MM-DD):", r.due_date || todayISO());
    if (!due_date) return;
    payload.due_date = due_date;
  }

  if (r.reminder_type === "miles") {
    const due_odometer = prompt("Due miles:", r.due_odometer ?? "");
    payload.due_odometer = due_odometer === "" ? null : safeNum(due_odometer, null);
  }

  if (r.reminder_type === "hours") {
    const due_engine_hours = prompt("Due hours:", r.due_engine_hours ?? "");
    payload.due_engine_hours = due_engine_hours === "" ? null : safeNum(due_engine_hours, null);
  }

  const { error } = await supabase.from("reminders").update(payload).eq("id", r.id);
  if (error) return alert(error.message);

  await loadReminders(r.vehicle_id);
  await loadDashboard();
}

async function deleteReminder(reminderId, vehicleId) {
  if (!confirm("Delete this reminder?")) return;
  const { error } = await supabase.from("reminders").delete().eq("id", reminderId);
  if (error) return alert(error.message);

  await loadReminders(vehicleId);
  await loadDashboard();
}

async function loadReminders(vehicleId) {
  const { data: v, error: vErr } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", vehicleId)
    .single();

  if (vErr) {
    $("reminders").innerHTML = `<div class="muted">${vErr.message}</div>`;
    return;
  }

  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false });

  if (error) {
    $("reminders").innerHTML = `<div class="muted">${error.message}</div>`;
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "list";

  (data || []).forEach(r => {
    let status = "OK";
    let detail = "";

    if (!r.is_active) {
      status = "INACTIVE";
    } else if (r.reminder_type === "date" && r.due_date) {
      const d = daysUntil(r.due_date);
      const warn = Number.isFinite(r.warn_days) ? r.warn_days : DEFAULT_WARN_DAYS;
      detail = `Due: ${fmtDate(r.due_date)} (${d} day(s)) • Warn: ${warn} days`;
      if (d <= 0) status = "DUE";
      else if (d <= warn) status = "SOON";
    } else if (r.reminder_type === "miles" && r.due_odometer != null) {
      const left = r.due_odometer - (v.current_odometer ?? 0);
      detail = `Due at: ${r.due_odometer} (left: ${left})`;
      if (left <= 0) status = "DUE";
      else if (left <= (r.warn_miles ?? 500)) status = "SOON";
    } else if (r.reminder_type === "hours" && r.due_engine_hours != null) {
      const left = r.due_engine_hours - (v.current_engine_hours ?? 0);
      detail = `Due at: ${r.due_engine_hours} hrs (left: ${left})`;
      if (left <= 0) status = "DUE";
      else if (left <= (r.warn_hours ?? 25)) status = "SOON";
    }

    const emails = (r.notify_emails || DEFAULT_NOTIFY);

    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <div><b>${r.name}</b> — ${status}</div>
        <div class="muted">${r.reminder_type.toUpperCase()} • ${detail}</div>
        <div class="muted">Emails: ${emails}</div>
      </div>
      <div class="row wrap" style="gap:8px;">
        <button class="secondary btnEdit">Edit</button>
        <button class="secondary btnDelete">Delete</button>
      </div>
    `;

    row.querySelector(".btnEdit").onclick = () => editReminder(r);
    row.querySelector(".btnDelete").onclick = () => deleteReminder(r.id, vehicleId);

    wrap.appendChild(row);
  });

  $("reminders").innerHTML = "";
  $("reminders").appendChild(wrap);
}

// ===== VEHICLE DETAILS =====
async function loadVehicleDetails(vehicleId) {
  if (!(await setAuthUI())) return;

  selectedVehicleId = vehicleId;

  const { data: v, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", vehicleId)
    .single();

  if (error) return alert(error.message);

  $("selectedVehicle").innerHTML = `
    <div><b>${v.name}</b> <span class="badge">${v.type}</span></div>
    <div class="muted">Current Miles: ${v.current_odometer ?? 0} • Engine Hours: ${v.current_engine_hours ?? 0}</div>
  `;
  $("vehicleDetails").style.display = "block";

  $("btnUpdateMiles").onclick = async () => {
    const miles = prompt("Enter current miles (odometer):", String(v.current_odometer ?? 0));
    if (miles === null) return;

    const hours = prompt("Enter current engine hours (optional):", String(v.current_engine_hours ?? 0));
    if (hours === null) return;

    const newMiles = safeNum(miles, v.current_odometer ?? 0);
    const newHours = safeNum(hours, v.current_engine_hours ?? 0);

    const { error } = await supabase
      .from("vehicles")
      .update({ current_odometer: newMiles, current_engine_hours: newHours })
      .eq("id", vehicleId);

    if (error) return alert(error.message);

    await refreshAll();
    await loadVehicleDetails(vehicleId);
  };

  $("btnEditVehicle").onclick = async () => {
    const name = prompt("Vehicle name:", v.name || "");
    if (!name) return;

    const type = prompt("Vehicle type:", v.type || "");
    if (!type) return;

    const { error } = await supabase
      .from("vehicles")
      .update({ name: name.trim(), type: type.trim() })
      .eq("id", vehicleId);

    if (error) return alert(error.message);

    await refreshAll();
    await loadVehicleDetails(vehicleId);
  };

  $("btnAddService").onclick = async () => addService(vehicleId, v);
  $("btnAddReminder").onclick = async () => addReminder(vehicleId);

  $("btnAddDot").onclick = async () => quickAddDateReminder(vehicleId, "DOT Inspection");
  $("btnAddAnnual").onclick = async () => quickAddDateReminder(vehicleId, "Annual Inspection");

  $("btnDeleteVehicle").onclick = async () => {
    const ok = confirm(`Delete vehicle "${v.name}"? This will also delete its services and reminders.`);
    if (!ok) return;

    const { error } = await supabase.from("vehicles").delete().eq("id", vehicleId);
    if (error) return alert(error.message);

    selectedVehicleId = null;
    $("selectedVehicle").textContent = "Select a vehicle to view details.";
    $("vehicleDetails").style.display = "none";

    await refreshAll();
  };

  await loadServices(vehicleId);
  await loadReminders(vehicleId);
}

// ===== REFRESH =====
async function refreshAll() {
  const isAuthed = await setAuthUI();
  await loadDashboard();
  if (!isAuthed) return;

  await loadVehicles();
  if (selectedVehicleId) await loadVehicleDetails(selectedVehicleId);
}

// ===== INIT =====
window.addEventListener("DOMContentLoaded", async () => {
  $("btnSignUp").onclick = signUp;
  $("btnSignIn").onclick = signIn;
  $("btnLogout").onclick = logout;

  supabase.auth.onAuthStateChange(async () => {
    await refreshAll();
  });

  $("vehicleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!(await setAuthUI())) return alert("Please login first.");

    const f = e.target;
    const payload = {
      name: f.name.value.trim(),
      type: f.type.value.trim(),
      current_odometer: safeNum(f.current_odometer.value || 0, 0),
      current_engine_hours: safeNum(f.current_engine_hours.value || 0, 0),
    };

    const { error } = await supabase.from("vehicles").insert(payload);
    if (error) return alert(error.message);

    f.reset();
    await refreshAll();
  });

  await refreshAll();
});
