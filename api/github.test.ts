import { generateKeyPairSync } from "crypto";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import {
  createIssue,
  addIssueToProject,
  setSelectField,
  setPriorityField,
  setSprintField,
  listSprints,
  getCurrentSprint,
  _resetSprintCache,
  setIssueType,
  getIssueContext,
  updateIssue,
  listProjectItems,
  listStatusHistory,
  resolveIssueNodeIds,
  addSubIssue,
  addBlockedByRelationship,
  listIssues,
  listEpics,
  listApprovers,
  _resetTokenCache,
  _resetFieldOptionsCache,
  SELECT_OPTIONS,
  PRIORITY_OPTIONS,
  TYPE_OPTIONS,
  PROJECT_ID,
  SELECT_FIELD_IDS,
  SPRINT_FIELD_ID,
  PRIORITY_FIELD_ID,
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
  _resetSprintCache();
  _resetFieldOptionsCache();
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

  it("résout epic dynamiquement via getDynamicFieldOptions plutôt qu'une table codée en dur", async () => {
    mockFetch(
      TOKEN_RESPONSE,
      { data: { node: { options: [{ id: "epic_opt_1", name: "API" }] } } }, // getDynamicFieldOptions
      { data: {} }, // mutation
    );

    await setSelectField("ITEM_1", "epic", "API");

    const optionsCall = JSON.parse(fetchCalls()[1][1].body);
    expect(optionsCall.query).toContain("ProjectV2SingleSelectField");
    expect(optionsCall.variables.fid).toBe(SELECT_FIELD_IDS.epic);
    const mutationCall = JSON.parse(fetchCalls()[2][1].body);
    expect(mutationCall.variables.oid).toBe("epic_opt_1");
  });

  it("lève une erreur pour une epic qui n'existe pas dans le Project (near-miss orthographe)", async () => {
    mockFetch(TOKEN_RESPONSE, { data: { node: { options: [{ id: "epic_opt_1", name: "API" }] } } });
    await expect(setSelectField("ITEM_1", "epic", "APi")).rejects.toThrow('Valeur "APi" inconnue');
  });
});

// ─── listEpics / listApprovers (champs dynamiques) ──────────────────────────

