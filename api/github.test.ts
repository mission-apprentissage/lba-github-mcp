import { generateKeyPairSync } from "crypto";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import {
  createIssue,
  addIssueToProject,
  setSelectField,
  setPriorityField,
  setSprintField,
  resolveIssueNodeIds,
  addSubIssue,
  addBlockedByRelationship,
  _resetTokenCache,
  SELECT_OPTIONS,
  PRIORITY_OPTIONS,
  SPRINT_OPTIONS,
  PROJECT_ID,
  SELECT_FIELD_IDS,
  SPRINT_FIELD_ID,
} from "./github";

// ─── setup global ────────────────────────────────────────────────────────────

beforeAll(() => {
  // Clé RSA 1024-bit (tests uniquement, jamais utilisée en prod)
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
});

// ─── helpers ─────────────────────────────────────────────────────────────────

const TOKEN_RESPONSE = {
  token: "ghs_test",
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
};

/** Mock fetch avec les réponses dans l'ordre. */
function mockFetch(...responses: object[]) {
  let i = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    const body = responses[i++] ?? {};
    return { ok: true, json: async () => body, text: async () => JSON.stringify(body) };
  }));
}

/** Premier appel = token, deuxième = payload réel. */
function withToken(payload: object) {
  return [TOKEN_RESPONSE, payload];
}

function fetchCalls() {
  return (fetch as ReturnType<typeof vi.fn>).mock.calls;
}

// ─── createIssue ─────────────────────────────────────────────────────────────

describe("createIssue", () => {
  it("POST /repos/.../issues et retourne l'issue", async () => {
    const issuePayload = { number: 42, title: "Test", html_url: "https://github.com/x", node_id: "NI_42" };
    mockFetch(...withToken(issuePayload));

    const issue = await createIssue({ title: "Test" });

    expect(issue.number).toBe(42);
    expect(issue.node_id).toBe("NI_42");

    const [url, opts] = fetchCalls()[1];
    expect(url).toContain("/repos/mission-apprentissage/labonnealternance/issues");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toMatchObject({ title: "Test" });
  });

  it("transmet assignees et body", async () => {
    const issuePayload = { number: 1, title: "T", html_url: "", node_id: "N1" };
    mockFetch(...withToken(issuePayload));

    await createIssue({ title: "T", body: "desc", assignees: ["alice"] });

    const [, opts] = fetchCalls()[1];
    const body = JSON.parse(opts.body);
    expect(body.body).toBe("desc");
    expect(body.assignees).toEqual(["alice"]);
  });
});

// ─── addIssueToProject ───────────────────────────────────────────────────────

describe("addIssueToProject", () => {
  it("exécute deux mutations GraphQL et retourne l'item ID", async () => {
    mockFetch(
      TOKEN_RESPONSE,
      { data: { addProjectV2ItemById: { item: { id: "ITEM_1" } } } },
      { data: {} },
    );

    const itemId = await addIssueToProject("NI_42");
    expect(itemId).toBe("ITEM_1");

    const calls = fetchCalls();
    const firstGql = JSON.parse(calls[1][1].body);
    expect(firstGql.query).toContain("addProjectV2ItemById");
    expect(firstGql.variables.cid).toBe("NI_42");
    expect(firstGql.variables.pid).toBe(PROJECT_ID);

    const secondGql = JSON.parse(calls[2][1].body);
    expect(secondGql.query).toContain("updateProjectV2ItemFieldValue");
    expect(secondGql.variables.oid).toBe(SELECT_OPTIONS.status["a-faire"]);
  });
});

// ─── setSelectField ──────────────────────────────────────────────────────────

describe("setSelectField", () => {
  it("appelle updateProjectV2ItemFieldValue avec le bon optionId", async () => {
    mockFetch(...withToken({ data: {} }));

    await setSelectField("ITEM_1", "status", "en-cours");

    const [, opts] = fetchCalls()[1];
    const body = JSON.parse(opts.body);
    expect(body.variables.fid).toBe(SELECT_FIELD_IDS.status);
    expect(body.variables.oid).toBe(SELECT_OPTIONS.status["en-cours"]);
  });

  it("lève une erreur pour une valeur inconnue", async () => {
    mockFetch(...withToken({}));
    await expect(setSelectField("ITEM_1", "status", "inexistant")).rejects.toThrow('Valeur "inexistant" inconnue');
  });
});

