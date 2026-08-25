// src/worker.js - Cloudflare Worker + Durable Objects + WebSocket Realtime Sync

export class DetectiveMapWorkspace {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.storage = ctx.storage;
    this.sessions = new Set();
    this.state = null;
    this.pairingCode = env.DEFAULT_PAIRING_CODE || "MAP-2026";
    this.authorizedTokens = new Set();
  }

  async ensureLoaded() {
    if (this.state) return;
    const [quotes, strokes, viewport, tokens, savedPairing] = await Promise.all([
      this.storage.get("quotes"),
      this.storage.get("strokes"),
      this.storage.get("viewport"),
      this.storage.get("authorizedTokens"),
      this.storage.get("pairingCode")
    ]);

    this.state = {
      quotes: quotes || [],
      strokes: strokes || [],
      viewport: viewport || { panX: 100, panY: 100, zoom: 1.0 }
    };

    if (savedPairing) {
      this.pairingCode = savedPairing;
    } else {
      await this.storage.put("pairingCode", this.pairingCode);
    }

    if (Array.isArray(tokens)) {
      this.authorizedTokens = new Set(tokens);
    }
  }

  async fetch(request) {
    await this.ensureLoaded();
    const url = new URL(request.url);

    // 1. Device Pairing Endpoint
    if (url.pathname === "/api/pair" && request.method === "POST") {
      try {
        const body = await request.json();
        const code = (body.pairingCode || "").trim().toUpperCase();
        if (code === this.pairingCode) {
          const deviceToken = "dt_" + crypto.randomUUID().replace(/-/g, "");
          this.authorizedTokens.add(deviceToken);
          await this.storage.put("authorizedTokens", Array.from(this.authorizedTokens));

          return new Response(JSON.stringify({
            success: true,
            token: deviceToken,
            workspaceId: "default",
            message: "Device paired successfully!"
          }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }
        return new Response(JSON.stringify({ success: false, error: "Invalid Pairing Code" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 400 });
      }
    }

    // 2. Direct Quote Ingestion from Chrome Extension
    if (url.pathname === "/api/quote" && request.method === "POST") {
      const authHeader = request.headers.get("Authorization") || url.searchParams.get("token") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");

      if (!this.authorizedTokens.has(token) && token !== this.pairingCode) {
        return new Response(JSON.stringify({ error: "Unauthorized device" }), { status: 401 });
      }

      try {
        const quote = await request.json();
        const existingIdx = this.state.quotes.findIndex(q => q.id === quote.id);
        if (existingIdx !== -1) {
          this.state.quotes[existingIdx] = { ...this.state.quotes[existingIdx], ...quote };
        } else {
          this.state.quotes.push(quote);
        }

        await this.storage.put("quotes", this.state.quotes);

        // Broadcast to all active iPad / WebSockets
        this.broadcast({ type: "QUOTE_ADDED", quote });

        return new Response(JSON.stringify({ success: true, quote }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 400 });
      }
    }

    // 3. WebSocket Upgrade for iPad Safari & Chrome Canvas
    if (url.pathname === "/api/ws" || url.pathname === "/ws") {
      const token = url.searchParams.get("token") || "";
      if (!this.authorizedTokens.has(token) && token !== this.pairingCode) {
        return new Response("Unauthorized WebSocket Connection", { status: 401 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      await this.handleSession(server);

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    // 4. Get Current State
    if (url.pathname === "/api/state") {
      return new Response(JSON.stringify(this.state), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    return new Response("Not Found", { status: 404 });
  }

  async handleSession(ws) {
    ws.accept();
    this.sessions.add(ws);

    // Send initial full sync
    ws.send(JSON.stringify({
      type: "INIT_STATE",
      quotes: this.state.quotes,
      strokes: this.state.strokes,
      viewport: this.state.viewport
    }));

    ws.addEventListener("message", async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "ADD_STROKE" && msg.stroke) {
          this.state.strokes.push(msg.stroke);
          await this.storage.put("strokes", this.state.strokes);
          this.broadcastExcept(ws, { type: "STROKE_ADDED", stroke: msg.stroke });
        } else if (msg.type === "UPDATE_STROKES" && Array.isArray(msg.strokes)) {
          this.state.strokes = msg.strokes;
          await this.storage.put("strokes", this.state.strokes);
          this.broadcastExcept(ws, { type: "STROKES_UPDATED", strokes: msg.strokes });
        } else if (msg.type === "ADD_QUOTE" && msg.quote) {
          this.state.quotes.push(msg.quote);
          await this.storage.put("quotes", this.state.quotes);
          this.broadcastExcept(ws, { type: "QUOTE_ADDED", quote: msg.quote });
        } else if (msg.type === "UPDATE_QUOTES" && Array.isArray(msg.quotes)) {
          this.state.quotes = msg.quotes;
          await this.storage.put("quotes", this.state.quotes);
          this.broadcastExcept(ws, { type: "QUOTES_UPDATED", quotes: msg.quotes });
        } else if (msg.type === "UPDATE_VIEWPORT" && msg.viewport) {
          this.state.viewport = msg.viewport;
          await this.storage.put("viewport", this.state.viewport);
        } else if (msg.type === "PING") {
          ws.send(JSON.stringify({ type: "PONG" }));
        }
      } catch (err) {
        console.error("WS error:", err);
      }
    });

    ws.addEventListener("close", () => {
      this.sessions.delete(ws);
    });

    ws.addEventListener("error", () => {
      this.sessions.delete(ws);
    });
  }

  broadcast(msg) {
    const payload = JSON.stringify(msg);
    for (const ws of this.sessions) {
      try {
        ws.send(payload);
      } catch {
        this.sessions.delete(ws);
      }
    }
  }

  broadcastExcept(senderWs, msg) {
    const payload = JSON.stringify(msg);
    for (const ws of this.sessions) {
      if (ws !== senderWs) {
        try {
          ws.send(payload);
        } catch {
          this.sessions.delete(ws);
        }
      }
    }
  }
}

// Static Assets embedded bundle or handler
import { ASSETS_MANIFEST } from "./assets-bundle.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
      });
    }

    // Route API and WebSocket requests to Durable Object
    if (url.pathname.startsWith("/api/") || url.pathname === "/ws") {
      const id = env.DETECTIVE_WORKSPACE.idFromName("default");
      const stub = env.DETECTIVE_WORKSPACE.get(id);
      return stub.fetch(request);
    }

    // Serve Static Web Assets (Canvas, HTML, CSS, JS, Icons)
    let pathname = url.pathname;
    if (pathname === "/" || pathname === "/canvas") {
      pathname = "/canvas.html";
    }

    const asset = ASSETS_MANIFEST[pathname];
    if (asset) {
      return new Response(asset.content, {
        headers: {
          "Content-Type": asset.mime,
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};
