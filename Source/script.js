"use strict";

/* ============================================================
   ELEMENTS
============================================================ */

const input = document.getElementById("promptInput");
const form = document.getElementById("promptForm");
const chat = document.getElementById("chat");
const navItems = document.querySelectorAll(".nav-item");
const sections = document.querySelectorAll(".content-section");
const exitBtn = document.getElementById("exitBtn");
const historyList = document.getElementById("historyList");



const clearHistoryButton = document.getElementById("clearHistoryButton");
const clearSavedAnswersBtn = document.getElementById("clearSavedAnswersBtn");
const currentTimeElement = document.getElementById("currentTime");
const newChatButton = document.querySelector('[data-section="chat-section"]');

/* ============================================================
   STATE
============================================================ */

let requestInProgress = false;
let activeRequestController = null;
let lastFailedPrompt = "";
let requestSequence = 0;
let activeConversationId = null;
let backendHistorySessions = [];
let adminUnlocked = false;



/* ============================================================
   STORAGE
============================================================ */

function getStorageItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn("Storage read failed:", error);
    return null;
  }
}

function setStorageItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn("Storage write failed:", error);
    return false;
  }
}

function removeStorageItem(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn("Storage remove failed:", error);
  }
}

/* ============================================================
   HTML SANITIZER (for localStorage data)
============================================================ */

function sanitizeStoredHtml(html) {
  if (!html || typeof html !== "string") {
    return "";
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const dangerous = doc.querySelectorAll(
      "script, iframe, object, embed, form, style, link, meta, base, img.user-image-preview",
    );
    dangerous.forEach(function (el) {
      el.remove();
    });

    const allElements = doc.body.querySelectorAll("*");
    allElements.forEach(function (el) {
      const attrs = Array.from(el.attributes);
      attrs.forEach(function (attr) {
        if (
          attr.name.toLowerCase().startsWith("on") ||
          (typeof attr.value === "string" &&
            attr.value.trim().toLowerCase().startsWith("javascript:"))
        ) {
          el.removeAttribute(attr.name);
        }
      });
    });

    return doc.body.innerHTML;
  } catch (error) {
    console.warn("HTML sanitization failed:", error);
    return "";
  }
}

/* ============================================================
   SETTINGS
============================================================ */

function saveSettings() { setStorageItem("chatbotSettings", JSON.stringify({ darkMode: document.body.classList.contains("dark-mode") })); }

/* ============================================================
   HTML ESCAPING
============================================================ */

const _escapeHtmlMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (char) {
    return _escapeHtmlMap[char];
  });
}

function showSectionSkeleton(section) {
  const existing = section.querySelector(".skeleton-loader");
  if (existing) return;
  const skeleton = document.createElement("div");
  skeleton.className = "skeleton-loader";
  skeleton.innerHTML = `
    <div class="skeleton-line skeleton-line-long"></div>
    <div class="skeleton-line skeleton-line-medium"></div>
    <div class="skeleton-line skeleton-line-short"></div>
    <div class="skeleton-line skeleton-line-long"></div>
  `;
  section.prepend(skeleton);
  setTimeout(function () {
    skeleton.remove();
  }, 600);
}

/* ============================================================
   TIME
============================================================ */

function getCurrentTime() {
  try {
    const userTimezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: userTimezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());
  } catch (error) {
    return new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
}

