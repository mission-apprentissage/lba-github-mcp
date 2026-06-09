import { createSign } from "crypto";

const ORG = "mission-apprentissage";
const REPO = "labonnealternance";
const BASE = "https://api.github.com";

export const PROJECT_ID = "PVT_kwDOA8sl_s4BW3Li";

export const SELECT_FIELD_IDS = {
  status:   "PVTSSF_lADOA8sl_s4BW3LizhSIG_8",
  team:     "PVTSSF_lADOA8sl_s4BW3LizhSI6kM",
  epic:     "PVTSSF_lADOA8sl_s4BW3LizhSf8-U",
  approver: "PVTSSF_lADOA8sl_s4BW3LizhSmLWU",
} as const;

export const PRIORITY_FIELD_ID = "IFSS_kgDOAPO9Ww";

export const SPRINT_FIELD_ID = "PVTIF_lADOA8sl_s4BW3LizhSfYwQ";

export const SELECT_OPTIONS: Record<keyof typeof SELECT_FIELD_IDS, Record<string, string>> = {
  status: {
    "a-faire":            "f75ad846",
    "en-cours":           "47fc9ee4",
    "en-revu-technique":  "df73e18b",
    "pret-a-tester":      "61e4505c",
    "terminer":           "98236657",
    "bloquer":            "57c7b9ce",
  },
  team: {
    "Developer": "a7ade20a",
    "Growth":    "b632e42a",
    "UX/UI":     "21aaa6b4",
    "Data":      "d14ba891",
    "PO/PM":     "8ae35510",
    "DevOps":    "479e8a34",
  },
  epic: {
    "[SEO] Optimisation CTR & indexation": "84f0aa1f",
    "API":                                  "2ed97a02",
    "Accompagner les jeunes":               "8a7a1b33",
    "Accompagner les recruteurs":           "ac35a981",
    "Actions emploi jeunes en formation [AB]": "e5e6d5d8",
    "Agrégation d'offres d'emploi":         "15b744f9",
    "Amélioration de l'algorithme":         "8d8a5dc0",
    "Augmenter la couverture des formations": "0f653b59",
    "Authentification pro commune":         "f83ed08e",
    "Automation envoie des emails d'acquisition Template 2": "77d406f6",
    "BAL":                                  "61a8d3b9",
    "Compte utilisateur":                   "d66e44aa",
    "DATA":                                 "49409eb1",
    "DevOps":                               "977b7034",
    "Diffusion de l'information":           "a8399adc",
    "Différentiation":                      "95157164",
    "Documentation":                        "fdd8bef8",
    "Déploiement":                          "9a8f5801",
    "Dépôt d'offres":                       "912534ef",
    "FAST":                                 "b27684db",
    "Faire émerger les besoins en recrutements": "d6518bc1",
    "Fiabilisation de la donnée":           "e0c66090",
    "Fiabilisation design / ux":            "96753759",
    "Fiabilisation technique":              "aee056c6",
    "Gestion des formations":               "a42d8e59",
    "Harmonisation technique":              "3c817300",
    "Homologation":                         "13572993",
    "Lutte contre la fraude":               "228faf7c",
    "Maintenance/Dette tech":               "3aa8dbb3",
    "Mesure de l'impact":                   "02e98097",
    "Mise en relation Entreprise - CFA":    "335c256e",
    "Mise en relation Jeune - CFA":         "0e1741c5",
    "Mise en relation Jeune - Entreprise":  "92a394fd",
    "Monitoring / Alerting":                "2809140a",
    "Moteur de recherche et filtres":       "f1cdf1de",
    "Multicompte":                          "8d87e893",
    "Optimisation technique":               "3b1395b7",
    "Orienter les candidats":               "088b865a",
    "Parcours utilisateur pro":             "a6966783",
    "Passation catalogue":                  "e508e0c2",
    "Personnalisation de l'information":    "4293803f",
    "Process équipe":                       "8ae4a845",
    "RDVA":                                 "baa070bd",
    "RGAA":                                 "658d56f7",
    "RGPD":                                 "04aa915c",
    "Rapprocher les services LBA":          "f68fca70",
    "Recherche utilisateur":                "42790f91",
    "SEO / GEO":                            "6dfd967e",
    "Suggérer des offres complètes":        "eebf849c",
    "Suivi des candidatures":               "7855c6f6",
    "Support API":                          "3ea85dd2",
    "Support utilisateur":                  "f4b435f5",
    "Sécurité / Performances":              "ec537f9b",
    "Tests":                                "82f3a13d",
    "The Happy Path":                       "b814bf22",
    "🌱 Green IT":                          "6bef5e61",
  },
  approver: {
    "Aurélie": "d13b4250",
    "Claire":  "706c109d",
    "Kevin":   "7f271d5b",
  },
};

