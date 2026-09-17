let PRICE_BY_SIZE = {
  "30":{"Люкс":1990,"Суперлюкс":2490,"Селектив":3490},
  "50":{"Люкс":2990,"Суперлюкс":3490,"Селектив":4990}
};
const OCCASION_LABELS = {everyday:"На каждый день",evening:"Вечер",date:"Свидание",gym:"Спорт",walk:"Прогулка"};
const SEASON_LABELS = {spring:"Весна",summer:"Лето",autumn:"Осень",winter:"Зима"};
const GENDER_LABELS = {женский:"Для нее",мужской:"Для него",унисекс:"Унисекс"};
const FILTER_LABELS = {...OCCASION_LABELS,...SEASON_LABELS,женский:"Для нее",мужской:"Для него",унисекс:"Унисекс"};
const HOME_PRODUCT_SNAPSHOTS = {
  matsukita:{name:"Matsukita",price:1990,image:"assets/product-line/fragrance-matsukita-card.webp?v=1"},
  cashmere:{name:"Cashmere",price:1350,image:"assets/product-line/diffuser-cashmere.webp?v=1"},
  "devils-intrigue":{name:"Devils Intrigue",price:650,image:"assets/product-line/hair-spray-devils-intrigue.webp?v=1"},
  auto:{name:"Car Scent",price:300,image:"assets/product-line/car-fragrance.webp?v=1"},
  cherry:{name:"Cherry",price:1990,image:"assets/product-line/fragrance-cherry.webp?v=1"},
  hayati:{name:"Hayati",price:3490,image:"assets/product-line/fragrance-hayati.webp?v=1"},
  "musk-kashmir":{name:"Musk Kashmir",price:3490,image:"assets/product-line/fragrance-musk-kashmir.webp?v=1"},
  "sea-salt":{name:"Sea Salt",price:550,image:"assets/product-line/home-perfume-sea-salt.webp?v=1"},
  "matsukita-solid":{name:"Matsukita Solid",price:990,image:"assets/product-line/solid-perfume-matsukita.webp?v=1"},
  ballerina:{name:"Ballerina",price:890,image:"assets/product-line/candle-ballerina.webp?v=1"},
  "black-pepper":{name:"Black Pepper",price:3490,image:"assets/product-line/fragrance-black-pepper.webp?v=1"},
  white:{name:"White",price:1990,image:"assets/product-line/fragrance-white.webp?v=1"}
};
const CATALOG_SECTIONS = {
  all:null,
  perfume:["fragrance"],
  solid:["solid-perfume"],
  home:["home-fragrance","candle","diffuser"],
  care:["body-cream","hair-spray","hand-soap"],
  car:["car-fragrance"]
};
const CATALOG_SECTION_LABELS = {
  all:"Все товары",
  perfume:"Парфюм",
  solid:"Твердый парфюм",
  home:"Для дома",
  care:"Уход",
  car:"Автопарфюм"
};
const PRODUCT_SEARCH_ALIASES = {
  "solid-perfume":"твердые духи твердый парфюм",
  "home-fragrance":"аромат для дома парфюм для дома",
  candle:"свеча свечи свечей",
  diffuser:"диффузор аромадиффузор для дома",
  "body-cream":"крем уход косметика",
  "hand-soap":"мыло уход косметика",
  "hair-spray":"спрей для волос уход косметика",
  "car-fragrance":"автопарфюм аромат для машины"
};
const FEATURED_CATALOG_ORDER = [
  "fragrance-001","product-01","solid-perfume-matsukita","product-19",
  "fragrance-002","product-04","product-12","product-33",
  "fragrance-006","product-03","solid-perfume-fleur-narcotique","product-34"
];

const grid = document.querySelector(".fragrance-grid");
const catalogHeading = document.querySelector("#catalog-heading");
const catalogCategories = document.querySelector(".catalog-categories");
const catalogCategoryButtons = [...document.querySelectorAll("[data-catalog-section]")];
const selectionResultActions = document.querySelector(".selection-result-actions");
const resultCount = document.querySelector(".result-count");
const emptyState = document.querySelector(".catalog-empty");
const loadMore = document.querySelector(".load-more");
const searchInput = document.querySelector("#catalog-search");
const sortSelect = document.querySelector("#catalog-sort");
const sortControl = document.querySelector(".sort-control");
const sortTrigger = document.querySelector(".sort-trigger");
const sortValue = document.querySelector(".sort-value");
const sortMenu = document.querySelector(".sort-menu");
const filterPanel = document.querySelector(".filter-panel");
const filterToggle = document.querySelector(".filter-toggle");
const filterClose = document.querySelector(".filter-close");
const filterCount = document.querySelector(".filter-count");
const activeFilters = document.querySelector(".active-filters");
const backdrop = document.querySelector(".drawer-backdrop");
const cartDrawer = document.querySelector(".cart-drawer");
const cartButton = document.querySelector(".cart-button");
const cartClose = document.querySelector(".drawer-close");
const cartItems = document.querySelector(".cart-items");
const cartCount = document.querySelector(".cart-count");
const cartTotal = document.querySelector(".cart-total");
const cartFooter = document.querySelector(".cart-footer");
const favoritesButton = document.querySelector(".favorites-button");
const menuToggle = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector(".mobile-nav");
const catalogHeader = document.querySelector(".catalog-header");
const toast = document.querySelector(".toast");
const volumeDialog = document.querySelector("#volume-dialog");
const volumeContent = document.querySelector(".volume-content");
const infoDialog = document.querySelector("#info-dialog");
const infoTitle = document.querySelector(".info-title");
const infoContent = document.querySelector(".info-content");
const loginButton = document.querySelector("[data-login]");
const accountDialog = document.querySelector("#account-dialog");
const accountBody = document.querySelector("#account-dialog-body");
const selectionEngine = window.FluideSelectionEngine;

