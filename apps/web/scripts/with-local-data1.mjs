import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const webDirectory = path.resolve(scriptDirectory, "..");
const workspaceDirectory = path.resolve(webDirectory, "..", "..");
const isWindows = process.platform === "win32";

function executable(directory, name) {
  return path.join(directory, `${name}${isWindows ? ".cmd" : ""}`);
}

function localEnvironment() {
  const environment = { ...process.env };
  if (isWindows && environment.LOCALAPPDATA) {
    const dockerDirectory = path.join(
      environment.LOCALAPPDATA,
      "Programs",
      "DockerDesktop",
      "resources",
      "bin",
    );
    if (fs.existsSync(dockerDirectory)) {
      const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === "path") ?? "PATH";
      environment[pathKey] = `${dockerDirectory}${path.delimiter}${environment[pathKey] ?? ""}`;
    }
  }
  return environment;
}

function localDatabaseUrl(environment) {
  const supabase = executable(path.join(workspaceDirectory, "node_modules", ".bin"), "supabase");
  const result = spawnSync(supabase, ["status", "-o", "env"], {
    cwd: workspaceDirectory,
    env: environment,
    encoding: "utf8",
    shell: isWindows,
  });
  if (result.status !== 0) {
    throw new Error("PostgreSQL locale IQstatS non disponibile.");
  }
  const line = result.stdout
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith("DB_URL="));
  const value = line?.slice("DB_URL=".length).trim().replace(/^['"]|['"]$/gu, "");
  if (!value) throw new Error("Connessione PostgreSQL locale IQstatS non disponibile.");

  const url = new URL(value);
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!loopbackHosts.has(url.hostname)) {
    throw new Error("La CLI locale ha restituito una connessione non locale.");
  }
  return value;
}

function commandFor(mode) {
  if (mode === "dev") {
    return {
      command: executable(path.join(webDirectory, "node_modules", ".bin"), "next"),
      args: ["dev", ...process.argv.slice(3)],
    };
  }
  if (mode === "test") {
    return {
      command: process.execPath,
      args: [
        "--conditions=react-server",
        "--experimental-strip-types",
        "--test",
        "test/iqstats-database-integration.test.ts",
      ],
    };
  }
  throw new Error("Modalità locale DATA-1 non valida.");
}

try {
  const environment = localEnvironment();
  environment.IQSTATS_DATABASE_URL = localDatabaseUrl(environment);
  environment.IQSTATS_ALLOW_REMOTE_DATABASE = "false";
  const { command, args } = commandFor(process.argv[2]);
  const child = spawn(command, args, {
    cwd: webDirectory,
    env: environment,
    stdio: "inherit",
    shell: isWindows && command.toLowerCase().endsWith(".cmd"),
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
  child.on("error", () => {
    process.stderr.write("Avvio locale DATA-1 non riuscito.\n");
    process.exitCode = 1;
  });
} catch (reason) {
  const message = reason instanceof Error ? reason.message : "Avvio locale DATA-1 non riuscito.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
