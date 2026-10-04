# 🤖 AI Chatbot Assistant

## 📌 Project Overview
AI Chatbot Assistant is a polished, lightweight web application powered by a **C++17 backend server** and a **Vanilla HTML/CSS/JavaScript frontend**.

The application connects to the **Groq API** for AI-powered text and multimodal (vision) responses. It features file-reading capabilities (TXT, DOCX, and Images), conversation context awareness, chat history saving, and a local Knowledge Base fallback.

## ✨ Main Features
- **🤖 Groq API Integration:** Uses `openai/gpt-oss-20b` for text and `qwen/qwen3.8-27b` for vision via the Groq API.
- **📄 Document Reading:** Extracts text from `.txt` and `.docx` files natively on Windows using PowerShell Zip routines.
- **👁️ Vision Support:** Analyzes uploaded images (`.png`, `.jpg`, `.webp`, `.gif`, `.bmp`) natively through Groq Vision.
- **📴 Local Knowledge Base:** Built-in FAQ/Knowledge Base engine that provides fallback answers without internet access.
- **💬 Conversation History:** Automatically saves chats in JSON format (`chat_history.json`).
- **🔄 Response Refresh/Regenerate:** Request a new answer or update an old one while preserving file context in memory.
- **🔐 Admin Dashboard:** Secure login for modifying Knowledge Base entries and exporting history.
- **🎨 Custom UI:** Clean, responsive HTML/CSS interface with markdown rendering and code syntax highlighting.

## 🛠️ Technology & Languages Used
- **Backend:** C++17
- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Build Environment:** MSYS2 / MinGW-w64 (Windows)
- **Scripting:** PowerShell (for DOCX extraction)

## 📚 Libraries & Dependencies
- `cpp-httplib` (`httplib.h`) - HTTP server and REST API
- `nlohmann/json` (`json.hpp`) - JSON parsing and generation
- `libcurl` - HTTPS communication with Groq
- `marked.js` - Markdown rendering in UI
- `highlight.js` - Code syntax highlighting
- `DOMPurify` - HTML sanitization in UI

## 📁 Project Structure
```text
ChatBot/Source/
├── chatbot.cpp           # Main C++ backend source
├── httplib.h             # cpp-httplib HTTP library
├── json.hpp              # nlohmann/json library
├── index.html            # Main frontend page
├── script.js             # Frontend JavaScript
├── style.css             # Frontend stylesheet
├── chat_history.json     # Saved conversation history
├── knowledge.json        # Local Knowledge Base answers
├── .env                  # Environment configuration (API keys, ports)
├── run_updated.bat       # Helper script to launch the app
└── vendor/               # Third-party frontend assets (marked, highlight.js, etc.)
```

## ⚙️ How the Chatbot Works
1. The user opens the web interface in a browser and sends a message (or uploads a file).
2. The frontend sends the request to the local C++ backend via REST API (`/api/chat` or `/api/file-read`).
3. The C++ backend first checks the local **Knowledge Base** and keyword rules. If a match is found (with a high overlap score), it returns the predefined answer immediately.
4. If no local match is found, the backend forwards the prompt (along with extracted file text, base64 images, and previous conversation context) to the **Groq API**.
5. The AI response is received, saved to `chat_history.json`, and returned to the frontend.
6. The frontend renders the Markdown response securely.

## 🚀 Setup & MSYS2 Installation Requirements
To compile this project on Windows, you must use **MSYS2**:
1. Download and install [MSYS2](https://www.msys2.org/).
2. Open the **MSYS2 UCRT64** terminal.
3. Install the required toolchain and libraries by running:
```bash
pacman -S mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-curl
```

## 🔑 Configuration / API Key Instructions
Create or edit the `.env` file in the `Source/` folder to add your Groq API key:
```env
GROQ_API_KEY=gsk_your_api_key_here
ADMIN_PASSWORD=admin
PORT=8080
```
> **Warning:** Never commit your real API key to version control.

## 🔨 Compilation Command
In the MSYS2 UCRT64 terminal, navigate to the `Source` folder and compile the backend:
```bash
g++ -std=c++17 -O2 -I. chatbot.cpp -o chatbot_updated.exe -static-libgcc -static-libstdc++ -lcurl -lws2_32 -lwinpthread
```

## ▶️ Run Command
Once compiled, you can run the executable from the terminal:
```bash
./chatbot_updated.exe
```

## ⚡ Complete Build-and-Run Command
You can compile and run the project in a single command. Open the **MSYS2 UCRT64 terminal** and run exactly:

```bash
cd "/e/Creative Techno College/Technocrats/Projects/Project List/ChatBot/Source" && \
g++ -std=c++17 -O2 -I. chatbot.cpp -o chatbot_updated.exe \
    -static-libgcc -static-libstdc++ -lcurl -lws2_32 -lwinpthread && \
./chatbot_updated.exe
```
After it starts, open `http://127.0.0.1:8080` in your web browser.

## 📖 Usage Instructions
- **Normal Chat:** Type your question and press Enter. The bot will use conversation context to answer.
- **Upload File:** Click the attachment icon to upload `.txt`, `.docx`, or supported image files.
- **Refresh Response:** Click the refresh icon under a bot's message to regenerate the answer.
- **Knowledge Base:** Click "Knowledge Base" in the sidebar, enter the admin password (default: `admin`), and add custom FAQ entries.
- **Export History:** In the sidebar, select old conversations and click "Export as TXT" to download them.

## ⚠️ Important Notes
- DOCX extraction relies on a local PowerShell script invoked by the C++ backend. It works only on Windows environments.
- The C++ backend holds uploaded image data in memory temporarily for "Refresh" requests. Large or numerous images might increase RAM usage.

## 🐛 Troubleshooting & Common Errors
- **`curl/curl.h: No such file or directory`**: You forgot to install libcurl in MSYS2. Run `pacman -S mingw-w64-ucrt-x86_64-curl`.
- **`GROQ_API_KEY environment variable is not set`**: Ensure `.env` is in the same directory as `chatbot_updated.exe` and contains your API key.
- **Cannot bind to port 8080**: Another program is using port 8080. Open `.env`, change `PORT=8081`, and restart the app.
- **DOCX Extraction Fails**: Ensure you are running on Windows and PowerShell is accessible from your system PATH.

## 🚧 Current Limitations
- External AI requires a stable internet connection.
- Max file size for uploads is hardcoded to 15MB.
- DOCX reading is Windows-only.

## 🔮 Future Improvements
- Add native DOCX/PDF parsing via C++ libraries instead of relying on PowerShell.
- Allow swapping AI models dynamically from the frontend UI.
- Implement database support (e.g., SQLite) for history instead of flat JSON files.
