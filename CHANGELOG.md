# Change Log

All notable changes to the "GPT" extension will be documented in this file.

## 1.2.1
- Refreshed extension branding and media assets (new icon + updated demo).

## 1.2.0
- Added multi-provider support (OpenAI / Anthropic / Gemini) with centralized routing and normalized error handling.
- Added unified **GPT: Manage API Keys** (SecretStorage-backed) and deprecated **GPT: Set API Key** as an internal redirect only.
- Added dynamic model discovery with caching and filtering, plus explicit **Refresh model list (online)**.
- Updated OpenAI integration to use the Responses API request pattern.

## 1.1.1
- Hardened `.gpt-instruction` loading with absolute size caps and safer filesystem handling.
- Improved SecretStorage error handling and legacy key migration.
- Made request cancellation silent and more reliable.

## 0.4.7
- Added debug mode with logging.

## 0.4.6
- Using axios instead of OpenAI library.

## 0.4.2
- Removed Davinci model (deprecated)
- Added GPT-4o

## 0.4.0
- Added GPT-4-Turbo

## 0.3.4
- API keys saved across sessions

## 0.3.0
- Removed Shared API Key privileges.

## 0.2.2
- Compatible with VSCode 1.7^

## 0.2.0
- Chat History Added

## 0.1.5
- GPT-4 Added

## 0.1.3
- Error handling for shared API key usage.

## 0.1.2
- Implemented individual API key use and flexible token limit.

## 0.1.0
- Initial release
