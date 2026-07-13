import "server-only";

export interface SecretVault {
  getSecret(reference: string): Promise<string | null>;
  putSecret(name: string, value: string): Promise<string>;
  deleteSecret(reference: string): Promise<void>;
}

function envName(reference: string): string {
  const value = reference.startsWith("env://") ? reference.slice(6) : reference;
  if (!/^[A-Z][A-Z0-9_]*$/.test(value)) {
    throw new Error("Invalid environment vault reference");
  }
  return value;
}

/**
 * Development adapter backed by process environment. Production deployments
 * should inject a managed-vault implementation instead.
 */
export class EnvironmentSecretVault implements SecretVault {
  async getSecret(reference: string): Promise<string | null> {
    return process.env[envName(reference)] ?? null;
  }

  async putSecret(name: string, value: string): Promise<string> {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Environment vault writes are disabled in production");
    }
    const key = envName(name.toUpperCase().replace(/[^A-Z0-9_]/g, "_"));
    process.env[key] = value;
    return `env://${key}`;
  }

  async deleteSecret(reference: string): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Environment vault writes are disabled in production");
    }
    delete process.env[envName(reference)];
  }
}
