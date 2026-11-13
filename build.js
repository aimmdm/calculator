/*
 * LIFE CALCULATOR
 * Node.js 22, CommonJS, tanpa dependensi.
 *
 * Build:
 *   node build.js
 *
 * Mode default: preview GitHub Pages.
 * Mode produksi: LC_MODE=production
 *
 * Preview:
 *   https://aimmdm.github.io/calculator/
 *
 * Produksi yang direncanakan:
 *   https://calculator.mainilmu.pro/
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ============================================================
// KONFIGURASI
// ============================================================

const MODE = process.env.LC_MODE || "preview";

const CONFIG = {
  preview: {
    siteUrl: "https://aimmdm.github.io",
    basePath: "/calculator/"
  },
  production: {
    siteUrl: "https://calculator.mainilmu.pro",
    basePath: "/"
  }
};

if (!CONFIG[MODE]) {
  throw new Error("LC_MODE harus preview atau production.");
}

const SITE_URL = CONFIG[MODE].siteUrl;
const BASE_PATH = CONFIG[MODE].basePath;
const BASE_URL = SITE_URL + BASE_PATH;

const SITE_NAME = "LIFE CALCULATOR";
const EMAIL = "admin@mainilmu.pro";
const DIST = path.resolve(__dirname, "dist");

// Preset tetap noindex sampai ditinjau secara editorial.
const INDEX_PRESETS = false;

// AdSense sengaja tidak diaktifkan dan ads.txt tidak dibuat.
const POLICY = [
  ["Tentang", "https://www.mainilmu.pro/p/about.html"],
  ["Kontak", "https://www.mainilmu.pro/p/contacts.html"],
  ["Privasi", "https://www.mainilmu.pro/p/privacy-policy.html"],
  ["Ketentuan", "https://www.mainilmu.pro/p/terms-of-service.html"],
  ["Disclaimer", "https://www.mainilmu.pro/p/disclaimer.html"],
  ["DMCA", "https://www.mainilmu.pro/p/dmca.html"]
];

// ============================================================
// UTILITAS
// ============================================================

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function escapeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error("PENGUJIAN GAGAL: " + message);
  }
  console.log("[OK] " + message);
}

function relativeRoot(urlPath) {
  const depth = urlPath.split("/").filter(Boolean).length;
  return depth ? "../".repeat(depth) : "./";
}

function write(relativePath, content) {
  const target = path.resolve(DIST, relativePath);

  if (!target.startsWith(DIST + path.sep)) {
    throw new Error("Path output tidak aman: " + relativePath);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

// ============================================================
// MESIN KALKULATOR
// Fungsi ini digunakan di Node dan dikirim ke browser.
// ============================================================

function createCalculatorCore() {
  "use strict";

  const moneyFormatter = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  });

  const numberFormatter = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2
  });

  function money(value) {
    return moneyFormatter.format(value);
  }

  function number(value) {
    return numberFormatter.format(value);
  }

  function payment(principal, annualRate, months) {
    const monthlyRate = annualRate / 1200;

    if (monthlyRate === 0) {
      return principal / months;
    }

    return principal * monthlyRate /
      (1 - Math.pow(1 + monthlyRate, -months));
  }

  /*
   * Jadwal memakai angka desimal internal.
   * Pembulatan hanya untuk tampilan.
   */
  function schedule(principal, annualRate, months) {
    const monthlyRate = annualRate / 1200;
    const normalPayment = payment(principal, annualRate, months);

    let balance = principal;
    const rows = [];

    for (let month = 1; month <= months; month++) {
      const interest = balance * monthlyRate;

      let principalPart =
        month === months
          ? balance
          : normalPayment - interest;

      principalPart = Math.max(0, Math.min(balance, principalPart));

      const actualPayment = principalPart + interest;

      balance = Math.max(0, balance - principalPart);

      if (month === months || balance < 0.000001) {
        balance = 0;
      }

      rows.push({
        month,
        payment: actualPayment,
        interest,
        principal: principalPart,
        balance
      });
    }

    return rows;
  }

  function value(input, id) {
    const item = input[id];

    if (item === "" || item === null || item === undefined) {
      return NaN;
    }

    return Number(item);
  }

  function between(value, min, max) {
    return Number.isFinite(value) && value >= min && value <= max;
  }

  function result(summary, rows, note) {
    return { summary, rows: rows || [], note: note || "" };
  }

  function calculate(type, input) {
    if (type === "pinjaman") {
      const principal = value(input, "principal");
      const rate = value(input, "rate");
      const months = value(input, "months");

      if (
        !between(principal, 1, 1e12) ||
        !between(rate, 0, 100) ||
        !between(months, 1, 600) ||
        !Number.isInteger(months)
      ) {
        throw new Error(
          "Periksa input: pinjaman harus positif, bunga 0–100%, " +
          "dan tenor 1–600 bulan penuh."
        );
      }

      const rows = schedule(principal, rate, months);

      const totalPayment = rows.reduce((sum, row) => sum + row.payment, 0);
      const totalInterest = rows.reduce((sum, row) => sum + row.interest, 0);

      return result(
        [
          ["Estimasi cicilan per bulan", money(rows[0].payment)],
          ["Pokok pinjaman", money(principal)],
          ["Total bunga", money(totalInterest)],
          ["Total pembayaran", money(totalPayment)]
        ],
        rows,
        "Bunga dianggap tetap. Biaya administrasi, asuransi, dan denda belum dihitung."
      );
    }

    if (type === "kpr") {
      const price = value(input, "price");
      const down = value(input, "down");
      const rate = value(input, "rate");
      const years = value(input, "years");

      if (
        !between(price, 1, 1e12) ||
        !between(down, 0, 1e12) ||
        down >= price ||
        !between(rate, 0, 100) ||
        !between(years, 1, 50) ||
        !Number.isInteger(years)
      ) {
        throw new Error(
          "Periksa input: uang muka harus lebih kecil dari harga rumah " +
          "dan tenor harus 1–50 tahun penuh."
        );
      }

      const principal = price - down;
      const rows = schedule(principal, rate, years * 12);

      const totalPayment = rows.reduce((sum, row) => sum + row.payment, 0);
      const totalInterest = rows.reduce((sum, row) => sum + row.interest, 0);

      return result(
        [
          ["Estimasi cicilan per bulan", money(rows[0].payment)],
          ["Uang muka", money(down)],
          ["Pokok pinjaman", money(principal)],
          ["Total bunga", money(totalInterest)],
          ["Total cicilan", money(totalPayment)]
        ],
        rows,
        "Bunga dianggap tetap sepanjang tenor. Pajak, notaris, asuransi, provisi, dan biaya lain belum dihitung."
      );
    }

    if (type === "usaha") {
      const cost = value(input, "cost");
      const price = value(input, "price");
      const quantity = value(input, "quantity");

      if (
        !between(cost, 0, 1e12) ||
        !between(price, 1, 1e12) ||
        !between(quantity, 0, 1e9) ||
        !Number.isInteger(quantity)
      ) {
        throw new Error(
          "Periksa input: harga jual harus positif dan jumlah unit harus bilangan bulat."
        );
      }

      const profit = price - cost;
      const margin = profit / price * 100;
      const markup = cost > 0 ? profit / cost * 100 : null;

      return result(
        [
          ["Laba per unit", money(profit)],
          ["Margin terhadap harga jual", number(margin) + "%"],
          [
            "Markup terhadap biaya",
            markup === null ? "Tidak tersedia jika biaya nol" : number(markup) + "%"
          ],
          ["Laba untuk jumlah unit", money(profit * quantity)]
        ],
        [],
        "Hasil bergantung pada biaya yang Anda masukkan. Pajak, biaya platform, dan biaya tetap tidak otomatis dihitung."
      );
    }

    if (type === "gaji") {
      const gross = value(input, "gross");
      const deductions = value(input, "deductions");

      if (
        !between(gross, 0, 1e12) ||
        !between(deductions, 0, 1e12)
      ) {
        throw new Error("Periksa nominal gaji dan potongan.");
      }

      const net = gross - deductions;

      return result(
        [
          ["Gaji bersih simulasi", money(net)],
          ["Gaji kotor", money(gross)],
          ["Potongan yang dimasukkan", money(deductions)]
        ],
        [],
        "Ini pengurangan sederhana. Kalkulator tidak menghitung PPh 21, BPJS, atau kewajiban hukum secara otomatis."
      );
    }

    if (type === "konstruksi") {
      const length = value(input, "length");
      const width = value(input, "width");
      const tileLength = value(input, "tileLength");
      const tileWidth = value(input, "tileWidth");
      const reserve = value(input, "reserve");

      if (
        !between(length, 0.01, 1000) ||
        !between(width, 0.01, 1000) ||
        !between(tileLength, 1, 500) ||
        !between(tileWidth, 1, 500) ||
        !between(reserve, 0, 100)
      ) {
        throw new Error("Periksa ukuran ruangan, ukuran ubin, dan cadangan.");
      }

      const area = length * width;
      const tileArea = tileLength * tileWidth / 10000;
      const tiles = Math.ceil((area / tileArea) * (1 + reserve / 100) - 1e-9);

      return result(
        [
          ["Estimasi jumlah ubin", number(tiles) + " buah"],
          ["Luas ruangan", number(area) + " m²"],
          ["Cadangan", number(reserve) + "%"]
        ],
        [],
        "Estimasi geometri sederhana. Pola pemasangan, potongan, nat, dan kondisi lapangan dapat mengubah kebutuhan."
      );
    }

    throw new Error("Jenis kalkulator tidak dikenal.");
  }

  return { calculate, payment, schedule };
}

