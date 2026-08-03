let PRICE_BY_CATEGORY = {"Люкс":1990,"Суперлюкс":2490,"Селектив":3490};
const CARD_COLORS = ["#f2dfda","#dfe8f0","#eee7dc","#eadde2","#dfe5da","#e6e1ef"];
const OCCASION_LABELS = {everyday:"На каждый день",evening:"Вечер",date:"Свидание",gym:"Спорт",walk:"Прогулка"};
const SEASON_LABELS = {spring:"Весна",summer:"Лето",autumn:"Осень",winter:"Зима"};
const GENDER_LABELS = {женский:"Для неё",мужской:"Для него",унисекс:"Унисекс"};
const FILTER_LABELS = {...OCCASION_LABELS,...SEASON_LABELS,женский:"Для неё",мужской:"Для него",унисекс:"Унисекс"};
const HOME_PRODUCT_SNAPSHOTS = {
  matsukita:{name:"Matsukita",price:1990,image:"assets/product-line/fragrance-matsukita-card.png"},
  cashmere:{name:"Cashmere",price:1350,image:"assets/product-line/diffuser-cashmere.png"},
  "devils-intrigue":{name:"Devils Intrigue",price:650,image:"assets/product-line/hair-spray-devils-intrigue.png"},
  auto:{name:"Car Scent",price:300,image:"assets/product-line/car-fragrance.png"},
  cherry:{name:"Cherry",price:1990,image:"assets/product-line/fragrance-cherry.png"},
  hayati:{name:"Hayati",price:3490,image:"assets/product-line/fragrance-hayati.png"},
  "musk-kashmir":{name:"Musk Kashmir",price:3490,image:"assets/product-line/fragrance-musk-kashmir.png"},
  "sea-salt":{name:"Sea Salt",price:550,image:"assets/product-line/home-perfume-sea-salt.png"},
  "matsukita-solid":{name:"Matsukita Solid",price:990,image:"assets/product-line/solid-perfume-matsukita.png"},
  ballerina:{name:"Ballerina",price:890,image:"assets/product-line/candle-ballerina.png"},
  "black-pepper":{name:"Black Pepper",price:3490,image:"assets/product-line/fragrance-black-pepper.png"},
  white:{name:"White",price:1990,image:"assets/product-line/fragrance-white.png"}
};

const grid = document.querySelector(".fragrance-grid");
const resultCount = document.querySelector(".result-count");
const emptyState = document.querySelector(".catalog-empty");
const loadMore = document.querySelector(".load-more");
const searchInput = document.querySelector("#catalog-search");
const sortSelect = document.querySelector("#catalog-sort");
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
const favoritesButton = document.querySelector(".favorites-button");
const menuToggle = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector(".mobile-nav");
const toast = document.querySelector(".toast");

let fragrances = [];
let visibleLimit = 12;
let favoritesOnly = false;
let toastTimer;
let favorites = JSON.parse(localStorage.getItem("fluide-favorites") || "[]");
let cart = JSON.parse(localStorage.getItem("fluide-cart") || "[]");

const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const normalize = value => String(value ?? "").toLocaleLowerCase("ru-RU").replace(/ё/g,"е").trim();
const formatPrice = value => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
const productId = fragrance => `fragrance-${fragrance.id}`;

function prettyTitle(value){
  return String(value || "")
    .replace(/^\d+\s+/,"")
    .toLocaleLowerCase("ru-RU")
    .replace(/(^|[\s-])([a-zа-яё])/giu,(match,space,letter)=>`${space}${letter.toLocaleUpperCase("ru-RU")}`);
}

function getPrice(fragrance){return PRICE_BY_CATEGORY[fragrance.category] || 1990}

function allNotes(fragrance){
  const notes = fragrance.notes || {};
  return [...(notes.top||[]),...(notes.middle||[]),...(notes.base||[]),...(notes.main||[])];
}

