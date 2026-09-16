let PRICE_BY_SIZE={
  "30":{"Люкс":1990,"Суперлюкс":2490,"Селектив":3490},
  "50":{"Люкс":2990,"Суперлюкс":3490,"Селектив":4990}
};
const CARD_COLORS=["#f2dfda","#dfe8f0","#eee7dc","#eadde2","#dfe5da","#e6e1ef"];
const OCCASION_LABELS={everyday:"На каждый день",evening:"Вечер",date:"Свидание",gym:"Спорт",walk:"Прогулка"};
const SEASON_LABELS={spring:"Весна",summer:"Лето",autumn:"Осень",winter:"Зима"};
const GENDER_LABELS={женский:"Для нее",мужской:"Для него",унисекс:"Унисекс"};
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
const cartFooter=document.querySelector(".cart-footer");
const backdrop=document.querySelector(".drawer-backdrop");
const headerFavorite=document.querySelector(".product-favorite");
const menuToggle=document.querySelector(".menu-toggle");
const mobileNav=document.querySelector(".mobile-nav");
const toast=document.querySelector(".toast");
const catalogHeader=document.querySelector(".catalog-header");
const infoDialog=document.querySelector("#info-dialog");
const infoTitle=document.querySelector(".info-title");
const infoContent=document.querySelector(".info-content");

let fragrances=[];
let catalogProducts=[];
let fragrance=null;
let selectedSize="30";
let selectedQuantity=1;
let selectedRating=0;
let toastTimer;
let favorites=JSON.parse(localStorage.getItem("fluide-favorites")||"[]");
let cart=JSON.parse(localStorage.getItem("fluide-cart")||"[]");