let fragrances = [];
let catalogProducts = [];
let visibleLimit = 12;
let favoritesOnly = false;
let selectionMode = new URLSearchParams(window.location.search).get("mode") === "selection";
let activeCatalogSection = selectionMode ? "perfume" : new URLSearchParams(window.location.search).get("section") || (new URLSearchParams(window.location.search).get("category")==="home" ? "home" : "all");
if(!CATALOG_SECTIONS.hasOwnProperty(activeCatalogSection))activeCatalogSection="all";
let focusSelectionResultsOnLoad = selectionMode && new URLSearchParams(window.location.search).get("view") === "results";
let toastTimer;
let selectedFragranceId = "";
let favorites = JSON.parse(localStorage.getItem("fluide-favorites") || "[]");
let cart = JSON.parse(localStorage.getItem("fluide-cart") || "[]");

const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const normalize = value => String(value ?? "").toLocaleLowerCase("ru-RU").replace(/\u0451/g,"е").trim();
const formatPrice = value => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
const formatPriceMarkup = value => `${new Intl.NumberFormat("ru-RU").format(value)}&nbsp;<span class="price-ruble">₽</span>`;
const productId = fragrance => `fragrance-${fragrance.id}`;
const isCatalogProduct = item => item?.kind === "product";
const catalogItemKey = item => isCatalogProduct(item) ? item.id : productId(item);

function prettyTitle(value){
  return String(value || "")
    .replace(/^\d+\s+/,"")
    .toLocaleLowerCase("ru-RU")
    .replace(/(^|[\s-])([a-zа-я\u0451])/giu,(match,space,letter)=>`${space}${letter.toLocaleUpperCase("ru-RU")}`);
}

function variantsFor(fragrance){
  if(Array.isArray(fragrance.variants)&&fragrance.variants.length){
    return fragrance.variants.map(variant=>({
      size:String(variant.size||variant.volume||"").replace(/\D/g,""),
      volume:variant.volume||`${variant.size} мл`,
      price:Number(variant.price)||0
    }));
  }
  return ["30","50"].map(size=>({size,volume:`${size} мл`,price:PRICE_BY_SIZE[size]?.[fragrance.category] || 1990}));
}

function getPrice(item){return isCatalogProduct(item) ? Number(item.price)||0 : Math.min(...variantsFor(item).map(variant=>variant.price))}

function allNotes(fragrance){
  const notes = fragrance.notes || {};
  return [...(notes.top||[]),...(notes.middle||[]),...(notes.base||[]),...(notes.main||[])];
}

function noteSummary(fragrance){
  return allNotes(fragrance).filter(Boolean).slice(0,3).join(" · ") || fragrance.group || "Парфюмерная композиция";
}

function productVisual(fragrance,loading="lazy"){
  const title=prettyTitle(fragrance.title);
  if(fragrance.image){
    return `<img src="${escapeHtml(fragrance.image)}" alt="Флакон FLUIDE ${escapeHtml(title)}" loading="${loading}">`;
  }
  return `<div class="fragrance-placeholder" role="img" aria-label="Изображение аромата FLUIDE ${escapeHtml(title)} готовится">
    <img src="assets/brand/logo-blue.svg" alt="" aria-hidden="true">
    <strong>№ ${escapeHtml(fragrance.id)}</strong>
    <span>Изображение готовится</span>
  </div>`;
}

function getChecked(name){
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input=>input.value).filter(Boolean);
}

function getGender(){return document.querySelector('input[name="gender"]:checked')?.value || ""}

function matchesAny(itemValues,selected){
  if(!selected.length)return true;
  const values = Array.isArray(itemValues) ? itemValues : [itemValues];
  return selected.some(value=>values.includes(value));
}

function setCheckedValues(name, values){
  const selected = new Set(values);
  document.querySelectorAll(`input[name="${name}"]`).forEach(input=>{input.checked=selected.has(input.value)});
  if(selected.size){
    document.querySelector(`input[name="${name}"]:checked`)?.closest("details")?.setAttribute("open","");
  }
}

function initializeFiltersFromUrl(){
  const params = new URLSearchParams(window.location.search);
  const gender = params.get("gender");
  if(gender){
    const input=[...document.querySelectorAll('input[name="gender"]')].find(row=>row.value===gender);
    if(input)input.checked=true;
  }
  ["category","family","occasion","season"].forEach(name=>setCheckedValues(name,params.getAll(name)));
  searchInput.value=params.get("q")||"";
  favoritesOnly=params.get("favorites")==="1";
  const sort=params.get("sort");
  if(sort&&[...sortSelect.options].some(option=>option.value===sort)){
    sortSelect.value=sort;
    sortValue.textContent=sortSelect.options[sortSelect.selectedIndex].textContent;
    sortMenu.querySelectorAll('[role="option"]').forEach(option=>option.setAttribute("aria-selected",String(option.dataset.sortValue===sort)));
  }
}

