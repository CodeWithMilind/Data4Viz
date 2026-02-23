# Backend Connection Issue - Troubleshooting & Fix

## 🔴 Problem
```
Failed to proxy http://localhost:3001/workspaces/...
Error: ECONNREFUSED
```

This means:
- ❌ Backend API is NOT running on port 3001
- ❌ Frontend can't reach the backend to proxy requests
- ❌ Requests to `/workspaces/*` endpoints fail

---

## ✅ Solution Steps

### Step 1: Start the Backend API

**Option A: Using Python (Recommended)**
```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload
```

**Option B: Using uvicorn directly**
```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload
```

**Expected Output:**
```
INFO:     Uvicorn running on http://0.0.0.0:3001
INFO:     Application startup complete
```

### Step 2: Verify Backend is Running
Open in browser: `http://localhost:3001/docs`
- Should show FastAPI Swagger UI
- Should list all endpoints

### Step 3: Test Proxy Connection
```bash
curl http://localhost:3001/workspaces
# Should return: {"workspace_id":"...", "datasets":[]}
# Not: Connection refused error
```

### Step 4: Frontend will Auto-Reconnect
Once backend is running, the frontend will automatically use the proxy to reach it.

---

## 🔍 Troubleshooting

### Backend Won't Start
**Error:** `Address already in use`
```bash
# Kill process on port 3001
# Windows:
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Mac/Linux:
lsof -ti:3001 | xargs kill -9
```

### Backend Starts but Still Getting Connection Error
```bash
# Check if port 3001 is actually listening
netstat -ano | findstr LISTENING

# Check if Python/uvicorn is running
# Open Task Manager (Windows) → look for python.exe or uvicorn processes
```

### Backend Returns Different Error
Check backend logs for the actual error message.

---

## 📋 Checklist

- [ ] Backend process started (`python -m uvicorn app.main:app --port 3001`)
- [ ] No "Address already in use" errors
- [ ] `http://localhost:3001/docs` loads (Swagger UI)
- [ ] `curl http://localhost:3001/workspaces` returns JSON (not connection error)
- [ ] Frontend no longer shows ECONNREFUSED errors
- [ ] Workspace operations work without errors

---

## 🎯 Quick Start Command

Copy and run this in the backend directory:
```bash
cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload
```

Then keep it running while using the frontend.

---

## 📝 Permanent Setup (Optional)

### Create `start-backend.bat` (Windows)
```batch
@echo off
cd backend
echo Starting Data4Viz Backend on port 3001...
python -m uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload
pause
```

### Create `start-backend.sh` (Mac/Linux)
```bash
#!/bin/bash
cd backend
echo "Starting Data4Viz Backend on port 3001..."
python -m uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload
```

Then run: `./start-backend.sh`

---

## ✨ Expected Result

**Before (Error):**
```
Failed to proxy http://localhost:3001/workspaces/workspace-xyz
ECONNREFUSED
```

**After (Working):**
```
✅ Workspace datasets loaded
✅ Dataset overview computed
✅ All API calls working
```

---

## 🆘 Still Not Working?

1. **Check backend logs** - Run the start command again, look for error messages
2. **Port conflict** - Try different port: `--port 3002`
3. **Python not found** - Make sure Python is in PATH: `python --version`
4. **Dependencies missing** - Install: `pip install -r requirements.txt`
5. **Path issues** - Make sure you're in the right directory before running uvicorn

---

**Status:** 🔴 **Backend Not Running**  
**Action Required:** Start the backend with the command above  
**Estimated Time:** < 1 minute

See [README-TESTS.md](../README-TESTS.md) for more testing information.
