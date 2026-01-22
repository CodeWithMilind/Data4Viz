#!/usr/bin/env python3
"""
Run script for Data4Viz project.

This script starts both the backend (FastAPI) and frontend (Next.js) servers
simultaneously. Press Ctrl+C to stop both servers.

Usage:
    python run.py
"""

import subprocess
import sys
import os
import signal
import time
from pathlib import Path

# Project root directory
ROOT_DIR = Path(__file__).parent.absolute()
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR

# Process references
backend_process = None
frontend_process = None


def check_dependencies():
    """Check if required dependencies are installed."""
    print("🔍 Checking dependencies...")
    
    # Check Python
    python_version = sys.version_info
    if python_version.major < 3 or (python_version.major == 3 and python_version.minor < 10):
        print("❌ Python 3.10+ is required")
        return False
    print(f"✅ Python {python_version.major}.{python_version.minor}.{python_version.micro}")
    
    # Check if backend requirements are installed
    try:
        import uvicorn
        print("✅ Backend dependencies installed")
    except ImportError:
        print("❌ Backend dependencies not installed. Run: pip install -r backend/requirements.txt")
        return False
    
    # Check if pnpm is available
    try:
        result = subprocess.run(
            ["pnpm", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            print(f"✅ pnpm {result.stdout.strip()}")
        else:
            print("❌ pnpm not found. Install with: npm install -g pnpm")
            return False
    except (subprocess.TimeoutExpired, FileNotFoundError):
        print("❌ pnpm not found. Install with: npm install -g pnpm")
        return False
    
    # Check if node_modules exists (frontend dependencies)
    if not (FRONTEND_DIR / "node_modules").exists():
        print("⚠️  Frontend dependencies not installed. Installing...")
        try:
            subprocess.run(
                ["pnpm", "install"],
                cwd=FRONTEND_DIR,
                check=True,
                timeout=300  # 5 minutes max
            )
            print("✅ Frontend dependencies installed")
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError) as e:
            print(f"❌ Failed to install frontend dependencies: {e}")
            return False
    
    return True


def start_backend():
    """Start the FastAPI backend server."""
    global backend_process
    
    print("\n🚀 Starting backend server...")
    print("   Backend will be available at: http://localhost:8000")
    
    try:
        backend_process = subprocess.Popen(
            [
                sys.executable, "-m", "uvicorn",
                "app.main:app",
                "--reload",
                "--host", "0.0.0.0",
                "--port", "8000"
            ],
            cwd=BACKEND_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        return backend_process
    except Exception as e:
        print(f"❌ Failed to start backend: {e}")
        return None


def start_frontend():
    """Start the Next.js frontend server."""
    global frontend_process
    
    print("\n🚀 Starting frontend server...")
    print("   Frontend will be available at: http://localhost:3000")
    
    try:
        frontend_process = subprocess.Popen(
            ["pnpm", "dev"],
            cwd=FRONTEND_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        return frontend_process
    except Exception as e:
        print(f"❌ Failed to start frontend: {e}")
        return None


def signal_handler(sig, frame):
    """Handle Ctrl+C gracefully."""
    print("\n\n🛑 Shutting down servers...")
    
    if backend_process:
        print("   Stopping backend...")
        backend_process.terminate()
        try:
            backend_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            backend_process.kill()
    
    if frontend_process:
        print("   Stopping frontend...")
        frontend_process.terminate()
        try:
            frontend_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            frontend_process.kill()
    
    print("✅ All servers stopped. Goodbye!")
    sys.exit(0)


def main():
    """Main entry point."""
    print("=" * 60)
    print("  Data4Viz - Full Stack Development Server")
    print("=" * 60)
    
    # Check dependencies
    if not check_dependencies():
        print("\n❌ Dependency check failed. Please install missing dependencies.")
        sys.exit(1)
    
    # Register signal handler for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Start backend
    backend_proc = start_backend()
    if not backend_proc:
        print("❌ Failed to start backend. Exiting.")
        sys.exit(1)
    
    # Wait a bit for backend to start
    time.sleep(2)
    
    # Start frontend
    frontend_proc = start_frontend()
    if not frontend_proc:
        print("❌ Failed to start frontend. Stopping backend...")
        backend_proc.terminate()
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("  ✅ Both servers are running!")
    print("=" * 60)
    print("  Backend:  http://localhost:8000")
    print("  Frontend: http://localhost:3000")
    print("  API Docs: http://localhost:8000/docs")
    print("=" * 60)
    print("\n  Press Ctrl+C to stop both servers\n")
    
    # Wait for processes to complete (or be interrupted)
    try:
        # Use threading or asyncio for better output handling
        import threading
        
        def read_output(process, prefix):
            """Read output from a process."""
            if process.stdout:
                for line in iter(process.stdout.readline, ''):
                    if line:
                        print(f"[{prefix}] {line.rstrip()}")
        
        # Start threads to read output
        backend_thread = threading.Thread(
            target=read_output,
            args=(backend_proc, "BACKEND"),
            daemon=True
        )
        frontend_thread = threading.Thread(
            target=read_output,
            args=(frontend_proc, "FRONTEND"),
            daemon=True
        )
        
        backend_thread.start()
        frontend_thread.start()
        
            # Wait for processes
        while True:
            backend_exit = backend_proc.poll()
            frontend_exit = frontend_proc.poll()
            
            if backend_exit is not None:
                print(f"\n❌ Backend process exited with code {backend_exit}")
                if frontend_proc.poll() is None:
                    frontend_proc.terminate()
                break
            if frontend_exit is not None:
                print(f"\n❌ Frontend process exited with code {frontend_exit}")
                if backend_proc.poll() is None:
                    backend_proc.terminate()
                break
            time.sleep(1)
            
    except KeyboardInterrupt:
        signal_handler(None, None)


if __name__ == "__main__":
    main()
