/**
 * ParkSense IoT Dashboard - Core Logic & Data Management
 * Proyek Monitoring Parkir Pintar Kelas XII SIJA SMK Telkom Sidoarjo
 * 
 * Ketentuan:
 * 1. Tepat 3 slot parkir (Slot 01, Slot 02, Slot 03).
 * 2. Status yang diperbolehkan: 'available' (Kosong), 'occupied' (Terisi), 'unknown' (Tidak Diketahui).
 * 3. Statistik dinamis dihitung murni dari data slot aktual.
 * 4. Mode Demo aktif secara transparan (Hardware ESP32 belum terhubung).
 */

// ==========================================
// 1. DATA MASTER & INISIALISASI
// ==========================================

const INITIAL_SLOTS = [
  { id: "slot-01", name: "Slot 01", status: "available", lastUpdated: "10:15:00" },
  { id: "slot-02", name: "Slot 02", status: "occupied",  lastUpdated: "09:45:00" },
  { id: "slot-03", name: "Slot 03", status: "available", lastUpdated: "10:05:00" }
];

// Deep copy data awal untuk sesi aktif
let slots = JSON.parse(JSON.stringify(INITIAL_SLOTS));

// Riwayat awal: hanya mencakup Slot 01, Slot 02, dan Slot 03
let history = [
  { slot: 1, action: "Keluar", time: "10:05:12", status: "Kosong", note: "Slot 01 kembali tersedia" },
  { slot: 2, action: "Masuk",  time: "09:45:30", status: "Terisi", note: "Kendaraan parkir di Slot 02" },
  { slot: 3, action: "Keluar", time: "09:30:15", status: "Kosong", note: "Slot 03 kembali tersedia" },
  { slot: 2, action: "Masuk",  time: "09:12:04", status: "Terisi", note: "Kendaraan parkir di Slot 02" }
];

let notificationsEnabled = true;
let simulationTimer = null;

// Label status berbahasa Indonesia
const STATUS_LABELS = {
  available: "Kosong",
  occupied: "Terisi",
  unknown: "Tidak Diketahui"
};

// Pemetaan warna indikator LED
const STATUS_COLORS = {
  available: "green",
  occupied: "red",
  unknown: "amber"
};

// ==========================================
// 2. ADAPTER LAYER (ESP32 IoT READINESS)
// ==========================================

/**
 * ParkSenseAdapter
 * Memisahkan sumber data dari komponen UI.
 * Pada tahap integrasi hardware selanjutnya, fungsi fetchFromESP32() dapat
 * disambungkan ke endpoint REST API ESP32 (HTTP) atau WebSocket server.
 */
const ParkSenseAdapter = {
  mode: "demo", // 'demo' | 'esp32'
  hardwareConnected: false,

  getParkingData() {
    return slots;
  },

  updateSlotStatus(index, newStatus) {
    return applySlotUpdate(index, newStatus);
  },

  resetToInitial() {
    slots = JSON.parse(JSON.stringify(INITIAL_SLOTS));
    refreshDashboard();
    return slots;
  }
};

// ==========================================
// 3. UTILITAS WAKTU & TOAST
// ==========================================

function getTimeString() {
  return new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function updateClock() {
  const clockEl = document.getElementById("clock");
  if (clockEl) {
    clockEl.textContent = new Date().toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }
}

function showToast(message) {
  if (!notificationsEnabled) return;

  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 2600);
}

// ==========================================
// 4. PERHITUNGAN STATISTIK DINAMIS
// ==========================================

/**
 * Menghitung statistik berdasarkan data slot aktual:
 * - Total slot = selalu 3.
 * - Kosong = jumlah slot dengan status 'available'.
 * - Terisi = jumlah slot dengan status 'occupied'.
 * - Tidak diketahui = jumlah slot dengan status 'unknown'.
 * - Persentase Okupansi = Terisi / (Kosong + Terisi) * 100%.
 *   Jika tidak ada status valid (Kosong + Terisi = 0), tampilkan '—'.
 */
function calculateStatistics() {
  const total = slots.length; // Tepat 3
  const available = slots.filter(s => s.status === "available").length;
  const occupied = slots.filter(s => s.status === "occupied").length;
  const unknown = slots.filter(s => s.status === "unknown").length;

  const validSlots = available + occupied;
  let occupancyRate = "—";

  if (validSlots > 0) {
    occupancyRate = ((occupied / validSlots) * 100).toFixed(1) + "%";
  }

  return {
    total,
    available,
    occupied,
    unknown,
    occupancyRate
  };
}

