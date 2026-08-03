let PRICE_BY_SIZE={
  "30":{"Люкс":1990,"Суперлюкс":2490,"Селектив":3490},
  "50":{"Люкс":2990,"Суперлюкс":3490,"Селектив":4990}
};
const CARD_COLORS=["#f2dfda","#dfe8f0","#eee7dc","#eadde2","#dfe5da","#e6e1ef"];
const OCCASION_LABELS={everyday:"На каждый день",evening:"Вечер",date:"Свидание",gym:"Спорт",walk:"Прогулка"};
const SEASON_LABELS={spring:"Весна",summer:"Лето",autumn:"Осень",winter:"Зима"};
const GENDER_LABELS={женский:"Для неё",мужской:"Для него",унисекс:"Унисекс"};
const HOME_PRODUCT_SNAPSHOTS={
  matsukita:{name:"Matsukita",price:1990,image:"assets/product-line/fragrance-matsukita-card.png"},cashmere:{name:"Cashmere",price:1350,image:"assets/product-line/diffuser-cashmere.png"},
  "devils-intrigue":{name:"Devils Intrigue",price:650,image:"assets/product-line/hair-spray-devils-intrigue.png"},auto:{name:"Car Scent",price:300,image:"assets/product-line/car-fragrance.png"},
  cherry:{name:"Cherry",price:1990,image:"assets/product-line/fragrance-cherry.png"},hayati:{name:"Hayati",price:3490,image:"assets/product-line/fragrance-hayati.png"},
  "musk-kashmir":{name:"Musk Kashmir",price:3490,image:"assets/product-line/fragrance-musk-kashmir.png"},"sea-salt":{name:"Sea Salt",price:550,image:"assets/product-line/home-perfume-sea-salt.png"},
  "matsukita-solid":{name:"Matsukita Solid",price:990,image:"assets/product-line/solid-perfume-matsukita.png"},ballerina:{name:"Ballerina",price:890,image:"assets/product-line/candle-ballerina.png"},
  "black-pepper":{name:"Black Pepper",price:3490,image:"assets/product-line/fragrance-black-pepper.png"},white:{name:"White",price:1990,image:"assets/product-line/fragrance-white.png"}
};

const page=document.querySelector(".product-page");
const relatedSection=document.querySelector(".related-section");
const relatedGrid=document.querySelector(".related-grid");
const breadcrumbCurrent=document.querySelector(".breadcrumb-current");
const cartDrawer=document.querySelector(".cart-drawer");
const cartButton=document.querySelector(".cart-button");
const cartClose=document.querySelector(".drawer-close");
const cartItems=document.querySelector(".cart-items");
const cartCount=document.querySelector(".cart-count");
const cartTotal=document.querySelector(".cart-total");
const backdrop=document.querySelector(".drawer-backdrop");
const headerFavorite=document.querySelector(".product-favorite");
const menuToggle=document.querySelector(".menu-toggle");
const mobileNav=document.querySelector(".mobile-nav");
const toast=document.querySelector(".toast");

let fragrances=[];
let fragrance=null;
let selectedSize="30";
let toastTimer;
let favorites=JSON.parse(localStorage.getItem("fluide-favorites")||"[]");
let cart=JSON.parse(localStorage.getItem("fluide-cart")||"[]");