export const PRIORITY_OPTIONS: Record<string, string> = {
  "Urgent": "IFSSO_kgDOAap2pA",
  "High":   "IFSSO_kgDOAap2pQ",
  "Medium": "IFSSO_kgDOAap2pg",
  "Low":    "IFSSO_kgDOAap2pw",
};

export const TYPE_OPTIONS: Record<string, string> = {
  "Feature": "IT_kwDOA8sl_s4AuQVi",
  "Bug":     "IT_kwDOA8sl_s4AuQVg",
  "Task":    "IT_kwDOA8sl_s4AuQVe",
};

export const SPRINT_OPTIONS: Record<string, string> = {
  "Sprint 1": "ee0256b9",
  "Sprint 2": "8969e93e",
  "Sprint 3": "0b4a1c04",
  "Sprint 4": "96cd93e7",
};

export interface GitHubIssue {
  number: number;
  title: string;
  html_url: string;
  node_id: string;
}

export interface GitHubLabel {
  name: string;
  description?: string;
}

export interface GitHubMember {
  login: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Test-only: invalidates the token cache so the next call re-fetches. */
export function _resetTokenCache() { cachedToken = null; }

function generateJWT(): string {
  const appId = process.env.GITHUB_APP_ID;
  const privateKeyB64 = process.env.GITHUB_PRIVATE_KEY;
  if (!appId || !privateKeyB64) throw new Error("GITHUB_APP_ID ou GITHUB_PRIVATE_KEY manquant");

  const privateKey = Buffer.from(privateKeyB64, "base64").toString("utf8");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 600, iss: Number(appId) })).toString("base64url");
  const data = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(data);
  return `${data}.${sign.sign(privateKey, "base64url")}`;
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const installationId = process.env.GITHUB_INSTALLATION_ID;
  if (!installationId) throw new Error("GITHUB_INSTALLATION_ID manquant");

  const jwt = generateJWT();
  const res = await fetch(`${BASE}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub App auth ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { token: string; expires_at: string };
  cachedToken = { token: data.token, expiresAt: new Date(data.expires_at).getTime() };
  return cachedToken.token;
}

async function restRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function graphqlRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { data?: T; errors?: unknown[] };
  if (data.errors) throw new Error(`GraphQL: ${JSON.stringify(data.errors)}`);
  return data.data as T;
}

async function paginate<T>(path: string): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  while (true) {
    const batch = await restRequest<T[]>(`${path}?per_page=100&page=${page}`);
    results.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return results;
}

export function createIssue(params: {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}): Promise<GitHubIssue> {
  return restRequest<GitHubIssue>(`/repos/${ORG}/${REPO}/issues`, "POST", params);
}

export async function addIssueToProject(issueNodeId: string): Promise<string> {
  type AddResult = { addProjectV2ItemById: { item: { id: string } } };
  const data = await graphqlRequest<AddResult>(
    `mutation($pid:ID!,$cid:ID!){addProjectV2ItemById(input:{projectId:$pid,contentId:$cid}){item{id}}}`,
    { pid: PROJECT_ID, cid: issueNodeId }
  );
  const itemId = data.addProjectV2ItemById.item.id;
  await graphqlRequest(
    `mutation($pid:ID!,$iid:ID!,$fid:ID!,$oid:String!){updateProjectV2ItemFieldValue(input:{projectId:$pid,itemId:$iid,fieldId:$fid,value:{singleSelectOptionId:$oid}}){projectV2Item{id}}}`,
    { pid: PROJECT_ID, iid: itemId, fid: SELECT_FIELD_IDS.status, oid: SELECT_OPTIONS.status["a-faire"] }
  );
  return itemId;
}

export async function setSelectField(itemId: string, field: keyof typeof SELECT_FIELD_IDS, value: string): Promise<void> {
  const fieldId = SELECT_FIELD_IDS[field];
  const optionId = SELECT_OPTIONS[field][value];
  if (!optionId) {
    const valid = Object.keys(SELECT_OPTIONS[field]).join(", ");
    throw new Error(`Valeur "${value}" inconnue pour "${field}". Valeurs valides : ${valid}`);
  }
  await graphqlRequest(
    `mutation($pid:ID!,$iid:ID!,$fid:ID!,$oid:String!){updateProjectV2ItemFieldValue(input:{projectId:$pid,itemId:$iid,fieldId:$fid,value:{singleSelectOptionId:$oid}}){projectV2Item{id}}}`,
    { pid: PROJECT_ID, iid: itemId, fid: fieldId, oid: optionId }
  );
}

export async function setPriorityField(issueNodeId: string, priority: string): Promise<void> {
  const optionId = PRIORITY_OPTIONS[priority];
  if (!optionId) {
    const valid = Object.keys(PRIORITY_OPTIONS).join(", ");
    throw new Error(`Priorité "${priority}" inconnue. Valeurs valides : ${valid}`);
  }
  await graphqlRequest(
    `mutation($iid:ID!,$fid:ID!,$oid:ID!){setIssueFieldValue(input:{issueId:$iid,issueFields:[{fieldId:$fid,singleSelectOptionId:$oid}]}){issue{number}}}`,
    { iid: issueNodeId, fid: PRIORITY_FIELD_ID, oid: optionId }
  );
}

export async function setIssueType(issueNodeId: string, type: string): Promise<void> {
  const typeId = TYPE_OPTIONS[type];
  if (!typeId) {
    const valid = Object.keys(TYPE_OPTIONS).join(", ");
    throw new Error(`Type "${type}" inconnu. Valeurs valides : ${valid}`);
  }
  await graphqlRequest(
    `mutation($iid:ID!,$tid:ID!){updateIssue(input:{id:$iid,issueTypeId:$tid}){issue{id}}}`,
    { iid: issueNodeId, tid: typeId }
  );
}

export interface IssueContext {
  nodeId: string;
  projectItemId: string | null;
}

export async function getIssueContext(issueNumber: number): Promise<IssueContext> {
  type Result = { repository: { issue: { id: string; projectItems: { nodes: { id: string; project: { id: string } }[] } } } };
  const data = await graphqlRequest<Result>(
    `query($owner:String!,$repo:String!,$num:Int!,$pid:ID!){repository(owner:$owner,name:$repo){issue(number:$num){id projectItems(first:10){nodes{id project{id}}}}}}`,
    { owner: ORG, repo: REPO, num: issueNumber, pid: PROJECT_ID }
  );
  const issue = data.repository.issue;
  const item = issue.projectItems.nodes.find((n) => n.project.id === PROJECT_ID) ?? null;
  return { nodeId: issue.id, projectItemId: item?.id ?? null };
}

export type UpdateIssueFields = {
  issueNumber: number;
  title?: string;
  body?: string;
  assignees?: string[];
  status?: string;
  team?: string;
  epic?: string;
  approver?: string;
  sprint?: string;
  priority?: string;
  type?: string;
};

export async function updateIssue(params: UpdateIssueFields): Promise<GitHubIssue> {
  const { issueNumber, title, body, assignees, status, team, epic, approver, sprint, priority, type } = params;

  const restFields = { title, body, assignees };
  const hasRestUpdate = Object.values(restFields).some((v) => v !== undefined);
  const projectSelectFields = { status, team, epic, approver } as const;
  const hasProjectUpdate = Object.values(projectSelectFields).some((v) => v !== undefined) || sprint !== undefined;
  const hasIssueFieldUpdate = priority !== undefined || type !== undefined;

  if (!hasRestUpdate && !hasProjectUpdate && !hasIssueFieldUpdate) {
    throw new Error("Au moins un champ à mettre à jour est requis");
  }

  // Résoudre node ID + project item ID en une seule query si besoin
  let ctx: IssueContext | null = null;
  if (hasProjectUpdate || hasIssueFieldUpdate) {
    ctx = await getIssueContext(issueNumber);
    if (hasProjectUpdate && !ctx.projectItemId) {
      throw new Error(`Issue #${issueNumber} n'est pas associée au GitHub Project`);
    }
  }

  const ops: Promise<unknown>[] = [];

  if (hasRestUpdate) {
    const payload: Record<string, unknown> = {};
    if (title !== undefined) payload.title = title;
    if (body !== undefined) payload.body = body;
    if (assignees !== undefined) payload.assignees = assignees;
    ops.push(restRequest<GitHubIssue>(`/repos/${ORG}/${REPO}/issues/${issueNumber}`, "PATCH", payload));
  }

  if (ctx) {
    for (const [field, value] of Object.entries(projectSelectFields)) {
      if (value !== undefined) ops.push(setSelectField(ctx.projectItemId!, field as keyof typeof SELECT_FIELD_IDS, value));
    }
    if (sprint !== undefined) ops.push(setSprintField(ctx.projectItemId!, sprint));
    if (priority !== undefined) ops.push(setPriorityField(ctx.nodeId, priority));
    if (type !== undefined) ops.push(setIssueType(ctx.nodeId, type));
  }

  const results = await Promise.all(ops);
  // Le résultat REST (GitHubIssue) est toujours le premier si présent, sinon on refetch
  if (hasRestUpdate) return results[0] as GitHubIssue;
  return restRequest<GitHubIssue>(`/repos/${ORG}/${REPO}/issues/${issueNumber}`, "GET");
}

