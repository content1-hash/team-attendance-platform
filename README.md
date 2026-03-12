# Team Attendance Platform

Free attendance website for a small office team.

## Features
- Member login with name + PIN
- Clock in / clock out
- Break tracking with saved duration
- Admin view for monthly records
- Data saved in Supabase so refresh/close does not lose state

## Environment variables
Create these in Vercel:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Admin emails
- content@toppagerankers.com
- content3@toppagerankers.com
- content1@toppagerankers.com

## Change admin password
Edit `src/App.jsx` and replace:
`CHANGE_THIS_ADMIN_PASSWORD`

## Local run
```bash
npm install
npm run dev
```