function getCurrentDateTime() {
  try {
    const userTimezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
    return new Date().toLocaleString("en-IN", {
      timeZone: userTimezone,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch (_) {
    return new Date().toLocaleString();
  }
}

function updateHeaderTime() {
  if (!currentTimeElement) {
    return;
  }

  currentTimeElement.textContent = getCurrentDateTime();
}

updateHeaderTime();

setInterval(updateHeaderTime, 30000);

/* ============================================================
   TIMESTAMP DISPLAY
============================================================ */

function updateTimestampVisibility() {}/* ============================================================
   SOUND
============================================================ */

let audioContext = null;

function playNotificationSound() {}

/* ============================================================
   API CONNECTION STATUS
============================================================ */

const apiStatusText = document.querySelector(".identity-text p");

function updateApiStatus(state) {
  if (!apiStatusText) {
    return;
  }

  let dot = apiStatusText.querySelector(".online-dot");

  if (!dot) {
    dot = document.createElement("span");

    dot.className = "online-dot";

    apiStatusText.prepend(dot);
  }

  dot.classList.remove("online", "offline", "checking");

  const existingText = Array.from(apiStatusText.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
  );

  if (existingText) {
    existingText.remove();
  }

  if (state === "online") {
    dot.classList.add("online");

    apiStatusText.append("Online · Powered by Groq AI");

    return;
  }

  if (state === "offline") {
    dot.classList.add("offline");

    apiStatusText.append("Offline · Groq AI unavailable");

    return;
  }

  dot.classList.add("checking");

  apiStatusText.append("Checking connection…");
}

function markApiOnline() {
  updateApiStatus("online");
}

function markApiOffline() {
  updateApiStatus("offline");
}

function markApiChecking() {
  updateApiStatus("checking");
}

/* ============================================================
   CHAT HELPERS
============================================================ */

function removeLoadingMessages() {
  if (!chat) {
    return;
  }

  chat.querySelectorAll(".loading-message, .typing-indicator").forEach(function (element) {
    element.remove();
  });
}


function restoreChatWelcomeState() {
  if (!chat) return;
  if (chat.querySelector(".message-row")) return;
  chat.innerHTML = `
    <div class="message-row assistant-row">
      <div class="assistant-avatar"><i data-lucide="bot"></i></div>
      <div class="bubble assistant-bubble">
        <div class="assistant-content">Hello! 👋<br><br>I'm your chatbot assistant. How can I help you today?</div>
        <div class="message-meta timestamp"><span>${escapeHtml(getCurrentTime())}</span></div>
      </div>
    </div>
  `;
}

/* ============================================================
   CHAT RESPONSE FORMATTER
   Render Groq/Markdown-style answers as clean chatbot content.
============================================================ */

function formatAssistantText(value) {
  const source = String(value || "").trim();
  if (!source) return "";

  try {
    // If marked is loaded, use it. Otherwise fallback to simple escaping.
    if (typeof marked !== "undefined") {
      if (typeof marked.parse === "function") {
        return DOMPurify.sanitize(marked.parse(source, { breaks: true }));
      } else {
        return DOMPurify.sanitize(marked(source, { breaks: true }));
      }
    } else {
      return `<p style="color:red;">Error: marked is undefined!</p><p>${escapeHtml(source).replace(/\n/g, "<br>")}</p>`;
    }
  } catch (e) {
    console.warn("Marked parsing failed", e);
    return `<p style="color:red;">Error parsing markdown: ${escapeHtml(e.message)}</p><p>${escapeHtml(source).replace(/\n/g, "<br>")}</p>`;
  }

  // Fallback
  return `<p>${escapeHtml(source).replace(/\n/g, "<br>")}</p>`;
}

function refreshAssistantFormatting(root = document) {
  root
    .querySelectorAll(".assistant-row .assistant-bubble > p")
    .forEach((paragraph) => {
      if (paragraph.dataset.formatted === "true") {
        return;
      }

      const text = paragraph.textContent || "";
      paragraph.classList.add("assistant-content");
      paragraph.innerHTML = formatAssistantText(text);
      paragraph.dataset.formatted = "true";
    });
}


/* ============================================================
   USER MESSAGE
============================================================ */

function addUserMessage(text) {
  if (!chat) {
    return null;
  }

  const cleanText = String(text).trim();

  if (!cleanText) {
    return null;
  }

  chat.querySelectorAll(".welcome-state").forEach(function (element) {
    element.remove();
  });

  const row = document.createElement("div");
  row.className = "message-row user-row";

  row.innerHTML = `
    <div class="bubble user-bubble">
      ${escapeHtml(cleanText).replace(/\n/g, "<br>")}
      <div class="message-meta timestamp"><span>${escapeHtml(getCurrentTime())}</span></div>
    </div>
    <div class="user-avatar"><i data-lucide="user"></i></div>`;

  chat.appendChild(row);
  updateTimestampVisibility();
  chat.scrollTop = chat.scrollHeight;
  if (typeof saveChatData === "function") saveChatData();
  return row;
}

/* ============================================================
   ASSISTANT MESSAGE
============================================================ */

function addAssistantMessage(text, question = "", entryId = "", source = "") {
  if (!chat) {
    return null;
  }

  const cleanText = String(text).trim();

  if (!cleanText) {
    return null;
  }

  const row = document.createElement("div");

  row.className = "message-row assistant-row";
  if (entryId) row.dataset.entryId = entryId;
  if (question) row.dataset.question = question;

  let sourceBadge = "";
  if (source === "knowledge_file") {
    sourceBadge = `<span class="source-badge badge-knowledge">📚 Knowledge Base</span>`;
  } else if (source === "keyword_rule") {
    sourceBadge = `<span class="source-badge badge-keyword">⚡ Keyword Rule</span>`;
  } else if (source === "groq_ai") {
    sourceBadge = `<span class="source-badge badge-groq">🧠 Groq AI</span>`;
  }

  row.innerHTML = `
    <div class="assistant-avatar"><i data-lucide="bot"></i></div>
    <div class="bubble assistant-bubble">
      <div class="assistant-content">${formatAssistantText(cleanText)}</div>
      <div class="message-meta timestamp">${sourceBadge}<span>${escapeHtml(getCurrentTime())}</span></div>
      <div class="reaction-actions">
        <button class="copy-btn" title="Copy"><i data-lucide="copy" style="width: 16px; height: 16px;"></i></button>
        
      </div>
    </div>`;

  const wasNearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 150;

  chat.appendChild(row);

  if (typeof hljs !== "undefined") {
    row.querySelectorAll("pre code").forEach((block) => {
      hljs.highlightElement(block);
    });
  }

  updateTimestampVisibility();

  if (wasNearBottom) {
    // Position the chat at the start/top of the new response
    // If the message is short, the browser caps the scroll naturally.
    chat.scrollTop = row.offsetTop - 24;
  }

  playNotificationSound();

  saveChatData();

  return row;
}

/* ============================================================
   FRIENDLY CONNECTION ERROR
============================================================ */

function addErrorMessage(prompt, errorMsg) {
  if (!chat) {
    return null;
  }

  const msg = errorMsg || "Sorry, I couldn't connect to the AI server. Please try again.";
  lastFailedPrompt = String(prompt || "").trim();

  chat
    .querySelectorAll(".connection-error-message")
    .forEach(function (element) {
      element.remove();
    });

  removeLoadingMessages();

  const row = document.createElement("div");

  row.className = "message-row assistant-row connection-error-message";

  row.innerHTML = `
    <div class="assistant-avatar"><i data-lucide="bot"></i></div>
    <div class="bubble assistant-bubble">
      <div class="assistant-content">
        <strong>Error</strong><br>
        ${escapeHtml(msg)}
      </div>
      <div class="message-meta timestamp"><span>${escapeHtml(getCurrentTime())}</span></div>
    </div>`;

  const wasNearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 150;

  chat.appendChild(row);
  updateTimestampVisibility();
  
  if (wasNearBottom) {
    chat.scrollTop = row.offsetTop - 24;
  }
  if (typeof saveChatData === "function") saveChatData();
  return row;
}
/* ============================================================
   CHAT STORAGE
============================================================ */

function saveChatData() {
  if (!chat) {
    return;
  }

  setStorageItem("chatData", chat.innerHTML);

  if (chat.querySelector(".user-bubble")) {
    updateHistory();
  }
}

function loadChatData() {
  if (!chat) {
    return;
  }

  const saved = getStorageItem("chatData");

  if (saved) {
    try {
      chat.innerHTML = sanitizeStoredHtml(saved);
    } catch (error) {
      console.warn("Could not restore chat.");

      chat.innerHTML = "";

      restoreChatWelcomeState();
    }
  }

  refreshAssistantFormatting(chat);

  updateTimestampVisibility();

  const storedConversationId = getStorageItem("activeConversationId");

  if (storedConversationId) {
    activeConversationId = storedConversationId;
  }

  if (!activeConversationId && chat.querySelector(".user-bubble")) {
    const history = readHistory();

    const latest = history[0];

    if (latest && latest.html) {
      activeConversationId = latest.id || null;
    }
  }
}

/* ============================================================
   HISTORY
============================================================ */

function generateChatTitle(text) {
  const clean = String(text).trim();

  if (!clean) {
    return "New Conversation";
  }

  const words = clean.split(/\s+/);

  if (words.length <= 5) {
    return clean;
  }

  return words.slice(0, 5).join(" ") + "...";
}

function readHistory() {
  try {
    const raw = getStorageItem("chatHistory");

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    let changed = false;

    const normalized = parsed
      .filter(function (item) {
        return (
          item && typeof item === "object" && typeof item.message === "string"
        );
      })
      .map(function (item) {
        const record = {
          ...item,
        };

        if (!record.id) {
          record.id =
            "legacy-" +
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2, 9);

          changed = true;
        }

        return record;
      });

    if (changed) {
      setStorageItem("chatHistory", JSON.stringify(normalized.slice(0, 20)));
    }

    return normalized.slice(0, 20);
  } catch (error) {
    console.warn("History read failed:", error);

    return [];
  }
}

function createConversationId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return (
    "chat-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

function getCleanBubbleText(bubble) {
  if (!bubble) {
    return "";
  }

  const clone = bubble.cloneNode(true);

  clone
    .querySelectorAll(
      ".message-meta, .user-edit-row, .message-actions, button, time",
    )
    .forEach(function (element) {
      element.remove();
    });

  return clone.textContent.replace(/\s+/g, " ").trim();
}

function updateHistory() {
  if (!chat) {
    return;
  }

  const bubbles = chat.querySelectorAll(".user-bubble");

  if (!bubbles.length) {
    renderHistory();

    return;
  }

  const firstMessage = getCleanBubbleText(bubbles[0]);

  const latestMessage = getCleanBubbleText(bubbles[bubbles.length - 1]);

  if (!firstMessage) {
    renderHistory();

    return;
  }

  let history = readHistory();

  if (!activeConversationId) {
    activeConversationId = createConversationId();
  }

  setStorageItem("activeConversationId", activeConversationId);

  const record = {
    id: activeConversationId,

    title: generateChatTitle(firstMessage),

    message: firstMessage,

    preview: latestMessage || firstMessage,

    date: getCurrentDateTime(),

    html: chat.innerHTML,
  };

  const existingIndex = history.findIndex(function (item) {
    return item && item.id === activeConversationId;
  });

  if (existingIndex === -1) {
    history.unshift(record);
  } else {
    history[existingIndex] = {
      ...history[existingIndex],
      ...record,
    };

    const [updated] = history.splice(existingIndex, 1);

    history.unshift(updated);
  }

  history = history.slice(0, 20);

  setStorageItem("chatHistory", JSON.stringify(history));

  renderHistory();
}

function deleteHistoryConversation(id) {
  if (!id) {
    return;
  }

  const history = readHistory().filter(function (item) {
    return item && String(item.id) !== String(id);
  });
  setStorageItem("chatHistory", JSON.stringify(history));

  backendHistorySessions = backendHistorySessions.filter(function (session) {
    return session && String(session.id) !== String(id);
  });

  if (String(activeConversationId) === String(id)) {
    activeConversationId = null;
    removeStorageItem("activeConversationId");
  }

  const loadBtn = document.getElementById("historyPreviewLoadBtn");
  if (loadBtn && String(loadBtn.dataset.historyId) === String(id)) {
    clearPreviewPane();
  }

  renderHistory();
}

function confirmClearHistoryUI() {
  const history = mergedHistoryItems();

  if (!history.length) {
    alert("No conversation history is currently present.");
    return;
  }

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:100000;backdrop-filter:blur(2px);";
  
  const box = document.createElement("div");
  box.style.cssText = "background:var(--surface,#fff);padding:24px;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.2);text-align:center;width:90%;max-width:320px;border:1px solid var(--border,#e2e8f0);animation:fadeIn 0.2s ease-out;";
  
  const title = document.createElement("h3");
  title.innerText = "Are you sure you want to clear all conversation history?";
  title.style.cssText = "margin:0 0 16px 0;font-size:16px;color:var(--text,#172033);font-weight:700;line-height:1.4;";
  
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:12px;justify-content:center;";
  
  const cancelBtn = document.createElement("button");
  cancelBtn.innerText = "Cancel";
  cancelBtn.style.cssText = "padding:10px 16px;border-radius:8px;border:none;background:var(--bg,#f1f5f9);color:var(--text,#172033);font-weight:600;cursor:pointer;flex:1;transition:background 0.2s;";
  cancelBtn.onmouseover = () => cancelBtn.style.background = "var(--surface-hover)";
  cancelBtn.onmouseout = () => cancelBtn.style.background = "var(--bg,#f1f5f9)";
  
  const confirmBtn = document.createElement("button");
  confirmBtn.innerText = "Clear All";
  confirmBtn.style.cssText = "padding:10px 16px;border-radius:8px;border:none;background:var(--danger);color:#fff;font-weight:600;cursor:pointer;flex:1;transition:background 0.2s;";
  confirmBtn.onmouseover = () => confirmBtn.style.background = "var(--danger-dark)";
  confirmBtn.onmouseout = () => confirmBtn.style.background = "var(--danger)";
  
  cancelBtn.onclick = () => document.body.removeChild(overlay);
  confirmBtn.onclick = () => {
    document.body.removeChild(overlay);
    executeClearAllHistory();
  };
  
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(confirmBtn);
  
  box.appendChild(title);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function executeClearAllHistory() {
  removeStorageItem("chatHistory");
  backendHistorySessions = [];
  activeConversationId = null;
  removeStorageItem("activeConversationId");
  removeStorageItem("chatData");
  
  clearPreviewPane();

  if (chat) {
    chat.innerHTML = `
      <div class="message-row assistant-row">
        <div class="assistant-avatar"><i data-lucide="bot"></i></div>
        <div class="bubble assistant-bubble">
          <p>Hello! 👋 I'm your Chatbot Assistant.<br>Ask me anything.</p>
          <div class="message-meta timestamp">
            <span>${escapeHtml(getCurrentTime())}</span>
          </div>
        </div>
      </div>
    `;
    setStorageItem("chatData", chat.innerHTML);
    if (typeof lucide !== "undefined") lucide.createIcons();
  }

  renderHistory();
  
  const chatNavBtn = document.querySelector('[data-section="chat-section"]');
  if (chatNavBtn) navigateToSection(chatNavBtn);
}



function openConversationFromHistory(id) {
  if (!chat || !id) {
    return;
  }

  const history = readHistory();

  const record =
    history.find(function (item) {
      return item && item.id === id;
    }) || mergedHistoryItems().find((item) => String(item.id) === String(id));

  if (!record) {
    return;
  }

  requestSequence += 1;

  if (activeRequestController) {
    activeRequestController.abort();

    activeRequestController = null;
  }

  requestInProgress = false;

  lastFailedPrompt = "";

  removeLoadingMessages();

  if (record._backend && record.backendSession) {
    activeConversationId = String(record.backendSession.id || record.id);
    setStorageItem("activeConversationId", activeConversationId || "");
    chat.innerHTML = "";
    const messages = Array.isArray(record.backendSession.messages)
      ? record.backendSession.messages
      : [];
    messages.forEach((message) => {
      addUserMessage(message.question || "");
      addAssistantMessage(message.answer || "", message.question || "", message.id || "", message.source || "");
    });
    setStorageItem("chatData", chat.innerHTML);
    updateTimestampVisibility();
    return;
  }

  activeConversationId = record.id || null;

  setStorageItem("activeConversationId", activeConversationId || "");

  if (record.html && typeof record.html === "string") {
    chat.innerHTML = sanitizeStoredHtml(record.html);

    refreshAssistantFormatting(chat);
    setStorageItem("chatData", chat.innerHTML);
  } else {
    /*
     * Backward compatibility with history
     * created by older versions.
     */
    chat.innerHTML = "";

    const row = document.createElement("div");

    row.className = "message-row user-row";

    const bubble = document.createElement("div");

    bubble.className = "bubble user-bubble";

    row.innerHTML = `
    <div class="bubble user-bubble">
      ${escapeHtml(record.question || "")}
      <div class="message-meta timestamp"><span>${escapeHtml(getCurrentTime())}</span></div>
    </div>
    <div class="user-avatar"><i data-lucide="user"></i></div>
  `;

    chat.appendChild(row);

    setStorageItem("chatData", chat.innerHTML);
  }

  updateTimestampVisibility();

  navItems.forEach(function (nav) {
    nav.classList.remove("active");
  });

  if (newChatButton) {
    newChatButton.classList.add("active");
  }

  sections.forEach(function (section) {
    section.classList.remove("active-section");
  });

  const chatSection = document.getElementById("chat-section");

  if (chatSection) {
    chatSection.classList.add("active-section");
  }

  if (input) {
    input.value = "";

    input.disabled = false;

    input.focus();
  }

  const sendButton = form ? form.querySelector('button[type="submit"]') : null;

  if (sendButton) {
    sendButton.disabled = false;
  }
}

function historyDateGroup(dateText) {
  const now = new Date();
  const today = now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  const parsed = String(dateText || "");
  const m = parsed.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!m) return "Previous Conversations";
  const d = new Date(`${m[1]} ${m[2]} ${m[3]} 12:00:00`);
  const dateKey = d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  if (dateKey === today) return "Today";
  const y = new Date(now.getTime() - 86400000);
  if (dateKey === y.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }))
    return "Yesterday";
  return "Previous Conversations";
}

async function loadBackendHistory() {
  try {
    const response = await fetch("/api/history", {
      headers: { Accept: "application/json" },
    });
    const data = await response.json();
    if (!response.ok || !data.ok)
      throw new Error(data?.error || "Could not load backend history.");
    backendHistorySessions = Array.isArray(data.sessions) ? data.sessions : [];
    renderHistory();
  } catch (error) {
    console.warn("Backend history could not be loaded:", error);
  }
}

function mergedHistoryItems() {
  const local = readHistory();
  const map = new Map();
  local.forEach((item) =>
    map.set(String(item.id), { ...item, _backend: false }),
  );
  backendHistorySessions.forEach((session) => {
    const id = String(session.id || "");
    if (!id) return;
    const existing = map.get(id);
    if (existing) {
      existing.backendSession = session;
      return;
    }
    const first =
      Array.isArray(session.messages) && session.messages[0]
        ? session.messages[0]
        : {};
    map.set(id, {
      id,
      title: session.title || first.question || "Conversation",
      message: first.question || "Conversation",
      preview: first.question || "Conversation",
      date: session.date || first.date || "",
      html: "",
      _backend: true,
      backendSession: session,
    });
  });
  return Array.from(map.values()).sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || "")),
  );
}

