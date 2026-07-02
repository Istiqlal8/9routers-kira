import { readFileSync } from "node:fs";
import { BaseExecutor } from "./base.js";
import { SSE_DONE, SSE_HEADERS_NO_BUFFER } from "../utils/sseConstants.js";
import { sseChunk } from "../utils/sse.js";

const MERLIN_API = "https://www.getmerlin.in/arcane/api/v2/thread/unified";
const FIREBASE_TOKEN_API = "https://securetoken.googleapis.com/v1/token";
const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

const MERLIN_URL = (process.env.MERLIN_URL || MERLIN_API).replace(/\/$/, "");
const FIREBASE_API_KEY = (process.env.FIREBASE_API_KEY || "").trim();
const MERLIN_UA = (process.env.MERLIN_UA || DEFAULT_UA).trim();
const MERLIN_WEB_ACCESS = process.env.MERLIN_WEB_ACCESS === "true";
const MERLIN_DEFAULT_MODEL = process.env.MERLIN_DEFAULT_MODEL || "gemini-2.5-flash-lite";

const MODEL_MAP = {
  "gpt-4o-mini": "gemini-2.5-flash-lite",
  "gpt-4o": "gpt-4o",
  "claude-3-5-sonnet": "claude-3-5-sonnet",
  "gemini-flash": "gemini-2.5-flash-lite",
};

function resolveModel(requested) {
  if (!requested) return MERLIN_DEFAULT_MODEL;
  return MODEL_MAP[requested] || requested;
}

const tokenCache = new Map();

async function refreshFirebaseToken(refreshToken, dispatcher) {
  const url = `${FIREBASE_TOKEN_API}?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    dispatcher,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Firebase refresh ${res.status}: ${body.slice(0, 200)}`);
  }
  const j = await res.json();
  const ttl = parseInt(j.expires_in || "3600", 10);
  const entry = {
    token: j.id_token || j.access_token,
    exp: Date.now() + (ttl - 60) * 1000,
  };
  tokenCache.set(refreshToken, entry);
  return entry.token;
}

async function getToken(account) {
  if (!account.refreshToken || !FIREBASE_API_KEY) {
    throw new Error("MERLIN_ACCOUNTS refreshToken and FIREBASE_API_KEY required");
  }
  const c = tokenCache.get(account.refreshToken);
  if (!c || Date.now() >= c.exp) {
    const dispatcher = await dispatcherForAccount(account);
    return refreshFirebaseToken(account.refreshToken, dispatcher);
  }
  return c.token;
}

let _ProxyAgent = null;
async function getProxyAgentClass() {
  if (!_ProxyAgent) {
    _ProxyAgent = (await import("undici")).ProxyAgent;
  }
  return _ProxyAgent;
}

const proxyDispatchers = new Map();
async function dispatcherFor(proxy) {
  if (!proxy) return undefined;
  if (!proxyDispatchers.has(proxy)) {
    const ProxyAgent = await getProxyAgentClass();
    proxyDispatchers.set(proxy, new ProxyAgent({ uri: proxy }));
  }
  return proxyDispatchers.get(proxy);
}

async function dispatcherForAccount(account) {
  if (!account.proxy) return undefined;
  return dispatcherFor(account.proxy);
}

function normalizeAcc(a) {
  return {
    refreshToken: a.refreshToken || a.refresh_token || "",
    chatId: a.chatId || a.chat_id || a.threadId || a.thread_id || crypto.randomUUID(),
    parentId: a.parentId || a.parent_id || "root",
    proxy: a.proxy || "",
  };
}

function parseAccounts() {
  const filePath = process.env.MERLIN_ACCOUNTS_FILE;
  if (filePath) {
    try {
      const arr = JSON.parse(readFileSync(filePath, "utf8"));
      if (Array.isArray(arr) && arr.length) return arr.map(normalizeAcc);
    } catch (e) {
      console.error(`[merlin] Failed to read accounts file ${filePath}: ${e.message}`);
    }
  }
  const raw = process.env.MERLIN_ACCOUNTS;
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr.map(normalizeAcc);
    } catch {
      console.error("[merlin] Failed to parse MERLIN_ACCOUNTS JSON");
    }
  }
  if (process.env.MERLIN_REFRESH_TOKEN && process.env.MERLIN_THREAD_ID) {
    return [
      normalizeAcc({
        refreshToken: process.env.MERLIN_REFRESH_TOKEN,
        threadId: process.env.MERLIN_THREAD_ID,
        parentId: process.env.MERLIN_PARENT_ID,
      }),
    ];
  }
  return [];
}

const accounts = parseAccounts();