export async function setSprintField(itemId: string, sprint: string): Promise<void> {
  const iterationId = SPRINT_OPTIONS[sprint];
  if (!iterationId) {
    const valid = Object.keys(SPRINT_OPTIONS).join(", ");
    throw new Error(`Sprint "${sprint}" inconnu. Valeurs valides : ${valid}`);
  }
  await graphqlRequest(
    `mutation($pid:ID!,$iid:ID!,$fid:ID!,$iter:String!){updateProjectV2ItemFieldValue(input:{projectId:$pid,itemId:$iid,fieldId:$fid,value:{iterationId:$iter}}){projectV2Item{id}}}`,
    { pid: PROJECT_ID, iid: itemId, fid: SPRINT_FIELD_ID, iter: iterationId }
  );
}

export async function resolveIssueNodeIds(issueNumbers: number[]): Promise<Record<number, string>> {
  if (!issueNumbers.length) return {};
  const aliases = issueNumbers.map((n, i) => `i${i}: issue(number: ${n}) { id }`).join("\n    ");
  const query = `query { repository(owner: "${ORG}", name: "${REPO}") {\n    ${aliases}\n  } }`;
  type RepoResult = { repository: Record<string, { id: string }> };
  const data = await graphqlRequest<RepoResult>(query, {});
  const result: Record<number, string> = {};
  issueNumbers.forEach((n, i) => {
    const node = data.repository[`i${i}`];
    if (node) result[n] = node.id;
  });
  return result;
}