function updateStats() {
  const stats = calculateStatistics();

  // Update kartu di Beranda (Overview)
  const totalEl = document.getElementById("totalSlots");
  const availEl = document.getElementById("availableSlots");
  const occEl = document.getElementById("occupiedSlots");
  const unkEl = document.getElementById("unknownSlots");
  const rateEl = document.getElementById("occupancy");

  if (totalEl) totalEl.textContent = stats.total;
  if (availEl) availEl.textContent = stats.available;
  if (occEl) occEl.textContent = stats.occupied;
  if (unkEl) unkEl.textContent = stats.unknown;
  if (rateEl) rateEl.textContent = stats.occupancyRate;

  // Update kartu di Halaman Parking Lot
  const pTotal = document.getElementById("parkingTotal");
  const pAvail = document.getElementById("parkingAvailable");
  const pOcc = document.getElementById("parkingOccupied");
  const pUnk = document.getElementById("parkingUnknown");
  const pRate = document.getElementById("parkingOccupancy");

  if (pTotal) pTotal.textContent = stats.total;
  if (pAvail) pAvail.textContent = stats.available;
  if (pOcc) pOcc.textContent = stats.occupied;
  if (pUnk) pUnk.textContent = stats.unknown;
  if (pRate) pRate.textContent = stats.occupancyRate;
}

// ==========================================
// 5. RENDERING DENAH PARKIR (TEPAT 3 SLOT)
// ==========================================

function getCarIcon(status) {
  if (status === "occupied") {
    return `<svg class="bay-car-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 17h14v-5l-2-6H7L5 12v5z"></path>
      <circle cx="7.5" cy="17.5" r="2.5"></circle>
      <circle cx="16.5" cy="17.5" r="2.5"></circle>
    </svg>`;
  }
  if (status === "available") {
    return `<span class="bay-park-icon">🅿</span>`;
  }
  return `<span class="bay-unknown-icon">?</span>`;
}

/**
 * Render denah 3 slot parkir.
 * @param {string} containerId - ID elemen target container
 * @param {boolean} isDetailed - Menampilkan tombol kontrol langsung jika true (di parking lot)
 */
function renderParking(containerId, isDetailed = false) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  slots.forEach((slot, index) => {
    const slotNumber = index + 1;
    const slotCard = document.createElement("div");
    slotCard.className = `slot ${slot.status} ${isDetailed ? 'detailed-slot' : ''}`;
    slotCard.id = `ui-${slot.id}`;

    const statusText = STATUS_LABELS[slot.status];
    const colorClass = STATUS_COLORS[slot.status];
    const iconHtml = getCarIcon(slot.status);

    let controlsHtml = "";
    if (isDetailed) {
      controlsHtml = `
        <div class="slot-quick-controls" onclick="event.stopPropagation()">
          <button class="status-btn btn-avail ${slot.status === 'available' ? 'active' : ''}" 
                  onclick="setSpecificStatus(${index}, 'available')" title="Ubah ke Kosong">Kosong</button>
          <button class="status-btn btn-occ ${slot.status === 'occupied' ? 'active' : ''}" 
                  onclick="setSpecificStatus(${index}, 'occupied')" title="Ubah ke Terisi">Terisi</button>
          <button class="status-btn btn-unk ${slot.status === 'unknown' ? 'active' : ''}" 
                  onclick="setSpecificStatus(${index}, 'unknown')" title="Ubah ke Tidak Diketahui">Unknown</button>
        </div>
      `;
    }

    slotCard.innerHTML = `
      <div class="bay-sensor-pod">
        <span class="sensor-label">SENSOR #${slotNumber}</span>
        <span class="led ${colorClass}"></span>
      </div>
      <div class="bay-marking-top"></div>
      <div class="bay-body">
        <div class="car-visual-wrapper">
          ${iconHtml}
        </div>
        <div class="bay-info">
          <strong class="slot-number">${slot.name}</strong>
          <span class="status-badge ${slot.status}">
            <i class="dot ${colorClass}"></i> ${statusText}
          </span>
          <small class="slot-time">${slot.lastUpdated ? 'Update: ' + slot.lastUpdated : 'Sistem Siap'}</small>
        </div>
      </div>
      <div class="bay-marking-bottom"></div>
      ${controlsHtml}
    `;

    // Klik seluruh card untuk melakukan cycle status
    slotCard.addEventListener("click", () => cycleSlot(index));
    container.appendChild(slotCard);
  });
}

// ==========================================
// 6. RENDERING MONITORING INDIKATOR LED
// ==========================================