function noteSummary(fragrance){
  return allNotes(fragrance).filter(Boolean).slice(0,3).join(" · ") || fragrance.group || "Парфюмерная композиция";
}

function cardColor(fragrance){
  const number = Number.parseInt(fragrance.id,10) || 0;
  return CARD_COLORS[number % CARD_COLORS.length];
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

function currentFiltered(){
  const query = normalize(searchInput.value);
  const gender = getGender();
  const categories = getChecked("category");
  const families = getChecked("family");
  const occasions = getChecked("occasion");
  const seasons = getChecked("season");

  const filtered = fragrances.filter(item=>{
    const searchText = normalize([
      item.id,item.name,item.title,item.original,item.group,item.category,item.gender,item.notesRaw,
      ...(item.families||[]),...(item.accords||[]).map(accord=>accord.name)
    ].join(" "));
    if(query && !searchText.includes(query))return false;
    if(gender && item.gender !== gender)return false;
    if(!matchesAny(item.category,categories))return false;
    if(!matchesAny(item.families,families))return false;
    if(!matchesAny(item.occasion,occasions))return false;
    if(!matchesAny(item.season,seasons))return false;
    if(favoritesOnly && !favorites.includes(productId(item)))return false;
    return true;
  });

  const sorted = [...filtered];
  switch(sortSelect.value){
    case "number": sorted.sort((a,b)=>Number(a.id)-Number(b.id)); break;
    case "name": sorted.sort((a,b)=>prettyTitle(a.title).localeCompare(prettyTitle(b.title),"ru")); break;
    case "price-asc": sorted.sort((a,b)=>getPrice(a)-getPrice(b)||Number(a.id)-Number(b.id)); break;
    case "price-desc": sorted.sort((a,b)=>getPrice(b)-getPrice(a)||Number(a.id)-Number(b.id)); break;
    default: sorted.sort((a,b)=>{
      const order={"Селектив":0,"Суперлюкс":1,"Люкс":2};
      return (order[a.category]??3)-(order[b.category]??3)||Number(a.id)-Number(b.id);
    });
  }
  return sorted;
}

function cardTemplate(fragrance){
  const id = productId(fragrance);
  const active = favorites.includes(id);
  const title = prettyTitle(fragrance.title);
  return `<article class="fragrance-card" data-id="${escapeHtml(fragrance.id)}">
    <div class="fragrance-media-shell">
      <a class="fragrance-media" style="--card-bg:${cardColor(fragrance)}" href="product.html?id=${encodeURIComponent(fragrance.id)}" aria-label="Открыть страницу аромата ${escapeHtml(title)}">
        <span class="fragrance-badge">${escapeHtml(fragrance.category)}</span>
        ${productVisual(fragrance)}
      </a>
      <button class="favorite-toggle ${active?"is-active":""}" type="button" data-favorite="${escapeHtml(fragrance.id)}" aria-label="${active?"Удалить из избранного":"Добавить в избранное"}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 5.8c-1.5-1.8-4.4-1.7-5.9 0L12 8.7 9.3 5.8c-1.5-1.7-4.4-1.8-5.9 0-1.8 2.1-1.4 5.2.5 7.1L12 21l8.1-8.1c1.9-1.9 2.3-5 .5-7.1Z"></path></svg>
      </button>
    </div>
    <div class="fragrance-info">
      <div class="fragrance-kicker"><span>№ ${escapeHtml(fragrance.id)} · ${escapeHtml(GENDER_LABELS[fragrance.gender]||fragrance.gender)}</span><span>${escapeHtml(fragrance.concentration||"Eau de parfum")}</span></div>
      <div class="fragrance-title-row"><h3>FLUIDE ${escapeHtml(title)}</h3><strong>${formatPrice(getPrice(fragrance))}</strong></div>
      <p class="fragrance-original">Вдохновлён: ${escapeHtml(fragrance.original)}</p>
      <p class="fragrance-notes">${escapeHtml(noteSummary(fragrance))}</p>
      <div class="card-actions"><a class="details-button" href="product.html?id=${encodeURIComponent(fragrance.id)}">Подробнее</a><button class="add-button" type="button" data-add="${escapeHtml(fragrance.id)}">В корзину</button></div>
    </div>
  </article>`;
}

function renderProducts(){
  const filtered = currentFiltered();
  const shown = filtered.slice(0,visibleLimit);
  grid.innerHTML = shown.map(cardTemplate).join("");
  resultCount.textContent = `${filtered.length} ${plural(filtered.length,"аромат","аромата","ароматов")}`;
  document.querySelector(".total-fragrances").textContent = `${fragrances.length} ${plural(fragrances.length,"аромат","аромата","ароматов")}`;
  emptyState.hidden = filtered.length !== 0;
  grid.hidden = filtered.length === 0;
  loadMore.hidden = shown.length >= filtered.length;
  renderActiveFilters();
}

function plural(number,one,few,many){
  const mod10=number%10,mod100=number%100;
  if(mod10===1&&mod100!==11)return one;
  if(mod10>=2&&mod10<=4&&(mod100<12||mod100>14))return few;
  return many;
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
  activeFilters.innerHTML=entries.map(entry=>`<button class="active-chip" type="button" data-remove-filter="${escapeHtml(entry.name)}" data-remove-value="${escapeHtml(entry.value)}">${escapeHtml(entry.label)} <span>×</span></button>`).join("");
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
  visibleLimit=12;
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
  renderProducts();
}

function showToast(message){
  toast.textContent=message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove("is-visible"),2200);
}

