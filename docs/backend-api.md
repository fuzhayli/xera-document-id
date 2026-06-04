# Backend + Database MVP

Bu dokuman 3. adimin sonucunu tarif eder: cok kullanicili sisteme gecis
icin ilk backend ve SQLite database iskeleti.

## Calistirma

Gereksinim:

- Node.js 24+

Komut:

```powershell
npm.cmd start
```

PowerShell execution policy `npm.ps1` dosyasini engellerse dogrudan su
komut da kullanilabilir:

```powershell
node --no-warnings server/index.js
```

Varsayilan adres:

```text
http://localhost:32680
```

Bu adres artik kullanici request formunu acar. API bilgisi icin
`http://localhost:32680/api` kullanilir.

Database dosyasi ilk calistirmada olusur:

```text
data/xera-document-id.sqlite
```

## Login, Uyelik ve Seed Kullanicilar

Sistem artik token tabanli login kullanir. Uye olurken kullanicidan tam ad,
pozisyon, `@xera.com.tr` uzantili email ve kendi belirledigi sifre alinir.
Sifre en az 8 karakter olmalidir.

Seed hesaplar sifreleri env variable ile verilirse olusturulur. Public
production yayinda eski demo sifreleri kullanilmaz; ilk admin icin
`INITIAL_ADMIN_PASSWORD` tanimlanir veya mevcut kullanicilar User Management
ekranindan yonetilir. Canli Turso sifreleri repo disinda
`xera-live-credentials.local.txt` dosyasinda tutulur.

Uyelik kaydi eklenirken kullanicidan mutlaka acik/tam isim alinmali ve
`users.display_name` alanina yazilmalidir. `Written by` kullanici
tarafindan serbest girilmez; aktif kullanicinin `display_name` degerinden
otomatik doldurulur.

Tum kullanicilar request ekranlarini kullanir. Admin yetkileri uc bagimsiz
permission olarak tutulur: `part_admin` Part List requestlerini,
`document_admin` Document List requestlerini, `user_admin` kullanici
yetkilerini yonetir. User Management panelinde bu uc permission ayri ayri
atanabilir; ucunun birlikte atanmasi UI'da `all_admin` olarak gosterilir.
Eski `admin` kayitlari migration sirasinda bu uc permission'a sahip olacak
sekilde yorumlanir.

## Kategori Kapsami

Backend su kategoriler icin request, preview ve auto-publish resmi kaydi
uretir. Revision requestleri bu auto-publish akisindan ayridir ve admin
approve/reject gerektirir:

- `D`
- `R`
- `MD`
- `MR`
- `EC`
- `MARKETING`
- `QMS`
- `SOP`

## Part List Request Kapsami

Part List akisinda kullanici yeni part request actiginda resmi kayit hemen
master Parts List'e eklenir ve ilgili part adminlerine review notification
gider. Revision requestleri admin onayi gerektirmeye devam eder. Ilk
calistirmada
`Parts Management List (XD-22-005).xlsx` dosyasindaki `Material List`
sayfasi `part_records` tablosuna, `Screw & Nut etc.` sayfasi ise standart
donanim referans tablosuna import edilir.

Yeni part kodlari `XSOP-26-XXX-XX_R00_Part_Code_Naming_SOP` kurallarina gore
`XXXX-MSSS-RRC` formatinda uretilir. `MSSS` alaninda ilk hane main code,
sonraki uc hane ilgili proje/main code icin rezerve edilen sira numarasidir.
Revision kodlari `01A`, `D01` ve `C01` tiplerini destekler.

## Sequence ve Document No Karari

Ilk MVP karari:

- Request ekraninda sistem siradaki uygun `document_no` degerini onerir.
- Kullanici onerilen `document_no` degerini degistirebilir.
- Sistem resmi kayitlarda veya aktif legacy/manual pending durumda olan bir
  `document_no` degerinin tekrar
  talep edilmesini engeller.
- Yeni document request olustugunda `document_no` hemen resmi document record
  haline gelir.
- Ilgili document adminleri notification uzerinden OK verebilir veya guvenli
  metadata editleri yapabilir.

Bu karar ayni numaranin ayni anda birden fazla kullanici tarafindan
istenmesini engeller.

## Endpointler

### `GET /api/health`

Backend ve database path bilgisini dondurur.

### `GET /api/rules`

Kategori metadata listesini dondurur.

### `POST /api/auth/signup`

Yeni kullanici hesabi olusturur. Sadece `@xera.com.tr` email adresleri
kabul edilir.

```json
{
  "display_name": "Name Surname",
  "position": "Validation Engineer",
  "email": "name@xera.com.tr",
  "password": "Example123!"
}
```

Response `user` ve `token` dondurur.

### `POST /api/auth/login`

Email/sifre ile login olur ve session token dondurur.

```json
{
  "email": "employee@xera.com.tr",
  "password": "StrongPrivatePassword123!"
}
```

