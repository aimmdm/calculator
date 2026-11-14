/*
 * LIFE CALCULATOR - build.js
 * Generator situs statis kalkulator (Node.js 22, CommonJS, tanpa dependensi).
 * Jalankan: node build.js   -> output di folder dist
 *
 * Mode build:
 *   preview    (default) : untuk GitHub Pages https://aimmdm.github.io/calculator/
 *                          - semua halaman diberi meta noindex
 *                          - tag canonical DIHILANGKAN (domain produksi belum aktif)
 *                          - TIDAK ada sitemap.xml dan TIDAK ada robots.txt. File robots.txt di
 *                            subpath github.io/calculator/ bukan robots.txt root host, jadi tidak
 *                            mengendalikan crawler. Crawler harus bisa membuka halaman agar bisa
 *                            membaca meta noindex, maka halaman tidak diblokir.
 *   production           : untuk https://calculator.mainilmu.pro (root domain)
 *                          - canonical self-referencing ke domain produksi
 *                          - robots.txt + sitemap.xml aktif (sitemap hanya memuat halaman yang
 *                            HTML-nya benar-benar indexable dan canonical-nya self-referencing)
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

// KEBIJAKAN INDEKS (berlaku hanya pada mode production).
// Selalu indexable: beranda, kategori, hub kalkulator utama, panduan/metodologi.
// Halaman PRESET (skenario angka) = NOINDEX sampai Anda menandainya sudah ditinjau secara editorial.
// Aktifkan bertahap, dari cakupan paling sempit:
//   paths   : daftar URL spesifik (mis. 'pinjaman/anuitas/50-juta-24-bulan-12-persen/')
//   engines : seluruh preset satu kalkulator (mis. 'kpr-tetap')
//   clusters: seluruh preset satu klaster (mis. 'pinjaman')  <- gunakan paling akhir
// NOINDEX_PATHS selalu menang (untuk menarik kembali halaman tertentu).
// Daftar path preset: jalankan build dengan env LC_LIST_PRESETS=1 (lihat log Actions).
const INDEX_REVIEWED = { paths: [], engines: [], clusters: [] };
const NOINDEX_PATHS = [];

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
    if (!isFinite(n)) return 'NaN'; // sengaja mencolok agar penjaga hasil menolaknya, bukan disamarkan
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
  // Jadwal berhenti begitu saldo nol (pelunasan lebih awal akibat pembulatan), tanpa baris Rp0.
  function schedAnn(P, ratePct, n) {
    P = Math.round(P);
    const r = ratePct / 1200;
    const pay = Math.round(pmtAnn(P, ratePct, n));
    let bal = P;
    const rows = [];
    for (let m = 1; m <= n && bal > 0; m++) {
      const int = Math.round(bal * r);
      let prin = pay - int;
      if (m === n || prin > bal) prin = bal;
      if (prin < 0) prin = 0;
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
    for (let m = 1; m <= n && bal > 0; m++) {
      const prin = (m === n || prinM > bal) ? bal : prinM;
      bal -= prin;
      rows.push({ m: m, pay: prin + intM, int: intM, prin: prin, bal: bal });
    }
    return rows;
  }
  // Pelunasan dipercepat: tambahan pokok tetap setiap bulan.
  function schedExtra(P, ratePct, n, extra) {
    P = Math.round(P);
    const r = ratePct / 1200;
    const pay = Math.round(pmtAnn(P, ratePct, n));
    let bal = P;
    const rows = [];
    for (let m = 1; m <= n && bal > 0; m++) {
      const int = Math.round(bal * r);
      let prin = pay - int + extra;
      if (m === n || prin > bal) prin = bal;
      if (prin < 0) prin = 0;
      bal -= prin;
      rows.push({ m: m, pay: prin + int, int: int, prin: prin, bal: bal });
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
  LC.schedAnn = schedAnn; LC.schedFlat = schedFlat; LC.schedExtra = schedExtra; LC.pmtAnn = pmtAnn;
  function dur(m) {
    const y = Math.floor(m / 12), mo = m % 12;
    return (y ? y + ' tahun' : '') + (y && mo ? ' ' : '') + ((mo || !y) ? mo + ' bulan' : '');
  }
  // Penjelasan jujur bila pembulatan ke rupiah penuh membuat jadwal tidak biasa.
  function scheduleNotes(rows, n) {
    const notes = [], warnings = [];
    const first = rows[0].pay, last = rows[rows.length - 1].pay;
    if (rows.length < n) {
      warnings.push('Pinjaman lunas pada bulan ke-' + rows.length + ' (bukan bulan ke-' + n + ') karena cicilan dibulatkan ke rupiah penuh dan lebih besar dari nilai eksaknya. Selisih ditampung di cicilan terakhir.');
    }
    if (Math.abs(last - first) > Math.max(1000, first * 0.05)) {
      warnings.push('Cicilan terakhir (' + fmtRp(last) + ') berbeda signifikan dari cicilan reguler (' + fmtRp(first) + '). Ini terjadi karena pembulatan ke rupiah penuh: pada pokok kecil, tenor panjang, atau bunga tinggi, cicilan reguler bisa hampir hanya menutup bunga sehingga pokok baru lunas di bulan terakhir. Pertimbangkan pokok lebih besar atau tenor lebih pendek.');
    } else if (last !== first) {
      notes.push('Cicilan terakhir (' + fmtRp(last) + ') berbeda sedikit dari cicilan reguler karena selisih pembulatan ditampung di bulan terakhir.');
    }
    return { notes: notes, warnings: warnings };
  }
  LC.scheduleNotes = scheduleNotes; LC.dur = dur;

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
    const sn = scheduleNotes(rows, v.tenor);
    return { summary: s, tables: [schedTable(rows)], notes: sn.notes, warnings: sn.warnings, raw: { pay: rows[0].pay, last: rows[rows.length - 1], rows: rows, total: t, flagged: sn.warnings.length > 0 } };
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
      ['Apakah perkiraan bunga efektif sama dengan angka yang dihitung pemberi pinjaman?', 'Belum tentu. Angka ini hanya hasil perhitungan matematis dari input Anda dan tidak memasukkan biaya lain.'],
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

  E({
    id: 'percepat', cluster: 'pinjaman', name: 'Pelunasan Dipercepat (Tambahan Pokok Bulanan)',
    intro: 'Lihat berapa bulan dan bunga yang dihemat bila setiap bulan Anda menambah pembayaran pokok di atas cicilan anuitas reguler.',
    fields: [
      F('plafon', 'Jumlah pinjaman (pokok)', 'rp', 50000000, { min: 1000, max: 1e12 }),
      F('tenor', 'Tenor', 'int', 36, { unit: 'bulan', min: 1, max: 480 }),
      F('bunga', 'Bunga per tahun', 'pct', 12, { min: 0, max: 100, hint: 'Angka contoh. Ganti sesuai perjanjian Anda.' }),
      F('extra', 'Tambahan pokok per bulan', 'rp', 500000, { min: 0, max: 1e10, hint: 'Dibayar setiap bulan di atas cicilan reguler. Isi 0 untuk tanpa tambahan.' }),
    ],
    method: ['Cicilan reguler = rumus anuitas. Tiap bulan, bunga = sisa pokok × bunga bulanan; seluruh sisa cicilan ditambah tambahan pokok mengurangi pokok. Jadwal berhenti saat pokok habis. Bunga yang dihemat = total bunga jadwal reguler − total bunga jadwal dipercepat.'],
    assumptions: ['Bunga dihitung dari sisa pokok (anuitas) dan tetap.', 'Tidak ada penalti atau biaya pelunasan sebagian; periksa perjanjian Anda karena ketentuan berbeda-beda.'],
    faq: [
      ['Apakah semua pinjaman boleh dilunasi lebih cepat?', 'Tidak selalu. Ada perjanjian yang membatasi atau mengenakan biaya. Periksa dokumen pinjaman Anda.'],
      ['Mengapa bunga yang dihemat membesar jika tambahan lebih besar?', 'Karena pokok berkurang lebih cepat sehingga bunga bulan-bulan berikutnya lebih kecil.'],
    ],
    related: ['anuitas', 'flat', 'bandingkan'],
    calc: function (v) {
      const normal = schedAnn(v.plafon, v.bunga, v.tenor), fast = schedExtra(v.plafon, v.bunga, v.tenor, v.extra);
      const tn = sumRows(normal), tf = sumRows(fast);
      const saved = normal.length - fast.length, s = [
        S('Lunas dalam', dur(fast.length) + (saved > 0 ? ' (reguler: ' + dur(normal.length) + ')' : ''), true),
        S('Bunga yang dihemat', fmtRp(tn.int - tf.int), true),
        S('Waktu yang dipercepat', dur(saved)),
        S('Cicilan reguler per bulan', fmtRp(normal[0].pay)),
        S('Pembayaran per bulan (cicilan + tambahan)', fmtRp(normal[0].pay + v.extra)),
        S('Total bunga dengan tambahan', fmtRp(tf.int)),
        S('Total bunga tanpa tambahan', fmtRp(tn.int)),
      ];
      const sn = scheduleNotes(fast, v.tenor);
      return { summary: s, tables: [schedTable(fast)], notes: ['Ketentuan pelunasan sebagian dan penalti tidak dihitung. Periksa perjanjian Anda.'].concat(sn.notes), warnings: sn.warnings, raw: { saved: saved, months: fast.length, normalMonths: normal.length, intSaved: tn.int - tf.int, rows: fast } };
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
      const sn = scheduleNotes(rows, n);
      return { summary: s, tables: tabs, notes: [KPR_NOT_INCLUDED].concat(sn.notes), warnings: sn.warnings, raw: { pokok: pokok, dp: dpRp, pay: rows[0].pay, rows: rows, total: t, flagged: sn.warnings.length > 0 } };
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
      if (fm < n && r1.length === fm) {
        const bal = r1[fm - 1].bal;
        const r2 = schedAnn(bal, v.bungaFloat, n - fm).map(function (r) { r.m += fm; return r; });
        rows = r1.concat(r2); payFloat = r2[0].pay;
      }
      const t = sumRows(rows);
      const s = [S('Angsuran masa fixed', fmtRp(r1[0].pay), true)];
      if (payFloat !== null) s.push(S('Angsuran awal masa floating (dihitung ulang)', fmtRp(payFloat), true), S('Sisa pokok saat masa fixed berakhir', fmtRp(r1[fm - 1].bal)));
      s.push(S('Uang muka', fmtRp(dpRp)), S('Pokok pinjaman', fmtRp(pokok)), S('Total bunga', fmtRp(t.int)), S('Total angsuran (pokok + bunga)', fmtRp(t.pay)));
      const w = payFloat === null ? [fm >= n ? 'Masa fixed sama dengan tenor, sehingga tidak ada masa floating.' : 'Pinjaman lunas sebelum masa fixed berakhir karena pembulatan cicilan ke rupiah penuh.'] : [];
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
        return { summary: [S('Cicilan maksimum', fmtRp(0), true), S('Plafon pinjaman maksimum', fmtRp(0)), S('Estimasi harga rumah maksimum', fmtRp(0))], tables: [], notes: [], warnings: ['Cicilan lain sudah menghabiskan batas cicilan yang Anda tetapkan, sehingga tidak ada ruang cicilan baru.'], raw: { maxPay: maxPay, plafon: 0 } };
      }
      const plafon = maxPay / pmtAnn(1, v.bunga, n), harga = plafon / (1 - v.dp / 100);
      return {
        summary: [S('Cicilan maksimum per bulan', fmtRp(maxPay), true), S('Plafon pinjaman maksimum', fmtRp(plafon)), S('Estimasi harga rumah maksimum', fmtRp(harga), true), S('Uang muka yang dibutuhkan', fmtRp(harga - plafon))],
        tables: [], notes: [KPR_NOT_INCLUDED, 'Ini estimasi matematis, bukan keputusan atau janji persetujuan kredit.'], warnings: [], raw: { maxPay: maxPay, plafon: plafon, harga: harga },
      };
    },
  });

  E({
    id: 'tabung-dp', cluster: 'kpr', name: 'Berapa Lama Menabung Uang Muka Rumah',
    intro: 'Hitung berapa lama dana uang muka tercapai dari saldo awal, setoran bulanan, dan asumsi imbal hasil tahunan yang Anda tentukan sendiri.',
    fields: [
      F('target', 'Target dana uang muka', 'rp', 100000000, { min: 1000000, max: 1e11 }),
      F('awal', 'Saldo awal', 'rp', 0, { min: 0, max: 1e11 }),
      F('setoran', 'Setoran per bulan', 'rp', 2000000, { min: 0, max: 1e10, hint: 'Disetor di akhir setiap bulan.' }),
      F('ret', 'Asumsi imbal hasil per tahun', 'pct', 4, { min: 0, max: 30, hint: 'Asumsi Anda sendiri; bukan janji hasil produk apa pun. Isi 0 bila tanpa imbal hasil.' }),
    ],
    method: ['Tiap bulan: saldo baru = saldo × (1 + imbal hasil tahunan ÷ 12 ÷ 100) + setoran. Perhitungan berhenti pada bulan pertama saat saldo mencapai target (maksimum 1.200 bulan).'],
    assumptions: ['Imbal hasil tetap dan dianggap bebas pajak dan biaya.', 'Setoran dilakukan di akhir bulan.', 'Harga rumah dan target tidak berubah selama menabung.'],
    faq: [
      ['Apakah imbal hasil di sini dijamin?', 'Tidak. Itu asumsi untuk simulasi. Hasil produk tabungan atau investasi nyata bisa berbeda, termasuk rugi.'],
      ['Bagaimana jika setoran 0?', 'Dana hanya tumbuh dari imbal hasil. Bila imbal hasil juga 0, target tidak akan tercapai.'],
    ],
    related: ['kpr-tetap', 'kpr-mampu', 'kpr-fixfloat'],
    calc: function (v) {
      const r = v.ret / 1200;
      let bal = v.awal, m = 0, dep = 0;
      const rows = [];
      while (bal < v.target && m < 1200) { bal = bal + bal * r + v.setoran; dep += v.setoran; m++; rows.push({ m: m, bal: bal }); }
      const ok = bal >= v.target;
      const yr = rows.filter(function (x) { return x.m % 12 === 0 || x.m === m; });
      return {
        summary: [S('Waktu mencapai target', ok ? dur(m) : 'Tidak tercapai dalam 100 tahun', true), S('Total setoran', fmtRp(dep)), S('Saldo awal', fmtRp(v.awal)), S('Perkiraan hasil pengembangan', fmtRp(bal - v.awal - dep)), S('Saldo akhir', fmtRp(bal))],
        tables: yr.length ? [{ caption: 'Saldo akhir per tahun', cols: ['Bulan ke', 'Saldo'], rows: yr.map(function (x) { return [String(x.m), fmtRp(x.bal)]; }), limit: 12 }] : [],
        notes: ['Simulasi ini tidak memasukkan inflasi, pajak, biaya, atau perubahan harga rumah.'],
        warnings: ok ? [] : ['Dengan setoran dan imbal hasil ini, target tidak tercapai dalam 1.200 bulan.'], raw: { m: m, ok: ok, bal: bal, dep: dep },
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
      F('bulan', 'Total komponen dalam bulan upah', 'num', 3, { unit: 'bulan', min: 0, max: 100, hint: 'Isi sesuai hitungan atau kesepakatan Anda sendiri. Boleh desimal.' }),
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

  // ---------- sensitivitas & wawasan ----------
  function V(id, name, steps, mul) { return { id: id, name: name, steps: steps, mul: !!mul }; }
  const SENS = {
    anuitas: { cols: [['Cicilan per bulan', 'Cicilan per bulan'], ['Total bunga', 'Total bunga']], vars: [V('bunga', 'Bunga', [-3, -1, 1, 3]), V('tenor', 'Tenor', [-12, 12, 24])] },
    flat: { cols: [['Cicilan per bulan', 'Cicilan per bulan'], ['Total bunga', 'Total bunga']], vars: [V('bunga', 'Bunga flat', [-3, -1, 1, 3]), V('tenor', 'Tenor', [-12, 12, 24])] },
    nol: { cols: [['Cicilan per bulan', 'Cicilan per bulan'], ['Total pembayaran', 'Total pembayaran']], vars: [V('tenor', 'Tenor', [-12, -6, 6, 12])] },
    bandingkan: { cols: [['Cicilan anuitas', 'Anuitas / bulan'], ['Cicilan flat', 'Flat / bulan']], vars: [V('bunga', 'Bunga', [-3, -1, 1, 3]), V('tenor', 'Tenor', [-12, 12])] },
    percepat: { cols: [['Lunas dalam', 'Lunas dalam'], ['Bunga yang dihemat', 'Bunga dihemat']], vars: [V('extra', 'Tambahan pokok', [-250000, 250000, 500000, 1000000]), V('bunga', 'Bunga', [-3, 3])] },
    'kpr-tetap': { cols: [['Angsuran per bulan', 'Angsuran per bulan'], ['Total bunga', 'Total bunga']], vars: [V('bunga', 'Bunga', [-2, -1, 1, 2]), V('tenor', 'Tenor', [-5, 5]), V('dp', 'Uang muka', [-10, 10])] },
    'kpr-fixfloat': { cols: [['Angsuran awal masa floating', 'Angsuran floating'], ['Total bunga', 'Total bunga']], vars: [V('bungaFloat', 'Bunga floating', [-3, -1, 1, 3]), V('fix', 'Masa fixed', [-1, 1, 2])] },
    'kpr-mampu': { cols: [['Plafon pinjaman maksimum', 'Plafon maks.'], ['Estimasi harga rumah maksimum', 'Harga rumah maks.']], vars: [V('bunga', 'Bunga', [-2, -1, 1, 2]), V('tenor', 'Tenor', [-5, 5]), V('dsr', 'Batas cicilan', [-5, 5])] },
    'tabung-dp': { cols: [['Waktu mencapai target', 'Waktu'], ['Total setoran', 'Total setoran']], vars: [V('setoran', 'Setoran bulanan', [-1000000, 1000000, 2000000]), V('ret', 'Imbal hasil', [-2, 2, 4])] },
    hpp: { cols: [['HPP per unit', 'HPP per unit'], ['Harga jual saran', 'Harga jual saran']], vars: [V('susut', 'Susut', [5, 10]), V('margin', 'Margin target', [-10, 10]), V('bahan', 'Biaya bahan', [0.9, 1.1], true)] },
    margin: { cols: [['Margin', 'Margin'], ['Markup', 'Markup']], vars: [V('harga', 'Harga jual', [0.9, 1.1, 1.2], true), V('biaya', 'Biaya', [0.9, 1.1], true)] },
    markup: { cols: [['Harga jual', 'Harga jual'], ['Margin yang dihasilkan', 'Margin']], vars: [V('markup', 'Markup', [-10, 10, 20]), V('biaya', 'Biaya', [0.9, 1.1], true)] },
    'harga-margin': { cols: [['Harga jual', 'Harga jual'], ['Markup setara', 'Markup']], vars: [V('margin', 'Margin target', [-10, -5, 5, 10]), V('biaya', 'Biaya', [0.9, 1.1], true)] },
    bep: { cols: [['BEP (unit', 'BEP unit'], ['BEP (pendapatan', 'BEP pendapatan']], vars: [V('harga', 'Harga jual', [0.9, 1.1], true), V('variabel', 'Biaya variabel', [0.9, 1.1], true), V('tetap', 'Biaya tetap', [0.9, 1.1], true)] },
    'gaji-bersih': { cols: [['Gaji bersih per bulan', 'Gaji bersih'], ['Total potongan', 'Total potongan']], vars: [V('iuran', 'Potongan iuran', [-1, 1, 2]), V('pajak', 'Potongan pajak', [-2, 2, 5])] },
    'gaji-tahunan': { cols: [['Perkiraan bersih setahun', 'Bersih setahun'], ['Rata-rata bersih', 'Rata-rata / bulan']], vars: [V('bulanBonus', 'Bonus', [-1, 1, 2]), V('potongan', 'Potongan', [-5, 5])] },
    pesangon: { cols: [['Total diterima', 'Total diterima'], ['Total sebelum potongan', 'Sebelum potongan']], vars: [V('bulan', 'Jumlah bulan', [-1, 1, 3])] },
    keramik: { cols: [['Kebutuhan dus', 'Dus'], ['Jumlah ubin dengan cadangan', 'Ubin + cadangan']], vars: [V('cadangan', 'Cadangan', [-5, 5, 10]), V('p', 'Panjang ruangan', [-1, 1])] },
    cat: { cols: [['Kebutuhan kaleng', 'Kaleng'], ['Kebutuhan cat', 'Cat']], vars: [V('lapis', 'Jumlah lapis', [-1, 1]), V('daya', 'Daya sebar', [-2, 2]), V('cadangan', 'Cadangan', [-5, 5])] },
    bata: { cols: [['Kebutuhan dengan cadangan', 'Total'], ['Kebutuhan per m²', 'Per m²']], vars: [V('adukan', 'Tebal adukan', [-0.5, 0.5]), V('cadangan', 'Cadangan', [-5, 5, 10])] },
    beton: { cols: [['Volume dengan cadangan', 'Volume'], ['Luas pelat', 'Luas']], vars: [V('t', 'Tebal', [-2, 2, 4]), V('cadangan', 'Cadangan', [-5, 5])] },
  };
  function loanInsights(v, res) {
    const rw = res.raw.rows, t = res.raw.total;
    if (!rw || !rw.length || !t || !t.pay) return [];
    let i1 = 0, p1 = 0;
    rw.slice(0, 12).forEach(function (r) { i1 += r.int; p1 += r.pay; });
    return ['Dari total pembayaran ' + fmtRp(t.pay) + ', bunga menyumbang ' + fmtPct(t.int / t.pay * 100, 1) + '.',
      'Pada 12 angsuran pertama, sekitar ' + fmtPct(p1 ? i1 / p1 * 100 : 0, 1) + ' dari uang yang dibayar berupa bunga.'];
  }
  const INSIGHTS = {
    anuitas: loanInsights, flat: loanInsights, nol: loanInsights, 'kpr-tetap': loanInsights, 'kpr-fixfloat': loanInsights,
    bep: function (v, res) { return ['Titik impas ' + fmtNum(res.raw.bepU) + ' unit per bulan setara sekitar ' + fmtNum(res.raw.bepU / 30, 1) + ' unit per hari (anggap 30 hari).', 'Setiap unit di atas titik impas menambah laba sebesar ' + fmtRp(v.harga - v.variabel) + '.']; },
    hpp: function (v) { const t = v.bahan + v.tenaga + v.overhead; return t > 0 ? ['Bahan baku menyumbang ' + fmtPct(v.bahan / t * 100, 1) + ' dari total biaya satu batch.'] : []; },
    margin: function (v, res) {
      if (res.raw.laba <= 0) return [];
      return ['Pada margin ' + fmtPct(res.raw.margin, 2) + ', dari setiap Rp100 penjualan sekitar Rp' + fmtNum(res.raw.margin, 2) + ' menjadi laba sebelum biaya tetap.', 'Markup (' + fmtPct(res.raw.markup, 2) + ') lebih besar daripada margin karena dibagi biaya, bukan harga jual.'];
    },
    'gaji-bersih': function (v, res) { return res.raw.bruto > 0 ? ['Total potongan setara ' + fmtPct((res.raw.bruto - res.raw.net) / res.raw.bruto * 100, 1) + ' dari penghasilan kotor (berdasarkan angka yang Anda isi).'] : []; },
    keramik: function (v, res) { return ['Pembelian per dus menyisakan ' + fmtNum(res.raw.dus * v.isi - res.raw.pcs) + ' ubin di luar hitungan cadangan.']; },
  };
  Object.keys(SENS).forEach(function (id) { LC.engines[id].sens = SENS[id]; });
  Object.keys(INSIGHTS).forEach(function (id) { LC.engines[id].insight = INSIGHTS[id]; });

  LC.sensitivity = function (engine, vals) {
    const sc = engine.sens;
    if (!sc) return null;
    const pick = function (res, key) {
      for (let i = 0; i < res.summary.length; i++) if (res.summary[i].l.indexOf(key) === 0) return res.summary[i].v;
      return '-';
    };
    const base = engine.calc(vals);
    const rows = [['Angka saat ini', pick(base, sc.cols[0][0]), pick(base, sc.cols[1][0])]];
    sc.vars.forEach(function (sv) {
      const f = engine.fields.filter(function (x) { return x.id === sv.id; })[0];
      sv.steps.forEach(function (st) {
        const nv = Math.round((sv.mul ? vals[sv.id] * st : vals[sv.id] + st) * 1e6) / 1e6;
        if (f.kind === 'int' && Math.floor(nv) !== nv) return;
        if ((f.min != null && nv < f.min) || (f.max != null && nv > f.max)) return;
        const v2 = Object.assign({}, vals); v2[sv.id] = nv;
        if (engine.check && Object.keys(engine.check(v2) || {}).length) return;
        let res;
        try { res = engine.calc(v2); } catch (e) { return; }
        const shown = f.kind === 'rp' ? fmtRp(nv) : fmtTrim(nv) + (f.unit === '%' ? '%' : (f.unit ? ' ' + f.unit : ''));
        const delta = sv.mul ? (st > 1 ? '+' : '−') + fmtTrim(Math.abs(st - 1) * 100) + '%' : (st > 0 ? '+' : '−') + (f.kind === 'rp' ? fmtRp(Math.abs(st)) : fmtTrim(Math.abs(st)));
        rows.push([sv.name + ' menjadi ' + shown + ' (' + delta + ')', pick(res, sc.cols[0][0]), pick(res, sc.cols[1][0])]);
      });
    });
    if (rows.length < 2) return null;
    return { caption: 'Bagaimana jika angka berubah? (satu isian diubah, lainnya tetap)', cols: ['Skenario', sc.cols[0][1], sc.cols[1][1]], rows: rows };
  };

  // ---------- eksekusi, validasi, render ----------
  LC.defaults = function (engine) {
    const o = {};
    engine.fields.forEach(function (f) { o[f.id] = f.def; });
    return o;
  };
  const BAD_RESULT = 'Kombinasi angka ini menghasilkan nilai yang tidak dapat dihitung. Periksa kembali isian.';
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
    let res;
    try {
      res = engine.calc(vals);
      res.insights = engine.insight ? engine.insight(vals, res) : [];
      const st = LC.sensitivity(engine, vals);
      if (st) res.tables.unshift(st);
    } catch (e) { return { ok: false, errors: { _: BAD_RESULT } }; }
    if (/NaN|Infinity|undefined/.test(JSON.stringify(res.summary) + JSON.stringify(res.tables) + JSON.stringify(res.insights))) return { ok: false, errors: { _: BAD_RESULT } };
    return { ok: true, errors: {}, vals: vals, res: res };
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
      (res.insights && res.insights.length) ? h('div', { class: 'insight' }, h('h3', null, 'Wawasan'), h('ul', null, res.insights.map(function (x) { return h('li', null, x); }))) : null,
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
  document.documentElement.className += ' js';

  // ---- pencarian instan + filter kategori ----
  const q = document.getElementById('q');
  if (q && window.LC_INDEX) {
    const list = document.getElementById('q-res'), count = document.getElementById('q-count');
    const chips = Array.prototype.slice.call(document.querySelectorAll('[data-chip]'));
    const idx = window.LC_INDEX.map(function (r) { return { t: r[0], p: r[1], c: r[2], k: r[3], key: r[0].toLowerCase() + ' ' + r[2].toLowerCase() }; });
    let cluster = '';
    const run = function () {
      const terms = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      list.textContent = '';
      if (!terms.length && !cluster) { count.textContent = ''; return; }
      let hit = idx.filter(function (r) {
        if (cluster && r.c !== cluster) return false;
        if (!terms.length) return r.k === 'h';
        return terms.every(function (t) { return r.key.indexOf(t) > -1; });
      });
      hit = hit.filter(function (r) { return r.k !== 'p'; }).concat(hit.filter(function (r) { return r.k === 'p'; }));
      count.textContent = hit.length ? hit.length + ' halaman ditemukan' + (hit.length > 30 ? ' (30 teratas ditampilkan)' : '') + '.' : 'Tidak ada kalkulator yang cocok.';
      hit.slice(0, 30).forEach(function (r) {
        list.appendChild(h('li', null, h('a', { href: root + r.p }, r.t), h('span', { 'class': 'tag' }, r.c)));
      });
    };
    q.addEventListener('input', run);
    if (q.form) q.form.addEventListener('submit', function (e) { e.preventDefault(); run(); });
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        cluster = chip.getAttribute('data-chip');
        chips.forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
        run();
      });
    });
    const focusSearch = function () { if (location.hash === '#cari') q.focus(); };
    focusSearch();
    window.addEventListener('hashchange', focusSearch);
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
      out.appendChild(h('p', { 'class': 'warn', role: 'status' }, r.errors._ || 'Periksa kembali isian yang ditandai.'));
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
  // Format ribuan hanya saat input rupiah ditinggalkan; nilai tetap bisa diedit dan diparse ulang.
  engine.fields.forEach(function (f) {
    if (f.kind !== 'rp') return;
    const inp = document.getElementById('f-' + f.id);
    inp.addEventListener('blur', function () {
      const n = LC.parseNum(inp.value);
      if (!isNaN(n) && n >= 0) inp.value = LC.fmtNum(n, n % 1 === 0 ? 0 : 2);
    });
  });
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
html:not(.js) [data-js]{display:none!important}
:root{color-scheme:light dark;--brand:#0a6b57;--brand-d:#07493c;--on-brand:#fff;--accent:#b4540a;--ink:#14201c;--muted:#475650;--bg:#f3f6f4;--card:#fff;--soft:#e9f1ee;--line:#d2dcd7;--bad:#a8001c;--bad-bg:#fff0f2;--warn-bg:#fff3d0;--warn-ink:#583c00;--focus:#0b3d91;--r:14px;--sh:0 1px 2px rgba(10,40,30,.06),0 6px 20px rgba(10,40,30,.06);--fs:clamp(15px,.4vw + 14px,17px)}
@media(prefers-color-scheme:dark){:root{--brand:#4fd1b0;--brand-d:#7fe3c8;--on-brand:#06211a;--accent:#f0a05a;--ink:#e8f0ed;--muted:#a7b8b1;--bg:#0e1614;--card:#15201d;--soft:#1c2b27;--line:#2c3d38;--bad:#ff8a9c;--bad-bg:#3a1a20;--warn-bg:#3d3210;--warn-ink:#ffe3a0;--focus:#8fb8ff;--sh:none}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{animation:none!important;transition:none!important}}
body{margin:0;font:var(--fs)/1.65 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--brand-d);text-underline-offset:3px}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:4px}
.skip{position:absolute;left:-999px;top:0;background:var(--card);padding:10px 14px;z-index:50;border-radius:0 0 8px 0}
.skip:focus{left:0}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.wrap{max-width:1120px;margin:0 auto;padding:0 18px}
.pv{background:var(--warn-bg);color:var(--warn-ink);font-size:.85rem;padding:6px 0;text-align:center}
header.site{background:var(--card);border-bottom:1px solid var(--line)}
header.site .wrap{display:flex;flex-wrap:wrap;align-items:center;gap:6px 22px;padding-top:10px;padding-bottom:10px}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:1.1rem;color:var(--ink);text-decoration:none;letter-spacing:.04em}
.brand svg{width:34px;height:34px}
nav.main{flex:1}
nav.main ul{display:flex;flex-wrap:wrap;align-items:center;gap:2px 6px;list-style:none;margin:0;padding:0}
nav.main a{display:inline-block;padding:8px 10px;border-radius:8px;color:var(--ink);text-decoration:none;font-size:.93rem}
nav.main a:hover{background:var(--soft)}
nav.main a[aria-current]{background:var(--soft);font-weight:700;color:var(--brand-d)}
nav.main li.sp{margin-left:auto}
nav.main a.ext{border:1.5px solid var(--brand);color:var(--brand-d);font-weight:600;display:inline-flex;align-items:center;gap:6px}
nav.main a.ext svg{width:16px;height:16px}
main{padding:22px 0 48px}
h1{font-size:clamp(1.5rem,2.4vw + .9rem,2.2rem);line-height:1.2;margin:.4em 0 .35em;letter-spacing:-.01em}
h2{font-size:clamp(1.15rem,1vw + 1rem,1.4rem);line-height:1.3;margin:1.8em 0 .5em}
h3{font-size:1.05rem;margin:1.2em 0 .4em}
.lead{color:var(--muted);font-size:1.07em;max-width:68ch}
.crumbs{font-size:.86rem;color:var(--muted)}
.crumbs ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:2px 6px}
.crumbs li+li::before{content:"›";margin-right:6px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:18px;box-shadow:var(--sh)}
.card h2{margin-top:0}
.hero{background:linear-gradient(135deg,var(--brand),#0e8a70);color:#fff;border-radius:20px;padding:clamp(20px,4vw,40px);margin:8px 0 22px}
@media(prefers-color-scheme:dark){.hero{background:linear-gradient(135deg,#0b3a30,#115a49)}}
.hero h1{margin-top:0;color:#fff}
.hero p{color:#e6f6f1;max-width:60ch;margin:.3em 0 0}
.badge{display:inline-block;background:var(--soft);color:var(--brand-d);border-radius:99px;padding:2px 10px;font-size:.78rem;font-weight:700;letter-spacing:.02em}
.calc{display:grid;gap:18px;grid-template-columns:1fr;margin-top:16px}
@media(min-width:900px){.calc{grid-template-columns:minmax(0,5fr) minmax(0,6fr);align-items:start}.calc>.card:last-child{position:sticky;top:12px}}
.field{margin-bottom:16px}
.field label{display:block;font-weight:650;margin-bottom:5px}
.inp{display:flex;align-items:stretch;border:1.5px solid #6c7b75;border-radius:10px;background:var(--card);overflow:hidden}
.inp:focus-within{outline:3px solid var(--focus);outline-offset:1px}
.inp input{flex:1;min-width:0;border:0;padding:12px 13px;font:inherit;font-size:1.08rem;background:transparent;color:var(--ink)}
.inp input:focus{outline:0}
.inp:has(input[aria-invalid=true]){border-color:var(--bad);background:var(--bad-bg)}
.pre,.suf{display:flex;align-items:center;padding:0 12px;background:var(--soft);color:var(--muted);font-size:.9rem;white-space:nowrap}
.hint{margin:5px 0 0;font-size:.85rem;color:var(--muted)}
.eq{font-weight:600;color:var(--ink)}
.err{margin:5px 0 0;font-size:.9rem;color:var(--bad);font-weight:650}
.err:empty{display:none}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.btn{font:inherit;font-weight:650;padding:10px 18px;border-radius:10px;border:2px solid var(--brand);background:var(--brand);color:var(--on-brand);cursor:pointer;min-height:46px}
.btn:hover{filter:brightness(1.08)}
.btn.sec{background:transparent;color:var(--brand-d)}
.btn.sec:hover{background:var(--soft);filter:none}
.btn.small{min-height:38px;padding:6px 12px;margin-top:8px}
.btn[hidden]{display:none}
.sum{margin:0}
.sum-row{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:10px 0;border-bottom:1px solid var(--line)}
.sum-row dt{color:var(--muted)}
.sum-row dd{margin:0;font-weight:650;text-align:right;font-variant-numeric:tabular-nums}
.sum-row.strong:first-child{display:block;background:var(--soft);border:0;border-radius:12px;padding:14px 16px;margin-bottom:6px}
.sum-row.strong:first-child dd{font-size:clamp(1.5rem,3vw + .8rem,2.1rem);text-align:left;color:var(--brand-d);line-height:1.2}
.sum-row.strong dd{color:var(--brand-d)}
.warn{background:var(--warn-bg);color:var(--warn-ink);border-radius:10px;padding:10px 14px;margin:0 0 10px}
.insight{margin-top:14px;border-left:4px solid var(--accent);padding:2px 0 2px 14px}
.insight h3{margin:.2em 0}
.insight ul{margin:.2em 0;padding-left:18px}
.notes{color:var(--muted);font-size:.9rem;padding-left:20px}
.muted{color:var(--muted)}
.tblwrap{margin-top:18px}
.tbl{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.92rem}
caption{text-align:left;font-weight:650;padding-bottom:6px}
th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
thead th{background:var(--soft);font-size:.85rem}
td.num{text-align:right;font-variant-numeric:tabular-nums}
tr[hidden]{display:none}
@media(max-width:600px){
 .tbl{overflow:visible}
 table,tbody,tr,th,td{display:block}
 thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
 tr{border:1px solid var(--line);border-radius:10px;margin-bottom:8px;overflow:hidden;background:var(--card)}
 tr[hidden]{display:none}
 tbody th{background:var(--soft);border:0}
 tbody th::before{content:attr(data-label) " ";font-weight:400;color:var(--muted)}
 td{display:flex;justify-content:space-between;gap:12px;border:0;border-top:1px solid var(--line)}
 td::before{content:attr(data-label);color:var(--muted);text-align:left}
 .sum-row{flex-direction:column;gap:2px}
 .sum-row dd{text-align:left}
}
section.block{margin-top:10px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));margin:0;padding:0;list-style:none}
.tool{display:block;height:100%;text-decoration:none;color:inherit;transition:transform .15s,border-color .15s}
.tool:hover{border-color:var(--brand);transform:translateY(-2px)}
.tool .ic{width:38px;height:38px;color:var(--brand);background:var(--soft);border-radius:10px;padding:7px}
.tool strong{display:block;margin:8px 0 2px}
.tool span.d{display:block;color:var(--muted);font-size:.9rem}
.search{display:flex;gap:8px;margin:14px 0 8px}
.search input{flex:1;padding:14px;font:inherit;font-size:1.05rem;border:1.5px solid #6c7b75;border-radius:12px;min-width:0;background:var(--card);color:var(--ink)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 10px}
.chip{font:inherit;font-size:.9rem;padding:7px 14px;border-radius:99px;border:1.5px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer;min-height:40px}
.chip[aria-pressed=true]{background:var(--brand);border-color:var(--brand);color:var(--on-brand);font-weight:650}
.results{list-style:none;margin:0;padding:0}
.results li{padding:9px 0;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.tag{font-size:.78rem;color:var(--muted);border:1px solid var(--line);border-radius:99px;padding:0 8px}
ul.links{padding-left:20px}
ul.cols{columns:1;padding-left:20px;margin:8px 0}
@media(min-width:700px){ul.cols{columns:2}}
details{margin:8px 0}
summary{cursor:pointer;font-weight:650;padding:6px 0}
details.faq{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:2px 14px}
.disc{border-left:4px solid var(--brand);background:var(--card);padding:12px 16px;border-radius:0 10px 10px 0}
.ad{margin:32px 0;text-align:center;min-height:100px}
.ad small{display:block;color:var(--muted)}
footer.site{background:var(--card);border-top:1px solid var(--line);padding:22px 0;font-size:.9rem;color:var(--muted)}
footer.site ul{list-style:none;display:flex;flex-wrap:wrap;gap:6px 18px;padding:0;margin:0 0 10px}
.bnav{display:none}
@media(max-width:760px){
 nav.main{display:none}
 body{padding-bottom:calc(68px + env(safe-area-inset-bottom,0px))}
 .bnav{display:block;position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--card);border-top:1px solid var(--line)}
 .bnav ul{display:grid;grid-template-columns:repeat(5,1fr);margin:0;padding:0 0 env(safe-area-inset-bottom,0px);list-style:none}
 .bnav a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:58px;padding:6px 2px;font-size:.72rem;color:var(--muted);text-decoration:none}
 .bnav a[aria-current=page]{color:var(--brand-d);font-weight:800}
 .bnav svg{width:24px;height:24px}
}
@media print{
 header.site,footer.site,.crumbs,#calc-form,.actions,.related,.noprint,.ad,nav,.skip,.bnav,.pv{display:none!important}
 body{background:#fff;color:#000;font-size:12pt;padding:0}
 .card{border:0;padding:0;box-shadow:none}
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
  'n-home': '<path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-6h6v6"/>',
  'n-kat': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  'n-cari': '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>',
  'n-panduan': '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M8 7h7M8 11h7"/>',
  'n-ext': '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
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

  [25, 50, 100, 150, 200].forEach(function (a) {
    [36, 60, 120].forEach(function (n) {
      [250000, 500000, 1000000].forEach(function (x) {
        add('percepat', [a, 'juta', n, 'bulan', 'tambahan', x / 1000, 'ribu'],
          'Pelunasan Dipercepat Pinjaman ' + rpL(a * 1e6) + ' ' + n + ' Bulan dengan Tambahan ' + RP(x) + ' per Bulan',
          'Skenario: pinjaman ' + rpL(a * 1e6) + ', tenor ' + n + ' bulan, bunga contoh 12% per tahun (anuitas), dengan tambahan pembayaran pokok ' + RP(x) + ' setiap bulan. Halaman ini menunjukkan bulan dan bunga yang dihemat. ' + EX,
          ['Bunga 12% per tahun adalah angka contoh.', 'Penalti atau biaya pelunasan sebagian tidak dihitung.'],
          { plafon: a * 1e6, tenor: n, bunga: 12, extra: x });
      });
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

  [50, 100, 150, 200, 300, 400].forEach(function (t) {
    [1, 2, 3, 5].forEach(function (st) {
      add('tabung-dp', [t, 'juta', 'setoran', st, 'juta'],
        'Berapa Lama Menabung Uang Muka ' + rpL(t * 1e6) + ' dengan Setoran ' + rpL(st * 1e6) + ' per Bulan',
        'Skenario: target uang muka ' + rpL(t * 1e6) + ', saldo awal Rp0, setoran ' + rpL(st * 1e6) + ' per bulan, dan asumsi imbal hasil contoh 4% per tahun. Imbal hasil adalah asumsi simulasi, bukan janji hasil produk apa pun.',
        ['Imbal hasil 4% per tahun adalah angka asumsi.', 'Inflasi, pajak, dan perubahan harga rumah tidak dihitung.'],
        { target: t * 1e6, awal: 0, setoran: st * 1e6, ret: 4 });
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
    const raw = LC.rawFrom(E[id], LC.defaults(E[id]));
    Object.keys(vals).forEach(function (k) { raw[k] = String(vals[k]); });
    const r = LC.run(E[id], raw);
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
  assert(r.raw.pokok === 400000000 && r.raw.dp === 100000000, 'KPR: pokok = harga rumah dikurangi uang muka');
  r = run('anuitas', { plafon: 100000000, tenor: 12, bunga: 12, admin: 0 });
  assert(Math.abs(r.raw.pay - 8884879) <= 1, 'Anuitas Rp100 juta, 12 bulan, 12%/tahun: cicilan Rp8.884.879 (referensi hitung independen)');

  // --- invarian jadwal pada grid kasus batas (anuitas + flat) ---
  let cases = 0, flagged = 0;
  [1000, 1001, 7777, 100000, 12345678, 2e9].forEach(function (P) {
    [0, 0.01, 5, 12, 100].forEach(function (rate) {
      [1, 2, 7, 12, 13, 60, 300, 480].forEach(function (n) {
        [['anuitas', LC.schedAnn(P, rate, n)], ['flat', LC.schedFlat(P, rate, n)]].forEach(function (c) {
          const rows = c[1], tag = c[0] + ' P=' + P + ' r=' + rate + ' n=' + n;
          if (!rows.length) throw new Error('PENGUJIAN GAGAL: jadwal kosong ' + tag);
          let prev = Math.round(P), sp = 0;
          rows.forEach(function (x) {
            if (x.bal < 0) throw new Error('PENGUJIAN GAGAL: saldo negatif ' + tag);
            if (x.prin > prev) throw new Error('PENGUJIAN GAGAL: pokok melebihi saldo ' + tag);
            if (x.pay <= 0) throw new Error('PENGUJIAN GAGAL: baris cicilan Rp0 ' + tag);
            if (![x.pay, x.int, x.prin, x.bal].every(isFinite)) throw new Error('PENGUJIAN GAGAL: nilai tak hingga ' + tag);
            prev = x.bal; sp += x.prin;
          });
          if (rows[rows.length - 1].bal !== 0 || sp !== Math.round(P)) throw new Error('PENGUJIAN GAGAL: saldo akhir/total pokok tidak sesuai ' + tag);
          if (rows.length > n) throw new Error('PENGUJIAN GAGAL: jadwal melebihi tenor ' + tag);
          const first = rows[0].pay, last = rows[rows.length - 1].pay;
          const odd = rows.length < n || Math.abs(last - first) > Math.max(1000, first * 0.05);
          const res = run(c[0], { plafon: P, tenor: n, bunga: rate, admin: 0 });
          if (odd) {
            flagged++;
            if (!res.warnings.length || !res.raw.flagged) throw new Error('PENGUJIAN GAGAL: kasus tidak biasa tidak diberi penjelasan ' + tag);
          } else if (res.warnings.length) {
            throw new Error('PENGUJIAN GAGAL: peringatan palsu pada ' + tag);
          }
          cases++;
        });
      });
    });
  });
  assert(cases === 480, 'Jadwal anuitas dan flat: saldo >= 0, pokok <= saldo, tanpa baris Rp0, total pokok = pinjaman, saldo akhir 0 pada ' + cases + ' kasus batas');
  assert(flagged > 0, 'Kasus pembulatan tidak biasa (' + flagged + ' kasus) selalu disertai penjelasan di hasil; tidak ada peringatan palsu');
  r = run('anuitas', { plafon: 5000, tenor: 480, bunga: 100, admin: 0 });
  assert(r.warnings.length === 1 && r.raw.last.pay > 5000, 'Kasus Rp5.000 / 100% / 480 bulan: cicilan terakhir berbeda drastis dan dijelaskan');
  r = run('anuitas', { plafon: 1000, tenor: 300, bunga: 12, admin: 0 });
  assert(r.raw.rows.length < 300 && r.warnings.length > 0, 'Pinjaman kecil lunas lebih awal akibat pembulatan: jadwal dipotong dan dijelaskan');

  r = run('kpr-fixfloat', { harga: 500000000, dp: 20, tenor: 20, fix: 3, bungaFix: 7, bungaFloat: 11 });
  assert(r.raw.finalBal === 0 && r.raw.payFloat > r.raw.payFix, 'KPR fixed lalu floating: sisa pokok akhir nol dan angsuran dihitung ulang (naik pada bunga lebih tinggi)');
  assert(r.raw.rows.length === 240, 'KPR fixed lalu floating: jadwal memuat 240 bulan');
  r = run('kpr-fixfloat', { harga: 500000000, dp: 20, tenor: 20, fix: 20, bungaFix: 7, bungaFloat: 11 });
  assert(r.raw.payFloat === null && r.raw.finalBal === 0, 'KPR fixed = tenor: tidak ada masa floating');
  r = run('kpr-mampu', { income: 10000000, kewajiban: 0, dsr: 30, tenor: 20, bunga: 9, dp: 20 });
  assert(Math.abs(LC.pmtAnn(r.raw.plafon, 9, 240) - 3000000) < 0.01, 'Estimasi KPR terjangkau: cicilan dari plafon hasil = batas cicilan');
  r = run('kpr-mampu', { income: 5000000, kewajiban: 2000000, dsr: 30, tenor: 20, bunga: 9, dp: 20 });
  assert(r.raw.plafon === 0 && r.warnings.length === 1, 'Estimasi KPR: cicilan lain melebihi batas -> hasil 0 dengan peringatan');
  r = run('percepat', { plafon: 50000000, tenor: 36, bunga: 12, extra: 0 });
  assert(r.raw.saved === 0 && r.raw.intSaved === 0, 'Pelunasan dipercepat: tambahan Rp0 = tidak ada penghematan');
  r = run('percepat', { plafon: 50000000, tenor: 36, bunga: 12, extra: 1000000 });
  assert(r.raw.saved > 0 && r.raw.intSaved > 0 && r.raw.rows[r.raw.rows.length - 1].bal === 0 && r.raw.rows.reduce(function (a, x) { return a + x.prin; }, 0) === 50000000, 'Pelunasan dipercepat: lebih cepat, bunga hemat, total pokok = pinjaman');
  r = run('tabung-dp', { target: 12000000, awal: 0, setoran: 1000000, ret: 0 });
  assert(r.raw.m === 12 && r.raw.ok, 'Menabung DP: Rp1 juta/bulan tanpa imbal hasil menuju Rp12 juta = 12 bulan');
  r = run('tabung-dp', { target: 12000000, awal: 0, setoran: 0, ret: 0 });
  assert(!r.raw.ok && r.warnings.length === 1, 'Menabung DP: setoran 0 dan imbal hasil 0 -> tidak tercapai, dengan peringatan');
  r = run('bep', { tetap: 1000000, harga: 50000, variabel: 30000, target: 0 });
  assert(r.raw.bepU === 50 && r.raw.bepRp === 2500000, 'BEP: biaya tetap Rp1.000.000, kontribusi Rp20.000 = 50 unit');
  r = run('gaji-bersih', { pokok: 10000000, tetap: 0, tidakTetap: 0, iuran: 5, pajak: 2, potLain: 0 });
  assert(r.raw.net === 9300000, 'Gaji bersih: Rp10.000.000 dikurangi 5% dan 2% input pengguna = Rp9.300.000');
  r = run('keramik', { p: 3, l: 3, ua: 30, ub: 30, isi: 10, cadangan: 0, harga: 0 });
  assert(r.raw.dasar === 100 && r.raw.dus === 10, 'Keramik: 3x3 m dengan ubin 30x30 cm = 100 ubin (tanpa galat pembulatan desimal)');
  r = run('beton', { p: 4, l: 3, t: 12, cadangan: 0, harga: 0 });
  assert(Math.abs(r.raw.vol - 1.44) < 1e-9, 'Beton: 4 x 3 m x 12 cm = 1,44 m³');
  assert(LC.parseNum('1.000.000') === 1000000 && LC.parseNum('7,5') === 7.5 && LC.parseNum('12.5') === 12.5 && isNaN(LC.parseNum('abc')) && isNaN(LC.parseNum('')), 'Parsing angka Indonesia (1.000.000, 7,5, 12.5, teks, kosong)');
  const bad = LC.run(E.bep, Object.assign(LC.rawFrom(E.bep, LC.defaults(E.bep)), { harga: '20000', variabel: '30000' }));
  assert(!bad.ok && bad.errors.harga, 'Validasi: BEP menolak harga jual <= biaya variabel');
  assert(LC.fmtRp(1234567.4) === 'Rp1.234.567' && LC.fmtRp(-5000) === '-Rp5.000', 'Format rupiah Indonesia');

  // --- batas isian seluruh mesin ---
  let probes = 0;
  LC.order.forEach(function (id) {
    const e = E[id];
    ['min', 'max'].forEach(function (k) {
      const raw = {};
      e.fields.forEach(function (f) { raw[f.id] = String(f[k]); });
      const res = LC.run(e, raw);
      probes++;
      if (res.ok) {
        const txt = JSON.stringify(res.res.summary) + JSON.stringify(res.res.tables);
        if (/NaN|Infinity|undefined/.test(txt)) throw new Error('PENGUJIAN GAGAL: NaN/Infinity pada ' + id + ' (' + k + ')');
      } else if (Object.keys(res.errors).length === 0) {
        throw new Error('PENGUJIAN GAGAL: penolakan tanpa pesan pada ' + id);
      }
    });
    e.fields.forEach(function (f) {
      const base = LC.rawFrom(e, LC.defaults(e));
      [[String(f.min - 1), 'bawah'], [String(f.max * 2 + 1), 'atas'], ['', 'kosong'], ['abc', 'teks'], ['-5', 'negatif']].forEach(function (t) {
        const raw = Object.assign({}, base); raw[f.id] = t[0];
        const res = LC.run(e, raw);
        probes++;
        if (res.ok) throw new Error('PENGUJIAN GAGAL: ' + id + '.' + f.id + ' menerima nilai ' + t[1]);
        if (!res.errors[f.id]) throw new Error('PENGUJIAN GAGAL: ' + id + '.' + f.id + ' ditolak tanpa pesan di field (' + t[1] + ')');
      });
    });
    const dres = LC.run(e, LC.rawFrom(e, LC.defaults(e)));
    if (!dres.ok) throw new Error('PENGUJIAN GAGAL: nilai default tidak valid pada ' + id);
  });
  assert(probes > 300, 'Batas isian ' + LC.order.length + ' mesin: min, max, di luar batas, kosong, teks, negatif (' + probes + ' pemeriksaan); tanpa NaN/Infinity');
  assert(true, 'Nilai default valid dan dapat dihitung pada seluruh ' + LC.order.length + ' mesin');
}

// =====================================================================
// 8. PEMBUATAN HALAMAN
// =====================================================================
const files = new Map();
const pages = [];
const engineById = {};
CORE_ENGINES.forEach(function (e) { engineById[e.id] = e; });

const APP_JS = '(function(){var LC=(' + LC_CORE.toString() + ')();(' + LC_CLIENT.toString() + ')(LC);})();\n';
const ASSET_V = crypto.createHash('md5').update(CSS + APP_JS).digest('hex').slice(0, 8);
const MAINILMU = 'https://www.mainilmu.pro/';

function depthOf(p) { return p.split('/').filter(Boolean).length; }
function relOf(p) { const d = depthOf(p); return d === 0 ? './' : '../'.repeat(d); }
function firstSentence(s) { const m = s.match(/^.*?\.(\s|$)/); return m ? m[0].trim() : s; }
function trunc(s, n) { return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; }
function adsReady() { return ADSENSE.ENABLED && /^ca-pub-\d{10,}$/.test(ADSENSE.CLIENT); }
function adUnit() {
  if (!adsReady() || !/^\d{6,}$/.test(ADSENSE.SLOT_RESULT)) return '';
  return '<div class="ad noprint"><small>Iklan</small><ins class="adsbygoogle" style="display:block" data-ad-client="' + esc(ADSENSE.CLIENT) + '" data-ad-slot="' + esc(ADSENSE.SLOT_RESULT) + '" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>';
}
function crumbs(list, rel) {
  return '<nav class="crumbs" aria-label="Breadcrumb"><ol>' + list.map(function (c, i) {
    return '<li>' + (c[1] !== null && i < list.length - 1 ? '<a href="' + esc(rel + c[1]) + '">' + esc(c[0]) + '</a>' : '<span aria-current="page">' + esc(c[0]) + '</span>') + '</li>';
  }).join('') + '</ol></nav>';
}
function isIndexable(p) { return MODE === 'production' && p.index && !p.abs; }

function layout(p, main, o) {
  o = o || {};
  const rel = p.abs ? BASE_PATH : relOf(p.path);
  const robots = isIndexable(p) ? 'index,follow' : 'noindex,follow';
  const title = p.fullTitle || (p.title + ' | ' + SITE_NAME);
  const url = BASE_URL + p.path;
  const ext = function (cls, label) {
    return '<a ' + (cls ? 'class="' + cls + '" ' : '') + 'href="' + MAINILMU + '" rel="noopener">' + label + '<span class="sr"> (membuka situs induk Mainilmu)</span></a>';
  };
  const cur = function (k) {
    return (k === 'home' && p.type === 'home') || (k === 'kat' && !!p.cluster) || (p.cluster === k) || (p.type === 'static' && p.key === k);
  };
  const li = function (href, label, k) { return '<li><a href="' + esc(rel + href) + '"' + (cur(k) ? ' aria-current="page"' : '') + '>' + esc(label) + '</a></li>'; };
  const nav = li('', 'Beranda', 'home') + CLUSTERS.map(function (c) { return li(c.id + '/', c.short, c.id); }).join('') + li('metodologi/', 'Panduan', 'm') + li('peta-situs/', 'Peta Situs', 's') +
    '<li class="sp">' + ext('ext', iconSvg('n-ext') + 'Website utama Mainilmu') + '</li>';
  const bn = function (href, icon, label, k, external) {
    const a = external ? 'href="' + MAINILMU + '" rel="noopener"' : 'href="' + esc(rel + href) + '"' + (k && cur(k) ? ' aria-current="page"' : '');
    return '<li><a ' + a + '>' + iconSvg(icon) + '<span>' + label + '</span>' + (external ? '<span class="sr"> (membuka situs induk Mainilmu)</span>' : '') + '</a></li>';
  };
  const bottom = '<nav class="bnav" aria-label="Navigasi cepat"><ul>' +
    bn('', 'n-home', 'Beranda', 'home') + bn('#kategori', 'n-kat', 'Kategori', 'kat') + bn('#cari', 'n-cari', 'Cari') +
    bn('metodologi/', 'n-panduan', 'Panduan', 'm') + bn('', 'n-ext', 'Mainilmu', null, true) + '</ul></nav>';
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<title>' + esc(title) + '</title>',
    '<meta name="description" content="' + esc(p.desc) + '">',
    '<meta name="robots" content="' + robots + '">',
    MODE === 'production' && !p.abs ? '<link rel="canonical" href="' + esc(url) + '">' : '',
    '<meta name="theme-color" content="#0a6b57">',
    '<meta property="og:site_name" content="' + SITE_NAME + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:locale" content="id_ID">',
    '<meta property="og:title" content="' + esc(title) + '">',
    '<meta property="og:description" content="' + esc(p.desc) + '">',
    MODE === 'production' && !p.abs ? '<meta property="og:url" content="' + esc(url) + '">' : '',
    '<link rel="icon" type="image/svg+xml" href="' + rel + 'favicon.svg">',
    '<link rel="stylesheet" href="' + rel + 'style.css?v=' + ASSET_V + '">',
    adsReady() ? '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + esc(ADSENSE.CLIENT) + '" crossorigin="anonymous"></script>' : '',
    o.jsonld && isIndexable(p) ? '<script type="application/ld+json">' + jsonForScript(o.jsonld) + '</script>' : '',
  ].filter(Boolean).join('\n');
  const foot = POLICY_LINKS.map(function (l) { return '<li><a href="' + esc(l[1]) + '" rel="noopener">' + esc(l[0]) + '</a></li>'; }).join('');
  return '<!doctype html>\n<html lang="id">\n<head>\n' + head + '\n</head>\n<body data-root="' + esc(rel) + '">\n' +
    '<a class="skip" href="#main">Lewati ke konten</a>\n' +
    (MODE === 'preview' ? '<div class="pv" role="note">Mode pratinjau: halaman ini bukan versi produksi dan diberi noindex.</div>\n' : '') +
    '<header class="site"><div class="wrap"><a class="brand" href="' + esc(rel) + '">' + LOGO_SVG + '<span>' + SITE_NAME + '</span></a>' +
    '<nav class="main" aria-label="Navigasi utama"><ul>' + nav + '</ul></nav></div></header>\n' +
    '<main id="main" tabindex="-1"><div class="wrap">\n' + main + '\n</div></main>\n' +
    '<footer class="site"><div class="wrap"><nav aria-label="Informasi dan kebijakan"><ul>' + foot + '<li><a href="mailto:' + CONTACT_EMAIL + '">' + CONTACT_EMAIL + '</a></li></ul></nav>' +
    '<p>Hasil kalkulator bersifat simulasi dari angka yang Anda isi dan bukan nasihat keuangan, pajak, atau hukum.</p>' +
    '<p>Situs ini tidak memakai cookie, analitik, atau penyimpanan browser buatan sendiri. Perhitungan berjalan di perangkat Anda dan angka yang Anda isi tidak dikirim ke server kami.</p>' +
    '<p>&copy; ' + SITE_NAME + '</p></div></footer>\n' + bottom + '\n' +
    (o.search ? '<script src="' + rel + 'search-index.js?v=' + ASSET_V + '" defer></script>\n' : '') +
    '<script src="' + rel + 'app.js?v=' + ASSET_V + '" defer></script>\n</body>\n</html>\n';
}

function addPage(p, main, o) {
  if (NOINDEX_PATHS.indexOf(p.path) > -1) p.index = false;
  p.html = layout(p, main, o);
  pages.push(p);
  files.set(p.path === '404.html' ? '404.html' : p.path + 'index.html', p.html);
}
function linkList(items, rel) {
  return '<ul class="links">' + items.map(function (it) { return '<li><a href="' + esc(rel + it.path) + '">' + esc(it.title) + '</a></li>'; }).join('') + '</ul>';
}
function presetIntended(pr) {
  if (NOINDEX_PATHS.indexOf(pr.path) > -1) return false;
  return INDEX_REVIEWED.paths.indexOf(pr.path) > -1 || INDEX_REVIEWED.engines.indexOf(pr.engine) > -1 || INDEX_REVIEWED.clusters.indexOf(pr.cluster) > -1;
}

function buildAll() {
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

  function calcPage(p, eng) {
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
      : '<p>' + esc(p.scenario) + '</p><p>Halaman ini adalah skenario contoh dari <a href="' + esc(rel + eng.cluster + '/' + eng.id + '/') + '">' + esc(eng.name) + '</a>. Semua isian dapat Anda ubah; hasil berubah langsung tanpa memuat ulang halaman.</p>';
    const main = crumbs(crumbList, rel) +
      '<span class="badge">' + esc(cl.short) + ' · Simulasi</span>' +
      '<h1>' + esc(p.h1 || p.title) + '</h1>' +
      '<p class="lead">' + esc(firstSentence(p.type === 'hub' ? eng.intro : p.scenario)) + '</p>' +
      '<noscript><p class="warn">Interaksi (mengubah angka, tombol, dan pencarian) membutuhkan JavaScript. Hasil di bawah menampilkan nilai awal halaman ini.</p></noscript>' +
      '<div class="calc">' +
      '<section class="card" aria-labelledby="h-in"><h2 id="h-in">Isian</h2><form id="calc-form" novalidate>' + form +
      '<div class="actions" data-js><button type="submit" class="btn">Hitung ulang</button><button type="button" class="btn sec" id="btn-reset">Kembalikan nilai awal</button></div></form></section>' +
      '<section class="card" aria-labelledby="h-out"><h2 id="h-out">Hasil</h2><div id="result" aria-live="polite">' + result + '</div>' +
      '<div class="actions noprint" data-js><button type="button" class="btn sec" id="btn-copy">Salin hasil</button><button type="button" class="btn sec" id="btn-print">Cetak</button><button type="button" class="btn sec" id="btn-save">Simpan sebagai Skenario A</button><button type="button" class="btn sec" id="btn-clear" hidden>Hapus Skenario A</button></div>' +
      '<p id="status" class="muted" role="status"></p><div id="compare"></div></section></div>' +
      '<div class="disc" style="margin-top:18px"><strong>Perhatian:</strong> ' + esc(cl.disclaimer) + '</div>' +
      '<section class="block"><h2>Tentang skenario ini</h2>' + about + '<p>Hasil awal: <strong>' + esc(lead.l) + ' ' + esc(lead.v) + '</strong>.</p><h3>Asumsi</h3><ul class="links">' + asm.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></section>' +
      adUnit() +
      '<section class="block"><h2>Cara perhitungan</h2>' + eng.method.map(function (m) { return '<p>' + esc(m) + '</p>'; }).join('') + '<p><a href="' + esc(rel + 'metodologi/') + '">Baca panduan dan metodologi lengkap</a>.</p></section>' +
      '<section class="block"><h2>Pertanyaan umum</h2>' + faqHtml + '</section>' +
      variants +
      '<section class="block related"><h2>Kalkulator terkait</h2>' + linkList(rel2, rel) + '</section>';
    const cfg = '<script type="application/json" id="lc-config">' + jsonForScript({ engine: eng.id, title: p.title, values: p.values }) + '</script>';
    const jsonld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: eng.faq.map(function (f) { return { '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[1] } }; }) };
    addPage(p, main + cfg, { jsonld: jsonld });
  }

  CORE_ENGINES.forEach(function (eng) {
    byEngine[eng.id].hub = { type: 'hub', engine: eng.id, cluster: eng.cluster, path: eng.cluster + '/' + eng.id + '/', title: eng.name, h1: eng.name, values: LC.defaults(eng), index: true, asm: [] };
  });
  CORE_ENGINES.forEach(function (eng) {
    calcPage(byEngine[eng.id].hub, eng);
    byEngine[eng.id].forEach(function (pr) { pr.index = presetIntended(pr); calcPage(pr, eng); });
  });

  CLUSTERS.forEach(function (cl) {
    const p = { type: 'cluster', cluster: cl.id, path: cl.id + '/', title: 'Kalkulator ' + cl.name, h1: 'Kalkulator ' + cl.name, desc: trunc(cl.desc, 158), index: true };
    const rel = relOf(p.path);
    const engs = CORE_ENGINES.filter(function (e) { return e.cluster === cl.id; });
    const cards = engs.map(function (e) {
      return '<li><a class="card tool" href="' + esc(rel + e.cluster + '/' + e.id + '/') + '">' + iconSvg(cl.id) + '<strong>' + esc(e.name) + '</strong><span class="d">' + esc(firstSentence(e.intro)) + '</span><span class="d">' + byEngine[e.id].length + ' skenario contoh</span></a></li>';
    }).join('');
    addPage(p, crumbs([['Beranda', ''], [cl.short, null]], rel) + '<h1>' + esc(p.h1) + '</h1><p class="lead">' + esc(cl.desc) + '</p><ul class="grid" style="margin-top:16px">' + cards + '</ul>' +
      '<div class="disc" style="margin-top:22px"><strong>Perhatian:</strong> ' + esc(cl.disclaimer) + '</div>');
  });

  (function () {
    const p = { type: 'static', key: 'm', path: 'metodologi/', title: 'Panduan dan Metodologi Kalkulator', h1: 'Panduan dan metodologi kalkulator', desc: 'Rumus, asumsi, dan batasan setiap kalkulator di LIFE CALCULATOR, termasuk perbedaan bunga anuitas dan flat serta margin dan markup.', index: true };
    const rel = relOf(p.path);
    let body = crumbs([['Beranda', ''], ['Panduan', null]], rel) + '<h1>' + p.h1 + '</h1>' +
      '<p class="lead">Semua perhitungan berjalan di browser Anda. Halaman ini merangkum rumus dan asumsi setiap kalkulator. Angka bunga, biaya, dan potongan pada halaman skenario adalah contoh yang dapat diganti, bukan tarif atau ketentuan resmi.</p>' +
      '<h2>Cara memakai</h2><ol><li>Pilih kalkulator dari beranda, kategori, atau pencarian.</li><li>Ubah angka pada kolom isian; hasil berubah langsung.</li><li>Gunakan tabel &quot;Bagaimana jika angka berubah?&quot; untuk melihat pengaruh satu isian.</li><li>Simpan Skenario A untuk dibandingkan dengan angka lain, atau salin dan cetak hasilnya.</li></ol>';
    CLUSTERS.forEach(function (cl) {
      body += '<h2>' + esc(cl.name) + '</h2><div class="disc">' + esc(cl.disclaimer) + '</div>';
      CORE_ENGINES.filter(function (e) { return e.cluster === cl.id; }).forEach(function (e) {
        body += '<h3><a href="' + esc(rel + e.cluster + '/' + e.id + '/') + '">' + esc(e.name) + '</a></h3>' + e.method.map(function (m) { return '<p>' + esc(m) + '</p>'; }).join('') + '<ul class="links">' + e.assumptions.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>';
      });
    });
    body += '<h2>Pembulatan</h2><p>Angsuran dan bunga bulanan dibulatkan ke rupiah penuh. Selisih pembulatan ditampung pada angsuran terakhir sehingga sisa pokok berakhir nol. Pada pokok kecil, tenor panjang, atau bunga tinggi, pembulatan dapat membuat cicilan terakhir berbeda jauh atau pinjaman lunas lebih awal; hasil akan menampilkan penjelasan bila itu terjadi.</p>' +
      '<h2>Privasi</h2><p>Situs ini tidak membuat cookie atau menyimpan data di browser Anda, dan angka yang Anda isi diproses di perangkat Anda. Tautan ke Mainilmu dan halaman kebijakan membuka situs lain yang memiliki kebijakan sendiri.</p>';
    addPage(p, body);
  })();

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

  (function () {
    const p = { type: 'home', path: '', title: SITE_NAME, fullTitle: SITE_NAME + ' - Kalkulator Pinjaman, KPR, Usaha, Gaji, dan Konstruksi', h1: SITE_NAME, desc: 'Kalkulator gratis untuk simulasi cicilan pinjaman, KPR, HPP dan BEP usaha, gaji, serta kebutuhan material konstruksi. Berjalan langsung di browser.', index: true };
    const rel = relOf(p.path);
    let body = '<section class="hero"><span class="badge">Gratis · berjalan di browser Anda</span><h1>' + SITE_NAME + '</h1><p>Simulasi cicilan, KPR, harga jual dan titik impas usaha, gaji, serta kebutuhan material. Isi angka, hasil langsung tampil.</p></section>' +
      '<noscript><p class="warn">Pencarian dan kalkulator membutuhkan JavaScript. Daftar kategori di bawah tetap dapat dibuka.</p></noscript>' +
      '<section id="cari" class="card" data-js aria-labelledby="h-cari"><h2 id="h-cari">Cari kalkulator</h2>' +
      '<form class="search" role="search"><label class="sr" for="q">Cari kalkulator</label><input id="q" type="search" placeholder="Cari, mis. KPR 500 juta, margin, keramik" autocomplete="off"></form>' +
      '<div class="chips" role="group" aria-label="Filter kategori"><button type="button" class="chip" data-chip="" aria-pressed="true">Semua</button>' +
      CLUSTERS.map(function (c) { return '<button type="button" class="chip" data-chip="' + esc(c.short) + '" aria-pressed="false">' + esc(c.short) + '</button>'; }).join('') + '</div>' +
      '<p id="q-count" class="muted" role="status"></p><ul id="q-res" class="results"></ul></section>' +
      '<div id="kategori">';
    CLUSTERS.forEach(function (cl) {
      const engs = CORE_ENGINES.filter(function (e) { return e.cluster === cl.id; });
      body += '<section class="block"><h2><a href="' + esc(rel + cl.id + '/') + '">' + esc(cl.name) + '</a></h2><p>' + esc(cl.desc) + '</p><ul class="grid">' +
        engs.map(function (e) { return '<li><a class="card tool" href="' + esc(rel + e.cluster + '/' + e.id + '/') + '">' + iconSvg(cl.id) + '<strong>' + esc(e.name) + '</strong><span class="d">' + esc(firstSentence(e.intro)) + '</span></a></li>'; }).join('') + '</ul></section>';
    });
    body += '</div><section class="block"><h2>Cara kerja dan batasan</h2><p>Setiap halaman skenario memakai kalkulator yang sama dengan angka awal berbeda; semua angka dapat diubah. Bunga, biaya, dan potongan pada skenario adalah contoh. Baca <a href="' + esc(rel + 'metodologi/') + '">panduan dan metodologi</a> untuk rumus dan asumsi, atau kunjungi <a href="' + MAINILMU + '" rel="noopener">website utama Mainilmu</a>.</p></section>';
    addPage(p, body, { search: true });
  })();

  (function () {
    const p = { type: 'static', key: '404', path: '404.html', abs: true, title: 'Halaman tidak ditemukan', desc: 'Halaman yang Anda cari tidak ditemukan.', index: false };
    addPage(p, '<h1>Halaman tidak ditemukan</h1><p class="lead">Alamat yang Anda buka tidak tersedia. Kembali ke <a href="' + esc(BASE_PATH) + '">beranda</a> atau gunakan menu.</p>');
  })();
  return byEngine;
}

// =====================================================================
// 9. FILE BERSAMA, SITEMAP, ROBOTS
// =====================================================================
function metaOf(html) {
  const rb = (html.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || '';
  const cn = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || '';
  return { robots: rb, canonical: cn.replace(/&amp;/g, '&'), noindex: /noindex/i.test(rb) };
}
function buildSharedFiles() {
  files.set('style.css', CSS.trim() + '\n');
  files.set('app.js', APP_JS);
  files.set('favicon.svg', FAVICON_SVG + '\n');
  files.set('.nojekyll', '');
  const idx = pages.filter(function (p) { return p.type === 'hub' || p.type === 'preset' || p.type === 'cluster'; }).map(function (p) {
    return [p.title, p.path, CL[p.cluster].short, p.type === 'hub' ? 'h' : p.type === 'preset' ? 'p' : 'c'];
  });
  files.set('search-index.js', 'window.LC_INDEX=' + jsonForScript(idx) + ';\n');

  if (MODE !== 'production') return [];
  // Sitemap dibangun dari metadata EFEKTIF pada HTML (bukan dari properti internal).
  const urls = pages.filter(function (p) {
    const m = metaOf(p.html);
    return !m.noindex && m.canonical === BASE_URL + p.path;
  }).map(function (p) { return BASE_URL + p.path; });
  const CH = 45000;
  const mk = function (list) { return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + list.map(function (u) { return '<url><loc>' + esc(u) + '</loc></url>'; }).join('\n') + '\n</urlset>\n'; };
  if (urls.length <= CH) {
    files.set('sitemap.xml', mk(urls));
  } else {
    const n = Math.ceil(urls.length / CH);
    let x = '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    for (let i = 0; i < n; i++) {
      files.set('sitemap-' + (i + 1) + '.xml', mk(urls.slice(i * CH, (i + 1) * CH)));
      x += '<sitemap><loc>' + esc(BASE_URL + 'sitemap-' + (i + 1) + '.xml') + '</loc></sitemap>\n';
    }
    files.set('sitemap.xml', x + '</sitemapindex>\n');
  }
  files.set('robots.txt', 'User-agent: *\nAllow: /\n\nSitemap: ' + BASE_URL + 'sitemap.xml\n');
  return urls;
}

// =====================================================================
// 10. UJI ASAP KLIEN (DOM tiruan, menjalankan app.js yang sama dengan produksi)
// =====================================================================
function smokeClient(page, searchJs) {
  const ids = new Set();
  page.html.replace(/\sid="([^"]+)"/g, function (m, id) { ids.add(id); return m; });
  class El {
    constructor(t) { this.tag = t; this.nodeType = 1; this.attrs = {}; this.children = []; this.handlers = {}; this._t = ''; this.value = ''; this.hidden = false; }
    setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; } removeAttribute(k) { delete this.attrs[k]; }
    appendChild(c) { this.children.push(c); return c; } addEventListener(e, f) { this.handlers[e] = f; }
    set textContent(v) { this._t = String(v); this.children = []; }
    get textContent() { return this._t + this.children.map(function (c) { return c.textContent; }).join(' '); }
    querySelectorAll() { return []; } focus() {} select() {}
    fire(type) { if (!this.handlers[type]) throw new Error('handler ' + type + ' tidak terpasang pada ' + this.tag); this.handlers[type]({ preventDefault() {}, target: { closest() { return null; } } }); }
  }
  const els = {};
  const get = function (id) { if (!ids.has(id)) return null; return els[id] || (els[id] = new El(id)); };
  const chips = [];
  const cfgM = page.html.match(/id="lc-config">([^<]*)</);
  if (cfgM) get('lc-config').textContent = cfgM[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&');
  let printed = 0;
  const ctx = {
    document: {
      body: { getAttribute: function () { return '../../'; }, appendChild() {}, removeChild() {} },
      documentElement: { className: '' },
      getElementById: get,
      createElement: function (t) { return new El(t); },
      createTextNode: function (t) { return { nodeType: 3, textContent: String(t) }; },
      querySelectorAll: function (sel) { return sel === '[data-chip]' ? chips : []; },
    },
    navigator: { clipboard: { writeText: function () { return Promise.resolve(); } } },
    location: { href: 'https://example.test/', hash: '' },
    JSON: JSON, Math: Math, Object: Object, Array: Array, String: String, Number: Number, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat, Promise: Promise,
    addEventListener() {}, print: function () { printed++; },
  };
  ctx.window = ctx;
  if (get('q')) {
    ['', 'Pinjaman', 'KPR'].forEach(function (c) { const e = new El('chip'); e.setAttribute('data-chip', c); chips.push(e); });
  }
  const vm = require('vm');
  vm.createContext(ctx);
  if (searchJs) vm.runInContext(searchJs, ctx);
  if (cfgM) {
    const cfg = JSON.parse(get('lc-config').textContent);
    Object.keys(cfg.values).forEach(function (k) { get('f-' + k).value = LC.plain(cfg.values[k]); });
    vm.runInContext(APP_JS, ctx);
    const out = get('result'), form = get('calc-form');
    const eng = engineById[cfg.engine];
    if (!out.children.length || out.textContent.indexOf(page.res.summary[0].l) < 0) throw new Error('PENGUJIAN GAGAL: klien tidak merender hasil awal pada ' + page.path);
    if (ctx.document.documentElement.className.indexOf('js') < 0) throw new Error('PENGUJIAN GAGAL: kelas js tidak dipasang');
    eng.fields.forEach(function (f) {
      const inp = get('f-' + f.id), keep = inp.value;
      inp.value = 'abc'; form.fire('input');
      if (!get('f-' + f.id + '-err').textContent || out.textContent.indexOf('Periksa') < 0) throw new Error('PENGUJIAN GAGAL: error validasi tidak tampil untuk ' + f.id + ' pada ' + page.path);
      inp.value = keep; form.fire('input');
      if (inp.handlers.blur) inp.fire('blur');
    });
    get('btn-save').fire('click');
    if (get('btn-clear').hidden !== false) throw new Error('PENGUJIAN GAGAL: tombol hapus skenario tidak muncul');
    form.fire('input');
    if (!get('compare').children.length) throw new Error('PENGUJIAN GAGAL: perbandingan skenario tidak tampil');
    get('btn-clear').fire('click');
    if (get('compare').children.length) throw new Error('PENGUJIAN GAGAL: skenario tidak terhapus');
    get('btn-copy').fire('click');
    get('btn-print').fire('click');
    if (printed !== 1) throw new Error('PENGUJIAN GAGAL: tombol cetak tidak memanggil print');
    eng.fields.forEach(function (f) { get('f-' + f.id).value = '999999999999999999'; });
    form.fire('input');
    get('btn-reset').fire('click');
    eng.fields.forEach(function (f) { if (get('f-' + f.id).value !== LC.plain(cfg.values[f.id])) throw new Error('PENGUJIAN GAGAL: reset tidak memulihkan ' + f.id); });
  } else {
    vm.runInContext(APP_JS, ctx);
    const q = get('q'), list = get('q-res');
    q.value = 'kpr'; q.fire('input');
    if (!list.children.length) throw new Error('PENGUJIAN GAGAL: pencarian "kpr" tidak menghasilkan tautan');
    chips[1].fire('click');
    q.value = ''; q.fire('input');
    if (!list.children.length || chips[1].getAttribute('aria-pressed') !== 'true') throw new Error('PENGUJIAN GAGAL: filter kategori tidak berfungsi');
    q.value = 'zzzzqqqq'; q.fire('input');
    if (list.children.length) throw new Error('PENGUJIAN GAGAL: pencarian tanpa hasil masih menampilkan tautan');
  }
}

// =====================================================================
// 11. PENGUJIAN STRUKTUR (sebelum menulis ke disk)
// =====================================================================
function pageText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
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
  assert(new Set(pages.map(function (p) { return p.title; })).size === pages.length, 'Tidak ada judul halaman duplikat');
  const presetDescs = presets.map(function (p) { return p.desc; });
  assert(new Set(presetDescs).size === presetDescs.length, 'Meta description halaman preset unik');
  assert(pages.every(function (p) { return p.desc.length > 20 && p.desc.length <= 160; }), 'Meta description 20-160 karakter pada semua halaman');
  assert(CORE_ENGINES.every(function (e) { return byEngine[e.id].length > 0; }), 'Setiap mesin kalkulator memiliki halaman preset');
  assert(presets.every(function (p) { return p.res && p.res.summary.length > 0 && p.res.tables.length > 0; }), 'Setiap halaman preset: input valid, hasil default tampil, tabel tersedia (' + presets.length + ' halaman)');
  assert(pages.every(function (p) { return !/NaN|Infinity|undefined|\[object/.test(p.html); }), 'Tidak ada NaN, Infinity, undefined, atau [object] pada HTML mana pun');

  INDEX_REVIEWED.paths.concat(NOINDEX_PATHS).forEach(function (x) { assert(paths.indexOf(x) > -1, 'Konfigurasi indeks merujuk path yang ada: ' + x); });
  INDEX_REVIEWED.engines.forEach(function (x) { assert(!!engineById[x], 'Konfigurasi indeks merujuk engine yang ada: ' + x); });
  INDEX_REVIEWED.clusters.forEach(function (x) { assert(!!CL[x], 'Konfigurasi indeks merujuk klaster yang ada: ' + x); });

  const meta = {};
  pages.forEach(function (p) { meta[p.path] = metaOf(p.html); });
  if (MODE === 'preview') {
    assert(pages.every(function (p) { return meta[p.path].noindex; }), 'Mode preview: meta noindex efektif pada semua ' + pages.length + ' halaman');
    assert(pages.every(function (p) { return !meta[p.path].canonical; }), 'Mode preview: tidak ada canonical (domain produksi belum aktif)');
    assert(!files.has('sitemap.xml') && !files.has('robots.txt'), 'Mode preview: tidak membuat sitemap.xml dan robots.txt (agar halaman bisa diakses dan noindex terbaca)');
    assert(!Array.from(files.entries()).some(function (e) { return /\.html$/.test(e[0]) && e[1].indexOf('calculator.mainilmu.pro') > -1; }), 'Mode preview: tidak ada rujukan ke domain produksi');
    assert(!pages.some(function (p) { return p.html.indexOf('application/ld+json') > -1; }), 'Mode preview: tanpa data terstruktur pada halaman noindex');
  } else {
    assert(BASE_PATH === '/', 'Mode production: BASE_PATH = / (domain root)');
    assert(pages.every(function (p) { return p.abs || meta[p.path].canonical === BASE_URL + p.path; }), 'Mode production: canonical self-referencing ke ' + BASE_URL);
    assert(pages.every(function (p) { return isIndexable(p) === !meta[p.path].noindex; }), 'Mode production: meta robots efektif sesuai kebijakan indeks');
    assert(presets.every(function (p) { return meta[p.path].noindex === !presetIntended(p); }), 'Mode production: preset noindex kecuali yang ditandai sudah ditinjau (INDEX_REVIEWED)');
    assert(!Array.from(files.entries()).some(function (e) { return /\.html$/.test(e[0]) && e[1].indexOf('github.io') > -1; }), 'Mode production: tidak ada rujukan ke github.io');
    const xml = files.get('sitemap.xml');
    assert(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(xml) && /<\/urlset>\n$/.test(xml), 'Sitemap XML: deklarasi, namespace, dan penutup benar');
    const locs = (xml.match(/<loc>[^<]*<\/loc>/g) || []).map(function (m) { return m.slice(5, -6); });
    assert(locs.length === sitemapUrls.length && locs.length <= 50000 && xml.length < 50 * 1024 * 1024, 'Sitemap XML: jumlah URL (' + locs.length + ') dan ukuran dalam batas format');
    assert(!/&(?!amp;|lt;|gt;|quot;|#39;)/.test(xml.replace(/<\?xml[^>]*\?>/, '')), 'Sitemap XML: karakter khusus ter-escape');
    assert(new Set(locs).size === locs.length, 'Sitemap XML: tidak ada URL duplikat');
    const byUrl = {};
    pages.forEach(function (p) { byUrl[BASE_URL + p.path] = p; });
    assert(locs.every(function (u) { const p = byUrl[u]; return p && !meta[p.path].noindex && meta[p.path].canonical === u; }), 'Sitemap: setiap URL adalah halaman nyata, indexable pada HTML, dan canonical-nya dirinya sendiri');
    assert(pages.filter(function (p) { return !meta[p.path].noindex && !p.abs; }).length === locs.length, 'Sitemap memuat tepat semua halaman yang indexable pada HTML (tidak kurang, tidak lebih)');
    assert(locs.every(function (u) { return u.indexOf(BASE_URL) === 0; }) && files.get('robots.txt').indexOf('Sitemap: ' + BASE_URL + 'sitemap.xml') > -1, 'Sitemap dan robots.txt memakai URL produksi');
    assert(!locs.some(function (u) { return meta[byUrl[u].path].noindex; }), 'Sitemap tidak memuat URL noindex');
  }

  ['style.css', 'app.js', 'favicon.svg', 'index.html', 'search-index.js', '404.html'].forEach(function (f) { assert(files.has(f), 'Berkas ' + f + ' tersedia'); });

  const fileSet = new Set(files.keys());
  let checked = 0;
  pages.forEach(function (p) {
    const re = /(?:href|src)="([^"]+)"/g;
    let m;
    while ((m = re.exec(p.html))) {
      let u = m[1].replace(/&amp;/g, '&');
      if (/^https?:\/\//.test(u)) {
        if (!(u.indexOf('https://www.mainilmu.pro/') === 0 || (MODE === 'production' && u === BASE_URL + p.path) || (adsReady() && u.indexOf('https://pagead2.googlesyndication.com/') === 0))) throw new Error('PENGUJIAN GAGAL: tautan/aset eksternal tidak diizinkan pada ' + p.path + ': ' + u);
        continue;
      }
      if (/^(mailto:|tel:|#|data:)/.test(u)) continue;
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
  assert(checked > 0, 'Tautan dan aset relatif valid pada seluruh halaman (' + checked + ' tautan diperiksa), tanpa tautan root-absolut kecuali 404');
  assert(true, 'Satu-satunya tautan eksternal hanya ke www.mainilmu.pro (tanpa CDN, font, atau skrip pihak ketiga)');

  const polHrefs = POLICY_LINKS.map(function (l) { return l[1]; });
  assert(pages.every(function (p) { return polHrefs.every(function (u) { return p.html.indexOf('href="' + u + '"') > -1; }) && p.html.indexOf('mailto:' + CONTACT_EMAIL) > -1; }), 'Footer memuat 6 tautan kebijakan dan email kontak pada semua halaman');
  assert(pages.every(function (p) { return p.html.indexOf('class="ext" href="https://www.mainilmu.pro/"') > -1 && p.html.indexOf('Website utama Mainilmu') > -1; }), 'Navigasi header memuat tautan "Website utama Mainilmu" pada semua halaman');
  const bnavOf = function (p) { return (p.html.match(/<nav class="bnav"[\s\S]*?<\/nav>/) || [''])[0]; };
  assert(pages.every(function (p) { const b = bnavOf(p); return (b.match(/<li>/g) || []).length === 5 && (b.match(/<svg/g) || []).length === 5 && b.indexOf('Mainilmu') > -1; }), 'Navigasi bawah mobile: 5 tautan dengan ikon SVG dan label pada semua halaman');
  assert(pages.every(function (p) { const n = (bnavOf(p).match(/aria-current="page"/g) || []).length; return (p.type === 'home' || p.cluster || p.key === 'm') ? n === 1 : n === 0; }), 'Navigasi bawah: status aktif hanya pada halaman yang benar (Beranda, Kategori, atau Panduan)');
  const home = pages.find(function (p) { return p.type === 'home'; });
  assert(home.html.indexOf('id="kategori"') > -1 && home.html.indexOf('id="cari"') > -1, 'Target tombol Kategori (#kategori) dan Cari (#cari) ada di beranda');
  assert(pages.every(function (p) {
    const h = p.html;
    if ((h.match(/<h1[ >]/g) || []).length !== 1) return false;
    if (h.indexOf('<html lang="id">') < 0 || h.indexOf('<main id="main"') < 0 || h.indexOf('class="skip"') < 0) return false;
    const ids = (h.match(/\sid="[^"]+"/g) || []);
    if (new Set(ids).size !== ids.length) return false;
    const inputs = (h.match(/<input id="([^"]+)"/g) || []).map(function (x) { return x.slice(11, -1); });
    return inputs.every(function (id) { return h.indexOf('<label for="' + id + '"') > -1 || h.indexOf('<label class="sr" for="' + id + '"') > -1; });
  }), 'Semua halaman: satu h1, lang, landmark main, skip link, id unik, setiap input punya label');
  assert(pages.every(function (p) { return (p.type !== 'preset' && p.type !== 'hub') || (/aria-describedby=/.test(p.html) && /role="alert"/.test(p.html) && /aria-live="polite"/.test(p.html)); }), 'Halaman kalkulator memuat aria-describedby, role=alert untuk error, dan aria-live untuk hasil');
  assert(/prefers-reduced-motion/.test(CSS) && /env\(safe-area-inset-bottom/.test(CSS) && /prefers-color-scheme:dark/.test(CSS), 'CSS: prefers-reduced-motion, safe-area-inset-bottom, dan mode gelap tersedia');
  assert(pages.every(function (p) { return p.html.indexOf('width=device-width') > -1; }), 'Viewport meta pada semua halaman');

  const sentences = new Set();
  pages.forEach(function (p) { pageText(p.html).split(/(?<=[.!?])\s+|\s{2,}/).forEach(function (t) { sentences.add(t.trim()); }); });
  const allText = Array.from(sentences).join('\n');
  assert(!/terbaru|terverifikasi|diverifikasi|tervalidasi|telah diperiksa/i.test(allText), 'Teks tidak memuat klaim "terbaru", "terverifikasi", atau "diverifikasi"');
  assert(!/\b(BCA|BRI|BNI|Mandiri|BTN|CIMB|Danamon|Permata|Shopee|Tokopedia|Lazada|OJK|KUR|Bank Indonesia)\b/.test(allText), 'Teks tidak memuat nama bank, marketplace, atau produk tertentu');
  const resmi = Array.from(sentences).filter(function (t) { return /resmi/i.test(t) && !/(bukan|tidak|Tidak|rujuk|Periksa|periksa|peraturan)/.test(t); });
  assert(resmi.length === 0, 'Kata "resmi" hanya muncul dalam konteks penyangkalan atau rujukan' + (resmi.length ? ': ' + resmi[0] : ''));
  assert(pages.filter(function (p) { return p.cluster === 'gaji'; }).every(function (p) { return /tidak menghitung PPh 21|TIDAK menghitung PPh 21/.test(p.html); }), 'Seluruh halaman klaster gaji memuat peringatan bahwa PPh 21, BPJS, dan pesangon tidak dihitung menurut peraturan');
  assert(pages.every(function (p) { return !p.cluster || p.html.indexOf('class="disc"') > -1; }), 'Setiap halaman kalkulator memuat disclaimer sesuai klaster');

  const btnIds = new Set();
  pages.forEach(function (p) { (p.html.match(/<button[^>]*\sid="(btn-[a-z]+)"/g) || []).forEach(function (m) { btnIds.add(m.match(/id="([^"]+)"/)[1]); }); });
  assert(btnIds.size === 5 && Array.from(btnIds).every(function (id) { return APP_JS.indexOf("getElementById('" + id + "')") > -1; }), 'Setiap tombol (' + Array.from(btnIds).join(', ') + ') memiliki implementasi di app.js');
  assert(!/(localStorage|sessionStorage|serviceWorker|innerHTML|eval\(|document\.cookie)/.test(APP_JS), 'app.js tidak memakai innerHTML, eval, cookie, storage, atau service worker');
  const searchJs = files.get('search-index.js');
  hubs.forEach(function (p) { smokeClient(p, searchJs); });
  smokeClient(presets[0], searchJs);
  smokeClient(presets[presets.length - 1], searchJs);
  smokeClient(home, searchJs);
  assert(true, 'Uji klien (DOM tiruan, app.js yang sama): hasil awal, validasi per field, reset, simpan/bandingkan/hapus skenario, salin, cetak, format rupiah, pencarian, dan filter kategori pada ' + (hubs.length + 3) + ' halaman');

  if (ADSENSE.ENABLED) assert(adsReady(), 'ADSENSE.ENABLED=true memerlukan ADSENSE.CLIENT berformat ca-pub-... milik Anda');
  assert(ADSENSE.ENABLED || !/adsbygoogle|googlesyndication|ca-pub-\d/.test(Array.from(files.values()).join('')), 'AdSense nonaktif: tidak ada skrip, unit, atau ID iklan pada output');
  return { perCluster: perCluster, presets: presets.length, hubs: hubs.length };
}

// =====================================================================
// 12. TULIS KE DISK
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
    if (!fs.existsSync(path.join(root, name))) throw new Error('PENGUJIAN GAGAL: file tidak tertulis: ' + name);
  });
  ['style.css', 'app.js', 'favicon.svg', 'index.html'].forEach(function (f) { assert(fs.statSync(path.join(root, f)).size > 0, 'File ' + f + ' tertulis di disk dan tidak kosong'); });
  const n = (function walk(d) {
    let c = 0;
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      if (e.isDirectory()) c += walk(path.join(d, e.name)); else if (e.name === 'index.html') c++;
    });
    return c;
  })(root);
  const expect = pages.filter(function (p) { return p.path !== '404.html'; }).length;
  assert(n === expect, 'Jumlah index.html di disk (' + n + ') = halaman dibuat (' + expect + ')');
  assert((MODE === 'production') === fs.existsSync(path.join(root, 'sitemap.xml')), 'sitemap.xml ' + (MODE === 'production' ? 'ada' : 'tidak ada') + ' di disk sesuai mode ' + MODE);
}

// =====================================================================
// 13. MAIN
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

  if (process.env.LC_LIST_PRESETS) {
    console.log('\n=== DAFTAR PRESET UNTUK TINJAUAN EDITORIAL (path relatif) ===');
    CORE_ENGINES.forEach(function (e) {
      console.log('# ' + e.cluster + ' / ' + e.id + ' (' + byEngine[e.id].length + ')');
      byEngine[e.id].forEach(function (p) { console.log('  ' + p.path + (p.index ? '   [INDEX]' : '')); });
    });
  }
  const indexable = pages.filter(function (p) { return isIndexable(p); }).length;
  const presetIdx = pages.filter(function (p) { return p.type === 'preset' && p.index; }).length;
  console.log('\n=== PENGUJIAN YANG DIJALANKAN BUILD (' + TEST_LOG.length + ' lulus) ===');
  TEST_LOG.forEach(function (t) { console.log('  [OK] ' + t); });
  console.log('\n=== LAPORAN ===');
  console.log('Mesin kalkulator terdaftar (fungsi calc berbeda): ' + CORE_ENGINES.length + ' (sebagian berbagi pola dasar, mis. anuitas, 0%, dan pelunasan dipercepat memakai jadwal anuitas)');
  console.log('Halaman hub (kalkulator utama): ' + stats.hubs + ' | halaman preset (angka berbeda, mesin sama): ' + stats.presets);
  CLUSTERS.forEach(function (c) {
    const s = stats.perCluster[c.id];
    console.log('  ' + c.id.padEnd(11) + ' preset: ' + String(s.presets).padStart(4) + ' | hub: ' + s.hubs + ' | total: ' + (s.presets + s.hubs) + ' (target ' + MIN_PAGES[c.id] + ')');
  });
  console.log('Total halaman HTML: ' + pages.length + ' (termasuk beranda, kategori, panduan, peta situs, 404)');
  console.log('Mode ' + MODE + ': halaman indexable efektif = ' + indexable + ' | noindex efektif = ' + (pages.length - indexable) + (MODE === 'preview' ? ' (semua noindex pada preview)' : ''));
  console.log('Kebijakan indeks produksi: ' + pages.filter(function (p) { return p.index; }).length + ' halaman ditandai indexable (termasuk ' + presetIdx + ' preset yang ditinjau); ' + (stats.presets - presetIdx) + ' preset menunggu tinjauan editorial');
  if (ADSENSE.ENABLED) console.log('PERHATIAN: AdSense aktif. ads.txt TIDAK dibuat otomatis; periksa ads.txt dan status domain di akun AdSense, serta consent/kebijakan privasi.');
  console.log('Selesai dalam ' + (Date.now() - t0) + ' ms. Output: ' + root);
}

main();
