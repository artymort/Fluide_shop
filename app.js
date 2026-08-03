const products = [
  {
    id: "matsukita",
    name: "Matsukita",
    category: "perfume",
    categoryLabel: "Парфюм · 30 мл",
    description: "№ 533 · Eau de parfum",
    badge: "Бестселлер",
    price: 1990,
    image: "assets/product-line/fragrance-matsukita.png",
    color: "#e9dfe1"
  },
  {
    id: "devils-intrigue",
    name: "Devils Intrigue",
    category: "care",
    categoryLabel: "Спрей для волос · 200 мл",
    description: "Парфюмированный уход FLUIDE",
    badge: "Уход",
    price: 650,
    image: "assets/product-line/hair-spray-devils-intrigue.png",
    color: "#e8e3dc"
  },
  {
    id: "cashmere",
    name: "Cashmere",
    category: "home",
    categoryLabel: "Аромадиффузор · 100 мл",
    description: "Мягкий аромат для пространства",
    badge: "Для дома",
    price: 1350,
    image: "assets/product-line/diffuser-cashmere.png",
    color: "#dce5ea"
  },
  {
    id: "auto",
    name: "Car Scent",
    category: "auto",
    categoryLabel: "Автопарфюм",
    description: "Аромат для вашего автомобиля",
    badge: "Авто",
    price: 300,
    image: "assets/product-line/car-fragrance.png",
    color: "#e7e5dc"
  },
  {
    id: "sea-salt",
    name: "Sea Salt",
    category: "home",
    categoryLabel: "Парфюм для дома · 300 мл",
    description: "Чистый морской воздух",
    badge: "Для дома",
    price: 550,
    image: "assets/product-line/home-perfume-sea-salt.png",
    color: "#dce8ed"
  },
  {
    id: "matsukita-solid",
    name: "Matsukita Solid",
    category: "perfume",
    categoryLabel: "Твёрдый парфюм · 15 мл",
    description: "Компактный ароматический ритуал",
    badge: "Парфюм",
    price: 990,
    image: "assets/product-line/solid-perfume-matsukita.png",
    color: "#eadfe0"
  },
  {
    id: "ballerina",
    name: "Ballerina",
    category: "home",
    categoryLabel: "Аромасвеча · 100 мл",
    description: "Тёплый свет и тонкий аромат",
    badge: "Свеча",
    price: 890,
    image: "assets/product-line/candle-ballerina.png",
    color: "#ece6de"
  }
];

const productGrid = document.querySelector(".product-grid");
const filters = document.querySelectorAll(".filter");
const categoryLinks = document.querySelectorAll("[data-category-link]");
const moodCards = document.querySelectorAll(".mood-card");
const menuToggle = document.querySelector(".menu-toggle");
const mobileLinks = document.querySelectorAll(".mobile-nav a");
const searchOpen = document.querySelector(".search-open");
const searchClose = document.querySelector(".search-close");
const searchForm = document.querySelector(".search-form");
const searchInput = document.querySelector("#site-search");
const cartOpen = document.querySelector(".cart-open");
const cartClose = document.querySelector(".cart-close");
const cartPanel = document.querySelector(".cart-panel");
const cartItems = document.querySelector(".cart-items");
const cartCount = document.querySelector(".cart-count");
const cartTotal = document.querySelector(".cart-total");
const panelBackdrop = document.querySelector(".panel-backdrop");
const toast = document.querySelector(".toast");

let activeFilter = "all";
let searchQuery = "";
let toastTimer;
let cart = JSON.parse(localStorage.getItem("fluide-cart") || "[]");

function formatPrice(value) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

function productCard(product) {
  return `
    <article class="product-card" data-id="${product.id}">
      <div class="product-image" style="--product-bg:${product.color}">
        <span class="product-badge">${product.badge}</span>
        <button class="favorite" type="button" aria-label="Добавить ${product.name} в избранное">♡</button>
        <img src="${product.image}" alt="${product.name} FLUIDE" loading="lazy">
      </div>
      <div class="product-info">
        <p class="product-kicker">${product.categoryLabel}</p>
        <div class="product-title"><h3>${product.name}</h3><span>${formatPrice(product.price)}</span></div>
        <p class="product-description">${product.description}</p>
        <button class="product-add" type="button">Добавить в корзину</button>
      </div>
    </article>
  `;
}

function renderProducts() {
  const query = searchQuery.trim().toLowerCase();
  const visible = products.filter((product) => {
    const matchesFilter = activeFilter === "all" || product.category === activeFilter;
    const searchSource = `${product.name} ${product.categoryLabel} ${product.description}`.toLowerCase();
    return matchesFilter && searchSource.includes(query);
  });

  productGrid.innerHTML = visible.length
    ? visible.map(productCard).join("")
    : '<p class="product-empty">По вашему запросу ничего не найдено.</p>';

  bindProductCards();
  preventOrphans(productGrid);
}

