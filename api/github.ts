import { createSign } from "crypto";

const ORG = "mission-apprentissage";
const REPO = "labonnealternance";
const BASE = "https://api.github.com";

const PROJECT_ID = "PVT_kwDOA8sl_s4BW3Li";

const FIELD_IDS = {
  status: "PVTSSF_lADOA8sl_s4BW3LizhSIG_8",
  team: "PVTSSF_lADOA8sl_s4BW3LizhSI6kM",
} as const;

const FIELD_OPTIONS: Record<keyof typeof FIELD_IDS, Record<string, string>> = {
  status: {
    "a-faire": "f75ad846",
    "en-cours": "47fc9ee4",
    "en-revu-technique": "df73e18b",
    "pret-a-tester": "61e4505c",
    "terminer": "98236657",
    "bloquer": "57c7b9ce",
  },
  team: {
    "Developer": "a7ade20a",
    "Growth": "b632e42a",
    "UX/UI": "21aaa6b4",
    "Data": "d14ba891",
    "PO/PM": "8ae35510",
    "DevOps": "479e8a34",
  },
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
    { pid: PROJECT_ID, iid: itemId, fid: FIELD_IDS.status, oid: FIELD_OPTIONS.status["a-faire"] }
  );
  return itemId;
}

export async function setProjectField(itemId: string, field: keyof typeof FIELD_IDS, value: string): Promise<void> {
  const fieldId = FIELD_IDS[field];
  const optionId = FIELD_OPTIONS[field][value];
  if (!optionId) {
    const valid = Object.keys(FIELD_OPTIONS[field]).join(", ");
    throw new Error(`Valeur "${value}" inconnue pour "${field}". Valeurs valides : ${valid}`);
  }
  await graphqlRequest(
    `mutation($pid:ID!,$iid:ID!,$fid:ID!,$oid:String!){updateProjectV2ItemFieldValue(input:{projectId:$pid,itemId:$iid,fieldId:$fid,value:{singleSelectOptionId:$oid}}){projectV2Item{id}}}`,
    { pid: PROJECT_ID, iid: itemId, fid: fieldId, oid: optionId }
  );
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
