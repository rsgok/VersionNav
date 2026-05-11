import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ConfigShape, DoctorCheckSummary, ProfileEnvelope, UpdateStatusSummary, UserProfile } from "../../../lib/types";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const SECRET_KEY_PATTERN = /key|token|secret|password|credential|email|phone|transcript|message/i;
const ABSOLUTE_PATH_PATTERN = /^(\/|[A-Za-z]:\\)/;

function main() {
  const collectionMode = parseMode(process.argv.slice(2));
  const configPath = join(homedir(), ".openclaw", "openclaw.json");
  const rawConfig = readJson(configPath);
  const redactedConfig = redact(rawConfig);
  const updateStatusText = runText(["update", "status", "--json"]);
  const updateStatus = parseJson(updateStatusText);
  const doctor = runText(["doctor", "--non-interactive"]);
  const versionText = updateStatus ? "" : runText(["--version"]);
  const version = readVersion(updateStatus, versionText);
  const doctorSummary = summarizeDoctor(doctor);
  const updateStatusSummary = summarizeUpdateStatus(updateStatus);
  const configShape = shapeFromConfig(redactedConfig);

  const profile: UserProfile = {
    profileVersion: 2,
    productId: "openclaw",
    currentVersion: version,
    installMethod: updateStatusSummary.installMethod,
    updateChannel: updateStatusSummary.channel,
    updateStatusSummary,
    doctorSummary,
    os: platform(),
    defaultOpenClawConfigPath: existsSync(configPath),
    defaultOpenClawAgentsPath: existsSync(join(homedir(), ".openclaw", "agents")),
    enabledProviders: namesFrom(redactedConfig, ["providers", "provider"]),
    enabledPlugins: namesFrom(redactedConfig, ["plugins", "plugin"]),
    enabledChannels: namesFrom(redactedConfig, ["channels", "channel"]),
    enabledSkills: namesFrom(redactedConfig, ["skills", "skill"]),
    cronUsed: configShape.containsCron,
    configShape
  };
  profile.compatibilityFingerprint = fingerprintProfile(profile);
  const envelope: ProfileEnvelope = {
    profileVersion: 2,
    productId: "openclaw",
    profile,
    localEvidence: {
      collectedAt: new Date().toISOString(),
      collectionMode,
      commandAvailability: {
        updateStatus: Boolean(updateStatusText),
        doctor: Boolean(doctor),
        version: Boolean(versionText || version)
      },
      doctorSummary,
      defaultOpenClawConfigPath: profile.defaultOpenClawConfigPath ?? false,
      defaultOpenClawAgentsPath: profile.defaultOpenClawAgentsPath ?? false
    }
  };

  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
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

function parseJson(text: string): JsonValue | null {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return null;
  }
}

function readVersion(updateStatus: JsonValue | null, versionText = ""): string | undefined {
  const versionFromStatus = findFirstString(updateStatus, ["currentVersion", "version"]);
  if (versionFromStatus) {
    return versionFromStatus;
  }

  return versionText.match(/\d{4}\.\d+\.\d+|v?\d+\.\d+\.\d+/)?.[0];
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

function summarizeDoctor(text: string): DoctorCheckSummary[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /fail|warn|error|ok|pass/i.test(line))
    .slice(0, 30)
    .map((line) => ({
      status: doctorStatusFor(line),
      check: redactDoctorLine(line)
    }));
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

function summarizeUpdateStatus(value: JsonValue | null): UpdateStatusSummary {
  return {
    ok: Boolean(value),
    currentVersion: findFirstString(value, ["currentVersion", "version"]),
    latestVersion: findFirstString(value, ["latestVersion", "targetVersion"]),
    channel: findFirstString(value, ["channel", "updateChannel"]),
    installMethod: findFirstString(value, ["installMethod", "manager", "source"])
  };
}

function shapeFromConfig(value: JsonValue | null): ConfigShape {
  const objectValue = value && typeof value === "object" && !Array.isArray(value) ? value : {};

  return {
    topLevelKeys: Object.keys(objectValue).sort(),
    providerKeys: namesFrom(value, ["providers", "provider"]),
    pluginKeys: namesFrom(value, ["plugins", "plugin"]),
    channelKeys: namesFrom(value, ["channels", "channel"]),
    skillKeys: namesFrom(value, ["skills", "skill"]),
    containsCron: JSON.stringify(value).toLowerCase().includes("cron")
  };
}

function doctorStatusFor(line: string): DoctorCheckSummary["status"] {
  if (/fail/i.test(line)) return "fail";
  if (/error/i.test(line)) return "error";
  if (/warn/i.test(line)) return "warn";
  if (/pass/i.test(line)) return "pass";
  if (/ok/i.test(line)) return "ok";
  return "unknown";
}

function redactDoctorLine(line: string): string {
  return line
    .replace(ABSOLUTE_PATH_PATTERN, "[redacted]")
    .replace(/\/Users\/\S+|\/home\/\S+|[A-Za-z]:\\\S+/g, "[redacted]")
    .slice(0, 180);
}

function fingerprintProfile(profile: UserProfile): string {
  return createHash("sha256")
    .update(JSON.stringify({ ...profile, compatibilityFingerprint: undefined }))
    .digest("hex");
}

function parseMode(argv: string[]): ProfileEnvelope["localEvidence"]["collectionMode"] {
  const mode = argv[argv.indexOf("--mode") + 1];

  if (mode === "before" || mode === "after") {
    return mode;
  }

  return "snapshot";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
