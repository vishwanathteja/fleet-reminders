import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://vsrdlcafkrubktirwczq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NgIiYGeuJFv4x9N9sRrf3A_lRnWdTW9";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const vehiclesDiv = document.getElementById("vehicles");
const vehicleForm = document.getElementById("vehicleForm");

vehicleForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    name: vehicleForm.name.value,
    type: vehicleForm.type.value,
    current_odometer: Number(vehicleForm.current_odometer.value || 0),
    current_engine_hours: Number(vehicleForm.current_engine_hours.value || 0),
  };

  await supabase.from("vehicles").insert(data);
  vehicleForm.reset();
  loadVehicles();
});

async function loadVehicles() {
  const { data } = await supabase.from("vehicles").select("*");
  vehiclesDiv.innerHTML = "";

  data.forEach(v => {
    const div = document.createElement("div");
    div.textContent = `${v.name} (${v.type}) - Miles: ${v.current_odometer}`;
    vehiclesDiv.appendChild(div);
  });
}

loadVehicles();