function renderHistory() {
  if (!historyList) {
    return;
  }

  const history = mergedHistoryItems();

  if (!history.length) {
    historyList.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon"><i data-lucide="message-square" style="width: 48px; height: 48px;"></i></div>

        <h3>
          No Conversations
        </h3>

        <p>
          No conversation history yet.
        </p>

      </div>
    `;

    const exportBtn = document.getElementById("exportHistoryButtonUI");
    if (clearHistoryButton) {
      clearHistoryButton.disabled = true;
    }
    if (exportBtn) {
      exportBtn.disabled = true;
      exportBtn.style.opacity = "0.5";
      exportBtn.style.cursor = "not-allowed";
    }

    return;
  }

  const exportBtn = document.getElementById("exportHistoryButtonUI");
  if (clearHistoryButton) {
    clearHistoryButton.disabled = false;
  }
  if (exportBtn) {
    exportBtn.disabled = false;
    exportBtn.style.opacity = "1";
    exportBtn.style.cursor = "pointer";
  }

  let lastGroup = "";
  historyList.innerHTML = history
    .map(function (item) {
      const group = historyDateGroup(item.date);
      const groupHeading =
        group !== lastGroup
          ? `<div class="history-group-heading">${escapeHtml(group)}</div>`
          : "";
      lastGroup = group;
      const id = String(item.id || "");

      const title = item.title || "Conversation";

      const preview =
        typeof item.preview === "string" && item.preview.trim()
          ? item.preview
          : item.message || "Conversation";

      return `
        ${groupHeading}
        <div
          class="history-item"
          data-history-id="${escapeHtml(id)}"
          data-message="${escapeHtml(item.message || "")}"
          role="button"
          tabindex="0"
          aria-label="Open ${escapeHtml(title)}"
        >
          <span><i data-lucide="message-square" style="width: 1em; height: 1em; vertical-align: middle;"></i></span>
          <div style="flex: 1;">
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(preview)}</p>
            <span class="history-item-date">${escapeHtml(item.date)}</span>
          </div>
          <button class="delete-history-btn history-item-delete" data-history-id="${escapeHtml(id)}" title="Clear Conversation"><i data-lucide="trash-2"></i></button>
        </div>
      `;
    })
    .join("");
  if (window.lucide) { window.lucide.createIcons(); }
}
/* ============================================================
   SAVED ANSWERS
============================================================ */

function getSavedAnswers() {
  try {
    const raw = getStorageItem("savedAnswers");

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveAnswer(question, answer) {
  answer = String(answer).trim();
  question = String(question).trim();

  if (!answer) {
    return;
  }

  let saved = getSavedAnswers();

  if (
    saved.some(function (item) {
      return item && item.answer === answer;
    })
  ) {
    return;
  }

  saved.unshift({
    question,
    answer,
    date: getCurrentDateTime(),
  });

  try {
    localStorage.setItem("savedAnswers", JSON.stringify(saved));
  } catch (_) {}

  renderSavedAnswers();
}

function removeSavedAnswer(index) {
  let saved = getSavedAnswers();

  if (index < 0 || index >= saved.length) {
    return;
  }

  saved.splice(index, 1);

  setStorageItem("savedAnswers", JSON.stringify(saved));

  renderSavedAnswers();
}

function renderSavedAnswers() {
  const section = document.getElementById("saved-section");

  if (!section) {
    return;
  }

  const card = section.querySelector(".info-card");

  if (!card) {
    return;
  }

  const saved = getSavedAnswers();

  if (!saved.length) {
    card.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          ♡
        </div>

        <h3>
          No Saved Answers
        </h3>

        <p>
          Your saved chatbot answers
          will appear here.
        </p>

      </div>
    `;

    return;
  }

  card.innerHTML = `
    <div class="history-list saved-answer-list" style="margin-top: 10px;">
      ${saved
        .map(function (item, index) {
          return `
            <div class="history-item saved-answer-item" style="display:flex; justify-content:space-between; align-items:flex-start; cursor: default;">
              <div style="flex:1; margin-right: 10px;">
                <strong style="display:block; margin-bottom: 4px; color: var(--primary);">
                  ${escapeHtml(item.question || "Saved Answer")}
                </strong>
                <p style="margin: 0 0 5px 0; color: var(--text-color);">
                  ${escapeHtml(item.answer)}
                </p>
                <small style="color:var(--text-light); font-size:10px;">
                  ${escapeHtml(item.date)}
                </small>
              </div>
              <button class="delete-saved-btn" data-index="${index}" title="Clear Saved Answer" style="background:none; border:none; cursor:pointer; font-size:1.1rem; color: var(--danger, #e74c3c); padding:5px;"><i data-lucide="trash-2" style="width: 1em; height: 1em; vertical-align: middle;"></i></button>
            </div>
          `;
        })
        .join("")}

    </div>
  `;
}

/* ============================================================
   LOADING MESSAGE
============================================================ */

function addLoadingMessage() {
  if (!chat) {
    return null;
  }

  removeLoadingMessages();

  const row = document.createElement("div");

  row.className = "message-row assistant-row loading-message";

  row.innerHTML = `
    <div class="assistant-avatar"><i data-lucide="bot"></i></div>
    <div class="bubble assistant-bubble" style="color: var(--text-light); font-style: italic;">
      Generating...
    </div>`;

  chat.appendChild(row);

  updateTimestampVisibility();

  chat.scrollTop = chat.scrollHeight;

  return row;
}

/* ============================================================
   API
============================================================ */

async function generateResponse(message) {
  if (typeof window.__hideUserTyping === 'function') window.__hideUserTyping();
  const cleanMessage = String(message || "").trim();

  if (!cleanMessage || !chat) {
    return false;
  }

  /*
   * Each request gets its own sequence number
   * and AbortController.
   */
  const requestId = ++requestSequence;

  const controller = new AbortController();

  activeRequestController = controller;

  let timedOut = false;

  let completed = false;

  removeLoadingMessages();

  const loading = addLoadingMessage();

  const timeout = window.setTimeout(() => {
    timedOut = true;

    controller.abort();
  }, 45000);

  /*
   * Test the real API instead of assuming
   * that the page is online.
   */
  markApiChecking();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",

        Accept: "application/json",
      },

      body: JSON.stringify({
        message: cleanMessage,
        conversation_id: activeConversationId || "",
      }),

      signal: controller.signal,
    });

    let data;

    try {
      data = await response.json();
    } catch (error) {
      throw new Error("Server returned an invalid response.");
    }

    if (!response.ok) {
      throw new Error(
        data && typeof data.error === "string"
          ? data.error
          : `Server error (${response.status}).`,
      );
    }

    if (!data || data.ok !== true) {
      throw new Error(
        data && typeof data.error === "string"
          ? data.error
          : "Unable to get a chatbot response.",
      );
    }

    const answer =
      typeof data.answer === "string" && data.answer.trim()
        ? data.answer.trim()
        : "Sorry, I did not receive a valid answer.";

    /*
     * Do not render stale responses.
     */
    if (requestId !== requestSequence) {
      return false;
    }

    if (loading && loading.isConnected) {
      loading.remove();
    }

    removeLoadingMessages();

    /*
     * API responded successfully.
     */
    markApiOnline();

    if (data.conversation_id) {
      activeConversationId = String(data.conversation_id);
      setStorageItem("activeConversationId", activeConversationId);
    }

    addAssistantMessage(answer, cleanMessage, data.entry_id || "", data.source || "");

    lastFailedPrompt = "";

    completed = true;

    return true;
  } catch (error) {
    /*
     * Intentional aborts from Clear/New Chat
     * are not connection errors.
     */
    if (error && error.name === "AbortError" && !timedOut) {
      return false;
    }

    console.error("Chat API Error:", error);

    if (requestId !== requestSequence) {
      return false;
    }

    if (loading && loading.isConnected) {
      loading.remove();
    }

    removeLoadingMessages();

    markApiOffline();

    lastFailedPrompt = cleanMessage;

    addErrorMessage(cleanMessage, error?.message);

    return false;
  } finally {
    window.clearTimeout(timeout);

    if (requestId === requestSequence) {
      removeLoadingMessages();

      if (activeRequestController === controller) {
        activeRequestController = null;
      }
    }

    completed = completed || false;
  }
}

/* ============================================================
   NORMAL CHAT SUBMIT
============================================================ */

if (form && input) {
  form.addEventListener("submit", async function (event) {
    /*
     * The HTML already handles Edit mode.
     */
    event.preventDefault();

    if (input.dataset.editingMessage === "true") {
      return;
    }

    if (requestInProgress) {
      return;
    }

    const value = input.value.trim();

    if (!value) {
      input.focus();

      return;
    }

    requestInProgress = true;

    const sendButton = form.querySelector('button[type="submit"]');

    try {
      addUserMessage(value);

      input.value = "";

      input.disabled = true;

      if (sendButton) {
        sendButton.disabled = true;
      }

      await generateResponse(value);
    } catch (error) {
      console.error("Unexpected chat error:", error);

      removeLoadingMessages();

      markApiOffline();

      addErrorMessage(value, error?.message);
    } finally {
      requestInProgress = false;

      input.disabled = false;

      if (sendButton) {
        sendButton.disabled = false;
      }

      input.focus();
    }
  });
}

/* ============================================================
   QUICK ACTIONS
============================================================ */

document.querySelectorAll(".quick-action").forEach(function (button) {
  button.addEventListener("click", function () {
    if (!input || input.disabled) {
      return;
    }

    const prompt = button.dataset.prompt || button.textContent.trim();

    if (!prompt) {
      return;
    }

    input.value = prompt;

    input.focus();
  });
});

/* ============================================================
   NAVIGATION
============================================================ */

function confirmNewChatUI() {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:100000;backdrop-filter:blur(2px);";
  
  const box = document.createElement("div");
  box.style.cssText = "background:var(--surface,#fff);padding:24px;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.2);text-align:center;width:90%;max-width:320px;border:1px solid var(--border,#e2e8f0);animation:fadeIn 0.2s ease-out;";
  
  const title = document.createElement("h3");
  title.innerText = "Start a new chat?";
  title.style.cssText = "margin:0 0 8px 0;font-size:18px;color:var(--text,#172033);font-weight:700;";
  
  const desc = document.createElement("p");
  desc.innerText = "This will clear your current conversation.";
  desc.style.cssText = "margin:0 0 24px 0;font-size:14px;color:var(--text-light,#64748b);";
  
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:12px;justify-content:center;";
  
  const cancelBtn = document.createElement("button");
  cancelBtn.innerText = "Cancel";
  cancelBtn.style.cssText = "padding:10px 16px;border-radius:8px;border:none;background:var(--bg,#f1f5f9);color:var(--text,#172033);font-weight:600;cursor:pointer;flex:1;transition:background 0.2s;";
  cancelBtn.onmouseover = () => cancelBtn.style.background = "var(--surface-hover)";
  cancelBtn.onmouseout = () => cancelBtn.style.background = "var(--bg,#f1f5f9)";
  
  const confirmBtn = document.createElement("button");
  confirmBtn.innerText = "New Chat";
  confirmBtn.style.cssText = "padding:10px 16px;border-radius:8px;border:none;background:var(--primary,var(--primary));color:#fff;font-weight:600;cursor:pointer;flex:1;transition:background 0.2s;";
  confirmBtn.onmouseover = () => confirmBtn.style.background = "var(--primary-dark)";
  confirmBtn.onmouseout = () => confirmBtn.style.background = "var(--primary,var(--primary))";
  
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(confirmBtn);
  box.appendChild(title);
  box.appendChild(desc);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  
  cancelBtn.addEventListener("click", () => {
    document.body.removeChild(overlay);
  });
  
  confirmBtn.addEventListener("click", () => {
    document.body.removeChild(overlay);
    startNewChat();
    // Also navigate to chat section just in case
    const chatBtn = document.querySelector('[data-section="chat-section"]');
    if (chatBtn) navigateToSection(chatBtn);
  });
}

function navigateToSection(item) {
  const target = item.dataset.section;
  if (!target) return;
  const section = document.getElementById(target);
  if (!section) return;

  navItems.forEach(function (nav) {
    nav.classList.remove("active");
  });
  item.classList.add("active");

  sections.forEach(function (sec) {
    sec.classList.remove("active-section");
  });
  section.classList.add("active-section");

  if (target !== "chat-section") {
    showSectionSkeleton(section);
  }

  if (target === "history-section") {
    renderHistory();
  }

  if (target === "saved-section") {
    renderSavedAnswers();
  }

  if (target === "chat-section" && input && !input.disabled) {
    input.focus();
  }
}

let chatBtnClicks = 0;
let chatBtnTimer = null;

navItems.forEach(function (item) {
  item.addEventListener("click", function (e) {
    if (item.id === "globalThemeToggleBtn") return;
    e.preventDefault();
    if (item.dataset.section === "chat-section") {
      chatBtnClicks++;
      if (chatBtnClicks === 1) {
        chatBtnTimer = setTimeout(() => {
          chatBtnClicks = 0;
          navigateToSection(item);
        }, 250);
      } else if (chatBtnClicks === 2) {
        clearTimeout(chatBtnTimer);
        chatBtnClicks = 0;
        confirmNewChatUI();
      }
    } else {
      navigateToSection(item);
    }
  });
});

