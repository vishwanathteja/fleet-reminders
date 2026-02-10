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

// ===== AUTH =====
function setAuthButtons(isAuthed) {
  $("btnLogin").style.display = isAuthed ? "none" : "inline-block";
  $("btnLogout").style.display = isAuthed ? "inline-block" : "none";
}

async function login() {
  const email = prompt("Enter your email:");
  if (!email) return;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: "https://vishwanathteja.github.io/fleet-reminders/"
    }
  });

  if (error) alert(error.message);
  else alert("Check your email for the login link.");
}

async function logout() {
  await supabase.auth.signOut();
  selectedVehicleId = null;
  $("selectedVehicle").textContent = "Select a vehicle to view details.";
  $("vehicleDetails").style.display = "none";
  refreshAll();
}

$("btnLogin").onclick = login;
$("btnLogout").onclick = logout;

supabase.auth.onAuthStateChange((_event, session) => {
  setAuthButtons(!!session);
  refreshAll();
});

// ===== VEHICLES =====
async function refreshAll() {
  await loadVehicles();
  await loadDashboard();
  if (selectedVehicleId) await loadVehicleDetails(selectedVehicleId);
}

$("vehicleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;

  const payload = {
    name: f.name.value.trim(),
    type: f.type.value.trim(),
    current_odometer: Number(f.current_odometer.value || 0),
    current_engine_hours: Number(f.current_engine_hours.value || 0)
  };

  const { error } = await supabase.from("vehicles").insert(payload);
  if (error) return alert(error.message);

  f.reset();
  refreshAll();
});

async function loadVehicles() {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .order("created_at");

  if (error) return ($("vehicles").textContent = error.message);

  const wrap = document.createElement("div");
  wrap.className = "list";

  (data || []).forEach(v => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <b>${v.name}</b> <span class="badge">${v.type}</span>
        <div class="muted">Miles: ${v.current_odometer} | Hours: ${v.current_engine_hours}</div>
      </div>
      <button class="secondary">Open</button>
    `;
    el.querySelector("button").onclick = () => loadVehicleDetails(v.id);
    wrap.appendChild(el);
  });

  $("vehicles").innerHTML = "";
  $("vehicles").appendChild(wrap);
}

async function loadVehicleDetails(vehicleId) {
  selectedVehicleId = vehicleId;

  const { data: v } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", vehicleId)
    .single();

  $("selectedVehicle").innerHTML = `
    <b>${v.name}</b> <span class="badge">${v.type}</span>
    <div class="muted">Miles: ${v.current_odometer} | Hours: ${v.current_engine_hours}</div>
  `;
  $("vehicleDetails").style.display = "block";

  $("btnUpdateMiles").onclick = async () => {
    const miles = Number(prompt("Current miles:", v.current_odometer));
    const hours = Number(prompt("Engine hours:", v.current_engine_hours));
    if (isNaN(miles) || isNaN(hours)) return;

    await supabase.from("vehicles").update({
      current_odometer: miles,
      current_engine_hours: hours
    }).eq("id", vehicleId);

    refreshAll();
  };

  $("btnAddService").onclick = async () => {
    const category = prompt("Service type (Oil, Brakes, DOT, etc)");
    const desc = prompt("What was done?");
    if (!category || !desc) return;

    await supabase.from("services").insert({
      vehicle_id: vehicleId,
      service_date: todayISO(),
      category,
      description: desc,
      odometer: v.current_odometer,
      engine_hours: v.current_engine_hours
    });

    loadServices(vehicleId);
  };

  $("btnAddReminder").onclick = async () => {
    const name = prompt("Reminder name (Insurance, DOT, Oil Change)");
    const type = prompt("Type: date / miles / hours");
    if (!name || !type) return;

    let payload = { vehicle_id: vehicleId, name, reminder_type: type };

    if (type === "date") payload.due_date = prompt("Due date (YYYY-MM-DD):", todayISO());
    if (type === "miles") payload.due_odometer = Number(prompt("Due miles:"));
    if (type === "hours") payload.due_engine_hours = Number(prompt("Due hours:"));

    await supabase.from("reminders").insert(payload);
    loadReminders(vehicleId);
  };

  loadServices(vehicleId);
  loadReminders(vehicleId);
}

async function loadServices(vehicleId) {
  const { data } = await supabase
    .from("services")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("service_date", { ascending: false });

  $("services").innerHTML = (data || []).map(s => `
    <div class="item">
      <b>${s.category}</b> – ${fmtDate(s.service_date)}
      <div class="muted">${s.description}</div>
    </div>
  `).join("");
}

async function loadReminders(vehicleId) {
  const { data: v } = await supabase.from("vehicles").select("*").eq("id", vehicleId).single();
  const { data } = await supabase.from("reminders").select("*").eq("vehicle_id", vehicleId);

  $("reminders").innerHTML = (data || []).map(r => {
    let status = "OK";
    if (r.reminder_type === "date" && r.due_date && daysUntil(r.due_date) <= 0) status = "DUE";
    if (r.reminder_type === "miles" && r.due_odometer <= v.current_odometer) status = "DUE";
    if (r.reminder_type === "hours" && r.due_engine_hours <= v.current_engine_hours) status = "DUE";

    return `<div class="item"><b>${r.name}</b> – ${status}</div>`;
  }).join("");
}

async function loadDashboard() {
  const { data: { session } } = await supabase.auth.getSession();
  $("dashboard").innerHTML = session
    ? "<div class='muted'>Logged in. Manage vehicles and reminders.</div>"
    : "<div class='muted'>Login to see reminders.</div>";
}

// ===== INIT =====
(async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  setAuthButtons(!!session);
  refreshAll();
})();
