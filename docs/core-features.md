# Fitur Inti MDBKA

## Screenshot

- Ctrl + V dari clipboard
- Upload file gambar
- Drag-and-drop
- Preview gambar
- Hapus gambar

## OCR

OCR menggunakan Tesseract.js di browser.

OCR hanya membantu ekstraksi awal. Semua data harus dikoreksi dan diverifikasi pengguna.

## Keputusan

Mesin analisa menghasilkan:

- BELI
- JUAL
- TUNGGU

Aturan skor:

- Harga vs MA50: +2 atau -2
- CCI: +1 atau -1
- MACD vs Signal: +1 atau -1
- RSI: +1 atau -1

Skor BELI minimal: 3

Skor JUAL minimal: -3

Selain skor, arah harus sejalan dengan posisi harga terhadap MA50.

## Risiko

Aplikasi menghitung:

- Risiko maksimum USD
- Risiko pada lot minimum
- Lot teoritis
- Lot yang dibulatkan ke lot step
- Status minimum lot broker
- Peringatan risiko
