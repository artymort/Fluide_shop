(function initializeSelectionEngine(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FluideSelectionEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSelectionEngine() {
  const FAMILY_WEIGHT = 50;
  const OCCASION_WEIGHT = 30;
  const SEASON_WEIGHT = 20;
  const MIN_FAMILY_SCORE = 35;

  function values(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return value ? [value] : [];
  }

  function intersection(left, right) {
    const allowed = new Set(values(right));
    return values(left).filter((value) => allowed.has(value));
  }

  function genderValuesForSelection(gender) {
    if (gender === "мужской") return ["мужской", "унисекс"];
    if (gender === "женский") return ["женский", "унисекс"];
    if (gender === "унисекс") return ["унисекс"];
    return [];
  }

  function genderMatches(itemGender, selectedGender) {
    const allowed = genderValuesForSelection(selectedGender);
    return !allowed.length || allowed.includes(itemGender);
  }

  function matchesAny(itemValues, selectedValues) {
    const selected = values(selectedValues);
    return !selected.length || intersection(itemValues, selected).length > 0;
  }

  function clampScore(score) {
    const number = Number(score);
    return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
  }

  function familyStrength(item, family) {
    const measured = clampScore(item.familyScores && item.familyScores[family]);
    if (measured) return measured;
    if (values(item.groupFamilies).includes(family)) return 100;
    if (values(item.families).includes(family)) return 60;
    return 0;
  }

  function occasionStrength(item, occasion) {
    const measured = clampScore(item.occasionScores && item.occasionScores[occasion]);
    if (measured) return measured;
    return values(item.occasion).includes(occasion) ? 100 : 0;
  }

  function preferenceScore(selected, strengthForValue) {
    const selectedValues = values(selected);
    if (!selectedValues.length) return 0;
    const strengths = selectedValues.map(strengthForValue);
    const best = Math.max(...strengths);
    const average = strengths.reduce((total, score) => total + score, 0) / strengths.length;
    return 0.75 * best + 0.25 * average;
  }

  function profileFocusScore(selected, allValues, strengthForValue) {
    const selectedSet = new Set(values(selected));
    const total = values(allValues).reduce((sum, value) => sum + strengthForValue(value), 0);
    if (!total) return 0;
    const selectedTotal = values(allValues).reduce(
      (sum, value) => sum + (selectedSet.has(value) ? strengthForValue(value) : 0),
      0,
    );
    return Math.min(100, selectedTotal / total * 100);
  }

  function familyPreferenceScore(item, selectedFamilies) {
    const base = preferenceScore(selectedFamilies, (family) => familyStrength(item, family));
    const allFamilies = Object.keys(item.familyScores || {});
    const focus = profileFocusScore(selectedFamilies, allFamilies, (family) => familyStrength(item, family));
    return allFamilies.length ? 0.8 * base + 0.2 * focus : base;
  }

  function occasionPreferenceScore(item, selectedOccasions) {
    const base = preferenceScore(selectedOccasions, (occasion) => occasionStrength(item, occasion));
    const allOccasions = Object.keys(item.occasionScores || {});
    const focus = profileFocusScore(selectedOccasions, allOccasions, (occasion) => occasionStrength(item, occasion));
    return allOccasions.length ? 0.85 * base + 0.15 * focus : base;
  }

  function seasonPreferenceScore(item, selectedSeasons) {
    const selected = values(selectedSeasons);
    if (!selected.length) return 0;
    const itemSeasons = values(item.season);
    const matches = intersection(itemSeasons, selected).length;
    if (!matches) return 0;
    const selectedCoverage = matches / selected.length;
    const fragranceFocus = matches / Math.max(1, itemSeasons.length);
    return 100 * (0.8 * selectedCoverage + 0.2 * fragranceFocus);
  }

  function isEligible(item, criteria) {
    const selectedFamilies = values(criteria.families);
    return genderMatches(item.gender, criteria.gender)
      && (!selectedFamilies.length
        || Math.max(...selectedFamilies.map((family) => familyStrength(item, family))) >= MIN_FAMILY_SCORE)
      && matchesAny(item.occasion, criteria.occasions)
      && matchesAny(item.season, criteria.seasons);
  }

  function scoreDetails(item, criteria) {
    const selectedFamilies = values(criteria.families);
    const selectedOccasions = values(criteria.occasions);
    const selectedSeasons = values(criteria.seasons);
    const family = familyPreferenceScore(item, selectedFamilies);
    const occasion = occasionPreferenceScore(item, selectedOccasions);
    const season = seasonPreferenceScore(item, selectedSeasons);
    const activeWeight = (selectedFamilies.length ? FAMILY_WEIGHT : 0)
      + (selectedOccasions.length ? OCCASION_WEIGHT : 0)
      + (selectedSeasons.length ? SEASON_WEIGHT : 0);
    const total = activeWeight
      ? (
        family * (selectedFamilies.length ? FAMILY_WEIGHT : 0)
        + occasion * (selectedOccasions.length ? OCCASION_WEIGHT : 0)
        + season * (selectedSeasons.length ? SEASON_WEIGHT : 0)
      ) / activeWeight
      : 0;
    return { total, family, occasion, season };
  }

  function rankRecommendations(items, criteria, limit = 6) {
    const eligible = items.filter((item) => isEligible(item, criteria));
    const ranked = eligible
      .map((item) => ({ item, details: scoreDetails(item, criteria) }))
      .sort((left, right) => right.details.total - left.details.total
        || right.details.family - left.details.family
        || right.details.occasion - left.details.occasion
        || right.details.season - left.details.season
        || left.item.id.localeCompare(right.item.id, "ru", { numeric: true }));
    return {
      total: eligible.length,
      items: ranked.slice(0, Math.max(0, limit)).map((entry) => entry.item),
    };
  }

  return { genderValuesForSelection, genderMatches, isEligible, scoreDetails, rankRecommendations };
});
