import { generateKeyPairSync } from "crypto";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "./mcp";
import { _resetTokenCache, _resetSprintCache, _resetFieldOptionsCache } from "./github";

// Vérifie par exécution (protocole MCP réel via transport in-memory, pas juste
// par lecture de code) que create_issue transforme bien un parent/bloquant
// introuvable en avertissement explicite plutôt qu'en crash — c'est le
// comportement que corrige resolveIssueNodeIds (voir github.test.ts).

beforeAll(() => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
  process.env.GITHUB_APP_ID = "123";
  process.env.GITHUB_INSTALLATION_ID = "456";
  process.env.GITHUB_PRIVATE_KEY = Buffer.from(
    privateKey.export({ type: "pkcs8", format: "pem" }) as string
  ).toString("base64");
});

beforeEach(() => {
  vi.restoreAllMocks();
  _resetTokenCache();
  _resetSprintCache();
  _resetFieldOptionsCache();
});

const TOKEN_RESPONSE = {
  token: "ghs_test",
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
};

function mockFetch(...responses: object[]) {
  let i = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    const body = responses[i++] ?? {};
    return { ok: true, json: async () => body, text: async () => JSON.stringify(body) };
  }));
}

async function connectedClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([
    client.connect(clientTransport),
    buildMcpServer().connect(serverTransport),
  ]);
  return client;
}

describe("create_issue via le protocole MCP", () => {
  it("avertit explicitement quand le parent est introuvable, au lieu de planter", async () => {
    mockFetch(
      TOKEN_RESPONSE,
      { number: 42, title: "T", html_url: "https://github.com/x/42", node_id: "NI_42" }, // createIssue
      { data: { addProjectV2ItemById: { item: { id: "ITEM_1" } } } }, // addIssueToProject: add
      { data: {} }, // addIssueToProject: set status
      { // resolveIssueNodeIds : parent introuvable — forme réelle observée sur l'API GitHub
        data: { repository: { i0: null } },
        errors: [{ type: "NOT_FOUND", path: ["repository", "i0"], message: "Could not resolve to an Issue with the number of 9999." }],
      },
    );

    const client = await connectedClient();
    const result = await client.callTool({ name: "create_issue", arguments: { title: "T", parent_issue_number: 9999 } });

    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("⚠️ Parent non rattaché");
    expect(text).toContain("#9999 introuvable");
  });

  it("avertit explicitement pour un bloquant introuvable, sans bloquer les autres", async () => {
    mockFetch(
      TOKEN_RESPONSE,
      { number: 42, title: "T", html_url: "https://github.com/x/42", node_id: "NI_42" }, // createIssue
      { data: { addProjectV2ItemById: { item: { id: "ITEM_1" } } } }, // addIssueToProject: add
      { data: {} }, // addIssueToProject: set status
      { // resolveIssueNodeIds : un bloquant valide, un introuvable
        data: { repository: { i0: { id: "NI_10" }, i1: null } },
        errors: [{ type: "NOT_FOUND", path: ["repository", "i1"], message: "Could not resolve to an Issue with the number of 9999." }],
      },
      { data: {} }, // addBlockedByRelationship pour le bloquant #10 (résolu)
    );

    const client = await connectedClient();
    const result = await client.callTool({ name: "create_issue", arguments: { title: "T", blocked_by: [10, 9999] } });

    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("Blocked by : #10");
    expect(text).toContain("⚠️ Bloquant(s) introuvable(s), non rattaché(s) : #9999");
  });
});
