/*
============================================================
 CHATBOT ASSISTANT
 C++ BACKEND + GROQ API
============================================================

Original backend is preserved and extended with:
  1. Question/answer storage in chat_history.txt
  2. DOCX/TXT reading
  3. Image reading through Groq vision
  4. Refresh/regenerate response under every new AI answer
  5. Safe update of the matching history record

The original Groq text model remains:
  openai/gpt-oss-20b

The current Groq multimodal model used for images is:
  qwen/qwen3.6-27b
============================================================
*/

#if defined(_WIN32)
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#endif

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cctype>
#include <cstdlib>
#include <cstdio>
#include <ctime>

#include <fstream>
#include <iomanip>
#include <iostream>
#include <mutex>
#include <random>
#include <queue>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>
#include <curl/curl.h>

#include "httplib.h"
#include "json.hpp"

using json = nlohmann::json;

// ============================================================
// PROJECT FILES
// ============================================================

const std::string HTML_FILE = "index.html";
const std::string CSS_FILE = "style.css";
const std::string JS_FILE = "script.js";
const std::string CHAT_HISTORY_FILE = "chat_history.json";
const std::string KNOWLEDGE_FILE = "knowledge.json";

// ============================================================
// GROQ API SETTINGS
// ============================================================

// API secrets are loaded from environment variables only.
const std::string GROQ_URL =
    "https://api.groq.com/openai/v1/chat/completions";

const std::string GROQ_MODEL =
    "openai/gpt-oss-20b";

const std::string GROQ_VISION_MODEL =
    "qwen/qwen3.8-27b";

const std::size_t MAX_FILE_SIZE = 15ULL * 1024ULL * 1024ULL;
const std::size_t MAX_TEXT_FOR_PROMPT = 800000ULL;
const std::size_t MAX_INLINE_IMAGE_BYTES = 15ULL * 1024ULL * 1024ULL;
const std::size_t MAX_CONTEXT_RECORDS = 10;
const std::size_t MAX_MESSAGE_LENGTH = 10000;

// Security: rate limiting
const int MAX_LOGIN_ATTEMPTS = 5;
const int LOCKOUT_DURATION_SECONDS = 900; // 15 minutes
const int SESSION_EXPIRY_SECONDS = 86400; // 24 hours

std::mutex historyMutex;

std::mutex knowledgeMutex;

// ============================================================
// RATE LIMITING
// ============================================================

struct LoginAttemptRecord
{
    int failedAttempts = 0;
    std::chrono::steady_clock::time_point lockedUntil;
};

std::mutex rateLimitMutex;
std::unordered_map<std::string, LoginAttemptRecord> loginAttempts;

// ============================================================
// SESSION TOKEN STORAGE
// ============================================================

struct SessionToken
{
    std::string token;
    std::chrono::steady_clock::time_point expiresAt;
};

std::mutex sessionMutex;
std::vector<SessionToken> activeSessions;

struct KnowledgeItem
{
    std::string question;
    std::string answer;
};

// ============================================================
// KNOWLEDGE / FAQ HELPERS
// ============================================================

std::string trim(const std::string &value);
std::string toLower(std::string value);

std::string normalizeText(const std::string &value)
{
    std::string normalized = toLower(value);
    std::string output;
    output.reserve(normalized.size());

    bool previousSpace = false;

    for (char c : normalized)
    {
        if (std::isalnum(static_cast<unsigned char>(c)))
        {
            output.push_back(c);
            previousSpace = false;
        }
        else if (!previousSpace)
        {
            output.push_back(' ');
            previousSpace = true;
        }
    }

    return trim(output);
}

// ------------------------------------------------------------
// Better basic intelligence: synonyms + token-overlap matching
// ------------------------------------------------------------

std::string canonicalToken(const std::string &token)
{
    static const std::unordered_map<std::string, std::string> synonyms = {
        {"c", "cplusplus"}, {"cpp", "cplusplus"}, {"cxx", "cplusplus"}, {"cplusplus", "cplusplus"}, {"js", "javascript"}, {"javascript", "javascript"}, {"ai", "artificialintelligence"}, {"artificial", "artificial"}, {"intelligence", "intelligence"}, {"bot", "chatbot"}, {"chatbot", "chatbot"}, {"faq", "frequentlyaskedquestions"}, {"question", "question"}, {"questions", "question"}, {"answer", "answer"}, {"answers", "answer"}, {"api", "applicationprogramminginterface"}, {"interface", "applicationprogramminginterface"}, {"application", "application"}, {"programming", "programming"}, {"html", "html"}, {"css", "css"}, {"styling", "style"}, {"style", "style"}, {"webpage", "web"}, {"website", "web"}, {"web", "web"}, {"file", "file"}, {"files", "file"}, {"handling", "handling"}, {"history", "history"}, {"conversation", "conversation"}, {"conversations", "conversation"}, {"help", "help"}, {"doing", "do"}, {"does", "do"}, {"work", "work"}, {"working", "work"}, {"use", "use"}, {"using", "use"}, {"make", "create"}, {"making", "create"}};
    const auto &it = synonyms.find(token);
    return it == synonyms.end() ? token : it->second;
}

std::vector<std::string> intelligenceTokens(const std::string &value)
{
    static const std::unordered_map<std::string, bool> stopWords = {
        {"what", true}, {"is", true}, {"are", true}, {"the", true}, {"a", true}, {"an", true}, {"your", true}, {"you", true}, {"how", true}, {"who", true}, {"can", true}, {"do", true}, {"to", true}, {"of", true}, {"and", true}, {"in", true}, {"for", true}, {"on", true}, {"this", true}, {"that", true}, {"tell", true}, {"me", true}, {"please", true}, {"about", true}};

    std::vector<std::string> result;
    std::istringstream stream(normalizeText(value));
    std::string token;
    while (stream >> token)
    {
        if (stopWords.find(token) != stopWords.end())
            continue;
        result.push_back(canonicalToken(token));
    }
    std::sort(result.begin(), result.end());
    result.erase(std::unique(result.begin(), result.end()), result.end());
    return result;
}

std::string inferKnowledgeCategory(const std::string &question)
{
    const std::string q = normalizeText(question);
    if (q.find("cpp") != std::string::npos || q.find("cplusplus") != std::string::npos || q.find("html") != std::string::npos || q.find("css") != std::string::npos || q.find("javascript") != std::string::npos)
        return "Technology";
    if (q.find("api") != std::string::npos || q.find("application programming interface") != std::string::npos || q.find("ai") != std::string::npos || q.find("artificial intelligence") != std::string::npos)
        return "AI & APIs";
    if (q.find("file") != std::string::npos)
        return "File Handling";
    if (q.find("chat") != std::string::npos || q.find("conversation") != std::string::npos || q.find("name") != std::string::npos)
        return "Chatbot Basics";
    return "General";
}

bool containsKeyword(const std::string &message, const std::vector<std::string> &keywords)
{
    const std::string normalizedMessage = normalizeText(message);

    for (const std::string &keyword : keywords)
    {
        const std::string normalizedKeyword = normalizeText(keyword);
        if (normalizedKeyword.empty())
        {
            continue;
        }

        if (normalizedMessage == normalizedKeyword)
        {
            return true;
        }
    }

    return false;
}

std::string keywordResponse(const std::string &message)
{
    if (containsKeyword(message, {"hi", "hello", "hey", "good morning", "good afternoon", "good evening"}))
    {
        return "Hello! How can I help you today?";
    }

    if (containsKeyword(message, {"bye", "goodbye", "see you", "see you later"}))
    {
        return "Goodbye! Have a nice day!";
    }

    if (containsKeyword(message, {"thanks", "thank you"}))
    {
        return "You're welcome! I'm happy to help.";
    }

    return "";
}

std::vector<KnowledgeItem> defaultKnowledgeItems()
{
    return {
        {"what is your name", "I am Chatbot Assistant, a simple AI chatbot project."},
        {"who are you", "I am Chatbot Assistant. I can answer questions and help with common tasks."},
        {"what can you do", "I can answer questions, use predefined knowledge, read supported files, and use the Groq AI API."},
        {"how does this chatbot work", "The chatbot first checks keywords and predefined knowledge. If there is no matching answer, it can ask the Groq AI API."},
        {"what is a chatbot", "A chatbot is a program that communicates with users through text-based conversation."},
        {"what is c++", "C++ is a general-purpose programming language used to build many types of software."},
        {"what is html", "HTML is the standard markup language used to structure web pages."},
        {"what is css", "CSS is used to style and design web pages."},
        {"what is javascript", "JavaScript is a programming language commonly used to make web pages interactive."},
        {"what is an api", "An API is a way for two software systems to communicate with each other."},
        {"what is ai", "Artificial Intelligence is technology that enables computers to perform tasks that normally require human-like intelligence."},
        {"what is file handling", "File handling means creating, reading, writing, and updating data stored in files."}};
}

