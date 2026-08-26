import { generateKeyPairSync } from "crypto";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import type { VercelRequest } from "@vercel/node";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer, isAuthorized } from "./mcp";
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
    expect(text).toContain("⚠️ Bloquant(s) non rattaché(s) : #9999 introuvable");
  });

  it("avertit sans planter si la mutation de rattachement du parent échoue malgré une résolution réussie", async () => {
    // Reproduit le bug réel du 2026-08-26 : addBlockedBy/addSubIssue peut échouer
    // (permissions, mutation invalide, etc.) même quand resolveIssueNodeIds a bien
    // résolu le numéro — l'issue déjà créée ne doit pas se perdre dans un throw.
    mockFetch(
      TOKEN_RESPONSE,
      { number: 42, title: "T", html_url: "https://github.com/x/42", node_id: "NI_42" }, // createIssue
      { data: { addProjectV2ItemById: { item: { id: "ITEM_1" } } } }, // addIssueToProject: add
      { data: {} }, // addIssueToProject: set status
      { data: { repository: { i0: { id: "NI_10" } } } }, // resolveIssueNodeIds : parent résolu
      { errors: [{ message: "Field 'addSubIssue' doesn't exist on type 'Mutation'." }] }, // addSubIssue échoue
    );

    const client = await connectedClient();
    const result = await client.callTool({ name: "create_issue", arguments: { title: "T", parent_issue_number: 10 } });

    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("**#42**"); // l'issue créée reste visible
    expect(text).toContain("⚠️ Parent non rattaché");
    expect(text).toContain("rattachement échoué");
  });

  it("avertit sans planter si la mutation de rattachement d'un bloquant échoue malgré une résolution réussie", async () => {
    mockFetch(
      TOKEN_RESPONSE,
      { number: 42, title: "T", html_url: "https://github.com/x/42", node_id: "NI_42" }, // createIssue
      { data: { addProjectV2ItemById: { item: { id: "ITEM_1" } } } }, // addIssueToProject: add
      { data: {} }, // addIssueToProject: set status
      { data: { repository: { i0: { id: "NI_10" } } } }, // resolveIssueNodeIds : bloquant résolu
      { errors: [{ message: "Field 'addBlockedBy' doesn't exist on type 'Mutation'." }] }, // addBlockedByRelationship échoue
    );

    const client = await connectedClient();
    const result = await client.callTool({ name: "create_issue", arguments: { title: "T", blocked_by: [10] } });

    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("**#42**");
    expect(text).toContain("⚠️ Bloquant(s) non rattaché(s)");
    expect(text).toContain("rattachement échoué");
  });
});

describe("isAuthorized", () => {
  afterEach(() => {
    delete process.env.MCP_SECRET;
  });

  function fakeRequest(opts: { token?: string; authorization?: string }): VercelRequest {
    return {
      query: opts.token !== undefined ? { token: opts.token } : {},
      headers: opts.authorization !== undefined ? { authorization: opts.authorization } : {},
    } as unknown as VercelRequest;
  }

  it("autorise tout si MCP_SECRET n'est pas configuré", () => {
    delete process.env.MCP_SECRET;
    expect(isAuthorized(fakeRequest({}))).toBe(true);
  });

  it("autorise via le query param ?token=", () => {
    process.env.MCP_SECRET = "s3cr3t";
    expect(isAuthorized(fakeRequest({ token: "s3cr3t" }))).toBe(true);
  });

  it("autorise via un header Authorization: Bearer <token>", () => {
    process.env.MCP_SECRET = "s3cr3t";
    expect(isAuthorized(fakeRequest({ authorization: "Bearer s3cr3t" }))).toBe(true);
  });

  it("autorise via un header Authorization: Basic <token> (Le Chat n'envoie pas de base64)", () => {
    process.env.MCP_SECRET = "s3cr3t";
    expect(isAuthorized(fakeRequest({ authorization: "Basic s3cr3t" }))).toBe(true);
  });

  it("refuse un token incorrect, que ce soit en query ou en header", () => {
    process.env.MCP_SECRET = "s3cr3t";
    expect(isAuthorized(fakeRequest({ token: "wrong" }))).toBe(false);
    expect(isAuthorized(fakeRequest({ authorization: "Bearer wrong" }))).toBe(false);
  });

  it("refuse quand ni query ni header ne sont fournis", () => {
    process.env.MCP_SECRET = "s3cr3t";
    expect(isAuthorized(fakeRequest({}))).toBe(false);
  });
});
