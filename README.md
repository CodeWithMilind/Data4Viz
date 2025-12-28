# Data4Viz AI Workbench

A local Data Scientist AI Workbench that helps you explore, analyze, and visualize your data using natural language.

## 🚀 How to Run This Project (Easiest Way)

I have created a **one-click starter** for you. You don't need to manually install anything.

### Windows
1. **Double-click** the `run.bat` file in this folder.
2. It will automatically:
   - Create a hidden virtual environment (`venv`).
   - Install all required libraries (FastAPI, Pandas, Sweetviz, etc.).
   - Start the server.
3. Once running, open your browser at:  
   👉 **http://localhost:8000/**

---

## 🛠️ Manual Setup (If you prefer terminal)

If you want to run it manually from the command line:

1. **Create Virtual Environment:**
   ```powershell
   python -m venv venv
   ```

2. **Activate It:**
   ```powershell
   .\venv\Scripts\activate
   ```

3. **Install Dependencies:**
   ```powershell
   pip install -r requirements.txt
   ```

4. **Run the App:**
   ```powershell
   python main.py
   ```

## ❓ Troubleshooting

**Q: "python is not recognized" error?**  
A: Make sure you have Python 3.10+ installed and added to your system PATH.

**Q: "ModuleNotFoundError"?**  
A: This happens if you are not in the virtual environment. Always use `run.bat` to avoid this.

## Tech Stack
- **Backend**: FastAPI, Python
- **Frontend**: HTML, CSS, Vanilla JS
- **Data**: Pandas, Sweetviz, Scikit-learn, Plotly
