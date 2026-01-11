# GPT

Use OpenAI, Anthropic, or Gemini models inside Visual Studio Code

![](https://raw.githubusercontent.com/silasnevstad/GPT-Extension-VSCode/main/demo.gif?raw=true)

## Contents
- [Supported Models](#models)
- [Getting Started](#getting-started)
- [Key Commands](#instructions)
- [Additional Features](#features)
- [Release Notes](#release-notes)
- [Troubleshooting](#troubleshooting)
- [Support the Project](#support)
- [License](#license)

<div id="models"></div>

## Supported Models
Models are dynamically discovered (via **GPT: Change Model** → **Refresh model list (online)**).

You can always use **“Custom model id…”** to enter any model id manually.

<br>
<div id="getting-started"></div>

## 🚀 Getting Started

1. [Set your API key](#manage-api-keys).
2. Highlight a question or code snippet in the editor (or use the entire file).
3. Open the Command Palette (`Cmd + Shift + P` on macOS, `Ctrl + Shift + P` on Windows/Linux).
4. Type **"Ask GPT"**.

GPT’s response can either replace the highlighted text or open in a new file, depending on your [Output Mode](#gpt-change-output-mode).

<br>
<div id="instructions"></div>

## 📝 Key Commands & Tools

### 🛠 **GPT: Manage API Keys** <div id="manage-api-keys"></div>

Manage all provider API keys in one place.

1. Open the Command Palette  
   (`Cmd + Shift + P` on macOS, `Ctrl + Shift + P` on Windows/Linux)
2. Run **GPT: Manage API Keys**
3. Select a provider:
   - OpenAI
   - Anthropic
   - Gemini
4. Choose an action:
   - **Set / Update API key**
   - **Remove API key**

Each provider shows its current status (**Configured** or **Not set**).

> API keys are stored securely using VS Code SecretStorage.

> Legacy OpenAI keys previously stored in globalState are migrated automatically when SecretStorage is available.

---

### 🧩 Providers (OpenAI / Anthropic / Gemini)

- Default provider is **OpenAI**
- Switch provider: **GPT: Change Provider**
- API keys are managed centrally via **GPT: Manage API Keys**
- `.gpt-instruction` is applied as a system instruction for all providers.

---

### 🛠 **Ask GPT**
- **Command**: `Ask GPT`
- **Shortcut**: `Alt + Shift + I`
- **Usage**:
  - Highlight code or text.
  - Run **Ask GPT**.
  - GPT replies with the answer in a new document or replaces the selected text (based on [Output Mode](#gpt-change-output-mode)).

---

### 🛠 **Ask GPT with File**
- **Command**: `Ask GPT with File`
- **Usage**:
  - Sends the **entire file** contents to GPT instead of just highlighted text.

---

### 🛠 **GPT: Export Chat History**
- **Command**: `GPT: Export Chat History`
- **Usage**:
  - Exports your entire conversation to a Markdown file—useful for sharing or later reference.

---

### 🛠 **GPT: Show Chat History**
- **Command**: `GPT: Show Chat History`
- **Usage**:
  - Displays your multi‑turn conversation as a Markdown document in a new pane.

---

### 🛠 **GPT: Clear Chat History**
- **Command**: `GPT: Clear Chat History`
- **Usage**:
  - Resets the entire conversation context, wiping all previous Q&A turns.

---

### 🛠 **GPT: Change Model**
- **Command**: `GPT: Change Model`
- **Usage**:
  - Pick from available models.
  - Use **Refresh model list (online)** to fetch the latest models from your provider.
  - Subsequent requests use the chosen model.

---

### 🛠 **GPT: Change Token Limit**
- **Command**: `GPT: Change Token Limit`
- **Usage**:
  - Sets how many tokens GPT can return (up to each model’s maximum).

---

### 🛠 **GPT: Change Temperature**
- **Command**: `GPT: Change Temperature`
- **Usage**:
  - Adjusts GPT’s “creativity” from `0.0` (deterministic) to `1.0` (more freeform).

---

### 🛠 **GPT: Change TopP**
- **Command**: `GPT: Change TopP`
- **Usage**:
  - Limits GPT to top‑probability tokens from `0.0`–`1.0`.
  - Higher values allow more diverse tokens.

---

### 🛠 **GPT: Change Context Mode** <div id="gpt-change-context-mode"></div>
- **Command**: `GPT: Change Context Mode`
- **Options**:
  - **No Context** – Ignores all previous messages, each query is single‑turn.
  - **Last N Messages** – Considers only the most recent *N* turns from the conversation.
  - **Full** – Considers the entire conversation for each new request.
- **Usage**:
  - Ideal for switching between single question/answer usage and deeper, multi‑turn conversation.

---

### 🛠 **GPT: Set Context Length**
- **Command**: `GPT: Set Context Length`
- **Usage**:
  - If **Last N Messages** context mode is active, specify how many recent messages GPT considers.

---

### 🛠 **GPT: Change Output Mode** <div id="gpt-change-output-mode"></div>
- **Command**: `GPT: Change Output Mode`
- **Usage**:
  - Toggles between **"Replace Selection"** or **"New File"**.
  - In “Replace Selection” mode, GPT’s response overwrites the text you highlighted.
  - In “New File” mode, GPT’s response opens in a fresh editor tab.

---

### 🛠 **GPT: Change Debug Mode**
- **Command**: `GPT: Change Debug Mode`
- **Usage**:
  - Shows or hides detailed logs in the **GPT Debug** output channel for troubleshooting.

---

<br>
<div id="features"></div>

## ✨ Additional Features

- **Flexible Conversation Context**: Choose no context, the last N messages, or the entire session for each query.
- **Error & Rate Limit Handling**: Clear messages for invalid keys, missing model, or rate limits.
- **Cross‑Language Support**: Works for code or text in any language recognized by VSCode.
- **API Key Storage**: Stores provider API keys securely in VS Code SecretStorage and migrates legacy OpenAI keys previously stored in globalState.
- **Project Instructions**: Place a `.gpt-instruction` file in your workspace to automatically prefix each query with custom guidance.

### `.gpt-instruction`

* **Multi-root:** instructions resolve per workspace folder based on the active document.
* **Lookup modes:**
  * `workspaceRoot` (default): reads `<workspaceFolder>/.gpt-instruction`
  * `nearestParent`: searches upward from the active file’s directory to the workspace root; the closest `.gpt-instruction` wins
* **Nearest-parent behavior:**
  * An empty `.gpt-instruction` *suppresses* parent directory instructions.
  * This mode can be more expensive in very large repos because it uses a recursive watcher.
* **Size limits:**
  * `.gpt-instruction` is capped by the configured max size; content beyond the limit is truncated with a warning.
  * In remote/virtual workspaces, extremely large files may be **ignored** instead of truncated (because `workspace.fs.readFile` must read the entire file first).
<br>
<div id="release-notes"></div>

## 📒 Release Notes

### 1.1.1
- **Per-Project Instructions**: Queries are prefixed with the contents of `.gpt-instruction` if present in the workspace.

### 1.1.0
- **Conversation Context Modes**:
  - **No Context**, **Last N Messages**, or **Full** conversation reference.
  - **Set Context Length** for Last N mode.
- Support for latest models (`o3-mini`).
- **Change temperature** and **top_p** settings.
- **Export chat history** to a Markdown file.
- **Insert response as comment** in your code.

### 1.0.0
- Support for newest models (`o1`, etc.).
- Improved chat history and advanced error handling.
- Keyboard shortcut (`Alt + Shift + I`).

#### 0.4.8
- Added newer models (`o1-preview`, `o1-mini`).
- Enhanced error/debug messages.

#### 0.4.7
- Introduced debug mode (logs in `GPT Debug` panel).
- Switched to axios for HTTP requests.

#### 0.4.2
- Removed Davinci (deprecated).
- Added GPT‑4o model.

#### 0.4.0
- Added GPT‑4‑Turbo model.

#### 0.3.4
- API keys saved securely across sessions.

#### 0.3.0
- Removed shared API Key usage.

#### 0.2.2
- Compatible with VSCode 1.7+.
- Basic multi‑turn chat.
- Added GPT‑4.

#### 0.1.3
- Handled errors for shared API key usage.

<br>

<div id="troubleshooting"></div>

## ⚙️ Troubleshooting

- **Invalid or Missing API Key**: Run **GPT: Manage API Keys** and verify the key for the active provider.
- **Rate Limits**: If usage is too high, wait or check your [OpenAI usage dashboard](https://platform.openai.com/account/usage).
- **Debugging**: Toggle **"GPT: Change Debug Mode"** to see request logs in **GPT Debug**.

<br>

<div id="support"></div>

## ❤️ Support the Project

GPT is free and open-source. If this extension saves you time or helps your workflow,
you can optionally support my work on it.

Support helps cover maintenance, testing against new model APIs,
and ongoing improvements (but the extension will remain free).

- [☕ **Buy Me a Coffee**](https://buymeacoffee.com/silasnevstad)
- [⭐ **GitHub Sponsors**](https://github.com/sponsors/silasnevstad)


<div id="license"></div>

## License

[MIT License](LICENSE) – Open‑source for flexibility and contributions.

<br>