/* ============================================================
   NEW CHAT
============================================================ */

function startNewChat() {
  if (!chat) {
    return;
  }

  requestSequence += 1;

  if (activeRequestController) {
    activeRequestController.abort();

    activeRequestController = null;
  }

  requestInProgress = false;

  lastFailedPrompt = "";

  removeLoadingMessages();

  /*
   * A newly created chat hasn't tested
   * the API yet.
   */
  markApiChecking();

  /*
   * The previous active conversation has
   * already been saved through saveChatData().
   *
   * Start a fresh conversation ID.
   */
  activeConversationId = null;

  removeStorageItem("activeConversationId");
  clearPreviewPane();

  chat.innerHTML = `
    <div class="message-row assistant-row">

      <div class="assistant-avatar">
        ✦
      </div>

      <div class="bubble assistant-bubble">

        <p>
          Hello! 👋 I'm your Chatbot Assistant.
          Ask me anything.
        </p>

        <div class="message-meta timestamp">

          <span>
            ${escapeHtml(getCurrentTime())}
          </span>

        </div>

      </div>

    </div>
  `;

  updateTimestampVisibility();

  setStorageItem("chatData", chat.innerHTML);

  if (input) {
    input.value = "";

    input.disabled = false;

    input.focus();
  }

  const sendButton = form ? form.querySelector('button[type="submit"]') : null;

  if (sendButton) {
    sendButton.disabled = false;
  }
}

if (newChatButton) {
  // Navigation listener handles single and double clicks for chat-section now.
}

/* ============================================================
   DARK MODE
============================================================ */

/* ============================================================
   EXIT
============================================================ */

if (exitBtn) {
  exitBtn.addEventListener("click", function () {
    if (confirm("Are you sure you want to exit Chatbot AI?")) {
      const overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle, var(--bg-main) 0%, var(--bg-sidebar) 100%);";
      overlay.innerHTML = `
        <div style="text-align:center;color:var(--text-primary);font-family:inherit;">
          <div style="font-size:3rem;margin-bottom:1rem;">👋</div>
          <h1 style="font-size:1.8rem;margin-bottom:0.5rem;">Goodbye!</h1>
          <p style="color:var(--text-muted);font-size:1rem;">Thank you for using Chatbot AI.</p>
          <button onclick="location.reload()" style="margin-top:1.5rem;padding:0.6rem 1.5rem;background:var(--brand-primary);color:white;border:none;border-radius:8px;cursor:pointer;font-size:0.95rem;">↩ Return to Chat</button>
        </div>
      `;
      document.body.appendChild(overlay);
      document.querySelector(".app-shell").style.display = "none";
    }
  });
}

/* ============================================================
   RETRY CONNECTION
============================================================ */

document.addEventListener("click", function (event) {
  if (!event.target || !(event.target instanceof Element)) {
    return;
  }

  const retryButton = event.target.closest(".retry-chat-btn");

  if (!retryButton || requestInProgress || !lastFailedPrompt) {
    return;
  }

  event.preventDefault();

  const errorRow = retryButton.closest(".connection-error-message");

  if (errorRow) {
    errorRow.remove();
  }

  const retryPrompt = lastFailedPrompt.trim();

  if (!retryPrompt) {
    return;
  }

  requestInProgress = true;

  if (input) {
    input.disabled = true;
  }

  const sendButton = form ? form.querySelector('button[type="submit"]') : null;

  if (sendButton) {
    sendButton.disabled = true;
  }

  markApiChecking();

  generateResponse(retryPrompt).finally(function () {
    requestInProgress = false;

    if (input) {
      input.disabled = false;

      input.focus();
    }

    if (sendButton) {
      sendButton.disabled = false;
    }
  });
});

/* ============================================================
   SAVE / UNSAVE ANSWER
============================================================ */

document.addEventListener("click", function (event) {
  if (!event.target || !(event.target instanceof Element)) {
    return;
  }

  const button = event.target.closest(".like-btn");

  if (!button) {
    return;
  }

  const bubble = button.closest(".assistant-bubble");

  if (!bubble) {
    return;
  }

  const paragraph = bubble.querySelector("p");

  if (!paragraph) {
    return;
  }

  const answer = paragraph.textContent.trim();

  if (!answer) {
    return;
  }

  let question = "Saved Answer";
  const row = bubble.closest(".message-row");
  if (
    row &&
    row.previousElementSibling &&
    row.previousElementSibling.classList.contains("user-row")
  ) {
    const userP = row.previousElementSibling.querySelector("p");
    if (userP) {
      question = userP.textContent.trim();
    }
  }

  const saved = getSavedAnswers();

  const index = saved.findIndex(function (item) {
    return item && item.answer === answer;
  });

  if (index !== -1) {
    removeSavedAnswer(index);

    button.textContent = "♡";

    button.style.color = "";

    return;
  }

  saveAnswer(question, answer);

  button.textContent = "♥";

  button.style.color = "var(--danger)";
});

/* ============================================================
   REMOVE SAVED ANSWER
============================================================ */

document.addEventListener("click", function (event) {
  if (!event.target || !(event.target instanceof Element)) {
    return;
  }

  const button = event.target.closest(".delete-saved-btn");

  if (!button) {
    return;
  }

  const index = Number.parseInt(button.dataset.index, 10);

  if (!Number.isInteger(index)) {
    return;
  }

  removeSavedAnswer(index);
});

/* ============================================================
   HISTORY CLICK / OPEN / DELETE
============================================================ */

document.addEventListener("click", function (event) {
  if (!event.target || !(event.target instanceof Element)) {
    return;
  }

  const deleteButton = event.target.closest(".delete-history-btn");

  if (deleteButton) {
    event.preventDefault();

    event.stopPropagation();

    deleteHistoryConversation(deleteButton.dataset.historyId);

    return;
  }

  const item = event.target.closest(".history-item[data-history-id]");

  if (!item) {
    return;
  }

  event.preventDefault();

  openPreviewFromHistory(item.dataset.historyId);
});

document.addEventListener("keydown", function (event) {
  if (
    (event.key !== "Enter" && event.key !== " ") ||
    !(event.target instanceof Element)
  ) {
    return;
  }

  const item = event.target.closest(".history-item[data-history-id]");

  if (!item) {
    return;
  }

  event.preventDefault();

  openPreviewFromHistory(item.dataset.historyId);
});

if (clearHistoryButton) {
  clearHistoryButton.addEventListener("click", function (event) {
    event.preventDefault();
    confirmClearHistoryUI();
  });
}


if (clearSavedAnswersBtn) {
  clearSavedAnswersBtn.addEventListener("click", function () {
    if (confirm("Are you sure you want to clear all saved answers?")) {
      try {
        localStorage.removeItem("savedAnswers");
        renderSavedAnswers();
      } catch (_) {}
    }
  });
}

/* ============================================================
   "/" SHORTCUT
============================================================ */

document.addEventListener("keydown", function (event) {
  if (
    event.key === "/" &&
    document.activeElement !== input &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault();

    if (input && !input.disabled) {
      input.focus();
    }
  }
});

// ENTER TO SUBMIT LOGIC
if (input && form) {
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault(); // Prevent new line
      form.dispatchEvent(
        new Event("submit", { cancelable: true, bubbles: true }),
      );
    }
  });
}

/* ============================================================
   LOAD SETTINGS
============================================================ */

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem("chatbotSettings") || "{}");
  if (saved.darkMode) {
    document.body.classList.add("dark-mode");
  }
  const isDark = document.body.classList.contains("dark-mode");
  
  const globalThemeBtn = document.getElementById("globalThemeToggleBtn");
  if (globalThemeBtn) {
    globalThemeBtn.innerHTML = isDark ? '<i data-lucide="sun" class="nav-icon"></i><span> Light Mode </span>' : '<i data-lucide="moon" class="nav-icon"></i><span> Dark Mode </span>';
  }

  if (typeof lucide !== "undefined") lucide.createIcons();
}

/* ============================================================
   INITIALIZATION
============================================================ */

function initializeChatbot() {
  /*
   * Do not claim the API is online simply
   * because the page loaded.
   */
  markApiChecking();

  loadSettings();

  loadChatData();

  renderHistory();

  renderSavedAnswers();

  updateTimestampVisibility();

  updateHeaderTime();

  if (input) {
    input.setAttribute("autocomplete", "off");
  }

  if (chat && !chat.querySelector(".message-row")) {
    restoreChatWelcomeState();
  }
}

/* ============================================================
   START
============================================================ */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeChatbot, {
    once: true,
  });
} else {
  initializeChatbot();
}

/* ============================================================
   PAGE UNLOAD / REQUEST CLEANUP
============================================================ */

window.addEventListener("beforeunload", function () {
  requestSequence += 1;

  if (activeRequestController) {
    try {
      activeRequestController.abort();
    } catch (_) {
      /*
       * Ignore unload-time abort errors.
       */
    }

    activeRequestController = null;
  }
});

/* ============================================================
   BROWSER NETWORK STATUS
============================================================ */

window.addEventListener("offline", function () {
  markApiOffline();
});

window.addEventListener("online", function () {
  markApiChecking();
});

