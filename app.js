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
  const pageId = product.id.replace("fragrance-","");
  return `<article class="product-card" data-id="${product.id}">
    <div class="product-media" style="--card-bg:${product.color}">
      <button class="favorite ${isFavorite ? "is-active" : ""}" type="button" data-favorite="${product.id}" aria-label="Добавить ${product.name} в избранное"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 4.5h9v15l-4.5-3-4.5 3v-15Z"></path></svg></button>
      <a class="product-card-link" href="product.html?id=${encodeURIComponent(pageId)}" aria-label="Открыть страницу аромата ${product.name}"><img src="${product.image}" alt="${product.name} FLUIDE" loading="lazy"></a>
      <button class="product-buy" type="button" data-buy="${product.id}">Добавить в корзину</button>
    </div>
    <div class="product-copy">
      <div class="product-title-row"><h3><a href="product.html?id=${encodeURIComponent(pageId)}">${product.name}</a></h3><strong>${formatPrice(product.price)}</strong></div>
      <p class="product-description">${product.description}</p>
    </div>
  </article>`;
}
function renderProducts(){
  const matches = visibleProducts();
  const visibleLimit = expanded ? 12 : 4;
  const list = matches.slice(0,visibleLimit);
  grid.innerHTML = list.length ? list.map(productCard).join("") : `<div class="no-results">Ничего не найдено. Попробуйте изменить запрос или категорию.</div>`;
  productCount.textContent = `Показано ${list.length} из ${matches.length}`;
  showMore.hidden = matches.length <= 4;
  showMore.textContent = expanded ? "Свернуть" : "Показать ещё";
  grid.scrollLeft = 0;
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

function scrollProducts(direction){
  if(!grid)return;
  const card = grid.querySelector(".product-card");
  const distance = card ? card.getBoundingClientRect().width + 14 : grid.clientWidth * .8;
  grid.scrollBy({left:direction * distance,behavior:"smooth"});
}
document.querySelector(".product-scroll-prev")?.addEventListener("click",()=>scrollProducts(-1));
document.querySelector(".product-scroll-next")?.addEventListener("click",()=>scrollProducts(1));

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
document.querySelector(".finder-start").addEventListener("click",()=>{setFilter("all");document.querySelector("#catalog").scrollIntoView({behavior:"smooth"});showToast("Начнём с парфюмерной коллекции")});

function preventOrphans(){
  document.querySelectorAll("h1,h2,h3,.hero-text,.section-intro,.category-meta p").forEach(element=>{
    element.innerHTML=element.innerHTML.replace(/(^|\s)([А-Яа-яA-Za-z]{1,2})\s+(?=\S)/g,"$1$2&nbsp;");
  });
}

renderProducts();renderCart();preventOrphans();

const heroSlides = [...document.querySelectorAll("[data-hero-slide]")];
const heroDots = [...document.querySelectorAll("[data-hero-dot]")];
let heroIndex = 0;
let heroTimer;

function showHeroSlide(index){
  if(!heroSlides.length)return;
  heroIndex = (index + heroSlides.length) % heroSlides.length;
  heroSlides.forEach((slide,i)=>{
    const active = i === heroIndex;
    slide.classList.toggle("is-active",active);
    slide.setAttribute("aria-hidden",String(!active));
  });
  heroDots.forEach((dot,i)=>{
    const active = i === heroIndex;
    dot.classList.toggle("is-active",active);
    dot.setAttribute("aria-selected",String(active));
  });
}
function startHeroTimer(){
  clearInterval(heroTimer);
  heroTimer = setInterval(()=>showHeroSlide(heroIndex+1),7500);
}
document.querySelector(".hero-prev")?.addEventListener("click",()=>{showHeroSlide(heroIndex-1);startHeroTimer()});
document.querySelector(".hero-next")?.addEventListener("click",()=>{showHeroSlide(heroIndex+1);startHeroTimer()});
heroDots.forEach(dot=>dot.addEventListener("click",()=>{showHeroSlide(Number(dot.dataset.heroDot));startHeroTimer()}));
document.querySelector(".campaign-hero")?.addEventListener("mouseenter",()=>clearInterval(heroTimer));
document.querySelector(".campaign-hero")?.addEventListener("mouseleave",startHeroTimer);
showHeroSlide(0);
startHeroTimer();

const announcements = [
  {title:"Доставка по России",text:"Бесплатно при заказе от 5 000 ₽"},
  {title:"Наборы 2+1",text:"Соберите три аромата под настроение"},
  {title:"Подарочные сертификаты",text:"Когда хочется оставить выбор за близким"}
];
let announcementIndex = 0;
const announcementText = document.querySelector(".announcement p");
function showAnnouncement(index){
  announcementIndex = (index + announcements.length) % announcements.length;
  const item = announcements[announcementIndex];
  if(announcementText)announcementText.innerHTML = `<strong>${item.title}</strong><span>${item.text}</span>`;
}
document.querySelector(".announcement-prev")?.addEventListener("click",()=>showAnnouncement(announcementIndex-1));
document.querySelector(".announcement-next")?.addEventListener("click",()=>showAnnouncement(announcementIndex+1));

const storyData = [
  {title:"Cherry 33",text:"Сочная вишня, тёплое дерево и мягкий шлейф новой композиции.",image:"assets/media/category-perfume-studio-v1.png",href:"catalog.html",label:"Смотреть аромат"},
  {title:"Наборы 2+1",text:"Соберите три композиции и меняйте аромат вместе с настроением.",image:"assets/product-line/fragrance-hayati.png",href:"catalog.html",label:"Собрать набор",color:"#9fb6de"},
  {title:"Подарки FLUIDE",text:"Готовые наборы, Discovery Set и сертификаты для личного подарка.",image:"assets/product-line/solid-perfume-matsukita.png",href:"#gifts",label:"Выбрать подарок",color:"#eab6a8"},
  {title:"Мисты",text:"Лёгкий аромат для волос и тела — знакомое звучание в новом формате.",image:"assets/media/category-care-studio-v1.png",href:"catalog.html",label:"Перейти к мистам"},
  {title:"Ароматы для дома",text:"Диффузоры, свечи и спреи, которые собирают пространство вокруг вас.",image:"assets/media/category-home-studio-v1.png",href:"catalog.html",label:"Смотреть коллекцию"},
  {title:"Мастер-классы",text:"Встречаемся во Владимире, знакомимся с нотами и создаём аромат вместе.",image:"IMG_7434.PNG",href:"about.html",label:"Узнать подробнее"}
];
const storyViewer = document.querySelector(".story-viewer");
const storyContent = document.querySelector(".story-content");
const storyProgress = document.querySelector(".story-progress");
let storyIndex = 0;
let storyTimer;

function renderStory(){
  const story = storyData[storyIndex];
  if(!story || !storyContent)return;
  const background = story.color ? ` style="background:${story.color}"` : "";
  storyContent.innerHTML = `<article class="story-panel"${background}><img src="${story.image}" alt=""><h2>${story.title}</h2><p>${story.text}</p><a class="button button--light" href="${story.href}">${story.label}</a></article>`;
  storyProgress.innerHTML = storyData.map((_,i)=>`<span class="${i<storyIndex?"is-past":i===storyIndex?"is-active":""}"></span>`).join("");
  clearTimeout(storyTimer);
  storyTimer = setTimeout(()=>storyIndex===storyData.length-1?closeStories():showStory(storyIndex+1),6000);
}
function showStory(index){
  storyIndex = (index + storyData.length) % storyData.length;
  storyViewer.classList.add("is-open");
  storyViewer.setAttribute("aria-hidden","false");
  document.body.classList.add("is-locked");
  renderStory();
}
function closeStories(){
  clearTimeout(storyTimer);
  storyViewer.classList.remove("is-open");
  storyViewer.setAttribute("aria-hidden","true");
  document.body.classList.remove("is-locked");
}
document.querySelectorAll("[data-story]").forEach(button=>button.addEventListener("click",()=>showStory(Number(button.dataset.story))));
document.querySelector(".story-close")?.addEventListener("click",closeStories);
document.querySelector(".story-control--prev")?.addEventListener("click",()=>showStory(storyIndex-1));
document.querySelector(".story-control--next")?.addEventListener("click",()=>showStory(storyIndex+1));
storyViewer?.addEventListener("click",event=>{if(event.target===storyViewer)closeStories()});
document.addEventListener("keydown",event=>{
  if(!storyViewer?.classList.contains("is-open"))return;
  if(event.key==="Escape")closeStories();
  if(event.key==="ArrowLeft")showStory(storyIndex-1);
  if(event.key==="ArrowRight")showStory(storyIndex+1);
});

const cookieNote = document.querySelector(".cookie-note");
if(localStorage.getItem("fluide-cookie-accepted")==="1" && cookieNote)cookieNote.hidden=true;
document.querySelector(".cookie-accept")?.addEventListener("click",()=>{
  localStorage.setItem("fluide-cookie-accepted","1");
  if(cookieNote)cookieNote.hidden=true;
});