function setFilter(filter) {
  activeFilter = filter;
  filters.forEach((button) => button.classList.toggle("is-active", button.dataset.filter === filter));
  renderProducts();
}

function bindProductCards() {
  document.querySelectorAll(".product-card").forEach((card) => {
    const product = products.find((item) => item.id === card.dataset.id);
    card.querySelector(".product-add").addEventListener("click", () => addToCart(product.id));
    card.querySelector(".favorite").addEventListener("click", (event) => {
      const active = event.currentTarget.classList.toggle("is-active");
      event.currentTarget.textContent = active ? "♥" : "♡";
      showToast(active ? `${product.name} добавлен в избранное` : `${product.name} удалён из избранного`);
    });
  });
}

function addToCart(id) {
  const existing = cart.find((item) => item.id === id);
  if (existing) existing.quantity += 1;
  else cart.push({ id, quantity: 1 });
  saveCart();
  renderCart();
  showToast("Товар добавлен в корзину");
}

function removeFromCart(id) {
  cart = cart.filter((item) => item.id !== id);
  saveCart();
  renderCart();
}

function saveCart() {
  localStorage.setItem("fluide-cart", JSON.stringify(cart));
}

function renderCart() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => {
    const product = products.find((entry) => entry.id === item.id);
    return product ? sum + product.price * item.quantity : sum;
  }, 0);

  cartCount.textContent = count;
  cartTotal.textContent = formatPrice(total);
  cartPanel.classList.toggle("is-empty", cart.length === 0);
  cartItems.innerHTML = cart.map((item) => {
    const product = products.find((entry) => entry.id === item.id);
    if (!product) return "";
    return `
      <article class="cart-item">
        <div class="cart-item__image"><img src="${product.image}" alt=""></div>
        <div><h3>${product.name}</h3><p>${item.quantity} × ${formatPrice(product.price)}</p></div>
        <button class="cart-remove" type="button" data-remove="${product.id}" aria-label="Удалить ${product.name}">×</button>
      </article>
    `;
  }).join("");

  document.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => removeFromCart(button.dataset.remove));
  });
  preventOrphans(cartItems);
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2300);
}

function closePanels() {
  document.body.classList.remove("search-active", "cart-active");
}

function closeMenu() {
  document.body.classList.remove("menu-open");
  menuToggle.setAttribute("aria-expanded", "false");
}

function preventOrphans(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest("script,style,textarea")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    node.nodeValue = node.nodeValue.replace(/(^|\s)([А-Яа-яЁёA-Za-z])\s+(?=\S)/g, "$1$2\u00a0");
  });
}

filters.forEach((button) => button.addEventListener("click", () => setFilter(button.dataset.filter)));

categoryLinks.forEach((link) => {
  link.addEventListener("click", () => setFilter(link.dataset.categoryLink));
});

moodCards.forEach((button) => {
  button.addEventListener("click", () => {
    const filterByMood = { fresh: "home", soft: "perfume", warm: "home", deep: "perfume" };
    setFilter(filterByMood[button.dataset.mood]);
    document.querySelector("#shop").scrollIntoView({ behavior: "smooth" });
  });
});

document.querySelector(".add-signature").addEventListener("click", (event) => addToCart(event.currentTarget.dataset.productId));

menuToggle.addEventListener("click", () => {
  const open = document.body.classList.toggle("menu-open");
  menuToggle.setAttribute("aria-expanded", String(open));
});

mobileLinks.forEach((link) => link.addEventListener("click", closeMenu));
searchOpen.addEventListener("click", () => { document.body.classList.add("search-active"); setTimeout(() => searchInput.focus(), 160); });
searchClose.addEventListener("click", closePanels);
cartOpen.addEventListener("click", () => document.body.classList.add("cart-active"));
cartClose.addEventListener("click", closePanels);
panelBackdrop.addEventListener("click", closePanels);

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchQuery = searchInput.value;
  setFilter("all");
  closePanels();
  document.querySelector("#shop").scrollIntoView({ behavior: "smooth" });
});

document.querySelector(".checkout").addEventListener("click", () => showToast("Оформление заказа будет подключено на следующем этапе"));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
    closePanels();
  }
});

window.addEventListener("scroll", () => {
  document.body.classList.toggle("past-hero", window.scrollY > window.innerHeight * .72);
}, { passive: true });

renderProducts();
renderCart();
preventOrphans();