/* ============================================================
   ADDITIVE FILE READER + RESPONSE REFRESH FEATURES
   The original chatbot logic above is intentionally preserved.
============================================================ */
(() => {
  "use strict";

  const inputBar = document.getElementById("promptForm");
  const messageInput = document.getElementById("promptInput");
  const chatBox = document.getElementById("chat");

  if (!inputBar || !messageInput || !chatBox) {
    return;
  }

  const MAX_FILE_SIZE = 15 * 1024 * 1024;
  const SUPPORTED_EXTENSIONS = new Set([
    ".txt",
    ".docx",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".bmp",
  ]);

  let selectedFile = null;
  let fileRequestBusy = false;
  let refreshRequestBusy = false;

  const fileRefreshMap = new Map();

  const getExtension = (name) => {
    const value = String(name || "").toLowerCase();
    const dot = value.lastIndexOf(".");
    return dot === -1 ? "" : value.slice(dot);
  };

  const getFileTypeLabel = (file) => {
    const extension = getExtension(file?.name);

    if (extension === ".docx") return "DOCX";
    if (extension === ".txt") return "TXT";
    if (extension === ".png") return "PNG";
    if (extension === ".jpg" || extension === ".jpeg") return "JPG";
    if (extension === ".webp") return "WEBP";
    if (extension === ".gif") return "GIF";
    if (extension === ".bmp") return "BMP";
    return "FILE";
  };

    const showToast = (message, type = "normal") => {
    const existing = document.getElementById("chatbotFeatureToast");

    if (existing) {
      existing.remove();
    }

    const toast = document.createElement("div");
    toast.id = "chatbotFeatureToast";
    toast.className = `chatbot-feature-toast ${type === "error" ? "is-error" : ""}`;
    toast.textContent = String(message || "");
    document.body.appendChild(toast);

    window.setTimeout(() => {
      toast.classList.add("hide");
      window.setTimeout(() => toast.remove(), 180);
    }, 2800);
  };

  const installFeatureStyles = () => {
    if (document.getElementById("chatbot-file-refresh-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "chatbot-file-refresh-styles";
    style.textContent = `
      /* -------------------------------------------------------
         Clean attachment control — matches the existing input
         bar instead of looking like an unrelated emoji button.
      ------------------------------------------------------- */
      .chatbot-attach-btn {
        flex: 0 0 40px;
        width: 40px;
        height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin: 0 4px 0 -6px;
        padding: 0;
        border: 0;
        border-radius: 11px;
        background: transparent;
        color: var(--text-light);
        cursor: pointer;
        transition: background .18s ease, color .18s ease, transform .18s ease;
      }

      .chatbot-attach-btn:hover {
        background: var(--surface-hover);
        color: var(--primary-dark);
        transform: translateY(-1px);
      }

      .chatbot-attach-btn:active {
        transform: translateY(0);
      }

      .chatbot-attach-btn:focus-visible {
        outline: 2px solid var(--border-hover);
        outline-offset: 2px;
      }

      .chatbot-attach-btn svg {
        width: 19px;
        height: 19px;
        display: block;
      }

      /* Selected file pill */
      .chatbot-file-pill {
        flex: 0 1 auto;
        max-width: min(290px, 40vw);
        min-width: 0;
        height: 34px;
        display: none;
        align-items: center;
        gap: 7px;
        padding: 4px 7px 4px 8px;
        margin-right: 6px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: var(--surface-soft);
        color: var(--text);
      }

      .chatbot-file-pill.visible {
        display: inline-flex;
      }

      .chatbot-file-type {
        flex: 0 0 auto;
        min-width: 34px;
        height: 24px;
        padding: 0 5px;
        border-radius: 7px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--primary-light);
        color: var(--primary-dark);
        font-size: 8px;
        line-height: 1;
        font-weight: 700;
        letter-spacing: .35px;
      }

      .chatbot-file-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 10px;
        font-weight: 500;
      }

      .chatbot-file-remove {
        flex: 0 0 auto;
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        font: inherit;
        font-size: 17px;
        line-height: 1;
      }

      .chatbot-file-remove:hover {
        background: var(--surface-hover);
        color: var(--danger);
      }

      /* Refresh button directly under the AI answer */
      .chatbot-refresh-row {
        display: flex;
        align-items: center;
        margin-top: 9px;
      }

      .chatbot-refresh-btn {
        appearance: none;
        -webkit-appearance: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 28px;
        padding: 5px 9px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        color: var(--text-light);
        font-family: inherit;
        font-size: 9px;
        font-weight: 600;
        cursor: pointer;
        transition: background .18s ease, color .18s ease, border-color .18s ease, transform .18s ease;
      }

      .chatbot-refresh-btn:hover:not(:disabled) {
        background: var(--surface-hover);
        border-color: var(--border-hover);
        color: var(--primary-dark);
        transform: translateY(-1px);
      }

      .chatbot-refresh-btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .chatbot-refresh-btn:disabled {
        opacity: .58;
        cursor: not-allowed;
      }

      .chatbot-refresh-btn svg {
        width: 13px;
        height: 13px;
      }

      .chatbot-file-status {
        margin-top: 8px;
        padding: 6px 8px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        color: var(--text-light);
        font-size: 9px;
        line-height: 1.4;
      }

      /* Small unobtrusive toast instead of browser alert() */
      .chatbot-feature-toast {
        position: fixed;
        left: 50%;
        bottom: 24px;
        z-index: 99999;
        max-width: min(430px, calc(100vw - 32px));
        padding: 10px 14px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: var(--surface);
        color: var(--text);
        box-shadow: 0 12px 30px rgba(31, 52, 85, .18);
        font-family: inherit;
        font-size: 10px;
        line-height: 1.45;
        transform: translate(-50%, 0);
        opacity: 1;
        transition: opacity .18s ease, transform .18s ease;
      }

      .chatbot-feature-toast.is-error {
        border-color: rgba(220, 76, 76, .35);
      }

      .chatbot-feature-toast.hide {
        opacity: 0;
        transform: translate(-50%, 8px);
      }

      body.dark-mode .chatbot-attach-btn:hover,
      body.dark-mode .chatbot-file-remove:hover,
      body.dark-mode .chatbot-refresh-btn:hover:not(:disabled) {
        background: var(--surface-hover);
      }

      @media (max-width: 700px) {
        .chatbot-file-pill {
          max-width: 45vw;
        }
      }

      @media (max-width: 520px) {
        .chatbot-file-pill {
          max-width: 38vw;
        }

        .chatbot-file-type {
          min-width: 30px;
        }
      }
    `;

    document.head.appendChild(style);
  };

    const createFileControls = () => {
    installFeatureStyles();

    const fileInput = document.getElementById("chatbotFileInput");
    const attachButton = document.getElementById("hardcodedAttachBtn");
    const filePill = document.getElementById("hardcodedFilePill");
    
    if (!fileInput || !attachButton || !filePill) return;
    
    // Prevent double binding
    if (fileInput.dataset.bound) return;
    fileInput.dataset.bound = "true";

    const clearFile = () => {
      selectedFile = null;
      fileInput.value = "";
      filePill.classList.remove("visible");
      filePill.querySelector(".chatbot-file-name").textContent = "";
    };

    const setFile = (file) => {
      selectedFile = file || null;
      if (!selectedFile) {
        clearFile();
        return;
      }
      filePill.querySelector(".chatbot-file-type").textContent = getFileTypeLabel(selectedFile);
      filePill.querySelector(".chatbot-file-name").textContent = `${selectedFile.name} · ${Math.max(1, Math.round(selectedFile.size / 1024))} KB`;
      filePill.classList.add("visible");
    };

    attachButton.addEventListener("click", () => fileInput.click());

    filePill.querySelector(".chatbot-file-remove").addEventListener("click", () => clearFile());

    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0] || null;
      if (!file) return;
      const extension = getExtension(file.name);
      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        clearFile();
        showToast("Unsupported file. Use TXT, DOCX, PNG, JPG, JPEG, WEBP, GIF, or BMP.", "error");
        return;
      }
      if (file.size <= 0) {
        clearFile();
        showToast("The selected file is empty.", "error");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        clearFile();
        showToast("File is too large. Maximum allowed size is 15 MB.", "error");
        return;
      }
      setFile(file);
    });

    window.__chatbotSelectedFile = () => selectedFile;
    window.__chatbotClearSelectedFile = clearFile;
  };

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const value = String(reader.result || "");
        const comma = value.indexOf(",");
        resolve(comma === -1 ? value : value.slice(comma + 1));
      };

      reader.onerror = () =>
        reject(new Error("The browser could not read this file."));

      reader.readAsDataURL(file);
    });

  const svgRefresh = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 11a8 8 0 0 0-13.65-5.66L4 7.69M4 4v3.69h3.69" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M4 13a8 8 0 0 0 13.65 5.66L20 16.31M20 20v-3.69h-3.69" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const refreshAnswer = async (row, button) => {
    if (refreshRequestBusy || !row || !button) {
      return;
    }

    const entryId = String(row.dataset.entryId || "").trim();
    const question = String(row.dataset.question || "").trim();

    if (!entryId || !question) {
      showToast(
        "This response cannot be refreshed because its saved question ID is missing.",
        "error",
      );
      return;
    }

    refreshRequestBusy = true;

    const oldText = button.title || "Refresh response";

    button.title = "Refreshing...";

    try {
      const response = await fetch("/api/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          entry_id: entryId,
          message: question,
        }),
      });

      let data = null;

      try {
        data = await response.json();
      } catch (_) {
        throw new Error("The server returned an invalid refresh response.");
      }

      if (!response.ok || !data || data.ok !== true) {
        throw new Error(data?.error || `Refresh failed (${response.status}).`);
      }

      const answer = String(data.answer || "").trim();

      if (!answer) {
        throw new Error("Groq returned an empty refreshed answer.");
      }

      const answerContainer = row.querySelector(
        ".assistant-bubble > .assistant-content",
      );

      if (!answerContainer) {
        throw new Error("Could not find the AI answer in the chat.");
      }

      answerContainer.innerHTML = formatAssistantText(answer);
      
      // Update badge!
      const source = data.source || "groq_ai";
      let newBadge = "";
      if (source === "knowledge_file") {
        newBadge = `<span class="source-badge badge-knowledge">📚 Knowledge Base</span>`;
      } else if (source === "keyword_rule") {
        newBadge = `<span class="source-badge badge-keyword">⚡ Keyword Rule</span>`;
      } else if (source === "groq_ai") {
        newBadge = `<span class="source-badge badge-groq">🧠 Groq AI</span>`;
      }
      
      const metaContainer = row.querySelector(".message-meta.timestamp");
      if (metaContainer) {
        metaContainer.innerHTML = `${newBadge}<span>${escapeHtml(getCurrentTime())}</span>`;
      }
      
      row.dataset.refreshedAt = new Date().toISOString();

      saveChatData();
      updateTimestampVisibility();

      if (typeof playNotificationSound === "function") {
        playNotificationSound();
      }

      button.title = "Updated";

      window.setTimeout(() => {
        if (button.isConnected) {
          button.title = oldText;
        }
      }, 1200);
    } catch (error) {
      console.error("Refresh response error:", error);
      button.title = oldText;
      showToast(
        error?.message || "Could not refresh the AI response.",
        "error",
      );
    } finally {
      refreshRequestBusy = false;
      button.disabled = false;
    }
  };  const addRefreshButtonToRow = (row) => {
    if (!row || !row.classList.contains("assistant-row")) {
      return;
    }

    if (
      row.classList.contains("loading-message") ||
      row.classList.contains("connection-error-message")
    ) {
      return;
    }

    if (row.querySelector(".chatbot-refresh-btn")) {
      return;
    }

    const bubble = row.querySelector(".assistant-bubble");
    if (!bubble) {
      return;
    }
    
    let actionsBox = bubble.querySelector(".reaction-actions");
    if (!actionsBox) {
      return;
    }

    const entryId = String(row.dataset.entryId || "").trim();
    const question = String(row.dataset.question || "").trim();

    if (!entryId || !question) {
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "chatbot-refresh-btn";
    button.setAttribute("aria-label", "Refresh this AI response");
    button.title = "Refresh response";
    button.innerHTML = `<i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>`;

    button.addEventListener("click", () => refreshAnswer(row, button));

    actionsBox.appendChild(button);
    
    // Call lucide to render the new icon
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
    return row;
  };

  // Restore refresh metadata from saved chat HTML and add missing buttons.
  const enhanceExistingRows = () => {
    chatBox.querySelectorAll(".assistant-row").forEach((row) => {
      addRefreshButtonToRow(row);
    });
  };

  const addFileUserMessage = (file, instruction) => {
    const text = instruction
      ? `[File: ${file.name}] ${instruction}`
      : `[File: ${file.name}] Read and analyze this file.`;

    const row = addUserMessage(text);
    
    if (row && file && file.type && file.type.startsWith("image/")) {
      const bubble = row.querySelector(".user-bubble");
      if (bubble) {
        const img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        img.className = "user-image-preview";
        img.style.maxWidth = "100%";
        img.style.maxHeight = "250px";
        img.style.borderRadius = "8px";
        img.style.marginTop = "8px";
        img.style.marginBottom = "8px";
        img.style.display = "block";
        img.style.objectFit = "contain";
        img.alt = file.name;
        
        const meta = bubble.querySelector(".message-meta");
        if (meta) {
          bubble.insertBefore(img, meta);
        } else {
          bubble.appendChild(img);
        }
      }
    }

    return row;
  };

  const addFileStatus = (row, text) => {
    const bubble = row?.querySelector(".assistant-bubble");

    if (!bubble) {
      return;
    }

    const status = document.createElement("div");
    status.className = "chatbot-file-status";
    status.textContent = text;

    const meta = bubble.querySelector(":scope > .message-meta");

    if (meta) {
      bubble.insertBefore(status, meta);
    } else {
      bubble.appendChild(status);
    }
  };

  const analyzeFile = async (file, instruction) => {
    const base64Data = await fileToBase64(file);

    const response = await fetch("/api/file-read", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        filename: file.name,
        mime_type: file.type || "",
        data_base64: base64Data,
        message: instruction || "",
      }),
    });

    let data = null;

    try {
      data = await response.json();
    } catch (_) {
      throw new Error("The server returned an invalid file response.");
    }

    if (!response.ok || !data || data.ok !== true) {
      throw new Error(
        data?.error || `File processing failed (${response.status}).`,
      );
    }

    return data;
  };

  const handleFileSubmit = async (event) => {
    if (!selectedFile || fileRequestBusy) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const file = selectedFile;
    const instruction = messageInput.value.trim();

    if (typeof requestInProgress !== "undefined" && requestInProgress) {
      return;
    }

    fileRequestBusy = true;

    if (typeof requestInProgress !== "undefined") {
      requestInProgress = true;
    }

    const sendButton = inputBar.querySelector('button[type="submit"]');

    try {
      addFileUserMessage(file, instruction);

      messageInput.value = "";
      messageInput.disabled = true;

      if (sendButton) {
        sendButton.disabled = true;
      }

      if (typeof removeLoadingMessages === "function") {
        removeLoadingMessages();
      }

      if (typeof addLoadingMessage === "function") {
        addLoadingMessage();
      }

      if (typeof markApiChecking === "function") {
        markApiChecking();
      }

      const data = await analyzeFile(file, instruction);

      if (typeof removeLoadingMessages === "function") {
        removeLoadingMessages();
      }

      if (typeof markApiOnline === "function") {
        markApiOnline();
      }

      const storedQuestion =
        instruction || `Read and analyze the attached file: ${file.name}`;

      const answerRow = addAssistantMessage(
        data.answer,
        `${storedQuestion}\n[Attached file: ${file.name}]`,
        data.entry_id || "",
      );

      if (answerRow) {
        addFileStatus(
          answerRow,
          data.extracted_text_truncated
            ? "File read successfully. The document was shortened internally because it is very large."
            : "File read successfully.",
        );
      }

      if (data.entry_id) {
        fileRefreshMap.set(data.entry_id, file);
      }

      selectedFile = null;
      window.__chatbotClearSelectedFile?.();

      if (typeof saveChatData === "function") {
        saveChatData();
      }
    } catch (error) {
      console.error("File analysis error:", error);

      if (typeof removeLoadingMessages === "function") {
        removeLoadingMessages();
      }

      if (typeof markApiOffline === "function") {
        markApiOffline();
      }

      if (typeof addErrorMessage === "function") {
        addErrorMessage(instruction || `Read and analyze file: ${file.name}`, error?.message);
      }

      showToast(error?.message || "Could not read the selected file.", "error");
    } finally {
      fileRequestBusy = false;

      if (typeof requestInProgress !== "undefined") {
        requestInProgress = false;
      }

      messageInput.disabled = false;

      if (sendButton) {
        sendButton.disabled = false;
      }

      messageInput.focus();
    }
  };

  // Capture phase guarantees that a selected file is processed here instead
  // of being sent to the original text-only /api/chat handler.
  inputBar.addEventListener("submit", handleFileSubmit, true);

  const observer = new MutationObserver(() => enhanceExistingRows());
  observer.observe(chatBox, { childList: true, subtree: true });

  createFileControls();
  enhanceExistingRows();
})();