void ensureKnowledgeFile()
{
    std::lock_guard<std::mutex> lock(knowledgeMutex);

    std::ifstream existing(KNOWLEDGE_FILE, std::ios::in | std::ios::binary);
    if (existing.is_open())
    {
        existing.close();
        return;
    }

    std::ofstream file(KNOWLEDGE_FILE, std::ios::out | std::ios::trunc | std::ios::binary);
    if (!file.is_open())
    {
        std::cerr << "Warning: Could not create " << KNOWLEDGE_FILE << std::endl;
        return;
    }

    json arr = json::array();
    for (const KnowledgeItem &item : defaultKnowledgeItems())
    {
        arr.push_back({{"question", item.question}, {"answer", item.answer}});
    }
    file << arr.dump(4);
}

std::vector<KnowledgeItem> readKnowledgeItemsUnlocked()
{
    std::vector<KnowledgeItem> items;
    std::ifstream file(KNOWLEDGE_FILE, std::ios::in | std::ios::binary);

    if (!file.is_open())
    {
        return items;
    }

    try
    {
        json arr;
        file >> arr;
        if (arr.is_array())
        {
            for (const auto& el : arr)
            {
                if (el.contains("question") && el.contains("answer"))
                {
                    KnowledgeItem item;
                    item.question = el["question"].get<std::string>();
                    item.answer = el["answer"].get<std::string>();
                    items.push_back(item);
                }
            }
        }
    }
    catch (...) {}

    return items;
}

bool writeKnowledgeItemsUnlocked(const std::vector<KnowledgeItem> &items, std::string &error)
{
    const std::string tempPath = KNOWLEDGE_FILE + ".tmp";

    std::ofstream output(tempPath, std::ios::out | std::ios::trunc | std::ios::binary);
    if (!output.is_open())
    {
        error = "Could not open the knowledge file for writing.";
        return false;
    }

    json arr = json::array();
    for (const KnowledgeItem &item : items)
    {
        arr.push_back({{"question", item.question}, {"answer", item.answer}});
    }
    output << arr.dump(4);

    output.close();
    if (!output)
    {
        std::remove(tempPath.c_str());
        error = "Could not write the knowledge file completely.";
        return false;
    }

    std::remove(KNOWLEDGE_FILE.c_str());

    if (std::rename(tempPath.c_str(), KNOWLEDGE_FILE.c_str()) != 0)
    {
        std::remove(tempPath.c_str());
        error = "Could not save the knowledge file.";
        return false;
    }

    return true;
}

json knowledgeMatch(const std::string &message)
{
    const std::string normalizedMessage = normalizeText(message);
    if (normalizedMessage.empty())
    {
        return {{"found", false}};
    }

    const std::vector<std::string> messageTokens = intelligenceTokens(normalizedMessage);
    std::lock_guard<std::mutex> lock(knowledgeMutex);
    const std::vector<KnowledgeItem> items = readKnowledgeItemsUnlocked();

    double bestScore = 0.0;
    const KnowledgeItem *bestItem = nullptr;

    for (const KnowledgeItem &item : items)
    {
        const std::string normalizedQuestion = normalizeText(item.question);
        double score = 0.0;

        if (normalizedMessage == normalizedQuestion)
        {
            score = 1.0;
        }
        // Substring matching removed to prevent false positives like "what is cat" containing "what is c"

        const std::vector<std::string> questionTokens = intelligenceTokens(normalizedQuestion);
        if (!messageTokens.empty() && !questionTokens.empty())
        {
            std::size_t overlap = 0;
            for (const std::string &token : messageTokens)
            {
                if (std::find(questionTokens.begin(), questionTokens.end(), token) != questionTokens.end())
                    ++overlap;
            }
            const double coverage = static_cast<double>(overlap) / static_cast<double>(std::max<std::size_t>(1, questionTokens.size()));
            const double messageCoverage = static_cast<double>(overlap) / static_cast<double>(std::max<std::size_t>(1, messageTokens.size()));
            score = std::max(score, 0.35 * coverage + 0.65 * messageCoverage);
        }

        if (score > bestScore)
        {
            bestScore = score;
            bestItem = &item;
        }
    }

    if (!bestItem || bestScore < 0.52)
        return {{"found", false}};

    return {
        {"found", true},
        {"question", bestItem->question},
        {"answer", bestItem->answer},
        {"category", inferKnowledgeCategory(bestItem->question)},
        {"match_score", bestScore}};
}

json listKnowledge()
{
    std::lock_guard<std::mutex> lock(knowledgeMutex);
    const std::vector<KnowledgeItem> items = readKnowledgeItemsUnlocked();
    json result = json::array();

    for (const KnowledgeItem &item : items)
    {
        result.push_back({{"question", item.question},
                          {"answer", item.answer},
                          {"category", inferKnowledgeCategory(item.question)}});
    }

    return result;
}

bool addKnowledgeItem(const std::string &question, const std::string &answer, std::string &error)
{
    const std::string cleanQuestion = trim(question);
    const std::string cleanAnswer = trim(answer);

    if (cleanQuestion.empty() || cleanAnswer.empty())
    {
        error = "Question and answer are required.";
        return false;
    }

    std::lock_guard<std::mutex> lock(knowledgeMutex);
    std::vector<KnowledgeItem> items = readKnowledgeItemsUnlocked();

    for (const KnowledgeItem &item : items)
    {
        if (normalizeText(item.question) == normalizeText(cleanQuestion))
        {
            error = "That question already exists. Use Update instead.";
            return false;
        }
    }

    items.push_back({cleanQuestion, cleanAnswer});
    return writeKnowledgeItemsUnlocked(items, error);
}

bool updateKnowledgeItem(const std::string &oldQuestion, const std::string &question, const std::string &answer, std::string &error)
{
    const std::string cleanOldQuestion = trim(oldQuestion);
    const std::string cleanQuestion = trim(question);
    const std::string cleanAnswer = trim(answer);

    if (cleanOldQuestion.empty() || cleanQuestion.empty() || cleanAnswer.empty())
    {
        error = "Old question, question, and answer are required.";
        return false;
    }

    std::lock_guard<std::mutex> lock(knowledgeMutex);
    std::vector<KnowledgeItem> items = readKnowledgeItemsUnlocked();
    bool found = false;

    for (KnowledgeItem &item : items)
    {
        if (normalizeText(item.question) == normalizeText(cleanOldQuestion))
        {
            item.question = cleanQuestion;
            item.answer = cleanAnswer;
            found = true;
            break;
        }
    }

    if (!found)
    {
        error = "The question was not found in the knowledge file.";
        return false;
    }

    return writeKnowledgeItemsUnlocked(items, error);
}

bool deleteKnowledgeItem(const std::string &question, std::string &error)
{
    const std::string cleanQuestion = trim(question);
    if (cleanQuestion.empty())
    {
        error = "Question is required.";
        return false;
    }

    std::lock_guard<std::mutex> lock(knowledgeMutex);
    std::vector<KnowledgeItem> items = readKnowledgeItemsUnlocked();
    const std::string normalizedQuestion = normalizeText(cleanQuestion);
    const auto oldSize = items.size();

    items.erase(
        std::remove_if(items.begin(), items.end(), [&](const KnowledgeItem &item)
                       { return normalizeText(item.question) == normalizedQuestion; }),
        items.end());

    if (items.size() == oldSize)
    {
        error = "The question was not found in the knowledge file.";
        return false;
    }

    return writeKnowledgeItemsUnlocked(items, error);
}

struct RefreshContext
{
    std::string kind; // text | document | image
    std::string filename;
    std::string mimeType;
    std::string originalPrompt;
    std::string documentText;
    std::string imageBase64;
};

std::mutex refreshContextMutex;
std::unordered_map<std::string, RefreshContext> refreshContexts;
std::queue<std::string> refreshContextKeys;
const std::size_t MAX_REFRESH_CONTEXTS = 50;

