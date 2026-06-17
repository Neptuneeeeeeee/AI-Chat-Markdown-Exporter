import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { parseHTML } from "linkedom";

const root = path.resolve(import.meta.dirname, "..");
const markdownUtilsSource = await readFile(path.join(root, "src/markdown-utils.js"), "utf8");
const contentScriptSource = await readFile(path.join(root, "src/content-script.js"), "utf8");

async function sendFixture({ html, message, url }) {
  const { window } = parseHTML(html);
  let listener;

  window.location = new URL(url);
  window.getComputedStyle = () => ({ display: "block", visibility: "visible" });
  window.HTMLElement.prototype.getBoundingClientRect = () => ({
    bottom: 20,
    height: 20,
    left: 0,
    right: 100,
    top: 0,
    width: 100
  });
  window.chrome = {
    runtime: {
      onMessage: {
        addListener(callback) {
          listener = callback;
        }
      }
    }
  };

  const context = vm.createContext(window);
  vm.runInContext(markdownUtilsSource, context);
  vm.runInContext(contentScriptSource, context);

  assert.equal(typeof listener, "function");

  let response;
  listener(message, {}, (value) => {
    response = value;
  });

  return response;
}

async function exportFixture({ html, options = {}, url }) {
  return sendFixture({
    html,
    url,
    message: {
      type: "EXPORT_MARKDOWN",
      options: { includeMeta: true, roleFilter: "all", ...options }
    }
  });
}

async function getConversationFixture({ html, url }) {
  return sendFixture({
    html,
    url,
    message: { type: "GET_CONVERSATION" }
  });
}

