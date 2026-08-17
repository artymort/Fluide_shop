const products = [
  {id:"fragrance-001",name:"Amber Wood",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Кардамон · яблоко · лаванда",badge:"Селектив",price:3490,image:"images/fragrances/001.webp",color:"#dfe8f0",notes:"Кардамон, яблоко, лаванда",volume:"30 мл",isNew:false},
  {id:"fragrance-002",name:"Lucky Wish",category:"women",categoryLabel:"Парфюм · 30 мл",description:"Ледяной лимон · танжерин · помело",badge:"Селектив",price:3490,image:"images/fragrances/002.webp",color:"#eadde2",notes:"Ледяной лимон, танжерин, помело",volume:"30 мл",isNew:true},
  {id:"fragrance-006",name:"Hayati",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Малина · ягодные фрукты · ананас",badge:"Селектив",price:3490,image:"images/fragrances/006.webp",color:"#f2dfda",notes:"Малина, ягодные фрукты, ананас",volume:"30 мл",isNew:false},
  {id:"fragrance-007",name:"Musk Kashmir",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Белый мускус · белый перец · сандал",badge:"Селектив",price:3490,image:"images/fragrances/007.webp",color:"#dfe8f0",notes:"Белый мускус, белый перец, сандал",volume:"30 мл",isNew:false},
  {id:"fragrance-008",name:"Aurica",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Ананас · кедровая хвоя · мандарин",badge:"Селектив",price:3490,image:"images/fragrances/008.webp",color:"#eee7dc",notes:"Ананас, кедровая хвоя, мандарин",volume:"30 мл",isNew:true},
  {id:"fragrance-016",name:"Aventus",category:"men",categoryLabel:"Парфюм · 30 мл",description:"Бергамот · чёрная смородина · яблоко",badge:"Селектив",price:3490,image:"images/fragrances/016.webp",color:"#dfe5da",notes:"Бергамот, чёрная смородина, яблоко",volume:"30 мл",isNew:false},
  {id:"fragrance-021",name:"Escentric 02 Black",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Амброксан · Iso E Super · ирис",badge:"Селектив",price:3490,image:"images/fragrances/021.webp",color:"#e6e1ef",notes:"Амброксан, Iso E Super, ирис",volume:"30 мл",isNew:true},
  {id:"fragrance-022",name:"Escentric 02",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Амброксан · Iso E Super · ирис",badge:"Селектив",price:3490,image:"images/fragrances/022.webp",color:"#f2dfda",notes:"Амброксан, Iso E Super, ирис",volume:"30 мл",isNew:false},
  {id:"fragrance-023",name:"Games 1",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Бергамот · розовый перец · мандарин",badge:"Селектив",price:3490,image:"images/fragrances/023.webp",color:"#dfe8f0",notes:"Бергамот, розовый перец, мандарин",volume:"30 мл",isNew:false},
  {id:"fragrance-024",name:"Fleur Narcotique",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Личи · бергамот · персик",badge:"Селектив",price:3490,image:"images/fragrances/024.webp",color:"#eadde2",notes:"Личи, бергамот, персик",volume:"30 мл",isNew:true},
  {id:"fragrance-025",name:"Baccarat",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Шафран · жасмин · амбровое дерево",badge:"Селектив",price:3490,image:"images/fragrances/025.webp",color:"#eee7dc",notes:"Шафран, жасмин, амбровое дерево",volume:"30 мл",isNew:false},
  {id:"fragrance-026",name:"Ganymede",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Шафран · мандарин · османтус",badge:"Селектив",price:3490,image:"images/fragrances/026.webp",color:"#dfe5da",notes:"Шафран, мандарин, османтус",volume:"30 мл",isNew:false}
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
      <button class="favorite ${isFavorite ? "is-active" : ""}" type="button" data-favorite="${product.id}" aria-label="Добавить ${product.name} в избранное"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 4.5h9v15l-4.5-3-4.5 3v-15Z"></path></svg></button>
      <img src="${product.image}" alt="${product.name} FLUIDE" loading="lazy">
      <button class="product-buy" type="button" data-buy="${product.id}">Добавить в корзину</button>
    </div>
    <div class="product-copy">
      <div class="product-title-row"><h3>${product.name}</h3><strong>${formatPrice(product.price)}</strong></div>
      <p class="product-description">${product.description}</p>
    </div>
  </article>`;
}

function renderProducts(){
  const matches = visibleProducts();
  const visibleLimit = expanded ? 12 : 8;
  const list = matches.slice(0,visibleLimit);
  grid.innerHTML = list.length ? list.map(productCard).join("") : `<div class="no-results">Ничего не найдено. Попробуйте изменить запрос или категорию.</div>`;
  productCount.textContent = `Показано ${list.length} из ${matches.length}`;
  showMore.hidden = matches.length <= 8;
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
  const product = products.find(row => row.id === id);
  const item = cart.find(row => row.id === id);
  const snapshot = product ? {name:product.name,price:product.price,image:product.image,category:product.categoryLabel} : undefined;
  if(item){item.quantity += 1;if(!item.product&&snapshot)item.product=snapshot}else cart.push({id,quantity:1,product:snapshot});
  saveCart(); renderCart();
  showToast(`${product ? product.name : "Набор"} добавлен в корзину`);
}

function renderCart(){
  const detailed = cart.map(item => ({...item,product:products.find(product => product.id === item.id) || item.product})).filter(item => item.product);
  const quantity = cart.reduce((sum,item) => sum + item.quantity,0);
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
    <div class="quick-copy"><h2>${product.name}</h2><p class="quick-desc">${product.description}. Аромат FLUIDE для личного ритуала и настроения.</p><div class="quick-price">${formatPrice(product.price)}</div><div class="quick-meta"><div><span>Объём</span><strong>${product.volume}</strong></div><div><span>Ноты</span><strong>${product.notes}</strong></div></div><button class="button button--dark quick-add" type="button" data-buy="${product.id}">Добавить в корзину</button></div>`;
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

function preventOrphans(){
  document.querySelectorAll("h1,h2,h3,.hero-text,.section-intro,.category-meta p").forEach(element=>{
    element.innerHTML=element.innerHTML.replace(/(^|\s)([А-Яа-яA-Za-z]{1,2})\s+(?=\S)/g,"$1$2&nbsp;");
  });
}

renderProducts();renderCart();preventOrphans();