// ============================================================
// GENERAL HELPERS
// ============================================================

std::string currentApiKey = "";
std::string currentAdminPassword = "admin";
int currentPort = 8080;

void loadEnvFile()
{
    std::ifstream infile(".env");
    if (!infile.is_open()) return;
    
    std::string line;
    while (std::getline(infile, line))
    {
        if (line.empty() || line[0] == '#') continue;
        auto pos = line.find('=');
        if (pos != std::string::npos)
        {
            std::string key = trim(line.substr(0, pos));
            std::string value = trim(line.substr(pos + 1));
            if (key == "GROQ_API_KEY")
            {
                currentApiKey = value;
            }
            else if (key == "ADMIN_PASSWORD")
            {
                currentAdminPassword = value;
            }
            else if (key == "PORT")
            {
                try {
                    currentPort = std::stoi(value);
                } catch (...) {
                    currentPort = 8080;
                }
            }
        }
    }
    infile.close();
}

std::string getGroqApiKey()
{
    return currentApiKey;
}

std::string readFile(const std::string &filename)
{
    std::ifstream file(filename, std::ios::binary);

    if (!file.is_open())
    {
        std::cerr << "Cannot open file: " << filename << std::endl;
        return "";
    }

    std::stringstream buffer;
    buffer << file.rdbuf();
    return buffer.str();
}

std::string trim(const std::string &value)
{
    std::size_t begin = 0;

    while (begin < value.size() &&
           std::isspace(static_cast<unsigned char>(value[begin])))
    {
        ++begin;
    }

    std::size_t end = value.size();

    while (end > begin &&
           std::isspace(static_cast<unsigned char>(value[end - 1])))
    {
        --end;
    }

    return value.substr(begin, end - begin);
}

std::string toLower(std::string value)
{
    std::transform(
        value.begin(),
        value.end(),
        value.begin(),
        [](unsigned char c)
        { return static_cast<char>(std::tolower(c)); });

    return value;
}

std::string createId()
{
    static std::mutex rngMutex;
    static std::mt19937_64 rng(
        static_cast<std::uint64_t>(
            std::chrono::high_resolution_clock::now()
                .time_since_epoch()
                .count()));

    std::lock_guard<std::mutex> lock(rngMutex);

    std::ostringstream stream;

    stream << std::hex
           << std::chrono::high_resolution_clock::now()
                  .time_since_epoch()
                  .count()
           << "-"
           << rng();

    return stream.str();
}

std::string currentDateTime()
{
    const std::time_t now = std::time(nullptr);
    std::tm timeInfo{};

#if defined(_WIN32)
    localtime_s(&timeInfo, &now);
#else
    localtime_r(&now, &timeInfo);
#endif

    std::ostringstream stream;
    stream << std::put_time(&timeInfo, "%d %b %Y %I:%M %p");
    return stream.str();
}

std::string jsonString(
    const json &object,
    const char *key,
    const std::string &fallback = "")
{
    if (!object.contains(key) || !object[key].is_string())
    {
        return fallback;
    }

    return object[key].get<std::string>();
}

void sendJson(httplib::Response &res, int status, const json &body)
{
    // Security headers on every response
    res.set_header("X-Frame-Options", "DENY");
    res.set_header("X-Content-Type-Options", "nosniff");
    res.set_header("X-XSS-Protection", "1; mode=block");
    res.set_header("Referrer-Policy", "strict-origin-when-cross-origin");
    res.set_header("Content-Security-Policy",
                   "default-src 'self'; "
                   "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
                   "font-src 'self' https://fonts.gstatic.com; "
                   "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com");

    res.status = status;
    res.set_content(
        body.dump(),
        "application/json; charset=UTF-8");
}

void setSecurityHeaders(httplib::Response &res)
{
    res.set_header("X-Frame-Options", "DENY");
    res.set_header("X-Content-Type-Options", "nosniff");
    res.set_header("X-XSS-Protection", "1; mode=block");
    res.set_header("Referrer-Policy", "strict-origin-when-cross-origin");
    res.set_header("Content-Security-Policy",
                   "default-src 'self'; "
                   "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
                   "font-src 'self' https://fonts.gstatic.com; "
                   "img-src 'self' data: blob:; "
                   "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com");
}

// ============================================================
// RATE LIMITING HELPERS
// ============================================================

bool isRateLimited(const std::string &ip)
{
    std::lock_guard<std::mutex> lock(rateLimitMutex);
    const auto it = loginAttempts.find(ip);
    if (it == loginAttempts.end())
        return false;
    if (it->second.failedAttempts >= MAX_LOGIN_ATTEMPTS)
    {
        if (std::chrono::steady_clock::now() < it->second.lockedUntil)
            return true;
        // Lockout expired, reset
        it->second.failedAttempts = 0;
    }
    return false;
}

void recordFailedLogin(const std::string &ip)
{
    std::lock_guard<std::mutex> lock(rateLimitMutex);
    auto &record = loginAttempts[ip];
    record.failedAttempts++;
    if (record.failedAttempts >= MAX_LOGIN_ATTEMPTS)
    {
        record.lockedUntil =
            std::chrono::steady_clock::now() +
            std::chrono::seconds(LOCKOUT_DURATION_SECONDS);
    }
}

void resetLoginAttempts(const std::string &ip)
{
    std::lock_guard<std::mutex> lock(rateLimitMutex);
    loginAttempts.erase(ip);
}

// ============================================================
// SESSION TOKEN HELPERS
// ============================================================

std::string generateSessionToken()
{
    static std::mutex rngMutex;
    static std::random_device rd; // Cryptographically secure (usually OS entropy)

    std::lock_guard<std::mutex> lock(rngMutex);
    std::ostringstream stream;
    stream << std::hex;
    for (int i = 0; i < 4; ++i)
        stream << rd(); // Pull directly from secure entropy source
    return stream.str();
}

std::string createSession()
{
    std::lock_guard<std::mutex> lock(sessionMutex);

    // Clean expired sessions
    const auto now = std::chrono::steady_clock::now();
    activeSessions.erase(
        std::remove_if(
            activeSessions.begin(),
            activeSessions.end(),
            [&now](const SessionToken &s)
            { return s.expiresAt <= now; }),
        activeSessions.end());

    SessionToken session;
    session.token = generateSessionToken();
    session.expiresAt = now + std::chrono::seconds(SESSION_EXPIRY_SECONDS);
    activeSessions.push_back(session);
    return session.token;
}

bool isValidSession(const std::string &token)
{
    if (token.empty())
        return false;
    std::lock_guard<std::mutex> lock(sessionMutex);
    const auto now = std::chrono::steady_clock::now();
    for (const auto &session : activeSessions)
    {
        if (session.token == token && session.expiresAt > now)
            return true;
    }
    return false;
}

// ============================================================
// BASE64 DECODER
// ============================================================

std::string base64Decode(const std::string &input, bool &ok)
{
    static const std::string alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    ok = true;

    std::string cleaned;
    cleaned.reserve(input.size());

    for (char c : input)
    {
        if (std::isspace(static_cast<unsigned char>(c)))
        {
            continue;
        }

        cleaned.push_back(c);
    }

    if (cleaned.empty())
    {
        return {};
    }

    if (cleaned.size() % 4 != 0)
    {
        ok = false;
        return {};
    }

    std::string output;
    output.reserve((cleaned.size() / 4) * 3);

    for (std::size_t i = 0; i < cleaned.size(); i += 4)
    {
        int values[4] = {0, 0, 0, 0};
        int padding = 0;

        for (int j = 0; j < 4; ++j)
        {
            const char c = cleaned[i + static_cast<std::size_t>(j)];

            if (c == '=')
            {
                ++padding;
                values[j] = 0;

                if (j < 2)
                {
                    ok = false;
                    return {};
                }

                continue;
            }

            if (padding > 0)
            {
                ok = false;
                return {};
            }

            const std::size_t position = alphabet.find(c);

            if (position == std::string::npos)
            {
                ok = false;
                return {};
            }

            values[j] = static_cast<int>(position);
        }

        if (cleaned[i + 2] == '=' && cleaned[i + 3] != '=')
        {
            ok = false;
            return {};
        }

        output.push_back(static_cast<char>(
            (values[0] << 2) | (values[1] >> 4)));

        if (cleaned[i + 2] != '=')
        {
            output.push_back(static_cast<char>(
                ((values[1] & 0x0F) << 4) | (values[2] >> 2)));
        }

        if (cleaned[i + 3] != '=')
        {
            output.push_back(static_cast<char>(
                ((values[2] & 0x03) << 6) | values[3]));
        }
    }

    return output;
}

