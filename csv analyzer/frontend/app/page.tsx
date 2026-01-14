"use client";

import { useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const API_BASE = "http://localhost:8000";

export default function HomePage() {
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [plotUrl, setPlotUrl] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setPlotUrl(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      setDatasetId(data.dataset_id);
      setFileName(data.filename);
      setMessages([]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  }

  async function sendQuestion() {
    if (!input.trim() || !datasetId) return;
    const question = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setIsSending(true);
    setPlotUrl(null);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset_id: datasetId, question })
      });
      // Log non-OK responses so failures are visible during debugging.
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Chat request failed", res.status, errorText);
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content:
              "Error: chat request failed. Please check the backend logs and try again."
          }
        ]);
        return;
      }

      const data = await res.json();
      const rawAnswer = typeof data?.answer === "string" ? data.answer : "";
      const answer =
        rawAnswer && rawAnswer.trim().length > 0
          ? rawAnswer
          : "No answer was returned by the AI.";
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: answer }
      ]);
    } catch (err) {
      console.error("Chat request error", err);
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content:
            "Error: unable to reach the chat backend. Please check that the backend is running on http://localhost:8000."
        }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function requestPlot(x: string, y: string) {
    if (!datasetId) return;
    setPlotUrl(null);
    try {
      const res = await fetch(`${API_BASE}/plot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset_id: datasetId, x, y, kind: "scatter" })
      });
      const data = await res.json();
      if (data.image_path) {
        setPlotUrl(`${API_BASE}/plot/${data.image_path.split("/").pop()}`);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function handleQuickPlot() {
    const match = input.match(/plot\s+(\w+)\s+vs\s+(\w+)/i);
    if (!match) return;
    const [, x, y] = match;
    requestPlot(x, y);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleQuickPlot();
    sendQuestion();
  }

  return (
    <main className="flex min-h-screen flex-col md:flex-row">
      <section className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-neutral-800 p-4 flex flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight">CSV Analyzer</h1>
        <div className="space-y-2">
          <label className="block text-sm text-neutral-300">
            Upload CSV file
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={handleUpload}
            className="block w-full text-sm text-neutral-200 file:mr-4 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-black hover:file:bg-white/80"
          />
          {isUploading && (
            <p className="text-xs text-neutral-400">Uploading and parsing…</p>
          )}
          {fileName && (
            <p className="text-xs text-neutral-400">
              Loaded file: <span className="font-medium">{fileName}</span>
            </p>
          )}
          {!datasetId && (
            <p className="text-xs text-neutral-500">
              Upload a CSV to start asking questions.
            </p>
          )}
        </div>
        <div className="mt-4 text-xs text-neutral-500 space-y-1">
          <p>Example questions:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Summarize this dataset</li>
            <li>What are the numeric columns?</li>
            <li>Plot age vs income</li>
          </ul>
        </div>
      </section>

      <section className="flex-1 flex flex-col p-4">
        <div className="flex-1 overflow-y-auto border border-neutral-800 rounded-lg p-4 bg-neutral-950">
          {messages.length === 0 && (
            <p className="text-sm text-neutral-500">
              Ask a question about your dataset to get started.
            </p>
          )}
          <div className="space-y-3">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "text-neutral-100"
                    : "text-neutral-200"
                }`}
              >
                <span className="mr-2 font-semibold">
                  {m.role === "user" ? "You" : "AI"}
                </span>
                <span className="text-neutral-400">·</span>
                <div className="mt-1">{m.content}</div>
              </div>
            ))}
          </div>
          {plotUrl && (
            <div className="mt-4">
              <p className="text-xs text-neutral-400 mb-2">Generated plot:</p>
              <img
                src={plotUrl}
                alt="Plot"
                className="max-h-64 border border-neutral-800 rounded"
              />
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={
              datasetId
                ? "Ask a question about your dataset..."
                : "Upload a CSV to start..."
            }
            className="flex-1 rounded-lg border border-neutral-800 bg-black px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-500"
          />
          <button
            type="submit"
            disabled={!datasetId || isSending}
            className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:bg-neutral-600"
          >
            {isSending ? "Sending…" : "Send"}
          </button>
        </form>
      </section>
    </main>
  );
}