const escapeHtml=value=>String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const formatPrice=value=>`${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
const formatPriceMarkup=value=>`${new Intl.NumberFormat("ru-RU").format(value)}&nbsp;<span class="price-ruble" aria-hidden="true">₽</span><span class="visually-hidden"> рублей</span>`;
const prettyTitle=value=>String(value||"").replace(/^\d+\s+/,"").toLocaleLowerCase("ru-RU").replace(/(^|[\s-])([a-zа-я\u0451])/giu,(match,space,letter)=>`${space}${letter.toLocaleUpperCase("ru-RU")}`);
const isCatalogProduct=item=>item?.kind==="product";
const favoriteKeyFor=item=>isCatalogProduct(item)?item.id:`fragrance-${item.id}`;
const priceFor=(item,size=selectedSize)=>{
  if(isCatalogProduct(item))return Number(item.price)||0;
  const variant=Array.isArray(item?.variants)?item.variants.find(row=>String(row.size)===String(size)):null;
  return Number(variant?.price)||PRICE_BY_SIZE[size]?.[item.category]||PRICE_BY_SIZE["30"][item.category]||1990;
};
const colorFor=item=>CARD_COLORS[(Number.parseInt(item.id,10)||0)%CARD_COLORS.length];
const allNotes=item=>[...(item.notes?.top||[]),...(item.notes?.middle||[]),...(item.notes?.base||[]),...(item.notes?.main||[])];
const reviewKey=()=>`fluide-reviews-${fragrance?.id||"unknown"}`;
const loadReviews=()=>{try{const reviews=JSON.parse(localStorage.getItem(reviewKey())||"[]");return Array.isArray(reviews)?reviews:[]}catch{return []}};
const formatReviewDate=value=>{const date=value?new Date(value):new Date();const safe=Number.isNaN(date.getTime())?new Date():date;return `${String(safe.getDate()).padStart(2,"0")}.${String(safe.getMonth()+1).padStart(2,"0")}.${safe.getFullYear()}`};
const starMarkup=(filled=false)=>`<svg aria-hidden="true" class="${filled?"is-filled":""}"><use href="assets/icons/lucide.svg?v=product-v3#star"></use></svg>`;
const ratingButtonsMarkup=(value=0,attribute="data-review-star")=>Array.from({length:5},(_,index)=>`<button type="button" ${attribute}="${index+1}" class="${index<value?"is-filled":""}" aria-label="${index+1} из 5">${starMarkup(index<value)}</button>`).join("");

function productVisual(item,context="main"){
  if(item.image)return `<img src="${escapeHtml(item.image)}" alt="${isCatalogProduct(item)?escapeHtml(item.title):`Флакон FLUIDE ${escapeHtml(prettyTitle(item.title))}`}">`;
  return `<div class="fragrance-placeholder ${context==="related"?"is-related":""}" role="img" aria-label="Изображение аромата готовится"><img src="assets/brand/logo-blue.svg" alt="" aria-hidden="true"><strong>№ ${escapeHtml(item.id)}</strong><span>Изображение готовится</span></div>`;
}

function noteRows(item){
  return [["Верхние ноты",item.notes?.top],["Сердце",item.notes?.middle],["База",item.notes?.base],["Основные ноты",item.notes?.main]]
    .filter(([,values])=>values?.length)
    .map(([label,values])=>`<div class="pyramid-row"><span>${label}</span><strong>${escapeHtml(values.join(", "))}</strong></div>`).join("");
}

function productDescription(item){
  const lead=item.accords?.[0]?.name||"выразительный";
  return `Ведущий аккорд «${escapeHtml(lead)}» задает композиции характер. Собранный аромат с заметным шлейфом раскрывается постепенно и остается с вами в течение дня.`;
}

function catalogProductDescription(item){
  const descriptions={
    "solid-perfume":"Компактный твердый парфюм FLUIDE удобно брать с собой и обновлять аромат в течение дня.",
    "home-fragrance":"Парфюм для дома FLUIDE помогает наполнить пространство выбранным ароматом и создать нужное настроение.",
    candle:"Ароматическая свеча FLUIDE объединяет декоративную форму и мягкое звучание аромата в интерьере.",
    diffuser:"Аромадиффузор FLUIDE предназначен для постепенного и равномерного наполнения пространства ароматом.",
    "body-cream":"Уходовое средство FLUIDE дополняет ежедневный ритуал и оставляет на коже деликатный аромат.",
    "hand-soap":"Парфюмированное мыло FLUIDE создано для ежедневного ухода за руками.",
    "hair-spray":"Парфюмированный спрей FLUIDE придает волосам легкий аромат и подходит для использования в течение дня.",
    "car-fragrance":"Компактный аромат FLUIDE создан для использования в автомобиле."
  };
  return descriptions[item.productType]||`Продукт FLUIDE Atelier из категории «${escapeHtml(item.typeLabel||"Коллекция FLUIDE") }».`;
}

function renderCatalogProduct(){
  const title=fragrance.title;
  const favoriteKey=favoriteKeyFor(fragrance);
  const favoriteActive=favorites.includes(favoriteKey);
  const reviews=loadReviews();
  const ownReview=reviews[0]||null;
  const averageRating=reviews.length?reviews.reduce((sum,review)=>sum+Number(review.rating||0),0)/reviews.length:0;
  const productMeta=[fragrance.typeLabel,fragrance.volume].filter(Boolean).join(" · ");
  breadcrumbCurrent.textContent=title;
  document.title=`${title} — FLUIDE Atelier`;
  document.querySelector('meta[name="description"]').content=`${title}: описание, характеристики и цена в каталоге FLUIDE Atelier.`;
  headerFavorite.classList.toggle("is-active",favoriteActive);
  headerFavorite.setAttribute("aria-label",favoriteActive?"Удалить из избранного":"Добавить в избранное");

  page.innerHTML=`<article class="product-layout catalog-product-detail">
    <div class="product-overview">
      <section class="product-gallery catalog-product-gallery">
        <div class="product-gallery-stage">
          <img class="product-main-image" src="${escapeHtml(fragrance.image||"assets/brand/logo-blue.svg")}" alt="${escapeHtml(title)}">
        </div>
      </section>
      <section class="product-details">
        <h1>${escapeHtml(title)}</h1>
        <p class="product-inspiration">${escapeHtml(productMeta||"Продукция FLUIDE Atelier")}</p>
        <div class="product-rating" data-product-rating aria-label="${reviews.length?`Средняя оценка ${averageRating.toFixed(1)} из 5`:`У этого товара пока нет оценок`}"><span class="product-rating-stars">${ratingButtonsMarkup(Math.round(averageRating))}</span><button type="button" data-review-open>Отзывы (<span data-review-count>${reviews.length}</span>)</button></div>
        <div class="product-purchase">
          <div class="product-price" data-product-price>${formatPriceMarkup(priceFor(fragrance))}</div>
          ${fragrance.volume?`<fieldset class="product-choice"><legend>Объем</legend><div class="volume-options"><span class="volume-option is-active product-volume-static">${escapeHtml(fragrance.volume)}</span></div></fieldset>`:""}
          <div class="quantity-block"><span>Количество</span><div class="quantity-control"><button type="button" data-quantity="-1" aria-label="Уменьшить количество">−</button><output data-product-quantity>1</output><button type="button" data-quantity="1" aria-label="Увеличить количество">+</button></div></div>
          <div class="product-actions"><button class="product-add" type="button">В корзину</button><button class="product-buy-now" type="button">Купить в 1 клик</button><button class="product-like ${favoriteActive?"is-active":""}" type="button" aria-label="${favoriteActive?"Удалить из избранного":"Добавить в избранное"}"><svg aria-hidden="true"><use href="assets/icons/lucide.svg#heart"></use></svg></button></div>
          <p class="product-delivery-note"><svg aria-hidden="true"><use href="assets/icons/lucide.svg?v=product-v1#truck"></use></svg>Бесплатная доставка от 5 000 ₽</p>
        </div>
      </section>
    </div>
    <section class="product-info">
      <div class="product-tabs" role="tablist" aria-label="Информация о товаре">
        <button class="product-tab is-active" type="button" role="tab" aria-selected="true" aria-controls="product-tab-about" data-product-tab="about" data-label="О товаре">О товаре</button>
        <button class="product-tab" type="button" role="tab" aria-selected="false" aria-controls="product-tab-characteristics" data-product-tab="characteristics" data-label="Характеристики">Характеристики</button>
        <button class="product-tab" type="button" role="tab" aria-selected="false" aria-controls="product-tab-reviews" data-product-tab="reviews" data-label="Отзывы">Отзывы</button>
      </div>
      <div class="product-tab-panels">
        <section class="product-tab-panel is-active" id="product-tab-about" role="tabpanel" data-product-panel="about"><div class="product-about-grid"><p>${catalogProductDescription(fragrance)}</p><div class="product-about-aside"><div><span>Категория</span><strong>${escapeHtml(fragrance.typeLabel||"Продукция FLUIDE")}</strong></div>${fragrance.volume?`<div><span>Объем</span><strong>${escapeHtml(fragrance.volume)}</strong></div>`:""}<div><span>Бренд</span><strong>FLUIDE Atelier</strong></div></div></div></section>
        <section class="product-tab-panel" id="product-tab-characteristics" role="tabpanel" data-product-panel="characteristics" hidden><div class="pyramid-grid"><div class="pyramid-row"><span>Категория</span><strong>${escapeHtml(fragrance.typeLabel||"Продукция FLUIDE")}</strong></div>${fragrance.volume?`<div class="pyramid-row"><span>Объем</span><strong>${escapeHtml(fragrance.volume)}</strong></div>`:""}<div class="pyramid-row"><span>Бренд</span><strong>FLUIDE Atelier</strong></div></div></section>
        <section class="product-tab-panel" id="product-tab-reviews" role="tabpanel" data-product-panel="reviews" hidden><div class="product-reviews-layout"><div class="product-review-list" data-review-list></div><form class="product-review-form" data-review-form ${ownReview?"hidden":""}><fieldset><legend>Ваша оценка</legend><div class="product-review-rating-picker">${ratingButtonsMarkup(Number(ownReview?.rating)||0,"data-form-rating")}</div></fieldset><label>Ваше имя<input name="name" type="text" maxlength="40" autocomplete="name" value="${escapeHtml(ownReview?.name||"")}" required></label><label>Отзыв<textarea name="text" rows="4" maxlength="700" required>${escapeHtml(ownReview?.text||"")}</textarea></label><button type="submit">${ownReview?"Сохранить изменения":"Оставить отзыв"}</button></form></div></section>
      </div>
    </section>
  </article>`;

  page.querySelectorAll("[data-quantity]").forEach(button=>button.addEventListener("click",()=>changeQuantity(Number(button.dataset.quantity))));
  page.querySelectorAll("[data-product-tab]").forEach(button=>button.addEventListener("click",()=>selectProductTab(button.dataset.productTab)));
  page.querySelector("[data-review-open]").addEventListener("click",()=>selectProductTab("reviews"));
  page.querySelectorAll("[data-review-star]").forEach(button=>button.addEventListener("click",()=>{selectProductTab("reviews");openReviewEditor(Number(button.dataset.reviewStar),true)}));
  page.querySelectorAll("[data-form-rating]").forEach(button=>button.addEventListener("click",()=>setReviewRating(Number(button.dataset.formRating))));
  page.querySelector("[data-review-form]").addEventListener("submit",submitReview);
  renderReviewList();
  page.querySelector(".product-add").addEventListener("click",addToCart);
  page.querySelector(".product-buy-now").addEventListener("click",()=>showToast("Быстрая покупка будет подключена позже"));
  page.querySelector(".product-like").addEventListener("click",toggleFavorite);
  renderRelated();
}

function renderProduct(){
  const title=prettyTitle(fragrance.title);
  const seasons=(fragrance.season||[]).map(value=>SEASON_LABELS[value]||value);
  const occasions=(fragrance.occasion||[]).map(value=>OCCASION_LABELS[value]||value);
  const accords=(fragrance.accords||[]).slice(0,8);
  const fragranceNumber=Number(fragrance.id)||fragrance.id;
  const galleryImages=[fragrance.image||"assets/brand/logo-blue.svg",...Array(3).fill("assets/product-line/matsukita-gallery-v2.png")];
  const favoriteKey=favoriteKeyFor(fragrance);
  const favoriteActive=favorites.includes(favoriteKey);
  const reviews=loadReviews();
  const ownReview=reviews[0]||null;
  const averageRating=reviews.length?reviews.reduce((sum,review)=>sum+Number(review.rating||0),0)/reviews.length:0;
  breadcrumbCurrent.textContent=`FLUIDE ${fragranceNumber} ${title}`;
  document.title=`FLUIDE ${fragranceNumber} ${title} — купить аромат`;
  document.querySelector('meta[name="description"]').content=`FLUIDE ${fragranceNumber} ${title}: ноты, характеристики и цена 30/50 мл.`;
  headerFavorite.classList.toggle("is-active",favoriteActive);
  headerFavorite.setAttribute("aria-label",favoriteActive?"Удалить из избранного":"Добавить в избранное");

  page.innerHTML=`<article class="product-layout">
    <div class="product-overview">
      <section class="product-gallery">
        <div class="product-gallery-stage">
          <button class="gallery-arrow gallery-arrow--prev" type="button" data-gallery-step="-1" aria-label="Предыдущее изображение"><svg aria-hidden="true"><use href="assets/icons/lucide.svg#arrow-left"></use></svg></button>
          <img class="product-main-image" data-gallery-main src="${escapeHtml(galleryImages[0])}" alt="Флакон FLUIDE ${escapeHtml(title)}">
          <button class="gallery-arrow gallery-arrow--next" type="button" data-gallery-step="1" aria-label="Следующее изображение"><svg aria-hidden="true"><use href="assets/icons/lucide.svg#arrow-right"></use></svg></button>
        </div>
        <div class="product-thumbnails" aria-label="Фотографии товара"><button class="product-thumbnails-arrow product-thumbnails-arrow--prev" type="button" data-gallery-step="-1" aria-label="Предыдущее изображение в галерее"><svg aria-hidden="true"><use href="assets/icons/lucide.svg#arrow-left"></use></svg></button><div class="product-thumbnails-viewport"><div class="product-thumbnail-track">${galleryImages.map((image,index)=>`<button class="product-thumbnail ${index===0?"is-active":""}" type="button" data-gallery-index="${index}" style="background-image:url('${escapeHtml(image)}')" aria-label="${index===0?"Основное изображение":`Дополнительное изображение ${index}`}"><img src="${escapeHtml(image)}" alt=""></button>`).join("")}</div></div><button class="product-thumbnails-arrow product-thumbnails-arrow--next" type="button" data-gallery-step="1" aria-label="Следующее изображение в галерее"><svg aria-hidden="true"><use href="assets/icons/lucide.svg#arrow-right"></use></svg></button></div>
      </section>
      <section class="product-details">
        <h1>FLUIDE ${escapeHtml(fragranceNumber)} ${escapeHtml(title)}</h1>
        <p class="product-inspiration">По мотивам ${escapeHtml(fragrance.original)}</p>
        <div class="product-rating" data-product-rating aria-label="${reviews.length?`Средняя оценка ${averageRating.toFixed(1)} из 5`:`У этого товара пока нет оценок`}"><span class="product-rating-stars">${ratingButtonsMarkup(Math.round(averageRating))}</span><button type="button" data-review-open>Отзывы (<span data-review-count>${reviews.length}</span>)</button></div>
        <div class="product-purchase">
          <div class="product-price" data-product-price>${formatPriceMarkup(priceFor(fragrance))}</div>
          <fieldset class="product-choice"><legend>Объем</legend><div class="volume-options"><button class="volume-option is-active" type="button" data-size="30">30 мл</button><button class="volume-option" type="button" data-size="50">50 мл</button></div></fieldset>
          <div class="quantity-block"><span>Количество</span><div class="quantity-control"><button type="button" data-quantity="-1" aria-label="Уменьшить количество">−</button><output data-product-quantity>1</output><button type="button" data-quantity="1" aria-label="Увеличить количество">+</button></div></div>
          <div class="product-actions"><button class="product-add" type="button">В корзину</button><button class="product-buy-now" type="button">Купить в 1 клик</button><button class="product-like ${favoriteActive?"is-active":""}" type="button" aria-label="${favoriteActive?"Удалить из избранного":"Добавить в избранное"}"><svg aria-hidden="true"><use href="assets/icons/lucide.svg#heart"></use></svg></button></div>
          <p class="product-delivery-note"><svg aria-hidden="true"><use href="assets/icons/lucide.svg?v=product-v1#truck"></use></svg>Бесплатная доставка от 5 000 ₽</p>
        </div>
      </section>
    </div>
    <section class="product-info">
      <div class="product-tabs" role="tablist" aria-label="Информация о товаре">
        <button class="product-tab is-active" type="button" role="tab" aria-selected="true" aria-controls="product-tab-about" data-product-tab="about" data-label="Об аромате">Об аромате</button>
        <button class="product-tab" type="button" role="tab" aria-selected="false" aria-controls="product-tab-pyramid" data-product-tab="pyramid" data-label="Пирамида аромата">Пирамида аромата</button>
        ${accords.length?`<button class="product-tab" type="button" role="tab" aria-selected="false" aria-controls="product-tab-accords" data-product-tab="accords" data-label="Аккорды аромата">Аккорды аромата</button>`:""}
        <button class="product-tab" type="button" role="tab" aria-selected="false" aria-controls="product-tab-occasion" data-product-tab="occasion" data-label="Когда носить">Когда носить</button>
        <button class="product-tab" type="button" role="tab" aria-selected="false" aria-controls="product-tab-reviews" data-product-tab="reviews" data-label="Отзывы">Отзывы</button>
      </div>
      <div class="product-tab-panels">
        <section class="product-tab-panel is-active" id="product-tab-about" role="tabpanel" data-product-panel="about"><div class="product-about-grid"><p>${productDescription(fragrance)}</p><div class="product-about-aside"><div><span>Концентрация</span><strong>${escapeHtml(fragrance.concentration||"—")}</strong></div><div><span>Сезон</span><strong>${escapeHtml(seasons.join(", ")||"В любое время")}</strong></div><div><span>Для кого</span><strong>${escapeHtml(GENDER_LABELS[fragrance.gender]||fragrance.gender||"Унисекс")}</strong></div></div></div></section>
        <section class="product-tab-panel" id="product-tab-pyramid" role="tabpanel" data-product-panel="pyramid" hidden><div class="pyramid-grid">${noteRows(fragrance)||`<div class="pyramid-row"><span>Ноты</span><strong>${escapeHtml(allNotes(fragrance).join(", ")||fragrance.group||"Парфюмерная композиция")}</strong></div>`}</div></section>
        ${accords.length?`<section class="product-tab-panel" id="product-tab-accords" role="tabpanel" data-product-panel="accords" hidden><div class="accord-grid">${accords.map(accord=>`<div class="product-accord"><span>${escapeHtml(accord.name)}</span><div class="product-accord-track"><i style="width:${Math.max(4,Math.min(100,Number(accord.weight)||0))}%"></i></div><b>${Math.round(Number(accord.weight)||0)}</b></div>`).join("")}</div></section>`:""}
        <section class="product-tab-panel" id="product-tab-occasion" role="tabpanel" data-product-panel="occasion" hidden><div class="occasion-grid"><div class="occasion-card"><span>Сезон</span><p>${escapeHtml(seasons.join(", ")||"В любое время")}</p></div><div class="occasion-card"><span>Повод</span><p>${escapeHtml(occasions.join(", ")||"На каждый день")}</p></div></div></section>
        <section class="product-tab-panel" id="product-tab-reviews" role="tabpanel" data-product-panel="reviews" hidden><div class="product-reviews-layout"><div class="product-review-list" data-review-list></div><form class="product-review-form" data-review-form ${ownReview?"hidden":""}><fieldset><legend>Ваша оценка</legend><div class="product-review-rating-picker">${ratingButtonsMarkup(Number(ownReview?.rating)||0,"data-form-rating")}</div></fieldset><label>Ваше имя<input name="name" type="text" maxlength="40" autocomplete="name" value="${escapeHtml(ownReview?.name||"")}" required></label><label>Отзыв<textarea name="text" rows="4" maxlength="700" required>${escapeHtml(ownReview?.text||"")}</textarea></label><button type="submit">${ownReview?"Сохранить изменения":"Оставить отзыв"}</button></form></div></section>
      </div>
    </section>
  </article>`;

  page.querySelectorAll("[data-size]").forEach(button=>button.addEventListener("click",()=>selectSize(button.dataset.size)));
  page.querySelectorAll("[data-quantity]").forEach(button=>button.addEventListener("click",()=>changeQuantity(Number(button.dataset.quantity))));
  let galleryIndex=0;
  const showGalleryImage=index=>{galleryIndex=(index+galleryImages.length)%galleryImages.length;page.querySelector("[data-gallery-main]").src=galleryImages[galleryIndex];page.querySelectorAll("[data-gallery-index]").forEach(button=>{const active=Number(button.dataset.galleryIndex)===galleryIndex;button.classList.toggle("is-active",active);if(active)button.scrollIntoView({behavior:"smooth",block:"nearest",inline:"nearest"})})};
  page.querySelectorAll("[data-gallery-index]").forEach(button=>button.addEventListener("click",()=>showGalleryImage(Number(button.dataset.galleryIndex))));
  page.querySelectorAll("[data-gallery-step]").forEach(button=>button.addEventListener("click",()=>showGalleryImage(galleryIndex+Number(button.dataset.galleryStep))));
  page.querySelectorAll("[data-product-tab]").forEach(button=>button.addEventListener("click",()=>selectProductTab(button.dataset.productTab)));
  page.querySelector("[data-review-open]").addEventListener("click",()=>selectProductTab("reviews"));
  page.querySelectorAll("[data-review-star]").forEach(button=>button.addEventListener("click",()=>{selectProductTab("reviews");openReviewEditor(Number(button.dataset.reviewStar),true)}));
  page.querySelectorAll("[data-form-rating]").forEach(button=>button.addEventListener("click",()=>setReviewRating(Number(button.dataset.formRating))));
  page.querySelector("[data-review-form]").addEventListener("submit",submitReview);
  renderReviewList();
  page.querySelector(".product-add").addEventListener("click",addToCart);
  page.querySelector(".product-buy-now").addEventListener("click",()=>showToast("Быстрая покупка будет подключена позже"));
  page.querySelector(".product-like").addEventListener("click",toggleFavorite);
  renderRelated();
}

function selectProductTab(name){
  page.querySelectorAll("[data-product-tab]").forEach(button=>{
    const active=button.dataset.productTab===name;
    button.classList.toggle("is-active",active);
    button.setAttribute("aria-selected",String(active));
  });
  page.querySelectorAll("[data-product-panel]").forEach(panel=>{
    const active=panel.dataset.productPanel===name;
    panel.hidden=!active;
    panel.classList.toggle("is-active",active);
  });
}

function setReviewRating(rating,focusForm=false){
  selectedRating=Math.max(1,Math.min(5,rating));
  page.querySelectorAll("[data-form-rating]").forEach(button=>{
    const filled=Number(button.dataset.formRating)<=selectedRating;
    button.classList.toggle("is-filled",filled);
    button.querySelector("svg")?.classList.toggle("is-filled",filled);
  });
  if(focusForm)page.querySelector('[data-review-form] input[name="name"]')?.focus();
}

function openReviewEditor(rating,focusForm=false){
  const form=page.querySelector("[data-review-form]");
  const ownReview=loadReviews()[0];
  if(!form)return;
  form.hidden=false;
  if(ownReview){
    form.elements.name.value=ownReview.name||"";
    form.elements.text.value=ownReview.text||"";
  }
  form.querySelector('button[type="submit"]').textContent=ownReview?"Сохранить изменения":"Оставить отзыв";
  setReviewRating(Number(rating)||Number(ownReview?.rating)||1,focusForm);
}

function renderReviewList(){
  const reviews=loadReviews();
  const list=page.querySelector("[data-review-list]");
  if(list)list.innerHTML=reviews.length?reviews.map((review,index)=>`<article class="product-review"><div class="product-review-head"><strong>${escapeHtml(review.name)}</strong><div class="product-review-meta"><span class="product-review-stars" aria-label="Оценка ${Number(review.rating)||0} из 5">${Array.from({length:5},(_,starIndex)=>starMarkup(starIndex<Number(review.rating))).join("")}</span><time datetime="${escapeHtml(review.date||"")}">${formatReviewDate(review.date)}</time></div></div><p>${escapeHtml(review.text)}</p>${index===0?`<button class="product-review-edit" type="button" data-edit-review>Редактировать отзыв</button>`:""}</article>`).join(""):`<div class="product-reviews-empty"><strong>Отзывов пока нет</strong><p>Будьте первым, кто поделится впечатлением ${isCatalogProduct(fragrance)?"о товаре":"об аромате"}.</p></div>`;
  const average=reviews.length?reviews.reduce((sum,review)=>sum+Number(review.rating||0),0)/reviews.length:0;
  const rating=page.querySelector("[data-product-rating]");
  if(rating){
    rating.setAttribute("aria-label",reviews.length?`Средняя оценка ${average.toFixed(1)} из 5`:`У этого товара пока нет оценок`);
    rating.querySelectorAll("[data-review-star]").forEach(button=>{
      const filled=Number(button.dataset.reviewStar)<=Math.round(average);
      button.classList.toggle("is-filled",filled);
      button.querySelector("svg")?.classList.toggle("is-filled",filled);
    });
  }
  const count=page.querySelector("[data-review-count]");
  if(count)count.textContent=reviews.length;
  list?.querySelector("[data-edit-review]")?.addEventListener("click",()=>openReviewEditor(Number(reviews[0]?.rating)||1,true));
}

function submitReview(event){
  event.preventDefault();
  if(!selectedRating){showToast("Выберите оценку от 1 до 5 звезд");return}
  const form=event.currentTarget;
  const data=new FormData(form);
  const review={name:String(data.get("name")||"").trim(),text:String(data.get("text")||"").trim(),rating:selectedRating};
  if(!review.name||!review.text){showToast("Заполните имя и текст отзыва");return}
  const reviews=loadReviews();
  const hadReview=reviews.length>0;
  review.date=reviews[0]?.date||new Date().toISOString();
  if(reviews.length)reviews[0]=review;else reviews.unshift(review);
  try{localStorage.setItem(reviewKey(),JSON.stringify(reviews))}catch{}
  form.hidden=true;
  renderReviewList();
  showToast(hadReview?"Изменения сохранены":"Спасибо, отзыв сохранен");
}

function selectSize(size){
  selectedSize=size;
  page.querySelector("[data-product-price]").innerHTML=formatPriceMarkup(priceFor(fragrance,size));
  page.querySelectorAll("[data-size]").forEach(button=>button.classList.toggle("is-active",button.dataset.size===size));
}

function changeQuantity(delta){
  selectedQuantity=Math.max(1,Math.min(10,selectedQuantity+delta));
  page.querySelector("[data-product-quantity]").textContent=selectedQuantity;
}

function toggleFavorite(){
  const key=favoriteKeyFor(fragrance);
  toggleFavoriteKey(key);
  const active=favorites.includes(key);
  const productLike=page.querySelector(".product-like");
  productLike?.classList.toggle("is-active",active);
  productLike?.setAttribute("aria-label",active?"Удалить из избранного":"Добавить в избранное");
  headerFavorite.classList.toggle("is-active",active);
  headerFavorite.setAttribute("aria-label",active?"Удалить из избранного":"Добавить в избранное");
  showToast(active?"Добавлено в избранное":"Удалено из избранного");
}

function toggleFavoriteKey(key){
  favorites=favorites.includes(key)?favorites.filter(value=>value!==key):[...favorites,key];
  localStorage.setItem("fluide-favorites",JSON.stringify(favorites));
}

function addToCart(){
  if(isCatalogProduct(fragrance)){
    const key=fragrance.id;
    const existing=cart.find(item=>item.id===key);
    const snapshot={name:fragrance.title,price:priceFor(fragrance),image:fragrance.image||"assets/brand/logo-blue.svg",category:[fragrance.typeLabel,fragrance.volume].filter(Boolean).join(" · ")};
    if(existing){existing.quantity+=selectedQuantity;existing.product=snapshot}else cart.push({id:key,quantity:selectedQuantity,product:snapshot});
    saveCart();renderCart();showToast(`${fragrance.title} — в корзине`);
    return;
  }
  const key=`fragrance-${fragrance.id}-${selectedSize}`;
  const existing=cart.find(item=>item.id===key);
  const snapshot={name:`FLUIDE ${Number(fragrance.id)||fragrance.id} ${prettyTitle(fragrance.title)} · ${selectedSize} мл`,price:priceFor(fragrance),image:fragrance.image||"assets/brand/logo-blue.svg",category:`Парфюм · ${selectedSize} мл`};
  if(existing){existing.quantity+=selectedQuantity;existing.product=snapshot}else cart.push({id:key,quantity:selectedQuantity,product:snapshot});
  saveCart();renderCart();showToast(`${selectedQuantity} × ${selectedSize} мл добавлено в корзину`);
}

function renderRelated(){
  relatedSection.hidden=true;
  if(isCatalogProduct(fragrance)){
    const related=catalogProducts.filter(item=>item.id!==fragrance.id&&item.productType===fragrance.productType).slice(0,4);
    if(!related.length)return;
    relatedGrid.innerHTML=related.map(item=>{const key=favoriteKeyFor(item);const href=`product.html?id=${encodeURIComponent(item.id)}`;const meta=[item.typeLabel,item.volume].filter(Boolean).join(" · ");return `<article class="related-card">
      <div class="related-card-visual">
        <span class="related-card-badge">${escapeHtml(item.typeLabel||"Коллекция")}</span>
        <button class="related-card-favorite ${favorites.includes(key)?"is-active":""}" type="button" data-related-favorite="${escapeHtml(key)}" aria-label="${favorites.includes(key)?"Удалить из избранного":"Добавить в избранное"}"><svg aria-hidden="true"><use href="assets/icons/lucide.svg#heart"></use></svg></button>
        <a class="related-card-media" href="${href}">${productVisual(item,"related")}</a>
      </div>
      <div class="related-card-info">
        <h3><a href="${href}">${escapeHtml(item.title)}</a></h3>
        <p>${escapeHtml(meta||"Продукция FLUIDE Atelier")}</p>
        <div class="related-card-purchase"><strong>${formatPriceMarkup(priceFor(item))}</strong><a class="related-card-add" href="${href}">Подробнее</a></div>
      </div>
    </article>`}).join("");
    relatedGrid.querySelectorAll("[data-related-favorite]").forEach(button=>button.addEventListener("click",()=>{
      const key=button.dataset.relatedFavorite;
      toggleFavoriteKey(key);
      const active=favorites.includes(key);
      button.classList.toggle("is-active",active);
      button.setAttribute("aria-label",active?"Удалить из избранного":"Добавить в избранное");
      showToast(active?"Добавлено в избранное":"Удалено из избранного");
    }));
    relatedSection.hidden=false;
    return;
  }
  const related=fragrances.filter(item=>item.id!==fragrance.id&&((item.families||[]).some(value=>(fragrance.families||[]).includes(value))||item.category===fragrance.category)).slice(0,4);
  if(!related.length)return;
  relatedGrid.innerHTML=related.map(item=>{const key=`fragrance-${item.id}`;const href=`product.html?id=${encodeURIComponent(item.id)}`;return `<article class="related-card">
    <div class="related-card-visual">
      <span class="related-card-badge">${escapeHtml(item.category||"Коллекция")}</span>
      <button class="related-card-favorite ${favorites.includes(key)?"is-active":""}" type="button" data-related-favorite="${escapeHtml(key)}" aria-label="${favorites.includes(key)?"Удалить из избранного":"Добавить в избранное"}"><svg aria-hidden="true"><use href="assets/icons/lucide.svg#heart"></use></svg></button>
      <a class="related-card-media" href="${href}">${productVisual(item,"related")}</a>
    </div>
    <div class="related-card-info">
      <h3><a href="${href}">FLUIDE ${escapeHtml(Number(item.id)||item.id)} ${escapeHtml(prettyTitle(item.title))}</a></h3>
      <p>По мотивам ${escapeHtml(item.original)}</p>
      <div class="related-card-purchase"><strong>от ${formatPriceMarkup(priceFor(item,"30"))}</strong><a class="related-card-add" href="${href}">Выбрать</a></div>
    </div>
  </article>`}).join("");
  relatedGrid.querySelectorAll("[data-related-favorite]").forEach(button=>button.addEventListener("click",()=>{
    const key=button.dataset.relatedFavorite;
    toggleFavoriteKey(key);
    const active=favorites.includes(key);
    button.classList.toggle("is-active",active);
    button.setAttribute("aria-label",active?"Удалить из избранного":"Добавить в избранное");
    showToast(active?"Добавлено в избранное":"Удалено из избранного");
  }));
  relatedSection.hidden=false;
}

function saveCart(){localStorage.setItem("fluide-cart",JSON.stringify(cart))}
function renderCart(){
  const detailed=cart.map((item,index)=>({item,index,product:item.product||HOME_PRODUCT_SNAPSHOTS[item.id]||null})).filter(row=>row.product);
  const quantity=cart.reduce((sum,item)=>sum+(Number(item.quantity)||0),0);
  cartCount.textContent=quantity||"";
  cartCount.hidden=quantity===0;
  const total=detailed.reduce((sum,row)=>sum+row.product.price*row.item.quantity,0);
  cartFooter.hidden=true;
  cartTotal.innerHTML=formatPriceMarkup(total);
  cartItems.innerHTML=detailed.length?`${detailed.map(({item,index,product})=>`<div class="cart-row"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}"><div><h3>${escapeHtml(product.name)}</h3><p>${formatPriceMarkup(product.price)}</p><div class="cart-quantity"><button type="button" data-cart-index="${index}" data-cart-delta="-1" aria-label="Уменьшить количество"><svg><use href="assets/icons/lucide.svg#minus"></use></svg></button><span>${item.quantity}</span><button type="button" data-cart-index="${index}" data-cart-delta="1" aria-label="Увеличить количество"><svg><use href="assets/icons/lucide.svg#plus"></use></svg></button></div></div><button type="button" data-remove-cart="${escapeHtml(item.id)}" aria-label="Удалить ${escapeHtml(product.name)}"><svg><use href="assets/icons/lucide.svg#trash-2"></use></svg></button></div>`).join("")}<div class="cart-total"><span>Итого</span><span>${formatPriceMarkup(total)}</span></div><p class="cart-note">Товары сохранены в корзине. Онлайн-оформление заказа пока не подключено.</p><a class="cart-continue" href="catalog.html"><span>Продолжить выбор</span><svg aria-hidden="true"><use href="assets/icons/lucide.svg#move-right"></use></svg></a>`:`<div class="cart-empty"><div class="cart-empty-content"><p>В корзине пока пусто</p><small>Добавьте аромат из коллекции</small><a class="cart-continue" href="catalog.html"><span>Продолжить выбор</span><svg aria-hidden="true"><use href="assets/icons/lucide.svg#move-right"></use></svg></a></div></div>`;
}
function openCart(){cartDrawer.classList.add("is-open");cartDrawer.setAttribute("aria-hidden","false");backdrop.classList.add("is-open");document.body.classList.add("is-locked")}
function closeCart(){cartDrawer.classList.remove("is-open");cartDrawer.setAttribute("aria-hidden","true");backdrop.classList.remove("is-open");document.body.classList.remove("is-locked")}
function showToast(message){toast.textContent=message;toast.classList.add("is-visible");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove("is-visible"),2200)}
function renderError(){page.innerHTML=`<section class="product-error"><h1>Товар не найден</h1><p>Вернитесь в каталог и выберите другой товар.</p><a href="catalog.html">Перейти в каталог</a></section>`;breadcrumbCurrent.textContent="Товар не найден"}

function openInfo(type){
  const content={
    delivery:{title:"Доставка и оплата",html:"<p>Доставка по России. Условия, сроки и способы оплаты уточняются при оформлении заказа.</p><p>Онлайн-оформление пока не подключено.</p>"},
    contacts:{title:"Связаться с FLUIDE",html:"<p>FLUIDE Atelier — парфюмерный бренд из Владимира.</p><p>Контакты и часы работы будут добавлены после подтверждения командой бренда.</p>"},
    privacy:{title:"Персональные данные",html:"<p>Корзина, избранное и выбор cookie сохраняются локально в вашем браузере.</p><p>Полная политика обработки персональных данных будет добавлена перед запуском онлайн-заказов.</p>"}
  }[type];
  if(!content)return;
  infoTitle.textContent=content.title;
  infoContent.innerHTML=content.html;
  infoDialog.showModal();
}

cartButton.addEventListener("click",openCart);cartClose.addEventListener("click",closeCart);backdrop.addEventListener("click",closeCart);
cartItems.addEventListener("click",event=>{const quantityButton=event.target.closest("[data-cart-index]");if(quantityButton){const row=cart[Number(quantityButton.dataset.cartIndex)];if(row){row.quantity=(Number(row.quantity)||0)+Number(quantityButton.dataset.cartDelta);cart=cart.filter(item=>item.quantity>0);saveCart();renderCart()}return}const button=event.target.closest("[data-remove-cart]");if(!button)return;cart=cart.filter(item=>item.id!==button.dataset.removeCart);saveCart();renderCart()});
headerFavorite.addEventListener("click",()=>{if(fragrance)toggleFavorite()});
menuToggle.addEventListener("click",()=>{const open=mobileNav.classList.toggle("is-open");menuToggle.setAttribute("aria-expanded",String(open))});
mobileNav.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>{mobileNav.classList.remove("is-open");menuToggle.setAttribute("aria-expanded","false")}));
document.addEventListener("keydown",event=>{if(event.key==="Escape")closeCart()});
document.querySelectorAll("[data-info]").forEach(button=>button.addEventListener("click",()=>openInfo(button.dataset.info)));
document.querySelector(".info-close").addEventListener("click",()=>infoDialog.close());
infoDialog.addEventListener("click",event=>{if(event.target===infoDialog)infoDialog.close()});

const serviceMessages=["Доставка по России · бесплатно от 5 000 ₽","Три любимых аромата по цене двух","Откройте свой аромат с FLUIDE"];
let serviceIndex=0;
document.querySelectorAll("[data-service]").forEach(button=>button.addEventListener("click",()=>{serviceIndex=(serviceIndex+Number(button.dataset.service)+serviceMessages.length)%serviceMessages.length;document.querySelector("#service-message").textContent=serviceMessages[serviceIndex]}));

function syncHeaderHeight(){catalogHeader.classList.toggle("scrolled",scrollY>60)}
window.addEventListener("scroll",syncHeaderHeight,{passive:true});
syncHeaderHeight();

const cookie=document.querySelector(".cookie");
try{cookie.hidden=localStorage.getItem("fluide-cookie-consent")==="accepted"}catch{cookie.hidden=false}
document.querySelector("[data-cookie-accept]").addEventListener("click",()=>{try{localStorage.setItem("fluide-cookie-consent","accepted")}catch{}cookie.hidden=true});
document.querySelector("[data-cookie-settings]").addEventListener("click",()=>{cookie.hidden=false});

async function init(){
  renderCart();
  try{
    const catalog=await window.FluideCatalogData.load();
    fragrances=(catalog.fragrances||[]).filter(item=>item?.id);
    catalogProducts=(catalog.products||[]).filter(item=>item?.id&&item?.kind==="product");
    if(catalog.prices){PRICE_BY_SIZE={...PRICE_BY_SIZE,...(catalog.prices.perfume||{})}}
    const requested=new URLSearchParams(location.search).get("id")||"";
    fragrance=fragrances.find(item=>item.id===requested.padStart(3,"0"))||catalogProducts.find(item=>item.id===requested);
    if(!fragrance){renderError();return}
    if(isCatalogProduct(fragrance))renderCatalogProduct();else renderProduct();
  }catch(error){renderError();console.error(error)}
}
init();