function syncSelectionUrl(){
  if(!selectionMode)return;
  const params=new URLSearchParams();
  params.set("mode","selection");
  const gender=getGender();
  if(gender)params.set("gender",gender);
  ["category","family","occasion","season"].forEach(name=>getChecked(name).forEach(value=>params.append(name,value)));
  if(searchInput.value.trim())params.set("q",searchInput.value.trim());
  if(favoritesOnly)params.set("favorites","1");
  if(sortSelect.value!=="featured")params.set("sort",sortSelect.value);
  history.replaceState(null,"",`${location.pathname}?${params.toString()}`);
}

function currentFiltered(){
  const query = normalize(searchInput.value);
  const gender = getGender();
  const categories = getChecked("category");
  const families = getChecked("family");
  const occasions = getChecked("occasion");
  const seasons = getChecked("season");
  const allowedTypes = CATALOG_SECTIONS[activeCatalogSection];
  const sourceItems = selectionMode
    ? fragrances
    : activeCatalogSection === "perfume"
      ? fragrances
      : activeCatalogSection === "all"
        ? [...fragrances,...catalogProducts]
        : catalogProducts.filter(item=>allowedTypes?.includes(item.productType));
  const perfumeFiltersActive = selectionMode || activeCatalogSection === "perfume";

  const candidates = sourceItems.filter(item=>{
    const searchText = isCatalogProduct(item)
      ? normalize([item.id,item.name,item.title,item.productType,item.typeLabel,item.volume,PRODUCT_SEARCH_ALIASES[item.productType]].join(" "))
      : normalize([
        item.id,item.name,item.title,item.original,item.group,item.category,item.gender,item.notesRaw,
        ...(item.families||[]),...(item.accords||[]).map(accord=>accord.name)
      ].join(" "));
    if(query && !searchText.includes(query))return false;
    if(perfumeFiltersActive){
      if(!matchesAny(item.category,categories))return false;
      if(!selectionMode&&gender&&item.gender!==gender)return false;
      if(!selectionMode&&!matchesAny(item.families,families))return false;
      if(!selectionMode&&!matchesAny(item.occasion,occasions))return false;
      if(!selectionMode&&!matchesAny(item.season,seasons))return false;
    }
    if(favoritesOnly && !favorites.includes(catalogItemKey(item)))return false;
    return true;
  });

  let sorted;
  if(selectionMode&&selectionEngine){
    sorted=selectionEngine.rankRecommendations(candidates,{gender,families,occasions,seasons},6).items;
  }else{
    sorted=[...candidates];
  }
  switch(sortSelect.value){
    case "number": sorted.sort((a,b)=>catalogItemKey(a).localeCompare(catalogItemKey(b),"ru",{numeric:true})); break;
    case "name": sorted.sort((a,b)=>prettyTitle(a.title).localeCompare(prettyTitle(b.title),"ru")); break;
    case "price-asc": sorted.sort((a,b)=>getPrice(a)-getPrice(b)||catalogItemKey(a).localeCompare(catalogItemKey(b),"ru",{numeric:true})); break;
    case "price-desc": sorted.sort((a,b)=>getPrice(b)-getPrice(a)||catalogItemKey(a).localeCompare(catalogItemKey(b),"ru",{numeric:true})); break;
    default: if(!selectionMode)sorted.sort((a,b)=>{
      if(activeCatalogSection === "all"){
        const aRank=FEATURED_CATALOG_ORDER.indexOf(catalogItemKey(a));
        const bRank=FEATURED_CATALOG_ORDER.indexOf(catalogItemKey(b));
        if(aRank!==-1||bRank!==-1)return (aRank===-1?999:aRank)-(bRank===-1?999:bRank);
      }
      if(!isCatalogProduct(a)&&!isCatalogProduct(b)){
        const order={"Селектив":0,"Суперлюкс":1,"Люкс":2};
        return (order[a.category]??3)-(order[b.category]??3)||Number(a.id)-Number(b.id);
      }
      return catalogItemKey(a).localeCompare(catalogItemKey(b),"ru",{numeric:true});
    });
  }
  return sorted;
}

