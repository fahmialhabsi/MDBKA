/**
 * C0 (16 Okt 2026) — Kantor Cabang MDBKA: daftar cabang, Formulir R, keputusan Pusat. MURNI.
 * Rancangan: docs/RANCANGAN-2026-10-16-kantor-cabang-mdbka.md.
 * Cabang hanya MEREKOMENDASIKAN; yang memutuskan hanya Kantor Pusat (Fahmi).
 * Keputusan SETUJU/TOLAK final (tidak bisa ditimpa); TUNDA boleh diikuti keputusan lain.
 */

export type BranchCode = "KC-1" | "KC-2" | "KC-3" | "KC-4" | "KC-5";

export interface BranchPost {
  readonly jabatan: string;
  /** Siapa yang memegang jabatan: program berbasis aturan (tanpa AI) atau orang. */
  readonly pemegang: string;
  readonly tugas: string;
  readonly tanggungJawab: string;
  /** Batas wewenang: apa yang BOLEH dan TIDAK BOLEH dilakukan. */
  readonly wewenang: string;
  /** Syarat agar boleh menduduki jabatan ini (kemampuan yang wajib dimiliki pemegang). */
  readonly syarat?: string;
  /** Apakah calon pemegang yang memenuhi syarat sudah ada di MDBKA. */
  readonly calon?: "TERSEDIA" | "SEBAGIAN" | "BELUM_ADA";
}

export interface Branch {
  readonly code: BranchCode;
  readonly name: string;
  readonly misi: string;
  readonly hasil: string;
  readonly struktur: readonly BranchPost[];
  /** SOP: langkah kerja berurutan. */
  readonly sop: readonly string[];
  /** Alur kerja: dari bahan masuk sampai hasil keluar. */
  readonly alur: readonly string[];
}

const TIDAK_ORDER = "Tidak pernah mengirim order dan tidak memutuskan apa pun — hanya mengusulkan.";