/* ============================================================
   KNOWLEDGE / FAQ MODULE
   ------------------------------------------------------------
   Additive feature. Uses the C++ knowledge file API and does
   not replace the existing chat, history, saved-answer, or
   file-analysis code.
============================================================ */
(() => {
  "use strict";

  const knowledgeSection = document.getElementById("knowledge-section");
  const knowledgeList = document.getElementById("knowledgeTableBody");
  const questionInput = document.getElementById("knowledgeQuestion");
  const answerInput = document.getElementById("knowledgeAnswer");
  const saveButton = document.getElementById("knowledgeSaveButton");
  const cancelButton = document.getElementById("knowledgeCancelButton");
  const reloadButton = document.getElementById("knowledgeReloadButton");
  const formTitle = document.getElementById("knowledgeFormTitle");
  const messageBox = document.getElementById("knowledgeMessage");

  if (
    !knowledgeSection ||
    !knowledgeList ||
    !questionInput ||
    !answerInput ||
    !saveButton
  ) {
    return;
  }

  let knowledgeItems = [];
  let editingQuestion = "";

  const setMessage = (text, type = "") => {
    if (!messageBox) return;
    messageBox.textContent = text;
    messageBox.className = `knowledge-message ${type}`.trim();
  };

  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });

    let data;
    try {
      data = await response.json();
    } catch (_) {
      throw new Error("The server returned an invalid response.");
    }

    if (!response.ok || !data.ok) {
      throw new Error(data?.error || `Request failed (${response.status}).`);
    }

    return data;
  };

    const renderKnowledge = () => { if (typeof window.__chatbotRenderPaginatedKnowledge === "function") window.__chatbotRenderPaginatedKnowledge(); };

  const loadKnowledge = async () => {
    knowledgeList.innerHTML = `<div class="knowledge-empty-state">Loading knowledge...</div>`;

    try {
      const response = await fetch("/api/knowledge", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error || `Could not load knowledge (${response.status}).`,
        );
      }

      knowledgeItems = Array.isArray(data.items) ? data.items : [];
      window.__chatbotKnowledgeItems = knowledgeItems;
      renderKnowledge();
      const categorySelect = document.getElementById("knowledgeCategoryFilter");
      if (categorySelect) {
        const categories = [
          ...new Set(knowledgeItems.map((item) => item.category || "General")),
        ].sort();
        categorySelect.innerHTML =
          `<option value="all">All Categories</option>` +
          categories
            .map(
              (category) =>
                `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`,
            )
            .join("");
      }
      setMessage(`${knowledgeItems.length} question(s) loaded.`, "success");
    } catch (error) {
      knowledgeList.innerHTML = `<div class="knowledge-empty-state error">${escapeHtml(error?.message || "Could not load knowledge.")}</div>`;
      setMessage(error?.message || "Could not load knowledge.", "error");
    }
  };

  window.__chatbotResetKnowledgeForm = () => resetForm();
  const resetForm = () => {
    editingQuestion = "";
    questionInput.value = "";
    answerInput.value = "";
    saveButton.textContent = "Add Question";
    if (cancelButton) cancelButton.hidden = true;
    if (formTitle) formTitle.textContent = "Add Question & Answer";
  };

  const startEdit = (index) => {
    if (typeof window.__chatbotAdminUnlocked === "function" && !window.__chatbotAdminUnlocked()) {
      alert("Admin access required. Please unlock Admin Mode first.");
      return;
    }
    const item = knowledgeItems[index];
    if (!item) return;

    editingQuestion = item.question;
    questionInput.value = item.question;
    answerInput.value = item.answer;
    saveButton.textContent = "Update Question";
    if (cancelButton) cancelButton.hidden = false;
    if (formTitle) formTitle.textContent = "Update Question & Answer";
    setMessage("Edit the question or answer, then click Update Question.");
    questionInput.focus();
  };

  saveButton.addEventListener("click", async () => {
    if (typeof window.__chatbotAdminUnlocked === "function" && !window.__chatbotAdminUnlocked()) {
      alert("Admin access required. Please unlock Admin Mode first.");
      return;
    }
    const question = questionInput.value.trim();
    const answer = answerInput.value.trim();

    if (!question || !answer) {
      setMessage("Please enter both a question and an answer.", "error");
      return;
    }

    saveButton.disabled = true;

    try {
      if (editingQuestion) {
        await request("/api/knowledge/update", {
          method: "POST",
          body: JSON.stringify({
            old_question: editingQuestion,
            question,
            answer,
          }),
        });
        setMessage("Question and answer updated successfully.", "success");
      } else {
        await request("/api/knowledge/add", {
          method: "POST",
          body: JSON.stringify({ question, answer }),
        });
        setMessage("Question and answer added successfully.", "success");
      }

      resetForm();
      await loadKnowledge();
    } catch (error) {
      setMessage(error?.message || "Could not save the question.", "error");
    } finally {
      saveButton.disabled = false;
    }
  });

  cancelButton?.addEventListener("click", () => {
    resetForm();
    setMessage("Edit cancelled.");
  });

  reloadButton?.addEventListener("click", loadKnowledge);

  knowledgeList.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-index]");
    if (editButton) {
      if (typeof window.__chatbotAdminUnlocked === "function" && !window.__chatbotAdminUnlocked()) {
        alert("Admin access required. Please unlock Admin Mode first.");
        return;
      }
      startEdit(Number.parseInt(editButton.dataset.editIndex, 10));
      return;
    }

    const deleteButton = event.target.closest("[data-delete-index]");
    if (!deleteButton) return;

    if (typeof window.__chatbotAdminUnlocked === "function" && !window.__chatbotAdminUnlocked()) {
      alert("Admin access required. Please unlock Admin Mode first.");
      return;
    }

    const index = Number.parseInt(deleteButton.dataset.deleteIndex, 10);
    const item = knowledgeItems[index];
    if (!item) return;

    const confirmed = window.confirm(
      `Delete this question?\n\n${item.question}`,
    );
    if (!confirmed) return;

    deleteButton.disabled = true;

    try {
      await request("/api/knowledge/delete", {
        method: "POST",
        body: JSON.stringify({ question: item.question }),
      });

      if (editingQuestion === item.question) {
        resetForm();
      }

      setMessage("Question and answer deleted successfully.", "success");
      await loadKnowledge();
    } catch (error) {
      setMessage(error?.message || "Could not delete the question.", "error");
      deleteButton.disabled = false;
    }
  });

  // Load once at startup so the FAQ page is ready immediately.
  loadKnowledge();
})();

/* ============================================================
   ADMIN MODE + KNOWLEDGE FILTERING
   Additive protection for FAQ management.
============================================================ */
(() => {
  "use strict";

  const adminPassword = document.getElementById("adminPassword");
  const adminLoginButton = document.getElementById("adminLoginButton");
  const adminLogoutButton = document.getElementById("adminLogoutButton");
  const adminStatusBadge = document.getElementById("adminStatusBadge");
  const adminMessage = document.getElementById("adminMessage");
  const knowledgeSaveButton = document.getElementById("knowledgeSaveButton");
  const knowledgeCancelButton = document.getElementById(
    "knowledgeCancelButton",
  );
  const knowledgeReloadButton = document.getElementById(
    "knowledgeReloadButton",
  );
  const categoryFilter = document.getElementById("knowledgeCategoryFilter");
  const knowledgeSearch = document.getElementById("knowledgeSearch");
  const knowledgeList = document.getElementById("knowledgeTableBody");

  if (!knowledgeSaveButton || !knowledgeList) return;

  const adminKey = "chatbotAdminUnlocked";
  window.__chatbotAdminUnlocked = () => adminUnlocked === true;

  const showAdminMessage = (text, type = "") => {
    if (!adminMessage) return;
    adminMessage.textContent = text;
    adminMessage.className = `knowledge-message ${type}`.trim();
  };

  const applyAdminState = () => {
    const unlocked = adminUnlocked === true;
    [knowledgeSaveButton, knowledgeCancelButton].forEach((button) => {
      if (button) button.disabled = !unlocked;
    });
    document
      .querySelectorAll(".knowledge-edit-btn, .knowledge-delete-btn")
      .forEach((button) => {
        button.disabled = !unlocked;
        button.style.display = unlocked ? "inline-block" : "none";
      });
    if (adminStatusBadge) {
      adminStatusBadge.textContent = unlocked ? "Unlocked" : "Locked";
      adminStatusBadge.classList.toggle("locked", !unlocked);
      adminStatusBadge.classList.toggle("unlocked", unlocked);
    }
    if (adminLoginButton) adminLoginButton.hidden = unlocked;
    if (adminLogoutButton) adminLogoutButton.hidden = !unlocked;
    if (adminPassword) adminPassword.disabled = unlocked;

    const knowledgeAddCard = document.getElementById("addKnowledgeBtn");
    if (knowledgeAddCard) {
      knowledgeAddCard.style.display = unlocked ? "flex" : "none";
    }
  };

  const getPassword = () => {
    try {
      return sessionStorage.getItem("chatbotAdminToken") || "";
    } catch (_) {
      return "";
    }
  };

  const setPassword = (value) => {
    try {
      sessionStorage.setItem("chatbotAdminToken", value);
    } catch (_) {}
  };

  const authHeaders = () => {
    const password = getPassword();
    return password ? { "X-Admin-Token": password } : {};
  };

  async function login() {
    const password = adminPassword?.value.trim() || "";
    if (!password) {
      showAdminMessage("Enter the admin password.", "error");
      return;
    }
    adminLoginButton.disabled = true;
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (response.status === 429) {
        throw new Error(
          data?.error || "Too many attempts. Please try again later.",
        );
      }
      if (!response.ok || !data.authenticated)
        throw new Error(data?.message || "Invalid admin password.");
      setPassword(data.token || "");
      adminUnlocked = true;
      applyAdminState();
      showAdminMessage(
        "Admin mode unlocked. You can now manage FAQs.",
        "success",
      );
    } catch (error) {
      adminUnlocked = false;
      applyAdminState();
      showAdminMessage(error?.message || "Admin login failed.", "error");
    } finally {
      adminLoginButton.disabled = false;
    }
  }

  adminLoginButton?.addEventListener("click", login);
  adminPassword?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") login();
  });
  adminLogoutButton?.addEventListener("click", () => {
    adminUnlocked = false;
    try {
      sessionStorage.removeItem("chatbotAdminToken");
    } catch (_) {}
    applyAdminState();
    showAdminMessage("Admin mode locked.");
  });

  const toggleAdminVisBtn = document.getElementById("toggleAdminVisBtn");
  if (toggleAdminVisBtn && adminPassword) {
    toggleAdminVisBtn.addEventListener("click", () => {
      if (adminPassword.type === "password") {
        adminPassword.type = "text";
        toggleAdminVisBtn.innerHTML = `<i data-lucide="eye-off" style="width: 1em; height: 1em; vertical-align: middle;"></i>`;
      } else {
        adminPassword.type = "password";
        toggleAdminVisBtn.innerHTML = `<i data-lucide="eye" style="width: 1em; height: 1em; vertical-align: middle;"></i>`;
      }
    });
  }

  // Patch the knowledge request function by adding the admin header before calls are made.
  // Existing knowledge UI remains; only write requests are protected.
  const originalFetch = window.fetch.bind(window);
  window.fetch = function (url, options = {}) {
    const target = String(url || "");
    if (
      /\/api\/(knowledge\/(add|update|delete)|history\/(clear|export))$/.test(
        target,
      )
    ) {
      options = {
        ...options,
        headers: { ...(options.headers || {}), ...authHeaders() },
      };
    }
    return originalFetch(url, options);
  };

  if (getPassword()) {
    adminUnlocked = true;
  }
  applyAdminState();
  const knowledgeObserver = new MutationObserver(() => applyAdminState());
  knowledgeObserver.observe(knowledgeList, { childList: true, subtree: true });

    const renderFilteredKnowledge = () => { if (typeof window.__chatbotRenderPaginatedKnowledge === 'function') window.__chatbotRenderPaginatedKnowledge(); };

  categoryFilter?.addEventListener("change", () => {
    const items = window.__chatbotKnowledgeItems;
    if (Array.isArray(items)) renderFilteredKnowledge();
  });
  knowledgeSearch?.addEventListener("input", () => {
    const items = window.__chatbotKnowledgeItems;
    if (Array.isArray(items)) renderFilteredKnowledge();
  });
})();

