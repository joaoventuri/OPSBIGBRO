import { Router, Request, Response } from "express";
import { Client as SSHClient } from "ssh2";
import { prisma } from "../../config/db";
import { z } from "zod";
import { backupQueue, startBackupWorker } from "./worker";

const router = Router();

// ─── SSH helper ─────────────────────────────────────────────

function sshExec(server: any, cmd: string, timeout = 60000): Promise<string> {
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

// ─── List backups ───────────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  const backups = await prisma.backup.findMany({
    where: { workspaceId: req.auth!.workspaceId },
    orderBy: { createdAt: "desc" },
  });
  res.json(backups);
});

// ─── Create backup (export) ─────────────────────────────────
//
// The .opsbigbro file format:
//   /manifest.json        → metadata, container configs, networks
//   /volumes/<name>.tar   → each volume tarball
//
// Everything packed into a single .tar.gz renamed to .opsbigbro

const exportSchema = z.object({
  name: z.string().min(1),
  serverId: z.string().uuid(),
  containerNames: z.array(z.string()).min(1),
  type: z.enum(["single", "stack"]).default("single"),
});

router.post("/export", async (req: Request, res: Response) => {
  const data = exportSchema.parse(req.body);

  const server = await prisma.server.findFirst({
    where: { id: data.serverId, workspaceId: req.auth!.workspaceId, hasDocker: true },
  });
  if (!server) return res.status(404).json({ error: "Server not found or Docker not enabled" });

  // Create backup record
  const backup = await prisma.backup.create({
    data: {
      name: data.name,
      type: data.type,
      containerIds: data.containerNames,
      serverId: server.id,
      serverName: server.name,
      status: "running",
      workspaceId: req.auth!.workspaceId,
    },
  });

  // Run backup in background
  runExport(backup.id, server, data.containerNames).catch(async (err) => {
    await prisma.backup.update({
      where: { id: backup.id },
      data: { status: "failed", error: err.message },
    });
  });

  res.status(201).json(backup);
});

async function runExport(backupId: string, server: any, containerNames: string[]) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = `/opt/obb-backups/${backupId}`;
  const outputFile = `/opt/obb-backups/${backupId}.opsbigbro`;

  try {
    await sshExec(server, `mkdir -p ${backupDir}/volumes`);

    // Inspect all containers and build manifest
    const manifest: any = {
      version: "1.0",
      createdAt: new Date().toISOString(),
      source: { server: server.name, host: server.host },
      containers: [],
      networks: [],
    };

    for (const name of containerNames) {
      // Get full container inspect
      const inspect = await sshExec(server,
        `docker inspect ${name} 2>&1`);

      let containerData: any;
      try {
        containerData = JSON.parse(inspect)[0];
      } catch {
        throw new Error(`Container "${name}" not found or inspect failed`);
      }

      const config = containerData.Config || {};
      const hostConfig = containerData.HostConfig || {};
      const networkSettings = containerData.NetworkSettings || {};

      // Extract useful config
      const containerManifest: any = {
        name: containerData.Name?.replace(/^\//, "") || name,
        image: config.Image,
        env: config.Env || [],
        cmd: config.Cmd,
        entrypoint: config.Entrypoint,
        workingDir: config.WorkingDir,
        labels: config.Labels || {},
        ports: {},
        volumes: [],
        binds: hostConfig.Binds || [],
        restartPolicy: hostConfig.RestartPolicy?.Name || "no",
        networkMode: hostConfig.NetworkMode || "bridge",
        networks: Object.keys(networkSettings.Networks || {}),
      };

      // Port mappings
      const portBindings = hostConfig.PortBindings || {};
      for (const [containerPort, bindings] of Object.entries(portBindings)) {
        if (Array.isArray(bindings) && bindings.length > 0) {
          containerManifest.ports[containerPort] = (bindings as any[]).map(b => b.HostPort);
        }
      }

      // Backup named volumes
      const mounts = containerData.Mounts || [];
      for (const mount of mounts) {
        if (mount.Type === "volume" && mount.Name) {
          const volName = mount.Name;
          containerManifest.volumes.push({
            name: volName,
            destination: mount.Destination,
            driver: mount.Driver || "local",
          });

          // Export volume to tar
          await sshExec(server,
            `docker run --rm -v ${volName}:/data -v ${backupDir}/volumes:/backup alpine tar cf /backup/${volName}.tar -C /data . 2>&1`,
            120000);
        }
      }

      manifest.containers.push(containerManifest);
    }

    // Discover shared networks
    const networkSet = new Set<string>();
    for (const c of manifest.containers) {
      for (const n of c.networks) {
        if (!["bridge", "host", "none"].includes(n)) networkSet.add(n);
      }
    }
    manifest.networks = Array.from(networkSet);

    // Write manifest
    await sshExec(server, `cat > ${backupDir}/manifest.json << 'MEOF'
${JSON.stringify(manifest, null, 2)}
MEOF`);

    // Pack into .opsbigbro (tar.gz)
    await sshExec(server,
      `cd ${backupDir} && tar czf ${outputFile} manifest.json volumes/ 2>&1`,
      120000);

    // Get file size
    const sizeOut = await sshExec(server, `du -sm ${outputFile} | awk '{print $1}'`);
    const sizeMb = parseFloat(sizeOut) || 0;

    // Cleanup temp dir
    await sshExec(server, `rm -rf ${backupDir}`);

    // Update backup record
    await prisma.backup.update({
      where: { id: backupId },
      data: {
        status: "completed",
        fileName: outputFile,
        fileSizeMb: sizeMb,
        metadata: JSON.stringify(manifest),
        completedAt: new Date(),
      },
    });
  } catch (err: any) {
    await sshExec(server, `rm -rf ${backupDir} ${outputFile}`).catch(() => {});
    throw err;
  }
}

