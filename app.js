import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

/* ================= SUPABASE CONFIG ================= */
const SUPABASE_URL = "https://vsrdlcafkrubktirwczq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NgIiYGeuJFv4x9N9sRrf3A_lRnWdTW9";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ================= HELPERS ================= */
const $ = (id) => document.getElementById(id);
let selectedVehicleId = null;
let loginCooldown = false;

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

/* ================= AUTH UI ================= */
function setAuthButtons(isAuthed) {
  $("btnLogin").style.display = isAuthed ? "none" : "inline-block";
  $("btnLogout").style.display = isAuthed ? "inline-block" : "none";
}

async function syncAuthUI() {
  const { data: { session } } = await supabase.auth.getSession();
  const isAuthed = !!session;

  setAuthButtons(isAuthed);

  // Lock add form when logged out
  const form = $("vehicleForm");
  form.querySelectorAll("input, button").forEach(el => el.disabled = !isAuthed);

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

/* ================= LOGIN / LOGOUT ================= */
async function login() {
  if (loginCooldown) {
    alert("Please wait before requesting another email.");
    return;
  }

  const email = prompt("Enter your email:");
  if (!email) return;

  loginCooldown = true;
  $("btnLogin").disabled = true;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: "https://vishwanathteja.github.io/fleet-reminders/",
    },
  });

  if (error) alert(error.message);
  else alert("Check your email for the login link.");

  setTimeout(() => {
    loginCooldown = false;
    $("btnLogin").disabled = false;
  }, 30000);
}

async function logout() {
  await supabase.auth.signOut();
  selectedVehicleId = null;
  await syncAuthUI();
  await loadDashboard();
}

/* ================= DASHBOARD ================= */
async function loadDashboard() {
  const { data: { session } } = await supabase.auth.getSession();
  $("dashboard").innerHTML = session
    ? "<div class='muted'>Logged in. Manage vehicles, services & reminders.</div>"
    : "<div class='muted'>Login to see reminders.</div>";
}

/* ================= VEHICLES ================= */
async function loadVehicles() {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .order("created_at");

  if (error) {
    $("vehicles").innerHTML = error.message;
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "list";

  data.forEach(v => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <b>${v.name}</b> <span class="badge">${v.type}</span>
        <div class="muted">Miles: ${v.current_odometer} • Hours: ${v.current_engine_hours}</div>
      </div>
      <button class="secondary">Open</button>
    `;
    el.querySelector("button").onclick = () => loadVehicleDetails(v.id);
    wrap.appendChild(el);
  });

  $("vehicles").innerHTML = "";
  $("vehicles").appendChild(wrap);
}

/* ================= SERVICES ================= */
async function deleteService(id) {
  if (!confirm("Delete this service record?")) return;
  await supabase.from("services").delete().eq("id", id);
  loadServices(selectedVehicleId);
}

async function loadServices(vehicleId) {
  const { data } = await supabase
    .from("services")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("service_date", { ascending: false });

  const wrap = document.createElement("div");
  wrap.className = "list";

  data.forEach(s => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <b>${s.category}</b> <span class="badge">${fmtDate(s.service_date)}</span>
        <div>${s.description}</div>
        <div class="muted">Miles: ${s.odometer} • Hours: ${s.engine_hours}</div>
      </div>
      <button class="secondary">Delete</button>
    `;
    el.querySelector("button").onclick = () => deleteService(s.id);
    wrap.appendChild(el);
  });

  $("services").innerHTML = "";
  $("services").appendChild(wrap);
}

/* ================= REMINDERS ================= */
async function deleteReminder(id) {
  if (!confirm("Delete this reminder?")) return;
  await supabase.from("reminders").delete().eq("id", id);
  loadReminders(selectedVehicleId);
}

async function loadReminders(vehicleId) {
  const { data: v } = await supabase.from("vehicles").select("*").eq("id", vehicleId).single();
  const { data } = await supabase.from("reminders").select("*").eq("vehicle_id", vehicleId);

  const wrap = document.createElement("div");
  wrap.className = "list";

  data.forEach(r => {
    let status = "OK";
    if (r.reminder_type === "date" && daysUntil(r.due_date) <= 0) status = "DUE";
    if (r.reminder_type === "miles" && r.due_odometer <= v.current_odometer) status = "DUE";
    if (r.reminder_type === "hours" && r.due_engine_hours <= v.current_engine_hours) status = "DUE";

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div><b>${r.name}</b> – ${status}</div>
      <button class="secondary">Delete</button>
    `;
    el.querySelector("button").onclick = () => deleteReminder(r.id);
    wrap.appendChild(el);
  });

  $("reminders").innerHTML = "";
  $("reminders").appendChild(wrap);
}

/* ================= VEHICLE DETAILS ================= */
async function loadVehicleDetails(vehicleId) {
  if (!(await syncAuthUI())) return;

  selectedVehicleId = vehicleId;
  const { data: v } = await supabase.from("vehicles").select("*").eq("id", vehicleId).single();

  $("selectedVehicle").innerHTML = `
    <b>${v.name}</b> <span class="badge">${v.type}</span>
    <div class="muted">Miles: ${v.current_odometer} • Hours: ${v.current_engine_hours}</div>
  `;
  $("vehicleDetails").style.display = "block";

  $("btnUpdateMiles").onclick = async () => {
    const miles = Number(prompt("Miles:", v.current_odometer));
    const hours = Number(prompt("Hours:", v.current_engine_hours));
    await supabase.from("vehicles").update({
      current_odometer: miles,
      current_engine_hours: hours
    }).eq("id", vehicleId);
    refreshAll();
  };

  $("btnAddService").onclick = async () => {
    await supabase.from("services").insert({
      vehicle_id: vehicleId,
      service_date: todayISO(),
      category: prompt("Category"),
      description: prompt("Description"),
      odometer: v.current_odometer,
      engine_hours: v.current_engine_hours
    });
    loadServices(vehicleId);
  };

  $("btnAddReminder").onclick = async () => {
    await supabase.from("reminders").insert({
      vehicle_id: vehicleId,
      name: prompt("Reminder name"),
      reminder_type: "miles",
      due_odometer: Number(prompt("Due miles"))
    });
    loadReminders(vehicleId);
  };

  $("btnDeleteVehicle").onclick = async () => {
    if (!confirm("Delete vehicle completely?")) return;
    await supabase.from("vehicles").delete().eq("id", vehicleId);
    refreshAll();
  };

  loadServices(vehicleId);
  loadReminders(vehicleId);
}

/* ================= REFRESH ================= */
async function refreshAll() {
  await syncAuthUI();
  await loadDashboard();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await loadVehicles();
}

/* ================= INIT ================= */
window.addEventListener("DOMContentLoaded", async () => {
  $("btnLogin").onclick = login;
  $("btnLogout").onclick = logout;

  $("vehicleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!(await syncAuthUI())) return;

    const f = e.target;
    await supabase.from("vehicles").insert({
      name: f.name.value,
      type: f.type.value,
      current_odometer: Number(f.current_odometer.value || 0),
      current_engine_hours: Number(f.current_engine_hours.value || 0),
    });
    f.reset();
    refreshAll();
  });

  supabase.auth.onAuthStateChange(refreshAll);
  refreshAll();
});
