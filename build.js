const fs = require("fs");
const path = require("path");

const SITE = "https://calculator.mainilmu.pro";
const OUTPUT = path.join(__dirname, "dist");

fs.rmSync(OUTPUT, { recursive: true, force: true });
fs.mkdirSync(OUTPUT, { recursive: true });

function writeFile(relativePath, content) {
  const target = path.join(OUTPUT, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function layout(title, description, body, script = "") {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | Calculator Mainilmu</title>
  <meta name="description" content="${description}">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 16px/1.6 Arial, sans-serif;
      color: #1e293b;
      background: #f1f5f9;
    }
    header { background: #0f172a; color: white; }
    header a { color: white; text-decoration: none; font-weight: bold; }
    .wrap { width: min(100% - 32px, 760px); margin: auto; }
    header .wrap { padding: 18px 0; }
    main { padding: 28px 0 48px; }
    h1 { line-height: 1.2; font-size: 1.8rem; }
    h2 { font-size: 1.2rem; }
    .card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 22px;
      margin: 18px 0;
      box-shadow: 0 3px 12px rgba(15, 23, 42, .04);
    }
    label { display: block; font-weight: bold; margin-top: 14px; }
    input {
      display: block;
      width: 100%;
      margin-top: 5px;
      padding: 11px;
      border: 1px solid #94a3b8;
      border-radius: 8px;
      font-size: 16px;
    }
    input:focus { outline: 2px solid #2563eb; }
    .result { background: #eff6ff; border-color: #bfdbfe; }
    .number { font-size: 1.5rem; font-weight: bold; color: #1d4ed8; }
    .muted { color: #475569; }
    .error { color: #b91c1c; font-weight: bold; }
    a { color: #1d4ed8; }
    li { margin: 10px 0; }
    footer { border-top: 1px solid #cbd5e1; padding: 20px 0; }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <a href="/">Calculator Mainilmu</a>
    </div>
  </header>
  <main class="wrap">
    ${body}
  </main>
  <footer>
    <div class="wrap muted">
      Hasil kalkulator adalah estimasi, bukan penawaran atau nasihat keuangan.
    </div>
  </footer>
  ${script ? `<script>${script}</script>` : ""}
</body>
</html>`;
}

const commonScript = `
  const rupiah = value => new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);

  const valueOf = id => Number(document.getElementById(id).value);

  function calculatePayment(principal, annualRate, months) {
    const monthlyRate = annualRate / 100 / 12;
    if (monthlyRate === 0) return principal / months;

    const factor = Math.pow(1 + monthlyRate, months);
    return principal * monthlyRate * factor / (factor - 1);
  }

  function validNumber(value, min, max) {
    return Number.isFinite(value) && value >= min && value <= max;
  }
`;

const pages = [
  {
    url: "/pinjaman/",
    file: "pinjaman/index.html",
    title: "Kalkulator Cicilan Pinjaman",
    description: "Hitung estimasi cicilan pinjaman dengan metode anuitas.",
    body: `
      <p><a href="/">← Semua kalkulator</a></p>
      <h1>Kalkulator Cicilan Pinjaman</h1>
      <p>Simulasi angsuran bulanan menggunakan bunga anuitas tetap.</p>
      <div class="card">
        <label for="principal">Jumlah pinjaman (Rp)</label>
        <input id="principal" type="number" min="1" max="1000000000000"
          value="50000000">

        <label for="rate">Bunga per tahun (%)</label>
        <input id="rate" type="number" min="0" max="100" step="0.01"
          value="12">

        <label for="months">Tenor (bulan)</label>
        <input id="months" type="number" min="1" max="600" step="1"
          value="36">
      </div>
      <div class="card result" aria-live="polite" id="result"></div>
      <p class="muted">
        Asumsi: suku bunga tetap selama tenor. Biaya administrasi, asuransi,
        denda, dan biaya lain belum dihitung. Produk bank dapat menggunakan
        metode berbeda.
      </p>
    `,
    script: commonScript + `
      function update() {
        const p = valueOf("principal");
        const r = valueOf("rate");
        const n = valueOf("months");
        const result = document.getElementById("result");

        if (!validNumber(p, 1, 1000000000000) ||
            !validNumber(r, 0, 100) ||
            !validNumber(n, 1, 600) || !Number.isInteger(n)) {
          result.innerHTML = '<p class="error">Periksa kembali semua input.</p>';
          return;
        }

        const payment = calculatePayment(p, r, n);
        result.innerHTML =
          '<h2>Estimasi cicilan per bulan</h2>' +
          '<div class="number">' + rupiah(payment) + '</div>' +
          '<p>Total pembayaran: ' + rupiah(payment * n) + '<br>' +
          'Estimasi total bunga: ' + rupiah(payment * n - p) + '</p>';
      }
      document.querySelectorAll("input").forEach(el =>
        el.addEventListener("input", update));
      update();
    `
  },
  {
    url: "/kpr/",
    file: "kpr/index.html",
    title: "Kalkulator Cicilan KPR",
    description: "Hitung estimasi cicilan KPR berdasarkan harga rumah dan uang muka.",
    body: `
      <p><a href="/">← Semua kalkulator</a></p>
      <h1>Kalkulator Cicilan KPR</h1>
      <p>Hitung estimasi cicilan rumah menggunakan bunga anuitas tetap.</p>
      <div class="card">
        <label for="price">Harga rumah (Rp)</label>
        <input id="price" type="number" min="1" max="1000000000000"
          value="500000000">

        <label for="down">Uang muka (Rp)</label>
        <input id="down" type="number" min="0" max="1000000000000"
          value="100000000">

        <label for="rate">Bunga per tahun (%)</label>
        <input id="rate" type="number" min="0" max="100" step="0.01"
          value="8">

        <label for="years">Tenor (tahun)</label>
        <input id="years" type="number" min="1" max="50" step="1"
          value="15">
      </div>
      <div class="card result" aria-live="polite" id="result"></div>
      <p class="muted">
        Asumsi: bunga tetap selama seluruh tenor. Simulasi belum mencakup
        pajak, notaris, asuransi, provisi, dan biaya lainnya. Bunga KPR aktual
        dapat berubah setelah periode promosi.
      </p>
    `,
    script: commonScript + `
      function update() {
        const price = valueOf("price");
        const down = valueOf("down");
        const rate = valueOf("rate");
        const years = valueOf("years");
        const result = document.getElementById("result");

        if (!validNumber(price, 1, 1000000000000) ||
            !validNumber(down, 0, price) || down >= price ||
            !validNumber(rate, 0, 100) ||
            !validNumber(years, 1, 50) || !Number.isInteger(years)) {
          result.innerHTML = '<p class="error">Periksa input. Uang muka harus lebih kecil dari harga rumah.</p>';
          return;
        }

        const principal = price - down;
        const months = years * 12;
        const payment = calculatePayment(principal, rate, months);
        result.innerHTML =
          '<h2>Estimasi cicilan per bulan</h2>' +
          '<div class="number">' + rupiah(payment) + '</div>' +
          '<p>Pokok pinjaman: ' + rupiah(principal) + '<br>' +
          'Total cicilan: ' + rupiah(payment * months) + '<br>' +
          'Estimasi total bunga: ' + rupiah(payment * months - principal) +
          '</p>';
      }
      document.querySelectorAll("input").forEach(el =>
        el.addEventListener("input", update));
      update();
    `
  },
  {
    url: "/margin/",
    file: "margin/index.html",
    title: "Kalkulator Margin Usaha",
    description: "Hitung laba kotor dan margin berdasarkan biaya dan harga jual.",
    body: `
      <p><a href="/">← Semua kalkulator</a></p>
      <h1>Kalkulator Margin Usaha</h1>
      <p>Hitung laba kotor dan margin per produk.</p>
      <div class="card">
        <label for="cost">Total biaya per produk (Rp)</label>
        <input id="cost" type="number" min="0" max="1000000000000"
          value="30000">

        <label for="price">Harga jual per produk (Rp)</label>
        <input id="price" type="number" min="1" max="1000000000000"
          value="50000">
      </div>
      <div class="card result" aria-live="polite" id="result"></div>
      <p class="muted">
        Masukkan seluruh biaya per produk yang ingin diperhitungkan.
        Hasil ini belum otomatis mencakup pajak, biaya marketplace,
        biaya tetap, atau biaya lain.
      </p>
    `,
    script: commonScript + `
      function update() {
        const cost = valueOf("cost");
        const price = valueOf("price");
        const result = document.getElementById("result");

        if (!validNumber(cost, 0, 1000000000000) ||
            !validNumber(price, 1, 1000000000000)) {
          result.innerHTML = '<p class="error">Periksa kembali semua input.</p>';
          return;
        }

        const profit = price - cost;
        const margin = profit / price * 100;
        result.innerHTML =
          '<h2>Hasil per produk</h2>' +
          '<div class="number">' + rupiah(profit) + '</div>' +
          '<p>Margin laba kotor: ' +
          margin.toLocaleString("id-ID", { maximumFractionDigits: 2 }) +
          '%</p>' +
          (profit < 0 ? '<p class="error">Harga jual lebih rendah dari biaya.</p>' : '');
      }
      document.querySelectorAll("input").forEach(el =>
        el.addEventListener("input", update));
      update();
    `
  }
];

for (const page of pages) {
  writeFile(
    page.file,
    layout(page.title, page.description, page.body, page.script)
  );
}

const directory = `
  <h1>Direktori Kalkulator</h1>
  <p>Pilih kalkulator untuk membuat simulasi Anda.</p>
  <div class="card">
    <ul>
      ${pages.map(page =>
        `<li><a href="${page.url}">${page.title}</a> — ${page.description}</li>`
      ).join("\n")}
    </ul>
  </div>
  <p class="muted">
    Perhitungan bersifat estimasi. Periksa kembali ketentuan dan biaya
    sebenarnya sebelum mengambil keputusan.
  </p>
`;

writeFile(
  "index.html",
  layout("Direktori Kalkulator", "Kumpulan kalkulator keuangan dan usaha.", directory)
);

const urls = ["/", ...pages.map(page => page.url)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url><loc>${SITE}${url}</loc></url>`).join("\n")}
</urlset>
`;

writeFile("sitemap.xml", sitemap);
writeFile("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Build selesai: ${urls.length} halaman dibuat di dist/`);