// ============================================================
// FILE HELPERS
// ============================================================

std::string extensionOf(const std::string &filename)
{
    const std::size_t dot = filename.find_last_of('.');

    if (dot == std::string::npos)
    {
        return "";
    }

    return toLower(filename.substr(dot));
}

std::string mimeForExtension(const std::string &extension)
{
    if (extension == ".png")
        return "image/png";
    if (extension == ".jpg" || extension == ".jpeg")
        return "image/jpeg";
    if (extension == ".webp")
        return "image/webp";
    if (extension == ".gif")
        return "image/gif";
    if (extension == ".bmp")
        return "image/bmp";

    return "application/octet-stream";
}

bool isSupportedImage(const std::string &extension)
{
    return extension == ".png" ||
           extension == ".jpg" ||
           extension == ".jpeg" ||
           extension == ".webp" ||
           extension == ".gif" ||
           extension == ".bmp";
}

bool looksLikeZip(const std::string &bytes)
{
    return bytes.size() >= 4 &&
           static_cast<unsigned char>(bytes[0]) == 0x50 &&
           static_cast<unsigned char>(bytes[1]) == 0x4B &&
           static_cast<unsigned char>(bytes[2]) == 0x03 &&
           static_cast<unsigned char>(bytes[3]) == 0x04;
}

#if defined(_WIN32)
std::string quoteWindowsArgument(const std::string &value)
{
    // Windows filenames cannot contain a double quote, so normal surrounding
    // double quotes are enough for temp paths produced by this application.
    return std::string("\"") + value + "\"";
}
#endif

// ============================================================
// DOCX TEXT EXTRACTION
// ============================================================