function cardTemplate(fragrance){
  const id = catalogItemKey(fragrance);
  const active = favorites.includes(id);
  if(isCatalogProduct(fragrance)){
    const productMeta=[fragrance.typeLabel,fragrance.volume].filter(Boolean).join(" · ");
    const productHref=`product.html?id=${encodeURIComponent(fragrance.id)}`;
    return `<article class="fragrance-card catalog-product-card" data-id="${escapeHtml(fragrance.id)}">
      <div class="fragrance-media-shell">
        <span class="fragrance-badge">${escapeHtml(fragrance.typeLabel)}</span>
        <a class="fragrance-media" href="${productHref}" aria-label="Открыть страницу товара ${escapeHtml(fragrance.title)}">
          <img src="${escapeHtml(fragrance.image)}" alt="${escapeHtml(fragrance.title)}" loading="lazy">
        </a>
        <button class="favorite-toggle ${active?"is-active":""}" type="button" data-favorite="${escapeHtml(id)}" aria-label="${active?"Удалить из избранного":"Добавить в избранное"}">
          <svg aria-hidden="true"><use href="assets/icons/lucide.svg#heart"></use></svg>
        </button>
      </div>
      <div class="fragrance-info">
        <div class="fragrance-title-row"><h3><a href="${productHref}">${escapeHtml(fragrance.title)}</a></h3></div>
        <p class="fragrance-original">${escapeHtml(productMeta||"Продукция FLUIDE Atelier")}</p>
        <div class="card-actions"><strong class="card-price">${formatPriceMarkup(getPrice(fragrance))}</strong><div class="card-action-buttons"><a class="details-button" href="${productHref}">Подробнее</a><button class="add-button" type="button" data-add-product="${escapeHtml(fragrance.id)}" data-analytics-add data-product-key="${escapeHtml(fragrance.id)}" aria-label="Добавить ${escapeHtml(fragrance.title)} в корзину">В корзину</button></div></div>
      </div>
    </article>`;
  }
  const title = prettyTitle(fragrance.title);
  const cardName = `FLUIDE ${Number(fragrance.id)} ${title}`;
  return `<article class="fragrance-card" data-id="${escapeHtml(fragrance.id)}">
    <div class="fragrance-media-shell">
      <span class="fragrance-badge">${escapeHtml(fragrance.isNew?"Новинка":fragrance.category)}</span>
      <a class="fragrance-media" href="product.html?id=${encodeURIComponent(fragrance.id)}" aria-label="Открыть страницу аромата ${escapeHtml(title)}">
        ${productVisual(fragrance)}
      </a>
      <button class="favorite-toggle ${active?"is-active":""}" type="button" data-favorite="${escapeHtml(id)}" aria-label="${active?"Удалить из избранного":"Добавить в избранное"}">
        <svg aria-hidden="true"><use href="assets/icons/lucide.svg#heart"></use></svg>
      </button>
    </div>
    <div class="fragrance-info">
      <div class="fragrance-title-row"><h3><a href="product.html?id=${encodeURIComponent(fragrance.id)}">${escapeHtml(cardName)}</a></h3></div>
      <p class="fragrance-original">По мотивам ${escapeHtml(fragrance.original)}</p>
      <p class="fragrance-notes">${escapeHtml(noteSummary(fragrance))}</p>
      <div class="card-actions"><strong class="card-price">от ${formatPriceMarkup(getPrice(fragrance))}</strong><div class="card-action-buttons"><a class="details-button" href="product.html?id=${encodeURIComponent(fragrance.id)}">Подробнее</a><button class="add-button" type="button" data-add="${escapeHtml(fragrance.id)}" aria-label="Добавить ${escapeHtml(title)} в корзину">В корзину</button></div></div>
    </div>
  </article>`;
}

function renderProducts(){
  const filtered = currentFiltered();
  const shown = filtered.slice(0,selectionMode?6:visibleLimit);
  const perfumeView=selectionMode||activeCatalogSection==="perfume";
  catalogHeading.textContent=selectionMode?"Подобранные ароматы":CATALOG_SECTION_LABELS[activeCatalogSection];
  if(selectionResultActions)selectionResultActions.hidden=!selectionMode;
  catalogCategories.hidden=selectionMode;
  filterToggle.hidden=!perfumeView;
  activeFilters.hidden=false;
  activeFilters.classList.toggle("is-placeholder",!perfumeView);
  activeFilters.setAttribute("aria-hidden",String(!perfumeView));
  catalogCategoryButtons.forEach(button=>{
    const active=button.dataset.catalogSection===activeCatalogSection;
    button.classList.toggle("is-active",active);
    button.setAttribute("aria-pressed",String(active));
  });
  grid.innerHTML = shown.map(cardTemplate).join("");
  resultCount.textContent = perfumeView
    ? `${filtered.length} ${plural(filtered.length,"аромат","аромата","ароматов")}`
    : `${filtered.length} ${plural(filtered.length,"товар","товара","товаров")}`;
  const totalFragrances = document.querySelector(".total-fragrances");
  if(totalFragrances)totalFragrances.textContent = `${fragrances.length} ${plural(fragrances.length,"аромат","аромата","ароматов")}`;
  emptyState.hidden = filtered.length !== 0;
  grid.hidden = filtered.length === 0;
  loadMore.hidden = selectionMode || shown.length >= filtered.length;
  document.querySelector(".apply-filters").textContent=`Показать ${filtered.length} ${plural(filtered.length,"аромат","аромата","ароматов")}`;
  renderActiveFilters();
}

function focusLoadedSelectionResults(){
  if(!focusSelectionResultsOnLoad)return;
  focusSelectionResultsOnLoad=false;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const target=document.querySelector("#catalog-results");
    if(!target)return;
    const stickyOffset=document.querySelector(".service").offsetHeight+catalogHeader.offsetHeight+20;
    const targetTop=window.scrollY+target.getBoundingClientRect().top-stickyOffset;
    window.scrollTo({top:Math.max(0,targetTop),behavior:"auto"});
  }));
}

function plural(number,one,few,many){
  const mod10=number%10,mod100=number%100;
  if(mod10===1&&mod100!==11)return one;
  if(mod10>=2&&mod10<=4&&(mod100<12||mod100>14))return few;
  return many;
}

function catalogSectionCount(section){
  if(section==="all")return fragrances.length+catalogProducts.length;
  if(section==="perfume")return fragrances.length;
  const types=CATALOG_SECTIONS[section]||[];
  return catalogProducts.filter(item=>types.includes(item.productType)).length;
}

function renderCatalogSectionCounts(){
  document.querySelectorAll("[data-section-count]").forEach(label=>{
    label.textContent=catalogSectionCount(label.dataset.sectionCount);
  });
}

