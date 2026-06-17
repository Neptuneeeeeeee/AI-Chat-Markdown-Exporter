# AI Chat Markdown Exporter

Chrome extension for exporting the currently open ChatGPT, Claude, or Gemini conversation as a Markdown file.

Exports include an official link footer by default. The extension tries to detect public share URLs from the page; if none is visible, it uses the current conversation URL. You can also paste an official share URL in the popup before exporting.

The popup shows each user prompt as a checkbox item. Selecting a prompt exports that prompt and its following assistant answer. Export settings are grouped under a collapsed settings section and saved between popup sessions.

The settings panel includes extension-specific download settings, plus toggles for message timestamps, visible thought-process summaries, web-search sources, and Deep Research references. The download folder button uses Chrome's system directory picker when available and falls back to Chrome's download/save dialog when the browser does not support direct folder access.

## Supported Sites

- ChatGPT: `chatgpt.com`, `chat.openai.com`
- Claude: `claude.ai`
- Gemini: `gemini.google.com`

## Development

```bash
npm run icons
npm run check
npm test
npm run build
```

Load the built extension from `dist/`:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this project's `dist/` directory.

## Notes

The extension exports the currently open conversation. It reads visible page content from the browser DOM and does not call private backend APIs.
