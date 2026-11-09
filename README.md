# KadaiVoice AI — Speak. Bill. Print.

## Setup (Windows PowerShell)
```powershell
cd path\to\kadaivoice-ai
npm install
Copy-Item .env.example .env
notepad .env          # replace your_key_goes_here with your key, save as ".env" (not .env.txt)
npm test
```
Run in TWO terminals:
```powershell
npm run server        # terminal 1 - backend on http://127.0.0.1:8787
npm run dev           # terminal 2 - frontend on http://localhost:5173
```
No credits wanted? Use `npm run server:demo`, or tick "Demo mode" in the app.
Check the key is loaded (never prints it): `Invoke-RestMethod http://127.0.0.1:8787/api/health`

If PowerShell says scripts are disabled, use `npm.cmd` instead of `npm`.

## Security
The Gnani key lives only in `.env`, read by `server/`. The browser calls `/api/...` only. `.env` is git-ignored.
