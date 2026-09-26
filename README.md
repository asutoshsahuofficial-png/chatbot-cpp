# 🤖 AI Chatbot Assistant — Version 3.8.9

A polished, lightweight AI Chatbot built with a **C++17 backend server** and a **Vanilla HTML/CSS/JavaScript frontend**.

The application connects to the **Groq API** for AI-powered text and vision responses and provides a local Knowledge Base fallback when the external API is unavailable.

---

## 📌 Project Overview

AI Chatbot Assistant is a locally hosted chatbot application designed to run on a Windows computer.

### How it works

1. The user interacts with the web interface.
2. The frontend sends requests to the local C++ backend.
3. The C++ backend processes the request.
4. When available, the backend communicates with the Groq API.
5. The AI response is returned to the frontend.
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
- ⚡ Groq API integration
- 👁️ AI text and vision response support
- 📴 Local Knowledge Base fallback
- 💬 Conversation history
- 📌 Saved/pinned AI answers
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

## Frontend

| Technology | Purpose |
|---|---|
| **HTML5** | Web page structure |
| **CSS3** | UI styling and responsive layout |
| **Vanilla JavaScript** | Frontend logic and API requests |
| **marked.js v14** | Markdown rendering |
| **highlight.js v11.8.0** | Code syntax highlighting |

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
    │   └── Third-party/local dependencies
    │
    ├── .env
    │   └── Demo environment configuration
    │
    ├── build_updated.bat
    │   └── Build/compile helper script
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
    │   └── Local conversation history
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

Main C++ backend source file. It contains the server/application logic and API handling.

### `index.html`

Main web interface loaded by the browser.

### `style.css`

Contains the visual styling and responsive frontend layout.

### `script.js`

Handles frontend interactions, DOM operations, and communication with the C++ backend.

### `knowledge.json`

Local Knowledge Base used by the application's offline/fallback functionality.

### `chat_history.json`

Local conversation history data.

### `.env`

Environment configuration file.

**The repository `.env` is intended for demo/placeholder configuration only. Never put real API keys, passwords, or private tokens into a public repository.**

### `httplib.h`

Single-header HTTP server/library used by the C++ backend.

### `json.hpp`

Single-header JSON library used for JSON processing.

### `build_updated.bat`

Windows batch script intended to simplify the build process.

### `run_updated.bat`

Windows batch script intended to simplify starting the application.

---

# 📡 REST API

The C++ backend exposes REST-style endpoints for communication with the frontend.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/chat` | Sends a user message and obtains an AI/local response |
| `GET` | `/api/history` | Retrieves conversation history |
| `DELETE` | `/api/history` | Deletes conversation history |
| `POST` | `/api/saved` | Saves/pins an AI answer |
| `GET` | `/api/apikey` | Retrieves a masked API-key representation |
| `POST` | `/api/apikey` | Stores an API key locally |
| `POST` | `/api/admin/login` | Handles administrator authentication |
| `POST` | `/api/knowledge/add` | Adds a Q&A entry to the Knowledge Base |

---

# 🔐 Security

The project includes several security-oriented mechanisms.

## API Key Masking

API-key information returned to the frontend is masked rather than exposing the complete key.

Example:

```text
gsk_********************
```

## XSS Protection

Frontend content is processed through escaping/sanitization logic before being rendered.

This is intended to reduce Cross-Site Scripting (XSS) risks.

## Administrative Rate Limiting

Administrative endpoints use memory-based IP lockouts/rate limiting to help protect against repeated unauthorized requests.

## Environment File Safety

Do not commit real credentials.

For public repositories, use placeholder/demo values in `.env` or provide a separate `.env.example` file.

---

# ⚙️ Requirements

## Operating System

- Windows

## Development Environment

- MSYS2
- MSYS2 UCRT64
- MinGW-w64
- GCC
- C++17

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

Install MSYS2 and open:

```text
MSYS2 UCRT64
```

Install the C++ compiler:

```bash
pacman -S mingw-w64-ucrt-x86_64-gcc
```

Install cURL:

```bash
pacman -S mingw-w64-ucrt-x86_64-curl
```

---

# 🔨 Build the Project

Navigate to the `Source` directory.

For the project location used during development:

```bash
cd "e:/Creative Techno College/Technocrats/Projects/Project List/ChatBot/Source"
```

Compile the backend:

```bash
g++ -std=c++17 -O2 -I. chatbot.cpp -o chatbot.exe -static-libgcc -static-libstdc++ -lcurl -lws2_32 -lwinpthread
```

After a successful compilation, the executable will be generated.

---

# ▶️ Run the Application

You can start the compiled backend using:

```bash
./chatbot.exe
```

Or use the included Windows batch launcher:

```text
run_updated.bat
```

Then open:

```text
http://127.0.0.1:8080
```

in a web browser.

---

# 🏗️ Build Script

The project also includes:

```text
Source/build_updated.bat
```

This can be used as the project's Windows build helper.

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

The administrator API can also be used to add Knowledge Base entries:

```text
POST /api/knowledge/add
```

---

# 💬 Conversation History

Conversation history is stored locally in:

```text
Source/chat_history.json
```

The backend exposes:

```text
GET    /api/history
DELETE /api/history
```

for history management.

---

# 🔑 API Configuration

The application uses the Groq API for AI functionality.

The project contains:

```text
Source/.env
```

This repository version is intended to contain **demo/placeholder configuration only**.

### Never publish:

```text
Real API keys
Passwords
Access tokens
Private credentials
```

If you use a real API key locally, keep it out of Git and GitHub.

---

# 🧪 Development

Main backend:

```text
Source/chatbot.cpp
```

Frontend:

```text
Source/index.html
Source/style.css
Source/script.js
```

Libraries:

```text
Source/httplib.h
Source/json.hpp
```

Data:

```text
Source/chat_history.json
Source/knowledge.json
```

Scripts:

```text
Source/build_updated.bat
Source/run_updated.bat
```

---

# 📊 Project Information

| Item | Details |
|---|---|
| **Project** | AI Chatbot Assistant |
| **Version** | 3.8.9 |
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
- Database support
- Cross-platform support
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
- AI API integration
- Offline/fallback application design
- Windows application compilation
- Basic application security

---

# 📄 License

This project is developed for educational and project purposes.

Please refer to the repository's documentation and notices for applicable usage and licensing information.

---

# ⭐ Summary

**AI Chatbot Assistant v3.8.9** combines a C++17 backend with a Vanilla HTML/CSS/JavaScript frontend to provide a locally hosted AI chatbot.

The application uses the Groq API for AI-powered responses and includes a local Knowledge Base fallback, conversation history, API management, administrative endpoints, and a Windows executable workflow.

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