function renderLEDs() {
  const container = document.getElementById("ledList");
  if (!container) return;

  const ledItems = slots.map((slot, index) => {
    const color = STATUS_COLORS[slot.status];
    const statusText = STATUS_LABELS[slot.status];
    
    let desc = "Lampu Hijau aktif: Slot siap ditempati pengendara.";
    if (slot.status === "occupied") {
      desc = "Lampu Merah aktif: Slot sedang digunakan kendaraan.";
    } else if (slot.status === "unknown") {
      desc = "Lampu Amber aktif: Status sensor belum terdeteksi.";
    }

    return `
      <div class="led-item">
        <div class="led-bulb">
          <span class="led ${color}"></span>
        </div>
        <div class="led-details">
          <div class="led-header">
            <strong>${slot.name} — Indikator Fisik</strong>
            <span class="led-badge ${slot.status}">${statusText}</span>
          </div>
          <p>${desc}</p>
          <small>Terhubung ke modul LED pin output ESP32 #${index + 1}</small>
        </div>
      </div>
    `;
  });

  container.innerHTML = ledItems.join("");
}

// ==========================================
// 7. MANAJEMEN RIWAYAT & AKTIVITAS TERBARU
// ==========================================

function addHistory(slotNumber, action, status) {
  // Hanya simpan Slot 01, 02, atau 03
  if (slotNumber < 1 || slotNumber > 3) return;

  history.unshift({
    slot: slotNumber,
    action,
    time: getTimeString(),
    status,
    note: `Perubahan status Slot 0${slotNumber} ke ${status}`
  });

  // Batasi riwayat simulasi maksimum 100 entri
  if (history.length > 100) {
    history = history.slice(0, 100);
  }

  renderHistory();
}

function renderHistory() {
  const searchInput = document.getElementById("searchHistory");
  const filterSelect = document.getElementById("filterHistory");
  const historyTable = document.getElementById("historyTable");
  const historyCount = document.getElementById("historyCount");
  const recentHistory = document.getElementById("recentHistory");

  const search = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const filter = filterSelect ? filterSelect.value : "all";

  // Filter hanya data riwayat yang cocok (dan hanya slot 1-3)
  const filtered = history.filter(item => {
    if (item.slot < 1 || item.slot > 3) return false;

    const slotStr = `slot 0${item.slot} ${item.slot}`.toLowerCase();
    const matchSlot = search === "" || slotStr.includes(search);
    const matchAction = filter === "all" || item.action === filter;
    return matchSlot && matchAction;
  });

  if (historyTable) {
    if (filtered.length === 0) {
      historyTable.innerHTML = `<tr><td colspan="5" class="empty-row">Belum ada riwayat aktivitas yang cocok dengan filter.</td></tr>`;
    } else {
      historyTable.innerHTML = filtered.map((item, index) => {
        let actionClass = item.action;
        if (actionClass === "Tidak Diketahui") actionClass = "Unknown";
        return `
          <tr>
            <td>${index + 1}</td>
            <td><strong>Slot 0${item.slot}</strong></td>
            <td>${item.action}</td>
            <td>${item.time}</td>
            <td><span class="pill ${actionClass}">${item.status}</span></td>
          </tr>
        `;
      }).join("");
    }
  }

  if (historyCount) {
    historyCount.textContent = `Menampilkan ${filtered.length} dari ${history.length} catatan aktivitas simulasi.`;
  }

  // Update statistik ringkas di halaman riwayat
  const histTotal = document.getElementById("historyTotal");
  const histEntries = document.getElementById("historyEntries");
  const histExits = document.getElementById("historyExits");

  if (histTotal) histTotal.textContent = history.length;
  if (histEntries) histEntries.textContent = history.filter(h => h.action === "Masuk").length;
  if (histExits) histExits.textContent = history.filter(h => h.action === "Keluar").length;

  // Render 4 aktivitas terbaru pada dashboard overview
  if (recentHistory) {
    const recents = history.slice(0, 4);
    if (recents.length === 0) {
      recentHistory.innerHTML = `<tr><td colspan="4" class="empty-row">Belum ada riwayat aktivitas.</td></tr>`;
    } else {
      recentHistory.innerHTML = recents.map(item => {
        let actionClass = item.action;
        if (actionClass === "Tidak Diketahui") actionClass = "Unknown";
        return `
          <tr>
            <td><strong>Slot 0${item.slot}</strong></td>
            <td>${item.action === "Masuk" ? "Kendaraan masuk" : (item.action === "Keluar" ? "Kendaraan keluar" : "Sensor update")}</td>
            <td>${item.time}</td>
            <td><span class="pill ${actionClass}">${item.status}</span></td>
          </tr>
        `;
      }).join("");
    }
  }
}

// ==========================================
// 8. SIMULASI PERUBAHAN STATUS SLOT
// ==========================================

/**
 * Siklus status slot: Kosong (available) -> Terisi (occupied) -> Tidak Diketahui (unknown) -> Kosong
 */
function getNextStatus(currentStatus) {
  switch (currentStatus) {
    case "available":
      return "occupied";
    case "occupied":
      return "unknown";
    case "unknown":
      return "available";
    default:
      return "available";
  }
}

