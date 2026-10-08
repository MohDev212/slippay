import { bufToHex } from "@slippay/shared";

export async function generateMemo(): Promise<string> {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return bufToHex(hash);
}
