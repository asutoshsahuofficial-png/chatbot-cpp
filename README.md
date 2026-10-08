# 🤖 AI Chatbot Assistant — Version v1.9.10

A polished, lightweight AI Chatbot built with a **C++17 backend server** and a **Vanilla HTML/CSS/JavaScript frontend**.

The application connects to the **Groq API** for AI-powered text and vision responses, and provides a local Knowledge Base fallback when the external API is unavailable.

---

## 📌 Project Overview

AI Chatbot Assistant is a locally hosted chatbot application designed to run on a Windows computer.

### How it works

1. The user interacts with the web interface.
2. The frontend sends requests to the local C++ backend.
3. The C++ backend processes the request and any attached files.
4. When available, the backend communicates with the Groq API (including Vision and Document extraction).
5. The AI response is returned to the frontend and saved to the local conversation history.
6. The local Knowledge Base can be used as a fallback when the external API is unavailable.

```text
┌──────────────────────────────┐
│         Web Browser          │
│     HTML / CSS / JavaScript  │
└──────────────┬───────────────┘
               │
               │ HTTP / REST API
               ▼
┌──────────────────────────────┐
│          C++17 Backend       │
│        chatbot.cpp           │
└──────────────┬───────────────┘
               │
        ┌──────┴───────┐
        │              │
        ▼              ▼
   Groq API       Local Knowledge
   AI Service          Base
        │              │
        └──────┬───────┘
               ▼
        Chatbot Response
               │
               ▼
         Web Interface
```

---

## ✨ Features

- 🤖 **AI-powered Chatbot:** Conversational AI via Groq API (`openai/gpt-oss-20b`).
- 👁️ **Multimodal/Vision Support:** Analyze images using `qwen/qwen3.8-27b`.
- 📄 **Document Extraction:** Process text and DOCX files natively via Windows PowerShell.
- 📴 **Offline Fallback:** Local Knowledge Base jumps in when the API is unreachable.
- 💬 **Persistent Memory:** Conversation history stored locally in JSON.
- 🔄 **Response Refresh:** Regenerate previous responses without losing original context.
- 🔐 **Security & Admin:** API key management, masking, admin authentication, and rate limiting.
- 🎨 **Modern Interface:** Custom HTML/CSS with dark/light themes, Markdown rendering, and code syntax highlighting.
- 📦 **Lightweight:** Native C++ backend distributed as a standalone Windows executable.

---

## 🛠️ Technology Stack

### Backend

| Technology | Purpose |
| :--- | :--- |
| **C++17** | Main backend/server logic |
| **MinGW-w64 / MSYS2** | Windows C++ build environment |
| **cpp-httplib** | HTTP server and REST API |
| **nlohmann/json** | JSON parsing and generation |
| **libcurl** | HTTPS communication with Groq |
| **PowerShell** | Internal script execution for DOCX parsing |

### Frontend

| Technology | Purpose |
| :--- | :--- |
| **HTML5 & CSS3** | Web page structure, UI styling, and responsive layout |
| **Vanilla JavaScript** | Frontend logic, DOM manipulation, and API requests |
| **marked.js v14** | Markdown response rendering |
| **highlight.js v11.8.0** | Code syntax highlighting |
| **DOMPurify** | Safe HTML sanitization against XSS |

---

## 📁 Project Structure

```text
ChatBot/
├── .git/                 # Git repository metadata
├── .gitignore            # Git ignore configuration
├── Docs/                 # Project documentation
├── Notice/               # Project notices and related documents
└── Source/
    ├── vendor/           # Local dependencies (marked.js, highlight.js, DOMPurify)
    ├── .env              # Environment config (API Keys, Admin Pass) - Not committed
    ├── run_updated.bat   # Windows run/launch helper script
    ├── chatbot.cpp       # Main C++ backend source code
    ├── chatbot_updated.exe # Compiled Windows executable
    ├── httplib.h         # cpp-httplib single-header library
    ├── json.hpp          # nlohmann/json single-header library
    ├── index.html        # Main frontend interface
    ├── script.js         # Frontend JavaScript logic
    ├── style.css         # Frontend UI stylesheet
    ├── chat_history.json # Local conversation history database
    ├── knowledge.json    # Local Knowledge Base storage
    └── README.md         # This documentation file
```

---

## 🚀 Installation & Setup

