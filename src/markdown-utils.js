(function initMarkdownUtils(global) {
  const BLOCK_TAGS = new Set([
    "ADDRESS",
    "ARTICLE",
    "ASIDE",
    "DIV",
    "FIGCAPTION",
    "FIGURE",
    "FOOTER",
    "FORM",
    "HEADER",
    "MAIN",
    "NAV",
    "P",
    "SECTION"
  ]);

  const REMOVE_SELECTORS = [
    "button",
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "[aria-hidden='true']",
    "[data-testid*='copy']",
    "[data-testid*='feedback']",
    "[data-testid*='share']",
    "[contenteditable='true'][aria-label]"
  ];

  function compactBlankLines(value) {
    return value
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function escapeTableCell(value) {
    return compactBlankLines(value)
      .replace(/\|/g, "\\|")
      .replace(/\n+/g, "<br>");
  }

  function fenceFor(code) {
    const matches = code.match(/`{3,}/g) ?? [];
    const maxFence = matches.reduce((max, item) => Math.max(max, item.length), 2);
    return "`".repeat(maxFence + 1);
  }

  function inlineCode(value) {
    const text = value.trim();
    if (!text) return "";
    const ticks = text.includes("`") ? "``" : "`";
    const padding = ticks === "``" ? " " : "";
    return `${ticks}${padding}${text}${padding}${ticks}`;
  }

  function textContent(node) {
    return node.textContent?.replace(/\u00a0/g, " ") ?? "";
  }

  function getCodeLanguage(codeElement) {
    const className = codeElement?.className?.toString() ?? "";
    const languageClass = className.match(/(?:language|lang)-([a-z0-9_+-]+)/i)?.[1];
    const dataLanguage =
      codeElement?.getAttribute?.("data-language") ??
      codeElement?.closest?.("[data-language]")?.getAttribute("data-language");

    return (languageClass ?? dataLanguage ?? "").trim().toLowerCase();
  }

  function getMathTex(element) {
    const annotation = element.querySelector?.("annotation[encoding='application/x-tex']");
    if (annotation?.textContent?.trim()) {
      return annotation.textContent.trim();
    }

    const tex = element.getAttribute?.("data-tex") ?? element.getAttribute?.("data-latex");
    return tex?.trim() ?? "";
  }

  function renderChildren(element, context) {
    return Array.from(element.childNodes)
      .map((child) => renderNode(child, context))
      .join("");
  }

  function renderList(element, context, ordered) {
    const items = Array.from(element.children).filter((child) => child.tagName === "LI");
    const lines = items.map((item, index) => {
      const marker = ordered ? `${index + 1}. ` : "- ";
      const body = compactBlankLines(renderChildren(item, { ...context, inList: true }));
      const indented = body.replace(/\n/g, "\n  ");
      return `${marker}${indented}`;
    });

    return `\n${lines.join("\n")}\n\n`;
  }

  function renderTable(element, context) {
    const rows = Array.from(element.querySelectorAll("tr")).map((row) =>
      Array.from(row.children)
        .filter((cell) => cell.tagName === "TH" || cell.tagName === "TD")
        .map((cell) => escapeTableCell(renderChildren(cell, context)))
    );

    if (!rows.length) return "";

    const width = Math.max(...rows.map((row) => row.length));
    const normalized = rows.map((row) => [...row, ...Array(Math.max(width - row.length, 0)).fill("")]);
    const hasHeader = element.querySelector("th") || normalized.length === 1;
    const header = hasHeader ? normalized[0] : normalized[0].map((_, index) => `Column ${index + 1}`);
    const body = hasHeader ? normalized.slice(1) : normalized;
    const separator = header.map(() => "---");

    return `\n| ${header.join(" | ")} |\n| ${separator.join(" | ")} |${body
      .map((row) => `\n| ${row.join(" | ")} |`)
      .join("")}\n\n`;
  }

  function renderCodeBlock(element) {
    const codeElement = element.matches?.("code") ? element : element.querySelector?.("code");
    const code = textContent(codeElement ?? element).replace(/\n+$/, "");
    const language = getCodeLanguage(codeElement ?? element);
    const fence = fenceFor(code);

    return `\n${fence}${language}\n${code}\n${fence}\n\n`;
  }

  function renderBlockquote(element, context) {
    const body = compactBlankLines(renderChildren(element, context));
    if (!body) return "";

    return `\n${body
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n")}\n\n`;
  }

  function renderNode(node, context = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
      return textContent(node);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const element = node;
    const tag = element.tagName;

    if (element.matches(".katex, .math, [data-tex], [data-latex]")) {
      const tex = getMathTex(element);
      if (tex) {
        const display = element.classList.contains("katex-display") || element.closest(".katex-display");
        return display ? `\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
      }
    }

    if (tag === "PRE") {
      return renderCodeBlock(element);
    }

    if (tag === "CODE") {
      return context.inPre ? textContent(element) : inlineCode(textContent(element));
    }

    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const body = compactBlankLines(renderChildren(element, context));
      return body ? `\n${"#".repeat(level)} ${body}\n\n` : "";
    }

    if (tag === "BR") {
      return "\n";
    }

    if (tag === "A") {
      const href = element.href || element.getAttribute("href");
      const label = compactBlankLines(renderChildren(element, context)) || href;
      return href ? `[${label}](${href})` : label;
    }

    if (tag === "IMG") {
      const src = element.currentSrc || element.src || element.getAttribute("src");
      if (!src) return "";
      const alt = element.alt || "image";
      return `![${alt}](${src})`;
    }

    if (tag === "STRONG" || tag === "B") {
      const body = compactBlankLines(renderChildren(element, context));
      return body ? `**${body}**` : "";
    }

    if (tag === "EM" || tag === "I") {
      const body = compactBlankLines(renderChildren(element, context));
      return body ? `*${body}*` : "";
    }

    if (tag === "BLOCKQUOTE") {
      return renderBlockquote(element, context);
    }

    if (tag === "UL" || tag === "OL") {
      return renderList(element, context, tag === "OL");
    }

    if (tag === "TABLE") {
      return renderTable(element, context);
    }

    if (tag === "HR") {
      return "\n---\n\n";
    }

    const body = renderChildren(element, context);
    if (BLOCK_TAGS.has(tag)) {
      return body.trim() ? `\n${body}\n\n` : "";
    }

    return body;
  }

  function cleanClone(element, options = {}) {
    const clone = element.cloneNode(true);
    const removeSelectors = [...REMOVE_SELECTORS, ...(options.removeSelectors ?? [])];
    clone.querySelectorAll(removeSelectors.join(",")).forEach((node) => node.remove());
    clone.querySelectorAll("[hidden]").forEach((node) => node.remove());
    return clone;
  }

  function elementToMarkdown(element, options = {}) {
    if (!element) return "";
    const clone = cleanClone(element, options);
    return compactBlankLines(renderNode(clone));
  }

  function slugifyFilename(value) {
    const slug = value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s._-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-_.]+|[-_.]+$/g, "")
      .slice(0, 80);

    return slug || "ai-chat";
  }

  function formatDate(value = new Date()) {
    const pad = (part) => String(part).padStart(2, "0");

    return [
      value.getFullYear(),
      pad(value.getMonth() + 1),
      pad(value.getDate())
    ].join("-");
  }

  function normalizeHttpUrl(value) {
    if (!value) return "";

    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function footerLinkFor(conversation, options) {
    const manualShareUrl = normalizeHttpUrl(options.shareUrl);
    if (manualShareUrl) {
      return {
        label: "官方分享链接",
        url: manualShareUrl
      };
    }

    if (conversation.shareUrl) {
      return {
        label: conversation.shareUrlLabel || "官方分享链接",
        url: conversation.shareUrl
      };
    }

    const conversationUrl = normalizeHttpUrl(conversation.url);
    if (conversationUrl) {
      return {
        label: "官方对话链接",
        url: conversationUrl
      };
    }

    return null;
  }

  function buildMarkdown(conversation, options = {}) {
    const roleFilter = options.roleFilter ?? "all";
    const selectedMessageIds = Array.isArray(options.selectedMessageIds) ? new Set(options.selectedMessageIds) : null;
    const includeMessageTimestamps = options.includeMessageTimestamps !== false;
    const includeThoughtProcess = options.includeThoughtProcess !== false;
    const includeWebSearchSources = options.includeWebSearchSources !== false;
    const includeDeepResearchReferences = options.includeDeepResearchReferences !== false;
    const messages = conversation.messages.filter((message) => {
      if (roleFilter !== "all" && message.role !== roleFilter) return false;
      if (selectedMessageIds && !selectedMessageIds.has(message.id)) return false;
      return true;
    });
    const lines = [];
    const footerLink = options.includeShareLink === false ? null : footerLinkFor(conversation, options);

    if (options.includeMeta !== false) {
      lines.push("---");
      lines.push(`title: ${JSON.stringify(conversation.title)}`);
      lines.push(`source: ${JSON.stringify(conversation.url)}`);
      if (footerLink?.url) {
        lines.push(`official_link: ${JSON.stringify(footerLink.url)}`);
      }
      lines.push(`platform: ${JSON.stringify(conversation.platform)}`);
      lines.push(`exported_at: ${JSON.stringify(new Date().toISOString())}`);
      lines.push("---");
      lines.push("");
    }

    lines.push(`# ${conversation.title}`);
    lines.push("");

    for (const message of messages) {
      const label = message.role === "user" ? "You" : conversation.platform;
      lines.push(`## ${label}`);
      lines.push("");
      if (includeMessageTimestamps && message.timestamp) {
        lines.push(`_Timestamp: ${message.timestamp}_`);
        lines.push("");
      }
      lines.push(message.markdown || message.text || "");
      lines.push("");

      if (includeThoughtProcess && message.thoughtProcessMarkdown) {
        lines.push("### Thought Process");
        lines.push("");
        lines.push(message.thoughtProcessMarkdown);
        lines.push("");
      }

      if (includeWebSearchSources && message.webSearchSourcesMarkdown) {
        lines.push("### Web Search Sources");
        lines.push("");
        lines.push(message.webSearchSourcesMarkdown);
        lines.push("");
      }

      if (includeDeepResearchReferences && message.deepResearchReferencesMarkdown) {
        lines.push("### Deep Research References");
        lines.push("");
        lines.push(message.deepResearchReferencesMarkdown);
        lines.push("");
      }
    }

    if (footerLink) {
      lines.push("---");
      lines.push("");
      lines.push(`${footerLink.label}: <${footerLink.url}>`);
      lines.push("");
    }

    return {
      count: messages.length,
      markdown: compactBlankLines(lines.join("\n")) + "\n"
    };
  }

  global.ChatMdExporter = {
    buildMarkdown,
    compactBlankLines,
    elementToMarkdown,
    formatDate,
    normalizeHttpUrl,
    slugifyFilename
  };
})(globalThis);
