import { spawn, spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import { fileURLToPath } from "node:url";
import net from "node:net";
import path from "node:path";

const host = "127.0.0.1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const providerRoot = path.join(repoRoot, "apps", "provider-web");
const playwrightCli = path.join(
  repoRoot,
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);
const nextCli = path.join(
  providerRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const generatedConfigPaths = [
  path.join(providerRoot, "next-env.d.ts"),
  path.join(providerRoot, "tsconfig.json"),
];

function reserveAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate an isolated provider port."));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

function canConnect(port) {
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

function canRequest(port) {
  return new Promise((resolve) => {
    const request = http.get(
      { host, port, path: "/", timeout: 1_000 },
      (response) => {
        response.resume();
        resolve(true);
      },
    );
    request.once("timeout", () => request.destroy());
    request.once("error", () => resolve(false));
  });
}

async function waitForServerReady(child, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canRequest(port)) return;
    if (child.exitCode !== null) {
      throw new Error(
        `Provider server exited with code ${child.exitCode} before becoming ready.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Provider server was not ready within ${timeoutMs}ms.`);
}

async function waitForPortClosed(port, timeoutMs) {
  if (process.platform === "win32") {
    throw new Error("Windows teardown requires owned listener process IDs.");
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await canConnect(port))) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (await canConnect(port)) {
    throw new Error(`Isolated provider port ${port} did not close.`);
  }
}

function terminateProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 10_000,
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function getListeningProcessIds(port) {
  if (process.platform !== "win32") return [];
  const result = spawnSync("netstat.exe", ["-ano", "-p", "tcp"], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const detail =
      result.error?.message || result.stderr?.trim() || `exit ${result.status}`;
    throw new Error(`Could not inspect isolated provider listener: ${detail}`);
  }
  const listenerPattern = new RegExp(
    `^\\s*TCP\\s+\\S+:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`,
    "gim",
  );
  return [
    ...new Set(
      [...result.stdout.matchAll(listenerPattern)].map((match) =>
        Number(match[1]),
      ),
    ),
  ];
}

function getWindowsListeningProcessIds(port) {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$Port = [int]$env:LOOP_A_PORT_TO_CHECK; $Listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue); foreach ($Listener in $Listeners) { [Console]::Out.WriteLine($Listener.OwningProcess) }; exit 0",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, LOOP_A_PORT_TO_CHECK: String(port) },
      timeout: 10_000,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0) {
    const detail =
      result.error?.message || result.stderr?.trim() || `exit ${result.status}`;
    throw new Error(`Could not inspect isolated provider listener: ${detail}`);
  }
  return [...new Set((result.stdout.match(/^\d+$/gm) ?? []).map(Number))];
}

async function waitForWindowsListenerClosed(
  port,
  ownedListenerProcessIds,
  timeoutMs,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const listenerProcessIds = getWindowsListeningProcessIds(port);
    if (listenerProcessIds.length === 0) return;

    const unexpectedProcessIds = listenerProcessIds.filter(
      (processId) => !ownedListenerProcessIds.includes(processId),
    );
    if (unexpectedProcessIds.length > 0) {
      throw new Error(
        `Isolated provider port ${port} is now owned by unexpected process IDs: ${unexpectedProcessIds.join(", ")}.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const listenerProcessIds = getWindowsListeningProcessIds(port);
  if (listenerProcessIds.length === 0) return;
  const unexpectedProcessIds = listenerProcessIds.filter(
    (processId) => !ownedListenerProcessIds.includes(processId),
  );
  if (unexpectedProcessIds.length > 0) {
    throw new Error(
      `Isolated provider port ${port} is now owned by unexpected process IDs: ${unexpectedProcessIds.join(", ")}.`,
    );
  }
  throw new Error(
    `Owned isolated provider listener process IDs ${listenerProcessIds.join(", ")} persisted for ${timeoutMs}ms.`,
  );
}

function terminateWindowsProcessIds(processIds) {
  for (const processId of processIds) {
    spawnSync("taskkill", ["/PID", String(processId), "/T", "/F"], {
      stdio: "ignore",
      timeout: 10_000,
      windowsHide: true,
    });
  }
}

function waitForExit(child, timeoutMs, label) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      terminateProcessTree(child);
      reject(new Error(`${label} exceeded ${timeoutMs}ms.`));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (signal) {
        reject(new Error(`${label} exited via ${signal}.`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, "\n");
}

async function restoreGeneratedConfig(filePath, original, isolatedDistDir) {
  const current = await readFile(filePath, "utf8");
  if (current === original) return;
  if (normalizeLineEndings(current) === normalizeLineEndings(original)) {
    await writeFile(filePath, original);
    return;
  }

  if (path.basename(filePath) === "next-env.d.ts") {
    const originalRouteReference = original.match(
      /^\/\/\/ <reference path="\.\/.+?\/types\/routes\.d\.ts" \/>$/m,
    )?.[0];
    const isolatedRouteReference = `/// <reference path="./${isolatedDistDir}/types/routes.d.ts" />`;
    if (
      originalRouteReference &&
      normalizeLineEndings(
        current.replace(isolatedRouteReference, originalRouteReference),
      ) === normalizeLineEndings(original)
    ) {
      await writeFile(filePath, original);
      return;
    }
  } else {
    const originalConfig = JSON.parse(original);
    const currentConfig = JSON.parse(current);
    const generatedInclude = `${isolatedDistDir}/types/**/*.ts`;
    currentConfig.include = currentConfig.include?.filter(
      (entry) => entry !== generatedInclude,
    );
    if (JSON.stringify(currentConfig) === JSON.stringify(originalConfig)) {
      await writeFile(filePath, original);
      return;
    }
  }

  throw new Error(
    `Refusing to overwrite concurrent changes in ${path.relative(repoRoot, filePath)}.`,
  );
}

function removeIsolatedOutput(outputPath) {
  const timeout = 35_000;
  const result =
    process.platform === "win32"
      ? spawnSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$Target = $env:LOOP_A_CLEANUP_TARGET; $Deadline = [DateTime]::UtcNow.AddSeconds(30); do { if (-not (Test-Path -LiteralPath $Target)) { exit 0 }; try { Remove-Item -LiteralPath $Target -Recurse -Force -ErrorAction Stop } catch { $LastError = $_.Exception.Message }; if (-not (Test-Path -LiteralPath $Target)) { exit 0 }; Start-Sleep -Milliseconds 200 } while ([DateTime]::UtcNow -lt $Deadline); throw \"Cleanup failed for ${Target}: ${LastError}\"",
          ],
          {
            encoding: "utf8",
            env: { ...process.env, LOOP_A_CLEANUP_TARGET: outputPath },
            timeout,
            windowsHide: true,
          },
        )
      : spawnSync("rm", ["-rf", "--", outputPath], {
          encoding: "utf8",
          timeout,
        });

  if (result.error || result.status !== 0) {
    const detail =
      result.error?.message || result.stderr?.trim() || `exit ${result.status}`;
    throw new Error(`Bounded cleanup failed for ${outputPath}: ${detail}`);
  }
}

