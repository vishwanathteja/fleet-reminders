import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ===== SUPABASE CONFIG =====
const SUPABASE_URL = "https://vsrdlcafkrubktirwczq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NgIiYGeuJFv4x9N9sRrf3A_lRnWdTW9";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== HELPERS =====
const $ = (id) => document.getElementById(id);
let selectedVehicleId = null;

function todayISO() {
  const d = new Date();
  return d.toISOString().split("T")[0];
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

// ===== AUTH UI =====
function setAuthButtons(isAuthed) {
  $("btnLogin").style.display = isAuthed ? "none" : "inline-block";
  $("btnLogout").style.display = isAuthed ? "inline-block" : "none";
}

// Lock/unlock app controls based on login status
async function syncAuthUI() {
  const { data: { session } } = await supabase.auth.getSession();
  const isAuthed = !!session;

  setAuthButtons(isAuthed);

  // Disable form inputs when logged out
  const form = $("vehicleForm");
  form.querySelectorAll("input, button").forEach(el => (el.disabled = !isAuthed));

  if (!isAuthed) {
    // Hide details and clear private data
    $("vehicleDetails").style.display = "none";
    $("selectedVehicle").textContent = "Login to manage vehicles.";
    $("vehicles").innerHTML = `<div class="muted">Login to view vehicles.</div>`;
    $("services").innerHTML = "";
    $("reminders").innerHTML = "";
    selectedVehicleId = null;
  }

  return isAuthed;
}

async function login() {
  const email = prompt("Enter your email:");
  if (!email) return;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: "https://vishwanathteja.github.io/fleet-reminders/",
    },
  });

  if (error) alert(error.message);
  else alert("Check your email for the login link.");
}

async function logout() {
  await supabase.auth.signOut();
  selectedVehicleId = null;
  await syncAuthUI();   // ensures UI updates immediately
  await loadDashboard();
}

// ===== DASHBOARD =====
async function loadDashboard() {
  const { data: { session } } = await supabase.auth.getSession();
  $("dashboard").innerHTML = session
    ? "<div class='muted'>Logged in. Add vehicles/reminders to track due items.</div>"
    : "<div class='muted'>Login to see reminders.</div>";
}

// ===== VEHICLES LIST =====
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

  (data || []).forEach((v) => {
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
  const ok = confirm("Delete this service record?");
  if (!ok) return;

  const { error } = await supabase.from("services").delete().eq("id", serviceId);
  if (error) return alert(error.message);

  if (selectedVehicleId) await loadServices(selectedVehicleId);
  alert("Service record deleted.");
}

async function deleteReminder(reminderId) {
  const ok = confirm("Delete this reminder?");
  if (!ok) return;

  const { error } = await supabase.from("reminders").delete().eq("id", reminderId);
  if (error) return alert(error.message);

  if (selectedVehicleId) await loadReminders(selectedVehicleId);
  alert("Reminder deleted.");
}

// ===== SERVICES / REMINDERS =====
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

  (data || []).forEach((s) => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <div><b>${s.category}</b> <span class="badge">${fmtDate(s.service_date)}</span></div>
        <div>${s.description}</div>
        <div class="muted">Miles: ${s.odometer ?? "-"} • Hours: ${s.engine_hours ?? "-"}</div>
      </div>
      <div>
        <button class="secondary" data-del-service="${s.id}">Delete</button>
      </div>
    `;
    row.querySelector(`[data-del-service="${s.id}"]`).onclick = () => deleteService(s.id);
    wrap.appendChild(row);
  });

  $("services").innerHTML = "";
  $("services").appendChild(wrap);
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
    .eq("vehicle_id", vehicleId);

  if (error) {
    $("reminders").innerHTML = `<div class="muted">${error.message}</div>`;
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "list";

  (data || []).forEach((r) => {
    let status = "OK";
    let cls = "badge";
    let detail = "";

    if (r.reminder_type === "date" && r.due_date) {
      const d = daysUntil(r.due_date);
      detail = `Due: ${fmtDate(r.due_date)} (${d} days)`;
      if (d <= 0) { status = "DUE"; cls += " red"; }
      else if (d <= (r.warn_days ?? 30)) { status = "SOON"; cls += " yellow"; }
    }

    if (r.reminder_type === "miles" && r.due_odometer != null) {
      const left = r.due_odometer - (v.current_odometer ?? 0);
      detail = `Due at: ${r.due_odometer} (left: ${left})`;
      if (left <= 0) { status = "DUE"; cls += " red"; }
      else if (left <= (r.warn_miles ?? 500)) { status = "SOON"; cls += " yellow"; }
    }

    if (r.reminder_type === "hours" && r.due_engine_hours != null) {
      const left = r.due_engine_hours - (v.current_engine_hours ?? 0);
      detail = `Due at: ${r.due_engine_hours} hrs (left: ${left})`;
      if (left <= 0) { status = "DUE"; cls += " red"; }
      else if (left <= (r.warn_hours ?? 25)) { status = "SOON"; cls += " yellow"; }
    }

    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <div><b>${r.name}</b> <span class="${cls}">${status}</span></div>
        <div class="muted">${r.reminder_type.toUpperCase()} • ${detail}</div>
      </div>
      <div>
        <button class="secondary" data-del-reminder="${r.id}">Delete</button>
      </div>
    `;
    row.querySelector(`[data-del-reminder="${r.id}"]`).onclick = () => deleteReminder(r.id);
    wrap.appendChild(row);
  });

  $("reminders").innerHTML = "";
  $("reminders").appendChild(wrap);
}

