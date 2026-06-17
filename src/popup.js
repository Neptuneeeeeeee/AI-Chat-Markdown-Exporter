const SUPPORTED_HOSTS = [
  ["chatgpt.com", "ChatGPT"],
  ["chat.openai.com", "ChatGPT"],
  ["claude.ai", "Claude"],
  ["gemini.google.com", "Gemini"]
];

const DIRECTORY_DB_NAME = "aiChatMarkdownExporter";
const DIRECTORY_DB_VERSION = 1;
const DIRECTORY_KEY = "downloadDirectory";
const DIRECTORY_STORE = "handles";
const SETTINGS_KEY = "aiChatMdExporterSettings";
const DEFAULT_SETTINGS = {
  askWhereToSave: false,
  downloadFolderName: "",
  includeDeepResearchReferences: true,
  includeMessageTimestamps: true,
  includeMeta: true,
  includeShareLink: true,
  includeThoughtProcess: true,
  includeWebSearchSources: true
};

const askWhereToSaveInput = document.querySelector("#askWhereToSave");
const chooseDownloadFolderButton = document.querySelector("#chooseDownloadFolder");
const conversationTitle = document.querySelector("#conversationTitle");
const downloadFolderName = document.querySelector("#downloadFolderName");
const exportButton = document.querySelector("#exportButton");
const includeDeepResearchReferencesInput = document.querySelector("#includeDeepResearchReferences");
const includeMessageTimestampsInput = document.querySelector("#includeMessageTimestamps");
const includeMetaInput = document.querySelector("#includeMeta");
const includeShareLinkInput = document.querySelector("#includeShareLink");
const includeThoughtProcessInput = document.querySelector("#includeThoughtProcess");
const includeWebSearchSourcesInput = document.querySelector("#includeWebSearchSources");
const messageList = document.querySelector("#messageList");
const selectionCount = document.querySelector("#selectionCount");
const shareUrlInput = document.querySelector("#shareUrl");
const siteLabel = document.querySelector("#siteLabel");
const statusLabel = document.querySelector("#status");

const state = {
  conversation: null,
  selectedTurnIds: new Set(),
  tab: null
};

function setStatus(message, isError = false) {
  statusLabel.textContent = message;
  statusLabel.classList.toggle("error", isError);
}

