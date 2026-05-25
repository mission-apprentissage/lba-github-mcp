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