const CORE = createCalculatorCore();

// ============================================================
// DEFINISI KALKULATOR
// ============================================================

const ENGINES = [
  {
    id: "pinjaman",
    title: "Kalkulator Cicilan Pinjaman",
    icon: "wallet",
    intro: "Simulasi cicilan pinjaman dengan bunga anuitas tetap.",
    method: "Bunga dihitung dari sisa pokok. Angsuran menggunakan rumus anuitas; jika bunga nol, pokok dibagi rata sepanjang tenor.",
    fields: [
      { id: "principal", label: "Jumlah pinjaman (Rp)", min: 1, max: 1e12, step: 1 },
      { id: "rate", label: "Bunga per tahun (%)", min: 0, max: 100, step: 0.01 },
      { id: "months", label: "Tenor (bulan)", min: 1, max: 600, step: 1 }
    ],
    defaults: { principal: 50000000, rate: 12, months: 36 }
  },
  {
    id: "kpr",
    title: "Kalkulator Cicilan KPR",
    icon: "home",
    intro: "Simulasi cicilan rumah dengan uang muka dan bunga anuitas tetap.",
    method: "Pokok pinjaman adalah harga rumah dikurangi uang muka. Cicilan dihitung menggunakan rumus anuitas dengan bunga tetap sepanjang tenor.",
    fields: [
      { id: "price", label: "Harga rumah (Rp)", min: 1, max: 1e12, step: 1 },
      { id: "down", label: "Uang muka (Rp)", min: 0, max: 1e12, step: 1 },
      { id: "rate", label: "Bunga per tahun (%)", min: 0, max: 100, step: 0.01 },
      { id: "years", label: "Tenor (tahun)", min: 1, max: 50, step: 1 }
    ],
    defaults: { price: 500000000, down: 100000000, rate: 8, years: 15 }
  },
  {
    id: "usaha",
    title: "Kalkulator Margin Usaha",
    icon: "chart",
    intro: "Hitung laba, margin, dan markup dari biaya serta harga jual.",
    method: "Laba adalah harga jual dikurangi biaya. Margin membagi laba dengan harga jual; markup membagi laba dengan biaya.",
    fields: [
      { id: "cost", label: "Biaya per unit (Rp)", min: 0, max: 1e12, step: 1 },
      { id: "price", label: "Harga jual per unit (Rp)", min: 1, max: 1e12, step: 1 },
      { id: "quantity", label: "Jumlah unit", min: 0, max: 1e9, step: 1 }
    ],
    defaults: { cost: 30000, price: 50000, quantity: 100 }
  },
  {
    id: "gaji",
    title: "Kalkulator Gaji Bersih",
    icon: "users",
    intro: "Simulasi gaji bersih dengan potongan yang Anda masukkan sendiri.",
    method: "Gaji bersih dihitung dengan mengurangi gaji kotor dengan total potongan yang dimasukkan pengguna.",
    fields: [
      { id: "gross", label: "Gaji kotor (Rp)", min: 0, max: 1e12, step: 1 },
      { id: "deductions", label: "Total potongan (Rp)", min: 0, max: 1e12, step: 1 }
    ],
    defaults: { gross: 10000000, deductions: 500000 }
  },
  {
    id: "konstruksi",
    title: "Kalkulator Kebutuhan Keramik",
    icon: "grid",
    intro: "Estimasi jumlah ubin berdasarkan ukuran ruangan dan ubin.",
    method: "Luas ruangan dibagi luas satu ubin, ditambah persentase cadangan, lalu dibulatkan ke atas.",
    fields: [
      { id: "length", label: "Panjang ruangan (m)", min: 0.01, max: 1000, step: 0.01 },
      { id: "width", label: "Lebar ruangan (m)", min: 0.01, max: 1000, step: 0.01 },
      { id: "tileLength", label: "Panjang ubin (cm)", min: 1, max: 500, step: 0.1 },
      { id: "tileWidth", label: "Lebar ubin (cm)", min: 1, max: 500, step: 0.1 },
      { id: "reserve", label: "Cadangan (%)", min: 0, max: 100, step: 0.1 }
    ],
    defaults: { length: 4, width: 3, tileLength: 40, tileWidth: 40, reserve: 10 }
  }
];

