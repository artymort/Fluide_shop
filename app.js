const products = [
  {id:"matsukita",name:"Matsukita",category:"perfume",categoryLabel:"Парфюм · 30 мл",description:"Мускус · розовый перец · кедр",badge:"Бестселлер",price:1990,image:"assets/product-line/fragrance-matsukita-card.png",color:"#f4f0e6",notes:"Мускус, розовый перец, кедр",volume:"30 мл",isNew:false},
  {id:"cashmere",name:"Cashmere",category:"home",categoryLabel:"Диффузор · 100 мл",description:"Кашемир · сандал · белый мускус",badge:"Хит",price:1350,image:"assets/product-line/diffuser-cashmere.png",color:"#dce8ed",notes:"Кашемир, сандал, белый мускус",volume:"100 мл",isNew:false},
  {id:"devils-intrigue",name:"Devils Intrigue",category:"care",categoryLabel:"Спрей для волос · 200 мл",description:"Пион · амбра · древесные ноты",badge:"Новинка",price:650,image:"assets/product-line/hair-spray-devils-intrigue.png",color:"#efd9d8",notes:"Пион, амбра, древесные ноты",volume:"200 мл",isNew:true},
  {id:"auto",name:"Car Scent",category:"auto",categoryLabel:"Автопарфюм",description:"Чистый древесно-мускусный аромат",badge:"Новинка",price:300,image:"assets/product-line/car-fragrance.png",color:"#e7eadb",notes:"Кедр, мускус, свежий воздух",volume:"6 мл",isNew:true},
  {id:"cherry",name:"Cherry",category:"perfume",categoryLabel:"Парфюм · 30 мл",description:"Кислая вишня · малина · сандал",badge:"Бестселлер",price:1990,image:"assets/product-line/fragrance-cherry.png",color:"#f0ddd5",notes:"Вишня, малина, ваниль, сандал",volume:"30 мл",isNew:false},
  {id:"hayati",name:"Hayati",category:"perfume",categoryLabel:"Парфюм · 30 мл",description:"Малина · сливки · белый мускус",badge:"Селектив",price:3490,image:"assets/product-line/fragrance-hayati.png",color:"#edd6d8",notes:"Малина, сливки, ваниль, белый мускус",volume:"30 мл",isNew:false},
  {id:"musk-kashmir",name:"Musk Kashmir",category:"perfume",categoryLabel:"Парфюм · 30 мл",description:"Белый мускус · сандал · гардения",badge:"Селектив",price:3490,image:"assets/product-line/fragrance-musk-kashmir.png",color:"#dfe7ef",notes:"Белый мускус, белый перец, сандал",volume:"30 мл",isNew:true},
  {id:"sea-salt",name:"Sea Salt",category:"home",categoryLabel:"Парфюм для дома · 300 мл",description:"Морская соль · озон · белое дерево",badge:"Для дома",price:550,image:"assets/product-line/home-perfume-sea-salt.png",color:"#dce8ed",notes:"Морская соль, озон, белое дерево",volume:"300 мл",isNew:false},
  {id:"matsukita-solid",name:"Matsukita Solid",category:"perfume",categoryLabel:"Твёрдый парфюм · 15 мл",description:"Компактный ароматический ритуал",badge:"Мини-формат",price:990,image:"assets/product-line/solid-perfume-matsukita.png",color:"#eadfe3",notes:"Мускус, розовый перец, кедр",volume:"15 мл",isNew:true},
  {id:"ballerina",name:"Ballerina",category:"home",categoryLabel:"Аромасвеча · 100 мл",description:"Пудровые цветы · ваниль · кашемир",badge:"Атмосфера",price:890,image:"assets/product-line/candle-ballerina.png",color:"#eee6db",notes:"Пудровые цветы, ваниль, кашемир",volume:"100 мл",isNew:false},
  {id:"black-pepper",name:"Black Pepper",category:"perfume",categoryLabel:"Парфюм · 30 мл",description:"Чёрный перец · амбра · нероли",badge:"Селектив",price:3490,image:"assets/product-line/fragrance-black-pepper.png",color:"#e5e5dc",notes:"Чёрный перец, амбра, нероли",volume:"30 мл",isNew:false},
  {id:"white",name:"White",category:"perfume",categoryLabel:"Парфюм · 30 мл",description:"Грейпфрут · розмарин · ветивер",badge:"Люкс",price:1990,image:"assets/product-line/fragrance-white.png",color:"#e1e8e8",notes:"Грейпфрут, розмарин, кедр, ветивер",volume:"30 мл",isNew:false}
];

