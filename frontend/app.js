const floorSelect = document.getElementById("floorSelect");
const seatNumberInput = document.getElementById("seatNumber");
const seatPreview = document.getElementById("seatPreview");
const statusBox = document.getElementById("statusBox");
const bookingsOutput = document.getElementById("bookingsOutput");
const floorCards = document.getElementById("floorCards");

const apiBaseInput = document.getElementById("apiBase");
const rollNoInput = document.getElementById("rollNo");

const registerBtn = document.getElementById("registerBtn");
const bookBtn = document.getElementById("bookBtn");
const releaseBtn = document.getElementById("releaseBtn");
const refreshFloorsBtn = document.getElementById("refreshFloorsBtn");
const refreshBookingsBtn = document.getElementById("refreshBookingsBtn");

function apiBase() {
  return apiBaseInput.value.trim().replace(/\/$/, "");
}

function setStatus(title, data) {
  statusBox.textContent = `${title}\n\n${JSON.stringify(data, null, 2)}`;
}

function selectedFloorCode() {
  return floorSelect.value;
}

function currentSeatId() {
  const code = selectedFloorCode();
  const seatNumber = Number(seatNumberInput.value);
  if (!code || !Number.isInteger(seatNumber) || seatNumber < 1 || seatNumber > 500) {
    return "-";
  }
  return `${code}${seatNumber}`;
}

function updateSeatPreview() {
  seatPreview.textContent = `Seat ID: ${currentSeatId()}`;
}

async function callApi(path, options = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  let body = {};
  try {
    body = await response.json();
  } catch {
    body = { raw: "non-json response" };
  }

  if (!response.ok) {
    throw { status: response.status, body };
  }

  return body;
}

function renderFloorCards(floors) {
  floorCards.innerHTML = "";
  for (const floor of floors) {
    const card = document.createElement("article");
    card.className = "card";

    const badgeClass = floor.is_full ? "badge full" : "badge";
    card.innerHTML = `
      <h3>${floor.floor_name} (${floor.floor_code})</h3>
      <p>Booked: ${floor.booked} / 500</p>
      <p>Available: ${floor.available}</p>
      <span class="${badgeClass}">${floor.is_full ? "Full" : "Open"}</span>
    `;

    floorCards.appendChild(card);
  }
}

function renderFloorSelect(floors) {
  const oldValue = floorSelect.value;
  floorSelect.innerHTML = "";

  for (const floor of floors) {
    const opt = document.createElement("option");
    opt.value = floor.floor_code;
    opt.textContent = `${floor.floor_name} (${floor.floor_code})${floor.is_full ? " - full" : ""}`;
    opt.disabled = floor.is_full;
    floorSelect.appendChild(opt);
  }

  if (oldValue && [...floorSelect.options].some((o) => o.value === oldValue && !o.disabled)) {
    floorSelect.value = oldValue;
  }

  updateSeatPreview();
}

async function refreshFloors() {
  try {
    const data = await callApi("/floors");
    renderFloorCards(data.floors || []);
    renderFloorSelect(data.floors || []);
    setStatus("Floors refreshed", data);
  } catch (error) {
    setStatus("Failed to fetch floors", error);
  }
}

async function refreshBookings() {
  try {
    const data = await callApi("/bookings");
    bookingsOutput.textContent = JSON.stringify(data.bookings || [], null, 2);
    setStatus("Bookings refreshed", data);
  } catch (error) {
    setStatus("Failed to fetch bookings", error);
  }
}

registerBtn.addEventListener("click", async () => {
  const roll_no = rollNoInput.value.trim();
  if (!roll_no) {
    setStatus("Validation", { error: "Enter roll number" });
    return;
  }

  try {
    const data = await callApi("/register", {
      method: "POST",
      body: JSON.stringify({ roll_no }),
    });
    setStatus("Register success", data);
    await refreshBookings();
  } catch (error) {
    setStatus("Register failed", error);
  }
});

bookBtn.addEventListener("click", async () => {
  const roll_no = rollNoInput.value.trim();
  const floor = selectedFloorCode();
  const seat_number = Number(seatNumberInput.value);

  if (!roll_no || !floor || !Number.isInteger(seat_number)) {
    setStatus("Validation", { error: "Fill roll number, floor and seat number" });
    return;
  }

  try {
    const data = await callApi("/bookings", {
      method: "POST",
      body: JSON.stringify({ roll_no, floor, seat_number }),
    });
    setStatus("Booking success", data);
    await refreshFloors();
    await refreshBookings();
  } catch (error) {
    setStatus("Booking failed", error);
  }
});

releaseBtn.addEventListener("click", async () => {
  const roll_no = rollNoInput.value.trim();
  if (!roll_no) {
    setStatus("Validation", { error: "Enter roll number" });
    return;
  }

  try {
    const data = await callApi("/bookings/release", {
      method: "POST",
      body: JSON.stringify({ roll_no }),
    });
    setStatus("Release success", data);
    await refreshFloors();
    await refreshBookings();
  } catch (error) {
    setStatus("Release failed", error);
  }
});

refreshFloorsBtn.addEventListener("click", refreshFloors);
refreshBookingsBtn.addEventListener("click", refreshBookings);
floorSelect.addEventListener("change", updateSeatPreview);
seatNumberInput.addEventListener("input", updateSeatPreview);

refreshFloors();
refreshBookings();
updateSeatPreview();
