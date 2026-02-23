# 🚀 Quick Start Guide - Data4Viz

## 📌 Current Issue
**Backend Connection Error:** `ECONNREFUSED on port 3001`

**Cause:** Backend API is not running  
**Solution:** Start the backend server

---

## ⚡ Quick Fix (2 minutes)

### Windows Users

**Option 1: Use Batch Script (Easiest)**
```bash
# From project root, run:
start-backend.bat
```

**Option 2: Manual Command**
```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload
```

### Mac/Linux Users

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload
```

---

## ✅ Verification

### Check Backend is Running
Open in your browser:
```
http://localhost:3001/docs
```

Should see: **FastAPI Swagger UI** with all endpoints listed

### Check API Connection
```bash
curl http://localhost:3001/workspaces
```

Should see: Valid JSON response (not connection error)

---

## 🎯 Full Setup (First Time)

### 1. Install Backend Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. Start Backend
```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload
```

### 3. In Another Terminal, Start Frontend
```bash
npm run dev
```

### 4. Open Frontend
```
http://localhost:3000
```

---

## 🔄 Keep Running

The backend needs to keep running while using the frontend.

**Recommended Setup:**
1. **Terminal 1:** Backend (stays running)
   ```bash
   cd backend
   python -m uvicorn app.main:app --port 3001 --reload
   ```

2. **Terminal 2:** Frontend (stays running)
   ```bash
   npm run dev
   ```

3. **Browser:** Open http://localhost:3000

---

## 🚨 If Backend Won't Start

### Error: "Address already in use"
```bash
# Kill existing process on port 3001 (Windows)
netstat -ano | findstr :3001
taskkill /PID <PID_FROM_ABOVE> /F

# Or use different port
python -m uvicorn app.main:app --port 3002
```

### Error: "Python not found"
```bash
# Check if Python is installed
python --version

# If not, install from python.org
# Then add to PATH and restart terminal
```

### Error: "ModuleNotFoundError"
```bash
# Install dependencies
pip install -r backend/requirements.txt
```

---

## 📊 Expected Result

### Working State
✅ Backend running on http://localhost:3001  
✅ Frontend running on http://localhost:3000  
✅ No ECONNREFUSED errors  
✅ Can create workspaces  
✅ Can upload datasets  
✅ Can analyze data  

### Not Working State
❌ ECONNREFUSED error when trying API calls  
❌ "Failed to proxy" error in browser console  
❌ Workspace operations fail  

---

## 📋 Checklist

- [ ] Backend dependencies installed (`pip install -r requirements.txt`)
- [ ] Backend started (`python -m uvicorn app.main:app --port 3001`)
- [ ] http://localhost:3001/docs loads (Swagger UI visible)
- [ ] Frontend running (`npm run dev`)
- [ ] http://localhost:3000 loads (no ECONNREFUSED)
- [ ] Can create workspace
- [ ] Can upload dataset
- [ ] Can run analysis

---

## 💡 Tips

### Auto-reload on File Changes
```bash
# Add --reload flag (already included in recommended commands)
python -m uvicorn app.main:app --port 3001 --reload
```

### Run Backend in Background (Windows)
```bash
# Start backend in background
start cmd /k "cd backend && python -m uvicorn app.main:app --port 3001"

# Then start frontend in current terminal
npm run dev
```

### View API Documentation
- Swagger UI: http://localhost:3001/docs
- ReDoc: http://localhost:3001/redoc

---

## 🔗 Related Files

- Backend entry point: [backend/app/main.py](./backend/app/main.py)
- Frontend config: [next.config.mjs](./next.config.mjs)
- Error handling improvements: [BACKEND_ERROR_HANDLING_IMPROVEMENTS.md](./BACKEND_ERROR_HANDLING_IMPROVEMENTS.md)
- Proxy config: See `rewrites()` in next.config.mjs

---

## 🎓 Understanding the Architecture

```
Frontend (http://localhost:3000)
    ↓ (proxies API calls to)
Backend (http://localhost:3001)
    ↓ (processes data)
File Storage (backend/workspaces/)
```

When you see `ECONNREFUSED`, the frontend can't reach the backend. Start the backend to fix it.

---

## ✨ Next Steps

1. ✅ Start backend with script or command above
2. ✅ Verify it's running at http://localhost:3001/docs
3. ✅ Start frontend with `npm run dev`
4. ✅ Open http://localhost:3000
5. ✅ Begin working with Data4Viz

---

**Time to Setup:** ~5 minutes (first time) or ~1 minute (subsequent times)  
**Difficulty:** ⭐ Easy  
**Success Rate:** 99% (if dependencies installed correctly)

Start with: `start-backend.bat` (Windows) or `python -m uvicorn app.main:app --port 3001` (all platforms)
