# AI Chatbot Assistant (Version 3.8.9)

A highly polished, secure, and lightning-fast AI Chatbot built with an **Enterprise-Grade C++17 Backend** and a **Vanilla HTML/CSS/JS Frontend**.

This application connects to the **Groq API** using the latest **Llama 3.3 70B** models for blazing-fast text and vision responses. It also features a seamless, intelligent local fallback system that uses a local JSON Knowledge Base when the API is disconnected.

---

## 👶 New to Programming? Start Here! (Basic)
**What does this project actually do?**
Think of this project as your own personal version of ChatGPT, hosted entirely on your computer!
- The **Frontend** (HTML/CSS/JS) is the beautiful webpage where you type your messages.
- The **Backend** (C++) is the "brain" running invisibly on your computer. When you send a message, the webpage sends it to the C++ brain. The C++ brain then securely forwards it to Groq's supercomputers, gets the AI's answer, and sends it back to your webpage!
- If you ask a question it already knows, the C++ brain reads from local `.json` files on your computer to answer you instantly offline.

---

## 🚀 What's New in Version 3.8.9? (Advanced)
This version underwent a massive architectural overhaul to achieve enterprise-level security and performance:
1. **JSON Data Migration:** All legacy `.txt` flat files were ripped out and replaced with strict `nlohmann::json` serialization. Data corruption from delimiter parsing is now mathematically impossible.
2. **Environment Isolation:** Secrets are no longer hardcoded or saved in plain text. `GROQ_API_KEY`, `ADMIN_PASSWORD`, and `PORT` are now strictly isolated in a `.env` file that is protected by `.gitignore`.
3. **Cryptographic Sessions:** Admin tokens are now generated using `std::random_device`, tapping directly into the OS-level entropy pool (CSPRNG), making admin session hijacking impossible.
4. **Offline UI (Vendor Mapping):** CDN dependencies were removed. The app now serves `marked.js`, `highlight.js`, and `DOMPurify` locally from a `/vendor` directory.
5. **Thread Pool Protection:** The cURL `callGroq` logic now enforces strict 30-second `CURLOPT_TIMEOUT` limits to prevent thread exhaustion if the Groq API lags.
6. **Llama 3.3 Upgrade:** Successfully migrated off the decommissioned Llama 3.1 architecture to the brand new `llama-3.3-70b-versatile` Groq model.
7. **Single-Tap UX:** Improved frontend accessibility by changing the "New Chat" requirement from a double-click to an instant single-click.

---

## 🛠️ Complete Tech Stack

### Backend (Server)
- **Language:** C++17 (compiled via MinGW-w64 / MSYS2 on Windows).
- **cpp-httplib (`httplib.h`):** Lightweight, multi-threaded HTTP web server.
- **nlohmann/json (`json.hpp`):** Robust JSON parsing for API payloads and database serialization.
- **libcurl:** Makes outgoing HTTPS POST requests to the Groq API (with `CURLOPT_SSL_VERIFYPEER` safely tuned for local Windows development).

### Frontend (User Interface)
- **HTML5 & CSS3:** Custom-built styling using CSS Variables for theming (Light/Dark mode) and Flexbox for responsive layouts.
- **Vanilla JavaScript (`script.js`):** Handles DOM manipulation and async API fetching without heavy frameworks.
- **marked.js & highlight.js:** Converts Markdown to HTML and applies syntax highlighting.
- **DOMPurify:** Strictly sanitizes all incoming HTML strings before DOM injection to eliminate XSS.

---

## 🗄️ Database Architecture

The application handles its own lightweight persistence using strictly formatted JSON files:
1. **`.env`**: Stores the dynamic Port, Groq API Key, and Admin Password.
2. **`chat_history.json`**: Serialized storage of all user conversations.
3. **`knowledge.json`**: Admin-created Offline Fallback Q&A database utilizing full-word token overlap scoring.

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| **POST** | `/api/chat` | Receives messages, fetches from Groq, or falls back to local JSON cache. |
| **GET** | `/api/history` | Returns all saved conversation history from `chat_history.json`. |
| **DELETE**| `/api/history` | Deletes a specific conversation or clears all history. |
| **POST** | `/api/admin/login` | Authenticates admins using CSPRNG secure tokens. |
| **POST** | `/api/knowledge/add` | (Admin) Adds a new Q&A rule to the offline database. |

---

## ⚙️ How to Compile & Run

### 1. Compile the Code (MSYS2 / Git Bash)
Make sure you have `curl` installed in your MSYS2 environment. Open your terminal, navigate to the `Source` folder, and run:
```bash
g++ -std=c++17 -O2 -I. chatbot.cpp -o chatbot_updated.exe -static-libgcc -static-libstdc++ -lcurl -lws2_32 -lwinpthread
```

### 2. Configure your Environment
Ensure you have a `.env` file in the root folder with:
```env
PORT=8080
GROQ_API_KEY=gsk_your_api_key_here
ADMIN_PASSWORD=admin@2026
```

### 3. Launch the Server
```bash
./chatbot_updated.exe
```
Open `http://127.0.0.1:8080` in your browser!