function saveFavorites(){localStorage.setItem("fluide-favorites",JSON.stringify(favorites))}
function saveCart(){localStorage.setItem("fluide-cart",JSON.stringify(cart))}

function toggleFavorite(id){
  const key=`fragrance-${id}`;
  favorites=favorites.includes(key)?favorites.filter(value=>value!==key):[...favorites,key];
  saveFavorites();
  renderProducts();
  showToast(favorites.includes(key)?"Добавлено в избранное":"Удалено из избранного");
}

function addToCart(id){
  const fragrance=fragrances.find(item=>item.id===id);
  if(!fragrance)return;
  const key=`${productId(fragrance)}-30`;
  const existing=cart.find(item=>item.id===key);
  const snapshot={name:`FLUIDE ${prettyTitle(fragrance.title)} · 30 мл`,price:getPrice(fragrance),image:fragrance.image||"assets/brand/logo-blue.svg",category:"Парфюм · 30 мл"};
  if(existing){existing.quantity+=1;existing.product=snapshot}else cart.push({id:key,quantity:1,product:snapshot});
  saveCart();renderCart();showToast("Аромат добавлен в корзину");
}

function renderCart(){
  const detailed=cart.map(item=>({item,product:item.product||HOME_PRODUCT_SNAPSHOTS[item.id]||null})).filter(row=>row.product);
  const quantity=cart.reduce((sum,item)=>sum+(Number(item.quantity)||0),0);
  const total=detailed.reduce((sum,row)=>sum+row.product.price*row.item.quantity,0);
  cartCount.textContent=quantity;
  cartTotal.textContent=formatPrice(total);
  cartItems.innerHTML=detailed.length?detailed.map(({item,product})=>`<div class="cart-item"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}"><div><h3>${escapeHtml(product.name)}</h3><p>${item.quantity} × ${formatPrice(product.price)}</p></div><button class="cart-remove" type="button" data-remove-cart="${escapeHtml(item.id)}" aria-label="Удалить товар">×</button></div>`).join(""):`<div class="cart-empty"><div><p>В корзине пока пусто</p><small>Добавьте аромат из коллекции</small></div></div>`;
}