export async function addSubIssue(parentNodeId: string, subIssueNodeId: string): Promise<void> {
  await graphqlRequest(
    `mutation($pid:ID!,$sid:ID!){addSubIssue(input:{issueId:$pid,subIssueId:$sid}){issue{id}subIssue{id}}}`,
    { pid: parentNodeId, sid: subIssueNodeId }
  );
}

export async function addBlockedByRelationship(issueNodeId: string, blockerNodeId: string): Promise<void> {
  await graphqlRequest(
    `mutation($iid:ID!,$rid:ID!){addIssueRelationship(input:{issueId:$iid,relatedIssueId:$rid,relationshipType:BLOCKED_BY}){relationship{type}}}`,
    { iid: issueNodeId, rid: blockerNodeId }
  );
}

export interface ProjectItem {
  item_id: string;
  issue_number: number;
  issue_node_id: string;
  title: string;
  url: string;
  body: string;
  state: string;
  status: string | null;
  team: string | null;
  type: string | null;
  priority: string | null;
  sprint: string | null;
  sprint_start_date: string | null;
  sprint_end_date: string | null;
  sprint_duration_days: number | null;
}

export async function listProjectItems(sprint?: string, limit = 200): Promise<ProjectItem[]> {
  const query = `
    query($pid:ID!,$cursor:String){
      node(id:$pid){
        ... on ProjectV2 {
          items(first:100,after:$cursor){
            pageInfo{hasNextPage endCursor}
            nodes{
              id
              fieldValues(first:20){
                nodes{
                  ... on ProjectV2ItemFieldSingleSelectValue{
                    field{... on ProjectV2FieldCommon{name}}
                    name
                  }
                  ... on ProjectV2ItemFieldIterationValue{
                    field{... on ProjectV2FieldCommon{name}}
                    title
                    startDate
                    duration
                  }
                }
              }
              content{
                ... on Issue{
                  id number title url body state
                  issueType{name}
                  issueFieldValues(first:5){
                    nodes{
                      ... on IssueFieldSingleSelectValue{
                        field{... on IssueFieldSingleSelect{id name}}
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`;

  type RawFieldValue = {
    field?: { name: string };
    name?: string;
    title?: string;
    startDate?: string;
    duration?: number;
  };
  type RawItem = {
    id: string;
    fieldValues: { nodes: RawFieldValue[] };
    content: {
      id: string; number: number; title: string; url: string; body: string; state: string;
      issueType?: { name: string };
      issueFieldValues: { nodes: { field?: { id: string; name: string }; name?: string }[] };
    } | null;
  };
  type Result = { node: { items: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: RawItem[] } } };

  const items: ProjectItem[] = [];
  let cursor: string | null = null;

  while (items.length < limit) {
    const data: Result = await graphqlRequest<Result>(query, { pid: PROJECT_ID, cursor });
    const page: Result["node"]["items"] = data.node.items;

    for (const node of page.nodes) {
      if (!node.content) continue;

      const projectFields: Record<string, string> = {};
      let sprintIteration: { startDate: string; duration: number } | null = null;
      for (const fv of node.fieldValues.nodes) {
        if (fv.field?.name && (fv.name || fv.title)) {
          projectFields[fv.field.name] = (fv.name ?? fv.title)!;
        }
        if (fv.field?.name === "Sprint" && fv.startDate && typeof fv.duration === "number") {
          sprintIteration = { startDate: fv.startDate, duration: fv.duration };
        }
      }

      const sprintValue = projectFields["Sprint"] ?? null;
      if (sprint && sprintValue !== sprint) continue;

      let sprintEndDate: string | null = null;
      if (sprintIteration) {
        const start = new Date(sprintIteration.startDate + "T00:00:00Z");
        start.setUTCDate(start.getUTCDate() + sprintIteration.duration);
        sprintEndDate = start.toISOString().slice(0, 10);
      }

      const issuePriority = node.content.issueFieldValues.nodes
        .find((fv) => fv.field?.id === PRIORITY_FIELD_ID)?.name ?? null;

      items.push({
        item_id:      node.id,
        issue_number: node.content.number,
        issue_node_id: node.content.id,
        title:        node.content.title,
        url:          node.content.url,
        body:         node.content.body ?? "",
        state:        node.content.state,
        status:       projectFields["Status"] ?? null,
        team:         projectFields["Team"] ?? null,
        type:         node.content.issueType?.name ?? null,
        priority:     issuePriority,
        sprint:       sprintValue,
        sprint_start_date:    sprintIteration?.startDate ?? null,
        sprint_end_date:      sprintEndDate,
        sprint_duration_days: sprintIteration?.duration ?? null,
      });

      if (items.length >= limit) break;
    }

    if (!page.pageInfo.hasNextPage || items.length >= limit) break;
    cursor = page.pageInfo.endCursor;
  }

  return items;
}