const grid = document.querySelector(".product-grid");
const filters = document.querySelectorAll(".filter");
const filterLinks = document.querySelectorAll("[data-filter-link]");
const productCount = document.querySelector(".product-count");
const showMore = document.querySelector(".show-more");
const menuToggle = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector(".mobile-nav");
const searchPanel = document.querySelector(".search-panel");
const searchOpen = document.querySelector(".search-open");
const searchClose = document.querySelector(".search-close");
const searchForm = document.querySelector(".search-form");
const searchInput = document.querySelector("#site-search");
const cartPanel = document.querySelector(".cart-panel");
const cartOpen = document.querySelector(".cart-open");
const cartClose = document.querySelector(".cart-close");
const cartItems = document.querySelector(".cart-items");
const cartCount = document.querySelector(".cart-count");
const cartTotal = document.querySelector(".cart-total");
const quickView = document.querySelector(".quick-view");
const quickContent = document.querySelector(".quick-content");
const quickClose = document.querySelector(".quick-close");
const backdrop = document.querySelector(".panel-backdrop");
const toast = document.querySelector(".toast");

let activeFilter = "all";
let searchQuery = "";
let expanded = false;
let toastTimer;
let favorites = JSON.parse(localStorage.getItem("fluide-favorites") || "[]");
let cart = JSON.parse(localStorage.getItem("fluide-cart") || "[]");