function openCart(){
  closeFilter();
  cartDrawer.classList.add("is-open");cartDrawer.setAttribute("aria-hidden","false");backdrop.classList.add("is-open");document.body.classList.add("is-locked");
}
function closeCart(){cartDrawer.classList.remove("is-open");cartDrawer.setAttribute("aria-hidden","true");backdrop.classList.remove("is-open");document.body.classList.remove("is-locked")}
function openFilter(){filterPanel.classList.add("is-open");filterToggle.setAttribute("aria-expanded","true");backdrop.classList.add("is-filter-open");document.body.classList.add("is-locked")}
function closeFilter(){filterPanel.classList.remove("is-open");filterToggle.setAttribute("aria-expanded","false");backdrop.classList.remove("is-filter-open");if(!cartDrawer.classList.contains("is-open"))document.body.classList.remove("is-locked")}

document.querySelectorAll(".filter-panel input").forEach(input=>input.addEventListener("change",()=>{visibleLimit=12;renderProducts()}));
document.querySelectorAll(".reset-filters").forEach(button=>button.addEventListener("click",resetFilters));
document.querySelector(".apply-filters").addEventListener("click",closeFilter);
searchInput.addEventListener("input",()=>{visibleLimit=12;renderProducts()});
sortSelect.addEventListener("change",()=>{visibleLimit=12;renderProducts()});
loadMore.addEventListener("click",()=>{visibleLimit+=12;renderProducts()});
filterToggle.addEventListener("click",openFilter);
filterClose.addEventListener("click",closeFilter);
cartButton.addEventListener("click",openCart);
cartClose.addEventListener("click",closeCart);
backdrop.addEventListener("click",()=>{closeFilter();closeCart()});
document.querySelector(".focus-search").addEventListener("click",()=>{searchInput.focus();searchInput.scrollIntoView({behavior:"smooth",block:"center"})});
favoritesButton.addEventListener("click",()=>{favoritesOnly=!favoritesOnly;visibleLimit=12;renderProducts()});
menuToggle.addEventListener("click",()=>{const open=mobileNav.classList.toggle("is-open");menuToggle.setAttribute("aria-expanded",String(open))});
mobileNav.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>{mobileNav.classList.remove("is-open");menuToggle.setAttribute("aria-expanded","false")}));
activeFilters.addEventListener("click",event=>{const button=event.target.closest("[data-remove-filter]");if(button)removeFilter(button.dataset.removeFilter,button.dataset.removeValue)});

grid.addEventListener("click",event=>{
  const favorite=event.target.closest("[data-favorite]");
  const add=event.target.closest("[data-add]");
  if(favorite){event.stopPropagation();toggleFavorite(favorite.dataset.favorite);return}
  if(add){event.stopPropagation();addToCart(add.dataset.add);return}
});
cartItems.addEventListener("click",event=>{const button=event.target.closest("[data-remove-cart]");if(!button)return;cart=cart.filter(item=>item.id!==button.dataset.removeCart);saveCart();renderCart()});
document.addEventListener("keydown",event=>{if(event.key!=="Escape")return;closeFilter();closeCart()});

async function initCatalog(){
  try{
    const [fragrancesResponse,pricesResponse]=await Promise.all([fetch("data/fragrances.json"),fetch("data/prices.json")]);
    if(!fragrancesResponse.ok)throw new Error(`HTTP ${fragrancesResponse.status}`);
    fragrances=await fragrancesResponse.json();
    if(pricesResponse.ok){const prices=await pricesResponse.json();PRICE_BY_CATEGORY={...PRICE_BY_CATEGORY,...(prices.perfume?.["30"]||{})}}
    fragrances=fragrances.filter(item=>item?.id);
    renderProducts();
    renderCart();
  }catch(error){
    resultCount.textContent="Не удалось загрузить каталог";
    emptyState.hidden=false;
    emptyState.querySelector("h3").textContent="Каталог временно недоступен";
    emptyState.querySelector("p").textContent="Обновите страницу или попробуйте немного позже.";
    console.error(error);
  }
}

initCatalog();
