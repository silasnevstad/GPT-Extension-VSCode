# GPT

ChatGPT inside of Visual Studio Code

![](https://raw.githubusercontent.com/silasnevstad/GPT-Extension-VSCode/main/demo.gif?raw=true)

## Models

- GPT-4o
- GPT-4-Turbo
- GPT-3.5-Turbo

## Instructions
* Highlight question or code
* Open Command Palette (```cmd + shift + p```)
* Type 'Ask GPT'

GPT's response can either be opened in a new file or have it replace the highlighted question.

## Set Up
To set your own API key:

1. Go to OpenAI's website to create one.
2. Once logged in, click on your account in the top right corner.
3. Select "View API Keys" from the drop-down menu.
4. Click the button "Create a new key."

- Press ```cmd + shift + p``` (Command Palette) and search for "Set API Key"

To select model:

- Press ```cmd + shift + p``` (Command Palette) and search for "Change Model"

To change the token limit (only available on davinci model):

- Press ```cmd + shift + p``` (Command Palette) and search for "Change Token Limit"



## Features

- AskGPT - Ask GPT any question you want.

- GPT: Set API Key - Enter an API key to use.

- GPT: Change Model - Select from given models.
- 
- GPT: Change Limit - Change the token limit.

- GPT: Show Chat History - Shows your chat history.

- GPT: Clear Chat History - Clears the chat history.

- GPT: Change Output Mode - Switches the output mode, either opening in a new file, or replacing the question.

## Release Notes

## 0.4.6
- Using axios instead of OpenAI library.

### 0.4.2
- Removed Davinci model (deprecated)
- Added GPT-4o

### 0.4.0
- Added GPT-4-Turbo

### 0.3.4
- API keys saved across sessions

### 0.3.0
- Removed Shared API Key privileges.

### 0.2.2
- Compatible with VSCode 1.7^

### 0.2.0
- Chat History Added

### 0.1.5
- GPT-4 Added

### 0.1.3
- Error handling for shared API key usage.

### 0.1.2
- Implemented individual API key use and flexible token limit.