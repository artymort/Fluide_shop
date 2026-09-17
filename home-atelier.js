"use strict";
const products = [
  {id:"fragrance-001",name:"Amber Wood",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Кардамон · яблоко · лаванда",inspiredBy:"Ajmal Amber Wood",badge:"Селектив",price:3490,image:"images/fragrances/001.webp",color:"#dfe8f0",notes:"Кардамон, яблоко, лаванда",volume:"30 мл",isNew:false},
  {id:"fragrance-002",name:"Lucky Wish",category:"women",categoryLabel:"Парфюм · 30 мл",description:"Ледяной лимон · танжерин · помело",inspiredBy:"Anna Sui Lucky Wish",badge:"Селектив",price:3490,image:"images/fragrances/002.webp",color:"#eadde2",notes:"Ледяной лимон, танжерин, помело",volume:"30 мл",isNew:true},
  {id:"fragrance-006",name:"Hayati",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Малина · ягодные фрукты · ананас",inspiredBy:"Attar Collection Hayati",badge:"Селектив",price:3490,image:"images/fragrances/006.webp",color:"#f2dfda",notes:"Малина, ягодные фрукты, ананас",volume:"30 мл",isNew:false},
  {id:"fragrance-007",name:"Musk Kashmir",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Белый мускус · белый перец · сандал",inspiredBy:"Attar Collection Musk Kashmir",badge:"Селектив",price:3490,image:"images/fragrances/007.webp",color:"#dfe8f0",notes:"Белый мускус, белый перец, сандал",volume:"30 мл",isNew:false},
  {id:"fragrance-008",name:"Aurica",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Ананас · кедровая хвоя · мандарин",inspiredBy:"Boadicea the Victorious Aurica",badge:"Селектив",price:3490,image:"images/fragrances/008.webp",color:"#eee7dc",notes:"Ананас, кедровая хвоя, мандарин",volume:"30 мл",isNew:true},
  {id:"fragrance-016",name:"Aventus",category:"men",categoryLabel:"Парфюм · 30 мл",description:"Бергамот · черная смородина · яблоко",inspiredBy:"Creed Aventus",badge:"Селектив",price:3490,image:"images/fragrances/016.webp",color:"#dfe5da",notes:"Бергамот, черная смородина, яблоко",volume:"30 мл",isNew:false},
  {id:"fragrance-021",name:"Escentric 02 Black",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Амброксан · Iso E Super · ирис",inspiredBy:"Escentric Molecules Escentric 02 Black",badge:"Селектив",price:3490,image:"images/fragrances/021.webp",color:"#e6e1ef",notes:"Амброксан, Iso E Super, ирис",volume:"30 мл",isNew:true},
  {id:"fragrance-022",name:"Escentric 02",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Амброксан · Iso E Super · ирис",inspiredBy:"Escentric Molecules Escentric 02",badge:"Селектив",price:3490,image:"images/fragrances/022.webp",color:"#f2dfda",notes:"Амброксан, Iso E Super, ирис",volume:"30 мл",isNew:false},
  {id:"fragrance-023",name:"Games 1",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Бергамот · розовый перец · мандарин",inspiredBy:"Escentric Molecules The Beautiful Mind Series Volume 1 Intelligence & Fantasy",badge:"Селектив",price:3490,image:"images/fragrances/023.webp",color:"#dfe8f0",notes:"Бергамот, розовый перец, мандарин",volume:"30 мл",isNew:false},
  {id:"fragrance-024",name:"Fleur Narcotique",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Личи · бергамот · персик",inspiredBy:"Ex Nihilo Fleur Narcotique",badge:"Селектив",price:3490,image:"images/fragrances/024.webp",color:"#eadde2",notes:"Личи, бергамот, персик",volume:"30 мл",isNew:true},
  {id:"fragrance-025",name:"Baccarat",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Шафран · жасмин · амбровое дерево",inspiredBy:"Maison Francis Kurkdjian Baccarat Rouge 540",badge:"Селектив",price:3490,image:"images/fragrances/025.webp",color:"#eee7dc",notes:"Шафран, жасмин, амбровое дерево",volume:"30 мл",isNew:false},
  {id:"fragrance-026",name:"Ganymede",category:"unisex",categoryLabel:"Парфюм · 30 мл",description:"Шафран · мандарин · османтус",inspiredBy:"Marc-Antoine Barrois Ganymede",badge:"Селектив",price:3490,image:"images/fragrances/026.webp",color:"#dfe5da",notes:"Шафран, мандарин, османтус",volume:"30 мл",isNew:false}
];
let PRICE_BY_SIZE={
  "30":{"Люкс":1990,"Суперлюкс":2490,"Селектив":3490},
  "50":{"Люкс":2990,"Суперлюкс":3490,"Селектив":4990}
};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const escapeHtml=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>`${new Intl.NumberFormat("ru-RU").format(n)}&nbsp;<span class="price-ruble">₽</span>`;
const read=(key)=>{try{const value=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(value)?value:[]}catch{return []}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{toast("Не удалось сохранить данные в браузере.")}};
let favorites=read("fluide-favorites"),cart=read("fluide-cart"),filter="all",visible=4,panelMode="",selectedProductId="",toastTimer;
const href=p=>"product.html?id="+encodeURIComponent(p.id.replace("fragrance-",""));
const variantsFor=p=>["30","50"].map(size=>({size,volume:`${size} мл`,price:PRICE_BY_SIZE[size]?.[p.badge]||p.price}));
const minPrice=p=>Math.min(...variantsFor(p).map(variant=>variant.price));
function toast(message){$("#toast").textContent=message;$("#toast").classList.add("visible");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("#toast").classList.remove("visible"),3000)}
function renderProducts(){
 const list=products.filter(p=>filter==="all"||(filter==="new"?p.isNew:p.category===filter));
 $("#products").innerHTML=list.slice(0,visible).map(p=>{const cardName=`FLUIDE ${Number(p.id.replace("fragrance-",""))} ${p.name}`;return `<article class="product">
   <div class="product-visual">
    <span class="product-badge">${p.isNew?"Новинка":p.badge}</span>
    <button class="favorite ${favorites.includes(p.id)?"selected":""}" data-favorite="${p.id}" aria-label="В избранное: ${p.name}" aria-pressed="${favorites.includes(p.id)}"><svg><use href="#heart"/></svg></button>
    <a class="product-image" href="${href(p)}"><img src="${p.image}" alt="${cardName}" loading="lazy"></a>
   </div>
   <div class="product-copy">
    <h3 class="product-name"><a href="${href(p)}">${cardName}</a></h3>
    <p class="product-inspiration">По мотивам ${p.inspiredBy}</p>
    <p class="product-notes">${p.notes}</p>
    <div class="product-purchase"><strong class="product-price">от ${money(minPrice(p))}</strong><div class="product-action-buttons"><a class="product-details" href="${href(p)}">Подробнее</a><button class="product-add" data-buy="${p.id}" aria-label="Добавить ${p.name} в корзину"><span>В корзину</span></button></div></div>
   </div>
  </article>`}).join("")||'<p class="no-products">В этой категории пока нет ароматов.</p>';
 $("#product-count").textContent=`${Math.min(visible,list.length)} из ${list.length} ароматов`;
 const more=$("#show-more"),expanded=visible>=list.length;
 more.hidden=list.length<=4;
 more.textContent=expanded?'Скрыть':'Показать еще';
}
function updateCart(){save("fluide-cart",cart);const quantity=cart.reduce((n,p)=>n+(Number(p.quantity)||1),0);const badge=$("#cart-count");badge.textContent=quantity||"";badge.hidden=quantity===0}
function openSizeSelector(id){selectedProductId=id;openPanel("volume","Выберите объём")}
function addToCart(id,size){const p=products.find(product=>product.id===id);if(!p)return;const variant=variantsFor(p).find(item=>item.size===size);if(!variant)return;const key=`${id}-${size}`;const snapshot={...p,name:`FLUIDE ${Number(p.id.replace("fragrance-",""))} ${p.name} · ${variant.volume}`,price:variant.price,volume:variant.volume,categoryLabel:`Парфюм · ${variant.volume}`};const row=cart.find(item=>item.id===key);if(row){row.quantity++;row.product=snapshot}else cart.push({id:key,quantity:1,product:snapshot});updateCart();toast(`${p.name}, ${variant.volume} — в корзине`)}
function toggleFavorite(id){favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];save("fluide-favorites",favorites);renderProducts();if(panelMode==="favorites"&&$("#panel").open)renderPanel()}
function resultRow(p){return `<a class="search-result" href="${href(p)}"><img src="${p.image}" alt=""><span>${escapeHtml(p.name)}</span><small>от ${money(minPrice(p))}</small></a>`}
function openPanel(mode,title){panelMode=mode;$("#panel-title").textContent=title||({login:"Личный кабинет",search:"Найти аромат",favorites:"Избранное",cart:"Корзина",menu:"FLUIDE"}[mode]||mode);renderPanel();if(!$("#panel").open)$("#panel").showModal();if(mode==="search")$("#home-search").focus()}
function renderPanel(){
 const body=$("#panel-body");
 body.classList.toggle("cart-panel-body",panelMode==="cart");
 if(panelMode==="login")body.innerHTML=`<div class="auth-panel">
  <div class="auth-content">
   <p class="auth-kicker">Добро пожаловать в FLUIDE</p>
   <h3 class="auth-title">Войти или<br>зарегистрироваться</h3>
   <p class="auth-subtitle">Сохраняйте избранное, историю заказов<br>и персональные рекомендации.</p>
   <p class="auth-method-label">Войти с помощью</p>
   <div class="auth-providers">
    <button class="auth-provider" data-auth-provider="Яндекс ID" aria-label="Продолжить с Яндекс ID"><span><img src="assets/icons/yandex-id.svg" alt=""></span><b>Яндекс ID</b></button>
    <button class="auth-provider" data-auth-provider="VK ID" aria-label="Продолжить с VK ID"><span><img src="assets/icons/vk-id.svg?v=2" alt=""></span><b>VK ID</b></button>
   </div>
   <div class="auth-divider"><span>или</span></div>
   <button class="auth-phone-button" data-auth-phone>По номеру телефона</button>
  </div>
  <p class="auth-legal">Продолжая, вы соглашаетесь на обработку персональных данных в соответствии с <button data-info="privacy">политикой обработки персональных данных</button>.</p>
 </div>`;
 if(panelMode==="volume"){const p=products.find(product=>product.id===selectedProductId);if(!p){body.innerHTML="<p>Аромат не найден.</p>";return}const cardName=`FLUIDE ${Number(p.id.replace("fragrance-",""))} ${p.name}`;body.innerHTML=`<div class="volume-picker"><div class="volume-product"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(cardName)}"><div><h3>${escapeHtml(cardName)}</h3><p>${escapeHtml(p.inspiredBy)}</p></div></div><p class="volume-label">Доступные объёмы</p><div class="volume-options">${variantsFor(p).map(variant=>`<button class="volume-option" data-volume="${variant.size}" data-analytics-add data-product-key="${p.id}"><span><strong>${variant.volume}</strong><small>В наличии</small></span><b>${money(variant.price)}</b></button>`).join("")}</div></div>`;}
 if(panelMode==="search"){body.innerHTML='<label for="home-search">Название или любимые ноты</label><input id="home-search" type="search" placeholder="Например, мускус"><div id="search-results"></div>';$("#home-search").addEventListener("input",()=>{const q=$("#home-search").value.trim().toLowerCase();$("#search-results").innerHTML=products.filter(p=>(p.name+" "+p.notes).toLowerCase().includes(q)).map(resultRow).join("")||'<p>В подборке не найдено. Посмотрите полный каталог.</p><a class="pill outline" href="catalog.html">Перейти в каталог ↗</a>'});$("#home-search").dispatchEvent(new Event("input"));}
 if(panelMode==="favorites"){const list=products.filter(p=>favorites.includes(p.id));body.innerHTML=list.length?list.map(p=>`<div class="favorite-row">${resultRow(p)}<button class="buy" data-favorite="${p.id}">Убрать из избранного</button></div>`).join(""):'<p>Сохраняйте ароматы с помощью сердечка на карточке.</p>';if(favorites.some(id=>!products.some(p=>p.id===id)))body.innerHTML+='<p>Остальные сохраненные ароматы доступны в каталоге.</p><a class="pill outline" href="catalog.html">Открыть каталог</a>';}
 if(panelMode==="cart"){
 let total=0;body.innerHTML=cart.map((row,i)=>{const p=row.product||products.find(p=>p.id===row.id);if(!p)return "";total+=(Number(p.price)||0)*row.quantity;return `<div class="cart-row"><img src="${escapeHtml(p.image)}" alt=""><div><h3>${escapeHtml(p.name)}</h3><p>${money(Number(p.price)||0)}</p><button data-quantity="${i}" data-delta="-1" aria-label="Уменьшить количество"><svg><use href="#minus"/></svg></button> <span>${row.quantity}</span> <button data-quantity="${i}" data-delta="1" aria-label="Увеличить количество"><svg><use href="#plus"/></svg></button></div><button data-remove="${i}" aria-label="Удалить ${escapeHtml(p.name)}"><svg><use href="#trash-2"/></svg></button></div>`}).join("")||(cart.length?'':'<p>Здесь будут ваши ароматы.</p>');
 if(cart.length)body.innerHTML+=`<div class="cart-total"><span>Итого</span><span>${money(total)}</span></div><p>Товары сохранены в корзине. Онлайн-оформление заказа пока не подключено.</p>`;
 if(cart.length)body.innerHTML+='<a class="cart-continue" href="catalog.html"><span>Продолжить выбор</span><svg aria-hidden="true"><use href="#move-right"/></svg></a>';
 else body.innerHTML='<div class="cart-empty"><div class="cart-empty-content"><p>В корзине пока пусто</p><small>Добавьте аромат из коллекции</small><a class="cart-continue" href="catalog.html"><span>Продолжить выбор</span><svg aria-hidden="true"><use href="#move-right"/></svg></a></div></div>';
 }
 if(panelMode==="menu")body.innerHTML='<nav><a href="catalog.html">Каталог</a><a href="#offers" data-close>Предложения</a><a href="selection.html">Подбор аромата</a><a href="about.html">О компании</a><a href="#contacts" data-close>Контакты</a></nav>';
}
document.addEventListener("click",event=>{
 const b=event.target.closest("button,a");if(!b)return;
 if(b.hasAttribute("data-filter")){filter=b.dataset.filter;visible=4;$$("[data-filter]").forEach(x=>{x.classList.toggle("active",x===b);x.setAttribute("aria-pressed",x===b)});$(".filter-label").textContent=b.textContent==="Все"?"Все ароматы":b.textContent;$(".product-filter-menu").open=false;renderProducts()}
 if(b.id==="show-more"){const list=products.filter(p=>filter==="all"||(filter==="new"?p.isNew:p.category===filter));visible=visible>=list.length?4:Math.min(visible+4,list.length);renderProducts();if(visible===4)$("#bestsellers").scrollIntoView({behavior:"smooth",block:"start"})}
 if(b.dataset.buy)openSizeSelector(b.dataset.buy);
 if(b.dataset.volume){addToCart(selectedProductId,b.dataset.volume);$("#panel").close()}
 if(b.dataset.favorite)toggleFavorite(b.dataset.favorite);
 if(b.dataset.open)openPanel(b.dataset.open);
 if(b.dataset.authProvider)toast(`Вход через ${b.dataset.authProvider} появится после подключения авторизации.`);
 if(b.hasAttribute("data-auth-phone")){const body=$("#panel-body");body.innerHTML=`<div class="auth-panel auth-panel--phone"><div class="auth-content"><button class="auth-back" data-auth-back>← Назад</button><p class="auth-kicker">Вход по телефону</p><h3 class="auth-title">Введите номер<br>телефона</h3><p class="auth-subtitle">Отправим SMS с кодом подтверждения.<br>Номер используется только для входа.</p><form id="auth-phone-form"><label for="auth-phone">Номер телефона</label><input id="auth-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" value="+7 " placeholder="+7 999 000-00-00" required><button class="auth-phone-button" type="submit">Получить код</button><p id="auth-phone-status" role="status"></p></form></div><p class="auth-legal">Продолжая, вы соглашаетесь на обработку персональных данных в соответствии с <button data-info="privacy">политикой обработки персональных данных</button>.</p></div>`;$("#auth-phone").focus()}
 if(b.hasAttribute("data-auth-back"))renderPanel();
 if(b.hasAttribute("data-close"))b.closest("dialog")?.close();
 if(b.hasAttribute("data-quantity")){const row=cart[Number(b.dataset.quantity)];row.quantity+=Number(b.dataset.delta);cart=cart.filter(x=>x.quantity>0);updateCart();renderPanel()}
 if(b.hasAttribute("data-remove")){cart.splice(Number(b.dataset.remove),1);updateCart();renderPanel()}
 if(b.dataset.info){openPanel("info",{delivery:"Доставка и оплата",contacts:"Связаться с FLUIDE",privacy:"Персональные данные"}[b.dataset.info]);$("#panel-body").innerHTML={delivery:'<p>Доставка по России. Условия, сроки и способы оплаты уточняются при оформлении заказа.</p><p>Онлайн-оформление пока не подключено.</p>',contacts:'<p>FLUIDE Atelier — парфюмерный бренд из Владимира.</p><p>Контакты и часы работы будут добавлены после подтверждения командой бренда.</p><a class="pill outline" href="about.html">О нашем пространстве ↗</a>',privacy:'<p>Корзина, избранное и выбор cookie сохраняются локально в вашем браузере. Email из формы на этой странице пока никуда не отправляется.</p><p>Полная политика обработки персональных данных будет добавлена перед запуском онлайн-заказов и подписки.</p>'}[b.dataset.info]}
 if(b.dataset.gift){openPanel("gift",b.dataset.gift);$("#panel-body").innerHTML='<p>Подарите возможность выбрать свой аромат.</p><p>Номиналы и покупка сертификата появятся после подключения оформления заказов.</p><a class="pill outline" href="catalog.html">Посмотреть ароматы ↗</a>'}
});
document.addEventListener("submit",event=>{if(event.target.id!=="auth-phone-form")return;event.preventDefault();const status=$("#auth-phone-status");status.textContent="Отправка кода будет доступна после подключения авторизации.";toast("Демо-режим: номер телефона никуда не отправлен.")});
$$("dialog").forEach(dialog=>{dialog.addEventListener("click",e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});dialog.addEventListener("close",()=>{document.body.style.overflow=$$("dialog[open]").length?"hidden":"";restartHero()});new MutationObserver(()=>{if(dialog.open)document.body.style.overflow="hidden"}).observe(dialog,{attributes:true,attributeFilter:["open"]})});
let slide=0,paused=matchMedia("(prefers-reduced-motion: reduce)").matches,heroTimer;
function showSlide(next){slide=(next+3)%3;$$(".hero-slide").forEach((s,i)=>{s.hidden=i!==slide;s.classList.toggle("active",i===slide)});$$("[data-slide]").forEach((b,i)=>{b.classList.toggle("active",i===slide);b.setAttribute("aria-current",i===slide)});restartHero()}
function restartHero(){clearTimeout(heroTimer)}
function pauseHero(value){paused=value;$("[data-hero-pause]").textContent=paused?"▶":"Ⅱ";$("[data-hero-pause]").setAttribute("aria-label",paused?"Запустить слайдер":"Остановить слайдер");restartHero()}
$(".hero").addEventListener("mouseenter",()=>clearTimeout(heroTimer));$(".hero").addEventListener("mouseleave",restartHero);$(".hero").addEventListener("focusin",()=>clearTimeout(heroTimer));$(".hero").addEventListener("focusout",restartHero);document.addEventListener("visibilitychange",restartHero);
window.addEventListener("scroll",()=>$(".header").classList.toggle("scrolled",scrollY>60),{passive:true});
const notices=["Доставка по России · бесплатно от 5 000 ₽","Три любимых аромата по цене двух","Откройте свой аромат с FLUIDE"];let notice=0;
$$("[data-service]").forEach(b=>b.onclick=()=>{notice=(notice+Number(b.dataset.service)+notices.length)%notices.length;$("#service-message").textContent=notices[notice]});
const stories=[
 ["Cherry 33","Спелая вишня, яркое начало и теплый след.","assets/media/fluide-editorial-stilllife-v1.jpg","catalog.html","Открыть коллекцию"],
 ["Три аромата. Ваш выбор.","Соберите личный набор по предложению 2+1.","assets/media/category-perfume-studio-v1.png","catalog.html","Выбрать ароматы"],
 ["Дарить чувства","Сертификаты и наборы для новых впечатлений.","assets/media/fluide-editorial-stilllife-v1.jpg","#gifts","О подарках"],
 ["Легкое прикосновение","Парфюмированные мисты для ежедневного ритуала.","assets/media/category-care-studio-v1.png","#contacts","Узнать больше"],
 ["Атмосфера дома","Теплый свет, любимое место и аромат Cashmere.","assets/media/category-home-studio-v1.png","#contacts","Узнать больше"],
 ["Встречаемся во Владимире","Знакомство с нотами и парфюмерные мастер-классы.","IMG_7434.PNG","about.html","О пространстве"]
];
let storyIndex=0,storyElapsed=0,storyLast=0,storyFrame=0,storyPaused=false;
function showStory(index){if(index>=stories.length){$("#story").close();return}storyIndex=Math.max(0,index);storyElapsed=0;const [title,copy,image,url,cta]=stories[storyIndex];$("#story-body").innerHTML=`<img src="${image}" alt=""><div><h2>${title}</h2><p>${copy}</p><a class="pill light" href="${url}" data-close>${cta}</a></div>`;$(".story-progress").innerHTML=stories.map((_,i)=>`<span class="${i<storyIndex?"done":i===storyIndex?"current":""}"></span>`).join("");$("[data-story='"+storyIndex+"'] span").classList.add("seen");$(".story-back").disabled=storyIndex===0}
function tickStory(now){if(!$("#story").open)return;if(storyLast&&!storyPaused&&!document.hidden)storyElapsed+=Math.min(now-storyLast,100);storyLast=now;$(".story-progress .current")?.style.setProperty("--progress",Math.min(storyElapsed/6000*100,100)+"%");if(storyElapsed>=6000)showStory(storyIndex+1);storyFrame=requestAnimationFrame(tickStory)}
$$("[data-story]").forEach(b=>b.onclick=()=>{clearTimeout(heroTimer);showStory(Number(b.dataset.story));$("#story").showModal();storyLast=0;storyPaused=false;cancelAnimationFrame(storyFrame);storyFrame=requestAnimationFrame(tickStory)});
$(".story-next").onclick=()=>showStory(storyIndex+1);$(".story-back").onclick=()=>showStory(storyIndex-1);
$("#story").addEventListener("close",()=>{cancelAnimationFrame(storyFrame);restartHero()});
$("#story-body").addEventListener("pointerdown",()=>storyPaused=true);window.addEventListener("pointerup",()=>storyPaused=false);
$("#story").addEventListener("keydown",e=>{if(e.key==="ArrowRight")showStory(storyIndex+1);if(e.key==="ArrowLeft")showStory(storyIndex-1);if(e.code==="Space"){e.preventDefault();storyPaused=!storyPaused}});
$("#subscribe").addEventListener("submit",e=>{e.preventDefault();$("#subscribe-status").textContent="Подписка пока не подключена. Ваш email не отправлен и не сохранен."});
try{$(".cookie").hidden=localStorage.getItem("fluide-cookie-consent")==="accepted"}catch{$(".cookie").hidden=false}
$("[data-cookie-accept]").onclick=()=>{try{localStorage.setItem("fluide-cookie-consent","accepted")}catch{}$(".cookie").hidden=true};$("[data-cookie-settings]").onclick=()=>$(".cookie").hidden=false;
renderProducts();updateCart();
