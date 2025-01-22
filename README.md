# GPT

OpenAI's models inside of Visual Studio Code

<div id="models"></div>

### 🎨 Models
- o1
- o1-mini
- GPT-4o
- GPT-4o-mini
- GPT-4-Turbo
- GPT-3.5-Turbo

<br>

![](https://raw.githubusercontent.com/silasnevstad/GPT-Extension-VSCode/main/demo.gif?raw=true)

<br>
<div id="getting-started"></div>

## 🚀 Getting Started
1. [Set your API key](#set-your-api-key)
2. Highlight question or code
3. Open Command Palette (```cmd + shift + p```)
4. Type 'Ask GPT'

The model's response can either be opened in a new file or have it replace the highlighted question.

<br>
<div id="instructions"></div>

## 📝 Tools

<div id="set-your-api-key"></div>

### 🛠 To set your own API key:

1. Get an API key
    - Go to [OpenAI's website](https://platform.openai.com).
    - Navigate to `Dashboard` (top menu) --> `API Keys` (left-hand menu).
    - Click the button "Create new secret key" and copy it.

2. Press ```cmd + shift + p``` (Command Palette) and search for "Set API Key"

<br>

### 🛠 To change the model: 

1. Press ```cmd + shift + p``` (Command Palette) and search for "Change Model"

<br>

### 🛠 To change the token limit:

1. Press ```cmd + shift + p``` (Command Palette) and search for "Change Token Limit"

<br>
<div id="features"></div>

## ✨️ Features

- **AskGPT** - Ask GPT any question you want.

- **GPT: Set API Key** - Enter an API key to use.

- **GPT: Change Model** - Select from given models.

- **GPT: Change Limit** - Change the token limit.

- **GPT: Show Chat History** - Shows your chat history.

- **GPT: Clear Chat History** - Clears the chat history.

- **GPT: Change Output Mode** - Switches the output mode, either opening in a new file, or replacing the question.

- **GPT: Change Debug Mode** - Switches the debug mode on or off.

<br>
<div id="release-notes"></div>

## 📒 Release Notes

### 1.0.0
- Newest models (o1)
- Improved chat history for better readability.
- Keyboard shortcut added (`alt` + `shift` + `i`)

#### 0.4.8
- Newer models (o1-preview and o1-mini)
- More detailed error and debug messages.

#### 0.4.7
- Added debug mode with logging.
- Using axios instead of OpenAI library.

#### 0.4.2
- Removed Davinci model (deprecated)
- Added GPT-4o

#### 0.4.0
- Added GPT-4-Turbo

#### 0.3.4
- API keys saved across sessions

#### 0.3.0
- Removed Shared API Key privileges.

#### 0.2.2
- Compatible with VSCode 1.7^
- Chat History Added
- GPT-4 Added

#### 0.1.3
- Error handling for shared API key usage.