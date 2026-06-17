# Document ID Rule Matrix

Bu dokuman, ilk MVP icin Excel/PPT kurallarini uygulama kurallarina
cevirir. Kaynaklar:

- `Document Management Guideline_r01.pptx`
- Kullanici tarafindan paylasilan Excel ekran goruntuleri: `D_Documents` ve
  `R_Documents`
- Mevcut prototip: `Xera_Document_ID_Name_Generator.html`

## 1. Ana Kavramlar

| Kavram | Anlam | Uygulamada karsiligi |
|---|---|---|
| Doc No | Dokuman numarasi. Genel, kayit, manufacturing ve quality dokumanlari icin kullanilir. | Sistem tarafindan benzersiz uretilmeli ve onay akisina baglanmali. |
| Template No | Referans-only template numarasi. Sadece yetkili kisiler tarafindan yaratilir ve QMR onayi gerekir. | Ilk MVP disinda tutulabilir veya sadece master data olarak izlenebilir. |
| Marketing Material ID | Musteriye verilen brochure/catalogue/leaflet gibi materyaller icin ID. | `R` document number alindiktan sonra uretilmeli. |
| Revision | Dokumanin revizyonu. PPT kuralina gore kucuk `r` ile yazilir. | Dosya adinda `r00`, `r01` formatinda tutulmali. |
| Controlled / Approved | Dokumanin admin tarafindan kontrol edilip onaylandigini gosterir. | Kullanici secmez; admin approval sonrasi otomatik controlled/approved kabul edilir ve `checked_by` tutulur. |

## 2. Ortak Excel Alanlari

| Excel kolonu | Backend alan adi | Zorunlu | Not |
|---|---|---:|---|
| Company | `company_code` | Evet | Simdilik varsayilan `X`. |
| Categories | `category` | Evet | `D`, `R`, `MD`, `MR`, `EC`, `QMS`, `MARKETING`. |
| Year | `year_yy` | Evet | `26` gibi iki haneli yil. Creation date yilindan otomatik gelebilir. |
| No.(AAA) | `sequence_no` | Evet | `001`, `002`, `003`. Kategori + yil bazinda benzersiz olmali. |
| Revision | `revision` | Duruma bagli | `00` veya `r00` girisi normalize edilmeli. Dosya adinda `r00`. |
| Product / Product Tasks | `product_or_task` | Duruma bagli | D/MD/MR icin product veya part/model referansi; R icin task/dept olabilir. |
| Document Name | `document_name` | Evet | Dosya adinin ana aciklamasi. |
| Written by | `written_by` | Evet | Login kullanicisindan otomatik gelebilir, admin override edebilir. |
| Creation Date | `creation_date` | Evet | UI format: `YYYY-MM-DD`; filename gereken yerlerde `YYYYMMDD`. |
| Approved | `approved_by` / `approval_status` | Admin | Bos, pending, approved, rejected, void gibi status kullanilmali. |
| Checked / Approved by | `checked_by` / `approved_by_user_id` | Admin | Dosyayi kontrol eden/onaylayan admin. |

## 3. Kategori Kurallari

| Kategori | Kapsam | Doc No formati | Filename formati | Suffix kural |
|---|---|---|---|---|
| D | General purpose controlled documents | `XD-{YY}-{AAA}` | `XD-26-001_GR10X-40K_Risk Management Report_r00` | Revision |
| R | Record purpose documents | `XR-{YY}-{AAA}` | `XR-26-001_R&D_Literature Search Report_20260326` | Date |
| MD | Manufacturing site dynamic documents | `XMD-{YY}-{AAA}` | `XMD-26-001_GR10X-40K_Product Wastage Follow-up_r00` | Revision |
| MR | Manufacturing site record documents | `XMR-{YY}-{AAA}` | `XMR-26-001_GR10X-40K_Final Inspection Report_20260505` | Date |
| EC | Engineering Change documents | `XEC-{YY}{ORDER}-{TYPE}` veya `XEC-{YY}{ORDER}-{TYPE}-{AAA}` | `XEC-26A-R_GR10X-40K_Critical malfunction of motor_r00` | Revision |
| QMS | Quality management documents | `XQM-{YY}`, `XQP-{AA}`, `XQS-{AA}-{NN}`, `XQT-{AA}-{NN}` | `XQP-13_Control of Manufacturing Realization_r00` | Revision |
| MARKETING | Customer-facing marketing materials | Ayrica `R` Doc No gerekir | `XERA-OCTAVE20260508BEN` | Published date + material type + language |

