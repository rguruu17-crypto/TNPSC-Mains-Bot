const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * Supervisor / Watchdog for TNPSC Mains Bot
 * Auto-heals by continuously supervising `index.js`.
 * Automatically restarts the bot if it crashes or terminates.
 */

const LOGS_DIR = path.join(__dirname, "logs");
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
const LOG_FILE = path.join(LOGS_DIR, "supervisor.log");

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(LOG_FILE, line);
}

let restartCount = 0;
let lastRestartTime = Date.now();

function startBot() {
  log("🚀 [Supervisor] Spawning TNPSC Mains Bot (node index.js)...");

  const child = spawn("node", ["index.js"], {
    cwd: __dirname,
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    const uptimeSec = Math.round((Date.now() - lastRestartTime) / 1000);
    log(`⚠️ [Supervisor] Bot process exited with code=${code}, signal=${signal} (uptime: ${uptimeSec}s)`);

    // Reset restart count if it was running for more than 5 minutes
    if (uptimeSec > 300) {
      restartCount = 0;
    }

    restartCount++;
    lastRestartTime = Date.now();

    const delay = Math.min(30000, 2000 * Math.pow(1.5, restartCount - 1));
    log(`🔄 [Auto-Healer Supervisor] Auto-restarting bot in ${Math.round(delay / 1000)}s (Restart #${restartCount})...`);

    setTimeout(startBot, delay);
  });

  child.on("error", (err) => {
    log(`🚨 [Supervisor] Failed to start bot process: ${err.message}`);
  });
}

log("🛡️ [Supervisor] Starting TNPSC Mains Bot Watchdog with Auto-Healing Process Recovery...");
startBot();