// ─── Download backup ────────────────────────────────────────

router.get("/download/:id", async (req: Request, res: Response) => {
  const backup = await prisma.backup.findFirst({
    where: { id: req.params.id, workspaceId: req.auth!.workspaceId, status: "completed" },
  });
  if (!backup || !backup.fileName) return res.status(404).json({ error: "Backup not found" });

  const server = await prisma.server.findUnique({ where: { id: backup.serverId } });
  if (!server) return res.status(404).json({ error: "Source server not found" });

  // Stream file from remote via SSH
  const ssh = new SSHClient();
  ssh.on("ready", () => {
    ssh.exec(`cat "${backup.fileName}"`, (err, stream) => {
      if (err) { res.status(500).json({ error: err.message }); ssh.end(); return; }
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${backup.name}.opsbigbro"`);
      if (backup.fileSizeMb) res.setHeader("Content-Length", String(Math.round(backup.fileSizeMb * 1024 * 1024)));
      stream.pipe(res);
      stream.on("close", () => ssh.end());
    });
  });
  ssh.on("error", (err) => res.status(500).json({ error: err.message }));
  const cfg: any = { host: server.host, port: server.port, username: server.username, readyTimeout: 10000 };
  if (server.authType === "key" && server.privateKey) cfg.privateKey = server.privateKey;
  else cfg.password = server.password;
  ssh.connect(cfg);
});

// ─── Import backup (restore) ────────────────────────────────

const importSchema = z.object({
  backupId: z.string().uuid(),
  targetServerId: z.string().uuid(),
});

