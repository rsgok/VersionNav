import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const SECRET_KEY_PATTERN = /key|token|secret|password|credential|email|phone|transcript|message/i;
const ABSOLUTE_PATH_PATTERN = /^(\/|[A-Za-z]:\\)/;

function main() {
  const configPath = join(homedir(), ".openclaw", "openclaw.json");
  const rawConfig = readJson(configPath);
  const redactedConfig = redact(rawConfig);
  const updateStatus = runJson(["update", "status", "--json"]);
  const doctor = runText(["doctor", "--non-interactive"]);
  const version = readVersion(updateStatus);

  const profile = {
    productId: "openclaw",
    currentVersion: version,
    updateStatus: redact(updateStatus),
    doctorSummary: summarizeDoctor(doctor),
    os: platform(),
    defaultOpenClawConfigPath: existsSync(configPath),
    defaultOpenClawAgentsPath: existsSync(join(homedir(), ".openclaw", "agents")),
    enabledProviders: namesFrom(redactedConfig, ["providers", "provider"]),
    enabledPlugins: namesFrom(redactedConfig, ["plugins", "plugin"]),
    enabledChannels: namesFrom(redactedConfig, ["channels", "channel"]),
    enabledSkills: namesFrom(redactedConfig, ["skills", "skill"]),
    cronUsed: JSON.stringify(redactedConfig).toLowerCase().includes("cron"),
    redactedConfig
  };

  process.stdout.write(`${JSON.stringify(profile, null, 2)}\n`);
}

function runText(args: string[]): string {
  try {
    return execFileSync("openclaw", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    return "";
  }
}

function runJson(args: string[]): JsonValue | null {
  const text = runText(args);
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return null;
  }
}

function readVersion(updateStatus: JsonValue | null): string | undefined {
  const versionFromStatus = findFirstString(updateStatus, ["currentVersion", "version"]);
  if (versionFromStatus) {
    return versionFromStatus;
  }

  return runText(["--version"]).match(/\d{4}\.\d+\.\d+|v?\d+\.\d+\.\d+/)?.[0];
}

function readJson(path: string): JsonValue | null {
  if (!existsSync(path)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as JsonValue;
  } catch {
    return null;
  }
}

export function redact(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redact(nested)
      ])
    );
  }

  if (typeof value === "string") {
    if (SECRET_KEY_PATTERN.test(value) || ABSOLUTE_PATH_PATTERN.test(value)) {
      return "[redacted]";
    }
  }

  return value;
}

function namesFrom(value: JsonValue | null, keys: string[]): string[] {
  const names = new Set<string>();
  visit(value, (key, nested) => {
    if (!keys.some((candidate) => key.toLowerCase().includes(candidate))) {
      return;
    }

    if (Array.isArray(nested)) {
      for (const item of nested) {
        if (typeof item === "string") {
          names.add(item);
        } else if (item && typeof item === "object") {
          const name = findFirstString(item, ["name", "id", "type"]);
          if (name) {
            names.add(name);
          }
        }
      }
    }

    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      for (const nestedKey of Object.keys(nested)) {
        names.add(nestedKey);
      }
    }
  });

  return [...names].sort();
}

function summarizeDoctor(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /fail|warn|error|ok|pass/i.test(line))
    .slice(0, 30);
}

function findFirstString(value: JsonValue | null, keys: string[]): string | undefined {
  let found: string | undefined;
  visit(value, (key, nested) => {
    if (!found && keys.includes(key) && typeof nested === "string") {
      found = nested;
    }
  });
  return found;
}

function visit(value: JsonValue | null, fn: (key: string, value: JsonValue) => void) {
  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    fn(key, nested);
    visit(nested, fn);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
