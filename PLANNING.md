# Planning Server Karaoke Berbasis LAN

## 1. Tujuan

Membangun sistem karaoke lokal berbasis LAN dengan satu komputer sebagai server pusat dan beberapa komputer client untuk kasir, operator, dan karaoke room.

Sistem tetap dapat beroperasi tanpa internet selama jaringan LAN dan server lokal aktif.

## 2. Arsitektur Sistem

```text
                     +---------------------------+
                     |       SERVER KARAOKE      |
                     | Linux / Windows           |
                     | Node.js + Express         |
                     | Prisma + MySQL            |
                     | REST API + Socket.IO     |
                     +-------------+-------------+
                                   |
                           Router / Switch LAN
                +------------------+------------------+
                |                  |                  |
        +-------+------+   +-------+------+   +-------+------+
        | PC Kasir     |   | PC Operator  |   | PC Room      |
        | Electron     |   | Electron     |   | Karaoke      |
        | React + Vite |   | React + Vite |   | Player + TV  |
        +--------------+   +--------------+   +--------------+
```

### Pembagian Tugas

| Komponen | Tanggung jawab |
|---|---|
| Backend server | Login, otorisasi, room, sesi, transaksi, katalog lagu, sinkronisasi |
| MySQL | Penyimpanan data utama |
| PC kasir | Booking, membuka sesi, pembayaran, cetak struk |
| PC operator | Monitoring room, kontrol playlist dan player |
| PC room | Pemutaran lagu, lirik, antrean, tampilan TV |
| Admin | User, harga, room, lagu, pengaturan, laporan |

**Prinsip:** backend adalah sumber kebenaran (single source of truth). Client tidak menentukan sendiri harga, status pembayaran, atau hak akses.

## 3. Teknologi

| Bagian | Teknologi |
|---|---|
| Backend | Node.js + Express |
| Database | MySQL |
| ORM | Prisma |
| Authentication | JWT atau session/token yang dapat dicabut |
| Realtime | Socket.IO |
| Desktop | Electron + React + Vite |
| Validasi | Zod atau Joi |
| Testing | Jest + Supertest |
| Deployment | Linux systemd atau Windows Service |

Contoh alamat jaringan (sesuaikan dengan konfigurasi):

```text
API:       http://192.168.1.10:3000/api/v1
Socket.IO: http://192.168.1.10:3000
```

## 4. Rancangan Database

### Model utama

| Model | Fungsi |
|---|---|
| `User` | Admin, kasir, operator |
| `Room` | Master data room karaoke |
| `Booking` | Reservasi room |
| `Session` | Sesi karaoke yang sedang atau telah berlangsung |
| `Transaction` | Pembayaran, tagihan, refund |
| `Song` | Katalog lagu |
| `Playlist` | Antrean lagu per room atau sesi |
| `Product` | Makanan dan minuman |
| `Order` | Pesanan pelanggan |
| `OrderItem` | Detail item pesanan |
| `Setting` | Konfigurasi aplikasi |
| `AuditLog` | Catatan tindakan user |

Pisahkan `Booking` dan `Session`. Booking adalah reservasi waktu; Session adalah pemakaian room yang benar-benar dimulai.

### Contoh schema Prisma inti

```prisma
enum Role {
  ADMIN
  CASHIER
  OPERATOR
}

enum RoomStatus {
  AVAILABLE
  RESERVED
  OCCUPIED
  MAINTENANCE
}

enum SessionStatus {
  ACTIVE
  PAUSED
  COMPLETED
  CANCELLED
}

enum PaymentStatus {
  UNPAID
  PARTIAL
  PAID
  REFUNDED
}

model User {
  id        Int      @id @default(autoincrement())
  username  String   @unique
  password  String
  role      Role     @default(CASHIER)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Room {
  id        Int        @id @default(autoincrement())
  name      String     @unique
  status    RoomStatus @default(AVAILABLE)
  priceHour Decimal    @db.Decimal(12, 2)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  sessions  Session[]
}

model Session {
  id        Int           @id @default(autoincrement())
  roomId    Int
  cashierId Int
  status    SessionStatus @default(ACTIVE)
  startedAt DateTime      @default(now())
  endedAt   DateTime?
  priceHour Decimal       @db.Decimal(12, 2)
  total     Decimal       @default(0) @db.Decimal(12, 2)
  createdAt DateTime      @default(now())

  room      Room          @relation(fields: [roomId], references: [id])
  payments  Transaction[]

  @@index([roomId, status])
  @@index([startedAt])
}

model Transaction {
  id        Int           @id @default(autoincrement())
  sessionId Int
  amount    Decimal       @db.Decimal(12, 2)
  status    PaymentStatus @default(UNPAID)
  method    String?
  createdAt DateTime      @default(now())

  session   Session       @relation(fields: [sessionId], references: [id])

  @@index([sessionId])
}
```

