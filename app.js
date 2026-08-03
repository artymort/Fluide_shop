const products = [
  {
    id: 19,
    name: "FLUIDE 019 Cherry",
    gender: "female",
    label: "Для неё",
    type: "Люкс",
    price: 1990,
    notes: "Кислая вишня · малина · ваниль · сандал",
    image: "assets/product-line/fragrance-cherry.png",
    color: "#e9ded0"
  },
  {
    id: 6,
    name: "FLUIDE 006 Hayati",
    gender: "unisex",
    label: "Унисекс",
    type: "Селектив",
    price: 3490,
    notes: "Малина · сливки · ваниль · белый мускус",
    image: "assets/product-line/fragrance-hayati.png",
    color: "#e7c9c1"
  },
  {
    id: 7,
    name: "FLUIDE 007 Musk Kashmir",
    gender: "unisex",
    label: "Унисекс",
    type: "Селектив",
    price: 3490,
    notes: "Белый мускус · белый перец · сандал · гардения",
    image: "assets/product-line/fragrance-musk-kashmir.png",
    color: "#dce4e9"
  },
  {
    id: 50,
    name: "FLUIDE 050 Black Pepper",
    gender: "unisex",
    label: "Унисекс",
    type: "Селектив",
    price: 3490,
    notes: "Чёрный перец · амбра · нероли",
    image: "assets/product-line/fragrance-black-pepper.png",
    color: "#dddcd3"
  },
  {
    id: 185,
    name: "FLUIDE 185 White",
    gender: "male",
    label: "Для него",
    type: "Люкс",
    price: 1990,
    notes: "Грейпфрут · розмарин · кедр · ветивер",
    image: "assets/product-line/fragrance-white.png",
    color: "#e7e8e4"
  },
  {
    id: 526,
    name: "FLUIDE 526 Vanilla Powder",
    gender: "unisex",
    label: "Унисекс",
    type: "Селектив",
    price: 3490,
    notes: "Кокосовая пудра · ваниль · мускус · пало санто",
    image: "assets/product-line/fragrance-vanilla-powder.png",
    color: "#ece4d7"
  }
];

const productGrid = document.querySelector(".product-grid");
const emptyState = document.querySelector(".empty-state");
const filterButtons = document.querySelectorAll(".filter-button");
const menuToggle = document.querySelector(".menu-toggle");
const mobileLinks = document.querySelectorAll(".mobile-nav a");
const searchToggle = document.querySelector(".search-toggle");
const searchClose = document.querySelector(".search-close");
const searchInput = document.querySelector("#site-search");
const searchForm = document.querySelector(".search-form");
const cartCount = document.querySelector(".cart-count");
const toast = document.querySelector(".toast");

let activeFilter = "all";
let searchQuery = "";
let cartTotal = 0;
let toastTimer;

function formatPrice(price) {
  return `${new Intl.NumberFormat("ru-RU").format(price)} ₽`;
}

function productTemplate(product) {
  return `
    <article class="product-card" data-id="${product.id}">
      <div class="product-media" style="--product-bg:${product.color}">
        <span class="product-type">${product.type}</span>
        <button class="heart-button" type="button" aria-label="Добавить ${product.name} в избранное">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.8 8.7c0 5-8.8 10.1-8.8 10.1S3.2 13.7 3.2 8.7c0-2.2 1.7-3.9 3.9-3.9 2.4 0 3.8 2 4.9 3.5 1.1-1.5 2.5-3.5 4.9-3.5 2.2 0 3.9 1.7 3.9 3.9Z"></path>
          </svg>
        </button>
        <img src="${product.image}" alt="${product.name}" loading="lazy">
        <button class="add-button" type="button">Добавить в корзину</button>
      </div>
      <div class="product-info">
        <p class="product-meta">${product.label} · 30 мл</p>
        <div class="product-title-row">
          <h3>${product.name}</h3>
          <p>${formatPrice(product.price)}</p>
        </div>
        <p class="product-notes">${product.notes}</p>
      </div>
    </article>
  `;
}

function renderProducts() {
  const query = searchQuery.trim().toLowerCase();
  let filtered = products.filter((product) => {
    const matchesFilter = activeFilter === "all" || product.gender === activeFilter;
    const source = `${product.name} ${product.notes} ${product.label} ${product.type}`.toLowerCase();
    return matchesFilter && source.includes(query);
  });

  if (activeFilter === "all" && !query) filtered = filtered.slice(0, 4);

  productGrid.innerHTML = filtered.map(productTemplate).join("");
  productGrid.hidden = filtered.length === 0;
  emptyState.hidden = filtered.length > 0;
  bindProductActions();
}

function bindProductActions() {
  document.querySelectorAll(".heart-button").forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.toggle("is-active");
      const product = getProduct(button);
      showToast(button.classList.contains("is-active")
        ? `${product.name} добавлен в избранное`
        : `${product.name} удалён из избранного`);
    });
  });

  document.querySelectorAll(".add-button").forEach((button) => {
    button.addEventListener("click", () => {
      const product = getProduct(button);
      cartTotal += 1;
      cartCount.textContent = cartTotal;
      showToast(`${product.name} добавлен в корзину`);
    });
  });
}

function getProduct(button) {
  const id = Number(button.closest(".product-card").dataset.id);
  return products.find((product) => product.id === id);
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2500);
}

function setFilter(filter) {
  activeFilter = filter;
  filterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === filter);
  });
  renderProducts();
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => setFilter(button.dataset.filter));
});

menuToggle.addEventListener("click", () => {
  const open = document.body.classList.toggle("menu-open");
  menuToggle.setAttribute("aria-expanded", String(open));
});

mobileLinks.forEach((link) => {
  link.addEventListener("click", () => {
    document.body.classList.remove("menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
  });
});

searchToggle.addEventListener("click", () => {
  document.body.classList.add("search-open");
  setTimeout(() => searchInput.focus(), 180);
});

searchClose.addEventListener("click", () => {
  document.body.classList.remove("search-open");
});

searchInput.addEventListener("input", (event) => {
  searchQuery = event.target.value;
  setFilter("all");
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  document.body.classList.remove("search-open");
  document.querySelector("#fragrances").scrollIntoView({ behavior: "smooth" });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.body.classList.remove("menu-open", "search-open");
    menuToggle.setAttribute("aria-expanded", "false");
  }
});

renderProducts();