### `GET /api/auth/me`

Aktif token sahibini dondurur.

```powershell
Invoke-RestMethod `
  -Uri http://localhost:32680/api/auth/me `
  -Headers @{ Authorization = "Bearer <token>" }
```

### `POST /api/auth/logout`

Aktif session token'ini siler.

### `GET /api/admin/users`

`user_admin` veya `all_admin` icin user management listesini dondurur.

### `POST /api/admin/users`

`user_admin` veya `all_admin` tarafindan yeni kullanici olusturur.
`permissions` array'i `part_admin`, `document_admin` ve `user_admin`
degerlerinden herhangi bir kombinasyonu icerebilir. Bos array normal
kullanicidir.

```json
{
  "display_name": "Name Surname",
  "position": "Validation Engineer",
  "email": "name@xera.com.tr",
  "department": "QARA",
  "password": "Example123!",
  "permissions": ["part_admin", "document_admin"]
}
```

### `POST /api/admin/users/{id}`

`user_admin` veya `all_admin` tarafindan kullanici email, tam ad, pozisyon,
departman ve rol bilgilerini gunceller.

### `POST /api/admin/users/{id}/password`

`user_admin` veya `all_admin` tarafindan kullanici sifresini yeni bir
degerle sifirlar. Mevcut sifreler goruntulenmez.

### `POST /api/preview`

Request body:

```json
{
  "category": "D",
  "reference_type": "model",
  "reference_value": "GR10X-40K",
  "document_name": "Risk Management Report",
  "written_by": "Aisha F.",
  "creation_date": "2026-05-18",
  "revision": "r00"
}
```

Response:

```json
{
  "valid": true,
  "document_no_preview": "XD-26-001",
  "sequence_no_preview": "001",
  "generated_filename_preview": "XD-26-001_GR10X-40K_Risk Management Report_r00"
}
```

### `POST /api/requests`

User request olusturur, resmi document record'u hemen auto-publish eder ve
ilgili document adminlerine review notification gonderir.
`Authorization: Bearer <token>` zorunludur.

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:32680/api/requests `
  -ContentType 'application/json' `
  -Headers @{ Authorization = "Bearer <token>" } `
  -Body '{"category":"D","reference_value":"GR10X-40K","document_name":"Risk Management Report","creation_date":"2026-05-18","revision":"r00"}'
```

### `GET /api/requests/my`

Kullanici kendi requestlerini gorur.

### `GET /api/notifications/my`

Aktif kullanicinin in-app notification listesini dondurur.

### `POST /api/notifications/{id}/read`

Kullanicinin kendi notification kaydini `read` durumuna alir.

### `GET /api/admin/notifications`

`document_admin`, `part_admin` veya `all_admin` icin auto-published resmi
kayit review notificationlarini dondurur.

### `POST /api/admin/notifications/{id}/okay`

Admin notification kaydini OK olarak tamamlar. Resmi kayit zaten gorunurdur;
bu islem sadece review bilgisini, audit log'u ve requester notification'ini
gunceller.

### `POST /api/admin/notifications/{id}/edit`

Admin notification uzerinden guvenli metadata alanlarini duzenler ve review'u
tamamlar. Document icin document name ve uygun kategorilerde reference value;
part icin part name, description, main category ve sub category desteklenir.

### `GET /api/admin/requests/pending`

Legacy/manual pending document requestlerini dondurur. Normal yeni document
request akisi bu kuyruga satir birakmaz.

```powershell
Invoke-RestMethod `
  -Uri http://localhost:32680/api/admin/requests/pending `
  -Headers @{ Authorization = "Bearer <admin-token>" }
```

### `GET /api/admin/sequences`

`document_admin` veya `all_admin` icin kategori/yil bazinda siradaki resmi
sequence durumunu dondurur.

### `GET /api/admin/audit-logs`

Herhangi bir admin yetkisi olan kullanici icin son audit olaylarini dondurur.
Opsiyonel `limit` parametresi vardir.

### `POST /api/admin/documents/{id}/rename`

`document_admin` veya `all_admin` onayli bir dokumanin `Document Name`
alanini degistirir. Sistem dosya adini ayni document number, reference ve
suffix ile yeniden uretir ve audit log'a `document.renamed` olayi yazar.

### `POST /api/admin/documents/{id}/revision`

`document_admin` veya `all_admin` onayli bir dokumanin revision degerini
otomatik bir sonraki degere tasir (`r00` -> `r01`). Eski revision kaydi
`document_revision_archive` tablosuna kopyalanir, current `document_records`
satiri yeni revision ve yeni filename ile guncellenir. Revision degisikligi
yapan admin ve zaman bilgisi kaydedilir.

### `POST /api/documents/{id}/revision-request`

Login olan admin veya user tarafindan Document List uzerinden revision
update talebi olusturur. Ayni dokuman icin pending revision request varsa
yeni request engellenir.

### `GET /api/admin/revision-requests/pending`

`document_admin` veya `all_admin` panelindeki pending revision update
taleplerini dondurur.

### `POST /api/admin/revision-requests/{id}/approve`

`document_admin` veya `all_admin` pending revision update talebini onaylar ve
ilgili dokumani bir sonraki revision degerine tasir.

### `POST /api/admin/revision-requests/{id}/reject`

`document_admin` veya `all_admin` pending revision update talebini reddeder.

### `POST /api/admin/requests/{id}/approve`

Legacy/manual pending document request onaylar. Normal yeni document request
akisi auto-publish oldugu icin bu endpoint geriye donuk uyumluluk icin
durur.

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:32680/api/admin/requests/1/approve `
  -Headers @{ Authorization = "Bearer <admin-token>" }