std::string extractDocxText(
    const std::string &docxBytes,
    std::string &error)
{
#if !defined(_WIN32)
    error = "DOCX reading in this version requires Windows.";
    return "";
#else
    try
    {
        if (!looksLikeZip(docxBytes))
        {
            error = "The selected file is not a valid DOCX ZIP package.";
            return "";
        }

        const std::string idPath = "chatbot_docx_" + createId();
        const std::string tempDocx = idPath + ".docx";
        const std::string tempText = idPath + ".txt";
        const std::string tempScript = idPath + ".ps1";

        {
            std::ofstream output(tempDocx, std::ios::binary);

            if (!output.is_open())
            {
                error = "Could not create a temporary DOCX file.";
                return "";
            }

            output.write(
                docxBytes.data(),
                static_cast<std::streamsize>(docxBytes.size()));
        }

        // Use the .NET ZIP APIs from PowerShell, but pass the script through a
        // normal .ps1 file rather than one large quoted command line. This
        // avoids the quoting failures that caused the previous DOCX bug.
        const std::string script = R"PS1(
param(
    [Parameter(Mandatory=$true)][string]$InputPath,
    [Parameter(Mandatory=$true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = $null
$reader = $null

try {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($InputPath)
    $entry = $zip.GetEntry('word/document.xml')

    if ($null -eq $entry) {
        throw 'word/document.xml was not found in the DOCX package.'
    }

    $reader = New-Object System.IO.StreamReader($entry.Open())
    $xmlText = $reader.ReadToEnd()

    $xml = New-Object System.Xml.XmlDocument
    $xml.PreserveWhitespace = $false
    $xml.LoadXml($xmlText)

    $manager = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
    $manager.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')

    $paragraphNodes = $xml.SelectNodes('//w:p', $manager)
    $lines = New-Object System.Collections.Generic.List[string]

    foreach ($paragraph in $paragraphNodes) {
        $parts = New-Object System.Collections.Generic.List[string]
        $nodes = $paragraph.SelectNodes('.//w:t | .//w:tab | .//w:br', $manager)

        foreach ($node in $nodes) {
            if ($node.LocalName -eq 'tab') {
                [void]$parts.Add("`t")
            }
            elseif ($node.LocalName -eq 'br') {
                [void]$parts.Add("`n")
            }
            else {
                [void]$parts.Add($node.InnerText)
            }
        }

        $lines.Add(($parts -join ''))
    }

    $text = ($lines -join [Environment]::NewLine).Trim()
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($OutputPath, $text, $utf8)
}
finally {
    if ($reader) {
        $reader.Dispose()
    }
    if ($zip) {
        $zip.Dispose()
    }
}
)PS1";

        {
            std::ofstream scriptFile(tempScript, std::ios::binary);

            if (!scriptFile.is_open())
            {
                std::remove(tempDocx.c_str());
                error = "Could not create the temporary PowerShell script.";
                return "";
            }

            scriptFile << script;
        }

        const std::string command =
            "powershell.exe -NoLogo -NoProfile -NonInteractive "
            "-ExecutionPolicy Bypass -File " +
            quoteWindowsArgument(tempScript) +
            " -InputPath " + quoteWindowsArgument(tempDocx) +
            " -OutputPath " + quoteWindowsArgument(tempText) +
            " >NUL 2>NUL";

        const int exitCode = std::system(command.c_str());

        std::string extracted = readFile(tempText);

        std::remove(tempDocx.c_str());
        std::remove(tempText.c_str());
        std::remove(tempScript.c_str());

        extracted = trim(extracted);

        if (exitCode != 0)
        {
            error =
                "Windows could not read this DOCX file. Make sure the file "
                "opens normally in Microsoft Word and is a real .docx file.";
            return "";
        }

        if (extracted.empty())
        {
            error =
                "The DOCX was opened successfully, but it does not contain "
                "readable paragraph text.";
            return "";
        }

        if (extracted.size() > MAX_TEXT_FOR_PROMPT)
        {
            extracted.resize(MAX_TEXT_FOR_PROMPT);
        }

        return extracted;
    }
    catch (const std::exception &exception)
    {
        error = std::string("DOCX extraction failed: ") + exception.what();
        return "";
    }
#endif
}

static size_t WriteCallback(void *contents, size_t size, size_t nmemb, void *userp)
{
    ((std::string *)userp)->append((char *)contents, size * nmemb);
    return size * nmemb;
}

json callGroq(const json &requestBody)
{
    std::string apiKey = getGroqApiKey();
    if (apiKey.empty())
    {
        return {
            {"ok", false},
            {"error", "GROQ_API_KEY environment variable is not set."}};
    }

    CURL *curl;
    CURLcode res;
    std::string response;

    curl = curl_easy_init();
    if (curl)
    {
        struct curl_slist *headers = NULL;
        headers = curl_slist_append(headers, "Content-Type: application/json");
        std::string authHeader = "Authorization: Bearer " + apiKey;
        headers = curl_slist_append(headers, authHeader.c_str());

        std::string reqData = requestBody.dump();

        curl_easy_setopt(curl, CURLOPT_URL, GROQ_URL.c_str());
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, reqData.c_str());
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
        curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L); // Prevent thread freezing
        curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
#ifdef CURLSSLOPT_NATIVE_CA
        curl_easy_setopt(curl, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
#endif

        res = curl_easy_perform(curl);

        curl_slist_free_all(headers);
        curl_easy_cleanup(curl);

        if (res != CURLE_OK)
        {
            return {
                {"ok", false},
                {"error", std::string("Network error: ") + curl_easy_strerror(res)}};
        }
    }
    else
    {
        return {
            {"ok", false},
            {"error", "Failed to initialize libcurl."}};
    }

    if (response.empty())
    {
        return {
            {"ok", false},
            {"error", "Network error or empty response from API."}};
    }

    try
    {
        const json apiResponse = json::parse(response);

        if (apiResponse.contains("error") && apiResponse["error"].is_object())
        {
            std::string errorMessage = "Groq API request failed.";

            if (apiResponse["error"].contains("message") &&
                apiResponse["error"]["message"].is_string())
            {
                errorMessage =
                    apiResponse["error"]["message"].get<std::string>();
            }

            return {
                {"ok", false},
                {"error", errorMessage}};
        }

        if (!apiResponse.contains("choices") ||
            !apiResponse["choices"].is_array() ||
            apiResponse["choices"].empty() ||
            !apiResponse["choices"][0].contains("message") ||
            !apiResponse["choices"][0]["message"].contains("content"))
        {
            return {
                {"ok", false},
                {"error", "No response received from Groq."}};
        }

        const json &content =
            apiResponse["choices"][0]["message"]["content"];

        if (!content.is_string())
        {
            return {
                {"ok", false},
                {"error", "Groq returned an unexpected response format."}};
        }

        const std::string answer = trim(content.get<std::string>());

        if (answer.empty())
        {
            return {
                {"ok", false},
                {"error", "Groq returned an empty answer."}};
        }

        return {
            {"ok", true},
            {"answer", answer}};
    }
    catch (const std::exception &exception)
    {
        return {
            {"ok", false},
            {"error", std::string("Invalid API response: ") + exception.what()}};
    }
}

// ============================================================
// NORMAL TEXT CHAT
// ============================================================

json askGroq(const std::string &userMessage)
{
    const json requestBody = {
        {"model", GROQ_MODEL},
        {"messages", json::array({{{"role", "system"},
                                   {"content",
                                    "You are a helpful and friendly chatbot assistant for this specific web application. "
                                    "Answer questions clearly and naturally. "
                                    "Use simple language and provide useful answers. "
                                    "If the user asks how to see or show their history, tell them to click on 'Conversation History' in the left sidebar. "
                                    "If the user asks how to add new Q&A, knowledge, or FAQs, tell them to click on 'Knowledge Base' in the left sidebar."}},
                                  {{"role", "user"},
                                   {"content", userMessage}}})},
        {"temperature", 0.7},
        {"max_tokens", 1024}};

    return callGroq(requestBody);
}

// ============================================================
// IMAGE / VISION CHAT
// ============================================================

json askGroqVision(
    const std::string &filename,
    const std::string &mimeType,
    const std::string &base64Data,
    const std::string &userMessage)
{
    const std::string cleanPrompt =
        trim(userMessage).empty()
            ? "Read this image carefully. Extract visible text when possible, "
              "then explain the important information clearly."
            : trim(userMessage);

    const std::string dataUrl =
        "data:" + mimeType + ";base64," + base64Data;

    const json content = json::array({{{"type", "text"},
                                       {"text", cleanPrompt + "\n\nAttached image: " + filename}},
                                      {{"type", "image_url"},
                                       {"image_url", {{"url", dataUrl}}}}});

    const json requestBody = {
        {"model", GROQ_VISION_MODEL},
        {"messages", json::array({{{"role", "system"},
                                   {"content",
                                    "You are a careful multimodal assistant. Read and interpret "
                                    "images accurately. When the image contains text, transcribe "
                                    "useful visible text accurately. Do not invent text you cannot see."}},
                                  {{"role", "user"},
                                   {"content", content}}})},
        {"temperature", 0.2},
        {"max_completion_tokens", 2048}};

    return callGroq(requestBody);
}

// ============================================================
// DOCUMENT PROMPT
// ============================================================

std::string buildDocumentPrompt(
    const std::string &filename,
    const std::string &documentText,
    const std::string &userMessage)
{
    const std::string defaultInstruction =
        "Read the attached document and explain its important content clearly. "
        "Use headings or bullet points when useful.";

    const std::string instruction =
        trim(userMessage).empty()
            ? defaultInstruction
            : trim(userMessage);

    std::string safeText = documentText;

    if (safeText.size() > MAX_TEXT_FOR_PROMPT)
    {
        safeText.resize(MAX_TEXT_FOR_PROMPT);
        safeText +=
            "\n\n[Document text was truncated because it is very large.]";
    }

    std::ostringstream prompt;

    prompt
        << instruction
        << "\n\n"
        << "Attached file: " << filename
        << "\n\n"
        << "----- BEGIN FILE CONTENT -----\n"
        << safeText
        << "\n----- END FILE CONTENT -----";

    return prompt.str();
}

// ============================================================
// REFRESH CONTEXT STORAGE
// ============================================================

void saveRefreshContext(
    const std::string &entryId,
    const RefreshContext &context)
{
    std::lock_guard<std::mutex> lock(refreshContextMutex);

    // Evict old entries if we exceed the limit
    if (refreshContexts.find(entryId) == refreshContexts.end())
    {
        refreshContextKeys.push(entryId);
        while (refreshContextKeys.size() > MAX_REFRESH_CONTEXTS)
        {
            std::string oldestKey = refreshContextKeys.front();
            refreshContextKeys.pop();
            refreshContexts.erase(oldestKey);
        }
    }

    refreshContexts[entryId] = context;
}

bool getRefreshContext(
    const std::string &entryId,
    RefreshContext &context)
{
    std::lock_guard<std::mutex> lock(refreshContextMutex);

    const auto iterator = refreshContexts.find(entryId);

    if (iterator == refreshContexts.end())
    {
        return false;
    }

    context = iterator->second;
    return true;
}

// ============================================================
// TXT / DOCX FILE ANALYSIS
// ============================================================

json analyzeUploadedFile(
    const std::string &filename,
    const std::string &mimeType,
    const std::string &base64Data,
    const std::string &userMessage,
    std::string &storedQuestion,
    std::string &extractedText,
    std::string &kind)
{
    const std::string extension = extensionOf(filename);

    bool decodedOk = false;
    const std::string decoded = base64Decode(base64Data, decodedOk);

    if (!decodedOk)
    {
        return {
            {"ok", false},
            {"error", "The uploaded file data is not valid base64."}};
    }

    if (decoded.empty())
    {
        return {
            {"ok", false},
            {"error", "The uploaded file is empty."}};
    }

    if (decoded.size() > MAX_FILE_SIZE)
    {
        return {
            {"ok", false},
            {"error", "File is too large. Maximum allowed size is 15 MB."}};
    }

    storedQuestion =
        trim(userMessage).empty()
            ? "Read and analyze the attached file."
            : trim(userMessage);

    storedQuestion += "\n[Attached file: " + filename + "]";

    if (extension == ".txt")
    {
        extractedText = decoded;
        kind = "text";

        if (extractedText.empty())
        {
            return {
                {"ok", false},
                {"error", "The text file is empty."}};
        }

        return askGroq(
            buildDocumentPrompt(filename, extractedText, userMessage));
    }

    if (extension == ".docx")
    {
        kind = "document";
        std::string extractionError;
        extractedText = extractDocxText(decoded, extractionError);

        if (extractedText.empty())
        {
            return {
                {"ok", false},
                {"error", extractionError.empty()
                              ? "The DOCX file could not be read."
                              : extractionError}};
        }

        return askGroq(
            buildDocumentPrompt(filename, extractedText, userMessage));
    }

    if (isSupportedImage(extension))
    {
        kind = "image";

        const std::string finalMime =
            mimeType.empty()
                ? mimeForExtension(extension)
                : mimeType;

        return askGroqVision(
            filename,
            finalMime,
            base64Data,
            userMessage);
    }

    return {
        {"ok", false},
        {"error",
         "Unsupported file type. Use TXT, DOCX, PNG, JPG, JPEG, WEBP, GIF, or BMP."}};
}

// ============================================================
// ADMIN / KNOWLEDGE PROTECTION
// ============================================================

std::string getAdminPassword()
{
    return currentAdminPassword;
}

bool isAdminAuthorized(const httplib::Request &req)
{
    std::string token = req.get_header_value("X-Admin-Token");
    return isValidSession(token);
}

// ============================================================
// CHAT HISTORY FILE
// ============================================================

struct HistoryMessage
{
    std::string id;
    std::string conversationId;
    std::string date;
    std::string question;
    std::string answer;
    std::string source;
};

std::vector<HistoryMessage> readHistoryMessages()
{
    std::lock_guard<std::mutex> lock(historyMutex);
    std::ifstream file(CHAT_HISTORY_FILE, std::ios::in | std::ios::binary);
    std::vector<HistoryMessage> messages;
    if (!file.is_open()) return messages;

    try
    {
        json arr;
        file >> arr;
        if (arr.is_array())
        {
            for (const auto& el : arr)
            {
                HistoryMessage msg;
                msg.id = el.value("id", "");
                msg.conversationId = el.value("conversationId", "");
                msg.date = el.value("date", "");
                msg.question = el.value("question", "");
                msg.answer = el.value("answer", "");
                msg.source = el.value("source", "");
                messages.push_back(msg);
            }
        }
    }
    catch (...) {}
    return messages;
}

bool appendHistoryRecord(
    const std::string &entryId,
    const std::string &conversationId,
    const std::string &question,
    const std::string &answer,
    const std::string &source,
    std::string &error)
{
    std::vector<HistoryMessage> messages;
    {
        std::lock_guard<std::mutex> lock(historyMutex);
        std::ifstream file(CHAT_HISTORY_FILE, std::ios::in | std::ios::binary);
        if (file.is_open()) {
            try {
                json arr; file >> arr;
                if (arr.is_array()) {
                    for (const auto& el : arr) {
                        HistoryMessage msg;
                        msg.id = el.value("id", "");
                        msg.conversationId = el.value("conversationId", "");
                        msg.date = el.value("date", "");
                        msg.question = el.value("question", "");
                        msg.answer = el.value("answer", "");
                        msg.source = el.value("source", "");
                        messages.push_back(msg);
                    }
                }
            } catch (...) {}
        }
    }

    HistoryMessage newMsg;
    newMsg.id = entryId;
    newMsg.conversationId = conversationId.empty() ? entryId : conversationId;
    newMsg.date = currentDateTime();
    newMsg.question = question;
    newMsg.answer = answer;
    newMsg.source = source;
    messages.push_back(newMsg);

    json outArr = json::array();
    for (const auto& m : messages) {
        outArr.push_back({{"id", m.id}, {"conversationId", m.conversationId}, {"date", m.date}, {"question", m.question}, {"answer", m.answer}, {"source", m.source}});
    }

    std::lock_guard<std::mutex> lock(historyMutex);
    std::ofstream file(CHAT_HISTORY_FILE, std::ios::out | std::ios::trunc | std::ios::binary);
    if (!file.is_open()) {
        error = "Could not open history file.";
        return false;
    }
    file << outArr.dump(4);
    return true;
}

// ============================================================
// GROQ CHAT WITH CONVERSATION CONTEXT
// ============================================================

json askGroqWithConversation(
    const std::string &userMessage,
    const std::string &conversationId)
{
    const json systemMessage = {
        {"role", "system"},
        {"content",
         "You are a helpful and friendly chatbot assistant for this specific web application. "
         "Answer questions clearly and naturally. "
         "Use simple language and provide useful answers. "
         "If the user asks how to see or show their history, tell them to click on 'Conversation History' in the left sidebar. "
         "If the user asks how to add new Q&A, knowledge, or FAQs, tell them to click on 'Knowledge Base' in the left sidebar. "
         "Use the previous conversation context to understand follow-up "
         "questions, short replies, pronouns, and references to earlier messages."}};

    json messages = json::array();
    messages.push_back(systemMessage);

    const std::vector<HistoryMessage> history = readHistoryMessages();

    std::vector<HistoryMessage> conversationRecords;
    std::size_t matchedRecords = 0;

    // Read the newest saved records first, but keep only this conversation.
    for (auto it = history.rbegin(); it != history.rend(); ++it)
    {
        const std::string historyConversationId =
            it->conversationId.empty() ? it->id : it->conversationId;

        if (historyConversationId == conversationId)
        {
            conversationRecords.push_back(*it);
            ++matchedRecords;

            if (matchedRecords >= MAX_CONTEXT_RECORDS)
            {
                break;
            }
        }
    }

    // Put the selected records back into chronological order.
    std::reverse(
        conversationRecords.begin(),
        conversationRecords.end());

    for (const HistoryMessage &item : conversationRecords)
    {
        if (!item.question.empty())
        {
            messages.push_back({{"role", "user"},
                                {"content", item.question}});
        }

        if (!item.answer.empty())
        {
            messages.push_back({{"role", "assistant"},
                                {"content", item.answer}});
        }
    }

    // Always put the current user message last.
    messages.push_back({{"role", "user"},
                        {"content", userMessage}});

    const json requestBody = {
        {"model", GROQ_MODEL},
        {"messages", messages},
        {"temperature", 0.7},
        {"max_tokens", 1024}};

    return callGroq(requestBody);
}

json listConversationSessions()
{
    const std::vector<HistoryMessage> messages = readHistoryMessages();
    json sessions = json::array();
    std::unordered_map<std::string, std::size_t> indexByConversation;

    for (const HistoryMessage &message : messages)
    {
        const std::string key = message.conversationId.empty() ? message.id : message.conversationId;
        auto found = indexByConversation.find(key);
        if (found == indexByConversation.end())
        {
            const std::size_t index = sessions.size();
            indexByConversation[key] = index;
            sessions.push_back({{"id", key},
                                {"title", message.question.empty() ? "Conversation" : message.question},
                                {"date", message.date},
                                {"messages", json::array()}});
            found = indexByConversation.find(key);
        }

        sessions[found->second]["messages"].push_back({{"id", message.id},
                                                       {"date", message.date},
                                                       {"question", message.question},
                                                       {"answer", message.answer},
                                                       {"source", message.source}});
        sessions[found->second]["date"] = message.date;
    }

    return sessions;
}

bool clearHistoryFile(std::string &error)
{
    std::lock_guard<std::mutex> lock(historyMutex);
    std::ofstream output(CHAT_HISTORY_FILE, std::ios::out | std::ios::trunc | std::ios::binary);
    if (!output.is_open())
    {
        error = "Could not clear the chat history file.";
        return false;
    }
    return true;
}

bool replaceHistoryRecord(
    const std::string &entryId,
    const std::string &newAnswer,
    const std::string &source,
    std::string &error)
{
    std::vector<HistoryMessage> messages;
    {
        std::lock_guard<std::mutex> lock(historyMutex);
        std::ifstream file(CHAT_HISTORY_FILE, std::ios::in | std::ios::binary);
        if (file.is_open()) {
            try {
                json arr; file >> arr;
                if (arr.is_array()) {
                    for (const auto& el : arr) {
                        HistoryMessage msg;
                        msg.id = el.value("id", "");
                        msg.conversationId = el.value("conversationId", "");
                        msg.date = el.value("date", "");
                        msg.question = el.value("question", "");
                        msg.answer = el.value("answer", "");
                        msg.source = el.value("source", "");
                        messages.push_back(msg);
                    }
                }
            } catch (...) {}
        }
    }

    bool found = false;
    for (auto& m : messages) {
        if (m.id == entryId) {
            m.answer = newAnswer;
            m.source = source;
            found = true;
            break;
        }
    }

    if (!found) {
        error = "Record not found.";
        return false;
    }

    json outArr = json::array();
    for (const auto& m : messages) {
        outArr.push_back({{"id", m.id}, {"conversationId", m.conversationId}, {"date", m.date}, {"question", m.question}, {"answer", m.answer}, {"source", m.source}});
    }

    std::lock_guard<std::mutex> lock(historyMutex);
    std::ofstream file(CHAT_HISTORY_FILE, std::ios::out | std::ios::trunc | std::ios::binary);
    if (!file.is_open()) {
        error = "Could not open history file.";
        return false;
    }
    file << outArr.dump(4);
    return true;
}

// ============================================================
// MAIN SERVER
// ============================================================

int main()
{
    curl_global_init(CURL_GLOBAL_DEFAULT);
    loadEnvFile();
    if (currentApiKey.empty()) {
        std::cerr << "FATAL ERROR: GROQ_API_KEY is missing in the .env file!" << std::endl;
        std::exit(1);
    }
    httplib::Server server;

    ensureKnowledgeFile();

    // ========================================================
    // STATIC FILES
    server.set_mount_point("/vendor", "./vendor");

    server.Get(
        "/",
        [](
            const httplib::Request &,
            httplib::Response &res)
        {
            setSecurityHeaders(res);
            const std::string html = readFile(HTML_FILE);

            if (html.empty())
            {
                sendJson(
                    res,
                    500,
                    {{"ok", false},
                     {"error", "index.html was not found."}});
                return;
            }

            res.set_content(
                html,
                "text/html; charset=UTF-8");
        });

    server.Get(
        "/style.css",
        [](
            const httplib::Request &,
            httplib::Response &res)
        {
            setSecurityHeaders(res);
            const std::string css = readFile(CSS_FILE);

            if (css.empty())
            {
                res.status = 404;
                res.set_content(
                    "style.css was not found.",
                    "text/plain; charset=UTF-8");
                return;
            }

            res.set_content(
                css,
                "text/css; charset=UTF-8");
        });

    server.Get(
        "/script.js",
        [](
            const httplib::Request &,
            httplib::Response &res)
        {
            setSecurityHeaders(res);
            const std::string js = readFile(JS_FILE);

            if (js.empty())
            {
                res.status = 404;
                res.set_content(
                    "script.js was not found.",
                    "text/plain; charset=UTF-8");
                return;
            }

            res.set_content(
                js,
                "application/javascript; charset=UTF-8");
        });

    // ========================================================
    // KNOWLEDGE / FAQ API
    // ========================================================

    server.Post(
        "/api/admin/login",
        [](const httplib::Request &req, httplib::Response &res)
        {
            try
            {
                std::string ip = req.remote_addr;
                if (isRateLimited(ip))
                {
                    sendJson(res, 429, {{"ok", false}, {"error", "Too many attempts. Please try again later."}});
                    return;
                }
                const json request = json::parse(req.body);
                const std::string password = jsonString(request, "password");
                const bool valid = !password.empty() && password == getAdminPassword();

                if (valid)
                {
                    resetLoginAttempts(ip);
                    std::string token = createSession();
                    sendJson(res, 200, {{"ok", true}, {"authenticated", true}, {"token", token}, {"message", "Admin access granted."}});
                }
                else
                {
                    recordFailedLogin(ip);
                    sendJson(res, 401, {{"ok", false}, {"authenticated", false}, {"message", "Invalid admin password."}});
                }
            }
            catch (const std::exception &exception)
            {
                sendJson(res, 400, {{"ok", false}, {"error", exception.what()}});
            }
        });

    server.Get(
        "/api/history",
        [](const httplib::Request &req, httplib::Response &res)
        {
            if (!isAdminAuthorized(req))
            {
                sendJson(res, 401, {{"ok", false}, {"error", "Admin authentication required."}});
                return;
            }
            sendJson(res, 200, {{"ok", true}, {"sessions", listConversationSessions()}});
        });

    server.Get(
        "/api/history/export",
        [](const httplib::Request &req, httplib::Response &res)
        {
            setSecurityHeaders(res);
            if (!isAdminAuthorized(req))
            {
                res.status = 401;
                res.set_content("Admin authentication required.", "text/plain");
                return;
            }
            const std::string text = readFile(CHAT_HISTORY_FILE);
            res.set_content(text, "text/plain");
        });

    server.Post(
        "/api/history/clear",
        [](const httplib::Request &req, httplib::Response &res)
        {
            if (!isAdminAuthorized(req))
            {
                sendJson(res, 401, {{"ok", false}, {"error", "Admin authentication required."}});
                return;
            }
            std::string error;
            const bool cleared = clearHistoryFile(error);
            sendJson(res, cleared ? 200 : 500, {{"ok", cleared}, {"error", error}});
        });

    server.Get(
        "/api/knowledge",
        [](
            const httplib::Request &,
            httplib::Response &res)
        {
            ensureKnowledgeFile();
            sendJson(res, 200, {{"ok", true}, {"items", listKnowledge()}});
        });

    server.Post(
        "/api/knowledge/add",
        [](
            const httplib::Request &req,
            httplib::Response &res)
        {
            if (!isAdminAuthorized(req))
            {
                sendJson(res, 401, {{"ok", false}, {"error", "Admin authentication required."}});
                return;
            }

            try
            {
                const json request = json::parse(req.body);
                std::string error;
                const bool saved = addKnowledgeItem(
                    jsonString(request, "question"),
                    jsonString(request, "answer"),
                    error);

                if (!saved)
                {
                    sendJson(res, 400, {{"ok", false}, {"error", error}});
                    return;
                }

                sendJson(res, 200, {{"ok", true}, {"message", "Question and answer added successfully."}});
            }
            catch (const std::exception &exception)
            {
                sendJson(res, 400, {{"ok", false}, {"error", exception.what()}});
            }
        });

    server.Post(
        "/api/knowledge/update",
        [](
            const httplib::Request &req,
            httplib::Response &res)
        {
            if (!isAdminAuthorized(req))
            {
                sendJson(res, 401, {{"ok", false}, {"error", "Admin authentication required."}});
                return;
            }

            try
            {
                const json request = json::parse(req.body);
                std::string error;
                const bool updated = updateKnowledgeItem(
                    jsonString(request, "old_question"),
                    jsonString(request, "question"),
                    jsonString(request, "answer"),
                    error);

                if (!updated)
                {
                    sendJson(res, 400, {{"ok", false}, {"error", error}});
                    return;
                }

                sendJson(res, 200, {{"ok", true}, {"message", "Question and answer updated successfully."}});
            }
            catch (const std::exception &exception)
            {
                sendJson(res, 400, {{"ok", false}, {"error", exception.what()}});
            }
        });

    server.Post(
        "/api/knowledge/delete",
        [](
            const httplib::Request &req,
            httplib::Response &res)
        {
            if (!isAdminAuthorized(req))
            {
                sendJson(res, 401, {{"ok", false}, {"error", "Admin authentication required."}});
                return;
            }

            try
            {
                const json request = json::parse(req.body);
                std::string error;
                const bool deleted = deleteKnowledgeItem(
                    jsonString(request, "question"),
                    error);

                if (!deleted)
                {
                    sendJson(res, 400, {{"ok", false}, {"error", error}});
                    return;
                }

                sendJson(res, 200, {{"ok", true}, {"message", "Question and answer deleted successfully."}});
            }
            catch (const std::exception &exception)
            {
                sendJson(res, 400, {{"ok", false}, {"error", exception.what()}});
            }
        });

    server.Get(
        "/api/knowledge/match",
        [](
            const httplib::Request &req,
            httplib::Response &res)
        {
            ensureKnowledgeFile();
            const std::string query = req.has_param("q") ? req.get_param_value("q") : "";
            sendJson(res, 200, knowledgeMatch(query));
        });

    // ========================================================
    // NORMAL CHAT API
    // ========================================================

    server.Post(
        "/api/chat",
        [](
            const httplib::Request &req,
            httplib::Response &res)
        {
            try
            {
                const json request = json::parse(req.body);
                const std::string message = trim(
                    jsonString(request, "message"));
                std::string conversationId = trim(
                    jsonString(request, "conversation_id"));
                if (conversationId.empty())
                    conversationId = createId();

                if (message.empty())
                {
                    sendJson(
                        res,
                        400,
                        {{"ok", false},
                         {"error", "Message cannot be empty."}});
                    return;
                }

                if (message.length() > MAX_MESSAGE_LENGTH)
                {
                    sendJson(
                        res,
                        400,
                        {{"ok", false},
                         {"error", "Message is too long. Maximum allowed length is 10,000 characters."}});
                    return;
                }

                std::cout
                    << "\n========================================\n"
                    << "User Question: " << message
                    << "\n========================================\n"
                    << std::endl;

                json answer;
                bool answered = false;

                // 1. Check local knowledge base & keyword rules first
                std::string directAnswer = keywordResponse(message);
                bool usedLocalKnowledge = false;

                if (directAnswer.empty())
                {
                    const json matched = knowledgeMatch(message);
                    if (matched.value("found", false))
                    {
                        directAnswer = matched.value("answer", "");
                        usedLocalKnowledge = true;
                    }
                }

                if (!directAnswer.empty())
                {
                    answer = {
                        {"ok", true},
                        {"answer", directAnswer},
                        {"source", usedLocalKnowledge ? "knowledge_file" : "keyword_rule"}};
                    answered = true;
                }

                // 2. If no local match, fallback to the Groq API
                if (!answered && !currentApiKey.empty())
                {
                    answer = askGroqWithConversation(message, conversationId);
                    if (answer.value("ok", false))
                    {
                        answer["source"] = "groq_ai";
                        answered = true;
                    }
                    else
                    {
                        std::cerr << "Groq API Error: " << answer.value("error", "Unknown error") << std::endl;
                        answer = {
                            {"ok", true}, // We return true to the frontend so it prints the error text as a bot response
                            {"answer", "⚠️ **Groq API Error:** " + answer.value("error", "Unknown error")},
                            {"source", "api_error"}};
                        answered = true;
                    }
                }

                // 3. Neither API nor Knowledge Base has the answer
                if (!answered)
                {
                    answer = {
                        {"ok", true},
                        {"answer", "The requested information is not available in the local knowledge base. Please configure the API in Settings for an online answer."},
                        {"source", "fallback_no_api"}};
                }

                const std::string entryId = createId();
                std::string historyError;

                const bool saved = appendHistoryRecord(
                    entryId,
                    conversationId,
                    message,
                    answer.value("answer", ""),
                    answer.value("source", ""),
                    historyError);

                RefreshContext context;
                context.kind = "text";
                context.originalPrompt = message;
                saveRefreshContext(entryId, context);

                answer["entry_id"] = entryId;
                answer["conversation_id"] = conversationId;
                answer["history_saved"] = saved;

                if (!saved)
                {
                    answer["history_warning"] = historyError;
                }

                const std::string responseSource =
                    answer.value("source", "");

                if (responseSource == "groq_ai")
                {
                    std::cout
                        << "Groq API: Response received successfully."
                        << std::endl;
                }
                else if (responseSource == "unknown_question")
                {
                    std::cout
                        << "Groq API: Offline / unavailable. Unknown-question fallback used."
                        << std::endl;
                }
                else
                {
                    std::cout
                        << "Chatbot: Local response generated."
                        << std::endl;
                }

                sendJson(res, 200, answer);
            }
            catch (const std::exception &exception)
            {
                std::cerr
                    << "Request Error: "
                    << exception.what()
                    << std::endl;

                sendJson(
                    res,
                    400,
                    {{"ok", false},
                     {"error", "Invalid request format."}});
            }
        });

    // ========================================================
    // REFRESH / REGENERATE API
    // ========================================================

    server.Post(
        "/api/refresh",
        [](
            const httplib::Request &req,
            httplib::Response &res)
        {
            try
            {
                const json request = json::parse(req.body);
                const std::string entryId = trim(
                    jsonString(request, "entry_id"));
                const std::string message = trim(
                    jsonString(request, "message"));

                if (entryId.empty() || message.empty())
                {
                    sendJson(
                        res,
                        400,
                        {{"ok", false},
                         {"error", "A response ID and original question are required."}});
                    return;
                }

                RefreshContext context;
                const bool hasContext =
                    getRefreshContext(entryId, context);

                json answer;

                if (hasContext && context.kind == "document")
                {
                    answer = askGroq(
                        buildDocumentPrompt(
                            context.filename,
                            context.documentText,
                            context.originalPrompt));
                }
                else if (hasContext && context.kind == "text" &&
                         !context.documentText.empty())
                {
                    answer = askGroq(
                        buildDocumentPrompt(
                            context.filename.empty()
                                ? "text file"
                                : context.filename,
                            context.documentText,
                            context.originalPrompt.empty()
                                ? message
                                : context.originalPrompt));
                }
                else if (hasContext &&
                         context.kind == "image" &&
                         !context.imageBase64.empty())
                {
                    answer = askGroqVision(
                        context.filename,
                        context.mimeType,
                        context.imageBase64,
                        context.originalPrompt.empty()
                            ? message
                            : context.originalPrompt);
                }
                else
                {
                    answer = askGroq(message);
                }

                if (!answer.value("ok", false))
                {
                    sendJson(res, 500, answer);
                    return;
                }

                std::string historyError;
                const bool historyUpdated = replaceHistoryRecord(
                    entryId,
                    answer.value("answer", ""),
                    answer.value("source", "groq_ai"),
                    historyError);

                answer["entry_id"] = entryId;
                answer["history_saved"] = historyUpdated;
                if (!answer.contains("source")) { answer["source"] = "groq_ai"; }

                if (!historyUpdated)
                {
                    answer["history_warning"] = historyError;
                }

                sendJson(res, 200, answer);
            }
            catch (const std::exception &exception)
            {
                std::cerr
                    << "Refresh Error: "
                    << exception.what()
                    << std::endl;

                sendJson(
                    res,
                    400,
                    {{"ok", false},
                     {"error", "Invalid refresh request."}});
            }
        });

    // ========================================================
    // FILE READ / ANALYSIS API
    // ========================================================

    server.Post(
        "/api/file-read",
        [](
            const httplib::Request &req,
            httplib::Response &res)
        {
            try
            {
                const json request = json::parse(req.body);

                std::string conversationId = trim(
                    jsonString(request, "conversation_id"));
                if (conversationId.empty())
                    conversationId = createId();

                const std::string filename = trim(
                    jsonString(request, "filename"));
                const std::string mimeType = trim(
                    jsonString(request, "mime_type"));
                const std::string base64Data =
                    jsonString(request, "data_base64");
                const std::string message =
                    jsonString(request, "message");

                if (filename.empty() || base64Data.empty())
                {
                    sendJson(
                        res,
                        400,
                        {{"ok", false},
                         {"error", "A file is required."}});
                    return;
                }

                const std::string extension = extensionOf(filename);

                if (extension != ".txt" &&
                    extension != ".docx" &&
                    !isSupportedImage(extension))
                {
                    sendJson(
                        res,
                        415,
                        {{"ok", false},
                         {"error",
                          "Unsupported file type. Use TXT, DOCX, PNG, JPG, JPEG, WEBP, GIF, or BMP."}});
                    return;
                }

                std::string storedQuestion;
                std::string extractedText;
                std::string kind;

                json answer = analyzeUploadedFile(
                    filename,
                    mimeType,
                    base64Data,
                    message,
                    storedQuestion,
                    extractedText,
                    kind);

                if (!answer.value("ok", false))
                {
                    sendJson(res, 422, answer);
                    return;
                }

                const std::string entryId = createId();
                std::string historyError;

                const bool saved = appendHistoryRecord(
                    entryId,
                    conversationId,
                    storedQuestion,
                    answer.value("answer", ""),
                    answer.value("source", "groq_ai"),
                    historyError);

                RefreshContext context;
                context.kind = kind;
                context.filename = filename;
                context.mimeType =
                    mimeType.empty()
                        ? mimeForExtension(extension)
                        : mimeType;
                context.originalPrompt = trim(message);

                if (kind == "text" || kind == "document")
                {
                    context.documentText = extractedText;
                }
                else if (kind == "image" &&
                         base64Data.size() <= (MAX_INLINE_IMAGE_BYTES * 2ULL))
                {
                    // Keep the image available for refresh while this server
                    // process is running. This does not alter the user's file.
                    context.imageBase64 = base64Data;
                }

                saveRefreshContext(entryId, context);

                answer["entry_id"] = entryId;
                answer["filename"] = filename;
                answer["history_saved"] = saved;

                if (!saved)
                {
                    answer["history_warning"] = historyError;
                }

                if ((extension == ".txt" || extension == ".docx") &&
                    !extractedText.empty())
                {
                    const std::size_t previewLimit = 12000;

                    answer["extracted_text_preview"] =
                        extractedText.substr(0, previewLimit);
                    answer["extracted_text_truncated"] =
                        extractedText.size() > previewLimit;
                }

                sendJson(res, 200, answer);
            }
            catch (const std::exception &exception)
            {
                std::cerr
                    << "File Read Error: "
                    << exception.what()
                    << std::endl;

                sendJson(
                    res,
                    400,
                    {{"ok", false},
                     {"error", "Invalid file request."}});
            }
        });

    // ========================================================
    // SERVER STARTUP
    // ========================================================

    std::cout
        << "\n========================================\n"
        << " Chatbot Assistant C++ Server\n"
        << "========================================\n\n"
        << "Starting server..."
        << std::endl;

    // Scale up the thread pool native to httplib so blocking curl calls don't exhaust the server
    server.new_task_queue = [] { return new httplib::ThreadPool(64); };

    const auto socket =
        server.bind_to_port("127.0.0.1", currentPort);

    if (socket < 1)
    {
        std::cerr
            << "\nERROR: Cannot bind to port " << currentPort << "!\n"
            << "Possible reasons:\n"
            << "1. Port " << currentPort << " is already being used.\n"
            << "2. Firewall is blocking the application.\n"
            << "\nTry changing port " << currentPort << " to " << (currentPort + 1) << " in your .env file.\n"
            << std::endl;

        curl_global_cleanup();
        return 1;
    }

    std::cout
        << "\nServer successfully bound to port " << currentPort << ".\n"
        << "Open: http://127.0.0.1:" << currentPort << "\n"
        << "Keep this terminal open.\n"
        << "Press Ctrl+C to stop the server.\n"
        << std::endl;

    server.listen_after_bind();

    curl_global_cleanup();
    return 0;
}