## 4. Standart Dokuman Kategorileri

### D - Initial "D" Documentation

Applicable departments from Excel:

- R&D
- QARA
- HR
- Management

Rules from Excel/PPT:

- Dynamic document control.
- Documents remain editable after initial drafting.
- Strict revision tracking is required.
- Formal approval and lifecycle management required.
- Example filename: `XD-26-001_GR10X-40K_Risk Management Plan_r00.docx`.

Typical document groups:

- Marketing materials
- Design plan/report
- Clinical plan/report
- Internal audit plan/report
- CAPA files
- Supplier audit plan/report
- Folder spine
- Revision request
- Training files
- Participant evaluation files
- Annual training calendar
- Signature and initials register
- Training log
- Design change files
- Request files
- Supplier quality agreement
- Supplier written evaluation
- Supplier assessment
- Service request initiation
- Return merchandise authorization report
- Installation qualification test plan/report

### R - Initial "R" Documentation

Applicable departments from Excel:

- R&D
- QARA
- HR
- Management
- Production

Rules from Excel/PPT:

- Once recorded, records must remain permanent and unalterable.
- Production site should use `MD` or `MR` documents.
- Formal approval and lifecycle management required.
- Document number and revision/date information must appear in the document,
  top right corner of every page.
- Example filename: `XR-26-001_R&D_Literature Search Report_20260326.docx`.

Typical document groups:

- Meeting minute
- Quotation
- Proforma invoice
- Packing list and commercial invoice
- Service training certificate
- Export loading information
- Purchase request/order

### MD - Manufacturing Dynamic Documentation

Rules from PPT:

- Manufacturing site documents that can be modified and revised.
- Uses revision suffix in filename.

Typical document groups:

- Follow-up files
- Maintenance and malfunction report
- Equipment verification report
- ESD protection compliance checklist

### MR - Manufacturing Record Documentation

Rules from PPT:

- Manufacturing site record documents.
- Uses written date suffix in filename.

Typical document groups:

- Work order
- Shipping inspection control
- Nonconformance notice and action request
- Incoming material inspection
- Product production control
- In-process quality control
- Final inspection report
- Packing control

## 5. Engineering Change Kurallari

PPT format:

- Base format: `XEC-{YY}{ORDER}-{TYPE}`
- Order: `A`, `B`, etc. Example: `26A`
- Type values: `R`, `Rr`, `E`, `O`, `N`
- Sequential extension example: `XEC-26A-Rr-001`
- The first document number assigned to order `A` must be used as the
  reference ID for related Engineering Change documents.

Examples:

- `XEC-26A-R_GR10X-40K_Critical malfunction of motor_r00`
- `XEC-26A-Rr-001_GR10X-40K_Critical malfunction of motor_r00`
- `XEC-26A-E_GR10X-40K_Critical malfunction of motor_r00`
- `XEC-26A-N_GR10X-40K_Critical malfunction of motor_r00`

MVP rule:

- EC requests should store `ec_order`, `ec_type`, optional `sequence_no`,
  `reference_model`, `document_name`, `revision`.
- Confirm whether only `Rr` uses `-{AAA}`, or whether all EC types may use it.

## 6. Quality Management Kurallari

PPT rules:

- Quality Management Documents are created exclusively by QA/RA.
- Distribution happens after QMR approval.

Number formats:

