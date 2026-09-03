# e-PaySlip-V3

MEVN e-Payslip foundation using MongoDB, Express, Vue 3 + Vite, Node.js and PrimeVue.

## Business rules implemented

- Root Admin controls the application.
- Employee category is separate from payroll `Type`:
  - `LOCAL`
  - `FOREIGNER`
- Delivery preference:
  - `EMAIL`
  - `TELEGRAM`
  - `BOTH`
- Local payroll is stored as normalized MongoDB payroll records.
- Local payroll is assigned to a configurable pay period. Seed data creates `Week 1` and `Week 2`; payroll logic does not hard-code them.
- Foreigner payroll is never stored in MongoDB:
  - upload uses `multer.memoryStorage()`
  - parsed rows are held in a process-memory Map
  - admin must preview and approve before release
  - after release, the transient payroll session is destroyed
  - generated PDFs are Buffers only and are not written to disk
- Delivery logs keep non-salary audit data only.
- The company payroll upload contract is fixed in backend source code at:
  `backend/src/modules/payroll/constants/companyPayrollLayout.js`
- The fixed payroll layout has exactly 87 columns.
- Payslip Designer obtains its payroll fields from that same 87-column source of truth.

## Current fixed important payroll positions

- Column 32: Pension (Riel)
- Column 51: GrossPayBeforDeduct
- Column 53: Actual Wages
- Column 77: AccountNo (TEXT so leading zeroes are preserved when Excel formatting/text supplies them)
- Column 87: Total Riel

## Requirements

- Node.js 20.19+ or a newer supported version
- MongoDB local or MongoDB Atlas
- npm

## Easiest installation: use this project folder

### Backend

```powershell
cd e-PaySlip-V3\backend
copy .env.example .env
notepad .env
npm install
npm run seed
npm run dev
```

Backend runs at `http://localhost:4000`.

### Frontend

Open another terminal:

```powershell
cd e-PaySlip-V3\frontend
copy .env.example .env
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

Use the Root Admin email/password that you configured in `backend/.env`.

---

# Commands to create the project manually from zero

If you want to recreate the folders yourself instead of using the supplied project:

```powershell
cd D:\TraxFullTime
mkdir e-PaySlip-V3
cd e-PaySlip-V3

npm create vite@latest frontend -- --template vue
cd frontend
npm install
npm install primevue @primeuix/themes primeicons pinia vue-router axios
cd ..

mkdir backend
cd backend
npm init -y
npm pkg set type=module
npm install express mongoose cors dotenv helmet express-rate-limit jsonwebtoken bcryptjs multer xlsx nodemailer pdf-lib zod
npm install -D nodemon
cd ..
```

Then copy the source files from this project into the matching frontend/backend folders.

## Backend environment

`backend/.env` example:

```env
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/ePaySlipV3
FRONTEND_ORIGIN=http://localhost:5173
JWT_SECRET=CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
JWT_EXPIRES_IN=8h
ROOT_ADMIN_EMAIL=admin@traxapparel.com
ROOT_ADMIN_PASSWORD=ChangeMe123!
ROOT_ADMIN_NAME=Root Admin
ALLOWED_EMAIL_DOMAINS=traxapparel.com
TRANSIENT_PAYROLL_TTL_MINUTES=30

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=e-PaySlip <no-reply@traxapparel.com>

TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
```

Do not commit `.env`.

## First run

1. Configure MongoDB and `JWT_SECRET` in `backend/.env`.
2. Run `npm run seed` once.
3. The seed creates:
   - Root Admin
   - Pay Period `P1 = Week 1`
   - Pay Period `P2 = Week 2`
   - a basic active payslip design
4. Run backend and frontend.
5. Create employees before importing payroll because payroll rows must link by `Code` -> `Employee.employeeCode`.

## Payroll import flow

### Local Staff

`Import XLSX -> validate fixed 87 columns -> link LOCAL employees -> select configured Pay Period -> store normalized PayrollBatch + PayrollRecord -> preview -> release -> regenerate/send PDF`

The uploaded XLSX itself is not stored.

### Foreigner

`Import XLSX -> validate fixed 87 columns -> link FOREIGNER employees -> RAM only -> preview -> approve -> release -> PDF Buffer -> Email/Telegram -> destroy temporary payroll`

A backend restart intentionally destroys any un-released foreign payroll session. Re-upload it if that happens.

## Payslip Designer

The designer supports:

- drag payroll fields from the fixed 87-column catalog
- text
- line
- rectangle
- X/Y position in millimetres
- width/height
- font size / bold
- alignment
- decimal places
- prefix/suffix
- multi-select with Ctrl+click
- group / ungroup
- duplicate / delete
- format painter

The design stores only layout instructions and `fieldKey`. It does not store payroll amounts.

## Email

Configure SMTP in `.env`. Company email domains are controlled by `ALLOWED_EMAIL_DOMAINS`, not hard-coded in employee logic.

## Telegram

Configure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`.

Root Admin can generate a 15-minute one-time Telegram deep link from Employees. The Telegram webhook endpoint is:

`POST /api/telegram/webhook`

Telegram requires a public HTTPS webhook URL for real bot linking. Localhost alone cannot receive Telegram webhooks.

## Important source files

```text
backend/src/modules/payroll/constants/companyPayrollLayout.js
backend/src/modules/payroll/services/payrollParser.service.js
backend/src/modules/payroll/services/payrollImport.service.js
backend/src/modules/payroll/services/transientPayroll.service.js
backend/src/modules/payroll/models/PayrollBatch.js
backend/src/modules/payroll/models/PayrollRecord.js
backend/src/modules/payslips/PayslipDesign.js
backend/src/modules/payslips/payslipRenderer.service.js
frontend/src/views/PayrollImportView.vue
frontend/src/views/ForeignerPreviewView.vue
frontend/src/views/PayslipDesignerView.vue
```
