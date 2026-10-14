(function exposeSearch(global) {
  const normalize = (value) => String(value ?? "").toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  const number = (item) => {
    const id = String(item.id || "").replace(/^fragrance-/, "");
    return /^\d+$/.test(id) ? String(Number(id)) : "";
  };
  const text = (item) => normalize([
    item.id, item.name, item.title, item.original, item.group, item.category,
    item.typeLabel, item.productType, item.volume, item.notesRaw,
    ...(item.families || []),
    ...(item.notes?.top || []), ...(item.notes?.middle || []),
    ...(item.notes?.base || []), ...(item.notes?.main || []),
    ...(item.accords || []).map((accord) => accord.name),
  ].join(" "));
  function score(item, query) {
    const q = normalize(query);
    if (!q) return 0;
    const numeric = /^\d+$/.test(q) && number(item) === String(Number(q));
    const name = normalize(item.name || item.title);
    const haystack = text(item);
    if (!numeric && !q.split(" ").every((part) => haystack.includes(part))) return -1;
    if (numeric) return 100;
    if (name === q || normalize(item.title) === q) return 90;
    if (name.startsWith(q)) return 70;
    if (haystack.includes(q)) return 50;
    return 20;
  }
  function find(items, query, limit = Infinity) {
    if (!normalize(query)) return [];
    return items.map((item, index) => ({ item, index, rank: score(item, query) }))
      .filter((entry) => entry.rank >= 0)
      .sort((a, b) => b.rank - a.rank || a.index - b.index)
      .slice(0, limit).map((entry) => entry.item);
  }
  global.FluideSearch = Object.freeze({ normalize, score, find });
})(window);
