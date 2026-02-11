import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ===== SUPABASE CONFIG =====
const SUPABASE_URL = "https://vsrdlcafkrubktirwczq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NgIiYGeuJFv4x9N9sRrf3A_lRnWdTW9";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ===== HELPERS =====
const $ = (id) => document.getElementById(id);
let selectedVehicleId = null;

function todayISO() { return new Date().toISOString().split("T")[0]; }
function fmtDate(d) { return d ? new Date(d + "T00:00:00").toLocaleDateString() : ""; }
function daysUntil(dateStr) {
  const now = new Date();
  const due = new Date(dateStr + "T00:00:00");
  return Math.ceil((due - now) / (1000 * 60 * 60 * 24));
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

  // lock form if logged out
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

// ===== PASSWORD RESET DETECTION =====
// Supabase recovery link sets type=recovery in the URL hash.
// Example: #access_token=...&type=recovery
function isRecoveryLink() {
  const hash = new URLSearchParams(window.location.hash.replace("#", ""));
  return hash.get("type") === "recovery";
}

function showResetUI(show) {
  $("resetBox").style.display = show ? "block" : "none";
}

// ===== AUTH ACTIONS =====
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

async function updatePassword() {
  const newPass = $("newPassword").value;
  if (!newPass || newPass.length < 6) return alert("Password must be at least 6 characters.");

  const { error } = await supabase.auth.updateUser({ password: newPass });
  if (error) {
    $("resetStatus").textContent = "❌ " + error.message;
    return;
  }

  $("resetStatus").textContent = "✅ Password updated. You can sign in now.";
  // Clear hash so it doesn't keep showing reset mode
  window.location.hash = "";
  showResetUI(false);
  await refreshAll();
}

// ===== DASHBOARD =====
async function loadDashboard() {
  const { data: { session } } = await supabase.auth.getSession();
  $("dashboard").innerHTML = session
    ? "<div class='muted'>Logged in. Manage vehicles, services & reminders.</div>"
    : "<div class='muted'>Login to see reminders.</div>";
}

// ===== VEHICLES =====
async function loadVehicles() {
  const { data, error } = await supabase.from("vehicles").select("*").order("created_at", { ascending: true });
  if (error) return ($("vehicles").innerHTML = `<div class="muted">${error.message}</div>`);

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

// ===== DELETE HELPERS =====
async function deleteService(serviceId) {
  if (!confirm("Delete this service record?")) return;
  const { error } = await supabase.from("services").delete().eq("id", serviceId);
  if (error) return alert(error.message);
  await loadServices(selectedVehicleId);
}

async function deleteReminder(reminderId) {
  if (!confirm("Delete this reminder?")) return;
  const { error } = await supabase.from("reminders").delete().eq("id", reminderId);
  if (error) return alert(error.message);
  await loadReminders(selectedVehicleId);
}

// ===== SERVICES =====
async function loadServices(vehicleId) {
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("service_date", { ascending: false });

  if (error) return ($("services").innerHTML = `<div class="muted">${error.message}</div>`);

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
      <div><button class="secondary">Delete</button></div>
    `;
    row.querySelector("button").onclick = () => deleteService(s.id);
    wrap.appendChild(row);
  });

  $("services").innerHTML = "";
  $("services").appendChild(wrap);
}

// ===== REMINDERS =====
async function loadReminders(vehicleId) {
  const { data: v, error: vErr } = await supabase.from("vehicles").select("*").eq("id", vehicleId).single();
  if (vErr) return ($("reminders").innerHTML = `<div class="muted">${vErr.message}</div>`);

  const { data, error } = await supabase.from("reminders").select("*").eq("vehicle_id", vehicleId);
  if (error) return ($("reminders").innerHTML = `<div class="muted">${error.message}</div>`);

  const wrap = document.createElement("div");
  wrap.className = "list";

  (data || []).forEach(r => {
    let status = "OK";
    let detail = "";

    if (r.reminder_type === "date" && r.due_date) {
      const d = daysUntil(r.due_date);
      detail = `Due: ${fmtDate(r.due_date)} (${d} days)`;
      if (d <= 0) status = "DUE";
      else if (d <= (r.warn_days ?? 30)) status = "SOON";
    }
    if (r.reminder_type === "miles" && r.due_odometer != null) {
      const left = r.due_odometer - (v.current_odometer ?? 0);
      detail = `Due at: ${r.due_odometer} (left: ${left})`;
      if (left <= 0) status = "DUE";
      else if (left <= (r.warn_miles ?? 500)) status = "SOON";
    }
    if (r.reminder_type === "hours" && r.due_engine_hours != null) {
      const left = r.due_engine_hours - (v.current_engine_hours ?? 0);
      detail = `Due at: ${r.due_engine_hours} hrs (left: ${left})`;
      if (left <= 0) status = "DUE";
      else if (left <= (r.warn_hours ?? 25)) status = "SOON";
    }

    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <div><b>${r.name}</b> – ${status}</div>
        <div class="muted">${r.reminder_type.toUpperCase()} • ${detail}</div>
      </div>
      <div><button class="secondary">Delete</button></div>
    `;
    row.querySelector("button").onclick = () => deleteReminder(r.id);
    wrap.appendChild(row);
  });

  $("reminders").innerHTML = "";
  $("reminders").appendChild(wrap);
}

