const fs = require("fs");
const path = require("path");

/**
 * Auto-Healer Module:
 * 1. autoHealRetry: Wraps operations with exponential backoff, jitter, and automatic recovery
 * 2. repairStateFile: Validates, repairs, or recreates corrupted JSON state files
 * 3. setupProcessGuard: Installs unhandled rejection/exception crash guards
 */

// Exponential backoff retry wrapper
async function autoHealRetry(operation, {
  maxRetries = 3,
  initialDelayMs = 2000,
  backoffFactor = 2,
  operationName = "Operation",
  onRetry = null,
} = {}) {
  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt <= maxRetries) {
    try {
      return await operation();
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) {
        console.error(`[Auto-Healer] ❌ ${operationName} failed after ${maxRetries} retries:`, err.message);
        throw err;
      }

      const jitter = Math.floor(Math.random() * 500);
      const waitTime = delay + jitter;
      console.warn(`[Auto-Healer] ⚠️ ${operationName} failed (attempt ${attempt}/${maxRetries}): ${err.message}. Auto-healing in ${waitTime}ms...`);

      if (onRetry) onRetry(err, attempt, waitTime);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      delay *= backoffFactor;
    }
  }
}

// Safely loads or reconstructs JSON state file
function repairStateFile(filePath, defaultState) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(filePath)) {
      console.log(`[Auto-Healer] State file '${filePath}' not found. Initializing with defaults.`);
      fs.writeFileSync(filePath, JSON.stringify(defaultState, null, 2), "utf8");
      return defaultState;
    }

    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) {
      console.warn(`[Auto-Healer] State file '${filePath}' is empty. Healing with defaults.`);
      fs.writeFileSync(filePath, JSON.stringify(defaultState, null, 2), "utf8");
      return defaultState;
    }

    const parsed = JSON.parse(raw);
    // Ensure all default keys exist
    const merged = { ...defaultState, ...parsed };
    return merged;
  } catch (err) {
    console.error(`[Auto-Healer] Corrupted state in '${filePath}' (${err.message}). Self-repairing...`);
    const backupPath = `${filePath}.corrupt.${Date.now()}`;
    try {
      fs.copyFileSync(filePath, backupPath);
      console.log(`[Auto-Healer] Corrupted file backed up to '${backupPath}'`);
    } catch (_) {}
    fs.writeFileSync(filePath, JSON.stringify(defaultState, null, 2), "utf8");
    return defaultState;
  }
}

// Safely saves state file with atomic write
function saveStateFile(filePath, state) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`[Auto-Healer] Error saving state file '${filePath}':`, err.message);
  }
}

// Process-level crash prevention guard
function setupProcessGuard() {
  process.on("unhandledRejection", (reason, promise) => {
    console.error("[Auto-Healer Process Guard] ⚠️ Unhandled Promise Rejection:", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("[Auto-Healer Process Guard] 🚨 Uncaught Exception:", error);
  });
}

module.exports = {
  autoHealRetry,
  repairStateFile,
  saveStateFile,
  setupProcessGuard,
};