const ENGINE_MAP = Object.fromEntries(ENGINES.map(engine => [engine.id, engine]));

// ============================================================
// PRESET: 400 + 200 + 150 + 150 + 120 = 1.020
// ============================================================

function generatePresets() {
  const items = [];

  function add(type, slug, title, values, scenario) {
    items.push({
      type: "preset",
      engine: type,
      path: type + "/" + slug + "/",
      title,
      values,
      scenario,
      indexable: INDEX_PRESETS
    });
  }

  // 20 nominal × 20 tenor = 400
  for (let amount = 1; amount <= 20; amount++) {
    for (let tenor = 1; tenor <= 20; tenor++) {
      const principal = amount * 5000000;
      const months = tenor * 6;

      add(
        "pinjaman",
        "pinjaman-" + principal + "-tenor-" + months,
        "Simulasi Pinjaman Rp" + principal.toLocaleString("id-ID") +
          " Tenor " + months + " Bulan",
        { principal, rate: 12, months },
        "Contoh pinjaman dengan bunga 12% per tahun. Bunga ini hanya angka simulasi, bukan tarif resmi."
      );
    }
  }

  // 20 harga × 10 tenor = 200
  for (let priceIndex = 1; priceIndex <= 20; priceIndex++) {
    for (let years = 1; years <= 10; years++) {
      const price = priceIndex * 100000000;
      const down = price * 0.2;

      add(
        "kpr",
        "rumah-" + price + "-tenor-" + years,
        "Simulasi KPR Rumah Rp" + price.toLocaleString("id-ID") +
          " Tenor " + years + " Tahun",
        { price, down, rate: 8, years },
        "Contoh uang muka 20% dan bunga 8% per tahun. Angka bukan penawaran bank."
      );
    }
  }

  // 15 biaya × 10 harga = 150
  for (let costIndex = 1; costIndex <= 15; costIndex++) {
    for (let multiplier = 1; multiplier <= 10; multiplier++) {
      const cost = costIndex * 10000;
      const price = cost + multiplier * 5000;

      add(
        "usaha",
        "biaya-" + cost + "-harga-" + price,
        "Margin Usaha: Biaya Rp" + cost.toLocaleString("id-ID") +
          " dan Harga Rp" + price.toLocaleString("id-ID"),
        { cost, price, quantity: 100 },
        "Contoh biaya dan harga jual per unit. Masukkan biaya sebenarnya untuk simulasi usaha Anda."
      );
    }
  }

  // 15 gaji × 10 potongan = 150
  for (let grossIndex = 1; grossIndex <= 15; grossIndex++) {
    for (let deductionIndex = 0; deductionIndex < 10; deductionIndex++) {
      const gross = grossIndex * 2000000;
      const deductions = gross * deductionIndex / 100;

      add(
        "gaji",
        "gaji-" + gross + "-potongan-" + deductionIndex + "-persen",
        "Simulasi Gaji Rp" + gross.toLocaleString("id-ID") +
          " dengan Potongan Contoh " + deductionIndex + "%",
        { gross, deductions },
        "Potongan adalah contoh input pengguna, bukan hasil perhitungan PPh 21 atau BPJS."
      );
    }
  }

  // 12 panjang × 10 lebar = 120
  for (let length = 1; length <= 12; length++) {
    for (let width = 1; width <= 10; width++) {
      add(
        "konstruksi",
        "keramik-ruangan-" + length + "x" + width + "-meter",
        "Kebutuhan Keramik Ruangan " + length + " × " + width + " Meter",
        {
          length,
          width,
          tileLength: 40,
          tileWidth: 40,
          reserve: 10
        },
        "Contoh menggunakan ubin 40 × 40 cm dan cadangan 10%. Ubah sesuai produk dan kondisi lapangan."
      );
    }
  }

  return items;
}

