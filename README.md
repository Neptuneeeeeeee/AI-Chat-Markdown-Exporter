# AI Chat Markdown Exporter

Chrome extension for exporting the currently open ChatGPT, Claude, or Gemini conversation as a Markdown file.

Exports include an official link footer by default. The extension tries to detect public share URLs from the page; if none is visible, it uses the current conversation URL. You can also paste an official share URL in the popup before exporting.

The popup shows each user prompt as a checkbox item. Selecting a prompt exports that prompt and its following assistant answer. Export settings are grouped under a collapsed settings section and saved between popup sessions.

The settings panel includes extension-specific download settings, plus toggles for message timestamps, visible thought-process summaries, web-search sources, and Deep Research references. The download folder button uses Chrome's system directory picker when available and falls back to Chrome's download/save dialog when the browser does not support direct folder access.

## Preview

![AI Chat Markdown Exporter popup preview](docs/images/popup-preview.png)

## Supported Sites

- ChatGPT: `chatgpt.com`, `chat.openai.com`
- Claude: `claude.ai`
- Gemini: `gemini.google.com`

## 使用说明

安装扩展后，在支持的 AI 对话页面打开插件弹窗，选择想保存的提问并导出 Markdown。每个选中的提问会和它对应的 AI 回答一起保存。

导出设置可以按需展开调整；如果当前浏览器不支持直接选择下载文件夹，扩展会使用 Chrome 自带下载流程。

## Usage

After installing the extension, open the popup on a supported AI chat page, choose the prompts you want to keep, and export them as Markdown. Each selected prompt is saved with its matching AI answer.

Export settings are optional; if direct folder selection is unavailable, the extension uses Chrome's built-in download flow.

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
