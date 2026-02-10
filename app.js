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
  await refreshAll();
}

// ===== DATA LOADERS =====
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

  $("services").innerHTML = (data || []).map(s => `
    <div class="item">
      <div>
        <div><b>${s.category}</b> <span class="badge">${fmtDate(s.service_date)}</span></div>
        <div>${s.description}</div>
        <div class="muted">Miles: ${s.odometer ?? "-"} • Hours: ${s.engine_hours ?? "-"}</div>
      </div>
    </div>
  `).join("");
}

async function loadReminders(vehicleId) {
  const { data: v, error: vErr } = await supabase
    .from("vehicles").select("*").eq("id", vehicleId).single();
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

  $("reminders").innerHTML = (data || []).map(r => {
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

    return