if (accounts.length === 0) {
  console.warn(
    "[merlin] No accounts configured. Set MERLIN_ACCOUNTS_FILE=/path/to/merlin-accounts.json or MERLIN_ACCOUNTS env var."
  );
} else {
  const filePath = process.env.MERLIN_ACCOUNTS_FILE;
  const src = filePath ? `file:${filePath}` : "env:MERLIN_ACCOUNTS";
  console.info(`[merlin] ${accounts.length} account(s) loaded from ${src}`);
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p.text === "string" ? p.text : ""))
      .join("");
  }
  return "";
}

function flattenMessages(messages) {
  if (!Array.isArray(messages)) return "";
  return messages
    .map((m) => {
      const role = (m.role || "user").toUpperCase();
      const content = textOf(m.content);
      if (!content) return "";
      if (role === "USER") return content;
      return `${role}: ${content}`;
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function jakartaTimestamp() {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const iso = now.toISOString().replace("Z", "");
  return `${iso}+07:00[Asia/Jakarta]`;
}

function buildMerlinBody(content, merlinModel, thread) {
  return {
    attachments: [],
    chatId: thread.threadId,
    language: "AUTO",
    message: {
      childId: crypto.randomUUID(),
      id: crypto.randomUUID(),
      content,
      context: "",
      parentId: thread.parentId,
    },
    mode: "UNIFIED_CHAT",
    model: merlinModel,
    metadata: {
      noTask: true,
      isWebpageChat: false,
      deepResearch: false,
      webAccess: thread.webAccess,
      proFinderMode: false,
      mcpConfig: { isEnabled: false },
      merlinMagic: false,
    },
  };
}

async function parseMerlinStream(response, onText, onError) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      if (handleBlock(block, onText, onError)) return;
    }
  }
}

function handleBlock(block, onText, onError) {
  const lines = block.split("\n");
  const evLine = lines.find((l) => l.startsWith("event:"));
  const dataLine = lines.find((l) => l.startsWith("data:"));
  if (!dataLine) return false;

  let obj;
  try {
    obj = JSON.parse(dataLine.slice(5).trim());
  } catch {
    return false;
  }
  const ev = evLine ? evLine.slice(6).trim() : "";
  if (
    ev === "error" ||
    (obj && typeof obj.type === "string" && obj.type.includes("ERROR"))
  ) {
    onError(obj);
    return false;
  }
  const d = obj.data;
  if (d && d.eventType === "DONE") return true;
  if (d && d.type === "text" && typeof d.text === "string") onText(d.text);
  return false;
}

function chunkId() {
  return "chatcmpl-" + crypto.randomUUID().replace(/-/g, "").slice(0, 29);
}

function openaiDelta(id, model, text) {
  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  };
}

function openaiDone(id, model) {
  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  };
}