function syncCatalogSectionUrl(){
  if(selectionMode)return;
  const params=new URLSearchParams(location.search);
  params.delete("category");
  if(activeCatalogSection==="all")params.delete("section");
  else params.set("section",activeCatalogSection);
  const query=params.toString();
  history.replaceState(null,"",`${location.pathname}${query?`?${query}`:""}`);
}

function setCatalogSection(section){
  if(selectionMode||!CATALOG_SECTIONS.hasOwnProperty(section))return;
  closeFilter();
  activeCatalogSection=section;
  visibleLimit=12;
  syncCatalogSectionUrl();
  renderProducts();
}

function activeSelections(){
  const entries=[];
  const gender=getGender();
  if(gender)entries.push({name:"gender",value:gender,label:FILTER_LABELS[gender]});
  ["category","family","occasion","season"].forEach(name=>getChecked(name).forEach(value=>entries.push({name,value,label:FILTER_LABELS[value]||value})));
  if(favoritesOnly)entries.push({name:"favorites",value:"favorites",label:"Избранное"});
  return entries;
}

function renderActiveFilters(){
  const entries=activeSelections();
  activeFilters.innerHTML=entries.map(entry=>`<button class="active-chip" type="button" data-remove-filter="${escapeHtml(entry.name)}" data-remove-value="${escapeHtml(entry.value)}">${escapeHtml(entry.label)} <svg aria-hidden="true"><use href="assets/icons/lucide.svg#x"></use></svg></button>`).join("");
  filterCount.textContent=entries.length;
  filterCount.hidden=entries.length===0;
  favoritesButton.classList.toggle("is-active",favoritesOnly);
}

function resetFilters(){
  document.querySelectorAll('.filter-panel input[type="checkbox"]').forEach(input=>input.checked=false);
  const allGender=document.querySelector('input[name="gender"][value=""]');
  if(allGender)allGender.checked=true;
  searchInput.value="";
  favoritesOnly=false;
  if(selectionMode){selectionMode=false;activeCatalogSection="all"}
  visibleLimit=12;
  syncCatalogSectionUrl();
  renderProducts();
}

function removeFilter(name,value){
  if(name==="favorites")favoritesOnly=false;
  else if(name==="gender")document.querySelector('input[name="gender"][value=""]')?.click();
  else{
    const input=[...document.querySelectorAll(`input[name="${name}"]`)].find(row=>row.value===value);
    if(input)input.checked=false;
  }
  visibleLimit=12;
  syncSelectionUrl();
  renderProducts();
}

function showToast(message){
  toast.textContent=message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove("is-visible"),2200);
}

function renderAccountMain(){
  accountBody.innerHTML=`<div class="auth-panel"><div class="auth-content">
    <p class="auth-kicker">Добро пожаловать в FLUIDE</p>
    <h3 class="auth-title">Войти или<br>зарегистрироваться</h3>
    <p class="auth-subtitle">Сохраняйте избранное, историю заказов<br>и персональные рекомендации.</p>
    <p class="auth-method-label">Войти с помощью</p>
    <div class="auth-providers">
      <button class="auth-provider" type="button" data-auth-provider="Яндекс ID"><span><img src="assets/icons/yandex-id.svg" alt=""></span><b>Яндекс ID</b></button>
      <button class="auth-provider" type="button" data-auth-provider="VK ID"><span><img src="assets/icons/vk-id.svg?v=2" alt=""></span><b>VK ID</b></button>
    </div>
    <div class="auth-divider"><span>или</span></div>
    <button class="auth-phone-button" type="button" data-auth-phone>По номеру телефона</button>
  </div><p class="auth-legal">При входе и регистрации я даю <button type="button" data-auth-privacy>согласие на обработку своих персональных данных</button> в соответствии с политикой обработки персональных данных.</p></div>`;
}

function renderAccountPhone(){
  accountBody.innerHTML=`<div class="auth-panel auth-panel--phone"><div class="auth-content">
    <button class="auth-back" type="button" data-auth-back>← Вернуться</button>
    <p class="auth-kicker">Вход по номеру телефона</p>
    <h3 class="auth-title">Введите номер</h3>
    <p class="auth-subtitle">Отправим код подтверждения.<br>Бэкенд подключим на следующем этапе.</p>
    <form data-auth-form><label for="auth-phone">Номер телефона</label><input id="auth-phone" name="phone" type="tel" value="+7 " autocomplete="tel" inputmode="tel"><button class="auth-phone-button" type="submit">Получить код</button><p id="auth-phone-status" role="status"></p></form>
  </div></div>`;
  accountBody.querySelector("#auth-phone")?.focus();
}

function openAccount(){
  closeFilter();
  closeCart();
  renderAccountMain();
  accountDialog.showModal();
  document.body.classList.add("is-locked");
}

function closeAccount(){
  if(accountDialog.open)accountDialog.close();
}

function saveFavorites(){localStorage.setItem("fluide-favorites",JSON.stringify(favorites))}
function saveCart(){localStorage.setItem("fluide-cart",JSON.stringify(cart))}

function toggleFavorite(key){
  favorites=favorites.includes(key)?favorites.filter(value=>value!==key):[...favorites,key];
  saveFavorites();
  renderProducts();
  showToast(favorites.includes(key)?"Добавлено в избранное":"Удалено из избранного");
}