test("exports ChatGPT messages with code blocks and tables", async () => {
  const response = await exportFixture({
    url: "https://chatgpt.com/c/test-conversation",
    html: `
      <title>Fetch Notes - ChatGPT</title>
      <a href="https://chatgpt.com/share/abc123">Share</a>
      <main>
        <div data-message-author-role="user"><p>Show a fetch example.</p></div>
        <div data-message-author-role="assistant">
          <h3>Example</h3>
          <pre><code class="language-js">fetch("/api").then((res) =&gt; res.json());</code></pre>
          <table>
            <tr><th>Method</th><th>Use</th></tr>
            <tr><td>GET</td><td>Read</td></tr>
          </table>
        </div>
      </main>
    `
  });

  assert.equal(response.ok, true);
  assert.equal(response.count, 2);
  assert.match(response.filename, /^\d{4}-\d{2}-\d{2}-chatgpt-fetch-notes\.md$/);
  assert.match(response.markdown, /platform: "ChatGPT"/);
  assert.match(response.markdown, /## You/);
  assert.match(response.markdown, /```js\nfetch\("\/api"\)\.then/);
  assert.match(response.markdown, /\| Method \| Use \|/);
  assert.match(response.markdown, /official_link: "https:\/\/chatgpt\.com\/share\/abc123"/);
  assert.match(response.markdown, /官方分享链接: <https:\/\/chatgpt\.com\/share\/abc123>/);
});

test("returns selectable user question turns for the popup", async () => {
  const response = await getConversationFixture({
    url: "https://chatgpt.com/c/test-conversation",
    html: `
      <title>Selectable - ChatGPT</title>
      <main>
        <div data-message-author-role="user"><p>First prompt</p></div>
        <div data-message-author-role="assistant"><p>First answer</p></div>
        <div data-message-author-role="assistant"><p>First follow-up answer</p></div>
        <div data-message-author-role="user"><p>Second prompt</p></div>
        <div data-message-author-role="assistant"><p>Second answer</p></div>
      </main>
    `
  });

  assert.equal(response.ok, true);
  assert.equal(response.conversation.title, "Selectable");
  assert.equal(response.conversation.messages.length, 5);
  assert.deepEqual(
    response.conversation.messages.map((message) => [message.id, message.role, message.preview]),
    [
      ["chatgpt-1-user", "user", "First prompt"],
      ["chatgpt-2-assistant", "assistant", "First answer"],
      ["chatgpt-3-assistant", "assistant", "First follow-up answer"],
      ["chatgpt-4-user", "user", "Second prompt"],
      ["chatgpt-5-assistant", "assistant", "Second answer"]
    ]
  );
  const turns = JSON.parse(JSON.stringify(response.conversation.turns));
  assert.deepEqual(
    turns.map((turn) => [turn.id, turn.index, turn.preview, turn.messageIds]),
    [
      ["turn-1", 1, "First prompt", ["chatgpt-1-user", "chatgpt-2-assistant", "chatgpt-3-assistant"]],
      ["turn-2", 2, "Second prompt", ["chatgpt-4-user", "chatgpt-5-assistant"]]
    ]
  );
});

test("exports the selected user question and its paired answer", async () => {
  const response = await exportFixture({
    url: "https://chatgpt.com/c/test-conversation",
    options: {
      selectedMessageIds: ["chatgpt-3-user", "chatgpt-4-assistant"]
    },
    html: `
      <title>Selected Turn - ChatGPT</title>
      <main>
        <div data-message-author-role="user"><p>First prompt.</p></div>
        <div data-message-author-role="assistant"><p>First answer.</p></div>
        <div data-message-author-role="user"><p>Second prompt.</p></div>
        <div data-message-author-role="assistant"><p>Second answer.</p></div>
      </main>
    `
  });

  assert.equal(response.ok, true);
  assert.equal(response.count, 2);
  assert.doesNotMatch(response.markdown, /First prompt|First answer/);
  assert.match(response.markdown, /## You/);
  assert.match(response.markdown, /Second prompt/);
  assert.match(response.markdown, /## ChatGPT/);
  assert.match(response.markdown, /Second answer/);
});

test("exports only selected message ids", async () => {
  const response = await exportFixture({
    url: "https://chatgpt.com/c/test-conversation",
    options: {
      selectedMessageIds: ["chatgpt-2-assistant", "chatgpt-3-user"]
    },
    html: `
      <title>Selected - ChatGPT</title>
      <main>
        <div data-message-author-role="user"><p>Do not export me.</p></div>
        <div data-message-author-role="assistant"><p>Export this answer.</p></div>
        <div data-message-author-role="user"><p>Export this prompt.</p></div>
      </main>
    `
  });

  assert.equal(response.ok, true);
  assert.equal(response.count, 2);
  assert.doesNotMatch(response.markdown, /Do not export me/);
  assert.match(response.markdown, /Export this answer/);
  assert.match(response.markdown, /Export this prompt/);
});

test("exports optional timestamps, thought process, web sources, and research references", async () => {
  const response = await exportFixture({
    url: "https://chatgpt.com/c/test-conversation",
    html: `
      <title>Options - ChatGPT</title>
      <main>
        <div data-message-author-role="assistant">
          <time datetime="2026-06-17T15:05:07.000Z">11:05 PM</time>
          <p>Main answer.</p>
          <div class="thought-process"><p>Visible reasoning summary.</p></div>
          <div data-testid="web-search-sources">
            <a href="https://example.com/source">Source Example</a>
          </div>
          <div data-testid="deep-research-references">
            <a href="https://example.com/reference">Reference Example</a>
          </div>
        </div>
      </main>
    `
  });

  assert.equal(response.ok, true);
  assert.match(response.markdown, /_Timestamp: 2026-06-17T15:05:07\.000Z_/);
  assert.match(response.markdown, /Main answer/);
  assert.match(response.markdown, /### Thought Process/);
  assert.match(response.markdown, /Visible reasoning summary/);
  assert.match(response.markdown, /### Web Search Sources/);
  assert.match(response.markdown, /- \[Source Example\]\(https:\/\/example\.com\/source\)/);
  assert.match(response.markdown, /### Deep Research References/);
  assert.match(response.markdown, /- \[Reference Example\]\(https:\/\/example\.com\/reference\)/);
});

test("can omit optional timestamps, thought process, web sources, and research references", async () => {
  const response = await exportFixture({
    url: "https://chatgpt.com/c/test-conversation",
    options: {
      includeDeepResearchReferences: false,
      includeMessageTimestamps: false,
      includeThoughtProcess: false,
      includeWebSearchSources: false
    },
    html: `
      <title>Hidden Options - ChatGPT</title>
      <main>
        <div data-message-author-role="assistant">
          <time datetime="2026-06-17T15:05:07.000Z">11:05 PM</time>
          <p>Main answer.</p>
          <div class="thought-process"><p>Visible reasoning summary.</p></div>
          <div data-testid="web-search-sources">
            <a href="https://example.com/source">Source Example</a>
          </div>
          <div data-testid="deep-research-references">
            <a href="https://example.com/reference">Reference Example</a>
          </div>
        </div>
      </main>
    `
  });

  assert.equal(response.ok, true);
  assert.match(response.markdown, /Main answer/);
  assert.doesNotMatch(response.markdown, /Timestamp|Thought Process|Web Search Sources|Deep Research References/);
  assert.doesNotMatch(response.markdown, /Visible reasoning summary|Source Example|Reference Example/);
});

test("exports Claude messages and supports assistant-only filter", async () => {
  const response = await exportFixture({
    url: "https://claude.ai/chat/test-conversation",
    options: {
      roleFilter: "assistant",
      shareUrl: "https://claude.ai/share/manual-link"
    },
    html: `
      <title>Planning - Claude</title>
      <main>
        <div data-testid="user-message"><p>Draft a plan.</p></div>
        <div class="font-claude-message">
          <p>Here is the plan.</p>
          <ul><li>Build</li><li>Verify</li></ul>
        </div>
      </main>
    `
  });

  assert.equal(response.ok, true);
  assert.equal(response.count, 1);
  assert.match(response.filename, /^\d{4}-\d{2}-\d{2}-claude-planning\.md$/);
  assert.doesNotMatch(response.markdown, /Draft a plan/);
  assert.match(response.markdown, /## Claude/);
  assert.match(response.markdown, /- Build/);
  assert.match(response.markdown, /官方分享链接: <https:\/\/claude\.ai\/share\/manual-link>/);
});

test("extracts Claude current user prompts and response containers", async () => {
  const summary = await getConversationFixture({
    url: "https://claude.ai/chat/current-dom",
    html: `
      <title>Paper content summary - Claude</title>
      <main>
        <div data-testid="user-message" class="font-large !font-user-message">
          <p>这个paper讲了什么？</p>
        </div>
        <div data-is-streaming="false" class="group relative pb-3">
          <div class="font-claude-response">
            <p class="font-claude-response-body">这篇论文提出了 CP-WOPT 方法。</p>
          </div>
        </div>
        <div data-testid="user-message" class="font-large !font-user-message">
          <p>它的目的是要分解带缺失值的tensor吗？</p>
        </div>
        <div data-is-streaming="false" class="group relative pb-3">
          <div class="font-claude-response">
            <p class="font-claude-response-body">是的，核心是对带缺失值的张量进行加权分解。</p>
          </div>
        </div>
      </main>
    `
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.conversation.turns.length, 2);
  assert.equal(summary.conversation.turns[0].preview, "这个paper讲了什么？");
  assert.deepEqual(
    JSON.parse(JSON.stringify(summary.conversation.turns[1].messageIds)),
    ["claude-3-user", "claude-4-assistant"]
  );

  const exported = await exportFixture({
    url: "https://claude.ai/chat/current-dom",
    options: {
      selectedMessageIds: summary.conversation.turns[1].messageIds
    },
    html: `
      <title>Paper content summary - Claude</title>
      <main>
        <div data-testid="user-message" class="font-large !font-user-message">
          <p>这个paper讲了什么？</p>
        </div>
        <div data-is-streaming="false" class="group relative pb-3">
          <div class="font-claude-response">
            <p class="font-claude-response-body">这篇论文提出了 CP-WOPT 方法。</p>
          </div>
        </div>
        <div data-testid="user-message" class="font-large !font-user-message">
          <p>它的目的是要分解带缺失值的tensor吗？</p>
        </div>
        <div data-is-streaming="false" class="group relative pb-3">
          <div class="font-claude-response">
            <p class="font-claude-response-body">是的，核心是对带缺失值的张量进行加权分解。</p>
          </div>
        </div>
      </main>
    `
  });

  assert.equal(exported.ok, true);
  assert.doesNotMatch(exported.markdown, /这个paper讲了什么|CP-WOPT/);
  assert.match(exported.markdown, /它的目的是要分解带缺失值的tensor吗/);
  assert.match(exported.markdown, /加权分解/);
});

test("exports Gemini messages", async () => {
  const response = await exportFixture({
    url: "https://gemini.google.com/app/test-conversation",
    html: `
      <title>Recipe - Gemini</title>
      <main>
        <user-query><p>Give me a recipe.</p></user-query>
        <model-response>
          <p>Use these ingredients:</p>
          <ol><li>Rice</li><li>Eggs</li></ol>
        </model-response>
      </main>
    `
  });

  assert.equal(response.ok, true);
  assert.equal(response.count, 2);
  assert.match(response.filename, /^\d{4}-\d{2}-\d{2}-gemini-recipe\.md$/);
  assert.match(response.markdown, /platform: "Gemini"/);
  assert.match(response.markdown, /1\. Rice/);
  assert.match(response.markdown, /官方对话链接: <https:\/\/gemini\.google\.com\/app\/test-conversation>/);
});

test("can omit the bottom official link", async () => {
  const response = await exportFixture({
    url: "https://chatgpt.com/c/test-conversation",
    options: { includeShareLink: false },
    html: `
      <title>No Link - ChatGPT</title>
      <main>
        <div data-message-author-role="user"><p>Hello.</p></div>
        <div data-message-author-role="assistant"><p>Hi.</p></div>
      </main>
    `
  });

  assert.equal(response.ok, true);
  assert.doesNotMatch(response.markdown, /官方分享链接|官方对话链接|official_link/);
});
