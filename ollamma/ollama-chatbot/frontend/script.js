const chatEl = document.getElementById("chat");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("message-input");

const API_URL = "http://localhost:8000/chat";

function appendMessage(text, type) {
    const div = document.createElement("div");
    div.className = `message ${type}`;
    div.textContent = text;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
}

async function sendMessage(message) {
    appendMessage(message, "user");

    const thinkingEl = document.createElement("div");
    thinkingEl.className = "message system";
    thinkingEl.textContent = "Thinking…";
    chatEl.appendChild(thinkingEl);
    chatEl.scrollTop = chatEl.scrollHeight;

    formEl.querySelector("button").disabled = true;

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ message }),
        });

        if (!response.ok) {
            let info = "";
            try {
                const data = await response.json();
                info = data.detail || JSON.stringify(data);
            } catch (_) {
                info = response.statusText;
            }
            throw new Error(info || "Request failed");
        }

        const data = await response.json();
        thinkingEl.remove();
        appendMessage(data.response, "bot");
    } catch (err) {
        thinkingEl.remove();
        appendMessage(`Error: ${err.message}`, "system");
    } finally {
        formEl.querySelector("button").disabled = false;
    }
}

formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = (inputEl.value || "").trim();
    if (!message) {
        return;
    }
    inputEl.value = "";
    sendMessage(message);
});

inputEl.focus();