function openVolumeSelector(id){
  const fragrance=fragrances.find(item=>item.id===id);
  if(!fragrance)return;
  selectedFragranceId=id;
  const title=prettyTitle(fragrance.title);
  const cardName=`FLUIDE ${Number(fragrance.id)} ${title}`;
  volumeContent.innerHTML=`<div class="volume-product"><img src="${escapeHtml(fragrance.image||"assets/brand/logo-blue.svg")}" alt="${escapeHtml(cardName)}"><div><h3>${escapeHtml(cardName)}</h3><p>По мотивам ${escapeHtml(fragrance.original)}</p></div></div><p class="volume-label">Доступные объёмы</p><div class="volume-options">${variantsFor(fragrance).map(variant=>`<button class="volume-option" type="button" data-volume="${variant.size}" data-analytics-add data-product-key="${escapeHtml(fragrance.id)}"><span><strong>${variant.volume}</strong><small>В наличии</small></span><b>${formatPriceMarkup(variant.price)}</b></button>`).join("")}</div>`;
  volumeDialog.showModal();
}

function addToCart(id,size){
  const fragrance=fragrances.find(item=>item.id===id);
  if(!fragrance)return;
  const variant=variantsFor(fragrance).find(item=>item.size===size);
  if(!variant)return;
  const key=`${productId(fragrance)}-${size}`;
  const existing=cart.find(item=>item.id===key);
  const snapshot={name:`FLUIDE ${Number(fragrance.id)} ${prettyTitle(fragrance.title)} · ${variant.volume}`,price:variant.price,image:fragrance.image||"assets/brand/logo-blue.svg",category:`Парфюм · ${variant.volume}`};
  if(existing){existing.quantity+=1;existing.product=snapshot}else cart.push({id:key,quantity:1,product:snapshot});
  saveCart();renderCart();showToast(`${prettyTitle(fragrance.title)}, ${variant.volume} — в корзине`);
}

function addCatalogProduct(id){
  const product=catalogProducts.find(item=>item.id===id);
  if(!product)return;
  const existing=cart.find(item=>item.id===product.id);
  const snapshot={name:product.title,price:getPrice(product),image:product.image,category:[product.typeLabel,product.volume].filter(Boolean).join(" · ")};
  if(existing){existing.quantity+=1;existing.product=snapshot}else cart.push({id:product.id,quantity:1,product:snapshot});
  saveCart();
  renderCart();
  showToast(`${product.title} — в корзине`);
}

function renderCart(){
  const detailed=cart.map((item,index)=>({item,index,product:item.product||HOME_PRODUCT_SNAPSHOTS[item.id]||null})).filter(row=>row.product);
  const quantity=cart.reduce((sum,item)=>sum+(Number(item.quantity)||0),0);
  const promotion=window.FluidePromotions?.calculate(cart)||{total:detailed.reduce((sum,row)=>sum+row.product.price*row.item.quantity,0),discount:0,giftItemIds:[]};
  cartCount.textContent=quantity||"";
  cartCount.hidden=quantity===0;
  cartFooter.hidden=detailed.length===0;
  cartTotal.innerHTML=formatPriceMarkup(promotion.total);
  cartItems.innerHTML=detailed.length?`${window.FluidePromotions?.bannerMarkup()||""}${detailed.map(({item,index,product})=>`<div class="cart-row"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}"><div class="cart-row-copy"><h3>${escapeHtml(product.name)}</h3>${promotion.giftItemCounts?.[String(item.id)]?`<span class="cart-gift-label">Подарок по акции 3+1</span>`:""}</div><button type="button" data-remove-cart="${escapeHtml(item.id)}" aria-label="Удалить ${escapeHtml(product.name)}"><svg><use href="assets/icons/lucide.svg#x"></use></svg></button><div class="cart-quantity"><button type="button" data-cart-index="${index}" data-cart-delta="-1" aria-label="Уменьшить количество" ${Number(item.quantity)<=1?"disabled":""}><svg><use href="assets/icons/lucide.svg#minus"></use></svg></button><span>${item.quantity}</span><button type="button" data-cart-index="${index}" data-cart-delta="1" aria-label="Увеличить количество"><svg><use href="assets/icons/lucide.svg#plus"></use></svg></button></div><div class="cart-row-total">${promotion.giftItemCounts?.[String(item.id)]?`<del>${formatPriceMarkup(Number(product.price)*Number(item.quantity))}</del><strong>${formatPriceMarkup(Number(product.price)*(Number(item.quantity)-promotion.giftItemCounts[String(item.id)]))}</strong>`:`<strong>${formatPriceMarkup(Number(product.price)*Number(item.quantity))}</strong>`}</div></div>`).join("")}<a class="cart-continue" href="catalog.html"><span>Продолжить выбор</span><svg aria-hidden="true"><use href="assets/icons/lucide.svg#move-right"></use></svg></a>${window.FluidePromotions?.totalsMarkup(promotion,formatPriceMarkup)||`<div class="cart-total"><span>Итого</span><span>${formatPriceMarkup(promotion.total)}</span></div>`}`:`<div class="cart-empty"><div class="cart-empty-content"><p>В корзине пока пусто</p><small>Добавьте аромат из коллекции</small><a class="cart-continue" href="catalog.html"><span>Продолжить выбор</span><svg aria-hidden="true"><use href="assets/icons/lucide.svg#move-right"></use></svg></a></div></div>`;
  if(detailed.length)window.FluidePromotions?.setupCompactFooter(cartItems,cartFooter,promotion,formatPriceMarkup);
}

