# Codebase Refactoring & Security Action Plan

Below is a bulleted list of the identified problems in the codebase and the specific methods required to fix them.

*   **Problem (Frontend Modularity)**: The `script.js` file is a massive 3,600-line monolith, which causes scope pollution and makes the code difficult to maintain and collaborate on.
    *   **Method of Fix**: Migrate the JavaScript to ES6 Modules. Split the code into separate, focused files such as `apiService.js` (for Groq API calls), `uiController.js` (for DOM manipulation), `stateManager.js` (for chat history/settings), and `utils.js`.

*   **Problem (CSS Maintainability)**: The `style.css` file is over 5,200 lines long, making it highly susceptible to CSS specificity conflicts and dead, unused code.
    *   **Method of Fix**: Adopt a CSS architecture like BEM (Block Element Modifier), or migrate to a preprocessor like SCSS/SASS to break the styles into modular components (e.g., `_chat.scss`, `_sidebar.scss`, `_variables.scss`).

*   **Problem (Backend Scalability)**: The C++ server uses `curl_easy_perform`, which is synchronous and blocks the worker threads. Under moderate load, the server's thread pool will run out, causing the chatbot to hang for users.
    *   **Method of Fix**: Replace `curl_easy_perform` with `curl_multi_*` APIs to enable asynchronous, non-blocking HTTP requests to the Groq API. Alternatively, migrate the networking layer to an async framework like Boost.Asio or drogon.

*   **Problem (Command Injection Risk)**: Using `std::system("powershell.exe ...")` to unzip and read `.docx` files is a brittle approach and a classic vulnerability vector for Remote Code Execution (RCE) if a malicious file name is passed.
    *   **Method of Fix**: Eliminate the PowerShell subprocess. Integrate a native C++ ZIP library (such as `libzip` or `miniz`) to unzip the DOCX file, and use a lightweight XML parser (such as `pugixml`) to extract the document text entirely within the safety of the C++ application's memory.

*   **Problem (Critical MITM Vulnerability)**: The C++ code explicitly disables SSL certificate verification (`CURLOPT_SSL_VERIFYPEER, 0L`). This allows Man-In-The-Middle network attacks to easily steal Groq API keys and read private user chat data.
    *   **Method of Fix**: Change the setting to `CURLOPT_SSL_VERIFYPEER, 1L`. Download a standard `cacert.pem` file, bundle it with the chatbot executable, and configure `CURLOPT_CAINFO` to point to it so Windows can securely verify the API certificates.

*   **Problem (Secret Management)**: The application loads and stores the `ADMIN_PASSWORD` from the `.env` file directly into plaintext memory, and session tokens are also kept in a plaintext vector.
    *   **Method of Fix**: Hash the admin password using a strong hashing algorithm like bcrypt or Argon2. When an admin logs in, hash their input and compare the hashes rather than comparing plaintext strings.
