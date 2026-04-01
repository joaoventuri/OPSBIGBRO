import { Router, Request, Response } from "express";
import { prisma } from "../../config/db";

const router = Router();

// ─── Export entire ServerLess database for migration ────────

router.get("/export", async (req: Request, res: Response) => {
  const workspaceId = req.auth!.workspaceId;

  const [
    users,
    workspaces,
    workspaceMembers,
    servers,
    agentTokens,
    containers,
    metrics,
    vaultGroups,
    credentials,
    healthChecks,
    pings,
    webhooks,
    domains,
    backups,
    backupSchedules,
    stacks,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { memberships: { some: { workspaceId } } },
    }),
    prisma.workspace.findMany({ where: { id: workspaceId } }),
    prisma.workspaceMember.findMany({ where: { workspaceId } }),
    prisma.server.findMany({ where: { workspaceId } }),
    prisma.agentToken.findMany({
      where: { server: { workspaceId } },
    }),
    prisma.container.findMany({
      where: { server: { workspaceId } },
    }),
    prisma.metric.findMany({
      where: { server: { workspaceId } },
      orderBy: { collectedAt: "desc" },
      take: 10000, // last 10k metrics to avoid huge files
    }),
    prisma.vaultGroup.findMany({ where: { workspaceId } }),
    prisma.credential.findMany({
      where: { group: { workspaceId } },
    }),
    prisma.healthCheck.findMany({ where: { workspaceId } }),
    prisma.ping.findMany({
      where: { healthCheck: { workspaceId } },
      orderBy: { checkedAt: "desc" },
      take: 50000,
    }),
    prisma.webhook.findMany({ where: { workspaceId } }),
    prisma.domain.findMany({ where: { workspaceId } }),
    prisma.backup.findMany({ where: { workspaceId } }),
    prisma.backupSchedule.findMany({ where: { workspaceId } }),
    prisma.stack.findMany({ where: { workspaceId } }),
  ]);

  const payload = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    platform: "ServerLess",
    data: {
      users,
      workspaces,
      workspaceMembers,
      servers,
      agentTokens,
      containers,
      metrics,
      vaultGroups,
      credentials,
      healthChecks,
      pings,
      webhooks,
      domains,
      backups,
      backupSchedules,
      stacks,
    },
  };

  const json = JSON.stringify(payload, null, 2);
  const filename = `serverless-export-${new Date().toISOString().split("T")[0]}.json`;

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(json);
});

// ─── Import ServerLess database from export file ────────────