### Ketentuan database

- Hash password dengan Argon2 atau bcrypt. Jangan menyimpan password teks biasa.
- Simpan snapshot tarif pada sesi saat sesi dibuka agar perubahan harga tidak mengubah tagihan lama.
- Gunakan transaksi Prisma untuk membuka/menutup sesi dan pembayaran.
- Cegah dua sesi aktif pada room yang sama melalui transaksi dan locking atau constraint yang sesuai.
- Tambahkan model booking, lagu, playlist, pesanan, dan audit log sebelum produksi.

## 5. Fitur Aplikasi

### Admin

- Dashboard room tersedia, terisi, dan maintenance.
- Pendapatan harian dan bulanan.
- CRUD user dan role.
- CRUD room dan tarif.
- CRUD katalog lagu.
- Pengaturan harga, paket, dan biaya tambahan.
- Laporan transaksi dan aktivitas kasir.
- Backup dan restore database.

### Kasir

- Login dan melihat status room realtime.
- Membuka sesi berdasarkan paket atau durasi.
- Memperpanjang atau mengakhiri sesi.
- Memproses pembayaran dan mencetak struk.
- Mencatat pesanan makanan/minuman.
- Melihat histori transaksi.

### Operator

- Monitoring seluruh room aktif.
- Memilih room untuk kontrol player.
- Menambah, menghapus, dan mengubah urutan lagu.
- Pause, resume, next, dan stop.
- Melihat waktu tersisa.
- Mengirim pengumuman dan menangani permintaan bantuan.

### Karaoke Room

- Aplikasi fullscreen/kiosk.
- Pencarian lagu berdasarkan judul, artis, dan kode.
- Playlist lokal dan antrean lagu.
- Pemutaran video/audio dan lirik jika tersedia.
- Kontrol volume.
- Menampilkan status sesi dan waktu tersisa.
- Auto-reconnect ketika LAN terputus.

**Media:** simpan file lagu di server atau cache lokal tiap room. Jangan mengirim video melalui Socket.IO. Gunakan Socket.IO untuk perintah, metadata, dan status playback.

## 6. REST API

Prefix: `/api/v1`

| Method | Endpoint | Kegunaan |
|---|---|---|
| POST | `/auth/login` | Login |
| POST | `/auth/logout` | Logout atau revoke token |
| GET | `/rooms` | Daftar room dan status |
| POST | `/rooms` | Membuat room |
| PATCH | `/rooms/:id` | Mengubah room |
| POST | `/sessions` | Membuka sesi |
| GET | `/sessions/active` | Daftar sesi aktif |
| POST | `/sessions/:id/extend` | Menambah durasi |
| POST | `/sessions/:id/close` | Menutup sesi |
| POST | `/sessions/:id/payments` | Mencatat pembayaran |
| GET | `/songs` | Pencarian lagu |
| POST | `/rooms/:id/playlist` | Menambah lagu ke antrean |
| GET | `/rooms/:id/playlist` | Mengambil antrean |
| GET | `/reports/daily` | Laporan harian |

Lindungi endpoint dengan autentikasi dan otorisasi role. Jangan hanya menyembunyikan tombol pada frontend.

Contoh middleware otorisasi:

```js
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    next();
  };
};
```

Contoh route:

```js
router.post(
  "/rooms",
  authenticate,
  authorize("ADMIN"),
  createRoom
);
```

## 7. Socket.IO

| Event | Arah | Kegunaan |
|---|---|---|
| `room:status` | Server → Client | Update status room |
| `session:started` | Server → Room | Memulai sesi |
| `session:updated` | Server → Room | Update durasi |
| `session:ended` | Server → Room | Menghentikan sesi |
| `playlist:updated` | Server → Room | Sinkronisasi antrean |
| `player:command` | Operator → Server → Room | Perintah playback |
| `player:status` | Room → Server → Operator | Status player |
| `room:help` | Room → Operator | Permintaan bantuan |

Gunakan channel berdasarkan ID room, misalnya `room:1` dan `room:2`.

```js
io.to(`room:${roomId}`).emit("player:command", {
  action: "NEXT",
});
```

Autentikasi perangkat, otorisasi, dan validasi payload wajib dilakukan sebelum client bergabung ke channel atau menjalankan perintah.

### Reconnect dan sinkronisasi

Ketika client reconnect:

1. Autentikasi ulang perangkat.
2. Ambil sesi aktif melalui REST API.
3. Ambil snapshot playlist dan status player.
4. Bergabung kembali ke channel Socket.IO.
5. Terima event realtime berikutnya.

REST API menjadi sumber snapshot; Socket.IO digunakan untuk update realtime.

## 8. Struktur Folder

Pisahkan backend dan desktop menjadi proyek berbeda.

