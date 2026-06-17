(function initContentScript(global) {
  const utils = global.ChatMdExporter;

  const PLATFORM_NAMES = {
    chatgpt: "ChatGPT",
    claude: "Claude",
    gemini: "Gemini"
  };

  const SHARE_URL_PATTERNS = {
    chatgpt: [
      /^https:\/\/chatgpt\.com\/share\//i,
      /^https:\/\/chat\.openai\.com\/share\//i
    ],
    claude: [
      /^https:\/\/claude\.ai\/share\//i
    ],
    gemini: [
      /^https:\/\/gemini\.google\.com\/share\//i,
      /^https:\/\/g\.co\/gemini\/share\//i
    ]
  };

  const TIMESTAMP_SELECTORS = [
    "time",
    "[datetime]",
    "[data-testid*='timestamp']",
    "[data-testid*='Timestamp']",
    "[aria-label*='timestamp']",
    "[aria-label*='Timestamp']",
    "[aria-label*='time']",
    "[aria-label*='Time']"
  ];

  const THOUGHT_PROCESS_SELECTORS = [
    "[data-testid*='thought']",
    "[data-testid*='Thought']",
    "[data-testid*='thinking']",
    "[data-testid*='Thinking']",
    "[data-testid*='reasoning']",
    "[data-testid*='Reasoning']",
    "[class*='thought']",
    "[class*='Thought']",
    "[class*='thinking']",
    "[class*='Thinking']",
    "[class*='reasoning']",
    "[class*='Reasoning']",
    "[aria-label*='Thought']",
    "[aria-label*='thought']",
    "[aria-label*='Thinking']",
    "[aria-label*='thinking']",
    "[aria-label*='Reasoning']",
    "[aria-label*='reasoning']"
  ];

  const WEB_SEARCH_SOURCE_SELECTORS = [
    "[data-testid*='web-search']",
    "[data-testid*='WebSearch']",
    "[data-testid*='search-source']",
    "[data-testid*='sources']",
    "[data-testid*='Sources']",
    "[data-testid*='citation']",
    "[data-testid*='Citation']",
    "[class*='web-search']",
    "[class*='search-source']",
    "[class*='sources']",
    "[class*='Sources']",
    "[class*='citation']",
    "[class*='Citation']",
    "[aria-label*='Sources']",
    "[aria-label*='sources']",
    "[aria-label*='Citation']",
    "[aria-label*='citation']"
  ];

  const DEEP_RESEARCH_REFERENCE_SELECTORS = [
    "[data-testid*='deep-research']",
    "[data-testid*='DeepResearch']",
    "[data-testid*='reference']",
    "[data-testid*='Reference']",
    "[class*='deep-research']",
    "[class*='DeepResearch']",
    "[class*='reference']",
    "[class*='Reference']",
    "[aria-label*='Deep Research']",
    "[aria-label*='deep research']",
    "[aria-label*='References']",
    "[aria-label*='references']"
  ];

  const SUPPLEMENT_REMOVE_SELECTORS = [
    ...TIMESTAMP_SELECTORS,
    ...THOUGHT_PROCESS_SELECTORS,
    ...WEB_SEARCH_SOURCE_SELECTORS,
    ...DEEP_RESEARCH_REFERENCE_SELECTORS
  ];

  function getPlatform() {
    const host = location.hostname;

    if (host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "chat.openai.com") {
      return "chatgpt";
    }

    if (host === "claude.ai" || host.endsWith(".claude.ai")) {
      return "claude";
    }

    if (host === "gemini.google.com" || host.endsWith(".gemini.google.com")) {
      return "gemini";
    }

    return "unknown";
  }

  function pageTitle(platform) {
    const rawTitle = document.title || document.querySelector("title")?.textContent || "";
    const title = rawTitle
      .replace(/\s*[-|]\s*(ChatGPT|Claude|Gemini).*$/i, "")
      .replace(/^ChatGPT\s*[-|]\s*/i, "")
      .trim();

    if (title && !/^(chatgpt|claude|gemini)$/i.test(title)) {
      return title;
    }

    const heading = document.querySelector("main h1, [data-testid='conversation-title'], input[aria-label='Conversation title']");
    const headingText = heading?.value || heading?.textContent;
    return headingText?.trim() || `${PLATFORM_NAMES[platform] ?? "AI"} Conversation`;
  }

  function normalizeUrl(value) {
    if (!value) return "";

    try {
      const url = new URL(value, location.href);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function isOfficialShareUrl(platform, value) {
    const url = normalizeUrl(value);
    if (!url) return false;
    return (SHARE_URL_PATTERNS[platform] ?? []).some((pattern) => pattern.test(url));
  }

  function extractOfficialLink(platform) {
    const candidates = [
      location.href,
      document.querySelector("link[rel='canonical']")?.href,
      document.querySelector("meta[property='og:url']")?.content,
      document.querySelector("meta[name='twitter:url']")?.content,
      ...Array.from(document.querySelectorAll("a[href]")).map((link) => link.href)
    ]
      .map(normalizeUrl)
      .filter(Boolean);

    const officialShareUrl = candidates.find((url) => isOfficialShareUrl(platform, url));
    if (officialShareUrl) {
      return {
        shareUrl: officialShareUrl,
        shareUrlLabel: "官方分享链接"
      };
    }

    return {
      shareUrl: normalizeUrl(location.href),
      shareUrlLabel: "官方对话链接"
    };
  }

  function isVisible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function uniqueTopLevel(nodes) {
    const unique = Array.from(new Set(nodes)).filter(isVisible);
    return unique.filter((node, index) => {
      return !unique.some((other, otherIndex) => index !== otherIndex && other.contains(node));
    });
  }

  function querySupplementNodes(element, selectors) {
    const nodes = [];

    for (const selector of selectors) {
      try {
        nodes.push(...element.querySelectorAll(selector));
      } catch {
        // Ignore selectors unsupported by a specific browser engine.
      }
    }

    return uniqueTopLevel(nodes);
  }

  function extractTimestamp(element) {
    const timestampNode = querySupplementNodes(element, TIMESTAMP_SELECTORS)[0];
    if (!timestampNode) return "";

    const datetime = timestampNode.getAttribute("datetime");
    const label = timestampNode.getAttribute("aria-label");
    const text = timestampNode.textContent?.trim();
    return datetime || label || text || "";
  }

  function markdownLinksFrom(nodes) {
    const links = [];

    for (const node of nodes) {
      if (node.matches?.("a[href]")) {
        links.push(node);
      }

      links.push(...node.querySelectorAll("a[href]"));
    }

    const seen = new Set();
    const lines = [];

    for (const link of links) {
      const href = normalizeUrl(link.href || link.getAttribute("href"));
      if (!href || seen.has(href)) continue;
      seen.add(href);

      const label = utils.compactBlankLines(link.textContent || "").replace(/\s+/g, " ") || href;
      lines.push(`- [${label}](${href})`);
    }

    return lines.join("\n");
  }

  function supplementMarkdown(element, selectors, preferLinks = false) {
    const nodes = querySupplementNodes(element, selectors);
    if (!nodes.length) return "";

    if (preferLinks) {
      const linkMarkdown = markdownLinksFrom(nodes);
      if (linkMarkdown) return linkMarkdown;
    }

    return utils.compactBlankLines(nodes.map((node) => utils.elementToMarkdown(node)).filter(Boolean).join("\n\n"));
  }

  function normalizeMessage(role, element) {
    const markdown = utils.elementToMarkdown(element, {
      removeSelectors: SUPPLEMENT_REMOVE_SELECTORS
    });
    const text = markdown || element.textContent?.trim() || "";

    if (!markdown && !text) return null;
    return {
      deepResearchReferencesMarkdown: supplementMarkdown(element, DEEP_RESEARCH_REFERENCE_SELECTORS, true),
      element,
      markdown,
      role,
      text,
      thoughtProcessMarkdown: supplementMarkdown(element, THOUGHT_PROCESS_SELECTORS),
      timestamp: extractTimestamp(element),
      webSearchSourcesMarkdown: supplementMarkdown(element, WEB_SEARCH_SOURCE_SELECTORS, true)
    };
  }

  function byDocumentOrder(a, b) {
    if (a.element === b.element) return 0;
    if (typeof a.element.compareDocumentPosition === "function") {
      const position = a.element.compareDocumentPosition(b.element);
      return position & 4 ? -1 : 1;
    }

    const all = Array.from(document.querySelectorAll("*"));
    return all.indexOf(a.element) - all.indexOf(b.element);
  }

  function removeNestedMessages(messages) {
    return messages.filter((message, index) => {
      return !messages.some((other, otherIndex) => {
        if (index === otherIndex) return false;
        if (message.role !== other.role) return false;
        if (message.element === other.element) return false;
        return other.element.contains(message.element);
      });
    });
  }

  function queryRoleMessages(selectorMap) {
    const messages = [];

    for (const [role, selectors] of Object.entries(selectorMap)) {
      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((element) => {
          if (!isVisible(element)) return;
          const message = normalizeMessage(role, element);
          if (message) messages.push(message);
        });
      }
    }

    const unique = [];
    const seen = new Set();
    for (const message of removeNestedMessages(messages).sort(byDocumentOrder)) {
      if (seen.has(message.element)) continue;
      seen.add(message.element);
      unique.push(message);
    }

    return unique;
  }

  function extractChatGpt() {
    const nodes = Array.from(document.querySelectorAll("[data-message-author-role]"));
    const messages = nodes
      .filter(isVisible)
      .map((element) => {
        const rawRole = element.getAttribute("data-message-author-role");
        const role = rawRole === "user" ? "user" : rawRole === "assistant" ? "assistant" : null;
        return role ? normalizeMessage(role, element) : null;
      })
      .filter(Boolean);

    return removeNestedMessages(messages).sort(byDocumentOrder);
  }

  function extractClaude() {
    const messages = queryRoleMessages({
      user: [
        "[data-testid='user-message']",
        "[data-testid='human-message']",
        ".font-user-message",
        "[class*='font-user-message']",
        "[class*='user-message']"
      ],
      assistant: [
        "[data-testid='assistant-message']",
        "[data-testid='claude-message']",
        ".font-claude-message",
        ".font-claude-response",
        "[class*='font-claude-response']",
        "[data-is-streaming]",
        "[class*='assistant-message']"
      ]
    });

    if (messages.length) return messages;

    return inferAlternatingMessages([
      "main [data-testid*='message']",
      "main article",
      "main .contents",
      "main div[class*='message']"
    ]);
  }

  function extractGemini() {
    const messages = queryRoleMessages({
      user: [
        "user-query",
        "[data-test-id='user-query']",
        "[data-testid='user-query']",
        ".query-text",
        "[class*='user-query']"
      ],
      assistant: [
        "model-response",
        "[data-test-id='model-response']",
        "[data-testid='model-response']",
        ".model-response-text",
        ".response-container",
        "[class*='model-response']"
      ]
    });

    if (messages.length) return messages;

    return inferAlternatingMessages([
      "main user-query",
      "main model-response",
      "main [class*='query']",
      "main [class*='response']"
    ]);
  }

  function inferAlternatingMessages(selectors) {
    const nodes = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const unique = Array.from(new Set(nodes)).filter(isVisible);
    const topLevel = unique.filter((node, index) => !unique.some((other, otherIndex) => index !== otherIndex && other.contains(node)));

    return topLevel
      .map((element, index) => normalizeMessage(index % 2 === 0 ? "user" : "assistant", element))
      .filter(Boolean)
      .sort(byDocumentOrder);
  }

  function previewFor(message) {
    return utils
      .compactBlankLines(message.text || message.markdown || "")
      .replace(/\s+/g, " ")
      .slice(0, 180);
  }

  function withMessageIds(platform, messages) {
    return messages.map((message, index) => ({
      ...message,
      id: `${platform}-${index + 1}-${message.role}`,
      index: index + 1,
      preview: previewFor(message)
    }));
  }

  function buildTurns(messages) {
    const turns = [];
    let currentTurn = null;

    for (const message of messages) {
      if (message.role === "user") {
        currentTurn = {
          id: `turn-${turns.length + 1}`,
          index: turns.length + 1,
          messageIds: [message.id],
          preview: message.preview,
          timestamp: message.timestamp
        };
        turns.push(currentTurn);
        continue;
      }

      if (message.role === "assistant" && currentTurn) {
        currentTurn.messageIds.push(message.id);
      }
    }

    return turns;
  }

  function extractConversation() {
    const platform = getPlatform();
    const extractor = {
      chatgpt: extractChatGpt,
      claude: extractClaude,
      gemini: extractGemini
    }[platform];

    if (!extractor) {
      throw new Error("当前页面不支持。");
    }

    const messages = withMessageIds(platform, extractor());
    if (!messages.length) {
      throw new Error("没有找到可导出的对话内容。");
    }

    return {
      messages,
      platform: PLATFORM_NAMES[platform],
      ...extractOfficialLink(platform),
      title: pageTitle(platform),
      url: location.href
    };
  }

  function filenameFor(conversation) {
    const date = utils.formatDate();
    const platform = conversation.platform.toLowerCase();
    const slug = utils.slugifyFilename(conversation.title);
    return `${date}-${platform}-${slug}.md`;
  }

  function summarizeConversation(conversation) {
    return {
      messages: conversation.messages.map((message) => ({
        id: message.id,
        index: message.index,
        preview: message.preview,
        role: message.role,
        timestamp: message.timestamp
      })),
      platform: conversation.platform,
      shareUrl: conversation.shareUrl,
      shareUrlLabel: conversation.shareUrlLabel,
      title: conversation.title,
      turns: buildTurns(conversation.messages),
      url: conversation.url
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "EXPORT_MARKDOWN" && message?.type !== "GET_CONVERSATION") return false;

    try {
      const conversation = extractConversation();
      if (message.type === "GET_CONVERSATION") {
        sendResponse({
          ok: true,
          conversation: summarizeConversation(conversation)
        });
        return false;
      }

      const result = utils.buildMarkdown(conversation, message.options);
      if (result.count === 0) {
        throw new Error("请至少选择一个问答。");
      }

      sendResponse({
        ok: true,
        count: result.count,
        filename: filenameFor(conversation),
        markdown: result.markdown,
        platform: conversation.platform
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error?.message ?? "导出失败。"
      });
    }

    return false;
  });
})(globalThis);
