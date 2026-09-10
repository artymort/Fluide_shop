const assert = require("node:assert/strict");
const fragrances = require("./data/fragrances.json");
const engine = require("./selection-engine.js");

const genders = ["женский", "мужской", "унисекс"];
const occasions = ["everyday", "evening", "date", "gym", "walk"];
const families = ["Цветочные", "Фруктовые", "Цитрусовые", "Древесные", "Сладкие", "Свежие", "Пряные и восточные"];
const seasons = ["spring", "summer", "autumn", "winter"];

function assertRanked(criteria) {
  const result = engine.rankRecommendations(fragrances, criteria, 6);
  assert.ok(result.items.length <= 6, "Подбор не должен показывать больше шести ароматов");
  assert.equal(new Set(result.items.map((item) => item.id)).size, result.items.length, "В подборке не должно быть повторов");
  assert.ok(result.items.every((item) => engine.isEligible(item, criteria)), "Каждый результат должен соответствовать ответам");
  const scores = result.items.map((item) => engine.scoreDetails(item, criteria).total);
  assert.deepEqual(scores, [...scores].sort((left, right) => right - left), "Результаты должны идти по убыванию рейтинга");
}

let checked = 0;
genders.forEach((gender) => occasions.forEach((occasion) => families.forEach((family) => seasons.forEach((season) => {
  assertRanked({ gender, occasions: [occasion], families: [family], seasons: [season] });
  checked += 1;
}))));

const female = engine.rankRecommendations(fragrances, { gender: "женский" }, 99).items;
assert.ok(female.every((item) => ["женский", "унисекс"].includes(item.gender)));
const male = engine.rankRecommendations(fragrances, { gender: "мужской" }, 99).items;
assert.ok(male.every((item) => ["мужской", "унисекс"].includes(item.gender)));
const unisex = engine.rankRecommendations(fragrances, { gender: "унисекс" }, 99).items;
assert.ok(unisex.every((item) => item.gender === "унисекс"));

assert.equal(fragrances.length, 99, "Каталог должен содержать все 99 ароматов из таблицы");
assert.ok(fragrances.every((item) => item.group && item.groupFamilies.length && item.season.length));
assert.ok(fragrances.every((item) => item.occasion.length && Object.keys(item.occasionScores).length === occasions.length));
assert.ok(fragrances.every((item) => Object.keys(item.familyScores).length === families.length));

console.log(`Проверено комбинаций: ${checked}; ароматов: ${fragrances.length}; максимум в подборке: 6`);
