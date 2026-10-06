# Registration Data Portal

Sign in, pick Year / Maker / Model / RTO (multi-select), and download the matching rows as CSV.
Next.js 15 + Supabase (auth and database), ready for Vercel.

An empty filter means "everything". Models narrow to the selected makers. The match count updates
as you pick, and the download streams straight to disk, so the full 299,024 rows work fine.

## 1. Supabase: create the table and functions

1. Create a project at supabase.com.
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and run it.

## 2. Load the data

`data/vehicles.csv` is already cleaned: duplicates removed, one row per registration number, with
`reg_year`, `rto_code` (e.g. KL07), `district` and `pincode` derived for you.

Fastest way, from a terminal with `psql` (use the connection string from **Project Settings →
Database → Connection string**, the "Session pooler" one, with your database password filled in):

```bash
psql "YOUR_CONNECTION_STRING" -c "\copy public.vehicles (registration_no, registration_date, reg_year, owner_name, owner_mobile, maker, model, rto_code, district, pincode, address) from 'data/vehicles.csv' with (format csv, header true)"
```

This took about 6 seconds in testing. (The dashboard's Table Editor CSV import also works, but is slower
for a 60 MB file.)

## 3. Create users

This portal has no sign-up page on purpose.

1. **Authentication → Users → Add user**, and enter an email and password for each person.
2. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up", so only
   people you add can get in.

## 4. Run locally

```bash
cp .env.example .env.local     # then fill in the two Supabase values
npm install
npm run dev                    # http://localhost:3000
```

## 5. Deploy on Vercel

1. Put the project on GitHub. `data/` is git-ignored, so the CSV (which contains owner names and
   mobile numbers) is never pushed.
2. In Vercel: **Add New → Project**, import the repo.
3. Add environment variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy.
5. In Supabase **Authentication → URL Configuration**, set **Site URL** to your Vercel URL.

## Notes

- **Security:** the table has row-level security on and only signed-in users can read it. Nobody can
  write to it from the app. The `anon` key is safe in the browser; never use the `service_role` key.
- **Personal data:** the export includes owner name, mobile and address. Only create accounts for
  people who should see that.
- **Download time:** the export reads 1,000 rows per request. A full-file download takes roughly
  10–30 seconds to complete. The export route allows up to 300 seconds (`maxDuration`).
- **Refreshing data:** to replace the data, run `truncate public.vehicles restart identity;` and
  re-import. The dropdown values are cached for 10 minutes.
- **"Make":** the data has Maker and Model columns but no separate "Make", so the portal offers
  Year, Maker, Model and RTO.