let exitCode = 1;
let port;
let isolatedDistDir;
let providerServer;
let ownedListenerProcessIds = [];
const originalGeneratedConfigs = new Map(
  await Promise.all(
    generatedConfigPaths.map(async (filePath) => [
      filePath,
      await readFile(filePath, "utf8"),
    ]),
  ),
);

try {
  port = await reserveAvailablePort();
  isolatedDistDir = `.next-loop-a-${process.pid}-${port}`;
  console.log(
    `[loop-a] Starting an isolated provider server on ${host}:${port}.`,
  );

  providerServer = spawn(
    process.execPath,
    [nextCli, "dev", "--hostname", host, "--port", String(port)],
    {
      cwd: providerRoot,
      detached: process.platform !== "win32",
      env: { ...process.env, NEXT_DIST_DIR: isolatedDistDir },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  await waitForServerReady(providerServer, port, 180_000);
  ownedListenerProcessIds = getListeningProcessIds(port);
  if (process.platform === "win32" && ownedListenerProcessIds.length === 0) {
    throw new Error("Could not identify the isolated provider listener process.");
  }
  console.log(`[loop-a] Provider server ready on ${host}:${port}.`);

  const playwright = spawn(
    process.execPath,
    [playwrightCli, "test", "--config=e2e/playwright.loop-a.config.ts"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        LOOP_A_PORT: String(port),
      },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  exitCode = await waitForExit(playwright, 180_000, "Playwright");
} catch (error) {
  console.error(`[loop-a] ${error instanceof Error ? error.message : error}`);
} finally {
  if (providerServer) {
    terminateProcessTree(providerServer);
    if (process.platform === "win32") {
      const activeOwnedProcessIds = getListeningProcessIds(port).filter((id) =>
        ownedListenerProcessIds.includes(id),
      );
      terminateWindowsProcessIds(activeOwnedProcessIds);
    }
    providerServer.unref();
    try {
      // taskkill may not produce a child exit event on Windows. On Windows,
      // no listener on our private port is the teardown completion condition.
      if (port && process.platform === "win32") {
        await waitForWindowsListenerClosed(
          port,
          ownedListenerProcessIds,
          90_000,
        );
      } else if (port) {
        await waitForPortClosed(port, 30_000);
      }
    } catch (error) {
      console.error(`[loop-a] ${error instanceof Error ? error.message : error}`);
      exitCode = 1;
    }
  }

  if (isolatedDistDir) {
    const outputPath = path.resolve(providerRoot, isolatedDistDir);
    const relativeOutputPath = path.relative(providerRoot, outputPath);
    if (
      relativeOutputPath !== isolatedDistDir ||
      !/^\.next-loop-a-\d+-\d+$/.test(isolatedDistDir)
    ) {
      console.error(`[loop-a] Refusing to clean unexpected path ${outputPath}.`);
      exitCode = 1;
    } else {
      try {
        removeIsolatedOutput(outputPath);
      } catch (error) {
        console.error(
          `[loop-a] Failed to clean ${outputPath}: ${error instanceof Error ? error.message : error}`,
        );
        exitCode = 1;
      }
    }

    for (const [filePath, original] of originalGeneratedConfigs) {
      try {
        await restoreGeneratedConfig(filePath, original, isolatedDistDir);
      } catch (error) {
        console.error(
          `[loop-a] ${error instanceof Error ? error.message : error}`,
        );
        exitCode = 1;
      }
    }
  }
}

process.exitCode = exitCode;
