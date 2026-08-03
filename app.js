const products = [
  {
    id: "matsukita",
    number: "01",
    name: "Matsukita",
    category: "Парфюм · 30 мл",
    description: "№ 533 · Eau de parfum",
    price: 1990,
    image: "assets/product-line/fragrance-matsukita.png",
    color: "#e9e0d5"
  },
  {
    id: "devils-intrigue",
    number: "02",
    name: "Devils Intrigue",
    category: "Спрей для волос · 200 мл",
    description: "Парфюмированный уход FLUIDE",
    price: 650,
    image: "assets/product-line/hair-spray-devils-intrigue.png",
    color: "#e6ddd2"
  },
  {
    id: "cashmere",
    number: "03",
    name: "Cashmere",
    category: "Аромадиффузор · 100 мл",
    description: "Мягкий аромат для пространства",
    price: 1350,
    image: "assets/product-line/diffuser-cashmere.png",
    color: "#e1e5e4"
  },
  {
    id: "matsukita-solid",
    number: "04",
    name: "Matsukita Solid",
    category: "Твёрдый парфюм · 15 мл",
    description: "Компактный ароматический ритуал",
    price: 990,
    image: "assets/product-line/solid-perfume-matsukita.png",
    color: "#e7d8d1"
  },
  {
    id: "sea-salt",
    number: "05",
    name: "Sea Salt",
    category: "Парфюм для дома · 300 мл",
    description: "Свежесть моря для вашего дома",
    price: 550,
    image: "assets/product-line/home-perfume-sea-salt.png",
    color: "#dce4e7"
  },
  {
    id: "ballerina",
    number: "06",
    name: "Ballerina",
    category: "Аромасвеча · 100 мл",
    description: "Тёплый свет и тонкий аромат",
    price: 890,
    image: "assets/product-line/candle-ballerina.png",
    color: "#e8e1d6"
  }
];

const fragranceGrid = document.querySelector(".fragrance-grid");
const showAllButton = document.querySelector(".show-all");
const menuButton = document.querySelector(".menu-button");
const mobileLinks = document.querySelectorAll(".mobile-menu a");
const openSearchButtons = document.querySelectorAll(".open-search");
const closeSearchButton = document.querySelector(".close-search");
const searchInput = document.querySelector("#search-input");
const searchForm = document.querySelector(".search-bar");
const cartCount = document.querySelector(".cart-count");
const toast = document.querySelector(".toast");

let showAll = false;
let searchQuery = "";
let cartTotal = 0;
let toastTimer;

function formatPrice(price) {
  return `${new Intl.NumberFormat("ru-RU").format(price)} ₽`;
}

function productTemplate(product) {
  return `
    <article class="fragrance-card" data-id="${product.id}">
      <div class="fragrance-visual" style="--product-color: ${product.color}">
        <span class="fragrance-index">${product.number}</span>
        <img src="${product.image}" alt="${product.name} FLUIDE" loading="lazy">
      </div>
      <div class="fragrance-info">
        <p class="fragrance-category">${product.category}</p>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
        <div class="fragrance-meta">
          <span>${formatPrice(product.price)}</span>
          <button class="quick-buy" type="button" aria-label="Добавить ${product.name} в корзину">+</button>
        </div>
      </div>
    </article>
  `;
}

function preventOrphans(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest("script, style, textarea")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    node.nodeValue = node.nodeValue.replace(/(^|\s)([А-Яа-яЁёA-Za-z])\s+(?=\S)/g, "$1$2\u00a0");
  });
}

function renderProducts() {
  const query = searchQuery.trim().toLowerCase();
  const matches = products.filter((product) => {
    const searchable = `${product.name} ${product.category} ${product.description}`.toLowerCase();
    return searchable.includes(query);
  });
  const visibleProducts = query || showAll ? matches : matches.slice(0, 4);

  fragranceGrid.innerHTML = visibleProducts.length
    ? visibleProducts.map(productTemplate).join("")
    : '<p class="no-results">Ничего не найдено. Попробуйте другую категорию или название.</p>';

  showAllButton.hidden = Boolean(query);
  showAllButton.textContent = showAll ? "Скрыть" : "Смотреть все";
  bindProductActions();
  preventOrphans(fragranceGrid);
}

function productFor(button) {
  const card = button.closest(".fragrance-card");
  return products.find((product) => product.id === card.dataset.id);
}

function bindProductActions() {
  document.querySelectorAll(".quick-buy").forEach((button) => {
    button.addEventListener("click", () => {
      const product = productFor(button);
      cartTotal += 1;
      cartCount.textContent = cartTotal;
      showToast(`${product.name} добавлен в корзину`);
    });
  });
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2500);
}

function closeMenu() {
  document.body.classList.remove("menu-open");
  menuButton.setAttribute("aria-expanded", "false");
}

function closeSearch() {
  document.body.classList.remove("search-open");
}

showAllButton.addEventListener("click", () => {
  showAll = !showAll;
  renderProducts();
});

menuButton.addEventListener("click", () => {
  const open = document.body.classList.toggle("menu-open");
  menuButton.setAttribute("aria-expanded", String(open));
});

mobileLinks.forEach((link) => link.addEventListener("click", closeMenu));

openSearchButtons.forEach((button) => {
  button.addEventListener("click", () => {
    document.body.classList.add("search-open");
    setTimeout(() => searchInput.focus(), 150);
  });
});

closeSearchButton.addEventListener("click", closeSearch);

searchInput.addEventListener("input", (event) => {
  searchQuery = event.target.value;
  renderProducts();
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  closeSearch();
  document.querySelector("#shop").scrollIntoView({ behavior: "smooth" });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
    closeSearch();
  }
});

renderProducts();
preventOrphans();