```

### `POST /api/admin/requests/{id}/reject`

Legacy/manual pending document request reddeder.

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:32680/api/admin/requests/1/reject `
  -ContentType 'application/json' `
  -Headers @{ Authorization = "Bearer <admin-token>" } `
  -Body '{"reason":"Document name must be clarified."}'
```

### `GET /api/documents`

Resmi dokuman kayitlarini dondurur.

Bu endpoint public document list ekraninda kullanilir:

```text
http://localhost:32680/documents.html
```

Document List sadece current/son revision kayitlarini gosterir.

### `GET /api/documents/archive`

Eski revision kayitlarini dondurur. Bu endpoint Archive ekraninda
kullanilir:

```text
http://localhost:32680/archive.html
```

### `GET /api/documents/export.xlsx`

Resmi dokuman kayitlarini Excel uyumlu `.xlsx` dosyasi olarak
indirir. Bu endpoint public document list ve admin official documents
ekranindaki `Export Excel` butonlari tarafindan kullanilir.

### `GET /api/parts/rules`

Part request ekraninin proje kodu, main code ve revision type listelerini
dondurur.

### `POST /api/parts/preview`

Login olan kullanici icin bir part number preview dondurur.

```json
{
  "project_code": "X101",
  "main_code": "2",
  "revision_mode": "released",
  "revision_code": "01A",
  "part_name": "BT_MAIN_FRAME",
  "description": "AL6063-T5",
  "sub_category": "Aluminium Extrusion"
}
```

### `POST /api/parts/requests`

Part request olusturur, resmi part record'u hemen auto-publish eder ve ilgili
part adminlerine review notification gonderir.

### `GET /api/parts/requests/my`

Kullanicinin kendi part requestlerini dondurur.

### `GET /api/parts`

Excel importundan gelen ve auto-published/imported resmi part kayitlarini
dondurur.

### `GET /api/parts/standard-hardware`

Excel'deki `Screw & Nut etc.` sayfasindan import edilen standart donanim
referans kayitlarini dondurur.

### `GET /api/parts/export.xlsx`

Current Parts List kayitlarini Excel uyumlu `.xlsx` dosyasi olarak indirir.

### `GET /api/admin/parts/requests/pending`

Legacy/manual pending part request listesini dondurur. Normal yeni part
request akisi bu kuyruga satir birakmaz.

### `POST /api/admin/parts/requests/{id}/approve`

Legacy/manual pending part request'i onaylar ve `part_records` tablosuna
resmi kayit olarak ekler.

### `POST /api/admin/parts/requests/{id}/reject`

Legacy/manual pending part request'i reddeder. Rezerve edilen part number
tekrar kullanilmaz.

## Database Tablolari

| Table | Amac |
|---|---|
| `users` | Kullanici profili, admin permission listesi, email, pozisyon ve password hash bilgisi. |
| `user_sessions` | Login token session kayitlari. |
| `document_categories` | Rule metadata. |
| `document_sequences` | Category + year bazinda siradaki resmi sequence. |
| `document_requests` | Auto-published/legacy pending/rejected request kayitlari. |
| `document_records` | Resmi document ID kayitlari. |
| `document_revision_archive` | Revision update sonrasi eski revision kopyalari. |
| `document_revision_requests` | Document List uzerinden gelen pending revision update talepleri. |
| `part_sequences` | Project + main code bazinda siradaki part sequence. |
| `part_requests` | Auto-published/legacy pending/rejected part request kayitlari. |
| `part_records` | Excel'den import edilen ve auto-published resmi part kayitlari. |
| `part_standard_hardware_reference` | Screw & Nut etc. Excel sayfasindan import edilen referans satirlari. |
| `notifications` | In-app user/admin notification ve review task kayitlari. |
| `audit_logs` | Create, approve, reject gibi olaylar. |

## Sonraki Teknik Adim

NAS uzerinde gercek kullanima gecmeden once HTTPS/reverse proxy, seed
sifrelerini degistirme ve duzenli database backup akisi planlanmalidir.
