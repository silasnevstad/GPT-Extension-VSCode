# GPT

Use OpenAI’s models inside Visual Studio Code

![](https://raw.githubusercontent.com/silasnevstad/GPT-Extension-VSCode/main/demo.gif?raw=true)

<div id="models"></div>

## Supported Models
- **o3-mini**
- **o1**
- **o1-mini**
- **GPT-4o**
- **GPT-4o-mini**
- **GPT-4-Turbo**
- **GPT-3.5-Turbo**

<br>
<div id="getting-started"></div>

## 🚀 Getting Started

1. [Set your API key](#set-your-api-key).
2. Highlight a question or code snippet in the editor (or use the entire file).
3. Open the Command Palette (`Cmd + Shift + P` on macOS, `Ctrl + Shift + P` on Windows/Linux).
4. Type **"Ask GPT"**.

GPT’s response can either replace the highlighted text or open in a new file, depending on your [Output Mode](#gpt-change-output-mode).

<br>
<div id="instructions"></div>

## 📝 Key Commands & Tools

### 🛠 **GPT: Set API Key** <div id="set-your-api-key"></div>
1. Get an API key from [OpenAI's website](https://platform.openai.com).
   - Navigate to **Dashboard** → **API Keys**.
   - Click **"Create new secret key"** and copy it.
2. Press `Cmd + Shift + P` (macOS) or `Ctrl + Shift + P` (Windows/Linux).
3. Search for **"GPT: Set API Key"** and enter your key.

---

### 🛠 **Ask GPT**
- **Command**: `Ask GPT`
- **Shortcut**: `Alt + Shift + I`
- **Usage**:
   - Highlight code or text.
   - Run the **Ask GPT** command.
   - The extension sends the selected text to GPT and displays the response.

---

### 🛠 **Ask GPT with File**
- **Command**: `Ask GPT with File`
- **Usage**:
   - Sends the **entire file** contents to GPT rather than just the highlighted text.

---

### 🛠 **GPT: Insert Response as Comment**
- **Command**: `GPT: Insert Response as Comment`
- **Usage**:
   - Prompts you for a GPT question.
   - The response is inserted as comment(s) directly into your file at the cursor position.
   - Great for in‑context code explanations.

---

### 🛠 **GPT: Export Chat History**
- **Command**: `GPT: Export Chat History`
- **Usage**:
   - Exports the entire multi‑turn conversation to a Markdown file of your choice.
   - Perfect for saving a record of your Q&A session.

---

### 🛠 **GPT: Show Chat History**
- **Command**: `GPT: Show Chat History`
- **Usage**:
   - Displays your entire multi‑turn conversation in a Markdown document, opened in a new pane.

---

### 🛠 **GPT: Clear Chat History**
- **Command**: `GPT: Clear Chat History`
- **Usage**:
   - Resets the conversation context completely.

---

### 🛠 **GPT: Change Model**
- **Command**: `GPT: Change Model`
- **Usage**:
   - Pick from the available models (e.g., `o1`, `GPT-4-Turbo`, etc.).
   - Adjusts your conversation to that model for subsequent queries.

---

### 🛠 **GPT: Change Token Limit**
- **Command**: `GPT: Change Token Limit`
- **Usage**:
   - Sets the maximum number of tokens (response length) GPT can return.
   - Useful for limiting or extending GPT’s response size, subject to each model’s max capacity.

---

### 🛠 **GPT: Change Output Mode**
- **Command**: `GPT: Change Output Mode`
- **Usage**:
   - Toggles between **"Replace Selection"** and **"New File"**.
   - **Replace Selection** overwrites the highlighted text with GPT’s answer.
   - **New File** opens the GPT response in a fresh editor tab.

---

### 🛠 **GPT: Change Debug Mode**
- **Command**: `GPT: Change Debug Mode`
- **Usage**:
   - Toggles debug output on or off.
   - When on, logs details (request data, timing, errors) to the **GPT Debug** output channel (View → Output).

---

### 🛠 **GPT: Change Temperature**
- **Command**: `GPT: Change Temperature`
- **Usage**:
   - Adjusts GPT’s “creativity” from `0.0` (more deterministic) to `1.0` (more random).

---

### 🛠 **GPT: Change top_p**
- **Command**: `GPT: Change TopP`
- **Usage**:
   - Restricts responses to top probability tokens, from `0.0` to `1.0`.
   - Similar effect to `temperature` but can be used in tandem.

<br>
<div id="features"></div>

## ✨️ Additional Features

- **Multi‑turn Chat**: The extension remembers the conversation context, so your next question can build on previous answers.
- **Error & Rate Limit Handling**: Clear messages for invalid keys, model issues, or rate limits.
- **Cross‑Language Support**: Works for code or text in any language supported by VSCode.
- **API Key Storage**: Your key is saved securely in VS Code’s local storage.

<br>
<div id="release-notes"></div>

## 📒 Release Notes

### 1.1.0
- **Multi‑turn chat** for continuous conversation flow.
- Support for latest models (`o3-mini`).
- **Change temperature** and **top_p** settings.
- **Export chat history** to a Markdown file.
- **Insert response as comment** in your code.

### 1.0.0

- Support for latest models (`o1`, etc.).
- Improved chat history readability.
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
- Compatible with VSCode 1.7 and above.
- Added GPT‑4, basic chat history.

#### 0.1.3
- Handled errors for shared API key usage.

<br>

## ⚙️ Troubleshooting

- **Invalid Key**: Ensure your key is correct and active at OpenAI’s [API Keys](https://platform.openai.com/account/api-keys).
- **Rate Limits**: If you hit a request limit, wait a few seconds or check your [OpenAI usage dashboard](https://platform.openai.com/account/usage).
- **Debugging**: Toggle **"GPT: Change Debug Mode"** to see request logs in the **GPT Debug** output channel.

<br>

## License

[MIT License](LICENSE) – Open‑source for ease of use and contributions.

<br>

> **Happy Coding & Prompting!**

<br>
