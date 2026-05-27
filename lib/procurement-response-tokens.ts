import { createHash, randomBytes } from "crypto";

const DEFAULT_RESPONSE_TOKEN_TTL_DAYS = 30;

export function hashSupplierResponseToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function createSupplierResponseToken(ttlDays = DEFAULT_RESPONSE_TOKEN_TTL_DAYS) {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashSupplierResponseToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  return {
    rawToken,
    tokenHash,
    expiresAt,
  };
}
