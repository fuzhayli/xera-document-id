# Frontend Prototype Assessment

Bu dokuman, mevcut HTML dosyasinin yeni cok kullanicili sisteme nasil
tasiyacagini tarif eder.

## 1. Mevcut Dosyalar

| Dosya | Rol |
|---|---|
| `Xera_Document_ID_Name_Generator.html` | Offline, tek dosyalik frontend prototip. Filename/ID preview ve format validasyonu yapiyor. |
| `Document Management Guideline_r01.pptx` | Kural kaynagi. Doc No, filename, EC, QMS ve Marketing ID formatlarini anlatiyor. |

## 2. Mevcut HTML'in Kapsami

HTML su anda dort mod sunuyor:

- Standard Document: `D`, `R`, `MD`, `MR`
- Engineering Change
- Marketing Material ID
- Quality Management

Mevcut guclu taraflar:

- Kullanilabilir bir ilk arayuz dili var.
- TR/EN dil yapisi var.
- Form alanlari kategoriye gore degisiyor.
- Canli preview uretiyor.
- Format validasyonlari baslangic icin dogru yerde duruyor.
- Filename sanitization var.
- Copy-to-clipboard akisi var.

Mevcut sinirlar:

- Offline HTML uygulamasi.
- Kullanici hesabi yok.
- Admin/user rol ayrimi yok.
- Ortak database yok.
- Otomatik ve guvenli sequence generation yok.
- Approval workflow yok.
- Audit log yok.
- Excel benzeri ana liste yok.
- Request history yok.
- Ayni anda iki kullanicinin ayni numarayi almasini engelleyecek transaction yok.

## 3. Prototipten Korunacak Parcalar

| Parca | Karar | Not |
|---|---|---|
| Genel layout | Koru, sade web app layout'una cevir | Sol kategori menu + ana form + preview mantigi iyi. |
| TR/EN i18n mantigi | Koru | Metinler daha sonra ayri JSON'a alinabilir. |
| Mode navigation | Koru | `standard`, `ec`, `marketing`, `quality` modlari yeni route/tab olabilir. |
| Preview panel | Koru | User request formunda onay oncesi cok faydali. |
| Validation messages | Koru ama backend ile esitle | Frontend sadece erken uyari vermeli; nihai kontrol backend'de olmali. |
| Filename builder | Shared rule layer'a tasi | Tek kaynak backend olmali. Frontend ayni kurali API'den almali veya shared paketten kullanmali. |
| Sanitization | Backend'e tasi, frontend'de de uygula | Guvenlik ve tutarlilik icin backend authoritative olmali. |

## 4. Backend'e Tasinacak Parcalar

Bu mantiklar frontend'de kalmamali:

- Document number assignment
- Next sequence number calculation
- Duplicate check
- Approval/rejection state changes
- Admin permission checks
- Master data updates
- Audit log creation
- Excel export/import
- Official filename generation

Sebep: Bunlar cok kullanicili ortamda race condition ve yetki hatasi
yaratir. Nihai kural kaynagi backend ve database olmali.

## 5. Yeni Uygulama Ekranlari

MVP icin onerilen ekranlar:

| Ekran | User | Admin |
|---|---:|---:|
| Login | Evet | Evet |
| New Document ID Request | Evet | Evet |
| My Requests | Evet | Evet |
| Approved Document List | Evet | Evet |
| Pending Approvals | Hayir | Evet |
| Request Detail | Kendi kaydi | Tum kayitlar |
| Master Data Management | Hayir | Evet |
| Audit Log | Hayir | Evet |
| Excel Export | Opsiyonel | Evet |

## 6. Frontend Veri Akisi

New request form:

1. Kullanici kategori secer.
2. Frontend, backend'den kategori rule metadata alir.
3. Form alanlari bu metadata'ya gore acilir/kapanir.
4. Kullanici alanlari doldurur.
5. Frontend preview API'sine veri yollar.
6. Backend resmi preview ve validation sonucu dondurur.
7. Kullanici request submit eder.
8. Kayit `pending` olur.
9. Admin approve edince resmi ID/filename final hale gelir.

Admin approval:

1. Admin pending listesini acar.
2. Request detayini inceler.
3. Gerekirse alanlari duzeltir.
4. Approve veya reject eder.
5. Sistem audit log olusturur.
6. Approved kayit ana listede gorunur.

## 7. Ilk Veri Modeli Taslagi

Core tables:

| Table | Purpose |
|---|---|
| `users` | Login, admin permissions, display name, department. |
| `document_requests` | User tarafindan acilan request kayitlari. |
| `document_records` | Approved resmi document ID kayitlari. |
| `document_sequences` | Category/year/order bazinda siradaki numara. |
| `document_categories` | D, R, MD, MR, EC, QMS, MARKETING metadata. |
| `departments` | R&D, QARA, HR, Management, Production. |
| `products` | GR10X, XEBT-W6 gibi urun/model listesi. |
| `audit_logs` | Kim, neyi, ne zaman degistirdi. |

`document_requests` icin ilk alanlar:

| Field | Type | Note |
|---|---|---|
| `id` | uuid/int | Primary key |
| `status` | enum | `pending`, `approved`, `rejected`, `void` |
| `category` | text | `D`, `R`, `MD`, `MR`, `EC`, `QMS`, `MARKETING` |
| `company_code` | text | Default `X` |
| `year_yy` | text | `26` |
| `sequence_no` | text/null | Reserve/approve kararindan sonra dolabilir |
| `document_no` | text/null | Final doc no |
| `revision` | text/null | `r00` |
| `reference_type` | text/null | `model`, `part`, `department`, `task` |
| `reference_value` | text/null | `GR10X-40K`, `R&D`, `1501-1107-02A` |
| `document_name` | text | User input |
| `written_by` | text | User/display name |
| `creation_date` | date | UI date |
| `control_status` | enum | `controlled`, `uncontrolled` |
| `generated_filename` | text/null | Backend generated |
| `requested_by_user_id` | fk | User |
| `approved_by_user_id` | fk/null | Admin |
| `approved_at` | datetime/null | Admin action time |

## 8. Mevcut HTML'den Yeni Frontend'e Gecis

Asama 1:

- Mevcut HTML kurallarini `docs/document-id-rule-matrix.md` ile eslestir.
- UI modlarini koru.
- Static prototype olarak `prototype/` altina tasimayi dusun.

Asama 2:

- Backend API tasarla:
  - `GET /api/rules`
  - `POST /api/preview`
  - `POST /api/requests`
  - `GET /api/requests/my`
  - `GET /api/admin/requests/pending`
  - `POST /api/admin/requests/{id}/approve`
  - `POST /api/admin/requests/{id}/reject`

Asama 3:

- HTML'i API kullanan frontend'e cevir.
- Preview artik lokal JS sonucu degil, backend sonucu olmali.
- Frontend validasyonu hizli uyari olarak kalmali.

Asama 4:

- Excel benzeri ana liste ekle.
- Admin pending approval ekrani ekle.
- Export ekle.

## 9. MVP Kapsam Karari

Ilk implementasyon icin en dusuk riskli kapsam:

1. Login basit kullanici/parola veya NAS/Windows ortamindan alinacak isim.
2. `D`, `R`, `MD`, `MR` kategorileri.
3. Request submit.
4. Admin approval.
5. Otomatik sequence generation.
6. Approved records table.
7. Excel export.

EC, QMS ve Marketing kurallari dokumante edildi, ama ilk sprintte
zorunlu degilse ikinci faza alinabilir.
