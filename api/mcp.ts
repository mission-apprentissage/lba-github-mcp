import { randomUUID } from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createIssue, addIssueToProject, setSelectField, setSprintField, setPriorityField, setIssueType, updateIssue, listProjectItems, listStatusHistory, listLabels, listMembers, listIssues, resolveIssueNodeIds, addSubIssue, addBlockedByRelationship, SELECT_OPTIONS, SPRINT_OPTIONS, PRIORITY_OPTIONS, TYPE_OPTIONS } from "./github";

const transports = new Map<string, StreamableHTTPServerTransport>();

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "lba-github-mcp", version: "1.0.0" });

  server.registerTool(
    "create_issue",
    {
      description: "Crée une issue GitHub sur mission-apprentissage/labonnealternance et l'ajoute automatiquement au GitHub Project en statut 'à faire'. Retourne l'URL, le project item ID (pour status/team/epic/approver/sprint) et l'issue node ID (pour priority).",
      inputSchema: {
        title: z.string().describe("Titre de l'issue"),
        description: z.string().optional().describe("Corps de l'issue en markdown"),
        assignees: z.array(z.string()).optional().describe("Logins GitHub des assignés"),
        parent_issue_number: z.number().optional().describe("Numéro de l'issue parente (rattache l'issue créée comme sub-issue)"),
        blocked_by: z.array(z.number()).optional().describe("Numéros des issues qui bloquent l'issue créée"),
      },
    },
    async ({ title, description, assignees, parent_issue_number, blocked_by }) => {
      const issue = await createIssue({ title, body: description, assignees });
      const itemId = await addIssueToProject(issue.node_id);

      // Résolution des node IDs en une seule query
      const numbersToResolve = [
        ...(parent_issue_number ? [parent_issue_number] : []),
        ...(blocked_by ?? []),
      ];
      const nodeIds = numbersToResolve.length ? await resolveIssueNodeIds(numbersToResolve) : {};

      let parentIssueUrl: string | undefined;
      if (parent_issue_number) {
        const parentNodeId = nodeIds[parent_issue_number];
        if (parentNodeId) {
          await addSubIssue(parentNodeId, issue.node_id);
          parentIssueUrl = `https://github.com/mission-apprentissage/labonnealternance/issues/${parent_issue_number}`;
        }
      }

      const linkedBlockers: number[] = [];
      for (const blockerNum of blocked_by ?? []) {
        const blockerNodeId = nodeIds[blockerNum];
        if (blockerNodeId) {
          await addBlockedByRelationship(issue.node_id, blockerNodeId);
          linkedBlockers.push(blockerNum);
        }
      }

      const lines = [
        `Issue créée et ajoutée au projet !`,
        ``,
        `**#${issue.number}** — ${issue.title}`,
        issue.html_url,
        ``,
        `Project item ID : \`${itemId}\` _(status, team, epic, approver, sprint)_`,
        `Issue node ID : \`${issue.node_id}\` _(priority)_`,
      ];
      if (parentIssueUrl) lines.push(`Parent : ${parentIssueUrl}`);
      if (linkedBlockers.length) lines.push(`Blocked by : ${linkedBlockers.map((n) => `#${n}`).join(", ")}`);

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  server.registerTool(
    "set_project_field",
    {
      description: `Définit un champ sur une issue ou un item du GitHub Project LBA.
- status : ${Object.keys(SELECT_OPTIONS.status).join(" | ")} → project item ID
- team : ${Object.keys(SELECT_OPTIONS.team).join(" | ")} → project item ID
- epic : (liste complète via list_epics) → project item ID
- approver : ${Object.keys(SELECT_OPTIONS.approver).join(" | ")} → project item ID
- sprint : ${Object.keys(SPRINT_OPTIONS).join(" | ")} → project item ID
- priority : ${Object.keys(PRIORITY_OPTIONS).join(" | ")} → issue node ID (différent du project item ID)
- type : ${Object.keys(TYPE_OPTIONS).join(" | ")} → issue node ID (différent du project item ID)`,
      inputSchema: {
        id: z.string().describe("Project item ID (retourné par create_issue) pour status/team/epic/approver/sprint. Issue node ID pour priority et type."),
        field: z.enum(["status", "team", "epic", "approver", "sprint", "priority", "type"]).describe("Champ à modifier"),
        value: z.string().describe("Valeur du champ (voir description pour les valeurs valides)"),
      },
    },
    async ({ id, field, value }) => {
      if (field === "priority") {
        await setPriorityField(id, value);
      } else if (field === "sprint") {
        await setSprintField(id, value);
      } else if (field === "type") {
        await setIssueType(id, value);
      } else {
        await setSelectField(id, field, value);
      }
      return {
        content: [{ type: "text" as const, text: `Champ "${field}" mis à jour → "${value}"` }],
      };

    }
  );

  server.registerTool(
    "update_issue",
    {
      description: `Met à jour un ou plusieurs champs d'une issue GitHub existante (titre, description, assignees, champs du Project LBA). Ne fournir que les champs à modifier.`,
      inputSchema: {
        issue_number: z.number().int().positive().describe("Numéro de l'issue GitHub"),
        title: z.string().optional().describe("Nouveau titre"),
        description: z.string().optional().describe("Nouveau corps en markdown"),
        assignees: z.array(z.string()).optional().describe("Nouveaux assignés (remplace la liste existante)"),
        status: z.string().optional().describe(`Statut dans le Project : ${Object.keys(SELECT_OPTIONS.status).join(" | ")}`),
        team: z.string().optional().describe(`Équipe : ${Object.keys(SELECT_OPTIONS.team).join(" | ")}`),
        epic: z.string().optional().describe("Epic (valeurs via list_epics)"),
        approver: z.string().optional().describe(`Approbateur : ${Object.keys(SELECT_OPTIONS.approver).join(" | ")}`),
        sprint: z.string().optional().describe(`Sprint : ${Object.keys(SPRINT_OPTIONS).join(" | ")}`),
        priority: z.string().optional().describe(`Priorité : ${Object.keys(PRIORITY_OPTIONS).join(" | ")}`),
        type: z.string().optional().describe(`Type : ${Object.keys(TYPE_OPTIONS).join(" | ")}`),
      },
    },
    async ({ issue_number, title, description, assignees, status, team, epic, approver, sprint, priority, type }) => {
      const issue = await updateIssue({
        issueNumber: issue_number,
        title,
        body: description,
        assignees,
        status,
        team,
        epic,
        approver,
        sprint,
        priority,
        type,
      });
      return {
        content: [{ type: "text" as const, text: `Issue #${issue.number} mise à jour.\n${issue.html_url}` }],
      };
    }
  );

  server.registerTool(
    "list_project_items",
    {
      description: `Retourne tous les items du GitHub Project LBA pour un sprint donné, avec l'ensemble de leurs champs (status, team, type, priority, sprint) et le corps de l'issue. Indispensable pour l'analyse de sprint et le report automatique des tickets non terminés. Sprints disponibles : ${Object.keys(SPRINT_OPTIONS).join(" | ")}.`,
      inputSchema: {
        sprint: z.string().optional().describe(`Filtrer par sprint (ex. "Sprint 3"). Si absent, retourne tous les items.`),
        limit: z.number().optional().default(200).describe("Nombre max d'items (défaut : 200)"),
      },
    },
    async ({ sprint, limit }) => {
      const items = await listProjectItems(sprint, limit);
      if (!items.length) return { content: [{ type: "text" as const, text: "Aucun item trouvé." }] };
      const json = JSON.stringify(items, null, 2);
      return { content: [{ type: "text" as const, text: `${items.length} item(s)${sprint ? ` — ${sprint}` : ""} :\n\n\`\`\`json\n${json}\n\`\`\`` }] };
    }
  );

  server.registerTool(
    "list_status_history",
    {
      description: "Retourne l'historique des changements de statut pour une liste d'issues, avec la durée passée dans chaque statut (en secondes). À appeler après list_project_items pour calculer le temps médian par statut.",
      inputSchema: {
        issue_numbers: z.array(z.number().int().positive()).describe("Numéros des issues GitHub"),
      },
    },
    async ({ issue_numbers }) => {
      const history = await listStatusHistory(issue_numbers);
      if (!history.length) return { content: [{ type: "text" as const, text: "Aucun historique trouvé." }] };
      const json = JSON.stringify(history, null, 2);
      return { content: [{ type: "text" as const, text: `Historique de ${history.length} issue(s) :\n\n\`\`\`json\n${json}\n\`\`\`` }] };
    }
  );

  server.registerTool(
    "list_epics",
    { description: "Liste toutes les epics disponibles dans le GitHub Project LBA." },
    async () => {
      const lines = Object.keys(SELECT_OPTIONS.epic).map((e) => `- ${e}`).join("\n");
      return { content: [{ type: "text" as const, text: `Epics :\n\n${lines}` }] };
    }
  );

  server.registerTool(
    "list_labels",
    { description: "Liste tous les labels du dépôt labonnealternance." },
    async () => {
      const labels = await listLabels();
      const lines = labels.map((l) => `- **${l.name}**${l.description ? ` — ${l.description}` : ""}`).join("\n");
      return { content: [{ type: "text" as const, text: `Labels :\n\n${lines}` }] };
    }
  );

  server.registerTool(
    "list_members",
    { description: "Liste les membres de l'organisation mission-apprentissage." },
    async () => {
      const members = await listMembers();
      return { content: [{ type: "text" as const, text: `Membres :\n\n${members.map((m) => `- @${m.login}`).join("\n")}` }] };
    }
  );

  server.registerTool(
    "list_issues",
    {
      description: "Liste les issues ouvertes sur labonnealternance.",
      inputSchema: {
        labels: z.string().optional().describe("Filtrer par label(s), séparés par virgule"),
        assignee: z.string().optional().describe("Filtrer par assignee (login GitHub)"),
        limit: z.number().optional().default(20).describe("Nombre max d'issues (défaut : 20)"),
      },
    },
    async ({ labels, assignee, limit }) => {
      const issues = await listIssues({ labels, assignee, limit });
      if (!issues.length) return { content: [{ type: "text" as const, text: "Aucune issue trouvée." }] };
      const lines = issues.map((i) => `- [#${i.number}](${i.html_url}) ${i.title}`).join("\n");
      return { content: [{ type: "text" as const, text: `${issues.length} issue(s) :\n\n${lines}` }] };
    }
  );

  return server;
}

function setCorsHeaders(res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const secret = process.env.MCP_SECRET;
  if (secret && req.query["token"] !== secret) {
    res.status(401).json({ error: "Non autorisé" });
    return;
  }

  const sessionId = req.headers["mcp-session-id"];

  if (typeof sessionId === "string") {
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: "Session inconnue" });
      return;
    }
    await transport.handleRequest(req as any, res as any, req.body);
    return;
  }

  // la variable doit être typée avant d'être capturée dans onsessioninitialized
  let transport: StreamableHTTPServerTransport;
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => { transports.set(id, transport); },
  });

  transport.onclose = () => {
    if (transport.sessionId) transports.delete(transport.sessionId);
  };

  await buildMcpServer().connect(transport);
  await transport.handleRequest(req as any, res as any, req.body);
}