export interface StatusHistoryEntry {
  from_status: string;
  to_status: string;
  entered_at: string;
  duration_seconds: number | null;
}

export interface IssueStatusHistory {
  issue_number: number;
  history: StatusHistoryEntry[];
}

export async function listStatusHistory(issueNumbers: number[]): Promise<IssueStatusHistory[]> {
  if (!issueNumbers.length) return [];

  const CHUNK = 50;
  const results: IssueStatusHistory[] = [];

  for (let i = 0; i < issueNumbers.length; i += CHUNK) {
    const chunk = issueNumbers.slice(i, i + CHUNK);
    const aliases = chunk
      .map((n, j) => `i${j}: issue(number:${n}){number timelineItems(first:50,itemTypes:[PROJECT_V2_ITEM_STATUS_CHANGED_EVENT]){nodes{... on ProjectV2ItemStatusChangedEvent{createdAt previousStatus status project{id}}}}}`)
      .join(" ");
    const query = `query{repository(owner:"${ORG}",name:"${REPO}"){${aliases}}}`;

    type IssueNode = {
      number: number;
      timelineItems: { nodes: { createdAt: string; previousStatus: string; status: string; project: { id: string } }[] };
    };
    const data = await graphqlRequest<{ repository: Record<string, IssueNode> }>(query, {});

    for (let j = 0; j < chunk.length; j++) {
      const issue = data.repository[`i${j}`];
      if (!issue) continue;

      const events = issue.timelineItems.nodes
        .filter((e) => e.project.id === PROJECT_ID)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      const history: StatusHistoryEntry[] = events.map((e, idx) => {
        const next = events[idx + 1];
        const duration = next
          ? Math.round((new Date(next.createdAt).getTime() - new Date(e.createdAt).getTime()) / 1000)
          : null;
        return { from_status: e.previousStatus, to_status: e.status, entered_at: e.createdAt, duration_seconds: duration };
      });

      results.push({ issue_number: issue.number, history });
    }
  }

  return results;
}

export function listLabels(): Promise<GitHubLabel[]> {
  return paginate<GitHubLabel>(`/repos/${ORG}/${REPO}/labels`);
}

export function listMembers(): Promise<GitHubMember[]> {
  return paginate<GitHubMember>(`/orgs/${ORG}/members`);
}

export function listIssues(params: { labels?: string; assignee?: string; limit: number }): Promise<GitHubIssue[]> {
  const qs = new URLSearchParams({ state: "open", per_page: String(params.limit) });
  if (params.labels) qs.set("labels", params.labels);
  if (params.assignee) qs.set("assignee", params.assignee);
  return restRequest<GitHubIssue[]>(`/repos/${ORG}/${REPO}/issues?${qs}`);
}
