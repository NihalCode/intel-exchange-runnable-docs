import "server-only";

import { createRequire } from "node:module";

import { EnvironmentSecretVault, type SecretVault } from "@/lib/enterprise/vault";

const nodeRequire = createRequire(import.meta.url);

export type VaultProviderKind = "env" | "hashicorp" | "aws";

interface AwsSdkModule {
  SecretsManagerClient: new (config: { region: string }) => {
    send(command: unknown): Promise<{ ARN?: string; SecretString?: string }>;
  };
  CreateSecretCommand: new (input: { Name: string; SecretString: string }) => unknown;
  GetSecretValueCommand: new (input: { SecretId: string }) => unknown;
  DeleteSecretCommand: new (input: {
    SecretId: string;
    ForceDeleteWithoutRecovery?: boolean;
  }) => unknown;
}

function loadAwsSdk(): AwsSdkModule | null {
  try {
    return nodeRequire("@aws-sdk/client-secrets-manager") as AwsSdkModule;
  } catch {
    return null;
  }
}

class HashicorpVaultProvider implements SecretVault {
  private readonly address: string;
  private readonly token: string;
  private readonly mountPath: string;

  constructor() {
    const address = process.env.VAULT_ADDR?.trim();
    const token = process.env.VAULT_TOKEN?.trim();
    if (!address || !token) {
      throw new Error("VAULT_ADDR and VAULT_TOKEN are required for hashicorp provider");
    }
    this.address = address.replace(/\/$/, "");
    this.token = token;
    this.mountPath = (process.env.VAULT_MOUNT_PATH ?? "secret").replace(/^\/|\/$/g, "");
  }

  async getSecret(reference: string): Promise<string | null> {
    const path = reference.startsWith("hashicorp://")
      ? reference.slice("hashicorp://".length)
      : reference;
    const response = await fetch(
      `${this.address}/v1/${this.mountPath}/data/${path}`,
      { headers: { "X-Vault-Token": this.token } }
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Vault read failed with status ${response.status}`);
    }
    const body = (await response.json()) as {
      data?: { data?: { value?: string } };
    };
    return body.data?.data?.value ?? null;
  }

  async putSecret(name: string, value: string): Promise<string> {
    const safeName = name.replace(/[^a-zA-Z0-9/_-]/g, "-");
    const response = await fetch(
      `${this.address}/v1/${this.mountPath}/data/${safeName}`,
      {
        method: "POST",
        headers: {
          "X-Vault-Token": this.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: { value } }),
      }
    );
    if (!response.ok) {
      throw new Error(`Vault write failed with status ${response.status}`);
    }
    return `hashicorp://${safeName}`;
  }

  async deleteSecret(reference: string): Promise<void> {
    const path = reference.startsWith("hashicorp://")
      ? reference.slice("hashicorp://".length)
      : reference;
    const response = await fetch(
      `${this.address}/v1/${this.mountPath}/metadata/${path}`,
      {
        method: "DELETE",
        headers: { "X-Vault-Token": this.token },
      }
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Vault delete failed with status ${response.status}`);
    }
  }
}

class AwsVaultStub implements SecretVault {
  async getSecret(reference: string): Promise<string | null> {
    void reference;
    return null;
  }

  async putSecret(name: string, _value: string): Promise<string> {
    const safeName = name.replace(/[^a-zA-Z0-9/_-]/g, "-");
    return `aws://${safeName}`;
  }

  async deleteSecret(reference: string): Promise<void> {
    void reference;
  }
}

class AwsSecretsManagerProvider implements SecretVault {
  private client: {
    send(command: unknown): Promise<{ ARN?: string; SecretString?: string }>;
  } | null = null;
  private sdk: AwsSdkModule | null = null;
  private readonly region: string;
  private readonly stubFallback: AwsVaultStub;

  constructor() {
    this.region = process.env.AWS_REGION?.trim() ?? "us-east-1";
    this.stubFallback = new AwsVaultStub();
    this.sdk = loadAwsSdk();
    if (this.sdk) {
      this.client = new this.sdk.SecretsManagerClient({ region: this.region });
    }
  }

  async getSecret(reference: string): Promise<string | null> {
    if (!this.client || !this.sdk) return this.stubFallback.getSecret(reference);
    const secretId = reference.startsWith("aws://")
      ? reference.slice("aws://".length)
      : reference;
    try {
      const response = await this.client.send(
        new this.sdk.GetSecretValueCommand({ SecretId: secretId })
      );
      return response.SecretString ?? null;
    } catch {
      return null;
    }
  }

  async putSecret(name: string, value: string): Promise<string> {
    if (!this.client || !this.sdk) return this.stubFallback.putSecret(name, value);
    const safeName = name.replace(/[^a-zA-Z0-9/_-]/g, "-");
    const response = await this.client.send(
      new this.sdk.CreateSecretCommand({
        Name: safeName,
        SecretString: value,
      })
    );
    const arn = response.ARN ?? safeName;
    return `aws://${arn}`;
  }

  async deleteSecret(reference: string): Promise<void> {
    if (!this.client || !this.sdk) {
      await this.stubFallback.deleteSecret(reference);
      return;
    }
    const secretId = reference.startsWith("aws://")
      ? reference.slice("aws://".length)
      : reference;
    await this.client.send(
      new this.sdk.DeleteSecretCommand({
        SecretId: secretId,
        ForceDeleteWithoutRecovery: true,
      })
    );
  }
}

export function resolveVaultProviderKind(): VaultProviderKind | null {
  const raw = process.env.VAULT_PROVIDER?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === "env" || raw === "hashicorp" || raw === "aws") return raw;
  throw new Error(`Unsupported VAULT_PROVIDER value: ${raw}`);
}

export function createVaultProvider(): SecretVault | null {
  const kind = resolveVaultProviderKind();
  if (!kind) return null;
  switch (kind) {
    case "env":
      return new EnvironmentSecretVault();
    case "hashicorp":
      return new HashicorpVaultProvider();
    case "aws":
      return new AwsSecretsManagerProvider();
    default:
      return null;
  }
}

export async function storeApiKeyInVault(
  name: string,
  plaintext: string
): Promise<string | null> {
  const provider = createVaultProvider();
  if (!provider) return null;
  return provider.putSecret(`docs-agent/${name}`, plaintext);
}