export const BRANCHES: readonly Branch[] = [
  {
    code: "KC-1",
    name: "Pilih Pijakan",
    misi: "Menetapkan SATU broker (Finex, OTB, MIFX, atau Exness) yang PALING DEKAT dengan prinsip MDBKA, untuk pelatihan (KC-3) sekaligus pengujian (KC-4) memakai AKUN DEMO.",
    hasil: "Jawaban \"broker yang paling dekat dengan prinsip MDBKA\": satu broker terpilih + nilai kedekatan tiap prinsip + alasan dan angka.",
    struktur: [
      {
        jabatan: "Kepala Cabang (Penilai Akhir)",
        pemegang: "Program kepalaCabang (src/lib/kc1Assessment.ts) — AKTIF",
        syarat: "Menghitung dengan aturan tetap (bahan sama → hasil sama); tidak memihak broker mana pun; bisa membaca 4 Kartu Broker dan menulis Formulir R.",
        calon: "TERSEDIA",
        tugas: "Mengumpulkan nilai 4 prinsip dari para petugas untuk Finex, OTB, MIFX dan Exness, menggugurkan broker yang gagal syarat wajib, lalu menyusun satu Formulir R \"Broker Terpilih\".",
        tanggungJawab: "Rekomendasi menjawab \"broker paling dekat prinsip MDBKA\" dengan angka bersumber; angka tak diketahui ditulis \"…\".",
        wewenang: `Boleh mengusulkan satu broker. Tidak boleh mengubah nilai dari petugas, mengganti broker aplikasi, membuka akun, atau memindah dana. ${TIDAK_ORDER}`,
      },
      {
        jabatan: "Petugas Prinsip Merangkak",
        pemegang: "petugasMerangkak membaca MDBKA_Specs_<login demo>.csv (lot minimum + kelipatan lot) — AKTIF; setoran minimum dari config/kc1-fakta-broker.json (dicatat Konsultan); kelipatan lot baru dilaporkan, belum jadi syarat gugur (ambang belum ditetapkan Fahmi)",
        syarat: "Bisa membaca lot minimum dan kelipatan lot tiap simbol dari MT5, serta setoran minimum akun dari sumber resmi broker.",
        calon: "SEBAGIAN",
        tugas: "Memeriksa apakah broker bisa dimulai sekecil mungkin: lot minimum 0,01 dan setoran awal kecil.",
        tanggungJawab: "Menyebut simbol/golongan yang lot minimumnya lebih besar dari 0,01.",
        wewenang: "Hanya menilai prinsip Merangkak. Lot minimum di atas 0,01 untuk semua golongan = gugur wajib.",
      },
      {
        jabatan: "Petugas Prinsip Dari Bawah",
        pemegang: "petugasDariBawah: MDBKA_Margin_<broker>.csv + preset komisi + kurs ECB — AKTIF",
        syarat: "Bisa menghitung biaya pulang-pergi lot minimum (spread + komisi) per golongan dalam Rupiah dengan kurs ECB.",
        calon: "TERSEDIA",
        tugas: "Menghitung berapa persen modal kecil (±Rp500.000) yang habis untuk biaya satu trade di tiap golongan.",
        tanggungJawab: "Menuliskan tanggal file Margin dan kurs yang dipakai.",
        wewenang: "Hanya menghitung. Tidak boleh mengubah preset biaya broker.",
      },
      {
        jabatan: "Petugas Prinsip Ke Atas",
        pemegang: "petugasKeAtas membaca config/kc1-fakta-broker.json (bukti legal dicatat Konsultan, ditetapkan Pusat) — AKTIF",
        syarat: "Bisa membuktikan status terdaftar broker dengan tautan resmi dan tanggal pemeriksaan, serta apakah broker yang sama punya akun live dengan aturan sama.",
        calon: "SEBAGIAN",
        tugas: "Memeriksa apakah broker bisa dipakai naik dari demo ke live tanpa pindah broker: legal di Indonesia dan punya akun live.",
        tanggungJawab: "Status diperiksa ulang paling lambat tiap 6 bulan; tanpa bukti = \"belum terverifikasi\".",
        wewenang: "Broker \"belum terverifikasi\" atau tidak legal = gugur wajib. Tidak menilai prinsip lain.",
      },
      {
        jabatan: "Petugas Prinsip Terbukti",
        pemegang: "petugasTerbukti: banding spesifikasi demo vs live + panjang file *_LONG.csv (dibaca langsung dari Common Files di kc1Runner.ts, BUKAN dari map DAFTAR_DATA KC-2 meski KC-2 kini AKTIF — audit A-2 16 Okt 2026; belum ditinjau ulang) — AKTIF",
        syarat: "Bisa membandingkan spesifikasi akun demo dan live, dan menilai apakah sejarah data cukup untuk latih 60% · try-out 20% · ujian 20%.",
        calon: "SEBAGIAN",
        tugas: "Memeriksa bahwa hasil latihan di akun demo berlaku juga di live: akun demo ada, spesifikasi demo = live, data sejarah cukup.",
        tanggungJawab: "Menyebut perbedaan demo vs live dan golongan yang datanya kurang.",
        wewenang: "Tanpa akun demo = gugur wajib. Tidak meminta ekspor data sendiri; permintaan data lewat KC-2.",
      },
    ],
    sop: [
      "Kepala Cabang membuka penilaian untuk 4 broker: Finex, OTB, MIFX, Exness (akun demo).",
      "Petugas Merangkak menilai lot minimum dan setoran awal tiap broker.",
      "Petugas Dari Bawah menghitung biaya satu trade per golongan dalam Rupiah dan persennya terhadap modal ±Rp500.000.",
      "Petugas Ke Atas memeriksa legalitas dan ketersediaan akun live (tautan bukti + tanggal).",
      "Petugas Terbukti memeriksa akun demo, kesamaan spesifikasi demo vs live, dan panjang data sejarah (dari KC-2).",
      "Kepala Cabang menggugurkan broker yang gagal syarat wajib (tanpa demo, lot > 0,01, tidak legal, data kurang).",
      "Dari yang tersisa, pilih yang paling dekat dengan keempat prinsip; bila seri, biaya terkecil yang menang.",
      "Susun Formulir R \"Broker Terpilih\": satu broker + nilai tiap prinsip + alasan + batas data.",
      "Pusat menetapkan Setuju/Tolak/Tunda; bila Setuju, map PILIHAN_BROKER dikirim ke KC-2 dan KC-3.",
      "Ulangi tiap bulan, atau saat biaya/legalitas broker berubah.",
    ],
    alur: [
      "Kepala Cabang membuka penilaian 4 broker",
      "4 petugas prinsip menilai (Merangkak · Dari Bawah · Ke Atas · Terbukti) — bekerja bersamaan",
      "4 Kartu Broker terisi",
      "Saring wajib → broker gugur dicatat alasannya",
      "Pilih yang paling dekat prinsip (seri → biaya terkecil)",
      "Formulir R \"Broker Terpilih\"",
      "Keputusan Pusat",
      "Map PILIHAN_BROKER ke KC-2 dan KC-3",
    ],
  },
  {
    code: "KC-2",
    name: "Jembatan MT5",
    misi: "Menyediakan data dari MT5 yang lengkap dan sehat untuk broker terpilih, serta mencari fungsi MT5 yang dibutuhkan.",
    hasil: "Map DAFTAR_DATA (isi dan kesehatan file) dan KATALOG_FUNGSI (fungsi MT5 tersedia vs dibutuhkan).",
    struktur: [
      {
        jabatan: "Kepala Cabang",
        pemegang: "Program runKc2 (src/lib/kc2Bridge.ts) — AKTIF",
        tugas: "Menyusun Daftar Data broker terpilih dan Formulir R bila data macet atau perlu fungsi baru.",
        tanggungJawab: "Data yang dipakai cabang lain jelas rentangnya, jumlah candle dan lubangnya.",
        wewenang: `Boleh mengusulkan EA/skrip baru. Tidak boleh mengubah EA, skrip, atau .env tanpa izin Pusat. ${TIDAK_ORDER}`,
      },
      {
        jabatan: "Petugas Harga Live",
        pemegang: "EA MDBKAMultiLive (di terminal MT5)",
        tugas: "Menulis harga bid/ask live semua simbol Market Watch.",
        tanggungJawab: "Tetap terpasang di terminal; bila berhenti, gerbang data menahan semua sinyal.",
        wewenang: "Hanya membaca dari MT5. Tidak pernah mengirim order.",
      },
      {
        jabatan: "Petugas Arsip Candle",
        pemegang: "Skrip ExportLongH1MDBKA (H4/H1/M15/M5/M1) + AutoExportMDBKAService",
        tugas: "Mengekspor candle sejarah dan candle baru ke Common Files.",
        tanggungJawab: "File lengkap tanpa lubang yang tidak dijelaskan; jam server dicatat.",
        wewenang: "Hanya membaca dari MT5.",
      },
      {
        jabatan: "Petugas Spesifikasi",
        pemegang: "Skrip ExportMarginMDBKA + file SymbolSpecs",
        tugas: "Mengekspor spread, margin dan ukuran kontrak tiap simbol.",
        tanggungJawab: "File diperbarui sebelum KC-1 menghitung biaya.",
        wewenang: "Hanya membaca dari MT5.",
      },
      {
        jabatan: "Petugas Swap & History",
        pemegang: "EA MDBKASwapLogger + pembaca mt5Journal",
        tugas: "Mencatat swap per jam dan riwayat transaksi/terminal.",
        tanggungJawab: "Catatan tidak diubah setelah ditulis.",
        wewenang: "Hanya membaca dari MT5.",
      },
      {
        jabatan: "Petugas Katalog Fungsi",
        pemegang: "Katalog tetap KATALOG_FUNGSI (src/lib/kc2Bridge.ts) — AKTIF; BELUM membaca map CATATAN_PERBAIKAN KC-3 (audit A-2 16 Okt 2026: katalog masih statis, belum bereaksi ke permintaan bahan nyata — baru satu bahan yang pernah ditambang KC-3)",
        tugas: "Mencatat fungsi MT5 yang tersedia dan yang dibutuhkan (mis. kalender berita historis, paket Python MetaTrader5).",
        tanggungJawab: "Setiap permintaan bahan dari KC-3 dijawab: tersedia / perlu dibuat / tidak mungkin.",
        wewenang: "Hanya mengusulkan; pembuatan EA/skrip baru menunggu keputusan Pusat.",
      },
    ],
    sop: [
      "Terima map PILIHAN_BROKER dari KC-1.",
      "Periksa file data broker terpilih: rentang dari–sampai, jumlah candle, lubang, jam server.",
      "Tulis map DAFTAR_DATA dan kirim ke KC-1 (Petugas Data) dan KC-3.",
      "Terima permintaan bahan dari KC-3 (map CATATAN_PERBAIKAN).",
      "Cek KATALOG_FUNGSI: tersedia → sediakan; belum ada → susun Formulir R usulan EA/skrip baru dengan satu pilihan jadi.",
      "Pusat menetapkan; bila disetujui, Pelaksana Pembangunan membuat EA/skrip.",
      "Data macet lebih dari 10 menit → Formulir R berisi langkah perbaikan.",
    ],
    alur: [
      "PILIHAN_BROKER dari KC-1",
      "Pemeriksaan file data MT5",
      "Map DAFTAR_DATA ke KC-1 dan KC-3",
      "Permintaan bahan dari KC-3",
      "KATALOG_FUNGSI / Formulir R usulan fungsi baru",
      "Keputusan Pusat",
    ],
  },
  {
    code: "KC-3",
    name: "Sekolah Merangkak",
    misi: "Melatih: menggali pola dari data latih lalu try-out, tanpa menyentuh data ujian.",
    hasil: "Map POLA_CALON (angka dibekukan) dan CATATAN_PERBAIKAN (Jalur Perbaikan bila pola gagal).",
    struktur: [
      {
        jabatan: "Kepala Sekolah",
        pemegang: "kepalaSekolah() (src/lib/kc3Kepala.ts) — AKTIF",
        tugas: "Membuat Pembagian Data 60/20/20, menjaga segel ujian, menyusun Formulir R \"Pola Calon\".",
        tanggungJawab: "Setiap pola yang diajukan sudah lolos latih dan try-out dengan angka yang dibekukan.",
        wewenang: `Tidak boleh membaca data ujian, mengubah angka setelah dibekukan, atau memasukkan pola ke Buku Aturan. ${TIDAK_ORDER}`,
      },
      {
        jabatan: "Penambang Fakta",
        pemegang: "tambangBadai()/polaBadai() (src/lib/kc3Penambang.ts) — AKTIF (bahan pertama: Peringatan Badai jadi pemicu arah)",
        tugas: "Membedah data latih per kondisi dari Buku Bahan Bakar (badai, jam, spread, tick volume, level, golongan): peluang dan rata-rata R.",
        tanggungJawab: "Semua kondisi yang dicoba dicatat, termasuk yang gagal.",
        wewenang: "Hanya membaca bagian LATIH.",
      },
      {
        jabatan: "Penyaring Kebetulan",
        pemegang: "saringKebetulan() (src/lib/kc3Perbaikan.ts) — AKTIF (ambang naik sejalan jumlah pola dicoba, wajib konsisten tiap bulan LATIH)",
        tugas: "Membuang pola yang hanya bagus di sebagian data latih; makin banyak pola dicoba, makin ketat syaratnya.",
        tanggungJawab: "Alasan setiap pola gugur ditulis.",
        wewenang: "Boleh menggugurkan pola. Tidak boleh melonggarkan syarat.",
      },
      {
        jabatan: "Pengawas Try-out",
        pemegang: "pengawasTryout() (src/lib/kc3Perbaikan.ts) — AKTIF",
        tugas: "Menguji pola yang lolos saringan, sekali, di bagian TRY-OUT.",
        tanggungJawab: "Hasil try-out dicatat apa adanya; gagal = masuk Jalur Perbaikan.",
        wewenang: "Hanya membaca bagian TRY-OUT; satu pola satu kali.",
      },
      {
        jabatan: "Pustakawan",
        pemegang: "tradeAudit + arsip Lolosyiob/riset",
        tugas: "Menjaga daftar \"jangan diulang\" dan memeriksa pola baru bukan ulangan pola yang sudah gagal.",
        tanggungJawab: "Arsip kegagalan lengkap dengan tanggal dan angka.",
        wewenang: "Boleh menolak pola yang sama dengan pola gagal.",
      },
    ],
    sop: [
      "Terima map PILIHAN_BROKER (KC-1) dan DAFTAR_DATA (KC-2).",
      "Kepala Sekolah membekukan Pembagian Data: latih 60% · try-out 20% · ujian 20% (segel).",
      "Penambang Fakta membedah bagian LATIH memakai bahan dari Buku Bahan Bakar.",
      "Pustakawan memeriksa: bukan ulangan pola yang sudah gagal.",
      "Penyaring Kebetulan menggugurkan pola yang tidak konsisten.",
      "Angka pola yang tersisa dibekukan.",
      "Pengawas Try-out menguji sekali di bagian TRY-OUT.",
      "Lolos → Formulir R \"Pola Calon\" → keputusan Pusat → ke KC-4.",
      "Gagal → Jalur Perbaikan: diagnosis, satu jalan (A–E), paling banyak 7 percobaan, lalu arsip.",
    ],
    alur: [
      "PILIHAN_BROKER + DAFTAR_DATA masuk",
      "Pembagian Data (segel ujian)",
      "Tambang di LATIH",
      "Cek arsip + saring kebetulan",
      "Bekukan angka",
      "Try-out",
      "POLA_CALON ke Pusat lalu KC-4, atau CATATAN_PERBAIKAN",
    ],
  },
  {
    code: "KC-4",
    name: "Ruang Ujian",
    misi: "Menguji Pola Calon sekali di data ujian bersegel, lalu demo dan live lot minimum.",
    hasil: "Vonis LULUS/GAGAL per pola per golongan dan status lampu 1-2-3; ukuran Rp bersih per jam (target Rp5.000–Rp6.000).",
    struktur: [
      {
        jabatan: "Kepala Ruang Ujian",
        pemegang: "ujiK1K7()/formulirVonis() (src/lib/kc4Kepala.ts) — AKTIF",
        tugas: "Menerima Pola Calon yang SUDAH DISETUJUI Pusat, memeriksa belum pernah diuji, menyusun vonis LULUS/GAGAL + Formulir R.",
        tanggungJawab: "Satu pola hanya diuji SEKALI; gagal = gugur, tidak diuji ulang dengan angka yang sama.",
        wewenang: TIDAK_ORDER,
      },
      {
        jabatan: "Penguji Data Lama",
        pemegang: "ujiK1K7() (src/lib/kc4Kepala.ts) — AKTIF; memakai mesin tambang yang SAMA dengan Penambang Fakta KC-3 (kc3Penambang.ts), hanya diberi candle UJIAN",
        tugas: "Lampu 1: uji pola di bagian UJIAN bersegel memakai kriteria K1–K7 (n≥20, rata-rata R>0, PF≥1,2, ≥5/7 blok positif, terburuk ≥−1,1R, positif tanpa blok terbaik, LATIH juga positif) — sama persis dengan yang ditetapkan Fahmi untuk riset strategi versi MDBKA (docs/RANCANGAN-2026-10-16-strategi-versi-mdbka.md §2).",
        tanggungJawab: "Hanya membuka bagian UJIAN sekali per pola; tidak pernah mengintip sebelum vonis dikunci.",
        wewenang: "Hanya menilai data historis. Tidak boleh mengubah K1–K7 atau mengirim order.",
      },
      {
        jabatan: "Pengawas Demo",
        pemegang: "susunRangkaianDemo()/formulirLampu2() (src/lib/kc4PengawasDemo.ts) — AKTIF; status lampu dari lampRows() (greenLamps.ts), bukan hitungan baru",
        tugas: "Lampu 2: merekap trade akun DEMO broker terpilih (History MT5 + catatan entry yang sudah dicatat tim lama) dan menyerahkannya ke KC-4 sebagai map RANGKAIAN_DEMO; mengirim Formulir R ke Pusat bila lampu 2 suatu golongan sudah HIJAU/MERAH.",
        tanggungJawab: "Hanya trade setara Live yang dihitung lampu 2; trade uji (MDBKA-UJI) dan akun yang bukan demo terbukti tetap dicatat/dilaporkan tapi tidak dihitung. Bukti yang sama tidak dilaporkan dua kali.",
        wewenang: "Hanya membaca hasil dan mencatat. Tidak boleh mengirim order, mengubah Buku Aturan, atau menaikkan status.",
      },
      { jabatan: "Pengawas Live Minimum", pemegang: "Rangkaian live lot minimum (belum dibangun)", tugas: "Lampu 3, setelah lampu 1 & 2 hijau", tanggungJawab: "Belum dirancang rinci — butuh trade live nyata berjalan dulu.", wewenang: "Belum dirancang rinci" },
      {
        jabatan: "Auditor Trade",
        pemegang: "auditTrade() (src/lib/kc4Auditor.ts) — AKTIF; ambang MFE sama dengan AUDIT_RULES.againstMfeR (tradeAudit.ts, T-AUDIT lama)",
        tugas: "Sebab rugi per trade UJIAN: tolak pola bila >50% trade rugi \"melawan sejak masuk\" (MFE < 0,3R sebelum kena SL) atau >50% keluar karena batas waktu.",
        tanggungJawab: "Gerbang TERPISAH dari K1–K7 — lolos K1–K7 tidak otomatis lolos Auditor Trade. Bahan BADAI saat ini tidak memakai batas waktu sama sekali, jadi persentase \"keluar karena waktu\" selalu 0% untuk bahan ini (dilaporkan apa adanya, bukan dikarang).",
        wewenang: "Hanya menilai data historis. Tidak boleh mengubah ambang MFE atau mengirim order.",
      },
    ],
    sop: [
      "Tolak jalan bila rentang data bersama Pembagian Data KC-3 < 365 hari (hard-gate, audit A-2 16 Okt 2026) — data UJIAN terlalu pendek untuk K1-K7 dipercaya.",
      "Terima map POLA_CALON (KC-3) yang Formulir R \"lolos try-out\"-nya SUDAH DISETUJUI Pusat.",
      "Tolak jalan bila pola ini sudah pernah diuji sebelumnya (satu pola, satu kali uji).",
      "Buka bagian UJIAN bersegel (hanya KC-4 yang boleh), pindai dengan mesin tambang yang sama dengan KC-3.",
      "Bagi hasil UJIAN ke 7 blok waktu sama panjang.",
      "Hitung K1–K7; LULUS hanya bila ketujuhnya terpenuhi.",
      "Auditor Trade memeriksa sebab rugi (melawan sejak masuk / keluar karena waktu) — gerbang terpisah.",
      "Susun Formulir R vonis (LULUS/GAGAL) ke Pusat.",
      "LULUS → usulkan masuk Buku Aturan UJI_DEMO (lampu 2, belum dibangun). GAGAL → arsip, tidak diuji ulang dengan angka sama.",
    ],
    alur: [
      "POLA_CALON masuk (setelah disetujui Pusat)",
      "Cek belum pernah diuji",
      "Buka UJIAN bersegel",
      "Tambang + bagi 7 blok",
      "Hitung K1–K7 + Auditor Trade",
      "Formulir R vonis ke Pusat",
      "LULUS → lampu 2 (belum dibangun) / GAGAL → arsip",
    ],
  },
  {
    code: "KC-5",
    name: "Pembukuan & Pajak",
    misi: "Konsultan akuntansi: cicilan Bank Jago, buku besar pribadi, dan bahan SPT Tahunan.",
    hasil: "Pengingat setoran Rp68.506/bulan, laporan bulanan, bahan Lampiran utang SPT (Coretax).",
    struktur: [
      {
        jabatan: "Kepala Cabang",
        pemegang: "runKc5() (server/services/kc5Runner.ts) — AKTIF",
        tugas: "Gabungkan status cicilan + ringkasan hasil trading tahun berjalan jadi satu Laporan Bulanan.",
        tanggungJawab: "Berjalan sendiri setiap bulan, tidak membaca map cabang lain.",
        wewenang: TIDAK_ORDER,
      },
      {
        jabatan: "Petugas Cicilan",
        pemegang: "kc5Cicilan.ts — AKTIF",
        tugas: "9 jatuh tempo tanggal 14 (Nov 2026–Jul 2027), Rp68.506/bulan. Kirim Formulir R SEKALI saat H-3/lewat jatuh tempo; Pusat SETUJU = sudah disetor (LUNAS).",
        tanggungJawab: "Tidak dobel kirim Formulir R untuk setoran yang sama. Pembagian pokok/bunga belum diketahui — dicatat \"…\", menunggu jadwal angsuran resmi Bank Jago (Juru Buku belum dibangun).",
        wewenang: "Hanya mengingatkan; tidak melakukan pembayaran.",
      },
      { jabatan: "Juru Buku", pemegang: "Jurnal berpasangan (belum dibangun — menunggu jadwal angsuran resmi Bank Jago dari Fahmi)", tugas: "Pokok, bunga, kas dari jadwal resmi", tanggungJawab: "Belum dirancang rinci", wewenang: "Belum dirancang rinci" },
      {
        jabatan: "Petugas Hasil Trading",
        pemegang: "jurnalPajakStore.ts + summarizeByYear() — SUDAH DIBANGUN LENGKAP di luar kerangka KC (server/routes/jurnalPajakRoutes.ts, pajakRoutes.ts); KC-5 hanya membaca ringkasannya",
        tugas: "Laba-rugi Finex live dalam Rp (kurs pajak per transaksi)",
        tanggungJawab: "KC-5 tidak men-sync ulang History MT5 — hanya load() data yang sudah tersimpan.",
        wewenang: "Hanya membaca.",
      },
      { jabatan: "Petugas SPT", pemegang: "Penyusun lampiran (belum dibangun — menunggu NPWP Bank Jago dari Fahmi)", tugas: "Lampiran 1 Bagian B: utang akhir tahun", tanggungJawab: "Belum dirancang rinci", wewenang: "Belum dirancang rinci" },
    ],
    sop: [
      "Tiap kali dijalankan: hitung status 9 setoran Bank Jago terhadap tanggal hari ini.",
      "Setoran H-3 s/d jatuh tempo (atau sudah lewat) yang BELUM pernah punya Formulir R → kirim satu Formulir R.",
      "Pusat SETUJU pada Formulir R setoran itu = tercatat LUNAS (dibaca ulang, bukan map baru).",
      "Baca ringkasan Jurnal Pajak (sudah ada di luar kerangka KC) untuk tahun berjalan — tanpa sync ulang History MT5.",
      "Gabungkan status cicilan + ringkasan hasil trading jadi map LAPORAN_BULANAN.",
      "Akhir tahun: Juru Buku + Petugas SPT menyiapkan bahan Lampiran SPT (menunggu dokumen resmi Bank Jago).",
    ],
    alur: [
      "Hitung status 9 setoran vs tanggal hari ini",
      "H-3/lewat jatuh tempo & belum pernah diingatkan → Formulir R",
      "Pusat SETUJU → LUNAS",
      "Baca ringkasan Jurnal Pajak tahun berjalan",
      "Gabung jadi Laporan Bulanan",
    ],
  },
];