const escapeHtml=value=>String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const formatPrice=value=>`${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
const prettyTitle=value=>String(value||"").replace(/^\d+\s+/,"").toLocaleLowerCase("ru-RU").replace(/(^|[\s-])([a-zа-яё])/giu,(match,space,letter)=>`${space}${letter.toLocaleUpperCase("ru-RU")}`);
const priceFor=(item,size=selectedSize)=>PRICE_BY_SIZE[size]?.[item.category]||PRICE_BY_SIZE["30"][item.category]||1990;
const colorFor=item=>CARD_COLORS[(Number.parseInt(item.id,10)||0)%CARD_COLORS.length];
const allNotes=item=>[...(item.notes?.top||[]),...(item.notes?.middle||[]),...(item.notes?.base||[]),...(item.notes?.main||[])];

function productVisual(item,context="main"){
  if(item.image)return `<img src="${escapeHtml(item.image)}" alt="Флакон FLUIDE ${escapeHtml(prettyTitle(item.title))}">`;
  return `<div class="fragrance-placeholder ${context==="related"?"is-related":""}" role="img" aria-label="Изображение аромата готовится"><img src="assets/brand/logo-blue.svg" alt="" aria-hidden="true"><strong>№ ${escapeHtml(item.id)}</strong><span>Изображение готовится</span></div>`;
}

function noteRows(item){
  return [["Верхние ноты",item.notes?.top],["Сердце",item.notes?.middle],["База",item.notes?.base],["Основные ноты",item.notes?.main]]
    .filter(([,values])=>values?.length)
    .map(([label,values])=>`<div class="pyramid-row"><span>${label}</span><strong>${escapeHtml(values.join(", "))}</strong></div>`).join("");
}

function renderProduct(){
  const title=prettyTitle(fragrance.title);
  const seasons=(fragrance.season||[]).map(value=>SEASON_LABELS[value]||value);
  const occasions=(fragrance.occasion||[]).map(value=>OCCASION_LABELS[value]||value);
  const accords=(fragrance.accords||[]).slice(0,8);
  const groups=[...(fragrance.groupFamilies||[]),...(fragrance.families||[])].filter((value,index,array)=>value&&array.indexOf(value)===index).slice(0,5);
  const favoriteKey=`fragrance-${fragrance.id}`;
  const favoriteActive=favorites.includes(favoriteKey);
  breadcrumbCurrent.textContent=`FLUIDE ${title}`;
  document.title=`FLUIDE ${title} — купить аромат`;
  document.querySelector('meta[name="description"]').content=`FLUIDE ${title}: ноты, характеристики и цена 30/50 мл.`;
  headerFavorite.classList.toggle("is-active",favoriteActive);

  page.innerHTML=`<article class="product-layout">
    <section class="product-gallery" style="--product-bg:${colorFor(fragrance)}">
      ${productVisual(fragrance)}
    </section>
    <section class="product-details">
      <h1>FLUIDE ${escapeHtml(title)}</h1>
      <p class="product-inspiration">Вдохновлён композицией ${escapeHtml(fragrance.original)}</p>
      <div class="product-price" data-product-price>${formatPrice(priceFor(fragrance))}</div>
      <div class="product-choice" role="radiogroup" aria-label="Выберите объём">
        <p>Выберите объём</p>
        <div class="size-options">
          <button class="size-option is-active" type="button" role="radio" aria-checked="true" data-size="30"><strong>30 мл</strong><span>${formatPrice(priceFor(fragrance,"30"))}</span></button>
          <button class="size-option" type="button" role="radio" aria-checked="false" data-size="50"><strong>50 мл</strong><span>${formatPrice(priceFor(fragrance,"50"))}</span></button>
        </div>
      </div>
      <div class="product-actions">
        <button class="product-add" type="button">Добавить в корзину</button>
        <button class="product-like ${favoriteActive?"is-active":""}" type="button" aria-label="${favoriteActive?"Удалить из избранного":"Добавить в избранное"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 4.5h9v15l-4.5-3-4.5 3v-15Z"></path></svg></button>
      </div>
      <div class="product-facts">
        <div class="product-fact"><span>Концентрация</span><strong>${escapeHtml(fragrance.concentration||"—")}</strong></div>
        <div class="product-fact"><span>Масляная основа</span><strong>${escapeHtml(fragrance.oilPercent||"—")}%</strong></div>
        <div class="product-fact"><span>Сезон</span><strong>${escapeHtml(seasons.join(", ")||"В любое время")}</strong></div>
        <div class="product-fact"><span>Подходит</span><strong>${escapeHtml(occasions.join(", ")||"На каждый день")}</strong></div>
      </div>
      <section class="product-section"><h2>Пирамида аромата</h2>${noteRows(fragrance)||`<div class="pyramid-row"><span>Ноты</span><strong>${escapeHtml(allNotes(fragrance).join(", ")||fragrance.group||"Парфюмерная композиция")}</strong></div>`}</section>
      ${accords.length?`<section class="product-section"><h2>Характер композиции</h2>${accords.map(accord=>`<div class="product-accord"><span>${escapeHtml(accord.name)}</span><div class="product-accord-track"><i style="width:${Math.max(4,Math.min(100,Number(accord.weight)||0))}%"></i></div><b>${Math.round(Number(accord.weight)||0)}</b></div>`).join("")}</section>`:""}
      ${[...seasons,...occasions,...groups].length?`<section class="product-section"><h2>Настроение аромата</h2><div class="product-tags">${[...seasons,...occasions,...groups].filter(Boolean).map(label=>`<span class="product-tag">${escapeHtml(label)}</span>`).join("")}</div></section>`:""}
    </section>
  </article>`;

  page.querySelectorAll("[data-size]").forEach(button=>button.addEventListener("click",()=>selectSize(button.dataset.size)));
  page.querySelector(".product-add").addEventListener("click",addToCart);
  page.querySelector(".product-like").addEventListener("click",toggleFavorite);
  renderRelated();
}

function selectSize(size){
  selectedSize=size;
  page.querySelectorAll("[data-size]").forEach(button=>{const active=button.dataset.size===size;button.classList.toggle("is-active",active);button.setAttribute("aria-checked",String(active))});
  page.querySelector("[data-product-price]").textContent=formatPrice(priceFor(fragrance,size));
}

function toggleFavorite(){
  const key=`fragrance-${fragrance.id}`;
  favorites=favorites.includes(key)?favorites.filter(value=>value!==key):[...favorites,key];
  localStorage.setItem("fluide-favorites",JSON.stringify(favorites));
  const active=favorites.includes(key);
  page.querySelector(".product-like")?.classList.toggle("is-active",active);
  headerFavorite.classList.toggle("is-active",active);
  showToast(active?"Добавлено в избранное":"Удалено из избранного");
}

function addToCart(){
  const key=`fragrance-${fragrance.id}-${selectedSize}`;
  const existing=cart.find(item=>item.id===key);
  const snapshot={name:`FLUIDE ${prettyTitle(fragrance.title)} · ${selectedSize} мл`,price:priceFor(fragrance),image:fragrance.image||"assets/brand/logo-blue.svg",category:`Парфюм · ${selectedSize} мл`};
  if(existing){existing.quantity+=1;existing.product=snapshot}else cart.push({id:key,quantity:1,product:snapshot});
  saveCart();renderCart();showToast(`${selectedSize} мл добавлено в корзину`);
}

function renderRelated(){
  const related=fragrances.filter(item=>item.id!==fragrance.id&&((item.families||[]).some(value=>(fragrance.families||[]).includes(value))||item.category===fragrance.category)).slice(0,4);
  if(!related.length)return;
  relatedGrid.innerHTML=related.map(item=>`<article class="related-card"><a class="related-card-media" style="--related-bg:${colorFor(item)}" href="product.html?id=${encodeURIComponent(item.id)}">${productVisual(item,"related")}</a><div class="related-card-info"><div><h3>FLUIDE ${escapeHtml(prettyTitle(item.title))}</h3><strong>от ${formatPrice(priceFor(item,"30"))}</strong></div></div></article>`).join("");
  relatedSection.hidden=false;
}

function saveCart(){localStorage.setItem("fluide-cart",JSON.stringify(cart))}
function renderCart(){
  const detailed=cart.map(item=>({item,product:item.product||HOME_PRODUCT_SNAPSHOTS[item.id]||null})).filter(row=>row.product);
  cartCount.textContent=cart.reduce((sum,item)=>sum+(Number(item.quantity)||0),0);
  cartTotal.textContent=formatPrice(detailed.reduce((sum,row)=>sum+row.product.price*row.item.quantity,0));
  cartItems.innerHTML=detailed.length?detailed.map(({item,product})=>`<div class="cart-item"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}"><div><h3>${escapeHtml(product.name)}</h3><p>${item.quantity} × ${formatPrice(product.price)}</p></div><button class="cart-remove" type="button" data-remove-cart="${escapeHtml(item.id)}" aria-label="Удалить товар">×</button></div>`).join(""):`<div class="cart-empty"><div><p>В корзине пока пусто</p><small>Добавьте аромат из коллекции</small></div></div>`;
}
function openCart(){cartDrawer.classList.add("is-open");cartDrawer.setAttribute("aria-hidden","false");backdrop.classList.add("is-open");document.body.classList.add("is-locked")}
function closeCart(){cartDrawer.classList.remove("is-open");cartDrawer.setAttribute("aria-hidden","true");backdrop.classList.remove("is-open");document.body.classList.remove("is-locked")}
function showToast(message){toast.textContent=message;toast.classList.add("is-visible");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove("is-visible"),2200)}
function renderError(){page.innerHTML=`<section class="product-error"><h1>Аромат не найден</h1><p>Вернитесь в каталог и выберите другую композицию.</p><a href="catalog.html">Перейти в каталог</a></section>`;breadcrumbCurrent.textContent="Аромат не найден"}

