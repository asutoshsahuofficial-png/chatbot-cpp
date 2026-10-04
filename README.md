# 🤖 AI Chatbot Assistant — Version 5.9.1

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

# ✨ Features

- 🤖 AI-powered chatbot
- ⚡ Groq API integration (`openai/gpt-oss-20b`)
- 👁️ AI multimodal/vision response support (`qwen/qwen3.8-27b`)
- 📄 Document text extraction (TXT, DOCX) via native Windows PowerShell
- 📴 Local Knowledge Base fallback
- 💬 Conversation history (stored in JSON)
- 🔄 Response Refresh/Regenerate with memory preservation
- 🔑 API key management
- 🛡️ API key masking
- 🔐 Administrative authentication
- 🚦 Administrative rate limiting
- 🌐 Local HTTP/REST backend
- 🎨 Custom HTML/CSS interface
- 🌓 Theme support
- 📝 Markdown response rendering
- 💻 Code syntax highlighting
- 📱 Responsive frontend layout
- 📦 Lightweight C++ backend
- 🪟 Windows executable support

---

# 🛠️ Technology Stack

## Backend

| Technology | Purpose |
|---|---|
| **C++17** | Main backend/server language |
| **MinGW-w64 / MSYS2** | Windows C++ build environment |
| **cpp-httplib** | HTTP server and REST API |
| **nlohmann/json** | JSON parsing and generation |
| **libcurl** | HTTPS communication with Groq |
| **PowerShell** | Internal script execution for DOCX parsing |

## Frontend

| Technology | Purpose |
|---|---|
| **HTML5** | Web page structure |
| **CSS3** | UI styling and responsive layout |
| **Vanilla JavaScript** | Frontend logic and API requests |
| **marked.js v14** | Markdown rendering |
| **highlight.js v11.8.0** | Code syntax highlighting |
| **DOMPurify** | Safe HTML sanitization |

---

# 📁 Latest Project Structure

```text
ChatBot/
│
├── .git/
│   └── Git repository metadata
│
├── .gitignore
│   └── Git ignore configuration
│
├── Docs/
│   └── Project documentation
│
├── Notice/
│   └── Project notices and related documents
│
└── Source/
    │
    ├── vendor/
    │   └── Third-party/local dependencies (marked, highlight.js)
    │
    ├── .env
    │   └── Environment configuration (API Keys, Port)
    │
    ├── run_updated.bat
    │   └── Run/launch helper script
    │
    ├── chatbot.cpp
    │   └── Main C++ backend source
    │
    ├── chatbot_updated.exe
    │   └── Compiled Windows executable
    │
    ├── httplib.h
    │   └── cpp-httplib HTTP library
    │
    ├── json.hpp
    │   └── nlohmann/json library
    │
    ├── index.html
    │   └── Main frontend page
    │
    ├── script.js
    │   └── Frontend JavaScript
    │
    ├── style.css
    │   └── Frontend stylesheet
    │
    ├── chat_history.json
    │   └── Local conversation history database
    │
    ├── knowledge.json
    │   └── Local Knowledge Base
    │
    └── README.md
        └── Project documentation
```

> `.git/` is Git's internal repository directory and is normally not shown as application source code.

---

# 🗂️ Important Files

### `chatbot.cpp`
Main C++ backend source file. It contains the server/application logic, file processing, and API handling.

### `index.html`
Main web interface loaded by the browser.

### `style.css`
Contains the visual styling and responsive frontend layout.

### `script.js`
Handles frontend interactions, DOM operations, and communication with the C++ backend.

### `knowledge.json`
Local Knowledge Base used by the application's offline/fallback functionality.

### `chat_history.json`
Local conversation history data containing previous context, answers, and references.

### `.env`
Environment configuration file specifying port, admin password, and API Keys.
**Never put real API keys, passwords, or private tokens into a public repository.**

### `httplib.h` & `json.hpp`
Single-header libraries used by the C++ backend for HTTP server endpoints and JSON processing.

### `run_updated.bat`
Windows batch script intended to simplify starting the application.

---

# 📡 REST API

