# CSV AI Chat (Groq)

Simple Streamlit app that lets you:
- Upload a CSV file
- Chat with an AI assistant
- Ask the AI to summarize and analyze the uploaded CSV

The app uses the Groq API with the model **llama3-8b-8192**.

## Prerequisites

- Python 3.9+ recommended
- A Groq account
- A Groq API key

Set your API key in an environment variable named `GROQ_API_KEY`:

```bash
export GROQ_API_KEY="your_api_key_here"      # macOS / Linux
set GROQ_API_KEY=your_api_key_here           # Windows (cmd)
$env:GROQ_API_KEY="your_api_key_here"        # Windows (PowerShell)
```

## Install dependencies

From inside the `csv_ai_chat` directory:

```bash
pip install -r requirements.txt
```

## Run the app

From inside the `csv_ai_chat` directory:

```bash
streamlit run app.py
```

## How it works

1. Upload a CSV file in the sidebar.
2. The CSV is loaded with pandas and converted to text (head and basic summary).
3. The CSV text is stored in Streamlit session state.
4. Ask questions in the chat box.
   - If a CSV is uploaded, the AI answers using the CSV context.
   - If no CSV is uploaded, the AI behaves like a normal assistant.
