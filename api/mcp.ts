import { randomUUID } from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createIssue, addIssueToProject, setProjectField, listLabels, listMembers, listIssues } from "./github";

const transports = new Map<string, StreamableHTTPServerTransport>();

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "lba-github-mcp", version: "1.0.0" });

  server.registerTool(
    "create_issue",
    {
      description: "Crée une issue GitHub sur mission-apprentissage/labonnealternance et l'ajoute automatiquement au GitHub Project en statut 'à faire'. Retourne l'URL de l'issue et le project item ID (à utiliser avec set_project_field pour définir l'équipe).",
      inputSchema: {
        title: z.string().describe("Titre de l'issue"),
        description: z.string().optional().describe("Corps de l'issue en markdown"),
        assignees: z.array(z.string()).optional().describe("Logins GitHub des assignés"),
      },
    },
    async ({ title, description, assignees }) => {
      const issue = await createIssue({ title, body: description, assignees });
      const itemId = await addIssueToProject(issue.node_id);
      return {
        content: [{ type: "text" as const, text: `Issue créée et ajoutée au projet !\n\n**#${issue.number}** — ${issue.title}\n${issue.html_url}\n\nProject item ID : \`${itemId}\`\n_(utilise \`set_project_field\` avec cet ID pour définir l'équipe)_` }],
      };
    }
  );

  server.registerTool(
    "set_project_field",
    {
      description: "Définit un champ du GitHub Project LBA sur un item. À appeler après create_issue avec le project item ID retourné. Champs disponibles : status (a-faire, en-cours, en-revu-technique, pret-a-tester, terminer, bloquer) et team (Developer, Growth, UX/UI, Data, PO/PM, DevOps).",
      inputSchema: {
        item_id: z.string().describe("ID de l'item dans le projet (retourné par create_issue)"),
        field: z.enum(["status", "team"]).describe("Champ à modifier"),
        value: z.string().describe("Valeur : status → a-faire | en-cours | en-revu-technique | pret-a-tester | terminer | bloquer. team → Developer | Growth | UX/UI | Data | PO/PM | DevOps"),
      },
    },
    async ({ item_id, field, value }) => {
      await setProjectField(item_id, field, value);
      return {
        content: [{ type: "text" as const, text: `Champ "${field}" mis à jour → "${value}"` }],
      };
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