// ─── setPriorityField ────────────────────────────────────────────────────────

describe("setPriorityField", () => {
  it("appelle setIssueFieldValue avec le bon optionId", async () => {
    mockFetch(...withToken({ data: {} }));

    await setPriorityField("NI_42", "High");

    const [, opts] = fetchCalls()[1];
    const body = JSON.parse(opts.body);
    expect(body.query).toContain("setIssueFieldValue");
    expect(body.variables.iid).toBe("NI_42");
    expect(body.variables.oid).toBe(PRIORITY_OPTIONS["High"]);
  });

  it("lève une erreur pour une priorité inconnue", async () => {
    mockFetch(...withToken({}));
    await expect(setPriorityField("NI_42", "Extreme")).rejects.toThrow('Priorité "Extreme" inconnue');
  });
});

// ─── setSprintField ──────────────────────────────────────────────────────────

describe("setSprintField", () => {
  it("appelle updateProjectV2ItemFieldValue avec le bon iterationId", async () => {
    mockFetch(...withToken({ data: {} }));

    await setSprintField("ITEM_1", "Sprint 1");

    const [, opts] = fetchCalls()[1];
    const body = JSON.parse(opts.body);
    expect(body.variables.fid).toBe(SPRINT_FIELD_ID);
    expect(body.variables.iter).toBe(SPRINT_OPTIONS["Sprint 1"]);
  });

  it("lève une erreur pour un sprint inconnu", async () => {
    mockFetch(...withToken({}));
    await expect(setSprintField("ITEM_1", "Sprint 99")).rejects.toThrow('Sprint "Sprint 99" inconnu');
  });
});

// ─── resolveIssueNodeIds ─────────────────────────────────────────────────────

describe("resolveIssueNodeIds", () => {
  it("retourne un objet vide si aucun numéro, sans appeler fetch", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const result = await resolveIssueNodeIds([]);
    expect(result).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });

  it("construit les bons aliases et mappe numéro → node ID", async () => {
    mockFetch(
      TOKEN_RESPONSE,
      { data: { repository: { i0: { id: "NI_10" }, i1: { id: "NI_20" } } } },
    );

    const result = await resolveIssueNodeIds([10, 20]);
    expect(result).toEqual({ 10: "NI_10", 20: "NI_20" });

    const [, opts] = fetchCalls()[1];
    const body = JSON.parse(opts.body);
    expect(body.query).toContain("i0: issue(number: 10)");
    expect(body.query).toContain("i1: issue(number: 20)");
  });
});

// ─── addSubIssue ─────────────────────────────────────────────────────────────

describe("addSubIssue", () => {
  it("appelle la mutation addSubIssue avec les bons IDs", async () => {
    mockFetch(...withToken({ data: {} }));

    await addSubIssue("PARENT_NI", "SUB_NI");

    const [, opts] = fetchCalls()[1];
    const body = JSON.parse(opts.body);
    expect(body.query).toContain("addSubIssue");
    expect(body.variables.pid).toBe("PARENT_NI");
    expect(body.variables.sid).toBe("SUB_NI");
  });
});

// ─── addBlockedByRelationship ────────────────────────────────────────────────

describe("addBlockedByRelationship", () => {
  it("appelle addIssueRelationship avec BLOCKED_BY", async () => {
    mockFetch(...withToken({ data: {} }));

    await addBlockedByRelationship("ISSUE_NI", "BLOCKER_NI");

    const [, opts] = fetchCalls()[1];
    const body = JSON.parse(opts.body);
    expect(body.query).toContain("addIssueRelationship");
    expect(body.query).toContain("BLOCKED_BY");
    expect(body.variables.iid).toBe("ISSUE_NI");
    expect(body.variables.rid).toBe("BLOCKER_NI");
  });
});
