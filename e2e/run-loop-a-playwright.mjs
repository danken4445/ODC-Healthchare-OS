import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";
import path from "node:path";

const host = "127.0.0.1";
const port = 3001;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playwrightCli = path.join(
  repoRoot,
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);

function canConnect() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (available) => {
      socket.destroy();
      resolve(available);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function waitForPort(expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await canConnect()) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Timed out waiting for port ${port} to become ${expected ? "ready" : "closed"}.`,
  );
}

function terminateProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      terminateProcessTree(child);
      reject(new Error(`Process ${child.pid} exceeded ${timeoutMs}ms.`));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (signal) {
        reject(new Error(`Process ${child.pid} exited via ${signal}.`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

let providerServer;
let ownsProviderServer = false;
let exitCode = 1;

try {
  if (await canConnect()) {
    console.log(`[loop-a] Reusing the existing server on ${host}:${port}.`);
  } else {
    providerServer = spawn(
      "corepack pnpm --filter @odyssey/provider-web dev",
      [],
      {
        cwd: repoRoot,
        detached: process.platform !== "win32",
        env: process.env,
        shell: true,
        stdio: "inherit",
        windowsHide: true,
      },
    );
    ownsProviderServer = true;
    providerServer.unref();
    await waitForPort(true, 45_000);
    console.log(`[loop-a] Provider server ready on ${host}:${port}.`);
  }

  const playwright = spawn(
    process.execPath,
    [playwrightCli, "test", "--config=e2e/playwright.loop-a.config.ts"],
    {
      cwd: repoRoot,
      env: { ...process.env, LOOP_A_EXTERNAL_SERVER: "1" },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  exitCode = await waitForExit(playwright, 60_000);
} catch (error) {
  console.error(`[loop-a] ${error instanceof Error ? error.message : error}`);
} finally {
  if (ownsProviderServer) {
    terminateProcessTree(providerServer);
    try {
      await waitForPort(false, 5_000);
    } catch (error) {
      console.error(`[loop-a] ${error instanceof Error ? error.message : error}`);
      exitCode = 1;
    }
  }
}

process.exitCode = exitCode;