### 1. Configure the Environment
To run this project securely, you need to configure your environment variables:
1. Navigate to the `Source` folder.
2. Create a new file and name it exactly `.env` (ensure it does not have a `.txt` extension).
3. Open `.env` in a text editor and add your credentials:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   ADMIN_PASSWORD=your_secure_password
   ```

### 2. Install Build Tools
The project relies on MSYS2 for compilation on Windows.
1. Install [MSYS2](https://www.msys2.org/).
2. Open the **MSYS2 UCRT64** terminal.
3. Install the C++ compiler and cURL libraries:
   ```bash
   pacman -S mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-curl
   ```

---

## 🔨 Build the Project

Open the **MSYS2 UCRT64** terminal, navigate to the `Source` directory, and compile:

```bash
cd "/e/Creative Techno College/Technocrats/Projects/Project List/ChatBot/Source"

g++ -std=c++17 -O2 -I. chatbot.cpp -o chatbot_updated.exe -static-libgcc -static-libstdc++ -lcurl -lws2_32 -lwinpthread
```
*After a successful compilation, `chatbot_updated.exe` will be generated in the same directory.*

---

## ▶️ Run the Application

You can start the compiled backend directly from the terminal:
```bash
./chatbot_updated.exe
```
Alternatively, double-click the included Windows batch launcher (`run_updated.bat`).

Once running, open your web browser and navigate to:
**http://127.0.0.1:8080**

### ⚡ One-Liner (Build & Run)
```bash
cd "/e/Creative Techno College/Technocrats/Projects/Project List/ChatBot/Source" && \
g++ -std=c++17 -O2 -I. chatbot.cpp -o chatbot_updated.exe -static-libgcc -static-libstdc++ -lcurl -lws2_32 -lwinpthread && \
./chatbot_updated.exe
```

---

## 📡 REST API Architecture

The C++ backend exposes REST-style endpoints for secure frontend communication.

| Method | Endpoint                | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/chat`             | Send a user message and obtain an AI/local response |
| `POST` | `/api/file-read`        | Process text, documents (DOCX), and images (Vision) |
| `POST` | `/api/refresh`          | Regenerate a response while retaining original file context |
| `GET`  | `/api/history`          | Retrieve conversation history |
| `POST` | `/api/history/clear`    | Clear all conversation history |
| `GET`  | `/api/history/export`   | Retrieve raw history JSON payload |
| `POST` | `/api/admin/login`      | Authenticate administrator |
| `GET`  | `/api/knowledge`        | Fetch local Knowledge Base entries |
| `POST` | `/api/knowledge/add`    | Add a Q&A entry to the Knowledge Base |
| `POST` | `/api/knowledge/update` | Edit an existing Knowledge Base entry |
| `POST` | `/api/knowledge/delete` | Remove a Knowledge Base entry |

---

## 🔐 Security & Data Management

*   **API Key Safety:** The `.env` file prevents hardcoding credentials. Keys are parsed strictly on the C++ server and never exposed to the client.
*   **XSS Protection:** Frontend content is safely sanitized via DOMPurify before marked.js parses Markdown, mitigating injection attacks.
*   **Rate Limiting:** Administrative endpoints implement memory-based IP lockouts to deter brute-force login attempts.
*   **Local Data:** 
    *   `knowledge.json` acts as an offline Q&A fallback layer, configurable via the admin UI.
    *   `chat_history.json` retains conversational context continuously.

---

## 📊 Project Information

| Category | Details |
| :--- | :--- |
| **Project** | AI Chatbot Assistant |
| **Version** | v1.9.10 |
| **Backend / Server** | C++17, cpp-httplib |
| **Frontend UI** | HTML5, CSS3, Vanilla JS |
| **AI Provider** | Groq API |
| **Data Format** | nlohmann/json |
| **Networking** | libcurl |
| **Target Platform** | Windows 10/11 |

---

## 🔮 Future Scope
- Transition local JSON storage to SQLite for robust data handling.
- Expand support for additional AI providers and localized models.
- Enhance cross-platform support for DOCX/PDF parsing.
- Further refine frontend themes and component modularity.

---

## 👨‍💻 Author

**Asutosh Sahu**  
BCA Student, Creative Techno College

---

## 📄 Purpose & License

This project was built for educational purposes to demonstrate practical integration of **C++ backend development**, **HTTP/REST API design**, **Frontend engineering**, and **AI Multimodal integrations**. 

Please refer to the repository's `Notice/` directory for extended guidelines on student grouping, usage, and project descriptions.

---
> **AI Chatbot Assistant v1.9.10**  
> `C++17 Backend + Vanilla Web Frontend + Groq API + Local Knowledge Base = 🤖 Chatbot`
