# Team Attendance Platform

A simple attendance web app for a 20-member office team.

## What it does

- Team members can log in with their name and PIN
- Clock in
- Start first break, second break, third break, or extra break
- End break
- Clock out
- Break duration is stored automatically
- Monthly records stay saved in the database
- Data does not disappear after refresh or closing the page
- Admins can see monthly summary data

## Tech used

- React + Vite
- Supabase database
- Vercel deployment

## Why this setup

This app needs shared live data, persistence, and many people using it at once. A database-backed setup is better than a plain static site alone. Supabase gives a free hosted Postgres database and realtime features. Vercel has a free Hobby plan for deploying web apps. GitHub Pages is a static hosting service, which is useful for simple frontends, but this project still needs a separate database for shared saved attendance data.

## Admins

These are the 3 admin emails already included in the app UI:

- content@toppagerankers.com
- content3@toppagerankers.com
- content1@toppagerankers.com

Change the admin password inside `src/App.jsx`:

```js
const ADMIN_PASSWORD = 'CHANGE_THIS_ADMIN_PASSWORD'
```

## Very important before deploy

You must change these things first:

1. Change the admin password in `src/App.jsx`
2. Replace sample members in the database with your real team names and PINs
3. Add your Supabase URL and anon key in Vercel environment variables

## Step-by-step setup

### 1) Create a GitHub account

If you do not already have one, create a GitHub account.

### 2) Create a Supabase account

Create a free account and a new free project.

### 3) Create database tables

In Supabase:

- Open your project
- Go to SQL Editor
- Create a new query
- Open the file `supabase/schema.sql`
- Copy all SQL from that file
- Paste it into Supabase SQL Editor
- Run it

This creates all tables, indexes, functions, and 20 sample members.

### 4) Replace sample members with your real team members

In Supabase table editor:

- Open `members`
- Edit each `full_name`
- Edit each `pin`

Use a different 4-digit PIN for each employee.

### 5) Download the project and upload to GitHub

Upload all files in this project to a new GitHub repository.

### 6) Deploy with Vercel

In Vercel:

- Sign in with GitHub
- Import your GitHub repository
- Add environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Deploy

### 7) Find your Supabase project URL and anon key

In Supabase:

- Open Project Settings
- Open API
- Copy:
  - Project URL
  - anon public key

Paste them into Vercel environment variables.

### 8) Redeploy if needed

After adding environment variables, redeploy from Vercel if the app asks for it.

## Run locally on your computer

Install Node.js first, then run:

```bash
npm install
npm run dev
```

## How concurrency is handled

This app is built so that if two people click buttons around the same time, the database protects the data:

- Only one open shift per member
- Only one open break per shift
- Break totals are calculated in the database
- State is read from the database after every action

## Security note

This version is built to stay simple and free. Team members use name + PIN. Admins use admin email + one shared admin password in the frontend.

For a stronger production version later, you can upgrade to:

- real admin authentication
- hashed member PINs
- export to CSV
- filters by date
- edit or delete wrong attendance entries

## Free platform notes

- Supabase offers a free plan and free projects
- Vercel offers a free Hobby plan
- GitHub Pages is static hosting, so it does not replace the need for a shared database

## Suggested next improvements

- Add CSV export for payroll
- Add late arrival report
- Add member creation screen for admins
- Add date filter by month