// ===== VEHICLE DETAILS =====
async function loadVehicleDetails(vehicleId) {
  const isAuthed = await syncAuthUI();
  if (!isAuthed) return;

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

    const newMiles = Number(miles);
    const newHours = Number(hours);

    if (Number.isNaN(newMiles) || newMiles < 0) return alert("Miles must be a number >= 0.");
    if (!Number.isNaN(newHours) && newHours < 0) return alert("Hours must be >= 0.");

    const { error } = await supabase
      .from("vehicles")
      .update({
        current_odometer: newMiles,
        current_engine_hours: Number.isNaN(newHours) ? v.current_engine_hours : newHours,
      })
      .eq("id", vehicleId);

    if (error) return alert(error.message);

    await refreshAll();
    await loadVehicleDetails(vehicleId);
  };

  $("btnAddService").onclick = async () => {
    const service_date = prompt("Service date (YYYY-MM-DD):", todayISO());
    if (!service_date) return;

    const category = prompt("Category (Oil/Brakes/Tires/PTO/etc):", "Oil");
    if (!category) return;

    const description = prompt("What was done / what changed?", "");
    if (!description) return;

    const odometer = Number(prompt("Odometer at service (miles):", String(v.current_odometer ?? 0)) || "");
    const engine_hours = Number(prompt("Engine hours at service (optional):", String(v.current_engine_hours ?? 0)) || "");

    const payload = {
      vehicle_id: vehicleId,
      service_date,
      category,
      description,
      odometer: Number.isNaN(odometer) ? null : odometer,
      engine_hours: Number.isNaN(engine_hours) ? null : engine_hours,
    };

    const { error } = await supabase.from("services").insert(payload);
    if (error) return alert(error.message);

    await loadServices(vehicleId);
  };

  $("btnAddReminder").onclick = async () => {
    const name = prompt("Reminder name (Insurance/DOT/Oil Change/etc):", "Insurance");
    if (!name) return;

    const reminder_type = (prompt("Type: date OR miles OR hours", "date") || "").toLowerCase();
    if (!["date", "miles", "hours"].includes(reminder_type))
      return alert("Type must be: date, miles, or hours");

    let due_date = null, due_odometer = null, due_engine_hours = null;

    if (reminder_type === "date") {
      due_date = prompt("Due date (YYYY-MM-DD):", todayISO());
      if (!due_date) return;
    }
    if (reminder_type === "miles") {
      due_odometer = Number(prompt("Due at odometer (miles):", String((v.current_odometer ?? 0) + 5000)));
      if (Number.isNaN(due_odometer)) return alert("Due miles must be a number.");
    }
    if (reminder_type === "hours") {
      due_engine_hours = Number(prompt("Due at engine hours:", String((v.current_engine_hours ?? 0) + 200)));
      if (Number.isNaN(due_engine_hours)) return alert("Due hours must be a number.");
    }

    const payload = {
      vehicle_id: vehicleId,
      name,
      reminder_type,
      due_date,
      due_odometer,
      due_engine_hours,
    };

    const { error } = await supabase.from("reminders").insert(payload);
    if (error) return alert(error.message);

    await loadReminders(vehicleId);
    await loadDashboard();
  };

  $("btnDeleteVehicle").onclick = async () => {
    const ok = confirm(`Delete vehicle "${v.name}"? This will also delete its services and reminders.`);
    if (!ok) return;

    const { error } = await supabase.from("vehicles").delete().eq("id", vehicleId);
    if (error) return alert(error.message);

    selectedVehicleId = null;
    $("selectedVehicle").textContent = "Select a vehicle to view details.";
    $("vehicleDetails").style.display = "none";

    await refreshAll();
    alert("Vehicle deleted.");
  };

  await loadServices(vehicleId);
  await loadReminders(vehicleId);
}

// ===== REFRESH =====
async function refreshAll() {
  const isAuthed = await syncAuthUI();
  await loadDashboard();

  if (!isAuthed) return;
  await loadVehicles();
}

// ===== INIT =====
window.addEventListener("DOMContentLoaded", async () => {
  $("btnLogin").onclick = login;
  $("btnLogout").onclick = logout;

  $("vehicleForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const isAuthed = await syncAuthUI();
    if (!isAuthed) return alert("Please login first.");

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

  supabase.auth.onAuthStateChange(async () => {
    await refreshAll();
  });

  await refreshAll();
});
