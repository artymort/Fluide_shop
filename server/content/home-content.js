import { readFile } from "node:fs/promises";
import path from "node:path";

let defaultContentPromise;

const text = (value, fallback = "", maximum = 2000) => {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maximum) || fallback;
};

const bool = (value, fallback = true) => typeof value === "boolean" ? value : fallback;

const link = (value, fallback = "") => {
  const candidate = text(value, fallback, 1000);
  if (!candidate) return fallback;
  if (/^(?:https?:\/\/[^\s]+|\/[^\s]*|#[^\s]*|[a-z0-9][a-z0-9._/-]*(?:\?[^\s]*)?(?:#[^\s]*)?)$/i.test(candidate)) return candidate;
  return fallback;
};

const image = (value, fallback = "") => link(value, fallback);

const section = (value, fallback) => ({
  enabled: bool(value?.enabled, fallback.enabled),
});

const normalizeOffer = (value, fallback) => ({
  title: text(value?.title, fallback.title, 160),
  text: text(value?.text, fallback.text, 500),
  buttonLabel: text(value?.buttonLabel, fallback.buttonLabel, 100),
  url: link(value?.url, fallback.url),
  image: image(value?.image, fallback.image),
  imageAlt: text(value?.imageAlt, fallback.imageAlt, 240),
});

const normalizeVoice = (value, fallback) => ({
  label: text(value?.label, fallback.label, 120),
  title: text(value?.title, fallback.title, 180),
  text: text(value?.text, fallback.text, 500),
  image: image(value?.image, fallback.image),
  imageAlt: text(value?.imageAlt, fallback.imageAlt, 240),
});

export async function getDefaultHomeContent() {
  defaultContentPromise ||= readFile(path.resolve(process.cwd(), "data/homepage.json"), "utf8")
    .then((source) => JSON.parse(source));
  return structuredClone(await defaultContentPromise);
}

export function normalizeHomeContent(value, fallback) {
  const input = value && typeof value === "object" ? value : {};
  const productIds = Array.isArray(input.bestsellers?.productIds)
    ? [...new Set(input.bestsellers.productIds.map((item) => text(item, "", 180)).filter(Boolean))].slice(0, 40)
    : fallback.bestsellers.productIds;

  return {
    seo: {
      title: text(input.seo?.title, fallback.seo.title, 240),
      description: text(input.seo?.description, fallback.seo.description, 500),
    },
    hero: {
      ...section(input.hero, fallback.hero),
      title: text(input.hero?.title, fallback.hero.title, 240),
      subtitle: text(input.hero?.subtitle, fallback.hero.subtitle, 500),
      buttonLabel: text(input.hero?.buttonLabel, fallback.hero.buttonLabel, 100),
      buttonUrl: link(input.hero?.buttonUrl, fallback.hero.buttonUrl),
      desktopImage: image(input.hero?.desktopImage, fallback.hero.desktopImage),
      mobileImage: image(input.hero?.mobileImage, fallback.hero.mobileImage),
      imageAlt: text(input.hero?.imageAlt, fallback.hero.imageAlt, 240),
    },
    bestsellers: {
      ...section(input.bestsellers, fallback.bestsellers),
      title: text(input.bestsellers?.title, fallback.bestsellers.title, 160),
      showFilters: bool(input.bestsellers?.showFilters, fallback.bestsellers.showFilters),
      productIds,
    },
    offers: {
      ...section(input.offers, fallback.offers),
      title: text(input.offers?.title, fallback.offers.title, 160),
      items: fallback.offers.items.map((item, index) => normalizeOffer(input.offers?.items?.[index], item)),
    },
    finder: {
      ...section(input.finder, fallback.finder),
      title: text(input.finder?.title, fallback.finder.title, 160),
      text: text(input.finder?.text, fallback.finder.text, 700),
      buttonLabel: text(input.finder?.buttonLabel, fallback.finder.buttonLabel, 100),
      buttonUrl: link(input.finder?.buttonUrl, fallback.finder.buttonUrl),
      image: image(input.finder?.image, fallback.finder.image),
      imageAlt: text(input.finder?.imageAlt, fallback.finder.imageAlt, 240),
    },
    gifts: {
      ...section(input.gifts, fallback.gifts),
      title: text(input.gifts?.title, fallback.gifts.title, 240),
      text: text(input.gifts?.text, fallback.gifts.text, 700),
      cardText: text(input.gifts?.cardText, fallback.gifts.cardText, 180),
      cardCaption: text(input.gifts?.cardCaption, fallback.gifts.cardCaption, 120),
    },
    brand: {
      ...section(input.brand, fallback.brand),
      label: text(input.brand?.label, fallback.brand.label, 120),
      title: text(input.brand?.title, fallback.brand.title, 240),
      text: text(input.brand?.text, fallback.brand.text, 900),
      secondaryText: text(input.brand?.secondaryText, fallback.brand.secondaryText, 900),
      buttonLabel: text(input.brand?.buttonLabel, fallback.brand.buttonLabel, 100),
      buttonUrl: link(input.brand?.buttonUrl, fallback.brand.buttonUrl),
      image: image(input.brand?.image, fallback.brand.image),
      imageAlt: text(input.brand?.imageAlt, fallback.brand.imageAlt, 240),
    },
    voices: {
      ...section(input.voices, fallback.voices),
      title: text(input.voices?.title, fallback.voices.title, 160),
      subtitle: text(input.voices?.subtitle, fallback.voices.subtitle, 300),
      items: fallback.voices.items.map((item, index) => normalizeVoice(input.voices?.items?.[index], item)),
    },
    club: {
      ...section(input.club, fallback.club),
      title: text(input.club?.title, fallback.club.title, 160),
      text: text(input.club?.text, fallback.club.text, 700),
    },
  };
}

export async function prepareHomeContent(value) {
  const fallback = await getDefaultHomeContent();
  return normalizeHomeContent(value, fallback);
}
