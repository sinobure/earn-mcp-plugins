import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MISSING_TOKEN_MESSAGE } from "./server.js";

const entry = fileURLToPath(new URL("../dist/index.js", import.meta.url));

/** Starts the built server over stdio without a token and speaks real MCP to it. */
describe.skipIf(!existsSync(entry))("stdio smoke test (built dist)", () => {
  it("answers initialize, tools/list and a tool call with setup instructions", async () => {
    const env = { ...process.env };
    delete env["NOTION_API_KEY"];
    const child = spawn(process.execPath, [entry], { env, stdio: ["pipe", "pipe", "ignore"] });
    const send = (id: number, method: string, params: object = {}) =>
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");

    const replies = new Map<number, any>();
    let buf = "";
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout waiting for MCP replies")), 8000);
      child.stdout.on("data", (d) => {
        buf += d.toString();
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.id !== undefined) replies.set(msg.id, msg);
          if (replies.size >= 3) {
            clearTimeout(timer);
            resolve();
          }
        }
      });
    });

    send(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke", version: "0" },
    });
    send(2, "tools/list");
    send(3, "tools/call", { name: "search_notion", arguments: { query: "x" } });
    try {
      await done;
    } finally {
      child.kill();
    }

    expect(replies.get(1).result.serverInfo.name).toBe("notion-lite-mcp");
    expect(replies.get(2).result.tools.map((t: { name: string }) => t.name)).toHaveLength(6);
    expect(replies.get(3).result.isError).toBe(true);
    expect(replies.get(3).result.content[0].text).toContain(MISSING_TOKEN_MESSAGE.slice(0, 30));
  });
});