// ============================================================
// SVG
// ============================================================

const SVG = {
  logo: '<rect x="4" y="2" width="16" height="20" rx="4"/><path d="M8 6h8v4H8zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
  home: '<path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9 21v-7h6v7"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  book: '<path d="M4 4.5C7 3 9.5 3.5 12 5v15c-2.5-1.5-5-2-8-.5zM20 4.5C17 3 14.5 3.5 12 5v15c2.5-1.5 5-2 8-.5z"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M20 14v5H5V4h5"/>',
  wallet: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 9h18M7 15h4"/>',
  chart: '<path d="M4 20h16M6 16v-4M12 16V8M18 16V4"/>',
  users: '<circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/>'
};

function icon(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true">' + (SVG[name] || SVG.grid) + "</svg>";
}

const FAVICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" rx="18" fill="#123d35"/>' +
  '<rect x="17" y="10" width="30" height="44" rx="6" fill="none" stroke="#fff" stroke-width="3"/>' +
  '<rect x="22" y="16" width="20" height="8" rx="2" fill="#9de5c5"/>' +
  '<g fill="#fff"><circle cx="23" cy="32" r="2.5"/><circle cx="32" cy="32" r="2.5"/>' +
  '<circle cx="41" cy="32" r="2.5"/><circle cx="23" cy="42" r="2.5"/>' +
  '<circle cx="32" cy="42" r="2.5"/><circle cx="41" cy="42" r="2.5"/></g></svg>';

// ============================================================
// CSS
// ============================================================

const CSS = `
:root {
  --ink:#102c28;
  --text:#344a46;
  --muted:#61746f;
  --brand:#087b5d;
  --brand-dark:#07533f;
  --line:#dce8e3;
  --bg:#f4f8f6;
  --white:#fff;
  --soft:#e8f7ef;
  --shadow:0 16px 42px rgba(15,55,44,.07);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--brand-dark)}
svg{width:22px;height:22px;flex:none}
.wrap{width:min(1120px,calc(100% - 32px));margin:auto}
.skip{position:absolute;left:-9999px;top:8px;background:white;padding:10px;z-index:100}
.skip:focus{left:8px}
:focus-visible{outline:3px solid #38b98c;outline-offset:3px}
header{background:rgba(255,255,255,.96);border-bottom:1px solid var(--line)}
.topbar{min-height:76px;display:flex;align-items:center;justify-content:space-between;gap:18px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);font-weight:850;letter-spacing:-.03em}
.brand-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;background:var(--ink);color:white}
.top-links{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
.top-links a{text-decoration:none;font-size:.9rem;font-weight:650}
main{min-height:65vh;padding-bottom:70px}
.hero{padding:56px 0 32px;max-width:760px}
.badge{display:inline-block;background:#dff5e9;color:#07533f;border-radius:999px;padding:5px 12px;font-size:.75rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
h1,h2,h3{color:var(--ink);line-height:1.2}
h1{font-size:clamp(2rem,5vw,3.5rem);letter-spacing:-.045em;margin:18px 0}
h2{font-size:1.4rem;letter-spacing:-.025em}
h3{font-size:1.05rem}
.lead{color:var(--muted);font-size:1.05rem;max-width:70ch}
.section{padding:12px 0 38px}
.section-head{display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.card{background:white;border:1px solid var(--line);border-radius:20px;padding:22px;box-shadow:var(--shadow)}
.tool-card{display:flex;flex-direction:column;text-decoration:none;color:inherit;min-height:210px;transition:transform .15s,border-color .15s}
.tool-card:hover{transform:translateY(-3px);border-color:#7acbac}
.tool-icon{display:grid;place-items:center;width:48px;height:48px;border-radius:15px;background:var(--soft);color:var(--brand)}
.tool-card h3{margin:16px 0 7px}
.tool-card p{color:var(--muted);font-size:.92rem;margin:0 0 16px}
.tool-link{margin-top:auto;font-weight:750;color:var(--brand-dark);font-size:.9rem}
.search-box{position:relative;max-width:600px;margin-top:24px}
.search-box svg{position:absolute;left:15px;top:15px;color:var(--muted)}
input{font:inherit}
.search-box input{width:100%;padding:13px 14px 13px 46px;border:1px solid #b7cbc2;border-radius:14px;background:white}
.search-results{list-style:none;padding:0;margin:12px 0}
.search-results li{padding:9px 0;border-bottom:1px solid var(--line)}
.tool-hero{padding:32px 0 20px;max-width:800px}
.back{text-decoration:none;color:var(--muted);font-size:.9rem}
.tool-layout{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}
.field{margin:15px 0}
.field label{display:block;font-weight:700;font-size:.9rem;color:var(--ink);margin-bottom:6px}
.field input{width:100%;border:1px solid #b7cbc2;border-radius:11px;padding:11px 12px;background:white}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}
button,.button{font:inherit;font-weight:700;border-radius:11px;padding:10px 14px;border:1px solid var(--brand);background:var(--brand);color:white;cursor:pointer;min-height:44px}
button.secondary{background:white;color:var(--brand-dark)}
button:hover{filter:brightness(.96)}
.result-card{background:linear-gradient(145deg,#103d33,#08664e);color:#e8fff4;border:0}
.result-card h2{color:white}
.result-list{margin:0}
.result-row{display:flex;justify-content:space-between;gap:14px;border-top:1px solid rgba(255,255,255,.2);padding:12px 0}
.result-row:first-child{border:0}
.result-row dt{color:#c5ebd8}
.result-row dd{margin:0;text-align:right;color:white;font-weight:800}
.notice{background:#eaf8f0;border:1px solid #bde8cf;border-radius:15px;padding:16px 18px;margin:20px 0;font-size:.92rem}
.error{color:#a40025;font-weight:700}
.table-wrap{overflow-x:auto;margin-top:16px}
table{border-collapse:collapse;width:100%;font-size:.85rem}
th,td{padding:8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left}
details{margin-top:14px}
summary{cursor:pointer;font-weight:700}
.link-list{padding-left:20px}
.link-list li{margin:7px 0}
footer{background:white;border-top:1px solid var(--line);padding:28px 0;color:var(--muted);font-size:.9rem}
.footer-links{display:flex;flex-wrap:wrap;gap:8px 16px}
.bottom-nav{display:none}
[hidden]{display:none!important}
@media(max-width:760px){
  .top-links{display:none}
  .hero{padding-top:38px}
  .grid,.tool-layout{grid-template-columns:1fr}
  .tool-card{min-height:0}
  body{padding-bottom:calc(76px + env(safe-area-inset-bottom))}
  .bottom-nav{position:fixed;z-index:20;bottom:0;left:0;right:0;display:grid;grid-template-columns:repeat(5,1fr);background:white;border-top:1px solid var(--line);padding:6px 4px calc(6px + env(safe-area-inset-bottom))}
  .bottom-nav a{display:flex;min-height:52px;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-decoration:none;color:var(--muted);font-size:.67rem;font-weight:700}
  .bottom-nav a[aria-current="page"]{color:var(--brand-dark)}
  .bottom-nav svg{width:21px;height:21px}
  .result-row{flex-direction:column;gap:3px}
  .result-row dd{text-align:left}
}
@media(prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .tool-card{transition:none}
}
@media print{
  header,footer,.bottom-nav,.actions,.back{display:none!important}
  body{background:white;padding:0}
  .card{box-shadow:none}
  .result-card{background:white;color:black;border:1px solid #aaa}
  .result-card h2,.result-row dd,.result-row dt{color:black}
}
`;

