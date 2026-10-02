@echo off
REM One-click launcher for the MERN stack (Windows).
REM
REM Boots the Express + Mongoose backend on :4000 and the Vite React
REM dev server on :5173. The React app proxies /api/* through to Express
REM and auto-bootstraps a default tenant + admin on first load, so the
REM browser opens straight to the directory.
REM
REM Prereq: a local MongoDB running on mongodb://127.0.0.1:27017 (the
REM default for MongoDB Community on Windows).

cd /d "%~dp0"
call npm run dev
