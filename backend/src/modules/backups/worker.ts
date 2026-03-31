import { Queue, Worker } from "bullmq";
import { redis } from "../../config/redis";
import { prisma } from "../../config/db";
import { Client as SSHClient } from "ssh2";

export const backupQueue = new Queue("backups", { connection: redis });

function sshExec(server: any, cmd: string, timeout = 120000): Promise<string> {
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

export function startBackupWorker() {
  const worker = new Worker(
    "backups",
    async (job) => {
      if (job.name !== "scheduled-backup") return;

      const { scheduleId } = job.data;
      const schedule = await prisma.backupSchedule.findUnique({ where: { id: scheduleId } });
      if (!schedule || !schedule.enabled) return;

      const server = await prisma.server.findUnique({ where: { id: schedule.serverId } });
      if (!server) return;

      console.log(`[Backup] Running scheduled backup "${schedule.name}" on ${server.name}`);

      const backupId = crypto.randomUUID();
      const outputFile = `/opt/obb-backups/${backupId}.opsbigbro`;
      const backupDir = `/opt/obb-backups/${backupId}`;

      try {
        await sshExec(server, `mkdir -p ${backupDir}/volumes`);

        const manifest: any = {
          version: "1.0",
          createdAt: new Date().toISOString(),
          source: { server: server.name, host: server.host },
          containers: [],
          networks: [],
        };

        for (const name of schedule.containerIds) {
          const inspect = await sshExec(server, `docker inspect ${name} 2>&1`);
          let cd: any;
          try { cd = JSON.parse(inspect)[0]; } catch { continue; }

          const config = cd.Config || {};
          const hc = cd.HostConfig || {};
          const ns = cd.NetworkSettings || {};

          const cm: any = {
            name: cd.Name?.replace(/^\//, "") || name,
            image: config.Image,
            env: config.Env || [],
            cmd: config.Cmd,
            entrypoint: config.Entrypoint,
            labels: config.Labels || {},
            ports: {},
            volumes: [],
            binds: hc.Binds || [],
            restartPolicy: hc.RestartPolicy?.Name || "no",
            networks: Object.keys(ns.Networks || {}),
          };

          const pb = hc.PortBindings || {};
          for (const [cp, binds] of Object.entries(pb)) {
            if (Array.isArray(binds) && binds.length > 0) {
              cm.ports[cp] = (binds as any[]).map(b => b.HostPort);
            }
          }

          for (const mount of cd.Mounts || []) {
            if (mount.Type === "volume" && mount.Name) {
              cm.volumes.push({ name: mount.Name, destination: mount.Destination, driver: mount.Driver || "local" });
              await sshExec(server,
                `docker run --rm -v ${mount.Name}:/data -v ${backupDir}/volumes:/backup alpine tar cf /backup/${mount.Name}.tar -C /data .`,
                120000);
            }
          }

          manifest.containers.push(cm);
        }

        const networkSet = new Set<string>();
        for (const c of manifest.containers) {
          for (const n of c.networks) {
            if (!["bridge", "host", "none"].includes(n)) networkSet.add(n);
          }
        }
        manifest.networks = Array.from(networkSet);

        await sshExec(server, `cat > ${backupDir}/manifest.json << 'MEOF'\n${JSON.stringify(manifest, null, 2)}\nMEOF`);
        await sshExec(server, `cd ${backupDir} && tar czf ${outputFile} manifest.json volumes/`, 120000);
        const sizeOut = await sshExec(server, `du -sm ${outputFile} | awk '{print $1}'`);
        await sshExec(server, `rm -rf ${backupDir}`);

        // Save backup record
        await prisma.backup.create({
          data: {
            id: backupId,
            name: `${schedule.name} — ${new Date().toISOString().split("T")[0]}`,
            type: schedule.containerIds.length > 1 ? "stack" : "single",
            containerIds: schedule.containerIds,
            serverId: server.id,
            serverName: server.name,
            status: "completed",
            fileName: outputFile,
            fileSizeMb: parseFloat(sizeOut) || 0,
            metadata: JSON.stringify(manifest),
            completedAt: new Date(),
            workspaceId: schedule.workspaceId,
          },
        });

        // Update schedule
        await prisma.backupSchedule.update({
          where: { id: scheduleId },
          data: { lastRunAt: new Date() },
        });

        // Retention: delete old backups beyond keepLast
        const oldBackups = await prisma.backup.findMany({
          where: {
            workspaceId: schedule.workspaceId,
            serverId: server.id,
            containerIds: { equals: schedule.containerIds },
            status: "completed",
          },
          orderBy: { createdAt: "desc" },
          skip: schedule.keepLast,
        });

        for (const old of oldBackups) {
          if (old.fileName) {
            await sshExec(server, `rm -f "${old.fileName}"`).catch(() => {});
          }
          await prisma.backup.delete({ where: { id: old.id } });
        }

        console.log(`[Backup] Completed "${schedule.name}" — ${manifest.containers.length} container(s), ${sizeOut}MB`);
      } catch (err: any) {
        console.error(`[Backup] Failed "${schedule.name}":`, err.message);
        await prisma.backup.create({
          data: {
            id: backupId,
            name: `${schedule.name} — ${new Date().toISOString().split("T")[0]}`,
            type: "single",
            containerIds: schedule.containerIds,
            serverId: server.id,
            serverName: server.name,
            status: "failed",
            error: err.message,
            workspaceId: schedule.workspaceId,
          },
        });
        await sshExec(server, `rm -rf ${backupDir} ${outputFile}`).catch(() => {});
      }
    },
    { connection: redis, concurrency: 2 }
  );

  worker.on("failed", (job, err) => {
    console.error(`[Backup] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
