# GPT Helper

GPT inside of Visual Studio Code

![](demo.mov)

![](demo2.mov)

![](demo3.mov)

## Instructions
* Highlight question or code
* Open Command Palette (```cmd + shift + p```)
* Type 'Ask GPT'

The response is opens in a new file.

## Set Up
By default, the extension uses a shared API key, and limits tokens to 64 per response. 

If you wish to set your own API key:

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

GPT-4: Currently in a limited beta and only accessible to those who have been granted access. Join the waitlist here: ![https://openai.com/waitlist/gpt-4]

GPT-4-32k: Same as GPT-4 but with 4x the context length.

GPT-3.5-Turbo (Default) (Max Tokens: 4096)

Text-Davinci-003 (Max Tokens: 4097)

## Features

AskGPT - Ask GPT any question you want.

GPT: Set API Key - Enter an API key to use.

GPT: Change Model - Select from given models.

GPT: Change Token Limit - Enter a new limit on the API. (Can't be default API key)

## Known Issues

Let me know of any issues.

## Release Notes

0.1.5 - GPT-4 Added

### 0.1.2

Implemented individual API key use and flexible token limit.