The C++ backend exposes REST-style endpoints for communication with the frontend.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/chat` | Sends a user message and obtains an AI/local response |
| `POST` | `/api/file-read` | Processes text, documents (DOCX), and images (Vision) |
| `POST` | `/api/refresh` | Regenerates a previous response with original file context |
| `GET`  | `/api/history` | Retrieves conversation history |
| `POST` | `/api/history/clear` | Clears all conversation history |
| `GET`  | `/api/history/export`| Retrieves raw history payload |
| `POST` | `/api/admin/login` | Handles administrator authentication |
| `GET`  | `/api/knowledge` | Fetches local Knowledge Base entries |
| `POST` | `/api/knowledge/add` | Adds a Q&A entry to the Knowledge Base |
| `POST` | `/api/knowledge/update` | Edits an existing Knowledge Base entry |
| `POST` | `/api/knowledge/delete` | Removes a Knowledge Base entry |

---

# 🔐 Security

The project includes several security-oriented mechanisms.

## API Key Safety
Do not commit real credentials. For public repositories, use placeholder/demo values in `.env` or provide a separate `.env.example` file. Your `.env` key is handled exclusively server-side in the backend process.

## XSS Protection
Frontend content is processed through DOMPurify and strict escaping logic before being rendered via marked.js to mitigate Cross-Site Scripting (XSS) risks.

## Administrative Rate Limiting
Administrative endpoints use memory-based IP lockouts/rate limiting to help protect against repeated unauthorized requests.

---

# ⚙️ Requirements

## Operating System
- Windows (Required for native DOCX parsing)

## Development Environment
- MSYS2
- MSYS2 UCRT64
- MinGW-w64
- GCC (C++17)

## Required Libraries
- cpp-httplib
- nlohmann/json
- libcurl

## Browser
Any modern browser such as:
- Google Chrome
- Microsoft Edge
- Mozilla Firefox

---

# 🚀 Installation & Setup

## 1. Install MSYS2
Install [MSYS2](https://www.msys2.org/) and open:
```text
MSYS2 UCRT64
```

Install the C++ compiler and cURL:
```bash
pacman -S mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-curl
```

---

# 🔨 Build the Project

You can compile the backend natively via MSYS2. Open the **MSYS2 UCRT64** terminal and navigate to the `Source` directory:

```bash
cd "/e/Creative Techno College/Technocrats/Projects/Project List/ChatBot/Source"
```

Compile the backend executable with the required libraries:

```bash
g++ -std=c++17 -O2 -I. chatbot.cpp -o chatbot_updated.exe -static-libgcc -static-libstdc++ -lcurl -lws2_32 -lwinpthread
```

After a successful compilation, `chatbot_updated.exe` will be generated.

---

# ▶️ Run the Application

You can start the compiled backend using:
```bash
./chatbot_updated.exe
```

Or use the included Windows batch launcher:
```text
run_updated.bat
```

Then open `http://127.0.0.1:8080` in a web browser.

---

# ⚡ Complete Build-and-Run Command

You can compile and run the project in a single command. Open the **MSYS2 UCRT64 terminal** and run exactly:

```bash
cd "/e/Creative Techno College/Technocrats/Projects/Project List/ChatBot/Source" && \
g++ -std=c++17 -O2 -I. chatbot.cpp -o chatbot_updated.exe \
    -static-libgcc -static-libstdc++ -lcurl -lws2_32 -lwinpthread && \
./chatbot_updated.exe
```

---

# 🌐 Application Architecture

```text
                    ┌─────────────────┐
                    │      User       │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   index.html    │
                    │   CSS + JS UI   │
                    └────────┬────────┘
                             │
                         HTTP/REST
                             │
                             ▼
                    ┌─────────────────┐
                    │   chatbot.cpp   │
                    │    C++17 API    │
                    └────────┬────────┘
                             │
                 ┌───────────┴───────────┐
                 │                       │
                 ▼                       ▼
          ┌─────────────┐        ┌────────────────┐
          │  Groq API   │        │ knowledge.json │
          │ AI Service  │        │ Local Fallback │
          └──────┬──────┘        └───────┬────────┘
                 │                       │
                 └───────────┬───────────┘
                             ▼
                    ┌─────────────────┐
                    │  Chat Response  │
                    └─────────────────┘
```

---

# 🧠 Local Knowledge Base

The project includes:
```text
Source/knowledge.json
```
This file provides locally stored knowledge/Q&A data that can support fallback responses when the external AI service is unavailable.

The administrator API can also be used to add, edit, or delete Knowledge Base entries from the web interface.

---

# 💬 Conversation History

Conversation history is stored locally in JSON format to preserve context, metadata, and references:
```text
Source/chat_history.json
```
The backend manages history automatically and uses it to understand conversational context. The UI allows you to export this history as TXT files.

---

# 📊 Project Information

| Item | Details |
|---|---|
| **Project** | AI Chatbot Assistant |
| **Version** | 4.0.0 |
| **Backend** | C++17 |
| **Frontend** | HTML5 / CSS3 / Vanilla JavaScript |
| **AI Provider** | Groq API |
| **HTTP Server** | cpp-httplib |
| **JSON Library** | nlohmann/json |
| **Networking** | libcurl |
| **Platform** | Windows |
| **Architecture** | Local Web Application + C++ Backend |

---

# 🔮 Future Improvements

Potential improvements include:
- Improved local Knowledge Base
- Additional AI provider support
- Better conversation management
- Enhanced authentication
- Database support (e.g. SQLite)
- Cross-platform support for DOCX/file processing
- Additional AI capabilities
- Improved configuration management
- Performance improvements
- More frontend customization

---

# 👨‍💻 Author

**Asutosh Sahu**

BCA Student  
Creative Techno College

---

# 🎓 Project Purpose

This project demonstrates practical development concepts including:
- C++17 programming
- HTTP server development
- REST API design
- JSON processing
- API integration
- Frontend web development
- JavaScript and DOM manipulation
- Local data management
- AI API integration (Text and Multimodal Vision)
- Offline/fallback application design
- Windows application compilation
- Basic application security

---

# 📄 License

This project is developed for educational and project purposes.

Please refer to the repository's documentation and notices for applicable usage and licensing information.

---

# ⭐ Summary

**AI Chatbot Assistant v4.0.0** combines a C++17 backend with a Vanilla HTML/CSS/JavaScript frontend to provide a locally hosted AI chatbot.

The application uses the Groq API for AI-powered responses and includes file/document processing, vision features, a local Knowledge Base fallback, JSON conversation history, administrative endpoints, and a simple Windows executable workflow.

```text
C++17 Backend
      +
Vanilla Web Frontend
      +
Groq API
      +
Local Knowledge Base
      =
AI Chatbot Assistant
```
