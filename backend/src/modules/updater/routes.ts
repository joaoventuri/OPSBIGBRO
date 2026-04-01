import { Router, Request, Response } from "express";
import { execSync, exec } from "child_process";
import * as fs from "fs";

const router = Router();
const REPO_DIR = "/opt/serverless";

// ─── Check for updates ─────────────────────────────────────

router.get("/check", async (_req: Request, res: Response) => {
  try {
    execSync(`test -d "${REPO_DIR}/.git"`, { stdio: "pipe" });

    // Get default branch name
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: REPO_DIR, stdio: "pipe" }).toString().trim();
    execSync(`git fetch origin ${branch}`, { cwd: REPO_DIR, timeout: 15000, stdio: "pipe" });

    const local = execSync("git rev-parse HEAD", { cwd: REPO_DIR, stdio: "pipe" }).toString().trim();
    const remote = execSync(`git rev-parse origin/${branch}`, { cwd: REPO_DIR, stdio: "pipe" }).toString().trim();

    if (local === remote) {
      return res.json({ updateAvailable: false, current: local.slice(0, 7) });
    }

    const behindOutput = execSync(`git rev-list --count HEAD..origin/${branch}`, { cwd: REPO_DIR, stdio: "pipe" }).toString().trim();
    const commits = parseInt(behindOutput, 10) || 0;

    if (commits === 0) {
      return res.json({ updateAvailable: false, current: local.slice(0, 7) });
    }

    res.json({
      updateAvailable: true,
      current: local.slice(0, 7),
      latest: remote.slice(0, 7),
      commits,
    });
  } catch {
    res.json({ updateAvailable: false });
  }
});

// ─── Trigger update ─────────────────────────────────────────

router.post("/apply", async (_req: Request, res: Response) => {
  try {
    // Write a one-shot update script that runs independently of the backend
    const script = `#!/bin/bash
LOG="/var/log/serverless-update.log"
log() { echo "[\$(date +'%Y-%m-%d %H:%M:%S')] \$1" >> "\$LOG"; }

cd ${REPO_DIR}
log "Update triggered from UI"

git pull origin master >> "\$LOG" 2>&1

cd ${REPO_DIR}/backend
npm install --omit=dev >> "\$LOG" 2>&1
npx prisma generate >> "\$LOG" 2>&1
npx prisma db push --skip-generate >> "\$LOG" 2>&1

cd ${REPO_DIR}/frontend
npm install >> "\$LOG" 2>&1

if npx next build >> "\$LOG" 2>&1; then
  log "Build successful, restarting services..."
  systemctl restart serverless-backend
  sleep 2
  systemctl restart serverless-frontend
  log "Update complete!"
else
  log "ERROR: Build failed, services NOT restarted"
fi

rm -f /tmp/serverless-update.sh
`;

    fs.writeFileSync("/tmp/serverless-update.sh", script, { mode: 0o755 });

    // Run completely detached via nohup so it survives backend restart
    exec("nohup bash /tmp/serverless-update.sh &", { cwd: REPO_DIR });

    res.json({ success: true, message: "Update started" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Update status (check if update is running) ────────────

router.get("/status", async (_req: Request, res: Response) => {
  const running = fs.existsSync("/tmp/serverless-update.sh");
  res.json({ updating: running });
});

export default router;