export function branchByCode(code: string | null | undefined): Branch | null {
  return BRANCHES.find((b) => b.code === code) ?? null;
}

// ---------- Formulir R ----------

export interface RecFact {
  readonly teks: string;
  readonly sumber: string;
}

/** Isian Formulir R dari cabang (sebelum diberi nomor oleh arsip). */
/** Lampiran terstruktur: map hasil yang dikirim ke cabang lain HANYA bila Pusat SETUJU. */
export interface RecLampiran {
  readonly kind: "PILIHAN_BROKER";
  readonly data: { readonly broker: string | null; readonly alasan: string };
}

export interface RecommendationInput {
  readonly judul: string;
  readonly fakta: readonly RecFact[];
  readonly batasData: string;
  readonly usulan: string;
  readonly risiko: string;
  /** Hanya diisi petugas cabang (bukan lewat POST umum). */
  readonly lampiran?: RecLampiran;
}

export interface Recommendation extends RecommendationInput {
  readonly id: string;
  readonly cabang: BranchCode;
  readonly tanggalUtc: string;
}

export type DecisionKind = "SETUJU" | "TOLAK" | "TUNDA";

export interface Decision {
  readonly keputusan: DecisionKind;
  readonly catatan: string;
  readonly tanggalUtc: string;
}

