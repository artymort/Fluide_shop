export class SmsDeliveryError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "SmsDeliveryError";
    this.code = code;
    this.details = details;
  }
}

const smsRuRecipient = (phone) => phone.replace(/^\+/, "");

export function createSmsSender({ config, fetchImpl = globalThis.fetch, logger = console }) {
  return async function sendOtp({ phone, code, ipAddress }) {
    if (!config.sms.enabled) throw new SmsDeliveryError("sms_not_configured");

    if (config.sms.provider === "console") {
      if (config.isProduction) throw new SmsDeliveryError("sms_not_configured");
      logger.info(`[FLUIDE development SMS] ${phone}: ${code}`);
      return { provider: "console", messageId: null };
    }

    if (config.sms.provider !== "smsru") throw new SmsDeliveryError("sms_not_configured");

    const recipient = smsRuRecipient(phone);
    const form = new URLSearchParams({
      api_id: config.sms.apiKey,
      to: recipient,
      msg: `Код FLUIDE: ${code}. Никому не сообщайте его.`,
      json: "1",
    });
    if (config.sms.sender) form.set("from", config.sms.sender);
    if (ipAddress) form.set("ip", ipAddress);

    let response;
    try {
      response = await fetchImpl("https://sms.ru/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: form,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new SmsDeliveryError("sms_delivery_failed", { cause: error?.name || "network_error" });
    }

    const payload = await response.json().catch(() => null);
    const result = payload?.sms?.[recipient];
    if (!response.ok || payload?.status !== "OK" || result?.status !== "OK") {
      throw new SmsDeliveryError("sms_delivery_failed", {
        providerStatus: result?.status_code || payload?.status_code || response.status,
      });
    }

    return { provider: "smsru", messageId: result.sms_id || null };
  };
}