// ============================================================
// JAVASCRIPT BROWSER
// ============================================================

function browserApp(core) {
  "use strict";

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  const search = document.getElementById("search");
  const searchResults = document.getElementById("search-results");
  const searchStatus = document.getElementById("search-status");

  if (search && window.LIFE_INDEX) {
    search.addEventListener("input", function () {
      const query = search.value.trim().toLowerCase();
      searchResults.textContent = "";

      if (!query) {
        searchStatus.textContent = "";
        return;
      }

      const terms = query.split(/\s+/);

      const matches = window.LIFE_INDEX.filter(item =>
        terms.every(term => item.title.toLowerCase().includes(term))
      );

      searchStatus.textContent =
        matches.length + " hasil ditemukan. Maksimal 30 ditampilkan.";

      matches.slice(0, 30).forEach(item => {
        const li = element("li");
        const link = element("a", item.title);
        link.href = "./" + item.path;
        li.appendChild(link);
        searchResults.appendChild(li);
      });
    });
  }

  const form = document.getElementById("calculator-form");
  if (!form) return;

  const config = JSON.parse(document.getElementById("calculator-config").textContent);
  const resultBox = document.getElementById("result");
  const errorBox = document.getElementById("error");
  const tableBox = document.getElementById("table");
  const status = document.getElementById("status");

  let lastSummary = [];

  function update() {
    const values = {};

    config.fields.forEach(field => {
      values[field] = document.getElementById("field-" + field).value;
    });

    try {
      const calculated = core.calculate(config.type, values);
      errorBox.textContent = "";
      resultBox.textContent = "";
      tableBox.textContent = "";
      lastSummary = calculated.summary;

      const list = element("dl");
      list.className = "result-list";

      calculated.summary.forEach(item => {
        const row = element("div", undefined, "result-row");
        row.appendChild(element("dt", item[0]));
        row.appendChild(element("dd", item[1]));
        list.appendChild(row);
      });

      resultBox.appendChild(list);

      if (calculated.note) {
        tableBox.appendChild(element("p", calculated.note, "lead"));
      }

      if (calculated.rows.length) {
        const details = element("details");
        details.appendChild(element("summary", "Lihat tabel angsuran"));

        const wrapper = element("div", undefined, "table-wrap");
        const table = element("table");
        const caption = element("caption", "Rincian angsuran bulanan");
        const head = element("thead");
        const headRow = element("tr");

        ["Bulan", "Angsuran", "Bunga", "Pokok", "Sisa pokok"].forEach(text => {
          const th = element("th", text);
          th.scope = "col";
          headRow.appendChild(th);
        });

        head.appendChild(headRow);
        table.appendChild(caption);
        table.appendChild(head);

        const body = element("tbody");
        const money = value => new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
          maximumFractionDigits: 0
        }).format(value);

        calculated.rows.forEach(row => {
          const tr = element("tr");
          [
            row.month,
            money(row.payment),
            money(row.interest),
            money(row.principal),
            money(row.balance)
          ].forEach(value => tr.appendChild(element("td", String(value))));
          body.appendChild(tr);
        });

        table.appendChild(body);
        wrapper.appendChild(table);
        details.appendChild(wrapper);
        tableBox.appendChild(details);
      }
    } catch (error) {
      resultBox.textContent = "";
      tableBox.textContent = "";
      lastSummary = [];
      errorBox.textContent = error.message;
    }
  }

  form.addEventListener("input", update);
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    update();
  });

  document.getElementById("reset").addEventListener("click", function () {
    config.fields.forEach(field => {
      document.getElementById("field-" + field).value = config.defaults[field];
    });
    update();
    status.textContent = "Nilai awal dikembalikan.";
  });

  document.getElementById("print").addEventListener("click", function () {
    window.print();
  });

  document.getElementById("copy").addEventListener("click", async function () {
    if (!lastSummary.length) {
      status.textContent = "Perbaiki input terlebih dahulu.";
      return;
    }

    const text = lastSummary.map(item => item[0] + ": " + item[1]).join("\n");

    try {
      await navigator.clipboard.writeText(text);
      status.textContent = "Hasil berhasil disalin.";
    } catch (_) {
      status.textContent = "Gagal menyalin. Anda dapat menyalin hasil secara manual.";
    }
  });

  update();
}

