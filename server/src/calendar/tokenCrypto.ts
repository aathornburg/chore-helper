import crypto from "node:crypto";

function keyFromSecret(secret: string) {
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptCalendarToken(token: string, secret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "dev-calendar-token-key") {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptCalendarToken(encryptedToken: string, secret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "dev-calendar-token-key") {
  const [ivValue, tagValue, encryptedValue] = encryptedToken.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid encrypted calendar token");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyFromSecret(secret), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
