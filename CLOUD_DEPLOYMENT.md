# XERA Document ID System - Turso + Render

Bu surum Node.js backend'i Render uzerinde, veritabanini Turso uzerinde
calistirmak icin hazirlandi. Kullanicilar sadece web adresine girer.

## 1. Turso veritabani

Turso'da yeni database olustur ve su iki bilgiyi al:

```text
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
```

Lokal test icin `.env.example` dosyasini `.env` olarak kopyala ve bu iki
degeri doldur.

## 2. Mevcut SQLite verisini Turso'ya tasi

Yeni Turso database bos ise:

```bash
npm run migrate:turso
```

Eger hedef Turso database icinde daha once test verisi olustuysa ve silmek
istediginden eminsen:

```bash
npm run migrate:turso -- --reset
```

Migration `user_sessions` tablosunu tasimaz. Canli sisteme gecince herkes
tekrar login olur.

Beklenen ana satir sayilari:

```text
users: 8
document_requests: 31
document_records: 15
part_records: 1286
audit_logs: 83
```

## 3. Lokal test

```bash
npm start
```

Sonra tarayicidan ac:

```text
http://localhost:32780/
```

Health check:

```text
http://localhost:32780/api/health
```

## 4. Render yayini

1. Projeyi GitHub repository olarak yukle.
2. Render'da `New Web Service` veya Blueprint ile bu repository'yi sec.
3. Build command:

```bash
npm install
```

4. Start command:

```bash
npm start
```

5. Environment variables:

```text
NODE_VERSION=24
NODE_ENV=production
ALLOW_PUBLIC_SIGNUP=true
INITIAL_ADMIN_PASSWORD=...
TURSO_DATABASE_URL=...
TURSO_AUTH_TOKEN=...
```

Render kendi `PORT` degerini verir; elle port tanimlamak gerekmez.

`ALLOW_PUBLIC_SIGNUP=true` login ekranindaki `Create Account` akisinin calismasi
icin gereklidir. Public kaydi tekrar kapatmak istersen bu degeri `false` yapip
kullanici hesaplarini `User Management` ekranindan admin ile olusturabilirsin.
`INITIAL_ADMIN_PASSWORD` sadece bos production veritabaninda ilk admin hesabi
olusturmak icin kullanilir; mevcut admin sifrelerini ezmez.

## 5. Koyeb alternatifi

Koyeb kullanilirsa ayni environment variable'lar girilir ve start command
`npm start` olarak ayarlanir. Veritabani yine Turso oldugu icin Koyeb uzerinde
kalici volume gerekmez.
