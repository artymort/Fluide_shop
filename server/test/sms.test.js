import assert from "node:assert/strict";
import test from "node:test";
import { createSmsSender, SmsDeliveryError } from "../sms/sender.js";

const config = {
  isProduction: true,
  sms: {
    enabled: true,
    provider: "smsru",
    apiKey: "private-api-key",
    sender: "",
  },
};

test("SMS.RU sender submits OTP in a POST body and accepts a successful response", async () => {
  let request;
  const sendOtp = createSmsSender({
    config,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        status: "OK",
        status_code: 100,
        sms: { "79990000000": { status: "OK", status_code: 100, sms_id: "message-id" } },
      }), { status: 200 });
    },
  });

  const result = await sendOtp({ phone: "+79990000000", code: "123456", ipAddress: "127.0.0.1" });
  const body = new URLSearchParams(request.options.body);

  assert.equal(request.url, "https://sms.ru/sms/send");
  assert.equal(request.options.method, "POST");
  assert.equal(body.get("api_id"), "private-api-key");
  assert.equal(body.get("to"), "79990000000");
  assert.match(body.get("msg"), /123456/);
  assert.equal(result.messageId, "message-id");
});

test("SMS sender fails closed when delivery is not configured", async () => {
  const sendOtp = createSmsSender({
    config: { isProduction: true, sms: { enabled: false, provider: "disabled" } },
  });

  await assert.rejects(
    () => sendOtp({ phone: "+79990000000", code: "123456" }),
    (error) => error instanceof SmsDeliveryError && error.code === "sms_not_configured",
  );
});