function getSupportedSite(url) {
  try {
    const hostname = new URL(url).hostname;
    const match = SUPPORTED_HOSTS.find(([host]) => hostname === host || hostname.endsWith(`.${host}`));
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function escapeText(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function selectedMessageIds() {
  return (state.conversation?.turns ?? [])
    .filter((turn) => state.selectedTurnIds.has(turn.id))
    .flatMap((turn) => turn.messageIds);
}

function updateSelectionCount() {
  const total = state.conversation?.turns.length ?? 0;
  const count = state.selectedTurnIds.size;
  selectionCount.textContent = `${count} / ${total} 已选问答`;
  exportButton.disabled = count === 0 || total === 0;
}

function renderMessages() {
  const turns = state.conversation?.turns ?? [];

  if (!turns.length) {
    messageList.innerHTML = "<p class=\"empty\">没有找到可选择的提问。</p>";
    updateSelectionCount();
    return;
  }

  messageList.innerHTML = turns
    .map((turn) => {
      const checked = state.selectedTurnIds.has(turn.id) ? "checked" : "";
      const preview = escapeText(turn.preview || "空提问");
      const timestamp = turn.timestamp ? `<span class="message-time">${escapeText(turn.timestamp)}</span>` : "";

      return `
        <label class="message-item">
          <input type="checkbox" value="${turn.id}" ${checked}>
          <span class="message-copy">
            <span class="message-meta">${turn.index}. You:${timestamp}</span>
            <span class="message-preview">${preview}</span>
          </span>
        </label>
      `;
    })
    .join("");

  updateSelectionCount();
}

function applySelection(mode) {
  const turns = state.conversation?.turns ?? [];
  state.selectedTurnIds.clear();

  if (mode !== "all") {
    renderMessages();
    return;
  }

  for (const turn of turns) {
    state.selectedTurnIds.add(turn.id);
  }

  renderMessages();
}

function openDirectoryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DIRECTORY_DB_NAME, DIRECTORY_DB_VERSION);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(DIRECTORY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readDirectoryHandle() {
  const db = await openDirectoryDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DIRECTORY_STORE, "readonly");
    const request = transaction.objectStore(DIRECTORY_STORE).get(DIRECTORY_KEY);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function writeDirectoryHandle(handle) {
  const db = await openDirectoryDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DIRECTORY_STORE, "readwrite");
    const request = transaction.objectStore(DIRECTORY_STORE).put(handle, DIRECTORY_KEY);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function ensureDirectoryPermission(handle) {
  const options = { mode: "readwrite" };

  if (typeof handle.queryPermission === "function") {
    const current = await handle.queryPermission(options);
    if (current === "granted") return true;
  }

  if (typeof handle.requestPermission === "function") {
    return (await handle.requestPermission(options)) === "granted";
  }

  return true;
}

function splitFilename(filename) {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return { ext: "", stem: filename };
  return {
    ext: filename.slice(dot),
    stem: filename.slice(0, dot)
  };
}

async function fileExists(directoryHandle, filename) {
  try {
    await directoryHandle.getFileHandle(filename);
    return true;
  } catch {
    return false;
  }
}

async function uniqueFilename(directoryHandle, filename) {
  if (!(await fileExists(directoryHandle, filename))) return filename;

  const { ext, stem } = splitFilename(filename);
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${stem} (${index})${ext}`;
    if (!(await fileExists(directoryHandle, candidate))) return candidate;
  }

  return `${stem}-${Date.now()}${ext}`;
}

async function writeMarkdownToDirectory(directoryHandle, filename, markdown) {
  if (!(await ensureDirectoryPermission(directoryHandle))) {
    throw new Error("没有获得该文件夹的写入权限。");
  }

  const safeFilename = await uniqueFilename(directoryHandle, filename);
  const fileHandle = await directoryHandle.getFileHandle(safeFilename, { create: true });
  const writable = await fileHandle.createWritable();

  await writable.write(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  await writable.close();
  return safeFilename;
}

async function downloadMarkdown(filename, markdown) {
  const directoryHandle = askWhereToSaveInput.checked ? null : await readDirectoryHandle();

  if (directoryHandle) {
    await writeMarkdownToDirectory(directoryHandle, filename, markdown);
    return "folder";
  }

  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    await chrome.downloads.download({
      conflictAction: "uniquify",
      filename,
      saveAs: askWhereToSaveInput.checked,
      url
    });
    return "downloads";
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadSettings() {
  const result = await chrome.storage.sync.get(SETTINGS_KEY);
  const settings = { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] ?? {}) };
  const folderName = settings.downloadFolderName || "";
  askWhereToSaveInput.checked = settings.askWhereToSave;
  downloadFolderName.textContent = folderName || "未选择，使用 Chrome 默认下载目录";
  downloadFolderName.dataset.folderName = folderName;
  includeDeepResearchReferencesInput.checked = settings.includeDeepResearchReferences;
  includeMessageTimestampsInput.checked = settings.includeMessageTimestamps;
  includeMetaInput.checked = settings.includeMeta;
  includeShareLinkInput.checked = settings.includeShareLink;
  includeThoughtProcessInput.checked = settings.includeThoughtProcess;
  includeWebSearchSourcesInput.checked = settings.includeWebSearchSources;
}

async function saveSettings() {
  await chrome.storage.sync.set({
    [SETTINGS_KEY]: {
      askWhereToSave: askWhereToSaveInput.checked,
      downloadFolderName: downloadFolderName.dataset.folderName || "",
      includeDeepResearchReferences: includeDeepResearchReferencesInput.checked,
      includeMessageTimestamps: includeMessageTimestampsInput.checked,
      includeMeta: includeMetaInput.checked,
      includeShareLink: includeShareLinkInput.checked,
      includeThoughtProcess: includeThoughtProcessInput.checked,
      includeWebSearchSources: includeWebSearchSourcesInput.checked
    }
  });
}

async function chooseDownloadFolder() {
  if (typeof window.showDirectoryPicker !== "function") {
    askWhereToSaveInput.checked = true;
    await saveSettings();
    setStatus("当前浏览器不支持选择文件夹，已改为每次询问保存位置。", true);
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({
      id: "ai-chat-markdown-exporter",
      mode: "readwrite"
    });

    if (!(await ensureDirectoryPermission(handle))) {
      throw new Error("没有获得该文件夹的写入权限。");
    }

    await writeDirectoryHandle(handle);
    downloadFolderName.textContent = handle.name;
    downloadFolderName.dataset.folderName = handle.name;
    askWhereToSaveInput.checked = false;
    await saveSettings();
    setStatus(`已选择下载文件夹：${handle.name}`);
  } catch (error) {
    if (error?.name === "AbortError") {
      setStatus("已取消选择文件夹。");
      return;
    }

    setStatus(error?.message ?? "选择文件夹失败。", true);
  }
}

async function loadConversation() {
  const response = await chrome.tabs.sendMessage(state.tab.id, {
    type: "GET_CONVERSATION"
  });

  if (!response?.ok) {
    throw new Error(response?.error ?? "无法读取当前对话。");
  }

  state.conversation = response.conversation;
  state.selectedTurnIds = new Set(response.conversation.turns.map((turn) => turn.id));
  siteLabel.textContent = response.conversation.platform;
  conversationTitle.textContent = response.conversation.title;
  renderMessages();
}

async function init() {
  await loadSettings();
  state.tab = await getActiveTab();
  const site = getSupportedSite(state.tab?.url ?? "");

  if (!site) {
    siteLabel.textContent = "当前页面不支持";
    exportButton.disabled = true;
    setStatus("支持 ChatGPT、Claude 和 Gemini。", true);
    return;
  }

  siteLabel.textContent = site;
  setStatus("正在读取当前对话...");

  try {
    await loadConversation();
    setStatus("选择要导出的问答。");
  } catch (error) {
    const message = error?.message?.includes("Receiving end does not exist")
      ? "请刷新页面后重试。"
      : error?.message ?? "读取失败。";

    exportButton.disabled = true;
    setStatus(message, true);
  }
}

document.querySelector(".quick-actions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-select]");
  if (!button) return;

  const mode = button.dataset.select;
  if (mode === "none") {
    state.selectedTurnIds.clear();
    renderMessages();
    return;
  }

  applySelection(mode);
});

messageList.addEventListener("change", (event) => {
  const checkbox = event.target.closest("input[type='checkbox']");
  if (!checkbox) return;

  if (checkbox.checked) {
    state.selectedTurnIds.add(checkbox.value);
  } else {
    state.selectedTurnIds.delete(checkbox.value);
  }

  updateSelectionCount();
});

includeMetaInput.addEventListener("change", saveSettings);
includeShareLinkInput.addEventListener("change", saveSettings);
includeMessageTimestampsInput.addEventListener("change", saveSettings);
includeThoughtProcessInput.addEventListener("change", saveSettings);
includeWebSearchSourcesInput.addEventListener("change", saveSettings);
includeDeepResearchReferencesInput.addEventListener("change", saveSettings);
askWhereToSaveInput.addEventListener("change", saveSettings);
chooseDownloadFolderButton.addEventListener("click", chooseDownloadFolder);

exportButton.addEventListener("click", async () => {
  exportButton.disabled = true;
  setStatus("正在生成 Markdown...");

  try {
    const response = await chrome.tabs.sendMessage(state.tab.id, {
      type: "EXPORT_MARKDOWN",
      options: {
        includeDeepResearchReferences: includeDeepResearchReferencesInput.checked,
        includeMessageTimestamps: includeMessageTimestampsInput.checked,
        includeMeta: includeMetaInput.checked,
        includeShareLink: includeShareLinkInput.checked,
        includeThoughtProcess: includeThoughtProcessInput.checked,
        includeWebSearchSources: includeWebSearchSourcesInput.checked,
        roleFilter: "all",
        selectedMessageIds: selectedMessageIds(),
        shareUrl: shareUrlInput.value.trim()
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error ?? "无法导出当前页面。");
    }

    await saveSettings();
    const method = await downloadMarkdown(response.filename, response.markdown);
    const destination = method === "folder" ? "到所选文件夹" : "到浏览器下载位置";
    setStatus(`已导出 ${state.selectedTurnIds.size} 个问答${destination}。`);
  } catch (error) {
    const message = error?.message?.includes("Receiving end does not exist")
      ? "请刷新页面后重试。"
      : error?.message ?? "导出失败。";

    setStatus(message, true);
  } finally {
    updateSelectionCount();
  }
});

init();