const APP_JS =
  "(function(){const core=(" + createCalculatorCore.toString() +
  ")();(" + browserApp.toString() + ")(core);})();\n";

// ============================================================
// PEMBUATAN HALAMAN
// ============================================================

const pages = [];
const presets = generatePresets();

function navigation(root, active) {
  const items = [
    ["Beranda", root, "home", active === "home"],
    ["Kategori", root + "kategori/", "grid", active === "kategori"],
    ["Cari", root + "#cari", "search", false],
    ["Panduan", root + "panduan/", "book", active === "panduan"],
    ["Mainilmu", "https://www.mainilmu.pro/", "external", false]
  ];

  return items.map(item =>
    '<a href="' + escapeHtml(item[1]) + '"' +
    (item[3] ? ' aria-current="page"' : "") + ">" +
    icon(item[2]) + "<span>" + escapeHtml(item[0]) + "</span></a>"
  ).join("");
}

function layout(page, body, extraScript) {
  const root = relativeRoot(page.path);
  const indexable = MODE === "production" && page.indexable;
  const canonical = MODE === "production"
    ? '<link rel="canonical" href="' + escapeHtml(BASE_URL + page.path) + '">'
    : "";

  const footerLinks = POLICY.map(item =>
    '<a href="' + escapeHtml(item[1]) + '">' + escapeHtml(item[0]) + "</a>"
  ).join("");

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#123d35">
  <meta name="description" content="${escapeHtml(page.description)}">
  <meta name="robots" content="${indexable ? "index,follow" : "noindex,follow"}">
  <title>${escapeHtml(page.title)} | ${SITE_NAME}</title>
  ${canonical}
  <link rel="icon" type="image/svg+xml" href="${root}favicon.svg">
  <link rel="stylesheet" href="${root}style.css">
</head>
<body>
  <a class="skip" href="#main">Lewati ke konten</a>
  <header>
    <div class="wrap topbar">
      <a class="brand" href="${root}">
        <span class="brand-icon">${icon("logo")}</span>
        <span>LIFE CALCULATOR</span>
      </a>
      <nav class="top-links" aria-label="Navigasi utama">
        <a href="${root}">Beranda</a>
        <a href="${root}kategori/">Kategori</a>
        <a href="${root}panduan/">Panduan</a>
        <a href="https://www.mainilmu.pro/">Website utama Mainilmu ↗</a>
      </nav>
    </div>
  </header>

  <main id="main">
    <div class="wrap">${body}</div>
  </main>

  <footer>
    <div class="wrap">
      <strong>${SITE_NAME}</strong>
      <p>Hasil merupakan simulasi, bukan nasihat keuangan, pajak, atau hukum.</p>
      <nav class="footer-links" aria-label="Informasi dan kebijakan">
        ${footerLinks}
        <a href="mailto:${EMAIL}">${EMAIL}</a>
        <a href="${root}peta-situs/">Peta situs</a>
      </nav>
    </div>
  </footer>

  <nav class="bottom-nav" aria-label="Navigasi mobile">
    ${navigation(root, page.active || "")}
  </nav>

  ${extraScript || ""}
  <script src="${root}app.js" defer></script>
</body>
</html>`;
}

function addPage(page, body, extraScript) {
  page.html = layout(page, body, extraScript);
  pages.push(page);
}

function card(engine, root) {
  return `<a class="card tool-card" href="${root}${engine.id}/">
    <span class="tool-icon">${icon(engine.icon)}</span>
    <h3>${escapeHtml(engine.title)}</h3>
    <p>${escapeHtml(engine.intro)}</p>
    <span class="tool-link">Buka kalkulator →</span>
  </a>`;
}

function renderSummary(summary) {
  return '<dl class="result-list">' + summary.map(item =>
    '<div class="result-row"><dt>' + escapeHtml(item[0]) +
    '</dt><dd>' + escapeHtml(item[1]) + "</dd></div>"
  ).join("") + "</dl>";
}

function calculatorPage(page) {
  const engine = ENGINE_MAP[page.engine];
  const root = relativeRoot(page.path);
  const calculated = CORE.calculate(page.engine, page.values);

  const fields = engine.fields.map(field =>
    '<div class="field">' +
    '<label for="field-' + field.id + '">' + escapeHtml(field.label) + "</label>" +
    '<input id="field-' + field.id + '" name="' + field.id +
    '" type="number" inputmode="decimal" min="' + field.min +
    '" max="' + field.max + '" step="' + field.step +
    '" value="' + escapeHtml(page.values[field.id]) + '">' +
    "</div>"
  ).join("");

  const related = ENGINES.filter(item => item.id !== engine.id)
    .slice(0, 3)
    .map(item =>
      '<li><a href="' + root + item.id + '/">' +
      escapeHtml(item.title) + "</a></li>"
    ).join("");

  const body = `
    <section class="tool-hero">
      <a class="back" href="${root}">← Semua kalkulator</a>
      <p><span class="badge">Simulasi interaktif</span></p>
      <h1>${escapeHtml(page.title)}</h1>
      <p class="lead">${escapeHtml(page.scenario || engine.intro)}</p>
    </section>

    <div class="tool-layout">
      <section class="card">
        <h2>Masukkan angka</h2>
        <p class="lead">Hasil diperbarui saat angka berubah.</p>

        <form id="calculator-form">
          ${fields}
          <p id="error" class="error" role="alert"></p>
          <div class="actions">
            <button type="submit">Hitung</button>
            <button type="button" class="secondary" id="reset">Reset</button>
          </div>
        </form>
      </section>

      <section class="card result-card">
        <h2>Hasil simulasi</h2>
        <div id="result" aria-live="polite">
          ${renderSummary(calculated.summary)}
        </div>
      </section>
    </div>

    <div class="actions">
      <button type="button" class="secondary" id="copy">Salin hasil</button>
      <button type="button" class="secondary" id="print">Cetak</button>
    </div>
    <p id="status" role="status"></p>

    <noscript>
      <div class="notice">
        Hasil awal tetap ditampilkan. Aktifkan JavaScript untuk mengubah angka.
      </div>
    </noscript>

    <section class="card section">
      <h2>Rincian dan asumsi</h2>
      <div id="table"><p>${escapeHtml(calculated.note)}</p></div>
      <h3>Cara perhitungan</h3>
      <p>${escapeHtml(engine.method)}</p>
    </section>

    <div class="notice">
      Hasil adalah estimasi berdasarkan input, bukan penawaran atau nasihat
      profesional. Periksa angka dan ketentuan sebenarnya sebelum mengambil keputusan.
    </div>

    <section class="section">
      <h2>Kalkulator lainnya</h2>
      <ul class="link-list">${related}</ul>
    </section>

    <script type="application/json" id="calculator-config">${
      escapeJson({
        type: engine.id,
        fields: engine.fields.map(field => field.id),
        defaults: page.values
      })
    }</script>
  `;

  addPage(page, body);
}

// ============================================================
// PENGUJIAN RUMUS
// ============================================================

function testCore() {
  const loan = CORE.calculate("pinjaman", {
    principal: 12000000,
    rate: 0,
    months: 12
  });

  assert(
    Math.abs(loan.rows[0].payment - 1000000) < 0.001,
    "Pinjaman bunga 0% menghasilkan Rp1.000.000 per bulan"
  );

  const margin = CORE.calculate("usaha", {
    cost: 30000,
    price: 50000,
    quantity: 1
  });

  assert(
    margin.summary[1][1] === "40%",
    "Margin Rp30.000 ke Rp50.000 adalah 40%"
  );

  assert(
    margin.summary[2][1] === "66,67%",
    "Markup Rp30.000 ke Rp50.000 adalah 66,67%"
  );

  [
    [1, 0, 600],
    [1000, 100, 600],
    [50000000, 12, 36],
    [1000000000, 8, 240]
  ].forEach(test => {
    const rows = CORE.schedule(test[0], test[1], test[2]);
    const principalTotal = rows.reduce((sum, row) => sum + row.principal, 0);

    assert(
      rows.every(row =>
        Number.isFinite(row.payment) &&
        row.balance >= 0 &&
        row.principal >= 0
      ) &&
      Math.abs(rows[rows.length - 1].balance) < 0.01 &&
      Math.abs(principalTotal - test[0]) < 0.01,
      "Jadwal valid: pokok " + test[0] +
        ", bunga " + test[1] + ", tenor " + test[2]
    );
  });

  const tiles = CORE.calculate("konstruksi", {
    length: 3,
    width: 3,
    tileLength: 30,
    tileWidth: 30,
    reserve: 0
  });

  assert(
    tiles.summary[0][1] === "100 buah",
    "Keramik 3 × 3 m dengan ubin 30 × 30 cm menghasilkan 100 ubin"
  );
}

// ============================================================
// BUILD
// ============================================================

function build() {
  testCore();

  assert(presets.length === 1020, "Jumlah preset adalah 1.020");

  const presetPaths = presets.map(page => page.path);
  assert(
    new Set(presetPaths).size === presetPaths.length,
    "Tidak ada URL preset duplikat"
  );

  presets.forEach(page => CORE.calculate(page.engine, page.values));
  assert(true, "Seluruh preset memiliki input yang dapat dihitung");

  // Beranda
  addPage(
    {
      path: "",
      title: "Direktori Kalkulator",
      description: "Simulasi pinjaman, KPR, usaha, gaji, dan kebutuhan keramik.",
      indexable: true,
      active: "home"
    },
    `
      <section class="hero">
        <span class="badge">Simulasi praktis</span>
        <h1>Hitung lebih mudah. Rencanakan lebih matang.</h1>
        <p class="lead">
          Kalkulator untuk membantu Anda membuat estimasi berdasarkan
          angka dan asumsi Anda sendiri.
        </p>
        <div class="search-box" id="cari">
          ${icon("search")}
          <input id="search" type="search" placeholder="Cari kalkulator atau skenario..."
            aria-label="Cari kalkulator">
        </div>
        <p id="search-status" role="status"></p>
        <ul class="search-results" id="search-results"></ul>
      </section>
      <section class="section">
        <div class="section-head">
          <h2>Kalkulator utama</h2>
          <a href="./kategori/">Lihat kategori →</a>
        </div>
        <div class="grid">${ENGINES.map(engine => card(engine, "./")).join("")}</div>
      </section>
      <div class="notice">
        Bunga, biaya, dan potongan contoh bukan tarif resmi. Semua hasil adalah estimasi.
      </div>
    `,
    '<script src="./search-index.js" defer></script>'
  );

  // Kategori
  addPage(
    {
      path: "kategori/",
      title: "Kategori Kalkulator",
      description: "Jelajahi kategori kalkulator LIFE CALCULATOR.",
      indexable: true,
      active: "kategori"
    },
    `
      <section class="hero">
        <span class="badge">Direktori</span>
        <h1>Kategori kalkulator</h1>
        <p class="lead">Pilih kalkulator sesuai kebutuhan Anda.</p>
      </section>
      <div class="grid">${ENGINES.map(engine => card(engine, "../")).join("")}</div>
    `
  );

  // Panduan
  addPage(
    {
      path: "panduan/",
      title: "Panduan dan Metodologi",
      description: "Pelajari metode dan batasan kalkulator LIFE CALCULATOR.",
      indexable: true,
      active: "panduan"
    },
    `
      <section class="hero">
        <span class="badge">Transparansi</span>
        <h1>Panduan dan metodologi</h1>
        <p class="lead">
          Semua angka contoh dapat diubah. Hasil bergantung pada input dan asumsi.
        </p>
      </section>
      ${ENGINES.map(engine => `
        <section class="card section">
          <h2><a href="../${engine.id}/">${escapeHtml(engine.title)}</a></h2>
          <p>${escapeHtml(engine.method)}</p>
        </section>
      `).join("")}
      <div class="notice">
        Situs ini tidak menghitung PPh 21, BPJS, atau pesangon menurut peraturan.
        Konsultasikan kepada profesional jika keputusan membutuhkan kepastian.
      </div>
    `
  );

  // Lima kalkulator utama
  ENGINES.forEach(engine => {
    calculatorPage({
      path: engine.id + "/",
      title: engine.title,
      description: engine.intro,
      engine: engine.id,
      values: engine.defaults,
      scenario: engine.intro,
      indexable: true
    });
  });

  // Preset
  presets.forEach(page => {
    page.description = page.title + ". " + page.scenario;
    calculatorPage(page);
  });

  // Peta situs pengunjung
  const sitemapGroups = ENGINES.map(engine => {
    const items = presets.filter(page => page.engine === engine.id);

    return `
      <section>
        <h2><a href="../${engine.id}/">${escapeHtml(engine.title)}</a></h2>
        <details>
          <summary>Lihat ${items.length} skenario</summary>
          <ul class="link-list">
            ${items.map(page =>
              '<li><a href="../' + escapeHtml(page.path) + '">' +
              escapeHtml(page.title) + "</a></li>"
            ).join("")}
          </ul>
        </details>
      </section>
    `;
  }).join("");

  addPage(
    {
      path: "peta-situs/",
      title: "Peta Situs",
      description: "Daftar kalkulator dan skenario LIFE CALCULATOR.",
      indexable: false
    },
    `
      <section class="hero">
        <span class="badge">Direktori</span>
        <h1>Peta situs</h1>
        <p class="lead">Daftar kalkulator utama dan skenario contoh.</p>
      </section>
      ${sitemapGroups}
    `
  );

  const allPaths = pages.map(page => page.path);

  assert(
    new Set(allPaths).size === allPaths.length,
    "Tidak ada URL halaman duplikat"
  );

  // Hapus dist hanya setelah data dan tes dasar selesai.
  if (path.basename(DIST) !== "dist" || path.dirname(DIST) !== __dirname) {
    throw new Error("Lokasi dist tidak aman.");
  }

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  write("style.css", CSS);
  write("app.js", APP_JS);
  write("favicon.svg", FAVICON);
  write(".nojekyll", "");

  const searchIndex = presets.concat(
    ENGINES.map(engine => ({
      title: engine.title,
      path: engine.id + "/"
    }))
  ).map(item => ({ title: item.title, path: item.path }));

  write(
    "search-index.js",
    "window.LIFE_INDEX=" + escapeJson(searchIndex) + ";\n"
  );

  pages.forEach(page => {
    const filename = page.path ? page.path + "index.html" : "index.html";
    write(filename, page.html);
  });

  const indexablePages = MODE === "production"
    ? pages.filter(page => page.indexable)
    : [];

  if (MODE === "production") {
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexablePages.map(page =>
  "  <url><loc>" + escapeHtml(BASE_URL + page.path) + "</loc></url>"
).join("\n")}
</urlset>
`;

    write("sitemap.xml", sitemap);
    write(
      "robots.txt",
      "User-agent: *\nAllow: /\nSitemap: " + BASE_URL + "sitemap.xml\n"
    );
  } else {
    /*
     * Pada GitHub Pages project site, robots.txt di subpath bukan robots.txt
     * root host. Preview menggunakan meta noindex dan tidak membuat sitemap.
     */
    write(
      "robots.txt",
      "# Preview: halaman menggunakan meta noindex.\nUser-agent: *\nAllow: /\n"
    );
  }

  // Verifikasi file hasil build.
  ["index.html", "style.css", "app.js", "favicon.svg", "search-index.js"]
    .forEach(file => {
      assert(
        fs.existsSync(path.join(DIST, file)),
        "File tersedia: " + file
      );
    });

  pages.forEach(page => {
    const filename = page.path ? page.path + "index.html" : "index.html";

    if (!fs.existsSync(path.join(DIST, filename))) {
      throw new Error("Halaman tidak tertulis: " + filename);
    }
  });

  if (MODE === "preview") {
    assert(
      pages.every(page => page.html.includes('content="noindex,follow"')),
      "Semua halaman preview memiliki noindex"
    );

    assert(
      !fs.existsSync(path.join(DIST, "sitemap.xml")),
      "Sitemap preview tidak dibuat"
    );
  } else {
    assert(
      indexablePages.every(page =>
        page.html.includes('content="index,follow"') &&
        page.html.includes('<link rel="canonical"')
      ),
      "Halaman sitemap produksi memiliki index dan canonical"
    );
  }

  console.log("\n=== LAPORAN BUILD ===");
  console.log("Mode: " + MODE);
  console.log("Mesin kalkulator: " + ENGINES.length);
  console.log("Halaman preset: " + presets.length);
  console.log("Total halaman HTML: " + pages.length);
  console.log("URL sitemap produksi: " + indexablePages.length);
  console.log("Preset indexable: " + INDEX_PRESETS);
  console.log("Output: " + DIST);
}

build();
