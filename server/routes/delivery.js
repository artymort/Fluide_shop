import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  CdekError,
  createCdekClient,
  quotePayload,
  signCdekQuote,
} from "../delivery/cdek.js";
import { createRussianPostClient, RussianPostError, signRussianPostQuote } from "../delivery/russian-post.js";

const cleanText = (value, maximum) => String(value || "").trim().replace(/\s+/g, " ").slice(0, maximum);

const quoteLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const citySearchLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const addressCheckLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const normalizeQuoteRequest = (body = {}) => {
  const mode = cleanText(body.mode, 16);
  const city = cleanText(body.city, 120);
  const cityCode = Number(body.cityCode);
  if (mode !== "pvz") throw new CdekError("cdek_mode_invalid", 400);
  if (city.length < 2 || !Number.isInteger(cityCode) || cityCode < 1) {
    throw new CdekError("cdek_city_invalid", 400);
  }
  return { mode, city, cityCode };
};

export function createDeliveryRouter({ config }) {
  const router = Router();
  const cdek = config.cdek.enabled ? createCdekClient(config.cdek) : null;
  const russianPost = config.russianPost?.enabled ? createRussianPostClient(config.russianPost) : null;

  router.post("/russian-post/quote", quoteLimit, async (request, response, next) => {
    try {
      if (!russianPost) throw new RussianPostError("russian_post_provider_disabled", 503);
      const postalCode = cleanText(request.body?.postalCode, 20);
      const city = cleanText(request.body?.city, 120);
      if (!/^\d{6}$/.test(postalCode)) throw new RussianPostError("delivery_postal_code_required", 400);
      if (city.length < 2) throw new RussianPostError("delivery_address_required", 400);
      const tariff = await russianPost.quote(postalCode);
      const quote = {
        postalCode,
        city,
        deliveryMinor: tariff.deliveryMinor,
        currency: "RUB",
        mailType: "ONLINE_PARCEL",
        weightGrams: config.russianPost.package.weightGrams,
        periodMin: tariff.periodMin,
        periodMax: tariff.periodMax,
      };
      response.set("Cache-Control", "no-store");
      response.json({
        provider: "russian_post",
        ...quote,
        deliveryPrice: tariff.deliveryMinor / 100,
        tariffName: "Посылка онлайн",
        shipmentCreation: false,
        quoteToken: signRussianPostQuote(quote, config.session.secret),
      });
    } catch (error) {
      if (error instanceof RussianPostError) {
        response.status(error.status).json({ error: error.code });
        return;
      }
      next(error);
    }
  });

  router.post("/russian-post/address", addressCheckLimit, async (request, response, next) => {
    try {
      if (!russianPost) throw new RussianPostError("russian_post_provider_disabled", 503);
      const postalCode = cleanText(request.body?.postalCode, 20);
      const city = cleanText(request.body?.city, 120);
      const address = cleanText(request.body?.address, 300);
      if (!/^\d{6}$/.test(postalCode)) throw new RussianPostError("delivery_postal_code_required", 400);
      if (city.length < 2 || address.length < 7 || !/\d/.test(address)) {
        throw new RussianPostError("delivery_address_required", 400);
      }
      const suggestion = await russianPost.normalizeAddress({ city, postalCode, address });
      response.set("Cache-Control", "no-store");
      response.json({ suggestion });
    } catch (error) {
      if (error instanceof RussianPostError) {
        response.status(error.status).json({ error: error.code });
        return;
      }
      next(error);
    }
  });

  router.get("/cdek/cities", citySearchLimit, async (request, response, next) => {
    try {
      if (!cdek) throw new CdekError("cdek_provider_disabled", 503);
      const query = cleanText(request.query.q, 120);
      if (query.length < 2) throw new CdekError("cdek_city_invalid", 400);
      response.json({ cities: await cdek.searchCities(query) });
    } catch (error) {
      if (error instanceof CdekError) {
        response.status(error.status).json({ error: error.code });
        return;
      }
      next(error);
    }
  });

  router.post("/cdek/quote", quoteLimit, async (request, response, next) => {
    try {
      if (!cdek) throw new CdekError("cdek_provider_disabled", 503);
      const input = normalizeQuoteRequest(request.body);
      const destination = await cdek.findCity({
        code: input.cityCode,
        city: input.city,
      });
      const tariff = await cdek.quote({ destination, mode: input.mode });
      const common = {
        provider: "cdek",
        mode: input.mode,
        city: destination.city,
        region: destination.region,
        postalCode: destination.postalCode,
        deliveryMinor: tariff.deliveryMinor,
        deliveryPrice: tariff.deliveryMinor / 100,
        periodMin: Number(tariff.period_min) || null,
        periodMax: Number(tariff.period_max) || null,
        tariffName: cleanText(tariff.tariff_name, 160),
        shipmentCreation: false,
      };

      const points = await cdek.pickupPoints(destination.code);
      if (!points.length) throw new CdekError("cdek_points_unavailable", 422);
      response.json({
        ...common,
        points: points.map((point) => ({
          ...point,
          quoteToken: signCdekQuote(
            quotePayload({ destination, tariff, mode: input.mode, point }),
            config.session.secret,
          ),
        })),
      });
    } catch (error) {
      if (error instanceof CdekError) {
        response.status(error.status).json({ error: error.code });
        return;
      }
      next(error);
    }
  });

  return router;
}
