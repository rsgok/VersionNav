import { execFileSync } from "node:child_process";

export type SupabaseAdminRuntimeConfig = {
  url: string;
  serviceRoleKey: string;
};

export function resolveSupabaseAdminConfig(): SupabaseAdminRuntimeConfig {
  const envUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (envUrl && envKey) {
    return { url: envUrl, serviceRoleKey: envKey };
  }

  const dockerConfig = readLocalDockerSupabaseConfig();
  if (dockerConfig) {
    return dockerConfig;
  }

  throw new Error(
    "No Supabase admin config found. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or run the local Supabase docker stack."
  );
}

function readLocalDockerSupabaseConfig(): SupabaseAdminRuntimeConfig | null {
  try {
    const envText = execFileSync(
      "docker",
      ["inspect", "supabase-kong", "--format", "{{range .Config.Env}}{{println .}}{{end}}"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const serviceRoleKey = envText
      .split("\n")
      .find((line) => line.startsWith("SUPABASE_SERVICE_KEY="))
      ?.replace("SUPABASE_SERVICE_KEY=", "")
      .trim();

    if (!serviceRoleKey) {
      return null;
    }

    return {
      url: "http://localhost:8000",
      serviceRoleKey
    };
  } catch {
    return null;
  }
}
