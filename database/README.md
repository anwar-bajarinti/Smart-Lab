# Database Architecture & Migrations

This directory contains the central PostgreSQL database schema and migrations for the Incubation Centre / Smart Lab Management System hosted on **Supabase**.

---

## Directory Role

- **`database/`** (this directory):
  Contains server-side database definitions, SQL schema migrations, and Row-Level Security (RLS) policies.
- **`frontend/src/db/`**:
  Contains the client-side JavaScript database access layer, storage quotas, offline cache, and state management.

---

## Migration History

The migrations in `database/supabase/migrations/` define the relational schema:

1. **`001_safe_schema_upgrade.sql`**:
   - Primary entity tables: `students`, `components`, `transactions`, `lab_sessions`, `audit_logs`, `esp32_devices`.
   - Row Level Security (RLS) policies for authenticated admins and read-only student/kiosk access.
   - Enums and foreign key integrity constraints.

2. **`002_incubation_start_and_storage.sql`**:
   - `incubation_start_date` column for accurate 4-year lifecycle tracking.
   - 4-year retention policies protecting active student records from premature deletion.
   - Tiered database storage protection (Safe <70%, Warning 70-85%, Critical 85-95%, Emergency >95%).

3. **`003_id_card_barcode_and_validity.sql`**:
   - Barcode indexing (`barcode_id`, `barcode_format`) on student profiles for sub-second badge lookup.
   - Student validity window calculations.

---

## Safety & Invariants

> [!IMPORTANT]
> - Do **not** manually alter executed migration files in production.
> - Database changes must follow forward-only migrations.
> - The client layer connects securely via Supabase JS SDK using environment variables defined in `frontend/.env.local`.