function openCart(){
  closeFilter();
  cartDrawer.classList.add("is-open");cartDrawer.setAttribute("aria-hidden","false");backdrop.classList.add("is-open");document.body.classList.add("is-locked");
}
function closeCart(){cartDrawer.classList.remove("is-open");cartDrawer.setAttribute("aria-hidden","true");backdrop.classList.remove("is-open");document.body.classList.remove("is-locked")}
function openFilter(){closeCart();filterPanel.classList.add("is-open");filterPanel.setAttribute("aria-hidden","false");filterToggle.setAttribute("aria-expanded","true");backdrop.classList.add("is-filter-open");document.body.classList.add("is-locked");filterClose.focus()}
function closeFilter(){filterPanel.classList.remove("is-open");filterPanel.setAttribute("aria-hidden","true");filterToggle.setAttribute("aria-expanded","false");backdrop.classList.remove("is-filter-open");if(!cartDrawer.classList.contains("is-open"))document.body.classList.remove("is-locked")}

function openInfo(type){
  const content={
    delivery:{title:"Доставка и оплата",html:"<p>Заказ можно оформить с доставкой по России или самовывозом во Владимире.</p><p>Стоимость доставки и способ оплаты менеджер подтвердит после оформления.</p>"},
    contacts:{title:"Связаться с FLUIDE",html:"<p>FLUIDE Atelier — парфюмерный бренд из Владимира.</p><p>Контакты и часы работы будут добавлены после подтверждения командой бренда.</p>"},
    privacy:{title:"Персональные данные",html:"<p>Корзина, избранное и выбор cookie сохраняются локально в вашем браузере.</p><p>Контакты и адрес из формы используются только для обработки и доставки заказа.</p>"}
  }[type];
  if(!content)return;
  infoTitle.textContent=content.title;
  infoContent.innerHTML=content.html;
  infoDialog.showModal();
}

document.querySelectorAll(".filter-panel input").forEach(input=>input.addEventListener("change",()=>{visibleLimit=12;syncSelectionUrl();renderProducts()}));
document.querySelectorAll(".reset-filters").forEach(button=>button.addEventListener("click",resetFilters));
document.querySelector(".apply-filters").addEventListener("click",closeFilter);
catalogCategoryButtons.forEach(button=>button.addEventListener("click",()=>setCatalogSection(button.dataset.catalogSection)));
searchInput.addEventListener("input",()=>{visibleLimit=12;syncSelectionUrl();renderProducts()});
function closeSortMenu(){
  sortMenu.hidden=true;
  sortControl.classList.remove("is-open");
  sortTrigger.setAttribute("aria-expanded","false");
}

function openSortMenu(){
  sortMenu.hidden=false;
  sortControl.classList.add("is-open");
  sortTrigger.setAttribute("aria-expanded","true");
}

sortSelect.addEventListener("change",()=>{
  visibleLimit=12;
  sortValue.textContent=sortSelect.options[sortSelect.selectedIndex].textContent;
  syncSelectionUrl();
  renderProducts();
});
sortTrigger.addEventListener("click",()=>{
  if(sortMenu.hidden)openSortMenu();
  else closeSortMenu();
});
sortMenu.addEventListener("click",event=>{
  const option=event.target.closest("[data-sort-value]");
  if(!option)return;
  sortSelect.value=option.dataset.sortValue;
  sortMenu.querySelectorAll('[role="option"]').forEach(item=>item.setAttribute("aria-selected",String(item===option)));
  sortSelect.dispatchEvent(new Event("change"));
  closeSortMenu();
  sortTrigger.focus();
});
document.addEventListener("click",event=>{
  if(!sortControl.contains(event.target))closeSortMenu();
});
document.addEventListener("keydown",event=>{
  if(event.key==="Escape")closeSortMenu();
});
loadMore.addEventListener("click",()=>{visibleLimit+=12;renderProducts()});
filterToggle.addEventListener("click",openFilter);
filterClose.addEventListener("click",closeFilter);
cartButton.addEventListener("click",openCart);
cartClose.addEventListener("click",closeCart);
loginButton.addEventListener("click",openAccount);
document.querySelector("[data-account-close]").addEventListener("click",closeAccount);
accountDialog.addEventListener("close",()=>{if(!cartDrawer.classList.contains("is-open")&&!filterPanel.classList.contains("is-open"))document.body.classList.remove("is-locked")});
accountDialog.addEventListener("click",event=>{if(event.target===accountDialog)closeAccount()});
accountBody.addEventListener("click",event=>{
  const provider=event.target.closest("[data-auth-provider]");
  if(provider){showToast(`${provider.dataset.authProvider}: подключим авторизацию на следующем этапе`);return}
  if(event.target.closest("[data-auth-phone]")){renderAccountPhone();return}
  if(event.target.closest("[data-auth-back]")){renderAccountMain();return}
  if(event.target.closest("[data-auth-privacy]")){closeAccount();openInfo("privacy")}
});
accountBody.addEventListener("submit",event=>{
  if(!event.target.matches("[data-auth-form]"))return;
  event.preventDefault();
  accountBody.querySelector("#auth-phone-status").textContent="Визуальная версия готова. Отправку кода подключим вместе с бэкендом.";
});
backdrop.addEventListener("click",()=>{closeFilter();closeCart()});
document.querySelector(".focus-search").addEventListener("click",()=>{searchInput.focus();searchInput.scrollIntoView({behavior:"smooth",block:"center"})});
favoritesButton.addEventListener("click",()=>{favoritesOnly=!favoritesOnly;visibleLimit=12;syncSelectionUrl();renderProducts()});
menuToggle.addEventListener("click",()=>{const open=mobileNav.classList.toggle("is-open");menuToggle.setAttribute("aria-expanded",String(open))});
mobileNav.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>{mobileNav.classList.remove("is-open");menuToggle.setAttribute("aria-expanded","false")}));
activeFilters.addEventListener("click",event=>{const button=event.target.closest("[data-remove-filter]");if(button)removeFilter(button.dataset.removeFilter,button.dataset.removeValue)});

