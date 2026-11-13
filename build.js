const fs = require("fs");
const path = require("path");

const SITE = "https://calculator.mainilmu.pro";
const DIST = path.join(__dirname, "dist");

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

function write(relativePath, content) {
  const target = path.join(DIST, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

const icons = {
  calculator: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">
      <rect x="4" y="2.5" width="16" height="19" rx="3"/>
      <path d="M8 6.5h8v3H8zM8 13h.01M12 13h.01M16 13h.01
        M8 17h.01M12 17h.01M16 17h.01"/>
    </svg>
  `,
  loan: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3"/>
      <path d="M3 9h18M7 15h4"/>
    </svg>
  `,
  home: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">
      <path d="m3 10 9-7 9 7M5 9v11h14V9M9 20v-6h6v6"/>
    </svg>
  `,
  chart: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">
      <path d="M4 20h16M6 16v-4M12 16V8M18 16V4"/>
      <circle cx="6" cy="10" r="1"/>
      <circle cx="12" cy="6" r="1"/>
      <circle cx="18" cy="2" r="1"/>
    </svg>
  `,
  arrow: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6"/>
    </svg>
  `,
  search: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5"/>
      <path d="m16 16 4 4"/>
    </svg>
  `
};

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#172554"/>
  <rect x="16" y="10" width="32" height="44" rx="6"
    fill="none" stroke="#fff" stroke-width="3"/>
  <rect x="22" y="16" width="20" height="8" rx="2" fill="#60a5fa"/>
  <g fill="#fff">
    <circle cx="23" cy="32" r="2.5"/><circle cx="32" cy="32" r="2.5"/>
    <circle cx="41" cy="32" r="2.5"/><circle cx="23" cy="42" r="2.5"/>
    <circle cx="32" cy="42" r="2.5"/><circle cx="41" cy="42" r="2.5"/>
  </g>
</svg>`;

write("favicon.svg", favicon);

const css = `
:root {
  color-scheme: light;
  --ink: #172554;
  --text: #334155;
  --muted: #64748b;
  --line: #e2e8f0;
  --surface: #ffffff;
  --background: #f6f8fc;
  --blue: #2563eb;
  --blue-dark: #1d4ed8;
  --blue-soft: #eff6ff;
  --shadow: 0 14px 38px rgba(15, 23, 42, .06);
  --radius: 20px;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--background);
  color: var(--text);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.6;
}
a { color: var(--blue-dark); }
a:focus-visible, button:focus-visible, input:focus-visible {
  outline: 3px solid #93c5fd;
  outline-offset: 3px;
}
.container { width: min(1120px, calc(100% - 32px)); margin: 0 auto; }
.site-header {
  background: rgba(255, 255, 255, .96);
  border-bottom: 1px solid var(--line);
}
.nav {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--ink);
  text-decoration: none;
  font-weight: 800;
  letter-spacing: -.03em;
}
.brand-mark, .card-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}
.brand-mark {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--ink);
  color: white;
}
.brand-mark svg { width: 23px; height: 23px; }
.nav-link { color: var(--muted); font-size: .9rem; text-decoration: none; }
.nav-link:hover { color: var(--blue); }
main { min-height: 65vh; }
.hero {
  padding: 64px 0 34px;
  max-width: 760px;
}
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 11px;
  color: #1d4ed8;
  background: #dbeafe;
  border-radius: 999px;
  font-size: .76rem;
  font-weight: 800;
  letter-spacing: .04em;
  text-transform: uppercase;
}
h1, h2, h3 { color: var(--ink); line-height: 1.2; }
h1 {
  margin: 18px 0 14px;
  font-size: clamp(2rem, 5vw, 3.5rem);
  letter-spacing: -.045em;
}
h2 { font-size: 1.35rem; letter-spacing: -.02em; }
h3 { font-size: 1.05rem; }
.hero p { max-width: 640px; font-size: 1.08rem; color: var(--muted); }
.search-wrap { position: relative; max-width: 600px; margin-top: 26px; }
.search-wrap svg {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  color: var(--muted);
}
input[type="search"], input[type="number"] {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #fff;
  color: #0f172a;
  font: inherit;
  min-height: 50px;
}
input[type="search"] { padding: 12px 16px 12px 46px; box-shadow: var(--shadow); }
input[type="number"] { padding: 11px 13px; }
input:hover { border-color: #94a3b8; }
.section { padding: 8px 0 64px; }
.section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}
.section-head h2 { margin: 0; }
.section-head p { margin: 0; color: var(--muted); font-size: .9rem; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.tool-card, .panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.tool-card {
  display: flex;
  flex-direction: column;
  min-height: 220px;
  padding: 24px;
  color: inherit;
  text-decoration: none;
  transition: transform .18s ease, border-color .18s ease;
}
.tool-card:hover { transform: translateY(-3px); border-color: #93c5fd; }
.card-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  color: var(--blue-dark);
  background: var(--blue-soft);
}
.card-icon svg { width: 25px; height: 25px; }
.tool-card h3 { margin: 18px 0 8px; }
.tool-card p { color: var(--muted); margin: 0 0 18px; font-size: .94rem; }
.card-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: auto;
  color: var(--blue-dark);
  font-size: .9rem;
  font-weight: 750;
}
.card-link svg { width: 17px; height: 17px; }
.empty {
  padding: 24px;
  background: white;
  border: 1px dashed #cbd5e1;
  border-radius: 14px;
  color: var(--muted);
}
.tool-hero { padding: 36px 0 24px; max-width: 760px; }
.back { display: inline-block; color: var(--muted); text-decoration: none; font-size: .9rem; }
.back:hover { color: var(--blue); }
.tool-hero h1 { font-size: clamp(2rem, 4vw, 2.8rem); margin-top: 20px; }
.tool-hero p { color: var(--muted); margin-bottom: 0; }
.tool-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
  padding-bottom: 28px;
}
.panel { padding: 26px; }
.panel h2 { margin: 0 0 8px; }
.panel-intro { color: var(--muted); margin: 0 0 22px; font-size: .92rem; }
.field { margin-top: 18px; }
.field label { display: block; color: #1e293b; font-weight: 700; font-size: .92rem; }
.field input { margin-top: 7px; }
.hint { display: block; color: var(--muted); font-size: .8rem; margin-top: 5px; }
.result-panel {
  background: linear-gradient(145deg, #172554, #1e3a8a);
  color: #dbeafe;
  border: 0;
}
.result-panel h2 { color: #fff; }
.result-label { color: #bfdbfe; font-size: .9rem; margin-top: 24px; }
.result-main {
  color: #fff;
  font-size: clamp(1.7rem, 4vw, 2.4rem);
  font-weight: 800;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.result-list { margin: 24px 0 0; padding: 0; }
.result-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  border-top: 1px solid rgba(255,255,255,.18);
  padding: 12px 0;
}
.result-row dt { color: #bfdbfe; }
.result-row dd { margin: 0; color: white; text-align: right; font-weight: 700; }
.result-error { color: #fff; font-weight: 700; }
.notice {
  padding: 18px 20px;
  border: 1px solid #bfdbfe;
  border-radius: 14px;
  background: #eff6ff;
  color: #1e3a8a;
  font-size: .9rem;
}
.notice strong { color: #172554; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 0 0 60px; }
.info-grid .panel { box-shadow: none; }
.info-grid p, .info-grid li { color: var(--muted); font-size: .94rem; }
.related { padding-bottom: 64px; }
.related .grid { grid-template-columns: repeat(2, 1fr); }
.site-footer { border-top: 1px solid var(--line); background: white; }
.footer-inner {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 24px 0;
  color: var(--muted);
  font-size: .85rem;
}
[hidden] { display: none !important; }
@media (max-width: 760px) {
  .grid { grid-template-columns: 1fr; }
  .tool-layout, .info-grid, .related .grid { grid-template-columns: 1fr; }
  .hero { padding-top: 44px; }
  .tool-card { min-height: 0; }
  .panel { padding: 21px; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .tool-card { transition: none; }
}
`;

write("style.css", css);

const pages = [
  {
    slug: "pinjaman",
    title: "Kalkulator Cicilan Pinjaman",
    short: "Pinjaman",
    description: "Perkirakan angsuran bulanan, total pembayaran, dan bunga dengan metode anuitas.",
    icon: "loan",
    category: "Keuangan",
    fields: `
      <div class="field">
        <label for="principal">Jumlah pinjaman</label>
        <input id="principal" type="number" inputmode="decimal"
          min="1" max="1000000000000" step="1" value="50000000">
        <span class="hint">Masukkan nominal dalam rupiah, tanpa titik atau koma.</span>
      </div>
      <div class="field">
        <label for="rate">Bunga per tahun (%)</label>
        <input id="rate" type="number" inputmode="decimal"
          min="0" max="100" step="0.01" value="12">
        <span class="hint">Masukkan bunga tahunan, misalnya 12 untuk 12%.</span>
      </div>
      <div class="field">
        <label for="months">Tenor pinjaman (bulan)</label>
        <input id="months" type="number" inputmode="numeric"
          min="1" max="600" step="1" value="36">
        <span class="hint">Gunakan jumlah bulan penuh.</span>
      </div>
    `,
    notice: "Simulasi menggunakan bunga anuitas tetap selama seluruh tenor. Biaya administrasi, asuransi, denda, dan biaya lain tidak termasuk. Produk bank dapat memakai metode berbeda.",
    method: "Angsuran dihitung dari pokok, bunga bulanan, dan jumlah bulan menggunakan rumus anuitas. Jika bunga 0%, pokok dibagi rata sepanjang tenor.",
    faq: [
      {
        q: "Apakah hasil ini merupakan penawaran bank?",
        a: "Tidak. Ini hanya estimasi berdasarkan input Anda. Periksa suku bunga, biaya, dan persyaratan langsung kepada pemberi pinjaman."
      },
      {
        q: "Apakah bunga flat sama dengan anuitas?",
        a: "Tidak selalu. Kedua metode menggunakan dasar perhitungan bunga yang berbeda sehingga hasil angsurannya dapat berbeda."
      }
    ]
  },
  {
    slug: "kpr",
    title: "Kalkulator Cicilan KPR",
    short: "KPR",
    description: "Simulasikan cicilan rumah berdasarkan harga, uang muka, bunga, dan tenor.",
    icon: "home",
    category: "Properti",
    fields: `
      <div class="field">
        <label for="price">Harga rumah</label>
        <input id="price" type="number" inputmode="decimal"
          min="1" max="1000000000000" step="1" value="500000000">
        <span class="hint">Masukkan harga dalam rupiah.</span>
      </div>
      <div class="field">
        <label for="down">Uang muka</label>
        <input id="down" type="number" inputmode="decimal"
          min="0" max="1000000000000" step="1" value="100000000">
        <span class="hint">Uang muka harus lebih kecil dari harga rumah.</span>
      </div>
      <div class="field">
        <label for="rate">Bunga per tahun (%)</label>
        <input id="rate" type="number" inputmode="decimal"
          min="0" max="100" step="0.01" value="8">
        <span class="hint">Simulasi menganggap bunga tetap selama tenor.</span>
      </div>
      <div class="field">
        <label for="years">Tenor KPR (tahun)</label>
        <input id="years" type="number" inputmode="numeric"
          min="1" max="50" step="1" value="15">
        <span class="hint">Gunakan jumlah tahun penuh.</span>
      </div>
    `,
    notice: "Simulasi menganggap bunga anuitas tetap selama seluruh tenor. Pajak, notaris, provisi, asuransi, dan biaya lain belum dihitung. Bunga aktual dapat berubah setelah masa promosi.",
    method: "Pokok pinjaman dihitung dari harga rumah dikurangi uang muka. Angsuran dihitung menggunakan rumus anuitas dengan bunga dan tenor yang dimasukkan.",
    faq: [
      {
        q: "Apakah simulasi ini mencakup bunga floating?",
        a: "Belum. Simulasi memakai satu tingkat bunga yang dianggap tetap selama seluruh tenor."
      },
      {
        q: "Apakah uang muka sudah termasuk biaya pembelian rumah?",
        a: "Tidak. Biaya notaris, pajak, asuransi, dan biaya lain perlu diperkirakan secara terpisah."
      }
    ]
  },
  {
    slug: "margin",
    title: "Kalkulator Margin Usaha",
    short: "Margin Usaha",
    description: "Hitung laba kotor dan persentase margin berdasarkan biaya serta harga jual.",
    icon: "chart",
    category: "Usaha",
    fields: `
      <div class="field">
        <label for="cost">Biaya per produk</label>
        <input id="cost" type="number" inputmode="decimal"
          min="0" max="1000000000000" step="1" value="30000">
        <span class="hint">Masukkan total biaya per produk yang ingin dihitung.</span>
      </div>
      <div class="field">
        <label for="price">Harga jual per produk</label>
        <input id="price" type="number" inputmode="decimal"
          min="1" max="1000000000000" step="1" value="50000">
        <span class="hint">Masukkan harga jual dalam rupiah.</span>
      </div>
    `,
    notice: "Hasil bergantung pada biaya yang Anda masukkan. Pajak, biaya marketplace, biaya tetap, dan biaya lain tidak otomatis dihitung.",
    method: "Laba kotor per produk adalah harga jual dikurangi biaya. Margin laba kotor adalah laba kotor dibagi harga jual, kemudian dikalikan 100%.",
    faq: [
      {
        q: "Apa perbedaan margin dan markup?",
        a: "Margin membandingkan laba dengan harga jual, sedangkan markup membandingkan laba dengan biaya."
      },
      {
        q: "Mengapa hasil laba bisa negatif?",
        a: "Laba negatif berarti biaya yang dimasukkan lebih besar daripada harga jual."
      }
    ]
  }
];

function pageUrl(page) {
  return `${SITE}/${page.slug}/`;
}

function card(page, prefix) {
  return `
    <a class="tool-card" href="${prefix}${page.slug}/"
      data-search="${escapeHtml((page.title + " " + page.category + " " + page.description).toLowerCase())}">
      <span class="card-icon">${icons[page.icon]}</span>
      <h3>${escapeHtml(page.title)}</h3>
      <p>${escapeHtml(page.description)}</p>
      <span class="card-link">Buka kalkulator ${icons.arrow}</span>
    </a>
  `;
}

function layout(options) {
  const {
    title,
    description,
    body,
    root = "./",
    canonical,
    script = "",
    schema = ""
  } = options;

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#172554">
  <title>${escapeHtml(title)} | Calculator Mainilmu</title>
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="icon" type="image/svg+xml" href="${root}favicon.svg">
  <link rel="stylesheet" href="${root}style.css">
  ${schema}
</head>
<body>
  <header class="site-header">
    <div class="container nav">
      <a class="brand" href="${root}" aria-label="Calculator Mainilmu, beranda">
        <span class="brand-mark">${icons.calculator}</span>
        <span>Calculator<span style="color:#2563eb">.</span>Mainilmu</span>
      </a>
      <a class="nav-link" href="${root}">Semua kalkulator</a>
    </div>
  </header>

  <main>${body}</main>

  <footer class="site-footer">
    <div class="container footer-inner">
      <span>Calculator Mainilmu</span>
      <span>Hasil perhitungan merupakan estimasi.</span>
    </div>
  </footer>

  ${script ? `<script>${script}</script>` : ""}
</body>
</html>`;
}

const indexBody = `
  <div class="container">
    <section class="hero">
      <span class="eyebrow">Kalkulator praktis</span>
      <h1>Hitung lebih mudah, rencanakan lebih matang.</h1>
      <p>
        Gunakan kalkulator keuangan, properti, dan usaha untuk membantu
        membuat estimasi berdasarkan angka Anda sendiri.
      </p>
      <div class="search-wrap">
        ${icons.search}
        <input id="search" type="search" placeholder="Cari kalkulator..."
          aria-label="Cari kalkulator" autocomplete="off">
      </div>
    </section>

    <section class="section" aria-labelledby="directory-title">
      <div class="section-head">
        <h2 id="directory-title">Jelajahi kalkulator</h2>
        <p id="count" aria-live="polite">${pages.length} kalkulator tersedia</p>
      </div>
      <div class="grid" id="tools">
        ${pages.map(page => card(page, "./")).join("\n")}
      </div>
      <p class="empty" id="empty" hidden>
        Kalkulator tidak ditemukan. Coba kata kunci lain.
      </p>
    </section>
  </div>
`;

const indexScript = `
  const search = document.getElementById("search");
  const cards = Array.from(document.querySelectorAll("[data-search]"));
  const count = document.getElementById("count");
  const empty = document.getElementById("empty");

  search.addEventListener("input", () => {
    const query = search.value.trim().toLocaleLowerCase("id-ID");
    let visible = 0;

    cards.forEach(card => {
      const match = card.dataset.search.includes(query);
      card.hidden = !match;
      if (match) visible++;
    });

    count.textContent = visible + " kalkulator ditemukan";
    empty.hidden = visible !== 0;
  });
`;

write("index.html", layout({
  title: "Direktori Kalkulator",
  description: "Kumpulan kalkulator praktis untuk simulasi keuangan, properti, dan usaha.",
  body: indexBody,
  root: "./",
  canonical: SITE + "/",
  script: indexScript
}));

const calculationScript = `
  const MAX = 1000000000000;
  const result = document.getElementById("result");
  const type = document.body.dataset.tool;

  const formatMoney = value => new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);

  const formatPercent = value => new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2
  }).format(value) + "%";

  function readNumber(id) {
    const input = document.getElementById(id);
    if (!input || input.value.trim() === "") return NaN;
    return Number(input.value);
  }

  function valid(value, min, max) {
    return Number.isFinite(value) && value >= min && value <= max;
  }

  function monthlyPayment(principal, annualRate, months) {
    const monthlyRate = annualRate / 100 / 12;

    if (monthlyRate === 0) return principal / months;

    // Bentuk ini lebih stabil untuk tenor panjang.
    return principal * monthlyRate /
      (1 - Math.pow(1 + monthlyRate, -months));
  }

  function row(label, value) {
    return '<div class="result-row"><dt>' + label +
      '</dt><dd>' + value + '</dd></div>';
  }

  function showError(message) {
    result.innerHTML = '<h2>Hasil simulasi</h2>' +
      '<p class="result-error">' + message + '</p>';
  }

  function showResult(label, main, rows, note) {
    result.innerHTML =
      '<h2>Hasil simulasi</h2>' +
      '<div class="result-label">' + label + '</div>' +
      '<div class="result-main">' + main + '</div>' +
      '<dl class="result-list">' + rows.join("") + '</dl>' +
      (note ? '<p>' + note + '</p>' : '');
  }

  function update() {
    if (type === "pinjaman") {
      const principal = readNumber("principal");
      const rate = readNumber("rate");
      const months = readNumber("months");

      if (!valid(principal, 1, MAX) ||
          !valid(rate, 0, 100) ||
          !valid(months, 1, 600) ||
          !Number.isInteger(months)) {
        showError("Periksa input. Tenor harus berupa bulan penuh antara 1 dan 600.");
        return;
      }

      const payment = monthlyPayment(principal, rate, months);
      const total = payment * months;

      showResult("Estimasi cicilan per bulan", formatMoney(payment), [
        row("Pokok pinjaman", formatMoney(principal)),
        row("Total pembayaran", formatMoney(total)),
        row("Estimasi total bunga", formatMoney(Math.max(0, total - principal)))
      ]);
    }

    if (type === "kpr") {
      const price = readNumber("price");
      const down = readNumber("down");
      const rate = readNumber("rate");
      const years = readNumber("years");

      if (!valid(price, 1, MAX) ||
          !valid(down, 0, MAX) ||
          down >= price ||
          !valid(rate, 0, 100) ||
          !valid(years, 1, 50) ||
          !Number.isInteger(years)) {
        showError("Periksa input. Uang muka harus lebih kecil dari harga rumah dan tenor berupa tahun penuh.");
        return;
      }

      const principal = price - down;
      const months = years * 12;
      const payment = monthlyPayment(principal, rate, months);
      const total = payment * months;

      showResult("Estimasi cicilan per bulan", formatMoney(payment), [
        row("Pokok pinjaman", formatMoney(principal)),
        row("Total cicilan", formatMoney(total)),
        row("Estimasi total bunga", formatMoney(Math.max(0, total - principal)))
      ]);
    }

    if (type === "margin") {
      const cost = readNumber("cost");
      const price = readNumber("price");

      if (!valid(cost, 0, MAX) || !valid(price, 1, MAX)) {
        showError("Periksa input. Harga jual harus lebih besar dari nol.");
        return;
      }

      const profit = price - cost;
      const margin = profit / price * 100;

      showResult("Laba kotor per produk", formatMoney(profit), [
        row("Biaya per produk", formatMoney(cost)),
        row("Harga jual", formatMoney(price)),
        row("Margin laba kotor", formatPercent(margin))
      ], profit < 0 ? "Biaya lebih besar daripada harga jual." : "");
    }
  }

  document.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", update);
  });

  update();
`;

for (const page of pages) {
  const related = pages.filter(item => item.slug !== page.slug);

  const faqHtml = page.faq.map(item => `
    <h3>${escapeHtml(item.q)}</h3>
    <p>${escapeHtml(item.a)}</p>
  `).join("\n");

  const schemaObject = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faq.map(item => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a
      }
    }))
  };

  // Mencegah teks schema menutup elemen script.
  const schema = `<script type="application/ld+json">${
    JSON.stringify(schemaObject).replace(/</g, "\\u003c")
  }</script>`;

  const body = `
    <div class="container">
      <section class="tool-hero">
        <a class="back" href="../">← Semua kalkulator</a>
        <p><span class="eyebrow">${escapeHtml(page.category)}</span></p>
        <h1>${escapeHtml(page.title)}</h1>
        <p>${escapeHtml(page.description)}</p>
      </section>

      <div class="tool-layout">
        <section class="panel" aria-labelledby="input-title">
          <h2 id="input-title">Masukkan angka</h2>
          <p class="panel-intro">Hasil diperbarui otomatis saat angka berubah.</p>
          ${page.fields}
        </section>

        <section class="panel result-panel" id="result"
          aria-live="polite" aria-atomic="true">
          <h2>Hasil simulasi</h2>
          <p>Aktifkan JavaScript di browser untuk menghitung.</p>
        </section>
      </div>

      <div class="notice">
        <strong>Catatan:</strong> ${escapeHtml(page.notice)}
      </div>

      <div class="info-grid" style="padding-top:20px">
        <section class="panel">
          <h2>Cara perhitungan</h2>
          <p>${escapeHtml(page.method)}</p>
        </section>
        <section class="panel">
          <h2>Pertanyaan umum</h2>
          ${faqHtml}
        </section>
      </div>

      <section class="related" aria-labelledby="related-title">
        <div class="section-head">
          <h2 id="related-title">Kalkulator lainnya</h2>
        </div>
        <div class="grid">
          ${related.map(item => card(item, "../")).join("\n")}
        </div>
      </section>
    </div>
  `;

  const html = layout({
    title: page.title,
    description: page.description,
    body,
    root: "../",
    canonical: pageUrl(page),
    script: calculationScript,
    schema
  }).replace("<body>", `<body data-tool="${page.slug}">`);

  write(`${page.slug}/index.html`, html);
}

const urls = [SITE + "/", ...pages.map(pageUrl)];

write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url><loc>${escapeHtml(url)}</loc></url>`).join("\n")}
</urlset>
`);

write("robots.txt", `User-agent: *
Allow: /
Sitemap: ${SITE}/sitemap.xml
`);

console.log(`Build selesai: ${urls.length} halaman dibuat di folder dist.`);