router.post("/import", async (req: Request, res: Response) => {
  const { data, version } = req.body;

  if (!data || !version) {
    return res.status(400).json({ error: "Invalid export file" });
  }

  const stats = {
    users: 0,
    workspaces: 0,
    servers: 0,
    credentials: 0,
    healthChecks: 0,
    webhooks: 0,
    domains: 0,
    stacks: 0,
    backupSchedules: 0,
  };

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Users — match by email, replace with exported id + data
      for (const user of data.users || []) {
        const d = { ...user, createdAt: new Date(user.createdAt), updatedAt: new Date(user.updatedAt) };
        const existing = await tx.user.findUnique({ where: { email: user.email } });
        if (existing && existing.id !== user.id) {
          // Different id, same email — update all references then delete old
          await tx.workspaceMember.updateMany({ where: { userId: existing.id }, data: { userId: user.id } });
          await tx.user.delete({ where: { id: existing.id } });
        }
        await tx.user.upsert({ where: { id: user.id }, create: d, update: d });
        stats.users++;
      }

      // 2. Workspaces — match by slug, replace with exported id + data
      for (const ws of data.workspaces || []) {
        const d = { ...ws, createdAt: new Date(ws.createdAt), updatedAt: new Date(ws.updatedAt) };
        const existing = await tx.workspace.findUnique({ where: { slug: ws.slug } });
        if (existing && existing.id !== ws.id) {
          // Migrate all references from old id to new id
          await tx.workspaceMember.updateMany({ where: { workspaceId: existing.id }, data: { workspaceId: ws.id } });
          await tx.server.updateMany({ where: { workspaceId: existing.id }, data: { workspaceId: ws.id } });
          await tx.vaultGroup.updateMany({ where: { workspaceId: existing.id }, data: { workspaceId: ws.id } });
          await tx.healthCheck.updateMany({ where: { workspaceId: existing.id }, data: { workspaceId: ws.id } });
          await tx.webhook.updateMany({ where: { workspaceId: existing.id }, data: { workspaceId: ws.id } });
          await tx.domain.updateMany({ where: { workspaceId: existing.id }, data: { workspaceId: ws.id } });
          await tx.backup.updateMany({ where: { workspaceId: existing.id }, data: { workspaceId: ws.id } });
          await tx.backupSchedule.updateMany({ where: { workspaceId: existing.id }, data: { workspaceId: ws.id } });
          await tx.stack.updateMany({ where: { workspaceId: existing.id }, data: { workspaceId: ws.id } });
          await tx.workspace.delete({ where: { id: existing.id } });
        }
        await tx.workspace.upsert({ where: { id: ws.id }, create: d, update: d });
        stats.workspaces++;
      }

      // 3. Workspace members
      for (const wm of data.workspaceMembers || []) {
        const d = { ...wm, joinedAt: new Date(wm.joinedAt) };
        await tx.workspaceMember.upsert({
          where: { userId_workspaceId: { userId: wm.userId, workspaceId: wm.workspaceId } },
          create: d,
          update: d,
        });
      }

      // 4. Servers
      for (const server of data.servers || []) {
        const d = {
          ...server,
          lastSeenAt: server.lastSeenAt ? new Date(server.lastSeenAt) : null,
          createdAt: new Date(server.createdAt),
          updatedAt: new Date(server.updatedAt),
        };
        await tx.server.upsert({ where: { id: server.id }, create: d, update: d });
        stats.servers++;
      }

      // 5. Agent tokens
      for (const at of data.agentTokens || []) {
        const d = { ...at, createdAt: new Date(at.createdAt) };
        await tx.agentToken.upsert({ where: { id: at.id }, create: d, update: d });
      }

      // 6. Containers
      for (const c of data.containers || []) {
        const d = { ...c, lastUpdatedAt: new Date(c.lastUpdatedAt), createdAt: new Date(c.createdAt) };
        await tx.container.upsert({
          where: { serverId_containerId: { serverId: c.serverId, containerId: c.containerId } },
          create: d,
          update: d,
        });
      }

      // 7. Vault groups + credentials
      for (const vg of data.vaultGroups || []) {
        const d = { ...vg, createdAt: new Date(vg.createdAt), updatedAt: new Date(vg.updatedAt) };
        await tx.vaultGroup.upsert({ where: { id: vg.id }, create: d, update: d });
      }
      for (const cred of data.credentials || []) {
        const d = { ...cred, createdAt: new Date(cred.createdAt), updatedAt: new Date(cred.updatedAt) };
        await tx.credential.upsert({ where: { id: cred.id }, create: d, update: d });
        stats.credentials++;
      }

      // 8. Health checks + pings
      for (const hc of data.healthChecks || []) {
        const d = {
          ...hc,
          sslExpiresAt: hc.sslExpiresAt ? new Date(hc.sslExpiresAt) : null,
          lastCheckedAt: hc.lastCheckedAt ? new Date(hc.lastCheckedAt) : null,
          createdAt: new Date(hc.createdAt),
          updatedAt: new Date(hc.updatedAt),
        };
        await tx.healthCheck.upsert({ where: { id: hc.id }, create: d, update: d });
        stats.healthChecks++;
      }
      for (const ping of data.pings || []) {
        const d = { ...ping, checkedAt: new Date(ping.checkedAt) };
        await tx.ping.upsert({ where: { id: ping.id }, create: d, update: d });
      }

      // 9. Webhooks
      for (const wh of data.webhooks || []) {
        const d = { ...wh, createdAt: new Date(wh.createdAt), updatedAt: new Date(wh.updatedAt) };
        await tx.webhook.upsert({ where: { id: wh.id }, create: d, update: d });
        stats.webhooks++;
      }

      // 10. Domains
      for (const d of data.domains || []) {
        const dd = { ...d, createdAt: new Date(d.createdAt), updatedAt: new Date(d.updatedAt) };
        await tx.domain.upsert({ where: { domain: d.domain }, create: dd, update: dd });
        stats.domains++;
      }

      // 11. Backups (metadata only)
      for (const b of data.backups || []) {
        const d = { ...b, createdAt: new Date(b.createdAt), completedAt: b.completedAt ? new Date(b.completedAt) : null };
        await tx.backup.upsert({ where: { id: b.id }, create: d, update: d });
      }

      // 12. Backup schedules
      for (const bs of data.backupSchedules || []) {
        const d = {
          ...bs,
          lastRunAt: bs.lastRunAt ? new Date(bs.lastRunAt) : null,
          createdAt: new Date(bs.createdAt),
          updatedAt: new Date(bs.updatedAt),
        };
        await tx.backupSchedule.upsert({ where: { id: bs.id }, create: d, update: d });
        stats.backupSchedules++;
      }

      // 13. Stacks
      for (const s of data.stacks || []) {
        const d = { ...s, createdAt: new Date(s.createdAt), updatedAt: new Date(s.updatedAt) };
        await tx.stack.upsert({ where: { id: s.id }, create: d, update: d });
        stats.stacks++;
      }

      // 14. Metrics (bulk)
      const newMetrics = (data.metrics || []).map((m: any) => ({ ...m, collectedAt: new Date(m.collectedAt) }));
      if (newMetrics.length > 0) {
        await tx.metric.createMany({ data: newMetrics, skipDuplicates: true });
      }
    });

    res.json({ success: true, stats });
  } catch (err: any) {
    console.error("[Platform Export] Import failed:", err.message);
    res.status(500).json({ error: `Import failed: ${err.message}` });
  }
});

export default router;