/* Load server-backed session history alongside the original local history. */
loadBackendHistory();

/* Copy Code functionality */
if (chat) {
  chat.addEventListener("click", async (e) => {
    if (e.target.classList.contains("copy-code-btn")) {
      const btn = e.target;
      const codeBlock = btn.closest(".answer-code");
      if (!codeBlock) return;
      const pre = codeBlock.querySelector("pre");
      if (pre) {
        try {
          await navigator.clipboard.writeText(pre.innerText);
          const originalText = btn.innerText;
          btn.innerText = "Copied!";
          btn.classList.add("copied");
          setTimeout(() => {
            btn.innerText = originalText;
            btn.classList.remove("copied");
          }, 2000);
        } catch (err) {
          console.error("Failed to copy", err);
          btn.innerText = "Error";
        }
      }
    }
  });
}






document.addEventListener("click", function (event) {
  const btn = event.target.closest(".copy-btn");
  if (!btn) return;
  const bubble = btn.closest(".assistant-bubble");
  if (!bubble) return;
  const content = bubble.querySelector(".assistant-content");
  if (content) {
    navigator.clipboard.writeText(content.textContent.trim());
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="check" style="width: 16px; height: 16px;"></i>`;
    if (typeof lucide !== "undefined") lucide.createIcons();
    setTimeout(() => { btn.innerHTML = originalHTML; if (typeof lucide !== "undefined") lucide.createIcons(); }, 2000);
  }
});


document.getElementById("clearChatBtnTop")?.addEventListener("click", () => {
  if (typeof confirmNewChatUI === "function") {
    confirmNewChatUI();
  }
});

const globalThemeToggleBtn = document.getElementById("globalThemeToggleBtn");

function toggleThemeAction(e) {
  e.preventDefault();
  e.stopPropagation();
  document.body.classList.toggle("dark-mode");
  const isDark = document.body.classList.contains("dark-mode");
  
  if (globalThemeToggleBtn) {
    globalThemeToggleBtn.innerHTML = isDark ? '<i data-lucide="sun" class="nav-icon"></i><span> Light Mode </span>' : '<i data-lucide="moon" class="nav-icon"></i><span> Dark Mode </span>';
  }
  
  if (typeof lucide !== "undefined") lucide.createIcons();
  saveSettings();
}

if (globalThemeToggleBtn) {
  globalThemeToggleBtn.addEventListener("click", toggleThemeAction);
}











/* ============================================================
   KNOWLEDGE BASE MODAL LOGIC
============================================================ */
(function() {
  const addBtn = document.getElementById("addKnowledgeBtn");
  const modal = document.getElementById("knowledgeModal");
  const cancelBtn = document.getElementById("knowledgeCancelButton");
  const saveBtn = document.getElementById("knowledgeSaveButton");

  if (!addBtn || !modal) return;

  function showModal() {
    if (typeof window.__chatbotAdminUnlocked === "function" && !window.__chatbotAdminUnlocked()) {
      alert("Admin access required. Please unlock Admin Mode first.");
      return;
    }
    modal.style.display = "flex";
  }

  function hideModal() {
    modal.style.display = "none";
    if (typeof window.__chatbotResetKnowledgeForm === "function") window.__chatbotResetKnowledgeForm();
  }

  addBtn.addEventListener("click", showModal);
  
  if (cancelBtn) {
    cancelBtn.addEventListener("click", hideModal);
  }

  const closeIconBtn = document.getElementById('knowledgeCloseIconBtn');
  if (closeIconBtn) closeIconBtn.addEventListener('click', hideModal);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hideModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
      hideModal();
    }
  });

  // Ensure startEdit also shows modal (intercepting existing behavior)
  const list = document.getElementById("knowledgeTableBody");
  if (list) {
    list.addEventListener("click", (e) => {
      const editBtn = e.target.closest("[data-edit-index]");
      if (editBtn) {
        setTimeout(showModal, 10); // Let the original handler run, then show modal
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      // In a real scenario, this waits for success. For UI demo, close after brief delay.
      setTimeout(hideModal, 500); 
    });
  }
})();























function openPreviewFromHistory(id) {
  const item = readHistory().find(h => h.id === id) || mergedHistoryItems().find(h => String(h.id) === String(id));
  if (!item) return;

  document.querySelectorAll("#historyList .history-item").forEach(el => el.classList.remove("active-preview"));
  const domItem = document.querySelector(`.history-item[data-history-id="${id}"]`);
  if (domItem) domItem.classList.add("active-preview");

  const emptyEl = document.getElementById("historyPreviewEmpty");
  const contentEl = document.getElementById("historyPreviewContent");
  if (emptyEl) emptyEl.style.display = "none";
  if (contentEl) contentEl.style.display = "flex";

  const titleTarget = document.getElementById("historyPreviewTitle");
  const dateTarget = document.getElementById("historyPreviewDate");
  if (titleTarget) titleTarget.textContent = item.title || "Conversation";
  if (dateTarget) dateTarget.textContent = item.date || "";

  const bubblesTarget = document.getElementById("historyPreviewBubbles");
  if (bubblesTarget) {
    if (item.html) {
      bubblesTarget.innerHTML = sanitizeStoredHtml(item.html);
    } else if (item.backendSession && Array.isArray(item.backendSession.messages)) {
      // Backend format
      bubblesTarget.innerHTML = item.backendSession.messages.map(m => {
        return `
          <div class="message-row user-row"><div class="bubble user-bubble">${escapeHtml(m.question)}</div><div class="user-avatar"><i data-lucide="user"></i></div></div>
          <div class="message-row assistant-row"><div class="assistant-avatar"><i data-lucide="bot"></i></div><div class="bubble assistant-bubble">${formatAssistantText(m.answer)}</div></div>
        `;
      }).join("");
    } else {
      bubblesTarget.innerHTML = "<p>No content available.</p>";
    }
  }

  const loadBtn = document.getElementById("historyPreviewLoadBtn");
  if (loadBtn) loadBtn.dataset.historyId = id;
  if (window.lucide) { window.lucide.createIcons(); }
}

document.addEventListener("click", function(event) {
  const loadBtn = event.target.closest("#historyPreviewLoadBtn");
  if (!loadBtn || !loadBtn.dataset.historyId) return;
  openConversationFromHistory(loadBtn.dataset.historyId);

});










function clearPreviewPane() {
  const emptyEl = document.getElementById("historyPreviewEmpty");
  const contentEl = document.getElementById("historyPreviewContent");
  if (emptyEl) emptyEl.style.display = "flex";
  if (contentEl) contentEl.style.display = "none";
  
  const titleTarget = document.getElementById("historyPreviewTitle");
  const dateTarget = document.getElementById("historyPreviewDate");
  if (titleTarget) titleTarget.textContent = "";
  if (dateTarget) dateTarget.textContent = "";
  
  const bubblesTarget = document.getElementById("historyPreviewBubbles");
  if (bubblesTarget) bubblesTarget.innerHTML = "";
  
  const loadBtn = document.getElementById("historyPreviewLoadBtn");
  if (loadBtn) delete loadBtn.dataset.historyId;
}








// Eye Toggle logic
(function() {
  const toggleBtn = document.getElementById('toggleAdminPassword');
  const passwordInput = document.getElementById('adminPassword');
  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener('click', () => {
      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.innerHTML = '<i data-lucide="eye-off" style="width: 16px; height: 16px;"></i>';
      } else {
        passwordInput.type = 'password';
        toggleBtn.innerHTML = '<i data-lucide="eye" style="width: 16px; height: 16px;"></i>';
      }
      if (typeof lucide !== 'undefined') lucide.createIcons();
    });
  }
})();

















// Pagination & Render Logic
window.kbCurrentPage = 1;
window.kbItemsPerPage = 10;
window.__chatbotRenderPaginatedKnowledge = function() {
  const list = document.getElementById('knowledgeTableBody');
  const countSpan = document.getElementById('knowledgeTotalCount');
  const searchInput = document.getElementById('knowledgeSearch');
  
  const items = Array.isArray(window.__chatbotKnowledgeItems) ? window.__chatbotKnowledgeItems : [];
  const query = (searchInput?.value || '').trim().toLowerCase();
  
  const filtered = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (query && !item.question.toLowerCase().includes(query) && !item.answer.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
    
  if (countSpan) countSpan.textContent = items.length;

  const totalPages = Math.ceil(filtered.length / window.kbItemsPerPage) || 1;
  if (window.kbCurrentPage > totalPages) window.kbCurrentPage = totalPages;

  const prevBtn = document.getElementById('kbPagePrev');
  const nextBtn = document.getElementById('kbPageNext');
  const currPageBtn = document.getElementById('kbPageCurr');

  if (prevBtn) prevBtn.disabled = window.kbCurrentPage === 1;
  if (nextBtn) nextBtn.disabled = window.kbCurrentPage === totalPages;
  if (currPageBtn) currPageBtn.textContent = window.kbCurrentPage;
  
  if (prevBtn) prevBtn.style.opacity = window.kbCurrentPage === 1 ? '0.5' : '1';
  if (nextBtn) nextBtn.style.opacity = window.kbCurrentPage === totalPages ? '0.5' : '1';

  if (!filtered.length) {
    if (list) list.innerHTML = '<tr><td colspan="4" style="padding: 16px; text-align: center; color: var(--text-light);">No FAQs match this filter.</td></tr>';
    return;
  }
  
  const startIndex = (window.kbCurrentPage - 1) * window.kbItemsPerPage;
  const paginated = filtered.slice(startIndex, startIndex + window.kbItemsPerPage);
  
  if (list) {
    list.innerHTML = paginated
      .map(
        ({ item, index }, localIdx) => {
          const displayNum = startIndex + localIdx + 1;
          return `<tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 16px; color: var(--text-light);">${displayNum}</td>
            <td style="padding: 16px; color: var(--text); font-weight: 500;">${escapeHtml(item.question)}</td>
            <td style="padding: 16px; color: var(--text-light);">${escapeHtml(item.answer)}</td>
            <td style="padding: 16px; text-align: center;">
              <div style="display: flex; gap: 8px; justify-content: center;">
                <button class="knowledge-edit-btn" data-edit-index="${index}" style="background: var(--primary); color: white; border: none; width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                  <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
                </button>
                <button class="knowledge-delete-btn" data-delete-index="${index}" style="background: var(--danger); color: white; border: none; width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                  <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
              </div>
            </td>
          </tr>`;
        }
      )
      .join('');
  }
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  const isUnlocked = typeof window.__chatbotAdminUnlocked === 'function' ? window.__chatbotAdminUnlocked() : false;
  document.querySelectorAll('.knowledge-edit-btn, .knowledge-delete-btn').forEach((button) => {
    button.disabled = !isUnlocked;
    button.style.display = isUnlocked ? 'inline-block' : 'none';
  });
};

(function() {
  const prevBtn = document.getElementById('kbPagePrev');
  const nextBtn = document.getElementById('kbPageNext');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (window.kbCurrentPage > 1) {
        window.kbCurrentPage--;
        window.__chatbotRenderPaginatedKnowledge();
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      window.kbCurrentPage++;
      window.__chatbotRenderPaginatedKnowledge();
    });
  }
  
  const searchInput = document.getElementById('knowledgeSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      window.kbCurrentPage = 1;
      window.__chatbotRenderPaginatedKnowledge();
    });
  }
})();












/* ============================================================
   USER TYPING INDICATOR
============================================================ */
(() => {
  const chat = document.getElementById("chat");
  const input = document.getElementById("promptInput");
  const form = document.getElementById("promptForm");

  if (!chat || !input || !form) return;

  let typingRow = null;

  function showTyping() {
    if (!typingRow) {
      typingRow = document.createElement("div");
      typingRow.className = "message-row user-row typing-indicator-row";
      typingRow.innerHTML = `
        <div class="bubble user-bubble" style="background: transparent; box-shadow: none; padding: 0; color: var(--text-light); font-style: italic; min-height: 0; height: auto !important;">
          Typing...
        </div>
        <div class="user-avatar" style="visibility: hidden; min-width: 36px !important; margin: 0 !important;"></div>`;
    }
    if (!typingRow.isConnected) {
      const wasNearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 150;
      chat.appendChild(typingRow);
      if (wasNearBottom) chat.scrollTop = chat.scrollHeight;
    }
  }

  function hideTyping() {
    if (typingRow && typingRow.isConnected) {
      typingRow.remove();
    }
  }
  
  // Make hideTyping available globally for generateResponse
  window.__hideUserTyping = hideTyping;

  input.addEventListener("input", () => {
    if (input.value.trim().length > 0) {
      showTyping();
    } else {
      hideTyping();
    }
  });

  form.addEventListener("submit", () => {
    hideTyping();
  });
})();

/* ============================================================
   EXPORT CONVERSATION HISTORY
============================================================ */
function confirmExportHistoryUI() {
  const history = mergedHistoryItems();
  
  if (!history || !history.length) {
    alert("No conversation history is currently available to export.");
    return;
  }

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:100000;backdrop-filter:blur(2px);";
  
  const box = document.createElement("div");
  box.style.cssText = "background:var(--surface,#fff);padding:24px;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.2);width:90%;max-width:400px;border:1px solid var(--border,#e2e8f0);animation:fadeIn 0.2s ease-out; display:flex; flex-direction:column; max-height: 80vh;";
  
  const title = document.createElement("h3");
  title.innerText = "Export Conversation History";
  title.style.cssText = "margin:0 0 16px 0;font-size:18px;color:var(--text,#172033);font-weight:700;line-height:1.4;";
  
  const listContainer = document.createElement("div");
  listContainer.style.cssText = "flex: 1; overflow-y: auto; margin-bottom: 16px; border: 1px solid var(--border); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;";
  
  history.forEach((item, index) => {
    const label = document.createElement("label");
    label.style.cssText = "display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; color: var(--text); padding: 4px 0;";
    
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "export-checkbox";
    cb.value = index;
    cb.checked = false;
    
    const textSpan = document.createElement("span");
    textSpan.style.cssText = "white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px;";
    textSpan.innerText = item.title || item.question || `Conversation ${index + 1}`;
    
    label.appendChild(cb);
    label.appendChild(textSpan);
    listContainer.appendChild(label);
  });

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:12px;justify-content:flex-end;";
  
  const selectAllBtn = document.createElement("button");
  selectAllBtn.innerText = "Select All";
  selectAllBtn.style.cssText = "background:transparent;color:var(--primary);border:none;padding:10px 16px;border-radius:8px;font-weight:600;cursor:pointer; margin-right: auto;";
  let allSelected = false;
  selectAllBtn.onclick = () => {
    allSelected = !allSelected;
    box.querySelectorAll(".export-checkbox").forEach(cb => cb.checked = allSelected);
    selectAllBtn.innerText = allSelected ? "Deselect All" : "Select All";
  };

  const cancelBtn = document.createElement("button");
  cancelBtn.innerText = "Cancel";
  cancelBtn.style.cssText = "background:var(--surface-soft,#f1f5f9);color:var(--text-light,#64748b);border:none;padding:10px 16px;border-radius:8px;font-weight:600;cursor:pointer;";
  cancelBtn.onclick = () => overlay.remove();
  
  const exportBtn = document.createElement("button");
  exportBtn.innerText = "Export as TXT";
  exportBtn.style.cssText = "background:var(--primary);color:white;border:none;padding:10px 16px;border-radius:8px;font-weight:600;cursor:pointer;";
  exportBtn.onclick = () => {
    const selectedIndexes = Array.from(box.querySelectorAll(".export-checkbox"))
                                 .filter(cb => cb.checked)
                                 .map(cb => parseInt(cb.value, 10));
    
    if (selectedIndexes.length === 0) {
      alert("Please select at least one conversation to export.");
      return;
    }
    
    const selectedHistory = selectedIndexes.map(idx => history[idx]);
    generateAndDownloadExport(selectedHistory);
    overlay.remove();
  };
  
  btnRow.appendChild(selectAllBtn);
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(exportBtn);
  
  box.appendChild(title);
  box.appendChild(listContainer);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function generateAndDownloadExport(selectedHistory) {
  let txtContent = "CHATBOT CONVERSATION HISTORY\n========================================\n\n";
  
  selectedHistory.forEach((conv, index) => {
    txtContent += `Conversation ${index + 1}\n`;
    
    let convDate = "Unknown Date";
    let convTime = "";
    if (conv.date) {
      const parts = conv.date.split(", ");
      if (parts.length === 2) {
        convDate = `Date: ${parts[0]}`;
        convTime = `\nTime: ${parts[1]}`;
      } else {
        convDate = `Date: ${conv.date}`;
      }
    } else {
        if (conv.backendSession && conv.backendSession.updatedAt) {
            const d = new Date(conv.backendSession.updatedAt);
            convDate = `Date: ` + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            convTime = `\nTime: ` + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        }
    }
    
    txtContent += `${convDate}${convTime}\n----------------------------------------\n\n`;
    
    const messages = [];
    if (conv._backend && conv.backendSession && Array.isArray(conv.backendSession.messages)) {
      conv.backendSession.messages.forEach(m => {
        messages.push({ role: "USER", text: m.question || "" });
        messages.push({ role: "BOT", text: m.answer || "" });
      });
    } else if (conv.html) {
      const temp = document.createElement("div");
      temp.innerHTML = conv.html;
      temp.style.cssText = "position:absolute;left:-9999px;visibility:hidden;width:1000px;";
      document.body.appendChild(temp);
      
      const rows = temp.querySelectorAll(".message-row");
      rows.forEach(row => {
        if (row.classList.contains("welcome-state") || row.classList.contains("loading-message")) return;
        const isUser = row.classList.contains("user-row");
        const bubble = row.querySelector(".bubble");
        if (bubble) {
          const clone = bubble.cloneNode(true);
          clone.querySelectorAll(".message-meta, .user-edit-row, .message-actions, button, time, .typing-indicator").forEach(el => el.remove());
          
          let text = "";
          if (clone.innerText !== undefined) {
             text = clone.innerText.trim();
          } else {
             clone.innerHTML = clone.innerHTML.replace(/<br\s*[\/]?>/gi, "\n").replace(/<\/p>/gi, "\n\n");
             text = clone.textContent.trim();
          }
          if (text) {
             messages.push({ role: isUser ? "USER" : "BOT", text: text });
          }
        }
      });
      document.body.removeChild(temp);
    } else if (conv.question) {
      messages.push({ role: "USER", text: conv.question });
      if (conv.answer) {
        messages.push({ role: "BOT", text: conv.answer });
      }
    }
    
    messages.forEach(m => {
      txtContent += `${m.role}:\n${m.text}\n\n`;
    });
    
    txtContent += `========================================\n\n`;
  });
  
  const blob = new Blob([txtContent], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Chatbot_History_${new Date().toISOString().slice(0,10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

(() => {
  const exportBtn = document.getElementById("exportHistoryButtonUI");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      if (exportBtn.disabled) {
        alert("No conversation history is currently available to export.");
        return;
      }
      confirmExportHistoryUI();
    });
  }
})();
/* ============================================================
   USER MESSAGE EDITING
============================================================ */
let editActive = false;

function setEditing(button, text) {
  if (!input) return;

  document
    .querySelectorAll(".edit-user-message-btn.editing")
    .forEach((other) => other.classList.remove("editing"));

  button.classList.add("editing");

  input.value = text;
  input.dataset.editingMessage = "true";

  input.focus();
  input.select();

  editActive = true;

  let label = document.getElementById("composerEditingLabel");

  if (!label) {
    label = document.createElement("div");
    label.id = "composerEditingLabel";
    label.style.cssText = `
      position: absolute;
      top: -24px;
      left: 12px;
      font-size: 11px;
      font-weight: 600;
      color: var(--primary);
      background: var(--primary-light);
      padding: 2px 8px;
      border-radius: 4px;
      pointer-events: none;
      animation: fadeIn 0.2s ease-out;
    `;
    label.textContent = "Editing previous message";
    
    const wrapper = input.closest('.input-wrapper') || input.parentElement;
    if (wrapper) {
      if (getComputedStyle(wrapper).position === 'static') {
        wrapper.style.position = 'relative';
      }
      wrapper.appendChild(label);
    }
  }
}


document.addEventListener("click", function (event) {
  const editBtn = event.target.closest(".edit-user-message-btn");
  if (editBtn) {
    const bubble = editBtn.closest(".user-bubble");
    if (bubble) {
      const clone = bubble.cloneNode(true);
      clone.querySelector(".user-edit-row")?.remove();
      clone.innerHTML = clone.innerHTML.replace(/<br\s*[\/]?>/gi, "\n");
      const text = clone.textContent.trim();
      setEditing(editBtn, text);
    }
  }
});

/* ============================================================
   WELCOME SCREEN
============================================================ */
(() => {
  const enterBtn = document.getElementById("enterChatbotButton");
  const welcomeScreen = document.getElementById("entryWelcomeScreen");
  if (enterBtn && welcomeScreen) {
    enterBtn.addEventListener("click", () => {
      welcomeScreen.style.opacity = '0';
      welcomeScreen.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        if (welcomeScreen.parentNode) {
          welcomeScreen.parentNode.removeChild(welcomeScreen);
        }
      }, 300);
      
      const input = document.getElementById("promptInput");
      if (input) input.focus();
    });
  }
})();



