import { createHmac } from "node:crypto";
import {
  safeEqual,
  verifyShopifyWebhookHmac,
  verifyShopifyQueryHmac,
} from "../src/index.mjs";

let failures = 0;
const assert = (condition, description) => {
  if (condition) {
    console.log(`PASS  ${description}`);
  } else {
    console.error(`FAIL  ${description}`);
    failures++;
  }
};

const TEST_SECRET = "shpss_test_webhook_secret_1234567890";
const ALT_SECRET = "shpss_alt_app_secret_0987654321";
const WRONG_SECRET = "shpss_wrong_secret_bogus";

const createWebhookHmac = (body, secret = TEST_SECRET) => {
  return createHmac("sha256", secret).update(body).digest("base64");
};

console.log("--- Shopify Webhook HMAC Verification Tests ---");

// 1. Valid HMAC verification
{
  const rawBody = Buffer.from(JSON.stringify({ id: 98765, total_price: "150.00", currency: "BRL" }));
  const validHmac = createWebhookHmac(rawBody);
  assert(verifyShopifyWebhookHmac(rawBody, validHmac, TEST_SECRET), "valid webhook HMAC is accepted");
}

// 2. Tampered body rejection
{
  const originalBody = Buffer.from(JSON.stringify({ id: 98765, total_price: "150.00", currency: "BRL" }));
  const validHmac = createWebhookHmac(originalBody);
  const tamperedBody = Buffer.from(JSON.stringify({ id: 98765, total_price: "15.00", currency: "BRL" }));
  assert(!verifyShopifyWebhookHmac(tamperedBody, validHmac, TEST_SECRET), "tampered body is rejected");
}

// 3. Wrong secret rejection
{
  const rawBody = Buffer.from(JSON.stringify({ id: 98765, total_price: "150.00", currency: "BRL" }));
  const hmacWithWrongSecret = createWebhookHmac(rawBody, WRONG_SECRET);
  assert(!verifyShopifyWebhookHmac(rawBody, hmacWithWrongSecret, TEST_SECRET), "HMAC signed with wrong secret is rejected");
}

// 4. Missing or empty header rejection
{
  const rawBody = Buffer.from(JSON.stringify({ id: 1 }));
  assert(!verifyShopifyWebhookHmac(rawBody, null, TEST_SECRET), "null header is rejected");
  assert(!verifyShopifyWebhookHmac(rawBody, undefined, TEST_SECRET), "undefined header is rejected");
  assert(!verifyShopifyWebhookHmac(rawBody, "", TEST_SECRET), "empty string header is rejected");
}

// 5. Multiple secrets support (e.g. App Secret and Legacy Custom App Secret)
{
  const rawBody = Buffer.from(JSON.stringify({ id: 42 }));
  const hmacPrimary = createWebhookHmac(rawBody, TEST_SECRET);
  const hmacSecondary = createWebhookHmac(rawBody, ALT_SECRET);
  const secrets = [TEST_SECRET, ALT_SECRET];

  assert(verifyShopifyWebhookHmac(rawBody, hmacPrimary, secrets), "accepted when signed with primary secret");
  assert(verifyShopifyWebhookHmac(rawBody, hmacSecondary, secrets), "accepted when signed with secondary secret");
  assert(!verifyShopifyWebhookHmac(rawBody, createWebhookHmac(rawBody, WRONG_SECRET), secrets), "rejected when signed with unknown secret");
}

console.log("\n--- Shopify OAuth Query HMAC Verification Tests ---");

// 6. Valid Query HMAC
{
  const params = new URLSearchParams({
    code: "oauth_auth_code_123",
    shop: "test-shop.myshopify.com",
    timestamp: "1720000000",
  });
  const msg = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const hmac = createHmac("sha256", TEST_SECRET).update(msg).digest("hex");
  params.set("hmac", hmac);

  assert(verifyShopifyQueryHmac(params, TEST_SECRET), "valid query HMAC is accepted");
}

// 7. Missing query HMAC
{
  const params = new URLSearchParams({
    shop: "test-shop.myshopify.com",
    timestamp: "1720000000",
  });
  assert(!verifyShopifyQueryHmac(params, TEST_SECRET), "query missing HMAC is rejected");
}

// 8. Tampered query parameters
{
  const params = new URLSearchParams({
    code: "oauth_auth_code_123",
    shop: "test-shop.myshopify.com",
    timestamp: "1720000000",
  });
  const msg = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const hmac = createHmac("sha256", TEST_SECRET).update(msg).digest("hex");
  params.set("hmac", hmac);

  // Tamper parameter value
  params.set("code", "tampered_code");
  assert(!verifyShopifyQueryHmac(params, TEST_SECRET), "tampered query param is rejected");
}

console.log("\n--- Timing-Safe String Comparison Tests ---");

// 9. Timing-safe comparison behavior
{
  assert(safeEqual("abcdef123456", "abcdef123456"), "identical strings return true");
  assert(!safeEqual("abcdef123456", "abcdef123457"), "same length different char returns false");
  assert(!safeEqual("short", "much_longer_string"), "different lengths return false");
  assert(safeEqual("", ""), "empty strings return true");
}

console.log(failures === 0 ? "\nALL HMAC TESTS PASSED" : `\n${failures} TEST FAILURES`);
process.exit(failures === 0 ? 0 : 1);