grid.addEventListener("click",event=>{
  const favorite=event.target.closest("[data-favorite]");
  const add=event.target.closest("[data-add]");
  const addProduct=event.target.closest("[data-add-product]");
  if(favorite){event.stopPropagation();toggleFavorite(favorite.dataset.favorite);return}
  if(addProduct){event.stopPropagation();addCatalogProduct(addProduct.dataset.addProduct);return}
  if(add){event.stopPropagation();openVolumeSelector(add.dataset.add);return}
});
volumeContent.addEventListener("click",event=>{const button=event.target.closest("[data-volume]");if(!button)return;addToCart(selectedFragranceId,button.dataset.volume);volumeDialog.close()});
document.querySelector(".volume-close").addEventListener("click",()=>volumeDialog.close());
document.querySelector(".info-close").addEventListener("click",()=>infoDialog.close());
[volumeDialog,infoDialog].forEach(dialog=>dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close()}));
cartItems.addEventListener("click",event=>{const quantityButton=event.target.closest("[data-cart-index]");if(quantityButton){const row=cart[Number(quantityButton.dataset.cartIndex)];if(row){row.quantity=(Number(row.quantity)||0)+Number(quantityButton.dataset.cartDelta);cart=cart.filter(item=>item.quantity>0);saveCart();renderCart()}return}const button=event.target.closest("[data-remove-cart]");if(!button)return;cart=cart.filter(item=>item.id!==button.dataset.removeCart);saveCart();renderCart()});
document.addEventListener("keydown",event=>{if(event.key!=="Escape")return;closeFilter();closeCart()});
document.querySelectorAll("[data-info]").forEach(button=>button.addEventListener("click",()=>openInfo(button.dataset.info)));

const serviceMessages=["Доставка по России · бесплатно от 5 000 ₽","Три любимых аромата по цене двух","Откройте свой аромат с FLUIDE"];
let serviceIndex=0;
document.querySelectorAll("[data-service]").forEach(button=>button.addEventListener("click",()=>{serviceIndex=(serviceIndex+Number(button.dataset.service)+serviceMessages.length)%serviceMessages.length;document.querySelector("#service-message").textContent=serviceMessages[serviceIndex]}));

const cookie=document.querySelector(".cookie");
try{cookie.hidden=localStorage.getItem("fluide-cookie-consent")==="accepted"}catch{cookie.hidden=false}
document.querySelector("[data-cookie-accept]").addEventListener("click",()=>{try{localStorage.setItem("fluide-cookie-consent","accepted")}catch{}cookie.hidden=true});
document.querySelector("[data-cookie-settings]").addEventListener("click",()=>{cookie.hidden=false});

async function fetchJsonWithRetry(url){
  let lastError;
  for(let attempt=0;attempt<2;attempt+=1){
    try{
      const response=await fetch(url,{cache:attempt===0?"no-cache":"reload"});
      if(!response.ok)throw new Error(`${url}: HTTP ${response.status}`);
      return await response.json();
    }catch(error){
      lastError=error;
    }
  }
  throw lastError;
}

async function initCatalog(){
  renderCart();
  initializeFiltersFromUrl();
  try{
    const catalog=await window.FluideCatalogData.load();
    fragrances=catalog.fragrances;
    catalogProducts=catalog.products;
    try{
      const prices=catalog.prices||{};
      PRICE_BY_SIZE={"30":{...PRICE_BY_SIZE["30"],...(prices.perfume?.["30"]||{})},"50":{...PRICE_BY_SIZE["50"],...(prices.perfume?.["50"]||{})}};
    }catch(priceError){
      console.warn("Используются резервные цены каталога",priceError);
    }
    fragrances=fragrances.filter(item=>item?.id);
    catalogProducts=catalogProducts.filter(item=>item?.id&&item?.productType&&item?.image);
    renderCatalogSectionCounts();
    const retryButton=emptyState.querySelector(".reset-filters");
    emptyState.querySelector("h3").textContent="Ничего не найдено";
    emptyState.querySelector("p").textContent="Попробуйте изменить фильтры или очистить строку поиска.";
    retryButton.textContent="Сбросить фильтры";
    retryButton.onclick=null;
    renderProducts();
    renderCart();
    focusLoadedSelectionResults();
  }catch(error){
    resultCount.textContent="Не удалось загрузить каталог";
    emptyState.hidden=false;
    emptyState.querySelector("h3").textContent="Каталог временно недоступен";
    emptyState.querySelector("p").textContent="Обновите страницу или попробуйте немного позже.";
    const retryButton=emptyState.querySelector(".reset-filters");
    retryButton.textContent="Повторить загрузку";
    retryButton.onclick=()=>initCatalog();
    console.error(error);
  }
}

initCatalog();
