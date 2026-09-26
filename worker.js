const SERVER = { name: "ios-re-mcp", version: "1.0.1" };
const TOOLS = [
  { name: "capability_wall", description: "Stock iPhone limits. Call first.", inputSchema: { type: "object", properties: {} } },
  { name: "appstore_lookup", description: "App Store metadata by bundleId, trackId or term.", inputSchema: { type: "object", properties: { bundleId: { type: "string" }, trackId: { type: "string" }, term: { type: "string" }, country: { type: "string" } } } },
  { name: "scan_artifact", description: "Scan pasted text for URLs and key-like tokens.", inputSchema: { type: "object", properties: { content: { type: "string" } }, required: ["content"] } },
  { name: "re_session_plan", description: "RE plan for a target on stock iOS.", inputSchema: { type: "object", properties: { target: { type: "string" } }, required: ["target"] } }
];

export default {
  async fetch(req) {
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (req.method === "GET") {
      return cors(new Response("ios-re-mcp " + SERVER.version + "\n" + new URL(req.url).origin + "/mcp\n", { headers: { "content-type": "text/plain; charset=utf-8" } }));
    }
    if (req.method !== "POST") return cors(json({ error: "POST JSON-RPC" }, 405));
    let body;
    try { body = await req.json(); } catch { return cors(json(rpc(null, null, { code: -32700, message: "parse error" }), 400)); }
    const out = Array.isArray(body) ? await Promise.all(body.map(dispatch)) : await dispatch(body);
    if (out === null) return cors(new Response(null, { status: 202 }));
    return cors(json(out));
  }
};

async function dispatch(msg) {
  if (!msg || typeof msg !== "object") return rpc(null, null, { code: -32600, message: "invalid" });
  if (String(msg.method || "").startsWith("notifications/")) return null;
  const id = msg.id == null ? null : msg.id;
  try {
    if (msg.method === "initialize") {
      return rpc(id, { protocolVersion: (msg.params && msg.params.protocolVersion) || "2025-03-26", capabilities: { tools: {} }, serverInfo: SERVER });
    }
    if (msg.method === "ping") return rpc(id, {});
    if (msg.method === "tools/list") return rpc(id, { tools: TOOLS });
    if (msg.method === "tools/call") return rpc(id, await run(msg.params || {}));
    return rpc(id, null, { code: -32601, message: String(msg.method) });
  } catch (e) {
    return rpc(id, { content: [{ type: "text", text: String(e.message || e) }], isError: true });
  }
}

async function run(p) {
  const a = p.arguments || {};
  let text = "unknown tool";
  if (p.name === "capability_wall") text = "STOCK IPHONE: no installed-app dump, no FairPlay decrypt. This MCP sees App Store JSON and text you paste.";
  else if (p.name === "appstore_lookup") {
    const c = encodeURIComponent(a.country || "pl");
    let u = null;
    if (a.bundleId) u = "https://itunes.apple.com/lookup?bundleId=" + encodeURIComponent(a.bundleId) + "&country=" + c;
    else if (a.trackId) u = "https://itunes.apple.com/lookup?id=" + encodeURIComponent(a.trackId) + "&country=" + c;
    else if (a.term) u = "https://itunes.apple.com/search?term=" + encodeURIComponent(a.term) + "&entity=software&country=" + c + "&limit=5";
    if (!u) text = "need bundleId|trackId|term";
    else {
      const d = await (await fetch(u)).json();
      const rows = d.results || [];
      text = rows.length ? rows.slice(0, 5).map(r => [r.trackName, r.bundleId, r.trackId, r.version, r.sellerName, r.trackViewUrl].join("\n")).join("\n---\n") : "no hit";
    }
  } else if (p.name === "scan_artifact") {
    const raw = String(a.content || "");
    const urls = Array.from(new Set(raw.match(/https?:\/\/[^\s"'<>\\]+/gi) || []));
    const keys = Array.from(new Set(raw.match(/(?:api[_-]?key|secret|token|bearer)\s*[:=]\s*['"]?[A-Za-z0-9/+=_\-.]{8,}/gi) || []));
    text = "urls\n" + urls.slice(0, 50).join("\n") + "\nkeys\n" + keys.slice(0, 20).join("\n");
  } else if (p.name === "re_session_plan") text = "TARGET " + a.target + "\n1 appstore_lookup\n2 paste exports into scan_artifact\n3 no Springboard dump on stock iOS";
  return { content: [{ type: "text", text }] };
}

function rpc(id, result, error) {
  const o = { jsonrpc: "2.0", id };
  if (error) o.error = error; else o.result = result;
  return o;
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json" } });
}
function cors(res) {
  const h = new Headers(res.headers);
  h.set("access-control-allow-origin", "*");
  h.set("access-control-allow-headers", "content-type, authorization, mcp-protocol-version, mcp-method, mcp-name, accept");
  h.set("access-control-allow-methods", "GET,POST,OPTIONS");
  return new Response(res.body, { status: res.status, headers: h });
}
