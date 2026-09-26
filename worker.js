const SERVER = { name: "store-catalog", version: "1.1.0" };

const TOOLS = [
  {
    name: "list_store_entry",
    description: "Public App Store listing. Pass bundleId, numeric id, or search term. country defaults to pl.",
    inputSchema: {
      type: "object",
      properties: {
        bundleId: { type: "string" },
        id: { type: "string" },
        term: { type: "string" },
        country: { type: "string" }
      }
    }
  },
  {
    name: "extract_links",
    description: "Find http and https links in pasted text. Returns a plain list.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"]
    }
  }
];

export default {
  async fetch(req) {
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    const url = new URL(req.url);
    if (req.method === "GET") {
      return cors(new Response("store-catalog " + SERVER.version + "\n" + url.origin + "/mcp\n", {
        headers: { "content-type": "text/plain; charset=utf-8" }
      }));
    }
    if (req.method !== "POST") return cors(json({ error: "POST JSON-RPC" }, 405));
    let body;
    try { body = await req.json(); } catch {
      return cors(json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, 400));
    }
    const out = Array.isArray(body) ? await Promise.all(body.map(dispatch)) : await dispatch(body);
    if (out === null) return cors(new Response(null, { status: 202 }));
    return cors(json(out));
  }
};

async function dispatch(msg) {
  if (!msg || typeof msg !== "object") {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "invalid" } };
  }
  if (String(msg.method || "").startsWith("notifications/")) return null;
  const id = msg.id == null ? null : msg.id;
  try {
    if (msg.method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: (msg.params && msg.params.protocolVersion) || "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: SERVER
        }
      };
    }
    if (msg.method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (msg.method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    if (msg.method === "tools/call") {
      return { jsonrpc: "2.0", id, result: await run(msg.params || {}) };
    }
    return { jsonrpc: "2.0", id, error: { code: -32601, message: String(msg.method) } };
  } catch (e) {
    return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: String(e.message || e) }], isError: true } };
  }
}

async function run(p) {
  const a = p.arguments || {};
  if (p.name === "list_store_entry") {
    const country = encodeURIComponent(a.country || "pl");
    let api = null;
    if (a.bundleId) api = "https://itunes.apple.com/lookup?bundleId=" + encodeURIComponent(a.bundleId) + "&country=" + country;
    else if (a.id) api = "https://itunes.apple.com/lookup?id=" + encodeURIComponent(a.id) + "&country=" + country;
    else if (a.term) api = "https://itunes.apple.com/search?term=" + encodeURIComponent(a.term) + "&entity=software&country=" + country + "&limit=5";
    else return textResult("pass bundleId, id, or term");
    const res = await fetch(api, { headers: { accept: "application/json" } });
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch {
      return textResult("catalog unavailable (" + raw.slice(0, 80) + "). public url: " + api);
    }
    const rows = data.results || [];
    if (!rows.length) return textResult("no listing. url: " + api);
    const out = rows.slice(0, 5).map((r) => [
      r.trackName,
      "id " + r.trackId,
      r.bundleId,
      "version " + r.version,
      r.sellerName,
      r.trackViewUrl
    ].join(" | ")).join("\n");
    return textResult(out);
  }
  if (p.name === "extract_links") {
    const raw = String(a.text || "");
    const urls = Array.from(new Set(raw.match(/https?:\/\/[^\s"'<>\\]+/gi) || []));
    return textResult(urls.length ? urls.join("\n") : "no links");
  }
  return { content: [{ type: "text", text: "unknown tool" }], isError: true };
}

function textResult(t) {
  return { content: [{ type: "text", text: t }] };
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}
function cors(res) {
  const h = new Headers(res.headers);
  h.set("access-control-allow-origin", "*");
  h.set("access-control-allow-headers", "content-type, authorization, mcp-protocol-version, mcp-method, mcp-name, accept");
  h.set("access-control-allow-methods", "GET,POST,OPTIONS");
  return new Response(res.body, { status: res.status, headers: h });
}