type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

const MAX_TEXT = 2000;

function text(v: unknown, field: string, required = true): Parsed<string> {
  if (typeof v !== "string") return required ? { ok: false, error: `${field} wajib berupa teks` } : { ok: true, value: "" };
  const t = v.trim();
  if (required && t === "") return { ok: false, error: `${field} wajib diisi` };
  if (t.length > MAX_TEXT) return { ok: false, error: `${field} terlalu panjang (maks ${MAX_TEXT} huruf)` };
  return { ok: true, value: t };
}

/** Periksa isian Formulir R. Angka yang tidak diketahui ditulis "…" oleh cabang, bukan ditebak. */
export function parseRecommendationInput(body: unknown): Parsed<RecommendationInput> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "isian harus objek" };
  const b = body as Record<string, unknown>;
  const judul = text(b.judul, "judul");
  if (!judul.ok) return judul;
  if (!Array.isArray(b.fakta) || b.fakta.length === 0) return { ok: false, error: "fakta wajib minimal 1 (angka + sumber file)" };
  if (b.fakta.length > 50) return { ok: false, error: "fakta maksimal 50 baris" };
  const fakta: RecFact[] = [];
  for (const [i, f] of b.fakta.entries()) {
    if (typeof f !== "object" || f === null) return { ok: false, error: `fakta ${i + 1} harus objek` };
    const r = f as Record<string, unknown>;
    const t = text(r.teks, `fakta ${i + 1} teks`);
    if (!t.ok) return t;
    const s = text(r.sumber, `fakta ${i + 1} sumber`);
    if (!s.ok) return s;
    fakta.push({ teks: t.value, sumber: s.value });
  }
  const batasData = text(b.batasData, "batas data");
  if (!batasData.ok) return batasData;
  const usulan = text(b.usulan, "usulan");
  if (!usulan.ok) return usulan;
  const risiko = text(b.risiko, "risiko bila disetujui");
  if (!risiko.ok) return risiko;
  return { ok: true, value: { judul: judul.value, fakta, batasData: batasData.value, usulan: usulan.value, risiko: risiko.value } };
}