```text
karaoke/
├── server/
│   ├── src/
│   │   ├── app/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── middlewares/
│   │   ├── routes/
│   │   ├── sockets/
│   │   ├── utils/
│   │   └── generated/prisma/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── tests/
│   └── .env
├── desktop/
│   ├── electron/
│   │   ├── main.cjs
│   │   └── preload.cjs
│   └── src/
│       ├── pages/
│       ├── components/
│       ├── services/
│       ├── stores/
│       └── hooks/
└── deployment/
    ├── systemd/
    ├── scripts/
    └── config/
```

Backend Express berjalan sebagai service tersendiri pada PC server. Electron `main.cjs` dan `preload.cjs` berjalan pada aplikasi desktop client.

## 9. Infrastruktur LAN

Contoh IP (sesuaikan dengan jaringan aktual):

| Perangkat | IP |
|---|---|
| Router | `192.168.1.1` |
| Server | `192.168.1.10` |
| Kasir | `192.168.1.20` |
| Operator | `192.168.1.21` |
| Room 01 | `192.168.1.31` |
| Room 02 | `192.168.1.32` |

Rekomendasi:

- Gunakan DHCP reservation atau IP statis untuk server.
- Gunakan Ethernet gigabit untuk server dan PC room.
- Buka firewall hanya untuk port yang diperlukan.
- MySQL hanya menerima koneksi dari backend, bukan seluruh LAN.
- Siapkan UPS untuk server dan perangkat jaringan.
- Backup database ke media penyimpanan terpisah secara terjadwal.

### Keamanan dan reliabilitas

| Risiko | Penanganan |
|---|---|
| Client terputus | Reconnect otomatis dan snapshot REST |
| Server mati | UPS dan restart service otomatis |
| Pembayaran ganda | Idempotency key dan transaksi database |
| Dua kasir membuka room yang sama | Validasi atomik dan locking |
| Client tidak berwenang | Token, role, autentikasi perangkat |
| Data hilang | Backup dan uji restore |
| File lagu hilang | Cache lokal dan pemeriksaan media |

Jangan menyimpan secret JWT atau kredensial database di React/Vite. Simpan rahasia hanya di backend.

## 10. Roadmap Pengerjaan

Estimasi berikut adalah target perencanaan, bukan jaminan waktu selesai.

### Tahap 1 — Fondasi Server (Minggu 1)

- [ ] Setup Express, Prisma, dan MySQL.
- [ ] Schema User dan Role.
- [ ] Login, autentikasi, dan middleware.
- [ ] Error handling dan testing Jest + Supertest.
- [ ] Seed admin awal.

### Tahap 2 — Room dan Session (Minggu 2)

- [ ] CRUD room dan harga.
- [ ] Status room dan session.
- [ ] Buka, perpanjang, dan tutup sesi.
- [ ] Perhitungan durasi dan tarif.
- [ ] Transaksi database dan concurrency test.

### Tahap 3 — LAN dan Realtime (Minggu 3)

- [ ] Autentikasi Socket.IO.
- [ ] Channel per room.
- [ ] Sinkronisasi status dan playlist.
- [ ] Reconnect dan snapshot REST.
- [ ] Uji beberapa client bersamaan.

### Tahap 4 — Desktop Kasir (Minggu 4)

- [ ] Electron + React + Vite.
- [ ] Dashboard dan halaman kasir.
- [ ] Login dan konfigurasi alamat server LAN.
- [ ] Pembayaran dan struk.
- [ ] Menu Electron dan IPC aman.

### Tahap 5 — Player Karaoke (Minggu 5–6)

- [ ] Katalog dan pencarian lagu.
- [ ] Player media lokal.
- [ ] Antrean dan kontrol operator.
- [ ] Fullscreen/kiosk room.
- [ ] Sinkronisasi playback.

### Tahap 6 — Produksi (Minggu 7–8)

- [ ] Laporan dan histori.
- [ ] Backup dan restore.
- [ ] Build installer desktop.
- [ ] Service startup Linux/Windows.
- [ ] Uji jaringan putus, server mati, dan pembayaran.

## 11. Target MVP

Mulai dengan:

- 1 PC server.
- 1 PC kasir.
- 1 PC operator (dapat digabung dengan kasir pada tahap awal).
- 2 PC karaoke room.

MVP dinyatakan siap diuji jika:

1. Kasir dapat login dan membuka sesi room.
2. Room menerima status sesi secara realtime.
3. Lagu dapat ditambahkan ke antrean dan diputar.
4. Operator dapat mengontrol player.
5. Sesi dapat ditutup dan tagihan dihitung dengan benar.
6. Client dapat reconnect setelah jaringan terputus.
7. Data tetap tersimpan setelah server restart.

Setelah MVP stabil, lanjutkan dengan booking, makanan/minuman, laporan lanjutan, dan fitur tambahan.
