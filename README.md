# GPT

GPT inside of Visual Studio Code

![](https://raw.githubusercontent.com/silasnevstad/GPT-Extension-VSCode/main/demo.gif?raw=true)

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

To change the token limit (only avaible on davinci model):

- Press ```cmd + shift + p``` (Command Palette) and search for "Change Token Limit"

## Models

GPT-4: Currently in a limited beta and only accessible to those who have been granted access. Join the waitlist here: [Link](https://openai.com/waitlist/gpt-4)

GPT-4-32k: Same as GPT-4 but with 4x the context length.

GPT-3.5-Turbo (Default) (Max Tokens: 4096)

Text-Davinci-003 (Max Tokens: 4097)

## Features

AskGPT - Ask GPT any question you want.

GPT: Set API Key - Enter an API key to use.

GPT: Change Model - Select from given models.

GPT: Change Token Limit (Only Davinci) - Enter a new limit on the API. (Can't be default API key)

GPT: Show Chat History - Shows your chat history.

GPT: Clear Chat History - Clears the chat history.

GPT: Change Output Mode - Switchs the output mode, either opening in a new file, or replacing the question.

## Known Issues

Shared API key reaches its monthly limit somtimes, in which case, you can add your own API key.

Let me know of any other issues.

## Release Notes

### 0.3.0
Removed Shared API Key due to personal limit having been reached.

### 0.2.2
Now Compatible with VSCode 1.7^

### 0.2.0
Chat History Added

### 0.1.5
GPT-4 Added

### 0.1.3
Added Error handling for shared API key limit reached.

### 0.1.2
Implemented individual API key use and flexible token limit.

### 0.1.0
Initial Release

### 0.1.2
Implemented individual API key use and flexible token limit.


#### Venmo: silasnevstad (to help sponsor the shared api key with gpt-4 privelages)
