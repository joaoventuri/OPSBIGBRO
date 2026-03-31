import { Router, Request, Response } from "express";
import { Client as SSHClient } from "ssh2";
import { prisma } from "../../config/db";
import { z } from "zod";

const router = Router();

// ─── SSH helper ─────────────────────────────────────────────

function sshExec(server: any, cmd: string, timeout = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const ssh = new SSHClient();
    const timer = setTimeout(() => { ssh.end(); reject(new Error("SSH timeout")); }, timeout);
    ssh.on("ready", () => {
      ssh.exec(cmd, (err, stream) => {
        if (err) { clearTimeout(timer); ssh.end(); return reject(err); }
        let out = "";
        stream.on("data", (d: Buffer) => { out += d.toString(); });
        stream.stderr.on("data", (d: Buffer) => { out += d.toString(); });
        stream.on("close", () => { clearTimeout(timer); ssh.end(); resolve(out.trim()); });
      });
    });
    ssh.on("error", (err) => { clearTimeout(timer); reject(err); });
    const cfg: any = { host: server.host, port: server.port, username: server.username, readyTimeout: 10000 };
    if (server.authType === "key" && server.privateKey) cfg.privateKey = server.privateKey;
    else cfg.password = server.password;
    ssh.connect(cfg);
  });
}

// ─── Traefik config generator ───────────────────────────────

function generateTraefikCompose(domains: any[], email: string) {
  // Dynamic config for each domain
  const routerEntries = domains.filter(d => d.enabled).map(d => {
    const safeId = d.domain.replace(/[^a-zA-Z0-9]/g, "-");
    return {
      router: `
      ${safeId}:
        rule: "Host(\`${d.domain}\`)"
        service: "${safeId}"
        entryPoints:
          - websecure
        tls:
          certResolver: letsencrypt`,
      service: `
      ${safeId}:
        loadBalancer:
          servers:
            - url: "http://${d.containerName}:${d.containerPort}"`,
    };
  });

  const dynamicConfig = `
http:
  routers:${routerEntries.map(r => r.router).join("")}
  services:${routerEntries.map(r => r.service).join("")}
`;

  const traefikCompose = `
services:
  traefik:
    image: traefik:v3.4
    restart: unless-stopped
    container_name: obb-traefik
    command:
      - "--api.dashboard=false"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.file.directory=/etc/traefik/dynamic"
      - "--providers.file.watch=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=${email}"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik_letsencrypt:/letsencrypt
      - ./traefik-dynamic:/etc/traefik/dynamic
    networks:
      - obb-proxy

networks:
  obb-proxy:
    name: obb-proxy
    driver: bridge

volumes:
  traefik_letsencrypt:
`;

  return { traefikCompose, dynamicConfig };
}

// ─── CRUD Domains ───────────────────────────────────────────

const domainSchema = z.object({
  domain: z.string().min(3),
  containerName: z.string().min(1),
  containerPort: z.number().int().default(80),
  ssl: z.boolean().default(true),
  serverId: z.string().uuid(),
});

router.get("/", async (req: Request, res: Response) => {
  const domains = await prisma.domain.findMany({
    where: { workspaceId: req.auth!.workspaceId },
    include: { server: { select: { id: true, name: true, host: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(domains);
});

router.post("/", async (req: Request, res: Response) => {
  const data = domainSchema.parse(req.body);
  const domain = await prisma.domain.create({
    data: { ...data, workspaceId: req.auth!.workspaceId },
  });
  res.status(201).json(domain);
});

router.put("/:id", async (req: Request, res: Response) => {
  const data = domainSchema.partial().parse(req.body);
  await prisma.domain.updateMany({
    where: { id: req.params.id, workspaceId: req.auth!.workspaceId },
    data,
  });
  res.json({ success: true });
});

router.delete("/:id", async (req: Request, res: Response) => {
  await prisma.domain.deleteMany({
    where: { id: req.params.id, workspaceId: req.auth!.workspaceId },
  });
  res.json({ success: true });
});

router.put("/:id/toggle", async (req: Request, res: Response) => {
  const domain = await prisma.domain.findFirst({
    where: { id: req.params.id, workspaceId: req.auth!.workspaceId },
  });
  if (!domain) return res.status(404).json({ error: "Not found" });
  await prisma.domain.update({
    where: { id: domain.id },
    data: { enabled: !domain.enabled },
  });
  res.json({ success: true, enabled: !domain.enabled });
});

// ─── Deploy Traefik to server ───────────────────────────────

router.post("/deploy/:serverId", async (req: Request, res: Response) => {
  const { serverId } = req.params;
  const { email } = req.body; // for Let's Encrypt

  const server = await prisma.server.findFirst({
    where: { id: serverId, workspaceId: req.auth!.workspaceId },
  });
  if (!server) return res.status(404).json({ error: "Server not found" });

  const domains = await prisma.domain.findMany({
    where: { serverId, workspaceId: req.auth!.workspaceId, enabled: true },
  });

  try {
    const { traefikCompose, dynamicConfig } = generateTraefikCompose(domains, email || "admin@opsbigbro.local");

    // Create directories and files on remote
    await sshExec(server, `mkdir -p /opt/obb-traefik/traefik-dynamic`);

    // Write traefik compose
    await sshExec(server, `cat > /opt/obb-traefik/docker-compose.yml << 'TREOF'
${traefikCompose}
TREOF`);

    // Write dynamic config
    await sshExec(server, `cat > /opt/obb-traefik/traefik-dynamic/routes.yml << 'DREOF'
${dynamicConfig}
DREOF`);

    // Connect containers to obb-proxy network
    await sshExec(server, `docker network create obb-proxy 2>/dev/null || true`);
    for (const d of domains) {
      await sshExec(server, `docker network connect obb-proxy ${d.containerName} 2>/dev/null || true`);
    }

    // Start traefik
    await sshExec(server, `cd /opt/obb-traefik && docker compose up -d 2>&1`, 60000);

    res.json({ success: true, domains: domains.length, message: "Traefik deployed with " + domains.length + " routes" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Sync (update config without restarting Traefik) ────────

router.post("/sync/:serverId", async (req: Request, res: Response) => {
  const { serverId } = req.params;

  const server = await prisma.server.findFirst({
    where: { id: serverId, workspaceId: req.auth!.workspaceId },
  });
  if (!server) return res.status(404).json({ error: "Server not found" });

  const domains = await prisma.domain.findMany({
    where: { serverId, workspaceId: req.auth!.workspaceId, enabled: true },
  });

  try {
    const { dynamicConfig } = generateTraefikCompose(domains, "admin@opsbigbro.local");

    // Traefik watches file changes — just update the config
    await sshExec(server, `cat > /opt/obb-traefik/traefik-dynamic/routes.yml << 'DREOF'
${dynamicConfig}
DREOF`);

    // Ensure all containers are on the network
    for (const d of domains) {
      await sshExec(server, `docker network connect obb-proxy ${d.containerName} 2>/dev/null || true`);
    }

    res.json({ success: true, synced: domains.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
