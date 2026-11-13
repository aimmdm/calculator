/*
 * LIFE CALCULATOR - build.js
 * Generator situs statis kalkulator (Node.js 22, CommonJS, tanpa dependensi).
 * Jalankan: node build.js   -> output di folder dist
 *
 * Mode build:
 *   preview    (default) : untuk GitHub Pages https://aimmdm.github.io/calculator/
 *                          - semua halaman diberi meta noindex
 *                          - tag canonical DIHILANGKAN (domain produksi belum aktif)
 *                          - robots.txt melarang crawling, tanpa baris Sitemap
 *   production           : untuk https://calculator.mainilmu.pro (root domain)
 *                          - canonical self-referencing ke domain produksi
 *                          - robots.txt + sitemap.xml aktif
 *
 * Untuk beralih mode: ubah nilai DEFAULT_MODE di bawah, atau setel env LC_MODE.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// =====================================================================
// 1. KONFIGURASI (ubah di sini)
// =====================================================================
const DEFAULT_MODE = 'preview'; // 'preview' | 'production'
const MODE = process.env.LC_MODE || DEFAULT_MODE;

const SITES = {
  preview: { SITE_URL: 'https://aimmdm.github.io', BASE_PATH: '/calculator/' },
  production: { SITE_URL: 'https://calculator.mainilmu.pro', BASE_PATH: '/' },
};
if (!SITES[MODE]) throw new Error('MODE tidak valid: ' + MODE + ' (gunakan preview atau production)');

const SITE_URL = SITES[MODE].SITE_URL;
const BASE_PATH = SITES[MODE].BASE_PATH; // harus diawali dan diakhiri "/"
const BASE_URL = SITE_URL + BASE_PATH;
const SITE_NAME = 'LIFE CALCULATOR';
const CONTACT_EMAIL = 'admin@mainilmu.pro';
const OUT_DIR = 'dist';

// Kebijakan indeks (berlaku hanya pada mode production).
// Halaman hub (kalkulator utama), beranda, kategori, dan metodologi boleh diindeks.
// Halaman PRESET (skenario angka) diberi noindex sampai kualitasnya dievaluasi.
// Untuk mengizinkan klaster preset diindeks, isi mis. ['pinjaman', 'kpr'].
const INDEX_PRESET_CLUSTERS = [];

// Target minimal halaman per klaster (build gagal jika tidak terpenuhi).
const MIN_PAGES = { pinjaman: 400, kpr: 200, usaha: 150, gaji: 150, konstruksi: 120 };
const MIN_TOTAL_PAGES = 1000;

// AdSense: nonaktif secara default. Jangan isi dengan ID palsu.
const ADSENSE = {
  ENABLED: false,
  CLIENT: '', // contoh format: 'ca-pub-0000000000000000' (isi milik akun Anda sendiri)
  SLOT_RESULT: '', // ID slot angka dari akun Anda; kosong = tidak ada unit iklan
};

const POLICY_LINKS = [
  ['Tentang', 'https://www.mainilmu.pro/p/about.html'],
  ['Kontak', 'https://www.mainilmu.pro/p/contacts.html'],
  ['Kebijakan Privasi', 'https://www.mainilmu.pro/p/privacy-policy.html'],
  ['Syarat Layanan', 'https://www.mainilmu.pro/p/terms-of-service.html'],
  ['Disclaimer', 'https://www.mainilmu.pro/p/disclaimer.html'],
  ['DMCA', 'https://www.mainilmu.pro/p/dmca.html'],
];

// =====================================================================
// 2. CORE: rumus, validasi, dan render (dipakai build.js DAN dikirim ke browser)
//    Fungsi ini di-stringify ke app.js, sehingga pengujian di Node
//    memakai kode yang sama persis dengan yang berjalan di browser.
// =====================================================================
function LC_CORE() {
  'use strict';
  const LC = { engines: {}, order: [] };

  // ---------- format & parsing ----------
  function grp(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function fmtNum(n, d) {
    if (!isFinite(n)) return '-';
    d = d == null ? 0 : d;
    const s = Math.abs(n).toFixed(d);
    const p = s.split('.');
    const neg = n < 0 && Number(s) !== 0;
    return (neg ? '-' : '') + grp(p[0]) + (p[1] ? ',' + p[1] : '');
  }
  function fmtTrim(n) { return fmtNum(n, 4).replace(/,?0+$/, ''); }
  function fmtRp(n) {
    const r = Math.round(n);
    return (r < 0 ? '-' : '') + 'Rp' + fmtNum(Math.abs(r), 0);
  }
  function fmtPct(n, d) { return fmtNum(n, d == null ? 2 : d) + '%'; }
  function plain(n) { return String(n).replace('.', ','); }
  function parseNum(s) {
    if (typeof s === 'number') return s;
    s = String(s == null ? '' : s).trim().replace(/rp/ig, '').replace(/%/g, '').replace(/\s/g, '');
    if (s === '') return NaN;
    if (s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return parseFloat(s);
  }
  function ceilN(x) { return Math.ceil(Number(x.toFixed(6))); }
  LC.fmtNum = fmtNum; LC.fmtRp = fmtRp; LC.fmtPct = fmtPct; LC.plain = plain; LC.parseNum = parseNum;

  function S(l, v, strong) { return { l: l, v: v, strong: !!strong }; }
  function F(id, label, kind, def, o) {
    const f = { id: id, label: label, kind: kind, def: def };
    if (kind === 'pct') f.unit = '%';
    return Object.assign(f, o || {});
  }

  // ---------- jadwal angsuran ----------
  function pmtAnn(P, ratePct, n) {
    const r = ratePct / 1200;
    if (r === 0) return P / n;
    return P * r / (1 - Math.pow(1 + r, -n));
  }
  function schedAnn(P, ratePct, n) {
    P = Math.round(P);
    const r = ratePct / 1200;
    const pay = Math.round(pmtAnn(P, ratePct, n));
    let bal = P;
    const rows = [];
    for (let m = 1; m <= n; m++) {
      const int = Math.round(bal * r);
      let prin = pay - int;
      if (m === n || prin > bal) prin = bal;
      bal -= prin;
      rows.push({ m: m, pay: prin + int, int: int, prin: prin, bal: bal });
    }
    return rows;
  }
  function schedFlat(P, ratePct, n) {
    P = Math.round(P);
    const intM = Math.round(P * ratePct / 1200);
    const prinM = Math.round(P / n);
    let bal = P;
    const rows = [];
    for (let m = 1; m <= n; m++) {
      let prin = (m === n || prinM > bal) ? bal : prinM;
      bal -= prin;
      rows.push({ m: m, pay: prin + intM, int: intM, prin: prin, bal: bal });
    }
    return rows;
  }
  function sumRows(rows) {
    const t = { pay: 0, int: 0, prin: 0 };
    rows.forEach(function (r) { t.pay += r.pay; t.int += r.int; t.prin += r.prin; });
    return t;
  }
  function flatEffective(P, ratePct, n) {
    const target = P / n + P * ratePct / 1200;
    let lo = 0, hi = 5000;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (pmtAnn(P, mid, n) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  function schedTable(rows) {
    return {
      caption: 'Tabel angsuran per bulan',
      cols: ['Bulan ke', 'Angsuran', 'Bunga', 'Pokok', 'Sisa pokok'],
      rows: rows.map(function (r) { return [String(r.m), fmtRp(r.pay), fmtRp(r.int), fmtRp(r.prin), fmtRp(r.bal)]; }),
      limit: 12,
    };
  }
  function yearTable(rows) {
    const ys = [];
    rows.forEach(function (r) {
      const y = Math.ceil(r.m / 12);
      let o = ys[y - 1];
      if (!o) { o = { y: y, pay: 0, int: 0, prin: 0, bal: 0 }; ys[y - 1] = o; }
      o.pay += r.pay; o.int += r.int; o.prin += r.prin; o.bal = r.bal;
    });
    return {
      caption: 'Ringkasan per tahun',
      cols: ['Tahun ke', 'Total angsuran', 'Bunga', 'Pokok', 'Sisa pokok akhir tahun'],
      rows: ys.map(function (o) { return [String(o.y), fmtRp(o.pay), fmtRp(o.int), fmtRp(o.prin), fmtRp(o.bal)]; }),
    };
  }
  LC.schedAnn = schedAnn; LC.schedFlat = schedFlat; LC.pmtAnn = pmtAnn;

  function E(def) { LC.engines[def.id] = def; LC.order.push(def.id); }

  // ---------- PINJAMAN ----------
  function loanFields(withRate) {
    const a = [
      F('plafon', 'Jumlah pinjaman (pokok)', 'rp', 50000000, { min: 1000, max: 1e12, hint: 'Pokok pinjaman yang diterima.' }),
      F('tenor', 'Tenor', 'int', 24, { unit: 'bulan', min: 1, max: 480, hint: 'Lama cicilan dalam bulan.' }),
    ];
    if (withRate) a.push(F('bunga', 'Bunga per tahun', 'pct', 12, { min: 0, max: 100, hint: 'Angka contoh. Ganti sesuai penawaran yang Anda terima.' }));
    return a;
  }
  function adminField() {
    return F('admin', 'Biaya admin sekali bayar (opsional)', 'rp', 0, { min: 0, max: 1e11, hint: 'Isi 0 bila tidak ada biaya admin.' });
  }
  function loanResult(v, rows, extra) {
    const t = sumRows(rows);
    const s = [S('Cicilan per bulan', fmtRp(rows[0].pay), true), S('Total bunga', fmtRp(t.int)), S('Total pembayaran (pokok + bunga)', fmtRp(t.pay))];
    (extra || []).forEach(function (x) { s.push(x); });
    if (v.admin > 0) {
      s.push(S('Biaya admin (sekali bayar)', fmtRp(v.admin)));
      s.push(S('Total biaya keseluruhan', fmtRp(t.pay + v.admin)));
    }
    const notes = [];
    if (rows[rows.length - 1].pay !== rows[0].pay) notes.push('Cicilan terakhir (' + fmtRp(rows[rows.length - 1].pay) + ') berbeda sedikit karena selisih pembulatan ditampung di bulan terakhir.');
    return { summary: s, tables: [schedTable(rows)], notes: notes, warnings: [], raw: { pay: rows[0].pay, last: rows[rows.length - 1], rows: rows, total: t } };
  }

  E({
    id: 'anuitas', cluster: 'pinjaman', name: 'Cicilan Pinjaman Anuitas',
    intro: 'Hitung cicilan tetap bulanan dengan metode anuitas: bunga dihitung dari sisa pokok, sehingga porsi bunga mengecil dan porsi pokok membesar setiap bulan.',
    fields: loanFields(true).concat([adminField()]),
    method: [
      'Cicilan bulanan = P × r ÷ (1 − (1 + r)^−n), dengan P pokok pinjaman, r bunga per bulan (bunga tahunan ÷ 12 ÷ 100), dan n jumlah bulan. Jika bunga 0%, cicilan = P ÷ n.',
      'Tiap bulan, bunga = sisa pokok × r (dibulatkan ke rupiah). Pokok yang terbayar = cicilan − bunga. Selisih pembulatan ditampung pada cicilan terakhir sehingga sisa pokok berakhir tepat nol.',
    ],
    assumptions: ['Bunga tetap sepanjang tenor.', 'Cicilan dibayar di akhir bulan.', 'Tidak ada denda, asuransi, atau pelunasan dipercepat.'],
    faq: [
      ['Apa bedanya bunga anuitas dan bunga flat?', 'Pada anuitas bunga dihitung dari sisa pokok. Pada flat bunga dihitung dari pokok awal selama seluruh tenor, sehingga bunga efektifnya lebih tinggi daripada angka nominalnya.'],
      ['Mengapa cicilan terakhir bisa sedikit berbeda?', 'Cicilan dibulatkan ke rupiah penuh. Selisih pembulatan ditampung di bulan terakhir agar sisa pokok tepat nol.'],
    ],
    related: ['flat', 'bandingkan', 'nol'],
    calc: function (v) { return loanResult(v, schedAnn(v.plafon, v.bunga, v.tenor)); },
  });

  E({
    id: 'flat', cluster: 'pinjaman', name: 'Cicilan Pinjaman Bunga Flat',
    intro: 'Hitung cicilan dengan bunga flat: bunga dihitung dari pokok awal untuk seluruh tenor. Hasil juga menampilkan perkiraan bunga efektif setara anuitas.',
    fields: loanFields(true).concat([adminField()]),
    method: [
      'Bunga per bulan = P × bunga tahunan ÷ 12 ÷ 100 (tetap setiap bulan). Pokok per bulan = P ÷ n. Cicilan = pokok per bulan + bunga per bulan.',
      'Bunga efektif setara dicari secara numerik (bisection): suku bunga anuitas yang menghasilkan cicilan sama dengan cicilan flat pada pokok dan tenor yang sama.',
    ],
    assumptions: ['Bunga flat tetap selama tenor.', 'Cicilan dibayar di akhir bulan.', 'Tidak ada denda, asuransi, atau pelunasan dipercepat.'],
    faq: [
      ['Mengapa bunga flat terasa lebih murah padahal tidak?', 'Angka nominal flat tampak kecil, tetapi bunga tetap dihitung dari pokok awal walau pokok sudah berkurang. Bunga efektif setara anuitas biasanya jauh lebih tinggi.'],
      ['Apakah perkiraan bunga efektif sama dengan APR resmi?', 'Tidak. Angka ini hanya hasil perhitungan matematis dari input Anda dan tidak memasukkan biaya lain.'],
    ],
    related: ['anuitas', 'bandingkan', 'nol'],
    calc: function (v) {
      const rows = schedFlat(v.plafon, v.bunga, v.tenor);
      const eff = flatEffective(Math.round(v.plafon), v.bunga, v.tenor);
      const r = loanResult(v, rows, [S('Perkiraan bunga efektif setara (anuitas)', fmtPct(eff, 2) + ' per tahun')]);
      r.raw.eff = eff;
      return r;
    },
  });

  E({
    id: 'nol', cluster: 'pinjaman', name: 'Cicilan Pinjaman Bunga 0%',
    intro: 'Hitung cicilan untuk pinjaman atau pembelian cicilan tanpa bunga, termasuk biaya admin bila ada.',
    fields: loanFields(false).concat([adminField()]),
    method: ['Cicilan = P ÷ n (dibulatkan ke rupiah; selisih pembulatan ditampung di cicilan terakhir). Total bunga = 0. Jika ada biaya admin, total biaya = P + biaya admin.'],
    assumptions: ['Tidak ada bunga.', 'Biaya admin dibayar sekali dan tidak masuk cicilan.'],
    faq: [
      ['Apakah cicilan 0% selalu tanpa biaya tambahan?', 'Belum tentu. Isi kolom biaya admin dengan biaya lain yang Anda ketahui supaya total biaya terlihat.'],
      ['Bagaimana jika tenor tidak habis dibagi?', 'Cicilan dibulatkan ke rupiah dan sisa pembulatan masuk ke cicilan terakhir.'],
    ],
    related: ['anuitas', 'flat', 'bandingkan'],
    calc: function (v) { return loanResult(v, schedAnn(v.plafon, 0, v.tenor)); },
  });

  E({
    id: 'bandingkan', cluster: 'pinjaman', name: 'Bandingkan Anuitas, Flat, dan 0%',
    intro: 'Bandingkan tiga metode bunga untuk pokok dan tenor yang sama: anuitas, flat, dan 0%.',
    fields: loanFields(true),
    method: [
      'Ketiga metode dihitung dengan rumus masing-masing (lihat kalkulator anuitas, flat, dan 0%). Perbandingan memakai pokok, tenor, dan angka bunga yang sama, kecuali metode 0% yang tidak memakai bunga.',
    ],
    assumptions: ['Angka bunga yang sama dipakai pada anuitas dan flat.', 'Biaya lain tidak dihitung.'],
    faq: [
      ['Apakah hasil ini menunjukkan metode mana yang ditawarkan lembaga tertentu?', 'Tidak. Ini perbandingan matematis. Setiap penawaran nyata punya ketentuan dan biaya sendiri.'],
      ['Mengapa total bunga flat lebih besar dari anuitas?', 'Karena bunga flat tidak turun mengikuti sisa pokok.'],
    ],
    related: ['anuitas', 'flat', 'nol'],
    calc: function (v) {
      const a = schedAnn(v.plafon, v.bunga, v.tenor), f = schedFlat(v.plafon, v.bunga, v.tenor), z = schedAnn(v.plafon, 0, v.tenor);
      const ta = sumRows(a), tf = sumRows(f), tz = sumRows(z);
      return {
        summary: [
          S('Cicilan anuitas per bulan', fmtRp(a[0].pay), true), S('Cicilan flat per bulan', fmtRp(f[0].pay), true), S('Cicilan 0% per bulan', fmtRp(z[0].pay), true),
          S('Selisih total bunga: flat dikurangi anuitas', fmtRp(tf.int - ta.int)),
        ],
        tables: [{
          caption: 'Perbandingan metode', cols: ['Metode', 'Cicilan per bulan', 'Total bunga', 'Total pembayaran'],
          rows: [['Anuitas', fmtRp(a[0].pay), fmtRp(ta.int), fmtRp(ta.pay)], ['Flat', fmtRp(f[0].pay), fmtRp(tf.int), fmtRp(tf.pay)], ['Bunga 0%', fmtRp(z[0].pay), fmtRp(tz.int), fmtRp(tz.pay)]],
        }],
        notes: ['Cicilan flat umumnya lebih besar karena bunga dihitung dari pokok awal.'], warnings: [],
        raw: { ann: ta, flat: tf, zero: tz },
      };
    },
  });

  // ---------- KPR ----------
  function kprPokok(harga, dpPct) { return Math.round(harga - harga * dpPct / 100); }
  LC.kprPokok = kprPokok;
  function kprBase(extraFields) {
    return [
      F('harga', 'Harga rumah', 'rp', 500000000, { min: 10000000, max: 1e11, hint: 'Harga properti sebelum uang muka.' }),
      F('dp', 'Uang muka', 'pct', 20, { min: 0, max: 90, hint: 'Persentase dari harga rumah.' }),
      F('tenor', 'Tenor', 'int', 20, { unit: 'tahun', min: 1, max: 35, hint: 'Lama cicilan dalam tahun.' }),
    ].concat(extraFields);
  }
  const KPR_NOT_INCLUDED = 'Belum termasuk biaya lain yang umumnya perlu dicek: BPHTB, biaya notaris/PPAT, provisi dan administrasi, asuransi jiwa dan kebakaran, biaya appraisal, PPN bila ada, serta biaya lain di perjanjian.';

  E({
    id: 'kpr-tetap', cluster: 'kpr', name: 'Simulasi KPR Bunga Tetap',
    intro: 'Hitung pokok pinjaman, uang muka, angsuran bulanan, dan total bunga KPR dengan bunga tetap sepanjang tenor.',
    fields: kprBase([
      F('bunga', 'Bunga per tahun', 'pct', 9, { min: 0, max: 50, hint: 'Angka contoh. Ganti sesuai penawaran Anda.' }),
      F('biayaLain', 'Perkiraan biaya awal lain (opsional)', 'pct', 0, { unit: '% harga', min: 0, max: 30, hint: 'Isi sendiri jika Anda punya perkiraan (notaris, provisi, dsb). 0 = tidak dihitung.' }),
    ]),
    method: [
      'Uang muka = harga × persen uang muka. Pokok pinjaman = harga − uang muka.',
      'Angsuran bulanan memakai rumus anuitas: P × r ÷ (1 − (1 + r)^−n), dengan r bunga per bulan dan n jumlah bulan. Jadwal dihitung per bulan dengan pembulatan rupiah; sisa pokok akhir tepat nol.',
    ],
    assumptions: ['Bunga tetap sepanjang tenor.', 'Angsuran dibayar di akhir bulan.', KPR_NOT_INCLUDED],
    faq: [
      ['Apakah hasil ini sama dengan simulasi bank?', 'Belum tentu. Bank dapat memakai metode, pembulatan, dan biaya yang berbeda. Gunakan ini sebagai gambaran awal.'],
      ['Biaya apa yang belum dihitung?', KPR_NOT_INCLUDED],
    ],
    related: ['kpr-fixfloat', 'kpr-mampu', 'anuitas'],
    calc: function (v) {
      const pokok = kprPokok(v.harga, v.dp), dpRp = v.harga - pokok, n = v.tenor * 12;
      const rows = schedAnn(pokok, v.bunga, n), t = sumRows(rows), lain = v.harga * v.biayaLain / 100;
      const s = [S('Angsuran per bulan', fmtRp(rows[0].pay), true), S('Uang muka', fmtRp(dpRp)), S('Pokok pinjaman', fmtRp(pokok)), S('Total bunga', fmtRp(t.int)), S('Total angsuran (pokok + bunga)', fmtRp(t.pay))];
      if (lain > 0) s.push(S('Perkiraan biaya awal lain (input Anda)', fmtRp(lain)));
      s.push(S('Total keluar selama KPR (uang muka + angsuran + biaya lain)', fmtRp(dpRp + t.pay + lain)));
      const tabs = n > 24 ? [yearTable(rows), schedTable(rows)] : [schedTable(rows)];
      return { summary: s, tables: tabs, notes: [KPR_NOT_INCLUDED], warnings: [], raw: { pokok: pokok, dp: dpRp, pay: rows[0].pay, rows: rows, total: t } };
    },
  });

  E({
    id: 'kpr-fixfloat', cluster: 'kpr', name: 'Simulasi KPR Fixed lalu Floating',
    intro: 'Hitung KPR dengan bunga fixed beberapa tahun, lalu bunga floating pada sisa tenor. Angsuran dihitung ulang dari sisa pokok saat bunga berubah.',
    fields: kprBase([
      F('fix', 'Masa bunga fixed', 'int', 3, { unit: 'tahun', min: 1, max: 35, hint: 'Tidak boleh melebihi tenor.' }),
      F('bungaFix', 'Bunga fixed per tahun', 'pct', 7, { min: 0, max: 50, hint: 'Angka contoh. Ganti sesuai penawaran Anda.' }),
      F('bungaFloat', 'Bunga floating per tahun (asumsi)', 'pct', 11, { min: 0, max: 50, hint: 'Asumsi tetap selama masa floating; suku bunga nyata bisa berubah.' }),
    ]),
    check: function (v) { return v.fix > v.tenor ? { fix: 'Masa fixed tidak boleh melebihi tenor.' } : {}; },
    method: [
      'Selama masa fixed, angsuran = rumus anuitas dengan bunga fixed atas pokok dan seluruh tenor. Sisa pokok di akhir masa fixed dihitung dari jadwal bulanan.',
      'Setelah masa fixed, angsuran dihitung ULANG dari sisa pokok tersebut, dengan bunga floating dan sisa jumlah bulan. Bunga floating diasumsikan tetap; pada kenyataannya dapat naik atau turun.',
    ],
    assumptions: ['Bunga floating adalah asumsi satu angka tetap.', 'Angsuran dibayar di akhir bulan.', KPR_NOT_INCLUDED],
    faq: [
      ['Mengapa angsuran berubah setelah masa fixed?', 'Karena bunga berubah, angsuran dihitung ulang dari sisa pokok dan sisa bulan.'],
      ['Apakah bunga floating dijamin sama dengan asumsi?', 'Tidak. Angka floating di sini hanya asumsi untuk simulasi.'],
    ],
    related: ['kpr-tetap', 'kpr-mampu', 'anuitas'],
    calc: function (v) {
      const pokok = kprPokok(v.harga, v.dp), dpRp = v.harga - pokok, n = v.tenor * 12, fm = v.fix * 12;
      const r1 = schedAnn(pokok, v.bungaFix, n).slice(0, fm);
      let rows = r1, payFloat = null;
      if (fm < n) {
        const bal = r1[fm - 1].bal;
        const r2 = schedAnn(bal, v.bungaFloat, n - fm).map(function (r) { r.m += fm; return r; });
        rows = r1.concat(r2); payFloat = r2[0].pay;
      }
      const t = sumRows(rows);
      const s = [S('Angsuran masa fixed', fmtRp(r1[0].pay), true)];
      if (payFloat !== null) s.push(S('Angsuran awal masa floating (dihitung ulang)', fmtRp(payFloat), true), S('Sisa pokok saat masa fixed berakhir', fmtRp(r1[fm - 1].bal)));
      s.push(S('Uang muka', fmtRp(dpRp)), S('Pokok pinjaman', fmtRp(pokok)), S('Total bunga', fmtRp(t.int)), S('Total angsuran (pokok + bunga)', fmtRp(t.pay)));
      const w = payFloat === null ? ['Masa fixed sama dengan tenor, sehingga tidak ada masa floating.'] : [];
      return { summary: s, tables: [yearTable(rows), schedTable(rows)], notes: [KPR_NOT_INCLUDED], warnings: w, raw: { pokok: pokok, payFix: r1[0].pay, payFloat: payFloat, finalBal: rows[rows.length - 1].bal, rows: rows, total: t } };
    },
  });

  E({
    id: 'kpr-mampu', cluster: 'kpr', name: 'Estimasi Harga Rumah yang Terjangkau',
    intro: 'Perkirakan plafon dan harga rumah maksimum dari penghasilan, batas persentase cicilan yang Anda tetapkan sendiri, tenor, dan bunga.',
    fields: [
      F('income', 'Penghasilan bulanan', 'rp', 10000000, { min: 100000, max: 1e10, hint: 'Penghasilan yang Anda pakai sebagai dasar.' }),
      F('kewajiban', 'Cicilan lain yang sudah ada', 'rp', 0, { min: 0, max: 1e10, hint: 'Isi 0 jika tidak ada.' }),
      F('dsr', 'Batas cicilan terhadap penghasilan', 'pct', 30, { min: 1, max: 100, hint: 'Batas yang Anda tetapkan sendiri (bukan aturan bank tertentu).' }),
      F('tenor', 'Tenor', 'int', 20, { unit: 'tahun', min: 1, max: 35, hint: 'Lama cicilan dalam tahun.' }),
      F('bunga', 'Bunga per tahun', 'pct', 9, { min: 0, max: 50, hint: 'Angka contoh. Ganti sesuai penawaran Anda.' }),
      F('dp', 'Uang muka', 'pct', 20, { min: 0, max: 90, hint: 'Persentase dari harga rumah.' }),
    ],
    method: [
      'Cicilan maksimum = penghasilan × batas persen − cicilan lain. Plafon maksimum = cicilan maksimum ÷ faktor anuitas (r ÷ (1 − (1 + r)^−n)).',
      'Harga rumah maksimum = plafon ÷ (1 − persen uang muka). Uang muka = harga − plafon.',
    ],
    assumptions: ['Batas cicilan adalah angka pilihan Anda, bukan ketentuan resmi.', 'Bunga tetap sepanjang tenor.', KPR_NOT_INCLUDED],
    faq: [
      ['Apakah bank pasti menyetujui plafon ini?', 'Tidak. Persetujuan kredit bergantung pada kebijakan dan penilaian masing-masing pemberi kredit.'],
      ['Dari mana batas cicilan terhadap penghasilan?', 'Anda mengisinya sendiri. Nilai awal hanyalah contoh, bukan ketentuan resmi.'],
    ],
    related: ['kpr-tetap', 'kpr-fixfloat', 'anuitas'],
    calc: function (v) {
      const maxPay = v.income * v.dsr / 100 - v.kewajiban, n = v.tenor * 12;
      if (maxPay <= 0) {
        return { summary: [S('Cicilan maksimum', fmtRp(0), true), S('Plafon maksimum', fmtRp(0)), S('Estimasi harga rumah maksimum', fmtRp(0))], tables: [], notes: [], warnings: ['Cicilan lain sudah menghabiskan batas cicilan yang Anda tetapkan, sehingga tidak ada ruang cicilan baru.'], raw: { maxPay: maxPay, plafon: 0 } };
      }
      const plafon = maxPay / pmtAnn(1, v.bunga, n), harga = plafon / (1 - v.dp / 100);
      return {
        summary: [S('Cicilan maksimum per bulan', fmtRp(maxPay), true), S('Plafon pinjaman maksimum', fmtRp(plafon)), S('Estimasi harga rumah maksimum', fmtRp(harga), true), S('Uang muka yang dibutuhkan', fmtRp(harga - plafon))],
        tables: [], notes: [KPR_NOT_INCLUDED, 'Ini estimasi matematis, bukan keputusan atau janji persetujuan kredit.'], warnings: [], raw: { maxPay: maxPay, plafon: plafon, harga: harga },
      };
    },
  });

  // ---------- USAHA ----------
  E({
    id: 'hpp', cluster: 'usaha', name: 'Kalkulator HPP per Unit',
    intro: 'Hitung harga pokok produksi (HPP) per unit dari biaya bahan, tenaga kerja, dan overhead, termasuk susut produk, lalu lihat harga jual saran berdasarkan margin target.',
    fields: [
      F('bahan', 'Biaya bahan baku per batch', 'rp', 450000, { min: 0, max: 1e11 }),
      F('tenaga', 'Biaya tenaga kerja per batch', 'rp', 150000, { min: 0, max: 1e11 }),
      F('overhead', 'Overhead per batch (listrik, gas, kemasan, dll.)', 'rp', 100000, { min: 0, max: 1e11 }),
      F('unit', 'Jumlah unit yang diproduksi per batch', 'int', 50, { unit: 'unit', min: 1, max: 1e8 }),
      F('susut', 'Susut / produk gagal', 'pct', 0, { min: 0, max: 90, hint: 'Persentase unit yang tidak bisa dijual.' }),
      F('margin', 'Margin target', 'pct', 30, { min: 0, max: 95, hint: 'Margin = laba ÷ harga jual (bukan markup).' }),
    ],
    method: [
      'HPP per unit = (bahan + tenaga kerja + overhead) ÷ (unit diproduksi × (1 − susut)).',
      'Harga jual saran = HPP ÷ (1 − margin target). Ini memakai margin (laba ÷ harga jual), bukan markup (laba ÷ biaya).',
    ],
    assumptions: ['Semua biaya adalah angka yang Anda isi.', 'Biaya marketplace, pajak, dan ongkos kirim tidak dihitung kecuali Anda memasukkannya ke overhead.'],
    faq: [
      ['Apa bedanya margin dan markup?', 'Margin = laba ÷ harga jual. Markup = laba ÷ biaya. Dengan laba yang sama, markup selalu lebih besar daripada margin.'],
      ['Apa yang masuk overhead?', 'Biaya yang menunjang produksi tetapi bukan bahan atau upah langsung, misalnya listrik, gas, dan kemasan. Anda yang menentukan isinya.'],
    ],
    related: ['harga-margin', 'margin', 'bep'],
    calc: function (v) {
      const total = v.bahan + v.tenaga + v.overhead, layak = v.unit * (1 - v.susut / 100), hpp = total / layak, harga = hpp / (1 - v.margin / 100);
      const pct = function (x) { return total > 0 ? fmtPct(x / total * 100, 1) : '-'; };
      return {
        summary: [S('HPP per unit', fmtRp(hpp), true), S('Total biaya per batch', fmtRp(total)), S('Unit layak jual', fmtNum(layak, 2)), S('Harga jual saran (margin ' + fmtTrim(v.margin) + '%)', fmtRp(harga), true), S('Laba per unit pada harga saran', fmtRp(harga - hpp))],
        tables: [{ caption: 'Rincian biaya per batch', cols: ['Komponen', 'Nominal', 'Porsi'], rows: [['Bahan baku', fmtRp(v.bahan), pct(v.bahan)], ['Tenaga kerja', fmtRp(v.tenaga), pct(v.tenaga)], ['Overhead', fmtRp(v.overhead), pct(v.overhead)], ['Total', fmtRp(total), total > 0 ? '100%' : '-']] }],
        notes: [], warnings: total === 0 ? ['Seluruh biaya bernilai 0, sehingga HPP juga 0.'] : [], raw: { hpp: hpp, harga: harga },
      };
    },
  });

  E({
    id: 'margin', cluster: 'usaha', name: 'Kalkulator Margin dan Markup dari Harga Jual',
    intro: 'Masukkan biaya dan harga jual untuk melihat laba, margin, dan markup secara terpisah.',
    fields: [
      F('biaya', 'Biaya (HPP) per unit', 'rp', 30000, { min: 1, max: 1e11 }),
      F('harga', 'Harga jual per unit', 'rp', 50000, { min: 1, max: 1e11 }),
      F('unit', 'Unit terjual per bulan', 'int', 100, { unit: 'unit', min: 0, max: 1e8 }),
    ],
    method: ['Laba = harga jual − biaya. Margin = laba ÷ harga jual × 100%. Markup = laba ÷ biaya × 100%. Keduanya berbeda: contoh biaya Rp30.000 dan harga Rp50.000 memberi margin 40% dan markup 66,67%.'],
    assumptions: ['Biaya per unit sudah mencakup seluruh biaya variabel yang Anda anggap relevan.', 'Biaya tetap bulanan tidak dihitung di sini (lihat kalkulator BEP).'],
    faq: [
      ['Mengapa margin dan markup berbeda?', 'Penyebutnya berbeda: margin dibagi harga jual, markup dibagi biaya.'],
      ['Bisakah margin negatif?', 'Ya, bila harga jual di bawah biaya. Hasil akan menunjukkan kerugian.'],
    ],
    related: ['markup', 'harga-margin', 'hpp'],
    calc: function (v) {
      const laba = v.harga - v.biaya, margin = laba / v.harga * 100, markup = laba / v.biaya * 100;
      return {
        summary: [S('Laba per unit', fmtRp(laba), true), S('Margin (laba ÷ harga jual)', fmtPct(margin, 2), true), S('Markup (laba ÷ biaya)', fmtPct(markup, 2), true), S('Laba per bulan', fmtRp(laba * v.unit))],
        tables: [], notes: ['Margin dan markup adalah dua ukuran berbeda. Jangan dipertukarkan.'], warnings: laba < 0 ? ['Harga jual lebih rendah dari biaya: usaha merugi pada harga ini.'] : [], raw: { laba: laba, margin: margin, markup: markup },
      };
    },
  });

  E({
    id: 'markup', cluster: 'usaha', name: 'Kalkulator Harga Jual dari Markup',
    intro: 'Tentukan harga jual dari biaya dan persentase markup, lalu lihat margin yang dihasilkan.',
    fields: [
      F('biaya', 'Biaya (HPP) per unit', 'rp', 30000, { min: 1, max: 1e11 }),
      F('markup', 'Markup yang diinginkan', 'pct', 50, { min: 0, max: 1000, hint: 'Markup = laba ÷ biaya.' }),
      F('unit', 'Unit terjual per bulan', 'int', 100, { unit: 'unit', min: 0, max: 1e8 }),
    ],
    method: ['Harga jual = biaya × (1 + markup ÷ 100). Laba = harga − biaya. Margin yang dihasilkan = markup ÷ (100 + markup) × 100%.'],
    assumptions: ['Biaya per unit adalah angka yang Anda isi.', 'Pajak, biaya platform, dan diskon tidak dihitung.'],
    faq: [
      ['Apakah markup 50% berarti margin 50%?', 'Tidak. Markup 50% setara margin sekitar 33,33%.'],
      ['Kapan memakai markup?', 'Bila Anda terbiasa menetapkan harga sebagai biaya ditambah persentase tertentu.'],
    ],
    related: ['margin', 'harga-margin', 'hpp'],
    calc: function (v) {
      const harga = v.biaya * (1 + v.markup / 100), laba = harga - v.biaya, margin = v.markup / (100 + v.markup) * 100;
      return { summary: [S('Harga jual', fmtRp(harga), true), S('Laba per unit', fmtRp(laba)), S('Margin yang dihasilkan', fmtPct(margin, 2), true), S('Laba per bulan', fmtRp(laba * v.unit))], tables: [], notes: ['Markup dihitung dari biaya, margin dari harga jual.'], warnings: [], raw: { harga: harga, margin: margin } };
    },
  });

  E({
    id: 'harga-margin', cluster: 'usaha', name: 'Kalkulator Harga Jual dari Margin Target',
    intro: 'Tentukan harga jual agar mencapai margin target, lalu lihat markup setara.',
    fields: [
      F('biaya', 'Biaya (HPP) per unit', 'rp', 30000, { min: 1, max: 1e11 }),
      F('margin', 'Margin target', 'pct', 40, { min: 0, max: 95, hint: 'Margin = laba ÷ harga jual.' }),
      F('unit', 'Unit terjual per bulan', 'int', 100, { unit: 'unit', min: 0, max: 1e8 }),
    ],
    method: ['Harga jual = biaya ÷ (1 − margin ÷ 100). Laba = harga − biaya. Markup setara = margin ÷ (100 − margin) × 100%.'],
    assumptions: ['Biaya per unit adalah angka yang Anda isi.', 'Pajak, biaya platform, dan diskon tidak dihitung.'],
    faq: [
      ['Mengapa tidak cukup menambah 40% dari biaya?', 'Menambah 40% dari biaya adalah markup 40%, yang setara margin sekitar 28,57%, bukan 40%.'],
      ['Bagaimana memasukkan biaya marketplace?', 'Tambahkan ke biaya per unit sebagai angka yang Anda ketahui sendiri.'],
    ],
    related: ['margin', 'markup', 'hpp'],
    calc: function (v) {
      const harga = v.biaya / (1 - v.margin / 100), laba = harga - v.biaya, markup = v.margin / (100 - v.margin) * 100;
      return { summary: [S('Harga jual', fmtRp(harga), true), S('Laba per unit', fmtRp(laba)), S('Markup setara', fmtPct(markup, 2)), S('Laba per bulan', fmtRp(laba * v.unit))], tables: [], notes: ['Hasil dibulatkan hanya saat ditampilkan; Anda mungkin membulatkan harga ke angka yang lebih rapi.'], warnings: [], raw: { harga: harga, markup: markup } };
    },
  });

  E({
    id: 'bep', cluster: 'usaha', name: 'Kalkulator Break Even Point (BEP)',
    intro: 'Hitung titik impas dalam unit dan rupiah dari biaya tetap, harga jual, dan biaya variabel per unit.',
    fields: [
      F('tetap', 'Biaya tetap per bulan', 'rp', 5000000, { min: 0, max: 1e12, hint: 'Sewa, gaji tetap, dan biaya lain yang tidak berubah dengan volume.' }),
      F('harga', 'Harga jual per unit', 'rp', 50000, { min: 1, max: 1e11 }),
      F('variabel', 'Biaya variabel per unit', 'rp', 30000, { min: 0, max: 1e11, hint: 'Bahan, kemasan, dan biaya lain yang naik dengan volume.' }),
      F('target', 'Target laba per bulan (opsional)', 'rp', 0, { min: 0, max: 1e12, hint: 'Isi 0 jika hanya ingin titik impas.' }),
    ],
    check: function (v) { return v.harga <= v.variabel ? { harga: 'Harga jual harus lebih besar dari biaya variabel.' } : {}; },
    method: [
      'Kontribusi per unit = harga − biaya variabel. BEP (unit) = biaya tetap ÷ kontribusi per unit, dibulatkan ke atas. BEP (rupiah) = BEP unit × harga.',
      'Unit untuk target laba = (biaya tetap + target laba) ÷ kontribusi per unit, dibulatkan ke atas.',
    ],
    assumptions: ['Harga dan biaya variabel per unit tetap berapa pun volumenya.', 'Biaya tetap tidak berubah pada rentang volume yang dilihat.'],
    faq: [
      ['Apa itu BEP?', 'Titik penjualan di mana total pendapatan sama dengan total biaya, sehingga laba nol.'],
      ['Mengapa harga harus lebih besar dari biaya variabel?', 'Jika tidak, setiap unit terjual menambah kerugian dan titik impas tidak akan tercapai.'],
    ],
    related: ['margin', 'hpp', 'harga-margin'],
    calc: function (v) {
      const cm = v.harga - v.variabel, bepU = ceilN(v.tetap / cm), bepRp = bepU * v.harga;
      const s = [S('BEP (unit per bulan)', fmtNum(bepU), true), S('BEP (pendapatan per bulan)', fmtRp(bepRp), true), S('Kontribusi per unit', fmtRp(cm)), S('Rasio kontribusi', fmtPct(cm / v.harga * 100, 2))];
      if (v.target > 0) s.push(S('Unit untuk mencapai target laba', fmtNum(ceilN((v.tetap + v.target) / cm)), true));
      const rows = [0.5, 1, 1.5, 2].map(function (f) {
        const u = Math.ceil(bepU * f);
        return [fmtNum(u), fmtRp(u * v.harga), fmtRp(u * cm - v.tetap)];
      });
      return { summary: s, tables: [{ caption: 'Laba pada berbagai volume', cols: ['Unit terjual', 'Pendapatan', 'Laba / (rugi)'], rows: rows }], notes: [], warnings: [], raw: { bepU: bepU, bepRp: bepRp } };
    },
  });

  // ---------- GAJI (semua potongan = input pengguna) ----------
  const GAJI_NOTE = 'Kalkulator ini tidak menghitung PPh 21, iuran BPJS, PTKP, atau pesangon menurut peraturan. Semua potongan dan komponen adalah angka yang Anda isi sendiri.';

  E({
    id: 'gaji-bersih', cluster: 'gaji', name: 'Gaji Kotor ke Gaji Bersih (Potongan Input Sendiri)',
    intro: 'Hitung gaji bersih (take home pay) dari gaji kotor dengan potongan yang Anda isi sendiri sesuai slip gaji.',
    fields: [
      F('pokok', 'Gaji pokok', 'rp', 10000000, { min: 0, max: 1e10 }),
      F('tetap', 'Tunjangan tetap', 'rp', 0, { min: 0, max: 1e10 }),
      F('tidakTetap', 'Tunjangan tidak tetap / lembur', 'rp', 0, { min: 0, max: 1e10 }),
      F('iuran', 'Potongan iuran (BPJS, dll.)', 'pct', 3, { min: 0, max: 100, hint: 'Persentase contoh dari penghasilan kotor. Samakan dengan slip gaji Anda.' }),
      F('pajak', 'Potongan pajak', 'pct', 0, { min: 0, max: 100, hint: 'Persentase yang Anda isi sendiri. Bukan hasil perhitungan PPh 21.' }),
      F('potLain', 'Potongan lain (pinjaman, koperasi, dll.)', 'rp', 0, { min: 0, max: 1e10 }),
    ],
    method: ['Penghasilan kotor = gaji pokok + tunjangan tetap + tunjangan tidak tetap. Potongan iuran dan pajak = persentase yang Anda isi × penghasilan kotor. Gaji bersih = kotor − iuran − pajak − potongan lain.'],
    assumptions: [GAJI_NOTE, 'Persentase potongan dikenakan atas penghasilan kotor secara sederhana; di dunia nyata dasar pengenaan dapat berbeda.'],
    faq: [
      ['Apakah ini menghitung PPh 21 dan BPJS yang benar?', 'Tidak. Anda mengisi sendiri persentase potongan. Untuk perhitungan sesuai peraturan, rujuk peraturan resmi atau bagian payroll.'],
      ['Mengapa gaji bersih saya berbeda dengan slip?', 'Dasar pengenaan, batas upah, dan komponen potongan di slip bisa berbeda dari penyederhanaan di sini.'],
    ],
    related: ['gaji-tahunan', 'pesangon'],
    calc: function (v) {
      const bruto = v.pokok + v.tetap + v.tidakTetap, iur = bruto * v.iuran / 100, pjk = bruto * v.pajak / 100, net = bruto - iur - pjk - v.potLain;
      return {
        summary: [S('Gaji bersih per bulan', fmtRp(net), true), S('Penghasilan kotor', fmtRp(bruto)), S('Total potongan', fmtRp(iur + pjk + v.potLain))],
        tables: [{ caption: 'Rincian', cols: ['Komponen', 'Nilai'], rows: [['Gaji pokok', fmtRp(v.pokok)], ['Tunjangan tetap', fmtRp(v.tetap)], ['Tunjangan tidak tetap / lembur', fmtRp(v.tidakTetap)], ['Penghasilan kotor', fmtRp(bruto)], ['Potongan iuran (' + fmtTrim(v.iuran) + '%)', '-' + fmtRp(iur)], ['Potongan pajak (' + fmtTrim(v.pajak) + '%)', '-' + fmtRp(pjk)], ['Potongan lain', '-' + fmtRp(v.potLain)], ['Gaji bersih', fmtRp(net)]] }],
        notes: [GAJI_NOTE], warnings: net < 0 ? ['Total potongan melebihi penghasilan kotor.'] : [], raw: { bruto: bruto, net: net },
      };
    },
  });

  E({
    id: 'gaji-tahunan', cluster: 'gaji', name: 'Penghasilan Setahun dari Gaji Bulanan dan Bonus',
    intro: 'Hitung total penghasilan setahun dari gaji bulanan, bonus dalam satuan bulan gaji, dan bonus lain, dengan potongan yang Anda isi sendiri.',
    fields: [
      F('gaji', 'Gaji kotor per bulan', 'rp', 10000000, { min: 0, max: 1e10 }),
      F('bulanBonus', 'Bonus / THR dalam bulan gaji', 'num', 1, { unit: 'bulan', min: 0, max: 24, hint: 'Boleh desimal, mis. 1,5.' }),
      F('bonusLain', 'Bonus lain sekali setahun', 'rp', 0, { min: 0, max: 1e11 }),
      F('potongan', 'Perkiraan total potongan', 'pct', 5, { min: 0, max: 100, hint: 'Persentase contoh dari penghasilan kotor setahun. Bukan hasil perhitungan pajak.' }),
    ],
    method: ['Kotor setahun = gaji × 12 + gaji × bulan bonus + bonus lain. Potongan = persentase yang Anda isi × kotor setahun. Bersih setahun = kotor − potongan. Rata-rata per bulan = bersih ÷ 12.'],
    assumptions: [GAJI_NOTE, 'Gaji tetap sepanjang tahun.'],
    faq: [
      ['Apakah THR dihitung otomatis?', 'Tidak. Isi bonus/THR dalam jumlah bulan gaji sesuai yang Anda terima.'],
      ['Apakah potongan di sini sama dengan pajak?', 'Tidak. Itu persentase perkiraan yang Anda tentukan sendiri.'],
    ],
    related: ['gaji-bersih', 'pesangon'],
    calc: function (v) {
      const kotor = v.gaji * 12 + v.gaji * v.bulanBonus + v.bonusLain, pot = kotor * v.potongan / 100, net = kotor - pot;
      return {
        summary: [S('Penghasilan kotor setahun', fmtRp(kotor), true), S('Perkiraan potongan setahun', fmtRp(pot)), S('Perkiraan bersih setahun', fmtRp(net), true), S('Rata-rata bersih per bulan', fmtRp(net / 12))],
        tables: [{ caption: 'Rincian', cols: ['Komponen', 'Nilai'], rows: [['Gaji 12 bulan', fmtRp(v.gaji * 12)], ['Bonus (' + fmtTrim(v.bulanBonus) + ' bulan gaji)', fmtRp(v.gaji * v.bulanBonus)], ['Bonus lain', fmtRp(v.bonusLain)], ['Penghasilan kotor', fmtRp(kotor)]] }],
        notes: [GAJI_NOTE], warnings: [], raw: { kotor: kotor, net: net },
      };
    },
  });

  E({
    id: 'pesangon', cluster: 'gaji', name: 'Simulasi Komponen Pesangon (Input Sendiri)',
    intro: 'Simulasikan total pembayaran dari upah bulanan, jumlah bulan upah yang Anda tentukan, komponen lain, dan potongan. Ini bukan perhitungan pesangon menurut hukum.',
    fields: [
      F('upah', 'Upah per bulan yang dijadikan dasar', 'rp', 10000000, { min: 0, max: 1e10 }),
      F('bulan', 'Total komponen dalam bulan upah', 'num', 3, { unit: 'bulan', min: 0, max: 100, hint: 'Isi sesuai hasil hitungan resmi atau kesepakatan Anda. Boleh desimal.' }),
      F('lain', 'Komponen lain (cuti, penggantian, dll.)', 'rp', 0, { min: 0, max: 1e11 }),
      F('potongan', 'Potongan (pajak, pinjaman, dll.)', 'rp', 0, { min: 0, max: 1e11 }),
    ],
    method: ['Total sebelum potongan = upah × jumlah bulan + komponen lain. Total diterima = total sebelum potongan − potongan.'],
    assumptions: ['Jumlah bulan dan potongan sepenuhnya input Anda.', 'Tidak ada rumus pesangon, masa kerja, atau alasan PHK yang diterapkan.'],
    faq: [
      ['Apakah ini menghitung pesangon sesuai undang-undang?', 'Tidak. Gunakan peraturan resmi, perjanjian kerja, atau ahli ketenagakerjaan untuk jumlah yang sah.'],
      ['Untuk apa kalkulator ini?', 'Untuk mensimulasikan total uang yang diterima bila Anda sudah mengetahui jumlah bulan upah dan komponen lainnya.'],
    ],
    related: ['gaji-bersih', 'gaji-tahunan'],
    calc: function (v) {
      const sebelum = v.upah * v.bulan + v.lain, net = sebelum - v.potongan;
      return {
        summary: [S('Total diterima', fmtRp(net), true), S('Total sebelum potongan', fmtRp(sebelum)), S('Komponen dari bulan upah', fmtRp(v.upah * v.bulan))],
        tables: [], notes: ['Ini simulasi aritmetika dari angka yang Anda isi, bukan perhitungan pesangon menurut peraturan.'], warnings: net < 0 ? ['Potongan melebihi total komponen.'] : [], raw: { sebelum: sebelum, net: net },
      };
    },
  });

  // ---------- KONSTRUKSI ----------
  const KONS_NOTE = 'Estimasi kasar berdasarkan geometri sederhana. Pola pemasangan, potongan, kondisi lapangan, dan spesifikasi produk dapat mengubah kebutuhan nyata.';
  function costRow(total, label) { return total > 0 ? [S(label, fmtRp(total), true)] : []; }
  function priceNote(h) { return h > 0 ? [] : ['Isi harga satuan untuk melihat estimasi biaya. Harga tidak diisi otomatis karena berbeda di setiap toko dan wilayah.']; }

  E({
    id: 'keramik', cluster: 'konstruksi', name: 'Kalkulator Kebutuhan Keramik / Ubin',
    intro: 'Hitung jumlah ubin dan dus keramik dari ukuran ruangan, ukuran ubin, isi per dus, dan faktor cadangan.',
    fields: [
      F('p', 'Panjang ruangan', 'num', 4, { unit: 'm', min: 0.1, max: 1000 }),
      F('l', 'Lebar ruangan', 'num', 3, { unit: 'm', min: 0.1, max: 1000 }),
      F('ua', 'Ukuran ubin: sisi pertama', 'num', 40, { unit: 'cm', min: 5, max: 300 }),
      F('ub', 'Ukuran ubin: sisi kedua', 'num', 40, { unit: 'cm', min: 5, max: 300 }),
      F('isi', 'Isi per dus', 'int', 6, { unit: 'pcs', min: 1, max: 200, hint: 'Cek kemasan produk yang Anda beli.' }),
      F('cadangan', 'Cadangan untuk potongan dan pecah', 'pct', 10, { min: 0, max: 50, hint: 'Dapat diubah sesuai pola pemasangan.' }),
      F('harga', 'Harga per dus (opsional)', 'rp', 0, { min: 0, max: 1e9, hint: 'Isi untuk melihat estimasi biaya. 0 = tidak dihitung.' }),
    ],
    method: ['Luas = panjang × lebar. Luas satu ubin = (sisi 1 × sisi 2) ÷ 10.000 m². Ubin dasar = luas ÷ luas ubin. Ubin dengan cadangan = ubin dasar × (1 + cadangan), dibulatkan ke atas. Dus = ubin ÷ isi per dus, dibulatkan ke atas.'],
    assumptions: [KONS_NOTE, 'Luas ruangan persegi panjang tanpa pengurang (kolom, bukaan).', 'Nat, perekat, dan plint tidak dihitung.'],
    faq: [
      ['Berapa cadangan yang sebaiknya dipakai?', 'Tergantung pola pemasangan dan bentuk ruangan. Nilai awal hanya contoh; Anda dapat mengubahnya.'],
      ['Apakah hasil sudah termasuk nat dan perekat?', 'Tidak. Hanya ubin dan dus yang dihitung.'],
    ],
    related: ['cat', 'bata', 'beton'],
    calc: function (v) {
      const luas = v.p * v.l, uLuas = v.ua * v.ub / 10000, dasar = ceilN(luas / uLuas), pcs = ceilN(luas / uLuas * (1 + v.cadangan / 100)), dus = ceilN(pcs / v.isi), total = dus * v.harga;
      return { summary: [S('Kebutuhan dus', fmtNum(dus), true), S('Jumlah ubin dengan cadangan', fmtNum(pcs)), S('Jumlah ubin tanpa cadangan', fmtNum(dasar)), S('Luas lantai', fmtNum(luas, 2) + ' m²')].concat(costRow(total, 'Estimasi biaya ubin')), tables: [], notes: [KONS_NOTE].concat(priceNote(v.harga)), warnings: [], raw: { luas: luas, dasar: dasar, pcs: pcs, dus: dus } };
    },
  });

  E({
    id: 'cat', cluster: 'konstruksi', name: 'Kalkulator Kebutuhan Cat Dinding',
    intro: 'Hitung kebutuhan cat dari luas dinding, jumlah lapis, daya sebar produk, isi kaleng, dan faktor cadangan.',
    fields: [
      F('luas', 'Luas dinding yang dicat', 'num', 60, { unit: 'm²', min: 0.1, max: 100000 }),
      F('lapis', 'Jumlah lapis', 'int', 2, { unit: 'lapis', min: 1, max: 10 }),
      F('daya', 'Daya sebar cat', 'num', 10, { unit: 'm² per liter', min: 1, max: 50, hint: 'Lihat label produk. Angka awal hanya contoh.' }),
      F('kaleng', 'Isi per kaleng', 'num', 5, { unit: 'liter', min: 0.1, max: 100 }),
      F('cadangan', 'Cadangan', 'pct', 10, { min: 0, max: 50 }),
      F('harga', 'Harga per kaleng (opsional)', 'rp', 0, { min: 0, max: 1e9, hint: 'Isi untuk melihat estimasi biaya. 0 = tidak dihitung.' }),
    ],
    method: ['Liter = luas × lapis ÷ daya sebar × (1 + cadangan). Kaleng = liter ÷ isi per kaleng, dibulatkan ke atas.'],
    assumptions: [KONS_NOTE, 'Luas sudah dikurangi pintu dan jendela oleh Anda.', 'Cat dasar, plamir, dan alat tidak dihitung.'],
    faq: [
      ['Dari mana daya sebar?', 'Dari label atau lembar data produk. Angka awal hanya contoh.'],
      ['Apakah dinding kasar butuh lebih banyak cat?', 'Biasanya ya. Naikkan cadangan sesuai kondisi permukaan.'],
    ],
    related: ['keramik', 'bata', 'beton'],
    calc: function (v) {
      const liter = v.luas * v.lapis / v.daya * (1 + v.cadangan / 100), k = ceilN(liter / v.kaleng), total = k * v.harga;
      return { summary: [S('Kebutuhan kaleng', fmtNum(k), true), S('Kebutuhan cat', fmtNum(liter, 2) + ' liter'), S('Luas efektif dicat', fmtNum(v.luas * v.lapis, 2) + ' m² (semua lapis)')].concat(costRow(total, 'Estimasi biaya cat')), tables: [], notes: [KONS_NOTE].concat(priceNote(v.harga)), warnings: [], raw: { liter: liter, kaleng: k } };
    },
  });

  E({
    id: 'bata', cluster: 'konstruksi', name: 'Kalkulator Kebutuhan Bata / Blok Dinding',
    intro: 'Hitung jumlah bata atau blok per m² dan total untuk luas dinding tertentu, memperhitungkan tebal adukan dan cadangan.',
    fields: [
      F('luas', 'Luas dinding', 'num', 30, { unit: 'm²', min: 0.1, max: 100000 }),
      F('pb', 'Panjang sisi tampak bata/blok', 'num', 23, { unit: 'cm', min: 5, max: 200 }),
      F('tb', 'Tinggi sisi tampak bata/blok', 'num', 5, { unit: 'cm', min: 2, max: 100, hint: 'Sesuaikan dengan cara pemasangan Anda.' }),
      F('adukan', 'Tebal adukan / perekat', 'num', 1, { unit: 'cm', min: 0, max: 5 }),
      F('cadangan', 'Cadangan', 'pct', 5, { min: 0, max: 50 }),
      F('harga', 'Harga per buah (opsional)', 'rp', 0, { min: 0, max: 1e7, hint: 'Isi untuk melihat estimasi biaya. 0 = tidak dihitung.' }),
    ],
    method: ['Bata per m² = 10.000 ÷ ((panjang + adukan) × (tinggi + adukan)), ukuran dalam cm. Total = luas × bata per m² × (1 + cadangan), dibulatkan ke atas.'],
    assumptions: [KONS_NOTE, 'Ukuran produk adalah contoh; ganti dengan ukuran produk Anda.', 'Kebutuhan semen, pasir, atau perekat tidak dihitung.'],
    faq: [
      ['Mengapa tebal adukan memengaruhi jumlah?', 'Adukan menambah jarak antar bata sehingga jumlah bata per m² berkurang.'],
      ['Apakah bukaan pintu dan jendela dikurangkan?', 'Tidak otomatis. Kurangi dari luas dinding sebelum mengisi.'],
    ],
    related: ['keramik', 'cat', 'beton'],
    calc: function (v) {
      const per = 10000 / ((v.pb + v.adukan) * (v.tb + v.adukan)), dasar = ceilN(v.luas * per), total = ceilN(v.luas * per * (1 + v.cadangan / 100)), biaya = total * v.harga;
      return { summary: [S('Kebutuhan dengan cadangan', fmtNum(total) + ' buah', true), S('Kebutuhan per m²', fmtNum(per, 2) + ' buah'), S('Kebutuhan tanpa cadangan', fmtNum(dasar) + ' buah')].concat(costRow(biaya, 'Estimasi biaya bata/blok')), tables: [], notes: [KONS_NOTE].concat(priceNote(v.harga)), warnings: [], raw: { per: per, total: total } };
    },
  });

  E({
    id: 'beton', cluster: 'konstruksi', name: 'Kalkulator Volume Beton Pelat',
    intro: 'Hitung volume beton untuk pelat persegi panjang dari panjang, lebar, tebal, dan faktor cadangan.',
    fields: [
      F('p', 'Panjang', 'num', 4, { unit: 'm', min: 0.1, max: 1000 }),
      F('l', 'Lebar', 'num', 3, { unit: 'm', min: 0.1, max: 1000 }),
      F('t', 'Tebal', 'num', 12, { unit: 'cm', min: 1, max: 200 }),
      F('cadangan', 'Cadangan', 'pct', 5, { min: 0, max: 50 }),
      F('harga', 'Harga per m³ (opsional)', 'rp', 0, { min: 0, max: 1e10, hint: 'Isi untuk melihat estimasi biaya. 0 = tidak dihitung.' }),
    ],
    method: ['Volume = panjang × lebar × tebal (cm ÷ 100). Volume dengan cadangan = volume × (1 + cadangan). Biaya = volume dengan cadangan × harga per m³.'],
    assumptions: [KONS_NOTE, 'Bentuk pelat persegi panjang dengan tebal merata.', 'Tulangan, bekisting, dan mutu beton tidak dihitung.'],
    faq: [
      ['Apakah hasil ini komposisi semen, pasir, dan kerikil?', 'Tidak. Hanya volume beton. Komposisi campuran bergantung pada mutu yang direncanakan.'],
      ['Mengapa ada cadangan?', 'Untuk menutup ketidakrataan dan kehilangan material. Angka awal hanya contoh.'],
    ],
    related: ['keramik', 'cat', 'bata'],
    calc: function (v) {
      const vol = v.p * v.l * v.t / 100, tot = vol * (1 + v.cadangan / 100), biaya = tot * v.harga;
      return { summary: [S('Volume dengan cadangan', fmtNum(tot, 3) + ' m³', true), S('Volume tanpa cadangan', fmtNum(vol, 3) + ' m³'), S('Luas pelat', fmtNum(v.p * v.l, 2) + ' m²')].concat(costRow(biaya, 'Estimasi biaya beton')), tables: [], notes: [KONS_NOTE].concat(priceNote(v.harga)), warnings: [], raw: { vol: vol, tot: tot } };
    },
  });

  // ---------- eksekusi, validasi, render ----------
  LC.defaults = function (engine) {
    const o = {};
    engine.fields.forEach(function (f) { o[f.id] = f.def; });
    return o;
  };
  LC.run = function (engine, raw) {
    const errors = {}, vals = {};
    engine.fields.forEach(function (f) {
      const n = parseNum(raw[f.id]);
      if (isNaN(n)) { errors[f.id] = 'Isi dengan angka yang valid.'; return; }
      if (f.kind === 'int' && Math.floor(n) !== n) { errors[f.id] = 'Isi dengan bilangan bulat.'; return; }
      if (f.min != null && n < f.min) { errors[f.id] = 'Minimal ' + fmtTrim(f.min) + '.'; return; }
      if (f.max != null && n > f.max) { errors[f.id] = 'Maksimal ' + fmtTrim(f.max) + '.'; return; }
      vals[f.id] = n;
    });
    if (Object.keys(errors).length === 0 && engine.check) Object.assign(errors, engine.check(vals) || {});
    if (Object.keys(errors).length) return { ok: false, errors: errors };
    return { ok: true, errors: {}, vals: vals, res: engine.calc(vals) };
  };
  LC.rawFrom = function (engine, values) {
    const r = {};
    engine.fields.forEach(function (f) { r[f.id] = plain(values[f.id]); });
    return r;
  };

  LC.renderForm = function (h, engine, values) {
    return engine.fields.map(function (f) {
      const id = 'f-' + f.id;
      const n = values[f.id];
      return h('div', { class: 'field' },
        h('label', { 'for': id }, f.label),
        h('div', { class: 'inp' },
          f.kind === 'rp' ? h('span', { class: 'pre', 'aria-hidden': 'true' }, 'Rp') : null,
          h('input', { id: id, name: f.id, type: 'text', inputmode: f.kind === 'int' ? 'numeric' : 'decimal', autocomplete: 'off', value: plain(n), 'aria-describedby': id + '-hint ' + id + '-err', 'aria-invalid': 'false' }),
          f.unit ? h('span', { class: 'suf', 'aria-hidden': 'true' }, f.unit) : null),
        h('p', { class: 'hint', id: id + '-hint' }, f.hint || '', f.kind === 'rp' ? h('span', { class: 'eq', id: id + '-eq' }, ' = ' + fmtRp(n)) : null),
        h('p', { class: 'err', id: id + '-err', role: 'alert' }));
    });
  };
  LC.renderTable = function (h, t, mode) {
    const limit = t.limit || 0, full = mode === 'full';
    const rows = (!full && limit) ? t.rows.slice(0, limit) : t.rows;
    const more = limit && t.rows.length > limit;
    return h('div', { class: 'tblwrap' },
      h('div', { class: 'tbl' }, h('table', null,
        h('caption', null, t.caption + ((!full && more) ? ' (menampilkan ' + limit + ' dari ' + t.rows.length + ' baris)' : '')),
        h('thead', null, h('tr', null, t.cols.map(function (c) { return h('th', { scope: 'col' }, c); }))),
        h('tbody', null, rows.map(function (r, i) {
          return h('tr', { class: (limit && i >= limit) ? 'extra' : null, hidden: (full && limit && i >= limit) ? true : null },
            r.map(function (c, j) {
              return j === 0 ? h('th', { scope: 'row', 'data-label': t.cols[0] }, c) : h('td', { 'class': 'num', 'data-label': t.cols[j] }, c);
            }));
        })))),
      (full && more) ? h('button', { type: 'button', 'class': 'btn sec small', 'data-act': 'expand', 'data-n': String(t.rows.length) }, 'Tampilkan semua ' + t.rows.length + ' baris') : null);
  };
  LC.renderResult = function (h, res, mode) {
    return h('div', { class: 'res' },
      res.warnings.map(function (w) { return h('p', { class: 'warn', role: 'status' }, w); }),
      h('dl', { class: 'sum' }, res.summary.map(function (s) {
        return h('div', { class: 'sum-row' + (s.strong ? ' strong' : '') }, h('dt', null, s.l), h('dd', null, s.v));
      })),
      res.tables.map(function (t) { return LC.renderTable(h, t, mode); }),
      res.notes.length ? h('ul', { class: 'notes' }, res.notes.map(function (n) { return h('li', null, n); })) : null);
  };
  return LC;
}

// =====================================================================
// 3. KODE KLIEN (dikirim sebagai app.js). Tanpa innerHTML: semua DOM via createElement.
// =====================================================================
function LC_CLIENT(LC) {
  'use strict';
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      el.setAttribute(k, v === true ? '' : String(v));
    });
    (function add(list) {
      list.forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        if (Array.isArray(c)) { add(c); return; }
        el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
      });
    })(Array.prototype.slice.call(arguments, 2));
    return el;
  }
  const root = document.body.getAttribute('data-root') || './';

  // ---- pencarian instan di direktori ----
  const q = document.getElementById('q');
  if (q && window.LC_INDEX) {
    const list = document.getElementById('q-res'), count = document.getElementById('q-count');
    const idx = window.LC_INDEX.map(function (r) { return { t: r[0], p: r[1], c: r[2], k: r[0].toLowerCase() + ' ' + r[2].toLowerCase() }; });
    const run = function () {
      const terms = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      list.textContent = '';
      if (!terms.length) { count.textContent = ''; return; }
      const hit = idx.filter(function (r) { return terms.every(function (t) { return r.k.indexOf(t) > -1; }); });
      count.textContent = hit.length ? hit.length + ' halaman ditemukan' + (hit.length > 30 ? ' (30 teratas ditampilkan)' : '') + '.' : 'Tidak ada kalkulator yang cocok.';
      hit.slice(0, 30).forEach(function (r) {
        list.appendChild(h('li', null, h('a', { href: root + r.p }, r.t), h('span', { 'class': 'tag' }, r.c)));
      });
    };
    q.addEventListener('input', run);
    q.form && q.form.addEventListener('submit', function (e) { e.preventDefault(); run(); });
  }

  // ---- kalkulator ----
  const cfgEl = document.getElementById('lc-config');
  if (!cfgEl) return;
  const cfg = JSON.parse(cfgEl.textContent);
  const engine = LC.engines[cfg.engine];
  if (!engine) return;
  const form = document.getElementById('calc-form'), out = document.getElementById('result'), status = document.getElementById('status');
  const cmp = document.getElementById('compare'), btnClear = document.getElementById('btn-clear');
  let last = null, saved = null;

  function say(msg) { status.textContent = msg; }
  function readRaw() {
    const r = {};
    engine.fields.forEach(function (f) { r[f.id] = document.getElementById('f-' + f.id).value; });
    return r;
  }
  function renderCompare() {
    cmp.textContent = '';
    if (!saved || !last) return;
    const map = {};
    saved.forEach(function (s) { map[s.l] = s.v; });
    const rows = last.summary.map(function (s) { return [s.l, map[s.l] || '-', s.v]; });
    cmp.appendChild(h('h3', null, 'Perbandingan skenario'));
    cmp.appendChild(LC.renderTable(h, { caption: 'Skenario A (tersimpan) dibanding isian saat ini', cols: ['Ukuran', 'Skenario A', 'Sekarang'], rows: rows }, 'full'));
  }
  function update() {
    const r = LC.run(engine, readRaw());
    engine.fields.forEach(function (f) {
      const inp = document.getElementById('f-' + f.id), err = document.getElementById('f-' + f.id + '-err'), eq = document.getElementById('f-' + f.id + '-eq');
      const msg = r.errors[f.id] || '';
      err.textContent = msg;
      inp.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (eq) { const n = LC.parseNum(inp.value); eq.textContent = isNaN(n) ? '' : ' = ' + LC.fmtRp(n); }
    });
    out.textContent = '';
    if (!r.ok) {
      last = null;
      out.appendChild(h('p', { 'class': 'warn', role: 'status' }, 'Periksa kembali isian yang ditandai.'));
      renderCompare();
      return;
    }
    last = r.res;
    out.appendChild(LC.renderResult(h, r.res, 'full'));
    renderCompare();
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function (ok, no) {
      const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0;left:-999px' });
      ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? ok() : no(); } catch (e) { no(e); }
      document.body.removeChild(ta);
    });
  }

  form.addEventListener('input', update);
  form.addEventListener('submit', function (e) { e.preventDefault(); update(); say('Hasil diperbarui.'); });
  document.getElementById('btn-reset').addEventListener('click', function () {
    engine.fields.forEach(function (f) { document.getElementById('f-' + f.id).value = LC.plain(cfg.values[f.id]); });
    update(); say('Isian dikembalikan ke nilai awal halaman ini.');
  });
  document.getElementById('btn-copy').addEventListener('click', function () {
    if (!last) { say('Perbaiki isian terlebih dahulu.'); return; }
    const lines = [cfg.title, ''].concat(last.summary.map(function (s) { return s.l + ': ' + s.v; }), ['', location.href]);
    copyText(lines.join('\n')).then(function () { say('Hasil disalin.'); }, function () { say('Gagal menyalin. Salin hasil secara manual.'); });
  });
  document.getElementById('btn-print').addEventListener('click', function () { window.print(); });
  document.getElementById('btn-save').addEventListener('click', function () {
    if (!last) { say('Perbaiki isian terlebih dahulu.'); return; }
    saved = last.summary.map(function (s) { return { l: s.l, v: s.v }; });
    btnClear.hidden = false; renderCompare();
    say('Skenario A disimpan (hanya di halaman ini). Ubah isian untuk membandingkan.');
  });
  btnClear.addEventListener('click', function () { saved = null; btnClear.hidden = true; renderCompare(); say('Skenario A dihapus.'); });
  out.addEventListener('click', function (e) {
    const b = e.target.closest ? e.target.closest('[data-act="expand"]') : null;
    if (!b) return;
    const wrap = b.parentNode, open = b.getAttribute('data-open') === '1';
    Array.prototype.forEach.call(wrap.querySelectorAll('tr.extra'), function (tr) { if (open) tr.setAttribute('hidden', ''); else tr.removeAttribute('hidden'); });
    b.setAttribute('data-open', open ? '0' : '1');
    b.textContent = open ? 'Tampilkan semua ' + b.getAttribute('data-n') + ' baris' : 'Ringkas tabel';
  });
  update();
}

// =====================================================================
// 4. CSS
// =====================================================================
const CSS = `
:root{--brand:#0b6b57;--brand-d:#08493c;--ink:#17202a;--muted:#46535f;--bg:#f4f7f6;--card:#fff;--line:#d3dcd8;--bad:#a8001c;--warn-bg:#fff4d6;--warn-ink:#5a3d00;--focus:#0b3d91;--r:12px}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--brand-d);text-underline-offset:2px}
a:hover{color:#000}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:4px}
.skip{position:absolute;left:-999px;top:0;background:#fff;padding:8px 12px;z-index:10}
.skip:focus{left:8px;top:8px}
.wrap{max-width:1080px;margin:0 auto;padding:0 16px}
header.site{background:#fff;border-bottom:1px solid var(--line)}
header.site .wrap{display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;padding-top:10px;padding-bottom:10px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:1.1rem;color:var(--ink);text-decoration:none;letter-spacing:.02em}
.brand svg{width:32px;height:32px}
nav.main ul{display:flex;flex-wrap:wrap;gap:4px 14px;list-style:none;margin:0;padding:0}
nav.main a{display:inline-block;padding:6px 2px;color:var(--ink);text-decoration:none;font-size:.95rem}
nav.main a:hover,nav.main a[aria-current]{text-decoration:underline;color:var(--brand-d)}
main{padding:20px 0 40px}
h1{font-size:1.65rem;line-height:1.25;margin:.4em 0 .3em}
h2{font-size:1.25rem;line-height:1.3;margin:1.6em 0 .5em}
h3{font-size:1.05rem;margin:1.2em 0 .4em}
.lead{color:var(--muted);font-size:1.05rem;max-width:70ch}
.crumbs{font-size:.88rem;color:var(--muted)}
.crumbs ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px}
.crumbs li+li::before{content:"/";margin-right:4px;color:var(--muted)}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px}
.card h2{margin-top:0}
.calc{display:grid;gap:16px;grid-template-columns:1fr;margin-top:16px}
@media(min-width:900px){.calc{grid-template-columns:minmax(0,5fr) minmax(0,6fr);align-items:start}}
.field{margin-bottom:14px}
.field label{display:block;font-weight:600;margin-bottom:4px}
.inp{display:flex;align-items:stretch;border:1px solid #6b7882;border-radius:8px;background:#fff;overflow:hidden}
.inp:focus-within{outline:3px solid var(--focus);outline-offset:1px}
.inp input{flex:1;min-width:0;border:0;padding:11px 12px;font:inherit;font-size:1.05rem;background:transparent;color:var(--ink)}
.inp input:focus{outline:0}
.inp input[aria-invalid=true]{background:#fff0f2}
.pre,.suf{display:flex;align-items:center;padding:0 10px;background:#eef2f0;color:var(--muted);font-size:.9rem;white-space:nowrap}
.hint{margin:4px 0 0;font-size:.86rem;color:var(--muted)}
.err{margin:4px 0 0;font-size:.9rem;color:var(--bad);font-weight:600}
.err:empty{display:none}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.btn{font:inherit;font-weight:600;padding:10px 16px;border-radius:8px;border:2px solid var(--brand);background:var(--brand);color:#fff;cursor:pointer;min-height:44px}
.btn:hover{background:var(--brand-d);border-color:var(--brand-d)}
.btn.sec{background:#fff;color:var(--brand-d)}
.btn.sec:hover{background:#e7f1ee}
.btn.small{min-height:36px;padding:6px 12px;margin-top:8px}
.btn[hidden]{display:none}
.sum{margin:0}
.sum-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)}
.sum-row dt{color:var(--muted)}
.sum-row dd{margin:0;font-weight:600;text-align:right}
.sum-row.strong dd{font-size:1.25rem;color:var(--brand-d)}
.warn{background:var(--warn-bg);color:var(--warn-ink);border-radius:8px;padding:10px 12px;margin:0 0 10px}
.notes{color:var(--muted);font-size:.9rem;padding-left:20px}
.muted{color:var(--muted)}
.tblwrap{margin-top:16px}
.tbl{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.92rem}
caption{text-align:left;font-weight:600;padding-bottom:6px}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
thead th{background:#eef2f0}
td.num{text-align:right;font-variant-numeric:tabular-nums}
tr[hidden]{display:none}
@media(max-width:600px){
 .tbl{overflow:visible}
 table,tbody,tr,th,td{display:block}
 thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
 tr{border:1px solid var(--line);border-radius:8px;margin-bottom:8px;overflow:hidden;background:#fff}
 tr[hidden]{display:none}
 tbody th{background:#eef2f0;border:0}
 tbody th::before{content:attr(data-label) " ";font-weight:400;color:var(--muted)}
 td{display:flex;justify-content:space-between;gap:12px;border:0;border-top:1px solid var(--line)}
 td::before{content:attr(data-label);color:var(--muted);text-align:left}
 .sum-row{flex-direction:column;gap:2px}
 .sum-row dd{text-align:left}
}
section.block{margin-top:8px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));margin:0;padding:0;list-style:none}
.tool{display:block;height:100%;text-decoration:none;color:inherit}
.tool:hover{border-color:var(--brand)}
.tool .ic{width:36px;height:36px;color:var(--brand)}
.tool strong{display:block;margin:6px 0 2px}
.tool span.d{display:block;color:var(--muted);font-size:.9rem}
.search{display:flex;gap:8px;margin:12px 0}
.search input{flex:1;padding:12px;font:inherit;border:1px solid #6b7882;border-radius:8px;min-width:0}
.results{list-style:none;margin:0;padding:0}
.results li{padding:8px 0;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.tag{font-size:.78rem;color:var(--muted);border:1px solid var(--line);border-radius:99px;padding:0 8px}
ul.links{padding-left:20px}
ul.cols{columns:1;padding-left:20px;margin:8px 0}
@media(min-width:700px){ul.cols{columns:2}}
details{margin:8px 0}
summary{cursor:pointer;font-weight:600;padding:6px 0}
details.faq{background:#fff;border:1px solid var(--line);border-radius:8px;padding:2px 12px}
.disc{border-left:4px solid var(--brand);background:#fff;padding:10px 14px;border-radius:0 8px 8px 0}
.ad{margin:24px 0;text-align:center;min-height:90px}
.ad small{display:block;color:var(--muted)}
footer.site{background:#fff;border-top:1px solid var(--line);padding:20px 0;font-size:.9rem;color:var(--muted)}
footer.site ul{list-style:none;display:flex;flex-wrap:wrap;gap:6px 16px;padding:0;margin:0 0 10px}
@media(prefers-reduced-motion:no-preference){.tool{transition:border-color .15s}}
@media print{
 header.site,footer.site,.crumbs,#calc-form,.actions,.related,.noprint,.ad,nav,.skip{display:none!important}
 body{background:#fff;font-size:12pt}
 .card{border:0;padding:0}
 .calc{display:block}
 tr.extra[hidden]{display:table-row!important}
 a{color:#000;text-decoration:none}
}
`;

const FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0b6b57"/><rect x="7" y="5" width="18" height="7" rx="1.5" fill="#fff"/><g fill="#fff"><rect x="7" y="15" width="4.5" height="4.5" rx="1"/><rect x="13.75" y="15" width="4.5" height="4.5" rx="1"/><rect x="20.5" y="15" width="4.5" height="4.5" rx="1"/><rect x="7" y="22" width="4.5" height="4.5" rx="1"/><rect x="13.75" y="22" width="4.5" height="4.5" rx="1"/><rect x="20.5" y="22" width="4.5" height="4.5" rx="1"/></g></svg>';

const ICONS = {
  pinjaman: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  kpr: '<path d="M3 11l9-7 9 7v9H3z"/><path d="M10 20v-6h4v6"/>',
  usaha: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  gaji: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14h2"/>',
  konstruksi: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 12h18M9 5v7M15 12v7"/>',
};
function iconSvg(id) {
  return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + ICONS[id] + '</svg>';
}
const LOGO_SVG = FAVICON_SVG.replace('<svg ', '<svg aria-hidden="true" focusable="false" ');

const CLUSTERS = [
  { id: 'pinjaman', name: 'Pinjaman & Angsuran', short: 'Pinjaman', desc: 'Simulasi cicilan dengan bunga anuitas, flat, dan 0%, lengkap dengan tabel angsuran dan perbandingan metode.',
    disclaimer: 'Hasil adalah simulasi matematis dari angka yang Anda isi. Penawaran nyata dapat memakai metode perhitungan, biaya, asuransi, denda, dan pembulatan yang berbeda. Periksa simulasi resmi dan dokumen perjanjian sebelum mengambil keputusan.' },
  { id: 'kpr', name: 'KPR & Properti', short: 'KPR', desc: 'Simulasi KPR bunga tetap, fixed lalu floating, dan estimasi harga rumah yang terjangkau.',
    disclaimer: 'Hasil adalah simulasi matematis. Biaya seperti BPHTB, notaris/PPAT, provisi, asuransi, dan appraisal belum termasuk kecuali Anda mengisinya. Persetujuan kredit dan angka bunga ditentukan pemberi kredit.' },
  { id: 'usaha', name: 'Usaha, HPP, Margin & BEP', short: 'Usaha', desc: 'Hitung HPP, margin, markup, harga jual, dan titik impas (BEP) dengan rumus yang dibedakan dengan jelas.',
    disclaimer: 'Hasil bergantung pada kelengkapan biaya yang Anda masukkan. Biaya marketplace, pajak usaha, dan biaya lain tidak dihitung kecuali Anda memasukkannya sendiri.' },
  { id: 'gaji', name: 'Gaji, Potongan & Pesangon', short: 'Gaji', desc: 'Simulasi gaji kotor ke bersih, penghasilan setahun, dan komponen pesangon dengan potongan yang Anda isi sendiri.',
    disclaimer: 'Kalkulator di klaster ini TIDAK menghitung PPh 21, iuran BPJS, PTKP, atau pesangon menurut peraturan. Semua potongan dan komponen adalah angka yang Anda isi sendiri. Untuk perhitungan yang sah, rujuk peraturan resmi dan konsultasikan dengan bagian payroll, konsultan pajak, atau ahli ketenagakerjaan.' },
  { id: 'konstruksi', name: 'Konstruksi & Material', short: 'Konstruksi', desc: 'Estimasi kebutuhan keramik, cat, bata, dan volume beton dengan faktor cadangan yang dapat diubah.',
    disclaimer: 'Hasil adalah estimasi kasar berdasarkan geometri sederhana dan faktor cadangan yang Anda isi. Kondisi lapangan, pola pemasangan, dan spesifikasi produk dapat mengubah kebutuhan. Harga satuan harus Anda isi sendiri.' },
];
const CL = {};
CLUSTERS.forEach(function (c) { CL[c.id] = c; });

// =====================================================================
// 5. HELPER UMUM
// =====================================================================
const LC = LC_CORE();
const CORE_ENGINES = LC.order.map(function (id) { return LC.engines[id]; });

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const VOID_TAGS = new Set(['input', 'br', 'img', 'meta', 'link', 'hr']);
function flat(list, out) {
  out = out || [];
  for (const c of list) {
    if (Array.isArray(c)) flat(c, out);
    else if (c !== null && c !== undefined && c !== false) out.push(c);
  }
  return out;
}
function nodeH(tag, attrs, ...children) {
  let a = '';
  if (attrs) {
    for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      a += v === true ? ' ' + k : ' ' + k + '="' + esc(v) + '"';
    }
  }
  if (VOID_TAGS.has(tag)) return new Raw('<' + tag + a + '>');
  const inner = flat(children).map(function (c) { return c instanceof Raw ? c.s : esc(c); }).join('');
  return new Raw('<' + tag + a + '>' + inner + '</' + tag + '>');
}
function jsonForScript(o) {
  return JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
function nl(x) { return String(Math.round(x * 100) / 100).replace('.', ','); }
function jt(n) {
  if (n >= 1e9) return nl(n / 1e9) + ' miliar';
  if (n >= 1e6) return nl(n / 1e6) + ' juta';
  if (n >= 1e3) return nl(n / 1e3) + ' ribu';
  return nl(n);
}
function rpL(n) { return 'Rp' + jt(n); }
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
const RP = LC.fmtRp;

// =====================================================================
// 6. GENERATOR PRESET (halaman turunan)
//    Catatan: ini HALAMAN PRESET (angka berbeda pada mesin yang sama),
//    bukan mesin kalkulator berbeda. Semua angka bunga/biaya = contoh.
// =====================================================================
function genPresets() {
  const out = [];
  function add(engine, slug, title, scenario, asm, values) { out.push({ engine: engine, slug: slugify(slug.join('-')), title: title, scenario: scenario, asm: asm, values: values }); }
  const EX = 'Angka ini hanyalah contoh skenario, bukan tarif atau penawaran produk tertentu. Ganti dengan angka Anda.';

  // --- pinjaman ---
  const AMTS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200].map(function (x) { return x * 1e6; });
  const TEN = [6, 12, 24, 36, 48, 60];
  AMTS.forEach(function (P) {
    TEN.forEach(function (n) {
      [9, 12, 15].forEach(function (r) {
        add('anuitas', [nl(P / 1e6), 'juta', n, 'bulan', r, 'persen'],
          'Cicilan Pinjaman ' + rpL(P) + ' ' + n + ' Bulan Bunga ' + r + '% per Tahun (Anuitas)',
          'Skenario: pinjaman ' + rpL(P) + ', tenor ' + n + ' bulan, bunga contoh ' + r + '% per tahun dengan metode anuitas (cicilan tetap, bunga dihitung dari sisa pokok). ' + EX,
          ['Bunga ' + r + '% per tahun adalah angka contoh.', 'Tidak ada denda, asuransi, atau biaya lain kecuali diisi pada kolom biaya admin.'],
          { plafon: P, tenor: n, bunga: r, admin: 0 });
      });
      [6, 9, 12].forEach(function (r) {
        add('flat', [nl(P / 1e6), 'juta', n, 'bulan', r, 'persen'],
          'Cicilan Pinjaman ' + rpL(P) + ' ' + n + ' Bulan Bunga Flat ' + r + '% per Tahun',
          'Skenario: pinjaman ' + rpL(P) + ', tenor ' + n + ' bulan, bunga flat contoh ' + r + '% per tahun (bunga dihitung dari pokok awal). Perkiraan bunga efektif setara ikut ditampilkan. ' + EX,
          ['Bunga flat ' + r + '% per tahun adalah angka contoh.', 'Tidak ada denda, asuransi, atau biaya lain kecuali diisi pada kolom biaya admin.'],
          { plafon: P, tenor: n, bunga: r, admin: 0 });
      });
      add('nol', [nl(P / 1e6), 'juta', n, 'bulan'],
        'Cicilan ' + rpL(P) + ' ' + n + ' Bulan Tanpa Bunga (0%)',
        'Skenario: cicilan ' + rpL(P) + ' selama ' + n + ' bulan tanpa bunga. Isi biaya admin bila ada biaya lain yang Anda ketahui.',
        ['Bunga 0%.', 'Biaya admin (bila diisi) dibayar sekali dan tidak masuk cicilan.'],
        { plafon: P, tenor: n, admin: 0 });
    });
    [12, 24, 36, 48, 60].forEach(function (n) {
      add('bandingkan', [nl(P / 1e6), 'juta', n, 'bulan'],
        'Bandingkan Cicilan ' + rpL(P) + ' ' + n + ' Bulan: Anuitas vs Flat vs 0%',
        'Skenario: pinjaman ' + rpL(P) + ' tenor ' + n + ' bulan dengan bunga contoh 12% per tahun, dibandingkan pada tiga metode. ' + EX,
        ['Bunga 12% per tahun dipakai pada anuitas dan flat sebagai angka contoh.'],
        { plafon: P, tenor: n, bunga: 12 });
    });
  });

  // --- KPR ---
  const HARGA = [200, 300, 400, 500, 600, 750, 900, 1000, 1250, 1500, 2000].map(function (x) { return x * 1e6; });
  HARGA.forEach(function (H) {
    [10, 20, 30].forEach(function (dp) {
      [10, 15, 20, 25].forEach(function (t) {
        add('kpr-tetap', [nl(H / 1e6), 'juta', 'dp', dp, t, 'tahun'],
          'Simulasi KPR Rumah ' + rpL(H) + ' DP ' + dp + '% Tenor ' + t + ' Tahun',
          'Skenario: rumah ' + rpL(H) + ', uang muka ' + dp + '%, tenor ' + t + ' tahun, bunga tetap contoh 9% per tahun. ' + EX,
          ['Bunga tetap 9% per tahun adalah angka contoh.', 'Biaya awal lain tidak dihitung kecuali diisi.'],
          { harga: H, dp: dp, tenor: t, bunga: 9, biayaLain: 0 });
      });
    });
    [15, 20, 25].forEach(function (t) {
      [3, 5].forEach(function (f) {
        add('kpr-fixfloat', [nl(H / 1e6), 'juta', t, 'tahun', 'fixed', f, 'tahun'],
          'KPR ' + rpL(H) + ' Tenor ' + t + ' Tahun: Fixed ' + f + ' Tahun lalu Floating',
          'Skenario: rumah ' + rpL(H) + ', uang muka 20%, tenor ' + t + ' tahun. Bunga fixed contoh 7% selama ' + f + ' tahun, lalu bunga floating asumsi 11% pada sisa tenor dengan angsuran dihitung ulang. ' + EX,
          ['Bunga fixed 7% dan floating 11% adalah angka contoh.', 'Bunga floating diasumsikan tetap selama masa floating.'],
          { harga: H, dp: 20, tenor: t, fix: f, bungaFix: 7, bungaFloat: 11 });
      });
    });
  });
  [5, 7.5, 10, 15, 20, 30, 40, 50].forEach(function (inc) {
    [15, 20, 25, 30].forEach(function (t) {
      add('kpr-mampu', [nl(inc), 'juta', t, 'tahun'],
        'Penghasilan ' + rpL(inc * 1e6) + ' per Bulan: Estimasi Harga Rumah Terjangkau Tenor ' + t + ' Tahun',
        'Skenario: penghasilan ' + rpL(inc * 1e6) + ' per bulan, batas cicilan contoh 30% dari penghasilan, tenor ' + t + ' tahun, bunga contoh 9%, uang muka 20%. ' + EX,
        ['Batas cicilan 30% adalah angka contoh pilihan halaman ini, bukan ketentuan resmi.', 'Bunga 9% adalah angka contoh.'],
        { income: inc * 1e6, kewajiban: 0, dsr: 30, tenor: t, bunga: 9, dp: 20 });
    });
  });

  // --- usaha ---
  const PRODUK = [
    ['Kopi Susu Botol', 'botol', 450000, 150000, 100000, 50], ['Brownies Panggang', 'kotak', 300000, 100000, 60000, 24],
    ['Kaos Sablon', 'pcs', 1500000, 500000, 200000, 50], ['Sambal Botol', 'botol', 400000, 120000, 80000, 60],
    ['Keripik Singkong Kemasan', 'bungkus', 350000, 100000, 70000, 80], ['Nasi Box', 'box', 600000, 200000, 100000, 50],
    ['Sabun Cuci Piring', 'botol', 250000, 80000, 60000, 40], ['Tas Jahit Tangan', 'pcs', 1200000, 800000, 150000, 20],
    ['Lilin Aromaterapi', 'pcs', 500000, 150000, 100000, 40], ['Kue Kering Toples', 'toples', 800000, 250000, 150000, 60],
    ['Donat', 'pcs', 400000, 150000, 100000, 100], ['Teh Kemasan Cup', 'cup', 500000, 150000, 120000, 100],
  ];
  PRODUK.forEach(function (p) {
    [0, 10].forEach(function (s) {
      add('hpp', [p[0], s ? 'susut-' + s : 'tanpa-susut'],
        'HPP ' + p[0] + ' per ' + p[1] + (s ? ' dengan Susut ' + s + '%' : '') + ': Simulasi Biaya Produksi',
        'Skenario: satu batch ' + p[0].toLowerCase() + ' menghasilkan ' + p[5] + ' ' + p[1] + ' dengan biaya bahan ' + RP(p[2]) + ', tenaga kerja ' + RP(p[3]) + ', dan overhead ' + RP(p[4]) + (s ? ', serta susut ' + s + '%' : '') + '. Seluruh biaya adalah contoh angka untuk simulasi, bukan data biaya nyata usaha tertentu.',
        ['Biaya bahan, tenaga, dan overhead adalah angka contoh.', 'Margin target 30% adalah angka contoh.'],
        { bahan: p[2], tenaga: p[3], overhead: p[4], unit: p[5], susut: s, margin: 30 });
    });
  });
  const HARGAS = [10000, 25000, 50000, 75000, 100000, 150000, 250000, 500000];
  HARGAS.forEach(function (hg) {
    [50, 60, 70, 75, 80].forEach(function (ratio) {
      const c = Math.round(hg * ratio / 100);
      add('margin', [hg, 'biaya', c],
        'Margin dan Markup: Harga Jual ' + RP(hg) + ', Biaya ' + RP(c),
        'Skenario: harga jual ' + RP(hg) + ' dengan biaya ' + RP(c) + ' per unit (' + ratio + '% dari harga). Halaman ini menunjukkan margin dan markup secara terpisah.',
        ['Biaya per unit adalah angka contoh.', 'Unit terjual per bulan (100) adalah angka contoh.'],
        { biaya: c, harga: hg, unit: 100 });
    });
    [20, 30, 40, 50, 100].forEach(function (m) {
      add('markup', [hg, 'markup', m],
        'Harga Jual dari Biaya ' + RP(hg) + ' dengan Markup ' + m + '%',
        'Skenario: biaya ' + RP(hg) + ' per unit dengan markup ' + m + '% (laba dihitung dari biaya). Margin yang dihasilkan ikut ditampilkan.',
        ['Biaya per unit adalah angka contoh.', 'Unit terjual per bulan (100) adalah angka contoh.'],
        { biaya: hg, markup: m, unit: 100 });
    });
    [20, 25, 30, 40, 50].forEach(function (m) {
      add('harga-margin', [hg, 'margin', m],
        'Harga Jual dari Biaya ' + RP(hg) + ' untuk Margin ' + m + '%',
        'Skenario: biaya ' + RP(hg) + ' per unit dengan margin target ' + m + '% (laba dihitung dari harga jual). Markup setara ikut ditampilkan.',
        ['Biaya per unit adalah angka contoh.', 'Unit terjual per bulan (100) adalah angka contoh.'],
        { biaya: hg, margin: m, unit: 100 });
    });
  });
  [1, 2, 3, 5, 7.5, 10, 15, 25].forEach(function (ft) {
    [[10000, 6000], [25000, 15000], [50000, 30000], [100000, 60000], [250000, 150000]].forEach(function (c) {
      add('bep', [nl(ft), 'juta', c[0], c[1]],
        'BEP Biaya Tetap ' + rpL(ft * 1e6) + ' per Bulan, Harga ' + RP(c[0]) + ', Biaya Variabel ' + RP(c[1]),
        'Skenario: biaya tetap ' + rpL(ft * 1e6) + ' per bulan, harga jual ' + RP(c[0]) + ' per unit, dan biaya variabel ' + RP(c[1]) + ' per unit. Seluruh angka adalah contoh.',
        ['Harga dan biaya variabel per unit dianggap tetap.', 'Seluruh angka adalah contoh.'],
        { tetap: ft * 1e6, harga: c[0], variabel: c[1], target: 0 });
    });
  });

  // --- gaji ---
  const GAJI = [3, 4, 5, 6, 7.5, 10, 12, 15, 20, 25, 30, 40, 50].map(function (x) { return x * 1e6; });
  GAJI.forEach(function (g) {
    [3, 5].forEach(function (i) {
      [0, 2, 5].forEach(function (p) {
        add('gaji-bersih', [nl(g / 1e6), 'juta', 'iuran', i, 'pajak', p],
          'Gaji ' + rpL(g) + ' Take Home Pay: Iuran ' + i + '% dan Pajak ' + p + '% (Potongan Input Sendiri)',
          'Skenario: gaji kotor ' + rpL(g) + ' per bulan dengan potongan iuran ' + i + '% dan potongan pajak ' + p + '%. Persentase potongan hanyalah angka contoh yang Anda ganti sesuai slip gaji; halaman ini tidak menghitung PPh 21 atau BPJS menurut peraturan.',
          ['Persentase iuran dan pajak adalah angka contoh, bukan tarif resmi.', 'Tunjangan dan potongan lain diisi 0.'],
          { pokok: g, tetap: 0, tidakTetap: 0, iuran: i, pajak: p, potLain: 0 });
      });
    });
    [1, 2, 3].forEach(function (b) {
      add('gaji-tahunan', [nl(g / 1e6), 'juta', 'bonus', b, 'bulan'],
        'Gaji ' + rpL(g) + ' per Bulan: Total Setahun dengan Bonus ' + b + ' Bulan',
        'Skenario: gaji kotor ' + rpL(g) + ' per bulan dengan bonus atau THR setara ' + b + ' bulan gaji dan perkiraan potongan contoh 5%. Potongan bukan hasil perhitungan pajak.',
        ['Potongan 5% adalah angka contoh.', 'Bonus dihitung sebagai kelipatan bulan gaji yang Anda isi.'],
        { gaji: g, bulanBonus: b, bonusLain: 0, potongan: 5 });
    });
  });
  [3, 5, 7.5, 10, 15, 20, 30, 40].forEach(function (u) {
    [1, 2, 3, 4, 6, 9, 12, 18].forEach(function (m) {
      add('pesangon', [nl(u), 'juta', m, 'bulan'],
        'Simulasi Pembayaran ' + m + ' Bulan Upah ' + rpL(u * 1e6) + ' (Input Sendiri)',
        'Skenario: upah dasar ' + rpL(u * 1e6) + ' per bulan dikalikan ' + m + ' bulan. Jumlah bulan adalah angka contoh; halaman ini bukan perhitungan pesangon menurut peraturan.',
        ['Jumlah bulan adalah angka contoh, bukan hasil rumus ketenagakerjaan.', 'Komponen lain dan potongan diisi 0.'],
        { upah: u * 1e6, bulan: m, lain: 0, potongan: 0 });
    });
  });

  // --- konstruksi ---
  const TILES = [[30, 30, 11], [40, 40, 6], [50, 50, 4], [60, 60, 4]];
  [[2, 3], [3, 3], [3, 4], [4, 4], [4, 5], [5, 5], [5, 6], [6, 6], [6, 8], [8, 8]].forEach(function (d) {
    TILES.forEach(function (t) {
      add('keramik', [d[0], 'x', d[1], 'm', t[0], 'x', t[1], 'cm'],
        'Kebutuhan Keramik ' + t[0] + 'x' + t[1] + ' cm untuk Ruangan ' + d[0] + 'x' + d[1] + ' m',
        'Skenario: ruangan ' + d[0] + ' x ' + d[1] + ' m dengan ubin ' + t[0] + ' x ' + t[1] + ' cm, isi per dus contoh ' + t[2] + ' pcs, dan cadangan 10%. Cek isi per dus pada produk yang Anda beli.',
        ['Isi per dus ' + t[2] + ' pcs adalah angka contoh.', 'Harga tidak diisi; masukkan harga dari toko Anda.'],
        { p: d[0], l: d[1], ua: t[0], ub: t[1], isi: t[2], cadangan: 10, harga: 0 });
    });
  });
  [20, 40, 60, 80, 100, 150, 200, 300].forEach(function (a) {
    [2, 3].forEach(function (lp) {
      [8, 12].forEach(function (dy) {
        add('cat', [a, 'm2', lp, 'lapis', dy],
          'Kebutuhan Cat Dinding ' + a + ' m², ' + lp + ' Lapis, Daya Sebar ' + dy + ' m² per Liter',
          'Skenario: dinding ' + a + ' m² dicat ' + lp + ' lapis dengan daya sebar contoh ' + dy + ' m² per liter, kaleng 5 liter, cadangan 10%. Ganti daya sebar sesuai label produk.',
          ['Daya sebar ' + dy + ' m² per liter adalah angka contoh.', 'Harga tidak diisi; masukkan harga dari toko Anda.'],
          { luas: a, lapis: lp, daya: dy, kaleng: 5, cadangan: 10, harga: 0 });
      });
    });
  });
  const BATA = [['Bata Merah', 23, 5, 1], ['Bata Ringan', 60, 20, 0.3]];
  [10, 20, 30, 50, 75, 100, 150, 200].forEach(function (a) {
    BATA.forEach(function (b) {
      [5, 10].forEach(function (w) {
        add('bata', [b[0], a, 'm2', 'cadangan', w],
          'Kebutuhan ' + b[0] + ' untuk Dinding ' + a + ' m² (Cadangan ' + w + '%)',
          'Skenario: dinding ' + a + ' m² dengan ' + b[0].toLowerCase() + ' ukuran tampak contoh ' + b[1] + ' x ' + b[2] + ' cm, tebal adukan ' + nl(b[3]) + ' cm, cadangan ' + w + '%. Ganti ukuran sesuai produk Anda.',
          ['Ukuran ' + b[1] + ' x ' + b[2] + ' cm dan adukan ' + nl(b[3]) + ' cm adalah angka contoh.', 'Harga tidak diisi; masukkan harga dari toko Anda.'],
          { luas: a, pb: b[1], tb: b[2], adukan: b[3], cadangan: w, harga: 0 });
      });
    });
  });
  [[2, 3], [3, 3], [3, 4], [4, 4], [4, 5], [5, 5], [5, 6], [6, 6], [6, 8], [8, 8]].forEach(function (d) {
    [8, 12, 15].forEach(function (t) {
      add('beton', [d[0], 'x', d[1], 'm', 'tebal', t, 'cm'],
        'Volume Beton Pelat ' + d[0] + 'x' + d[1] + ' m Tebal ' + t + ' cm',
        'Skenario: pelat ' + d[0] + ' x ' + d[1] + ' m dengan tebal ' + t + ' cm dan cadangan 5%. Hanya volume yang dihitung; mutu beton, tulangan, dan bekisting tidak termasuk.',
        ['Cadangan 5% adalah angka contoh.', 'Harga tidak diisi; masukkan harga dari pemasok Anda.'],
        { p: d[0], l: d[1], t: t, cadangan: 5, harga: 0 });
    });
  });
  return out;
}

// =====================================================================
// 7. PENGUJIAN OTOMATIS (dijalankan build.js; build berhenti jika gagal)
// =====================================================================
const TEST_LOG = [];
function assert(cond, msg) {
  if (!cond) throw new Error('PENGUJIAN GAGAL: ' + msg);
  TEST_LOG.push(msg);
}
function runCoreTests() {
  const E = LC.engines;
  const run = function (id, vals) {
    const raw = {};
    Object.keys(vals).forEach(function (k) { raw[k] = String(vals[k]); });
    const r = LC.run(E[id], Object.assign(LC.rawFrom(E[id], LC.defaults(E[id])), raw));
    if (!r.ok) throw new Error('PENGUJIAN GAGAL: input uji ditolak untuk ' + id + ': ' + JSON.stringify(r.errors));
    return r.res;
  };
  let r = run('nol', { plafon: 12000000, tenor: 12, admin: 0 });
  assert(r.raw.pay === 1000000, 'Pinjaman bunga 0%: Rp12.000.000 / 12 bulan = Rp1.000.000 per bulan');
  r = run('margin', { biaya: 30000, harga: 50000, unit: 1 });
  assert(r.raw.laba === 20000 && Math.abs(r.raw.margin - 40) < 1e-9, 'Margin: biaya Rp30.000, harga Rp50.000 = laba Rp20.000 dan margin 40%');
  assert(Math.round(r.raw.markup * 100) / 100 === 66.67, 'Markup kasus yang sama = 66,67% (dua desimal)');
  assert(r.summary[2].v === '66,67%', 'Tampilan markup memakai format Indonesia (66,67%)');
  r = run('kpr-tetap', { harga: 500000000, dp: 20, tenor: 20, bunga: 9, biayaLain: 0 });
  assert(r.raw.pokok === 500000000 - 100000000 && r.raw.dp === 100000000, 'KPR: pokok = harga rumah dikurangi uang muka');
  let worst = 0, cases = 0;
  [[50000000, 12, 24], [12345678, 9.5, 37], [1000000000, 8.75, 240], [7777777, 0, 11], [5000000, 15, 6], [2000000000, 10.25, 420]].forEach(function (c) {
    [LC.schedAnn(c[0], c[1], c[2]), LC.schedFlat(c[0], c[1], c[2])].forEach(function (rows) {
      worst = Math.max(worst, Math.abs(rows[rows.length - 1].bal)); cases++;
      const sp = rows.reduce(function (a, x) { return a + x.prin; }, 0);
      if (sp !== Math.round(c[0])) throw new Error('PENGUJIAN GAGAL: total pokok jadwal tidak sama dengan pinjaman');
    });
  });
  assert(worst < 1 && cases === 12, 'Tabel anuitas dan flat: saldo akhir nol (toleransi < Rp1) dan total pokok = pinjaman pada ' + cases + ' kasus');
  r = run('anuitas', { plafon: 100000000, tenor: 12, bunga: 12, admin: 0 });
  assert(Math.abs(r.raw.pay - 8884879) <= 1, 'Anuitas Rp100 juta, 12 bulan, 12%/tahun: cicilan Rp8.884.879 (referensi hitung independen)');
  r = run('kpr-fixfloat', { harga: 500000000, dp: 20, tenor: 20, fix: 3, bungaFix: 7, bungaFloat: 11 });
  assert(r.raw.finalBal === 0 && r.raw.payFloat > r.raw.payFix, 'KPR fixed lalu floating: sisa pokok akhir nol dan angsuran floating dihitung ulang (lebih tinggi pada bunga lebih tinggi)');
  assert(r.raw.rows.length === 240, 'KPR fixed lalu floating: jadwal memuat 240 bulan');
  r = run('kpr-mampu', { income: 10000000, kewajiban: 0, dsr: 30, tenor: 20, bunga: 9, dp: 20 });
  assert(Math.abs(LC.pmtAnn(r.raw.plafon, 9, 240) - 3000000) < 0.01, 'Estimasi KPR terjangkau: cicilan dari plafon hasil = batas cicilan');
  r = run('bep', { tetap: 1000000, harga: 50000, variabel: 30000, target: 0 });
  assert(r.raw.bepU === 50 && r.raw.bepRp === 2500000, 'BEP: biaya tetap Rp1.000.000, kontribusi Rp20.000 = 50 unit');
  r = run('gaji-bersih', { pokok: 10000000, tetap: 0, tidakTetap: 0, iuran: 5, pajak: 2, potLain: 0 });
  assert(r.raw.net === 9300000, 'Gaji bersih: Rp10.000.000 dikurangi 5% dan 2% input pengguna = Rp9.300.000');
  r = run('keramik', { p: 3, l: 3, ua: 30, ub: 30, isi: 10, cadangan: 0, harga: 0 });
  assert(r.raw.dasar === 100 && r.raw.dus === 10, 'Keramik: 3x3 m dengan ubin 30x30 cm = 100 ubin (tanpa galat pembulatan desimal)');
  r = run('beton', { p: 4, l: 3, t: 12, cadangan: 0, harga: 0 });
  assert(Math.abs(r.raw.vol - 1.44) < 1e-9, 'Beton: 4 x 3 m x 12 cm = 1,44 m³');
  assert(LC.parseNum('1.000.000') === 1000000 && LC.parseNum('7,5') === 7.5 && LC.parseNum('12.5') === 12.5 && isNaN(LC.parseNum('abc')) && isNaN(LC.parseNum('')), 'Parsing angka Indonesia (1.000.000, 7,5, 12.5, teks, kosong)');
  const bad = LC.run(E.bep, LC.rawFrom(E.bep, Object.assign(LC.defaults(E.bep), { harga: 20000, variabel: 30000 })));
  assert(!bad.ok && bad.errors.harga, 'Validasi: BEP menolak harga jual <= biaya variabel');
  assert(LC.fmtRp(1234567.4) === 'Rp1.234.567' && LC.fmtRp(-5000) === '-Rp5.000', 'Format rupiah Indonesia');
}

// =====================================================================
// 8. PEMBUATAN HALAMAN
// =====================================================================
const files = new Map(); // path relatif dist -> isi
const pages = [];
const engineById = {};
CORE_ENGINES.forEach(function (e) { engineById[e.id] = e; });

const APP_JS = '(function(){var LC=(' + LC_CORE.toString() + ')();(' + LC_CLIENT.toString() + ')(LC);})();\n';
const ASSET_V = crypto.createHash('md5').update(CSS + APP_JS).digest('hex').slice(0, 8);

function depthOf(p) { return p.split('/').filter(Boolean).length; }
function relOf(p) { const d = depthOf(p); return d === 0 ? './' : '../'.repeat(d); }
function firstSentence(s) { const m = s.match(/^.*?\.(\s|$)/); return m ? m[0].trim() : s; }
function trunc(s, n) { return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; }

function adsReady() {
  return ADSENSE.ENABLED && /^ca-pub-\d{10,}$/.test(ADSENSE.CLIENT);
}
function adUnit() {
  if (!adsReady() || !/^\d{6,}$/.test(ADSENSE.SLOT_RESULT)) return '';
  return '<div class="ad noprint"><small>Iklan</small><ins class="adsbygoogle" style="display:block" data-ad-client="' + esc(ADSENSE.CLIENT) + '" data-ad-slot="' + esc(ADSENSE.SLOT_RESULT) + '" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>';
}

function crumbs(list, rel) {
  return '<nav class="crumbs" aria-label="Breadcrumb"><ol>' + list.map(function (c, i) {
    return '<li>' + (c[1] !== null && i < list.length - 1 ? '<a href="' + esc(rel + c[1]) + '">' + esc(c[0]) + '</a>' : '<span aria-current="page">' + esc(c[0]) + '</span>') + '</li>';
  }).join('') + '</ol></nav>';
}

function layout(p, main, o) {
  o = o || {};
  const rel = p.abs ? BASE_PATH : relOf(p.path);
  const indexable = MODE === 'production' && p.index && !p.abs;
  const robots = indexable ? 'index,follow' : 'noindex,follow';
  const title = p.fullTitle || (p.title + ' | ' + SITE_NAME);
  const url = BASE_URL + p.path;
  const navItems = [['Beranda', '', 'home']].concat(CLUSTERS.map(function (c) { return [c.short, c.id + '/', c.id]; }), [['Metodologi', 'metodologi/', 'm'], ['Peta Situs', 'peta-situs/', 's']]);
  const nav = navItems.map(function (n) {
    const cur = (n[2] === 'home' && p.type === 'home') || (p.cluster === n[2]) || (p.type === 'static' && p.key === n[2]);
    return '<li><a href="' + esc(rel + n[1]) + '"' + (cur ? ' aria-current="page"' : '') + '>' + esc(n[0]) + '</a></li>';
  }).join('');
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + esc(title) + '</title>',
    '<meta name="description" content="' + esc(p.desc) + '">',
    '<meta name="robots" content="' + robots + '">',
    MODE === 'production' && !p.abs ? '<link rel="canonical" href="' + esc(url) + '">' : '',
    '<meta name="theme-color" content="#0b6b57">',
    '<meta property="og:site_name" content="' + SITE_NAME + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:locale" content="id_ID">',
    '<meta property="og:title" content="' + esc(title) + '">',
    '<meta property="og:description" content="' + esc(p.desc) + '">',
    MODE === 'production' && !p.abs ? '<meta property="og:url" content="' + esc(url) + '">' : '',
    '<link rel="icon" type="image/svg+xml" href="' + rel + 'favicon.svg">',
    '<link rel="stylesheet" href="' + rel + 'style.css?v=' + ASSET_V + '">',
    adsReady() ? '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + esc(ADSENSE.CLIENT) + '" crossorigin="anonymous"></script>' : '',
    o.jsonld ? '<script type="application/ld+json">' + jsonForScript(o.jsonld) + '</script>' : '',
  ].filter(Boolean).join('\n');
  const foot = POLICY_LINKS.map(function (l) { return '<li><a href="' + esc(l[1]) + '" rel="noopener">' + esc(l[0]) + '</a></li>'; }).join('');
  return '<!doctype html>\n<html lang="id">\n<head>\n' + head + '\n</head>\n<body data-root="' + esc(rel) + '">\n' +
    '<a class="skip" href="#main">Lewati ke konten</a>\n' +
    '<header class="site"><div class="wrap"><a class="brand" href="' + esc(rel) + '">' + LOGO_SVG + '<span>' + SITE_NAME + '</span></a>' +
    '<nav class="main" aria-label="Navigasi utama"><ul>' + nav + '</ul></nav></div></header>\n' +
    '<main id="main" tabindex="-1"><div class="wrap">\n' + main + '\n</div></main>\n' +
    '<footer class="site"><div class="wrap"><nav aria-label="Informasi dan kebijakan"><ul>' + foot + '<li><a href="mailto:' + CONTACT_EMAIL + '">' + CONTACT_EMAIL + '</a></li></ul></nav>' +
    '<p>Hasil kalkulator bersifat simulasi dari angka yang Anda isi dan bukan nasihat keuangan, pajak, atau hukum.</p>' +
    '<p>&copy; ' + SITE_NAME + '</p></div></footer>\n' +
    (o.search ? '<script src="' + rel + 'search-index.js?v=' + ASSET_V + '" defer></script>\n' : '') +
    '<script src="' + rel + 'app.js?v=' + ASSET_V + '" defer></script>\n</body>\n</html>\n';
}

function addPage(p, main, o) {
  p.html = layout(p, main, o);
  pages.push(p);
  files.set(p.path === '404.html' ? '404.html' : p.path + 'index.html', p.html);
}

function linkList(items, rel) {
  return '<ul class="links">' + items.map(function (it) { return '<li><a href="' + esc(rel + it.path) + '">' + esc(it.title) + '</a></li>'; }).join('') + '</ul>';
}

function buildAll() {
  // --- data preset ---
  const raw = genPresets();
  const byEngine = {};
  CORE_ENGINES.forEach(function (e) { byEngine[e.id] = []; });
  raw.forEach(function (pr) {
    const eng = engineById[pr.engine];
    if (!eng) throw new Error('Preset merujuk engine tidak dikenal: ' + pr.engine);
    pr.values = Object.assign(LC.defaults(eng), pr.values);
    pr.cluster = eng.cluster;
    pr.path = eng.cluster + '/' + eng.id + '/' + pr.slug + '/';
    pr.type = 'preset';
    byEngine[eng.id].push(pr);
  });

  function calcPage(p, eng, extra) {
    const cl = CL[eng.cluster], rel = relOf(p.path);
    const run = LC.run(eng, LC.rawFrom(eng, p.values));
    if (!run.ok) throw new Error('Preset tidak valid: ' + p.path + ' ' + JSON.stringify(run.errors));
    p.res = run.res;
    const lead = run.res.summary[0];
    p.desc = trunc(p.type === 'hub'
      ? eng.intro + ' Isi angka Anda dan lihat hasilnya langsung di browser.'
      : p.title + '. Hasil awal: ' + lead.l.toLowerCase() + ' ' + lead.v + '. Angka dapat diubah.', 158);
    const form = LC.renderForm(nodeH, eng, p.values).map(String).join('');
    const result = String(LC.renderResult(nodeH, run.res, 'ssr'));
    const crumbList = [['Beranda', ''], [cl.short, cl.id + '/'], [eng.name, p.type === 'hub' ? null : eng.cluster + '/' + eng.id + '/']];
    if (p.type !== 'hub') crumbList.push([p.title, null]);
    // halaman terkait
    const sib = byEngine[eng.id], idx = sib.indexOf(p), picks = [];
    if (p.type === 'preset') {
      [1, -1, 7, -7, 23].forEach(function (d) {
        const q = sib[(idx + d + sib.length * 3) % sib.length];
        if (q !== p && picks.indexOf(q) < 0 && picks.length < 4) picks.push(q);
      });
    }
    const rel2 = [{ path: eng.cluster + '/' + eng.id + '/', title: 'Kalkulator utama: ' + eng.name }].concat(picks.map(function (q) { return { path: q.path, title: q.title }; }));
    eng.related.forEach(function (rid) { const e2 = engineById[rid]; rel2.push({ path: e2.cluster + '/' + e2.id + '/', title: e2.name }); });
    if (p.type === 'hub') rel2.shift();
    const asm = (p.asm || []).concat(eng.assumptions);
    const faqHtml = eng.faq.map(function (f) { return '<details class="faq"><summary>' + esc(f[0]) + '</summary><p>' + esc(f[1]) + '</p></details>'; }).join('');
    const variants = p.type === 'hub' ? '<section class="block"><h2>Variasi skenario</h2><p>Skenario contoh dengan angka berbeda untuk kalkulator ini. Semua angka dapat diubah di halaman masing-masing.</p><details><summary>Lihat ' + sib.length + ' variasi skenario</summary><ul class="cols">' + sib.map(function (q) { return '<li><a href="' + esc(rel + q.path) + '">' + esc(q.title) + '</a></li>'; }).join('') + '</ul></details></section>' : '';
    const about = p.type === 'hub'
      ? '<p>' + esc(eng.intro) + '</p>'
      : '<p>' + esc(p.scenario) + '</p><p>Halaman ini adalah skenario contoh dari <a href="' + esc(rel + eng.cluster + '/' + eng.id + '/') + '">' + esc(eng.name) + '</a>. Semua isian dapat Anda ubah; hasil akan berubah langsung tanpa memuat ulang halaman.</p>';
    const main = crumbs(crumbList, rel) +
      '<h1>' + esc(p.h1 || p.title) + '</h1>' +
      '<p class="lead">' + esc(firstSentence(p.type === 'hub' ? eng.intro : p.scenario)) + '</p>' +
      '<noscript><p class="warn">Aktifkan JavaScript untuk mengubah angka. Hasil di bawah menampilkan nilai awal halaman ini.</p></noscript>' +
      '<div class="calc">' +
      '<section class="card" aria-labelledby="h-in"><h2 id="h-in">Isian</h2><form id="calc-form" novalidate>' + form +
      '<div class="actions"><button type="submit" class="btn">Hitung ulang</button><button type="button" class="btn sec" id="btn-reset">Kembalikan nilai awal</button></div></form></section>' +
      '<section class="card" aria-labelledby="h-out"><h2 id="h-out">Hasil</h2><div id="result" aria-live="polite">' + result + '</div>' +
      '<div class="actions noprint"><button type="button" class="btn sec" id="btn-copy">Salin hasil</button><button type="button" class="btn sec" id="btn-print">Cetak</button><button type="button" class="btn sec" id="btn-save">Simpan sebagai Skenario A</button><button type="button" class="btn sec" id="btn-clear" hidden>Hapus Skenario A</button></div>' +
      '<p id="status" class="muted" role="status"></p><div id="compare"></div></section></div>' +
      '<div class="disc" style="margin-top:16px"><strong>Perhatian:</strong> ' + esc(cl.disclaimer) + '</div>' +
      '<section class="block"><h2>Tentang skenario ini</h2>' + about + '<p>Hasil awal: <strong>' + esc(lead.l) + ' ' + esc(lead.v) + '</strong>.</p><h3>Asumsi</h3><ul class="links">' + asm.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></section>' +
      adUnit() +
      '<section class="block"><h2>Cara perhitungan</h2>' + eng.method.map(function (m) { return '<p>' + esc(m) + '</p>'; }).join('') + '</section>' +
      '<section class="block"><h2>Pertanyaan umum</h2>' + faqHtml + '</section>' +
      variants +
      '<section class="block related"><h2>Kalkulator terkait</h2>' + linkList(rel2, rel) + '</section>';
    const cfg = '<script type="application/json" id="lc-config">' + jsonForScript({ engine: eng.id, title: p.title, values: p.values }) + '</script>';
    const jsonld = p.index ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: eng.faq.map(function (f) { return { '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[1] } }; }) } : null;
    addPage(p, main + cfg, { jsonld: jsonld });
  }

  // --- hub per engine (kalkulator utama, indexable pada produksi) ---
  CORE_ENGINES.forEach(function (eng) {
    const hub = { type: 'hub', engine: eng.id, cluster: eng.cluster, path: eng.cluster + '/' + eng.id + '/', title: eng.name, h1: eng.name, values: LC.defaults(eng), index: true, asm: [] };
    byEngine[eng.id].hub = hub;
    // calcPage perlu daftar preset lengkap; hub memakai sib = preset
  });
  // hub dan preset diproses setelah semua data siap
  CORE_ENGINES.forEach(function (eng) {
    const hub = byEngine[eng.id].hub;
    // untuk perhitungan indeks, hub tidak ada di daftar preset
    calcPage(hub, eng);
    byEngine[eng.id].forEach(function (pr) {
      pr.index = INDEX_PRESET_CLUSTERS.indexOf(pr.cluster) > -1;
      calcPage(pr, eng);
    });
  });

  // --- halaman kategori ---
  CLUSTERS.forEach(function (cl) {
    const p = { type: 'cluster', cluster: cl.id, path: cl.id + '/', title: 'Kalkulator ' + cl.name, h1: 'Kalkulator ' + cl.name, desc: trunc(cl.desc, 158), index: true };
    const rel = relOf(p.path);
    const engs = CORE_ENGINES.filter(function (e) { return e.cluster === cl.id; });
    const cards = engs.map(function (e) {
      return '<li><a class="card tool" href="' + esc(rel + e.cluster + '/' + e.id + '/') + '"><strong>' + esc(e.name) + '</strong><span class="d">' + esc(firstSentence(e.intro)) + '</span><span class="d">' + byEngine[e.id].length + ' skenario contoh</span></a></li>';
    }).join('');
    const main = crumbs([['Beranda', ''], [cl.short, null]], rel) + '<h1>' + esc(p.h1) + '</h1><p class="lead">' + esc(cl.desc) + '</p><ul class="grid" style="margin-top:16px">' + cards + '</ul>' +
      '<div class="disc" style="margin-top:20px"><strong>Perhatian:</strong> ' + esc(cl.disclaimer) + '</div>';
    addPage(p, main);
  });

  // --- metodologi ---
  (function () {
    const p = { type: 'static', key: 'm', path: 'metodologi/', title: 'Metodologi dan Batasan Kalkulator', h1: 'Metodologi dan batasan kalkulator', desc: 'Rumus, asumsi, dan batasan setiap kalkulator di LIFE CALCULATOR, termasuk perbedaan bunga anuitas dan flat serta margin dan markup.', index: true };
    const rel = relOf(p.path);
    let body = crumbs([['Beranda', ''], ['Metodologi', null]], rel) + '<h1>' + p.h1 + '</h1>' +
      '<p class="lead">Semua perhitungan berjalan di browser Anda. Halaman ini merangkum rumus dan asumsi setiap kalkulator. Angka bunga, biaya, dan potongan pada halaman skenario adalah contoh yang dapat diganti, bukan tarif atau ketentuan resmi.</p>';
    CLUSTERS.forEach(function (cl) {
      body += '<h2>' + esc(cl.name) + '</h2><div class="disc">' + esc(cl.disclaimer) + '</div>';
      CORE_ENGINES.filter(function (e) { return e.cluster === cl.id; }).forEach(function (e) {
        body += '<h3><a href="' + esc(rel + e.cluster + '/' + e.id + '/') + '">' + esc(e.name) + '</a></h3>' + e.method.map(function (m) { return '<p>' + esc(m) + '</p>'; }).join('') + '<ul class="links">' + e.assumptions.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>';
      });
    });
    body += '<h2>Pembulatan</h2><p>Angsuran dan bunga bulanan dibulatkan ke rupiah penuh. Selisih pembulatan ditampung pada angsuran terakhir sehingga sisa pokok berakhir nol.</p>';
    addPage(p, body);
  })();

  // --- peta situs untuk pengunjung ---
  (function () {
    const p = { type: 'static', key: 's', path: 'peta-situs/', title: 'Peta Situs', h1: 'Peta situs', desc: 'Daftar seluruh kalkulator dan skenario di LIFE CALCULATOR.', index: false };
    const rel = relOf(p.path);
    let body = crumbs([['Beranda', ''], ['Peta Situs', null]], rel) + '<h1>Peta situs</h1><p class="lead">Daftar kalkulator utama dan skenario contohnya.</p>';
    CLUSTERS.forEach(function (cl) {
      body += '<h2><a href="' + esc(rel + cl.id + '/') + '">' + esc(cl.name) + '</a></h2>';
      CORE_ENGINES.filter(function (e) { return e.cluster === cl.id; }).forEach(function (e) {
        body += '<details><summary>' + esc(e.name) + ' (' + byEngine[e.id].length + ' skenario)</summary><ul class="cols"><li><a href="' + esc(rel + e.cluster + '/' + e.id + '/') + '"><strong>Kalkulator utama</strong></a></li>' +
          byEngine[e.id].map(function (q) { return '<li><a href="' + esc(rel + q.path) + '">' + esc(q.title) + '</a></li>'; }).join('') + '</ul></details>';
      });
    });
    addPage(p, body);
  })();

  // --- beranda ---
  (function () {
    const p = { type: 'home', path: '', title: SITE_NAME, fullTitle: SITE_NAME + ' - Kalkulator Pinjaman, KPR, Usaha, Gaji, dan Konstruksi', h1: SITE_NAME, desc: 'Kalkulator gratis untuk simulasi cicilan pinjaman, KPR, HPP dan BEP usaha, gaji, serta kebutuhan material konstruksi. Berjalan langsung di browser.', index: true };
    const rel = relOf(p.path);
    let body = '<h1>' + SITE_NAME + '</h1><p class="lead">Kalkulator untuk simulasi cicilan, KPR, harga jual usaha, gaji, dan kebutuhan material. Isi angka, hasil langsung tampil di browser Anda.</p>' +
      '<form class="search" role="search" aria-label="Cari kalkulator"><label for="q" class="noprint" style="position:absolute;left:-999px">Cari kalkulator</label><input id="q" type="search" placeholder="Cari, mis. KPR 500 juta, margin, keramik" autocomplete="off"></form>' +
      '<p id="q-count" class="muted" role="status"></p><ul id="q-res" class="results"></ul>';
    CLUSTERS.forEach(function (cl) {
      const engs = CORE_ENGINES.filter(function (e) { return e.cluster === cl.id; });
      body += '<section class="block"><h2>' + iconSvg(cl.id).replace('class="ic"', 'class="ic" style="width:24px;height:24px;vertical-align:-4px;margin-right:6px"') + '<a href="' + esc(rel + cl.id + '/') + '">' + esc(cl.name) + '</a></h2><p>' + esc(cl.desc) + '</p><ul class="grid">' +
        engs.map(function (e) { return '<li><a class="card tool" href="' + esc(rel + e.cluster + '/' + e.id + '/') + '"><strong>' + esc(e.name) + '</strong><span class="d">' + esc(firstSentence(e.intro)) + '</span></a></li>'; }).join('') + '</ul></section>';
    });
    body += '<section class="block"><h2>Cara kerja dan batasan</h2><p>Setiap halaman skenario memakai kalkulator yang sama dengan angka awal berbeda; semua angka dapat diubah. Bunga, biaya, dan potongan pada skenario adalah contoh. Baca <a href="' + esc(rel + 'metodologi/') + '">metodologi</a> untuk rumus dan asumsi.</p></section>';
    addPage(p, body, { search: true });
  })();

  // --- 404 ---
  (function () {
    const p = { type: 'static', key: '404', path: '404.html', abs: true, title: 'Halaman tidak ditemukan', desc: 'Halaman yang Anda cari tidak ditemukan.', index: false };
    addPage(p, '<h1>Halaman tidak ditemukan</h1><p class="lead">Alamat yang Anda buka tidak tersedia. Kembali ke <a href="' + esc(BASE_PATH) + '">beranda</a> atau gunakan menu di atas.</p>');
  })();

  return byEngine;
}

// =====================================================================
// 9. FILE BERSAMA, SITEMAP, ROBOTS
// =====================================================================
function buildSharedFiles() {
  files.set('style.css', CSS.trim() + '\n');
  files.set('app.js', APP_JS);
  files.set('favicon.svg', FAVICON_SVG + '\n');
  files.set('.nojekyll', '');
  const idx = pages.filter(function (p) { return p.type === 'hub' || p.type === 'preset' || p.type === 'cluster'; }).map(function (p) {
    return [p.title, p.path, p.cluster ? CL[p.cluster].short : ''];
  });
  files.set('search-index.js', 'window.LC_INDEX=' + jsonForScript(idx) + ';\n');

  const urls = pages.filter(function (p) { return p.index; }).map(function (p) { return BASE_URL + p.path; });
  const CH = 45000;
  const mk = function (list) { return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + list.map(function (u) { return '<url><loc>' + esc(u) + '</loc></url>'; }).join('\n') + '\n</urlset>\n'; };
  if (urls.length <= CH) {
    files.set('sitemap.xml', mk(urls));
  } else {
    const n = Math.ceil(urls.length / CH);
    let idxXml = '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    for (let i = 0; i < n; i++) {
      files.set('sitemap-' + (i + 1) + '.xml', mk(urls.slice(i * CH, (i + 1) * CH)));
      idxXml += '<sitemap><loc>' + esc(BASE_URL + 'sitemap-' + (i + 1) + '.xml') + '</loc></sitemap>\n';
    }
    files.set('sitemap.xml', idxXml + '</sitemapindex>\n');
  }
  files.set('robots.txt', MODE === 'production'
    ? 'User-agent: *\nAllow: /\n\nSitemap: ' + BASE_URL + 'sitemap.xml\n'
    : '# MODE preview: situs uji, jangan diindeks.\nUser-agent: *\nDisallow: /\n');
  return urls;
}

// =====================================================================
// 10. PENGUJIAN STRUKTUR (sebelum menulis ke disk)
// =====================================================================
function runBuildTests(byEngine, sitemapUrls) {
  const presets = pages.filter(function (p) { return p.type === 'preset'; });
  const hubs = pages.filter(function (p) { return p.type === 'hub'; });
  const perCluster = {};
  CLUSTERS.forEach(function (c) { perCluster[c.id] = { presets: 0, hubs: 0 }; });
  presets.forEach(function (p) { perCluster[p.cluster].presets++; });
  hubs.forEach(function (p) { perCluster[p.cluster].hubs++; });

  assert(pages.length >= MIN_TOTAL_PAGES, 'Jumlah halaman HTML ' + pages.length + ' >= ' + MIN_TOTAL_PAGES);
  CLUSTERS.forEach(function (c) {
    const n = perCluster[c.id].presets + perCluster[c.id].hubs;
    assert(n >= MIN_PAGES[c.id], 'Klaster ' + c.id + ': ' + n + ' halaman >= target ' + MIN_PAGES[c.id]);
  });
  const paths = pages.map(function (p) { return p.path; });
  assert(new Set(paths).size === paths.length, 'Tidak ada slug/URL duplikat (' + paths.length + ' URL unik)');
  const titles = pages.map(function (p) { return p.title; });
  assert(new Set(titles).size === titles.length, 'Tidak ada judul halaman duplikat');
  const descs = pages.filter(function (p) { return p.type === 'preset'; }).map(function (p) { return p.desc; });
  assert(new Set(descs).size === descs.length, 'Meta description halaman preset unik');
  assert(CORE_ENGINES.every(function (e) { return byEngine[e.id].length > 0; }), 'Setiap mesin kalkulator memiliki halaman preset');
  assert(presets.every(function (p) { return p.res && p.res.summary.length > 0; }), 'Setiap halaman preset memiliki hasil default yang tampil (' + presets.length + ' halaman)');

  // sitemap
  const mapped = new Set();
  files.forEach(function (content, name) {
    if (/^sitemap.*\.xml$/.test(name) && name !== 'sitemap.xml' || (name === 'sitemap.xml' && content.indexOf('<urlset') > -1)) {
      (content.match(/<loc>[^<]+<\/loc>/g) || []).forEach(function (m) { mapped.add(m.slice(5, -6).replace(/&amp;/g, '&')); });
    }
  });
  const expected = pages.filter(function (p) { return p.index; }).map(function (p) { return BASE_URL + p.path; });
  assert(mapped.size === expected.length && expected.every(function (u) { return mapped.has(u); }), 'Semua URL sitemap (' + mapped.size + ') sesuai halaman yang dibuat dan boleh diindeks');
  assert(pages.filter(function (p) { return !p.index; }).every(function (p) { return !mapped.has(BASE_URL + p.path); }), 'Halaman noindex tidak masuk sitemap');
  assert(Array.from(mapped).every(function (u) { return u.indexOf(BASE_URL) === 0; }), 'Semua URL sitemap memakai ' + BASE_URL);

  // berkas penting
  ['style.css', 'app.js', 'favicon.svg', 'index.html', 'robots.txt', 'sitemap.xml', 'search-index.js', '404.html'].forEach(function (f) {
    assert(files.has(f) && files.get(f).length >= 0, 'Berkas ' + f + ' tersedia');
  });
  assert(/id="calc-form"/.test(presets[0].html) && /id="lc-config"/.test(presets[0].html), 'Halaman preset memuat form kalkulator dan konfigurasi');

  // mode preview / production
  const htmlFiles = Array.from(files.entries()).filter(function (e) { return /\.html$/.test(e[0]); });
  if (MODE === 'preview') {
    assert(htmlFiles.every(function (e) { return e[1].indexOf('rel="canonical"') < 0; }), 'Mode preview: tidak ada canonical (domain produksi belum aktif)');
    assert(htmlFiles.every(function (e) { return e[1].indexOf('content="noindex,follow"') > -1; }), 'Mode preview: semua halaman noindex');
    assert(htmlFiles.every(function (e) { return e[1].indexOf('calculator.mainilmu.pro') < 0; }), 'Mode preview: tidak ada rujukan ke domain produksi');
    assert(files.get('robots.txt').indexOf('Sitemap:') < 0, 'Mode preview: robots.txt tanpa baris Sitemap');
  } else {
    assert(pages.every(function (p) { return p.abs || p.html.indexOf('<link rel="canonical" href="' + BASE_URL + p.path + '">') > -1; }), 'Mode production: canonical self-referencing ke ' + BASE_URL);
    assert(pages.every(function (p) { return p.index ? p.html.indexOf('content="index,follow"') > -1 : p.html.indexOf('content="noindex,follow"') > -1; }), 'Mode production: meta robots sesuai kebijakan indeks');
    assert(BASE_PATH === '/', 'Mode production: BASE_PATH = / (domain root)');
    assert(files.get('robots.txt').indexOf('Sitemap: ' + BASE_URL + 'sitemap.xml') > -1, 'Mode production: robots.txt menunjuk sitemap produksi');
  }

  // tautan relatif
  const fileSet = new Set(files.keys());
  let checked = 0;
  pages.forEach(function (p) {
    const html = p.html;
    const re = /(?:href|src)="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) {
      let u = m[1].replace(/&amp;/g, '&');
      if (/^(https?:|mailto:|tel:|#|data:)/.test(u)) continue;
      u = u.split('#')[0].split('?')[0];
      if (u === '') continue;
      let target;
      if (u.charAt(0) === '/') {
        if (!p.abs) throw new Error('PENGUJIAN GAGAL: tautan root-absolut pada ' + p.path + ': ' + u);
        if (u.indexOf(BASE_PATH) !== 0) throw new Error('PENGUJIAN GAGAL: tautan 404 di luar BASE_PATH: ' + u);
        target = u.slice(BASE_PATH.length);
      } else {
        const dir = p.path.endsWith('/') ? p.path : p.path.replace(/[^/]*$/, '');
        target = path.posix.normalize(dir + u).replace(/^\.\//, '');
      }
      if (target === '' || target === '.' || target.endsWith('/')) target = (target === '.' ? '' : target) + 'index.html';
      if (!fileSet.has(target)) throw new Error('PENGUJIAN GAGAL: tautan rusak pada ' + p.path + ' -> ' + u + ' (' + target + ')');
      checked++;
    }
  });
  assert(checked > 0, 'Tautan dan aset relatif valid pada seluruh halaman (' + checked + ' tautan diperiksa; tanpa tautan root-absolut kecuali 404)');
  assert(!/(localStorage|sessionStorage|serviceWorker|innerHTML|eval\()/.test(APP_JS), 'app.js tidak memakai innerHTML, eval, storage, atau service worker');
  if (ADSENSE.ENABLED) assert(adsReady(), 'ADSENSE.ENABLED=true memerlukan ADSENSE.CLIENT berformat ca-pub-... milik Anda');
  assert(!/ca-pub-\d/.test(Array.from(files.values()).join('')) || ADSENSE.ENABLED, 'Tidak ada ID AdSense pada output saat AdSense nonaktif');
  return { perCluster: perCluster, presets: presets.length, hubs: hubs.length };
}

// =====================================================================
// 11. TULIS KE DISK
// =====================================================================
function writeDist() {
  const root = path.resolve(__dirname, OUT_DIR);
  if (path.basename(root) !== 'dist' || path.dirname(root) !== path.resolve(__dirname)) throw new Error('Jalur output tidak aman: ' + root);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  files.forEach(function (content, name) {
    const full = path.resolve(root, name);
    if (full.indexOf(root + path.sep) !== 0) throw new Error('Jalur file di luar dist: ' + name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  });
  return root;
}
function verifyDisk(root) {
  files.forEach(function (content, name) {
    const full = path.join(root, name);
    if (!fs.existsSync(full)) throw new Error('PENGUJIAN GAGAL: file tidak tertulis: ' + name);
  });
  ['style.css', 'app.js', 'favicon.svg', 'index.html'].forEach(function (f) {
    assert(fs.statSync(path.join(root, f)).size > 0, 'File ' + f + ' tertulis di disk dan tidak kosong');
  });
  const htmlOnDisk = (function walk(d) {
    let n = 0;
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      if (e.isDirectory()) n += walk(path.join(d, e.name));
      else if (e.name === 'index.html') n++;
    });
    return n;
  })(root);
  const expect = pages.filter(function (p) { return p.path !== '404.html'; }).length;
  assert(htmlOnDisk === expect, 'Jumlah index.html di disk (' + htmlOnDisk + ') = halaman dibuat (' + expect + ')');
}

// =====================================================================
// 12. MAIN
// =====================================================================
function main() {
  const t0 = Date.now();
  console.log('LIFE CALCULATOR build | MODE=' + MODE + ' | URL dasar: ' + BASE_URL);
  runCoreTests();
  const byEngine = buildAll();
  const urls = buildSharedFiles();
  const stats = runBuildTests(byEngine, urls);
  const root = writeDist();
  verifyDisk(root);

  const indexable = pages.filter(function (p) { return p.index; }).length;
  const effNoindex = MODE === 'production' ? pages.length - indexable : pages.length;
  console.log('\n=== PENGUJIAN YANG DIJALANKAN BUILD (' + TEST_LOG.length + ' lulus) ===');
  TEST_LOG.forEach(function (t) { console.log('  [OK] ' + t); });
  console.log('\n=== LAPORAN ===');
  console.log('Mesin kalkulator terdaftar (fungsi calc berbeda): ' + CORE_ENGINES.length + ' (sebagian berbagi fungsi dasar, mis. anuitas dan 0% memakai jadwal anuitas yang sama)');
  console.log('Halaman hub (kalkulator utama): ' + stats.hubs + ' | halaman preset (angka berbeda, mesin sama): ' + stats.presets);
  CLUSTERS.forEach(function (c) {
    const s = stats.perCluster[c.id];
    console.log('  ' + c.id.padEnd(11) + ' preset: ' + String(s.presets).padStart(4) + ' | hub: ' + s.hubs + ' | total: ' + (s.presets + s.hubs) + ' (target ' + MIN_PAGES[c.id] + ')');
  });
  console.log('Total halaman HTML: ' + pages.length + ' (termasuk beranda, kategori, metodologi, peta situs, 404)');
  console.log('Halaman yang masuk sitemap menurut kebijakan indeks: ' + indexable + ' | noindex pada mode ' + MODE + ': ' + effNoindex);
  console.log('Halaman preset dengan noindex (perlu evaluasi kualitas sebelum diindeks): ' + pages.filter(function (p) { return p.type === 'preset' && !p.index; }).length);
  if (ADSENSE.ENABLED) console.log('PERHATIAN: AdSense aktif. ads.txt TIDAK dibuat otomatis; periksa ads.txt dan status domain di akun AdSense.');
  console.log('Selesai dalam ' + (Date.now() - t0) + ' ms. Output: ' + root);
}

main();