export function parseDecisionInput(body: unknown): Parsed<{ keputusan: DecisionKind; catatan: string }> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "isian harus objek" };
  const b = body as Record<string, unknown>;
  if (b.keputusan !== "SETUJU" && b.keputusan !== "TOLAK" && b.keputusan !== "TUNDA") {
    return { ok: false, error: "keputusan harus SETUJU, TOLAK, atau TUNDA" };
  }
  const catatan = text(b.catatan, "catatan", false);
  if (!catatan.ok) return catatan;
  return { ok: true, value: { keputusan: b.keputusan, catatan: catatan.value } };
}

export type RecStatus = "MENUNGGU" | "DITUNDA" | "DISETUJUI" | "DITOLAK";

/** Status satu rekomendasi dari riwayat keputusan (urut waktu). Keputusan final pertama yang berlaku. */
export function recommendationStatus(decisions: readonly Decision[]): RecStatus {
  const final = decisions.find((d) => d.keputusan !== "TUNDA");
  if (final !== undefined) return final.keputusan === "SETUJU" ? "DISETUJUI" : "DITOLAK";
  return decisions.length > 0 ? "DITUNDA" : "MENUNGGU";
}

/** Boleh menambah keputusan? Tidak bila sudah ada SETUJU/TOLAK (tidak boleh ditimpa). */
export function canDecide(decisions: readonly Decision[]): boolean {
  return decisions.every((d) => d.keputusan === "TUNDA");
}

/** Nomor rekomendasi: R-KC-5-20261016T030500Z-001 (jam UTC + urutan). */
export function recommendationId(code: BranchCode, now: Date, seq: number): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return `R-${code}-${stamp}-${String(seq).padStart(3, "0")}`;
}

export function isRecommendationId(id: string): boolean {
  return /^R-KC-[1-5]-\d{8}T\d{6}Z-\d{3}$/.test(id);
}

// ---------- Halaman ----------

/** `/?halaman=cabang` (Kantor Pusat) atau `/?halaman=cabang&kode=KC-5`. */
export interface BranchPageParams {
  readonly code: BranchCode | null;
}

export function branchPageUrl(code: BranchCode | null): string {
  const q = new URLSearchParams({ halaman: "cabang" });
  if (code !== null) q.set("kode", code);
  return `/?${q.toString()}`;
}

export function parseBranchPage(search: string): BranchPageParams | null {
  const q = new URLSearchParams(search);
  if (q.get("halaman") !== "cabang") return null;
  return { code: branchByCode(q.get("kode"))?.code ?? null };
}