function formatPrice(value){return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`}

function visibleProducts(){
  return products.filter(product => {
    const matchesFilter = activeFilter === "all" || (activeFilter === "new" ? product.isNew : product.category === activeFilter);
    const haystack = `${product.name} ${product.categoryLabel} ${product.description} ${product.notes}`.toLowerCase();
    return matchesFilter && haystack.includes(searchQuery.toLowerCase());
  });
}

function productCard(product){
  const isFavorite = favorites.includes(product.id);
  return `<article class="product-card" data-id="${product.id}">
    <div class="product-media" style="--card-bg:${product.color}" data-quick="${product.id}" tabindex="0" role="button" aria-label="Открыть карточку ${product.name}">
      <span class="product-badge">${product.badge}</span>
      <button class="favorite ${isFavorite ? "is-active" : ""}" type="button" data-favorite="${product.id}" aria-label="Добавить ${product.name} в избранное">${isFavorite ? "♥" : "♡"}</button>
      <img src="${product.image}" alt="${product.name} FLUIDE" loading="lazy">
      <button class="product-buy" type="button" data-buy="${product.id}">Добавить в корзину</button>
    </div>
    <div class="product-copy">
      <p class="product-kicker">${product.categoryLabel}</p>
      <div class="product-title-row"><h3>${product.name}</h3><strong>${formatPrice(product.price)}</strong></div>
      <p class="product-description">${product.description}</p>
    </div>
  </article>`;
}

function renderProducts(){
  const matches = visibleProducts();
  const list = expanded || activeFilter !== "all" || searchQuery ? matches : matches.slice(0,8);
  grid.innerHTML = list.length ? list.map(productCard).join("") : `<div class="no-results">Ничего не найдено. Попробуйте изменить запрос или категорию.</div>`;
  productCount.textContent = `Показано ${list.length} из ${matches.length}`;
  showMore.hidden = matches.length <= 8 || activeFilter !== "all" || Boolean(searchQuery);
  showMore.textContent = expanded ? "Свернуть" : "Показать ещё";
}

function setFilter(filter){
  activeFilter = filter;
  expanded = false;
  filters.forEach(button => button.classList.toggle("is-active", button.dataset.filter === filter));
  renderProducts();
}

function showToast(message){
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

function saveCart(){localStorage.setItem("fluide-cart",JSON.stringify(cart))}
function saveFavorites(){localStorage.setItem("fluide-favorites",JSON.stringify(favorites))}

function addToCart(id){
  const item = cart.find(row => row.id === id);
  if(item)item.quantity += 1; else cart.push({id,quantity:1});
  saveCart(); renderCart();
  const product = products.find(row => row.id === id);
  showToast(`${product ? product.name : "Набор"} добавлен в корзину`);
}

function renderCart(){
  const detailed = cart.map(item => ({...item,product:products.find(product => product.id === item.id)})).filter(item => item.product);
  const quantity = detailed.reduce((sum,item) => sum + item.quantity,0);
  const total = detailed.reduce((sum,item) => sum + item.product.price * item.quantity,0);
  cartCount.textContent = quantity;
  cartTotal.textContent = formatPrice(total);
  cartItems.innerHTML = detailed.length ? detailed.map(({product,quantity}) => `<div class="cart-item">
    <img src="${product.image}" alt="${product.name}"><div><h3>${product.name}</h3><p>${quantity} × ${formatPrice(product.price)}</p></div><button class="cart-remove" type="button" data-remove="${product.id}" aria-label="Удалить ${product.name}">×</button>
  </div>`).join("") : `<div class="cart-empty"><div><p>В корзине пока пусто</p><small>Добавьте аромат или готовый ритуал</small></div></div>`;
}

function openLayer(layer){
  [searchPanel,cartPanel,quickView].forEach(panel => {if(panel !== layer){panel.classList.remove("is-open");panel.setAttribute("aria-hidden","true")}});
  layer.classList.add("is-open");layer.setAttribute("aria-hidden","false");backdrop.classList.add("is-open");document.body.classList.add("is-locked");
}

function closeLayers(){
  [searchPanel,cartPanel,quickView].forEach(panel => {panel.classList.remove("is-open");panel.setAttribute("aria-hidden","true")});
  backdrop.classList.remove("is-open");document.body.classList.remove("is-locked");
}

function openQuickView(id){
  const product = products.find(row => row.id === id); if(!product)return;
  quickContent.innerHTML = `<div class="quick-image" style="--quick-bg:${product.color}"><img src="${product.image}" alt="${product.name} FLUIDE"></div>
    <div class="quick-copy"><p class="eyebrow">${product.categoryLabel}</p><h2>${product.name}</h2><p class="quick-desc">${product.description}. Аромат FLUIDE для личного ритуала и настроения.</p><div class="quick-price">${formatPrice(product.price)}</div><div class="quick-meta"><div><span>Объём</span><strong>${product.volume}</strong></div><div><span>Ноты</span><strong>${product.notes}</strong></div></div><button class="button button--dark quick-add" type="button" data-buy="${product.id}">Добавить в корзину</button></div>`;
  openLayer(quickView);
}

filters.forEach(button => button.addEventListener("click",() => setFilter(button.dataset.filter)));
filterLinks.forEach(link => link.addEventListener("click",() => {
  setFilter(link.dataset.filterLink);
  mobileNav.classList.remove("is-open"); menuToggle.setAttribute("aria-expanded","false");
}));
showMore.addEventListener("click",() => {expanded = !expanded;renderProducts()});

grid.addEventListener("click",event => {
  const favoriteButton = event.target.closest("[data-favorite]");
  const buyButton = event.target.closest("[data-buy]");
  const quickButton = event.target.closest("[data-quick]");
  if(favoriteButton){event.stopPropagation();const id=favoriteButton.dataset.favorite;favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];saveFavorites();renderProducts();showToast(favorites.includes(id)?"Добавлено в избранное":"Удалено из избранного");return}
  if(buyButton){event.stopPropagation();addToCart(buyButton.dataset.buy);return}
  if(quickButton)openQuickView(quickButton.dataset.quick);
});
grid.addEventListener("keydown",event => {if((event.key==="Enter"||event.key===" ")&&event.target.dataset.quick)openQuickView(event.target.dataset.quick)});

document.addEventListener("click",event => {
  const buyButton = event.target.closest(".quick-add");if(buyButton){addToCart(buyButton.dataset.buy);closeLayers()}
  const removeButton = event.target.closest("[data-remove]");if(removeButton){cart=cart.filter(item=>item.id!==removeButton.dataset.remove);saveCart();renderCart()}
});

menuToggle.addEventListener("click",() => {const open=mobileNav.classList.toggle("is-open");menuToggle.setAttribute("aria-expanded",String(open))});
document.querySelectorAll(".mobile-nav a").forEach(link=>link.addEventListener("click",()=>{mobileNav.classList.remove("is-open");menuToggle.setAttribute("aria-expanded","false")}));
searchOpen.addEventListener("click",()=>{openLayer(searchPanel);setTimeout(()=>searchInput.focus(),200)});
searchClose.addEventListener("click",closeLayers);cartOpen.addEventListener("click",()=>openLayer(cartPanel));cartClose.addEventListener("click",closeLayers);quickClose.addEventListener("click",closeLayers);backdrop.addEventListener("click",closeLayers);
document.addEventListener("keydown",event=>{if(event.key==="Escape")closeLayers()});

searchForm.addEventListener("submit",event=>{event.preventDefault();searchQuery=searchInput.value.trim();activeFilter="all";filters.forEach(button=>button.classList.toggle("is-active",button.dataset.filter==="all"));renderProducts();closeLayers();document.querySelector("#catalog").scrollIntoView({behavior:"smooth"})});
document.querySelector(".favorite-open").addEventListener("click",()=>showToast(favorites.length?`В избранном: ${favorites.length}`:"В избранном пока пусто"));
document.querySelector(".subscribe-form").addEventListener("submit",event=>{event.preventDefault();event.currentTarget.reset();showToast("Спасибо! Вы в списке FLUIDE")});
document.querySelector(".checkout-button").addEventListener("click",()=>showToast(cart.length?"Оформление подключим на следующем этапе":"Сначала добавьте товары"));
document.querySelector(".finder-start").addEventListener("click",()=>{setFilter("perfume");document.querySelector("#catalog").scrollIntoView({behavior:"smooth"});showToast("Начнём с парфюмерной коллекции")});
document.querySelectorAll(".set-buy").forEach(button=>button.addEventListener("click",()=>{const ids=button.dataset.set==="home"?["cashmere","ballerina"]:["matsukita","devils-intrigue"];ids.forEach(addToCart)}));

function preventOrphans(){
  document.querySelectorAll("h1,h2,h3,.hero-text,.section-intro,.category-meta p").forEach(element=>{
    element.innerHTML=element.innerHTML.replace(/(^|\s)([А-Яа-яA-Za-z]{1,2})\s+(?=\S)/g,"$1$2&nbsp;");
  });
}

renderProducts();renderCart();preventOrphans();