| Type | Doc No format | Example |
|---|---|---|
| Quality Manual | `XQM-{YY}` | `XQM-26` |
| Quality Process | `XQP-{AA}` | `XQP-13` |
| SOP / Instruction | `XQS-{AA}-{NN}` | `XQS-13-01` |
| Template | `XQT-{AA}-{NN}` | `XQT-13-01` |

Filename examples:

- `XQM-26_Quality Manual_r00`
- `XQP-13_Control of Manufacturing Realization_r00`
- `XQS-13-01_Soldering_r00`
- `XQT-13-01_Work Order_r00`

## 7. Marketing Material ID Kurallari

PPT rules:

- Applies to documents delivered directly to customers, such as brochures,
  catalogues and leaflets.
- Marketing materials are generated documents and fall under the `R` document
  category.
- An `R` document number must be issued first.

Format:

`XERA-{BRAND}{YYYYMMDD}{MATERIAL_TYPE}{LANGUAGE}`

Material type values:

| Code | Meaning |
|---|---|
| B | Brochure |
| C | Catalogue |
| L | Leaflet |
| G | General / Graphic Material |

Examples:

- `XERA-OCTAVE20260508BEN`
- `XERA-CLARIX20260508CEN`
- `XERA-NEXERA20260508LEN`

## 8. Approval Workflow Rules

MVP workflow:

| Status | Actor | Meaning |
|---|---|---|
| `draft` | User | Form is being filled, not submitted. |
| `pending` | User | Request submitted and waiting for admin review. |
| `approved` | Admin | Document ID is official and visible as approved. |
| `rejected` | Admin | Request was rejected; sequence handling must be confirmed. |
| `void` | Admin | ID was cancelled after being created, but audit history remains. |

Recommended rule:

- Users can create requests only.
- Admins can approve, reject, edit master data and correct records.
- Approved records should not be deleted. Use `void` if cancellation is needed.
- Every status change should create an audit log row.

## 9. Validation Rules

Initial regex candidates:

| Rule | Regex |
|---|---|
| D Doc No | `^XD-\d{2}-\d{3}$` |
| R Doc No | `^XR-\d{2}-\d{3}$` |
| MD Doc No | `^XMD-\d{2}-\d{3}$` |
| MR Doc No | `^XMR-\d{2}-\d{3}$` |
| EC Doc No | `^XEC-\d{2}[A-Z]-(Rr|R|E|O|N)(-\d{3})?$` |
| QMS Doc No | `^(XQM-\d{2}|XQP-\d{2}|XQS-\d{2}-\d{2}|XQT-\d{2}-\d{2})$` |
| Revision | `^r\d{2}$` |
| Date for filename | `^\d{8}$` plus valid calendar date |
| UI date | `^\d{4}-\d{2}-\d{2}$` plus valid calendar date |
| Language | `^[A-Z]{2}$` |

Filename sanitization:

- Forbidden Windows filename characters: `\ / : * ? " < > |`
- Use `_` between major filename sections.
- Preserve spaces inside document names unless the admin policy changes.

## 10. Open Questions

Bu maddeler implementasyondan once onaylanmali:

1. `Company` her zaman `X` mi olacak?
2. Sequence number `category + year` bazinda mi, yoksa department/product bazinda mi artacak?
3. `pending` durumda sequence no rezerve edilecek mi, yoksa admin approve edince mi verilecek?
4. Rejected request sequence no yakacak mi, yoksa tekrar kullanilacak mi?
5. EC icin `-{AAA}` sadece `Rr` tipinde mi kullaniliyor?
6. D/R/MD/MR icin `Product` alani bazen model, bazen part code, bazen department olarak kullaniliyor. Tek alan mi kalacak, yoksa `reference_type` + `reference_value` olarak mi ayrilacak?
7. `Approved` kolonu kisi adi mi, tarih mi, yoksa sadece onay isareti mi tutacak?
8. Controlled/Approved ayni anlamda kullanilacak; kullanici bu alani secmeyecek, admin onayi dosyayi controlled yapacak.
