import { randomUUID } from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createIssue, addIssueToProject, listLabels, listMembers, listIssues } from "./github";

const transports = new Map<string, StreamableHTTPServerTransport>();

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "lba-github-mcp", version: "1.0.0" });

  server.registerTool(
    "create_issue",
    {
      description: "Crée une issue GitHub sur mission-apprentissage/labonnealternance.",
      inputSchema: {
        title: z.string().describe("Titre de l'issue"),
        body: z.string().optional().describe("Description en markdown"),
        labels: z.array(z.string()).optional().describe("Labels à appliquer"),
        assignees: z.array(z.string()).optional().describe("Logins GitHub des assignés"),
        project_number: z.number().optional().describe("Numéro du GitHub Project (ex: 14)"),
      },
    },
    async ({ title, body, labels, assignees, project_number }) => {
      const issue = await createIssue({ title, body, labels, assignees });
      let projectMsg = "";
      if (project_number !== undefined) {
        try {
          await addIssueToProject(issue.node_id, project_number);
          projectMsg = ` Liée au project #${project_number}.`;
        } catch (e) {
          projectMsg = ` (Liaison project échouée : ${(e as Error).message})`;
        }
      }
      return {
        content: [{ type: "text" as const, text: `Issue créée !\n\n**#${issue.number}** — ${issue.title}\n${issue.html_url}${projectMsg}` }],
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