function applySlotUpdate(index, newStatus) {
  if (index < 0 || index >= slots.length) return;

  const slot = slots[index];
  const oldStatus = slot.status;
  if (oldStatus === newStatus) return;

  slot.status = newStatus;
  slot.lastUpdated = getTimeString();

  // Tentukan jenis aktivitas riwayat
  let action = "Tidak Diketahui";
  if (newStatus === "occupied") {
    action = "Masuk";
  } else if (newStatus === "available") {
    action = "Keluar";
  }

  addHistory(index + 1, action, STATUS_LABELS[newStatus]);
  refreshDashboard();

  showToast(`${slot.name}: Status berubah menjadi ${STATUS_LABELS[newStatus]}`);
}

function cycleSlot(index) {
  const currentStatus = slots[index].status;
  const next = getNextStatus(currentStatus);
  applySlotUpdate(index, next);
}

// Dipanggil dari tombol spesifik di halaman parking lot
window.setSpecificStatus = function(index, status) {
  applySlotUpdate(index, status);
};

function refreshDashboard() {
  updateStats();
  renderParking("parkingGrid", false);
  renderParking("parkingGridFull", true);
  renderLEDs();
  renderHistory();
}

// ==========================================
// 9. NAVIGASI ANTAR HALAMAN
// ==========================================

function navigateTo(pageId) {
  const pages = document.querySelectorAll(".page");
  pages.forEach(page => {
    page.classList.toggle("hidden", page.id !== pageId);
  });

  const navLinks = document.querySelectorAll(".nav-link");
  navLinks.forEach(button => {
    button.classList.toggle("active", button.dataset.page === pageId);
  });

  const titles = {
    dashboard: "Beranda",
    parking: "Parking Lot (3 Slot)",
    history: "Riwayat Parkir",
    settings: "Pengaturan Sistem"
  };

  const titleEl = document.getElementById("pageTitle");
  if (titleEl) {
    titleEl.textContent = titles[pageId] || "ParkSense";
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ==========================================
// 10. EVENT LISTENERS
// ==========================================

// Navigasi menu utama
document.querySelectorAll(".nav-link").forEach(button => {
  button.addEventListener("click", () => {
    navigateTo(button.dataset.page);
  });
});

// Tombol shortcut navigasi (data-goto)
document.querySelectorAll("[data-goto]").forEach(button => {
  button.addEventListener("click", () => {
    navigateTo(button.dataset.goto);
  });
});

// Filter riwayat
const searchHistoryEl = document.getElementById("searchHistory");
if (searchHistoryEl) {
  searchHistoryEl.addEventListener("input", renderHistory);
}

const filterHistoryEl = document.getElementById("filterHistory");
if (filterHistoryEl) {
  filterHistoryEl.addEventListener("change", renderHistory);
}

// Reset data simulasi 3 slot
const resetParkingBtn = document.getElementById("resetParking");
if (resetParkingBtn) {
  resetParkingBtn.addEventListener("click", () => {
    ParkSenseAdapter.resetToInitial();
    showToast("Status 3 slot parkir berhasil direset ke kondisi awal.");
  });
}

// Hapus riwayat simulasi
const clearHistoryBtn = document.getElementById("clearHistory");
if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener("click", () => {
    if (confirm("Apakah kamu yakin ingin menghapus semua catatan riwayat simulasi?")) {
      history = [];
      renderHistory();
      showToast("Riwayat simulasi berhasil dibersihkan.");
    }
  });
}

// Pengaturan animasi indikator LED
const ledAnimationEl = document.getElementById("ledAnimation");
if (ledAnimationEl) {
  ledAnimationEl.addEventListener("change", event => {
    document.body.classList.toggle("no-led-animation", !event.target.checked);
  });
}

// Pengaturan & interval pembaruan
const saveSettingsBtn = document.getElementById("saveSettings");
if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener("click", () => {
    const notifEl = document.getElementById("notifications");
    notificationsEnabled = notifEl ? notifEl.checked : true;

    const intervalVal = document.getElementById("simInterval");
    const interval = intervalVal ? Number(intervalVal.value) : 0;

    clearInterval(simulationTimer);
    simulationTimer = null;

    if (interval > 0) {
      simulationTimer = setInterval(() => {
        // Penyegaran berkala jam dan sinkronisasi tampilan
        updateClock();
        updateStats();
      }, interval * 1000);
    }

    const settingsMsg = document.getElementById("settingsMessage");
    if (settingsMsg) {
      settingsMsg.textContent = "Pengaturan berhasil disimpan dan aktif untuk sesi ini.";
    }

    showToast("Pengaturan sistem berhasil disimpan.");
  });
}

// ==========================================
// 11. INISIALISASI SAAT HALAMAN DIMUAT
// ==========================================

updateClock();
setInterval(updateClock, 1000);
refreshDashboard();