describe("listEpics / listApprovers", () => {
  it("récupère les options epic depuis le Project (pas de table codée en dur)", async () => {
    mockFetch(TOKEN_RESPONSE, { data: { node: { options: [{ id: "e1", name: "API" }, { id: "e2", name: "BAL" }] } } });

    const epics = await listEpics();
    expect(epics).toEqual({ API: "e1", BAL: "e2" });
  });

  it("met en cache (un seul fetch réseau pour deux appels)", async () => {
    mockFetch(TOKEN_RESPONSE, { data: { node: { options: [{ id: "e1", name: "API" }] } } });

    await listEpics();
    await listEpics();

    expect(fetchCalls().length).toBe(2); // token + 1 query (pas de second fetch)
  });

  it("approver interroge le field ID approver, distinct de epic", async () => {
    mockFetch(TOKEN_RESPONSE, { data: { node: { options: [{ id: "a1", name: "Kevin" }] } } });

    await listApprovers();

    const body = JSON.parse(fetchCalls()[1][1].body);
    expect(body.variables.fid).toBe(SELECT_FIELD_IDS.approver);
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

// ─── listSprints / getCurrentSprint / setSprintField ─────────────────────────

/** Réponse GraphQL de la config du champ Sprint. */
function sprintConfig(iterations: object[], completedIterations: object[] = []) {
  return { data: { node: { field: { configuration: { iterations, completedIterations } } } } };
}

const SPRINTS_PAYLOAD = sprintConfig(
  [
    { id: "iter_cur", title: "Sprint 4", startDate: "2026-06-22", duration: 14 },
    { id: "iter_next", title: "Sprint 5", startDate: "2026-07-06", duration: 14 },
  ],
  [{ id: "iter_old", title: "Sprint 3", startDate: "2026-06-08", duration: 14 }]
);

describe("listSprints", () => {
  it("expose les itérations terminées puis en cours avec dates calculées", async () => {
    mockFetch(...withToken(SPRINTS_PAYLOAD));

    const sprints = await listSprints();

    expect(sprints.map((s) => s.title)).toEqual(["Sprint 3", "Sprint 4", "Sprint 5"]);
    expect(sprints[0]).toMatchObject({ id: "iter_old", completed: true, start_date: "2026-06-08", end_date: "2026-06-22", duration_days: 14 });
    expect(sprints[1]).toMatchObject({ completed: false, end_date: "2026-07-06" });
  });

  it("met en cache (un seul fetch réseau pour deux appels)", async () => {
    mockFetch(...withToken(SPRINTS_PAYLOAD));

    await listSprints();
    await listSprints();

    // token + 1 query config = 2 appels (pas de second fetch config)
    expect(fetchCalls().length).toBe(2);
  });
});

describe("getCurrentSprint", () => {
  it("retourne le sprint encadrant la date du jour", async () => {
    // 2026-06-25 est dans Sprint 4 (22/06 → 06/07)
    vi.setSystemTime(new Date("2026-06-25T12:00:00Z"));
    mockFetch(...withToken(SPRINTS_PAYLOAD));

    const current = await getCurrentSprint();

    expect(current?.title).toBe("Sprint 4");
    vi.useRealTimers();
  });
});

describe("setSprintField", () => {
  it("résout le titre via listSprints et appelle la mutation avec l'iterationId", async () => {
    mockFetch(TOKEN_RESPONSE, SPRINTS_PAYLOAD, { data: {} });

    await setSprintField("ITEM_1", "Sprint 4");

    // [0]=token, [1]=config listSprints, [2]=mutation
    const [, opts] = fetchCalls()[2];
    const body = JSON.parse(opts.body);
    expect(body.variables.fid).toBe(SPRINT_FIELD_ID);
    expect(body.variables.iter).toBe("iter_cur");
  });

  it('résout "current" vers le sprint en cours', async () => {
    vi.setSystemTime(new Date("2026-06-25T12:00:00Z"));
    mockFetch(TOKEN_RESPONSE, SPRINTS_PAYLOAD, { data: {} });

    await setSprintField("ITEM_1", "current");

    const [, opts] = fetchCalls()[2];
    expect(JSON.parse(opts.body).variables.iter).toBe("iter_cur");
    vi.useRealTimers();
  });

  it("lève une erreur pour un sprint inconnu", async () => {
    mockFetch(...withToken(SPRINTS_PAYLOAD));
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

// ─── setIssueType ────────────────────────────────────────────────────────────

describe("setIssueType", () => {
  it("appelle updateIssue avec le bon issueTypeId", async () => {
    mockFetch(...withToken({ data: {} }));

    await setIssueType("NI_42", "Bug");

    const [, opts] = fetchCalls()[1];
    const body = JSON.parse(opts.body);
    expect(body.query).toContain("updateIssue");
    expect(body.variables.iid).toBe("NI_42");
    expect(body.variables.tid).toBe(TYPE_OPTIONS["Bug"]);
  });

  it("lève une erreur pour un type inconnu", async () => {
    mockFetch(...withToken({}));
    await expect(setIssueType("NI_42", "Epic")).rejects.toThrow('Type "Epic" inconnu');
  });
});

// ─── getIssueContext ──────────────────────────────────────────────────────────

const CONTEXT_GQL_RESPONSE = {
  data: {
    repository: {
      issue: {
        id: "NI_42",
        projectItems: {
          nodes: [{ id: "ITEM_42", project: { id: PROJECT_ID } }],
        },
      },
    },
  },
};

describe("getIssueContext", () => {
  it("retourne nodeId et projectItemId via GraphQL", async () => {
    mockFetch(TOKEN_RESPONSE, CONTEXT_GQL_RESPONSE);

    const ctx = await getIssueContext(42);
    expect(ctx.nodeId).toBe("NI_42");
    expect(ctx.projectItemId).toBe("ITEM_42");
  });

  it("retourne projectItemId null si l'issue n'est pas dans le project", async () => {
    mockFetch(TOKEN_RESPONSE, {
      data: { repository: { issue: { id: "NI_99", projectItems: { nodes: [] } } } },
    });

    const ctx = await getIssueContext(99);
    expect(ctx.nodeId).toBe("NI_99");
    expect(ctx.projectItemId).toBeNull();
  });
});

// ─── updateIssue ─────────────────────────────────────────────────────────────

describe("updateIssue", () => {
  it("PATCH title + body seuls (pas de query GraphQL context)", async () => {
    const issuePayload = { number: 10, title: "Nouveau titre", html_url: "https://github.com/x/10", node_id: "NI_10" };
    mockFetch(...withToken(issuePayload));

    const result = await updateIssue({ issueNumber: 10, title: "Nouveau titre", body: "desc" });

    expect(result.number).toBe(10);
    const calls = fetchCalls();
    // token + 1 seul appel REST (pas de context query)
    expect(calls).toHaveLength(2);
    const [url, opts] = calls[1];
    expect(url).toContain("/issues/10");
    expect(opts.method).toBe("PATCH");
    const body = JSON.parse(opts.body);
    expect(body.title).toBe("Nouveau titre");
    expect(body.body).toBe("desc");
  });

  it("met à jour status + priority : résout le context puis dispatch en parallèle", async () => {
    const issuePayload = { number: 42, title: "T", html_url: "https://github.com/x/42", node_id: "NI_42" };
    mockFetch(
      TOKEN_RESPONSE,
      CONTEXT_GQL_RESPONSE,                     // getIssueContext
      { data: {} },                              // setSelectField (status)
      { data: {} },                              // setPriorityField
      issuePayload,                              // GET final (pas de PATCH REST)
    );

    await updateIssue({ issueNumber: 42, status: "en-cours", priority: "High" });

    const calls = fetchCalls();
    // token + context + status + priority + GET
    expect(calls).toHaveLength(5);
    const statusBody = JSON.parse(calls[2][1].body);
    expect(statusBody.variables.oid).toBe(SELECT_OPTIONS.status["en-cours"]);
    const priorityBody = JSON.parse(calls[3][1].body);
    expect(priorityBody.variables.oid).toBe(PRIORITY_OPTIONS["High"]);
    expect(calls[4][0]).toContain("/issues/42");
    expect(calls[4][1].method).toBe("GET");
  });

  it("met à jour title + status en même temps", async () => {
    const issuePayload = { number: 7, title: "T", html_url: "https://github.com/x/7", node_id: "NI_7" };
    mockFetch(
      TOKEN_RESPONSE,
      CONTEXT_GQL_RESPONSE,   // getIssueContext
      issuePayload,            // REST PATCH
      { data: {} },            // setSelectField (status)
    );

    const result = await updateIssue({ issueNumber: 7, title: "T", status: "terminer" });
    expect(result.number).toBe(7);
  });

  it("lève une erreur si aucun champ fourni", async () => {
    await expect(updateIssue({ issueNumber: 1 })).rejects.toThrow("Au moins un champ à mettre à jour est requis");
  });

  it("lève une erreur si issue non associée au project lors d'une mise à jour de champ project", async () => {
    mockFetch(TOKEN_RESPONSE, {
      data: { repository: { issue: { id: "NI_1", projectItems: { nodes: [] } } } },
    });
    await expect(updateIssue({ issueNumber: 1, status: "en-cours" })).rejects.toThrow("n'est pas associée au GitHub Project");
  });
});

// ─── listProjectItems ─────────────────────────────────────────────────────────

function makeProjectPage(items: object[], hasNextPage = false, endCursor = "cursor1") {
  return {
    data: {
      node: {
        items: {
          pageInfo: { hasNextPage, endCursor },
          nodes: items,
        },
      },
    },
  };
}

function makeProjectItem(issueNumber: number, overrides: {
  status?: string; team?: string; sprint?: string;
  type?: string; priority?: string; state?: string;
  sprintStartDate?: string; sprintDuration?: number;
} = {}) {
  const { status = "a-faire", team = "Developer", sprint = "Sprint 3",
          type = "Bug", priority = "High", state = "OPEN",
          sprintStartDate = "2026-06-02", sprintDuration = 14 } = overrides;
  return {
    id: `ITEM_${issueNumber}`,
    fieldValues: {
      nodes: [
        { field: { name: "Status" }, name: status },
        { field: { name: "Team" }, name: team },
        { field: { name: "Sprint" }, title: sprint, startDate: sprintStartDate, duration: sprintDuration },
      ],
    },
    content: {
      id: `NI_${issueNumber}`,
      number: issueNumber,
      title: `Issue ${issueNumber}`,
      url: `https://github.com/x/${issueNumber}`,
      body: "Description",
      state,
      issueType: { name: type },
      issueFieldValues: {
        nodes: priority ? [{ field: { id: PRIORITY_FIELD_ID, name: "Priority" }, name: priority }] : [],
      },
    },
  };
}

describe("listProjectItems", () => {
  it("retourne les items filtrés par sprint", async () => {
    mockFetch(
      TOKEN_RESPONSE,
      makeProjectPage([
        makeProjectItem(1, { sprint: "Sprint 3" }),
        makeProjectItem(2, { sprint: "Sprint 2" }),
        makeProjectItem(3, { sprint: "Sprint 3", status: "terminer" }),
      ])
    );

    const items = await listProjectItems("Sprint 3");

    expect(items).toHaveLength(2);
    expect(items[0].issue_number).toBe(1);
    expect(items[0].sprint).toBe("Sprint 3");
    expect(items[0].status).toBe("a-faire");
    expect(items[0].team).toBe("Developer");
    expect(items[0].type).toBe("Bug");
    expect(items[0].priority).toBe("High");
    expect(items[1].issue_number).toBe(3);
    expect(items[1].status).toBe("terminer");
  });

  it("retourne tous les items si sprint non fourni", async () => {
    mockFetch(
      TOKEN_RESPONSE,
      makeProjectPage([
        makeProjectItem(1, { sprint: "Sprint 3" }),
        makeProjectItem(2, { sprint: "Sprint 2" }),
      ])
    );

    const items = await listProjectItems();
    expect(items).toHaveLength(2);
  });

  it("ignore les items sans contenu (PRs)", async () => {
    mockFetch(
      TOKEN_RESPONSE,
      makeProjectPage([
        makeProjectItem(1),
        { id: "ITEM_PR", fieldValues: { nodes: [] }, content: null },
      ])
    );

    const items = await listProjectItems();
    expect(items).toHaveLength(1);
    expect(items[0].issue_number).toBe(1);
  });

  it("pagine si hasNextPage = true", async () => {
    mockFetch(
      TOKEN_RESPONSE,
      makeProjectPage([makeProjectItem(1)], true, "c1"),
      makeProjectPage([makeProjectItem(2)], false),
    );

    const items = await listProjectItems();
    expect(items).toHaveLength(2);

    const calls = fetchCalls();
    // 2 appels GraphQL (+ 1 token)
    expect(calls).toHaveLength(3);
    const secondCall = JSON.parse(calls[2][1].body);
    expect(secondCall.variables.cursor).toBe("c1");
  });

  it("expose item_id et issue_node_id", async () => {
    mockFetch(TOKEN_RESPONSE, makeProjectPage([makeProjectItem(10)]));

    const [item] = await listProjectItems();
    expect(item.item_id).toBe("ITEM_10");
    expect(item.issue_node_id).toBe("NI_10");
  });

  it("expose les dates de l'itération sprint", async () => {
    mockFetch(
      TOKEN_RESPONSE,
      makeProjectPage([makeProjectItem(1, { sprintStartDate: "2026-06-02", sprintDuration: 14 })])
    );

    const [item] = await listProjectItems();
    expect(item.sprint_start_date).toBe("2026-06-02");
    expect(item.sprint_duration_days).toBe(14);
    expect(item.sprint_end_date).toBe("2026-06-16");
  });
});

// ─── listStatusHistory ────────────────────────────────────────────────────────

function makeStatusEvent(createdAt: string, previousStatus: string, status: string, projectId = PROJECT_ID) {
  return { createdAt, previousStatus, status, project: { id: projectId } };
}

describe("listStatusHistory", () => {
  it("retourne un tableau vide sans appeler fetch si aucun numéro", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const result = await listStatusHistory([]);
    expect(result).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retourne l'historique trié avec les durées calculées", async () => {
    const t1 = "2026-06-01T10:00:00Z";
    const t2 = "2026-06-01T11:00:00Z"; // +3600s
    const t3 = "2026-06-01T12:30:00Z"; // +5400s
    mockFetch(TOKEN_RESPONSE, {
      data: {
        repository: {
          i0: {
            number: 42,
            timelineItems: {
              nodes: [
                makeStatusEvent(t1, "", "a-faire"),
                makeStatusEvent(t3, "en-cours", "terminer"),
                makeStatusEvent(t2, "a-faire", "en-cours"), // volontairement désordre
              ],
            },
          },
        },
      },
    });

    const [result] = await listStatusHistory([42]);
    expect(result.issue_number).toBe(42);
    expect(result.history).toHaveLength(3);
    // trié par createdAt
    expect(result.history[0]).toMatchObject({ from_status: "", to_status: "a-faire", duration_seconds: 3600 });
    expect(result.history[1]).toMatchObject({ from_status: "a-faire", to_status: "en-cours", duration_seconds: 5400 });
    expect(result.history[2]).toMatchObject({ from_status: "en-cours", to_status: "terminer", duration_seconds: null });
  });

  it("filtre les events des autres projets", async () => {
    mockFetch(TOKEN_RESPONSE, {
      data: {
        repository: {
          i0: {
            number: 1,
            timelineItems: {
              nodes: [
                makeStatusEvent("2026-06-01T10:00:00Z", "", "a-faire", PROJECT_ID),
                makeStatusEvent("2026-06-01T11:00:00Z", "", "other-status", "OTHER_PROJECT_ID"),
              ],
            },
          },
        },
      },
    });

    const [result] = await listStatusHistory([1]);
    expect(result.history).toHaveLength(1);
    expect(result.history[0].to_status).toBe("a-faire");
  });

  it("batchise en chunks de 50", async () => {
    const numbers = Array.from({ length: 60 }, (_, i) => i + 1);
    const makeRepo = (nums: number[]) =>
      Object.fromEntries(nums.map((n, i) => [
        `i${i}`,
        { number: n, timelineItems: { nodes: [] } },
      ]));

    mockFetch(
      TOKEN_RESPONSE,
      { data: { repository: makeRepo(numbers.slice(0, 50)) } },
      { data: { repository: makeRepo(numbers.slice(50)) } },
    );

    const results = await listStatusHistory(numbers);
    expect(results).toHaveLength(60);
    // 3 appels : token + 2 batches
    expect(fetchCalls()).toHaveLength(3);
  });
});

// ─── listIssues ────────────────────────────────────────────────────────────

describe("listIssues", () => {
  it("filtre par défaut sur state=open", async () => {
    mockFetch(...withToken([]));

    await listIssues({ limit: 20 });

    const [url] = fetchCalls()[1];
    expect(url).toContain("state=open");
  });

  it("passe state=closed quand demandé", async () => {
    mockFetch(...withToken([]));

    await listIssues({ limit: 20, state: "closed" });

    const [url] = fetchCalls()[1];
    expect(url).toContain("state=closed");
  });

  it("passe state=all quand demandé", async () => {
    mockFetch(...withToken([]));

    await listIssues({ limit: 20, state: "all" });

    const [url] = fetchCalls()[1];
    expect(url).toContain("state=all");
  });
});