// ===== VEHICLE DETAILS =====
async function loadVehicleDetails(vehicleId) {
  if (!(await setAuthUI())) return;

  selectedVehicleId = vehicleId;

  const { data: v, error } = await supabase.from("vehicles").select("*").eq("id", vehicleId).single();
  if (error) return alert(error.message);

  $("selectedVehicle").innerHTML = `
    <div><b>${v.name}</b> <span class="badge">${v.type}</span></div>
    <div class="muted">Current Miles: ${v.current_odometer ?? 0} • Engine Hours: ${v.current_engine_hours ?? 0}</div>
  `;
  $("vehicleDetails").style.display = "block";

  $("btnUpdateMiles").onclick = async () => {
    const miles = Number(prompt("Miles:", v.current_odometer ?? 0));
    const hours = Number(prompt("Hours:", v.current_engine_hours ?? 0));
    const { error } = await supabase.from("vehicles").update({ current_odometer: miles, current_engine_hours: hours }).eq("id", vehicleId);
    if (error) return alert(error.message);
    await refreshAll();
    await loadVehicleDetails(vehicleId);
  };

  $("btnAddService").onclick = async () => {
    const payload = {
      vehicle_id: vehicleId,
      service_date: prompt("Service date (YYYY-MM-DD):", todayISO()),
      category: prompt("Category:", "Oil"),
      description: prompt("What was done?", ""),
      odometer: v.current_odometer ?? null,
      engine_hours: v.current_engine_hours ?? null,
    };
    const { error } = await supabase.from("services").insert(payload);
    if (error) return alert(error.message);
    await loadServices(vehicleId);
  };

  $("btnAddReminder").onclick = async () => {
    const name = prompt("Reminder name:", "Insurance");
    const type = (prompt("Type: date / miles / hours", "date") || "").toLowerCase();
    if (!["date","miles","hours"].includes(type)) return alert("Type must be date/miles/hours");
    const payload = { vehicle_id: vehicleId, name, reminder_type: type };
    if (type === "date") payload.due_date = prompt("Due date (YYYY-MM-DD):", todayISO());
    if (type === "miles") payload.due_odometer = Number(prompt("Due miles:", String((v.current_odometer ?? 0) + 5000)));
    if (type === "hours") payload.due_engine_hours = Number(prompt("Due hours:", String((v.current_engine_hours ?? 0) + 200)));
    const { error } = await supabase.from("reminders").insert(payload);
    if (error) return alert(error.message);
    await loadReminders(vehicleId);
  };

  $("btnDeleteVehicle").onclick = async () => {
    if (!confirm(`Delete vehicle "${v.name}"? Services and reminders will also be deleted.`)) return;
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
}

// ===== INIT =====
window.addEventListener("DOMContentLoaded", async () => {
  $("btnSignUp").onclick = signUp;
  $("btnSignIn").onclick = signIn;
  $("btnLogout").onclick = logout;
  $("btnUpdatePassword").onclick = updatePassword;

  // If user came from recovery link, show reset UI
  showResetUI(isRecoveryLink());

  supabase.auth.onAuthStateChange(async () => {
    // Hide reset box if login state changes
    showResetUI(isRecoveryLink());
    await refreshAll();
  });

  $("vehicleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!(await setAuthUI())) return alert("Please login first.");
    const f = e.target;
    const payload = {
      name: f.name.value.trim(),
      type: f.type.value.trim(),
      current_odometer: Number(f.current_odometer.value || 0),
      current_engine_hours: Number(f.current_engine_hours.value || 0),
    };
    const { error } = await supabase.from("vehicles").insert(payload);
    if (error) return alert(error.message);
    f.reset();
    await refreshAll();
  });

  await refreshAll();
});