function openaiCompletion(id, model, fullText) {
  return {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: fullText },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

let poolCursor = 0;

function nextAccount() {
  if (accounts.length === 0) return null;
  const acc = accounts[poolCursor % accounts.length];
  poolCursor = (poolCursor + 1) % accounts.length;
  return acc;
}

export class MerlinExecutor extends BaseExecutor {
  constructor() {
    super("merlin", { noAuth: true });
  }

  async execute({ model, body, stream, signal, log }) {
    const messages = body?.messages;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return {
        response: new Response(
          JSON.stringify({
            error: {
              message: "Missing or empty messages array",
              type: "invalid_request",
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        ),
        url: MERLIN_URL,
        headers: {},
        transformedBody: body,
      };
    }

    const merlinModel = resolveModel(model);
    const content = flattenMessages(messages);

    if (!content.trim()) {
      return {
        response: new Response(
          JSON.stringify({
            error: {
              message: "Empty query after processing",
              type: "invalid_request",
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        ),
        url: MERLIN_URL,
        headers: {},
        transformedBody: body,
      };
    }

    if (accounts.length === 0) {
      return {
        response: new Response(
          JSON.stringify({
            error: {
              message:
                "No Merlin accounts configured. Set MERLIN_ACCOUNTS env var.",
              type: "configuration_error",
            },
          }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        ),
        url: MERLIN_URL,
        headers: {},
        transformedBody: body,
      };
    }

    const startIdx = poolCursor;
    let lastErr;
    for (let i = 0; i < accounts.length; i++) {
      const acc = accounts[(startIdx + i) % accounts.length];
      try {
        const result = await this._callAccount(
          acc,
          content,
          merlinModel,
          model,
          stream,
          signal,
          log
        );
        poolCursor = (startIdx + i + 1) % accounts.length;
        return result;
      } catch (err) {
        lastErr = err;
        if (err.retryable && i < accounts.length - 1) {
          log?.debug?.(
            "MERLIN",
            `Account #${i + 1}/${accounts.length} failed, failover: ${err.message}`
          );
          continue;
        }
        break;
      }
    }

    log?.error?.(
      "MERLIN",
      `All ${accounts.length} account(s) failed: ${lastErr?.message || "unknown"}`
    );
    return {
      response: new Response(
        JSON.stringify({
          error: {
            message: `Merlin: ${lastErr?.message || "all accounts failed"}`,
            type: "upstream_error",
          },
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      ),
      url: MERLIN_URL,
      headers: {},
      transformedBody: body,
    };
  }

  async _callAccount(account, content, merlinModel, clientModel, stream, signal, log) {
    const token = await getToken(account);
    const thread = {
      threadId: account.chatId,
      parentId: account.parentId || "root",
      webAccess: MERLIN_WEB_ACCESS,
    };

    const headers = {
      accept: "text/event-stream",
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      origin: "https://www.getmerlin.in",
      referer: "https://www.getmerlin.in/",
      "user-agent": MERLIN_UA,
      "x-merlin-version": "web-merlin",
      "x-request-timestamp": jakartaTimestamp(),
    };

    const payload = buildMerlinBody(content, merlinModel, thread);
    const dispatcher = await dispatcherForAccount(account);

    log?.debug?.(
      "MERLIN",
      `${merlinModel} | content=${content.length}B | proxy=${account.proxy || "direct"}`
    );

    let response;
    try {
      response = await fetch(MERLIN_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal,
        dispatcher,
      });
    } catch (err) {
      const retryable = err.name !== "AbortError";
      const wrapped = new Error(`fetch failed: ${err.message}`);
      wrapped.retryable = retryable;
      throw wrapped;
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      const err = new Error(`${response.status}: ${bodyText.slice(0, 200)}`);
      err.retryable = true;
      throw err;
    }

    if (!response.body) {
      const err = new Error("empty response body");
      err.retryable = true;
      throw err;
    }

    const id = chunkId();
    const created = Math.floor(Date.now() / 1000);

    if (!stream) {
      let fullText = "";
      let preContentError = false;
      try {
        await parseMerlinStream(
          response,
          (text) => {
            fullText += text;
          },
          () => {
            if (!fullText) preContentError = true;
          }
        );
      } catch (e) {
        const err = new Error(`stream error: ${e.message}`);
        err.retryable = !fullText;
        throw err;
      }
      if (preContentError && !fullText) {
        const err = new Error("merlin returned error before content");
        err.retryable = true;
        throw err;
      }
      return {
        response: new Response(
          JSON.stringify(openaiCompletion(id, clientModel, fullText)),
          { status: 200, headers: { "Content-Type": "application/json" } }
        ),
        url: MERLIN_URL,
        headers,
        transformedBody: payload,
      };
    }

    const encoder = new TextEncoder();
    let started = false;

    const sseStream = new ReadableStream({
      start: async (controller) => {
        try {
          controller.enqueue(
            encoder.encode(
              sseChunk({
                id,
                object: "chat.completion.chunk",
                created,
                model: clientModel,
                choices: [
                  {
                    index: 0,
                    delta: { role: "assistant" },
                    finish_reason: null,
                  },
                ],
              })
            )
          );

          await parseMerlinStream(
            response,
            (text) => {
              started = true;
              controller.enqueue(
                encoder.encode(sseChunk(openaiDelta(id, clientModel, text)))
              );
            },
            () => {
              if (!started)
                throw Object.assign(
                  new Error("merlin error before content"),
                  { retryable: true }
                );
            }
          );

          controller.enqueue(
            encoder.encode(sseChunk(openaiDone(id, clientModel)))
          );
          controller.enqueue(encoder.encode(SSE_DONE));
        } catch (err) {
          const msg = err.message || String(err);
          controller.enqueue(
            encoder.encode(
              sseChunk({
                id,
                object: "chat.completion.chunk",
                created,
                model: clientModel,
                choices: [
                  {
                    index: 0,
                    delta: { content: `[error: ${msg}]` },
                    finish_reason: "stop",
                  },
                ],
              })
            )
          );
          controller.enqueue(encoder.encode(SSE_DONE));
        } finally {
          try {
            controller.close();
          } catch {}
        }
      },
      cancel() {
        try {
          response.body?.cancel?.();
        } catch {}
      },
    });

    return {
      response: new Response(sseStream, {
        status: 200,
        headers: { ...SSE_HEADERS_NO_BUFFER },
      }),
      url: MERLIN_URL,
      headers,
      transformedBody: payload,
    };
  }
}

export default MerlinExecutor;