router.post("/import", async (req: Request, res: Response) => {
  const { backupId, targetServerId } = importSchema.parse(req.body);

  const backup = await prisma.backup.findFirst({
    where: { id: backupId, workspaceId: req.auth!.workspaceId, status: "completed" },
  });
  if (!backup || !backup.metadata) return res.status(404).json({ error: "Backup not found" });

  const sourceServer = await prisma.server.findUnique({ where: { id: backup.serverId } });
  const targetServer = await prisma.server.findFirst({
    where: { id: targetServerId, workspaceId: req.auth!.workspaceId, hasDocker: true },
  });
  if (!sourceServer) return res.status(404).json({ error: "Source server not found" });
  if (!targetServer) return res.status(404).json({ error: "Target server not found" });

  try {
    const manifest = JSON.parse(backup.metadata);
    const restoreDir = `/opt/obb-backups/restore-${backup.id}`;

    // If same server, just use local file. Otherwise, SCP between servers.
    if (sourceServer.id === targetServer.id) {
      await sshExec(targetServer, `mkdir -p ${restoreDir} && cd ${restoreDir} && tar xzf ${backup.fileName}`);
    } else {
      // Download from source, upload to target (via our backend as relay)
      // For simplicity, use scp-like approach: source cat -> target write
      return res.status(501).json({
        error: "Cross-server restore not yet supported. Download the backup and upload it manually, or restore on the same server."
      });
    }

    // Create networks
    for (const network of manifest.networks || []) {
      await sshExec(targetServer, `docker network create ${network} 2>/dev/null || true`);
    }

    // Restore volumes
    for (const container of manifest.containers) {
      for (const vol of container.volumes || []) {
        await sshExec(targetServer,
          `docker volume create ${vol.name} 2>/dev/null || true`);
        await sshExec(targetServer,
          `docker run --rm -v ${vol.name}:/data -v ${restoreDir}/volumes:/backup alpine sh -c "cd /data && tar xf /backup/${vol.name}.tar" 2>&1`,
          120000);
      }
    }

    // Recreate containers
    const createdContainers: string[] = [];
    for (const c of manifest.containers) {
      // Remove existing container with same name
      await sshExec(targetServer, `docker rm -f ${c.name} 2>/dev/null || true`);

      let cmd = `docker run -d --name "${c.name}"`;
      cmd += ` --restart=${c.restartPolicy || "unless-stopped"}`;

      // Networks
      if (c.networks?.length > 0 && !["bridge", "host", "none"].includes(c.networks[0])) {
        cmd += ` --network=${c.networks[0]}`;
      }

      // Ports
      for (const [containerPort, hostPorts] of Object.entries(c.ports || {})) {
        for (const hp of (hostPorts as string[])) {
          cmd += ` -p ${hp}:${containerPort.split("/")[0]}`;
        }
      }

      // Env vars
      for (const env of c.env || []) {
        cmd += ` -e "${env}"`;
      }

      // Volumes
      for (const vol of c.volumes || []) {
        cmd += ` -v ${vol.name}:${vol.destination}`;
      }

      // Bind mounts
      for (const bind of c.binds || []) {
        cmd += ` -v "${bind}"`;
      }

      cmd += ` ${c.image}`;
      if (c.cmd && c.cmd.length > 0 && !c.entrypoint) {
        cmd += ` ${c.cmd.join(" ")}`;
      }

      await sshExec(targetServer, cmd + " 2>&1", 120000);
      createdContainers.push(c.name);

      // Connect to additional networks
      for (const net of (c.networks || []).slice(1)) {
        if (!["bridge", "host", "none"].includes(net)) {
          await sshExec(targetServer, `docker network connect ${net} ${c.name} 2>/dev/null || true`);
        }
      }
    }

    // Cleanup
    await sshExec(targetServer, `rm -rf ${restoreDir}`);

    res.json({
      success: true,
      restored: createdContainers.length,
      containers: createdContainers,
      message: `Restored ${createdContainers.length} container(s) from "${backup.name}"`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete backup ──────────────────────────────────────────

router.delete("/:id", async (req: Request, res: Response) => {
  const backup = await prisma.backup.findFirst({
    where: { id: req.params.id, workspaceId: req.auth!.workspaceId },
  });
  if (!backup) return res.status(404).json({ error: "Not found" });

  // Delete file from server
  if (backup.fileName) {
    try {
      const server = await prisma.server.findUnique({ where: { id: backup.serverId } });
      if (server) await sshExec(server, `rm -f "${backup.fileName}"`);
    } catch { /* ignore */ }
  }

  await prisma.backup.delete({ where: { id: backup.id } });
  res.json({ success: true });
});

// ─── Scheduled backups ──────────────────────────────────────

const scheduleSchema = z.object({
  name: z.string().min(1),
  cron: z.string().min(5),
  containerIds: z.array(z.string()).min(1),
  serverId: z.string().uuid(),
  keepLast: z.number().int().min(1).default(5),
});

router.get("/schedules", async (req: Request, res: Response) => {
  const schedules = await prisma.backupSchedule.findMany({
    where: { workspaceId: req.auth!.workspaceId },
    orderBy: { createdAt: "desc" },
  });
  res.json(schedules);
});

router.post("/schedules", async (req: Request, res: Response) => {
  const data = scheduleSchema.parse(req.body);
  const schedule = await prisma.backupSchedule.create({
    data: { ...data, workspaceId: req.auth!.workspaceId },
  });

  // Register in BullMQ
  await backupQueue.upsertJobScheduler(
    `backup-${schedule.id}`,
    { pattern: schedule.cron },
    { name: "scheduled-backup", data: { scheduleId: schedule.id } }
  );

  res.status(201).json(schedule);
});

router.delete("/schedules/:id", async (req: Request, res: Response) => {
  await backupQueue.removeJobScheduler(`backup-${req.params.id}`);
  await prisma.backupSchedule.deleteMany({
    where: { id: req.params.id, workspaceId: req.auth!.workspaceId },
  });
  res.json({ success: true });
});

router.put("/schedules/:id/toggle", async (req: Request, res: Response) => {
  const schedule = await prisma.backupSchedule.findFirst({
    where: { id: req.params.id, workspaceId: req.auth!.workspaceId },
  });
  if (!schedule) return res.status(404).json({ error: "Not found" });

  const newState = !schedule.enabled;
  await prisma.backupSchedule.update({ where: { id: schedule.id }, data: { enabled: newState } });

  if (newState) {
    await backupQueue.upsertJobScheduler(
      `backup-${schedule.id}`,
      { pattern: schedule.cron },
      { name: "scheduled-backup", data: { scheduleId: schedule.id } }
    );
  } else {
    await backupQueue.removeJobScheduler(`backup-${schedule.id}`);
  }

  res.json({ success: true, enabled: newState });
});

export default router;