cartButton.addEventListener("click",openCart);cartClose.addEventListener("click",closeCart);backdrop.addEventListener("click",closeCart);
cartItems.addEventListener("click",event=>{const button=event.target.closest("[data-remove-cart]");if(!button)return;cart=cart.filter(item=>item.id!==button.dataset.removeCart);saveCart();renderCart()});
headerFavorite.addEventListener("click",()=>{if(fragrance)toggleFavorite()});
menuToggle.addEventListener("click",()=>{const open=mobileNav.classList.toggle("is-open");menuToggle.setAttribute("aria-expanded",String(open))});
mobileNav.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>{mobileNav.classList.remove("is-open");menuToggle.setAttribute("aria-expanded","false")}));
document.addEventListener("keydown",event=>{if(event.key==="Escape")closeCart()});

async function init(){
  renderCart();
  try{
    const [fragrancesResponse,pricesResponse]=await Promise.all([fetch("data/fragrances.json"),fetch("data/prices.json")]);
    if(!fragrancesResponse.ok)throw new Error(`HTTP ${fragrancesResponse.status}`);
    fragrances=(await fragrancesResponse.json()).filter(item=>item?.id);
    if(pricesResponse.ok){const prices=await pricesResponse.json();PRICE_BY_SIZE={...PRICE_BY_SIZE,...(prices.perfume||{})}}
    const requested=new URLSearchParams(location.search).get("id")||"";
    fragrance=fragrances.find(item=>item.id===requested.padStart(3,"0"));
    if(!fragrance){renderError();return}
    renderProduct();
  }catch(error){renderError();console.error(error)}
}
init();
