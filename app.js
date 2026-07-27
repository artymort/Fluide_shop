const products = [
  {
    id: 100,
    name: "FLUIDE 100 Blooming",
    gender: "female",
    label: "Для неё",
    type: "Люкс",
    price: 1990,
    notes: "Пион · дамасская роза · белый мускус",
    image: "assets/products/blooming.jpg",
    color: "#f2e7de"
  },
  {
    id: 49,
    name: "FLUIDE 049 Dark Opium",
    gender: "female",
    label: "Для неё",
    type: "Люкс",
    price: 1990,
    notes: "Кофе · жасмин · ваниль · пачули",
    image: "assets/products/dark-opium.jpg",
    color: "#e8e4df"
  },
  {
    id: 16,
    name: "FLUIDE 016 Aventus",
    gender: "male",
    label: "Для него",
    type: "Селектив",
    price: 3490,
    notes: "Бергамот · ананас · берёза · мускус",
    image: "assets/products/aventus.jpg",
    color: "#e4e9e7"
  },
  {
    id: 25,
    name: "FLUIDE 025 Baccarat",
    gender: "unisex",
    label: "Унисекс",
    type: "Селектив",
    price: 3490,
    notes: "Шафран · жасмин · амбра · кедр",
    image: "assets/products/baccarat.jpg",
    color: "#eee8dc"
  },
  {
    id: 44,
    name: "FLUIDE 044 Bright Crystal",
    gender: "female",
    label: "Для неё",
    type: "Люкс",
    price: 1990,
    notes: "Юдзу · пион · лотос · амбра",
    image: "assets/products/bright-crystal.jpg",
    color: "#e7edf6"
  },
  {
    id: 26,
    name: "FLUIDE 026 Ganymede",
    gender: "unisex",
    label: "Унисекс",
    type: "Селектив",
    price: 3490,
    notes: "Мандарин · кожа · фиалка · бессмертник",
    image: "assets/products/ganymede.jpg",
    color: "#f1e2e1"
  }
];

const productRail = document.querySelector(".product-rail");
const emptyState = document.querySelector(".empty-state");
const filterButtons = document.querySelectorAll(".filter-button");
const collectionLinks = document.querySelectorAll("[data-collection]");
const globalSearchInput = document.querySelector("#global-search-input");
const searchToggle = document.querySelector(".search-toggle");
const searchClose = document.querySelector(".search-close");
const menuButton = document.querySelector(".menu-button");
const mobileLinks = document.querySelectorAll(".mobile-menu a");
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
      <div class="product-media" style="--card-color: ${product.color}">
        <span class="product-badge">${product.type}</span>
        <button class="heart-button" type="button" aria-label="Добавить ${product.name} в избранное">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.8 8.7c0 5-8.8 10.1-8.8 10.1S3.2 13.7 3.2 8.7c0-2.2 1.7-3.9 3.9-3.9 2.4 0 3.8 2 4.9 3.5 1.1-1.5 2.5-3.5 4.9-3.5 2.2 0 3.9 1.7 3.9 3.9Z"></path>
          </svg>
        </button>
        <img src="${product.image}" alt="${product.name}" loading="lazy">
        <button class="quick-add" type="button">Добавить в корзину</button>
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
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filtered = products.filter((product) => {
    const matchesFilter = activeFilter === "all" || product.gender === activeFilter;
    const searchSource = `${product.name} ${product.notes} ${product.label} ${product.type}`.toLowerCase();
    return matchesFilter && searchSource.includes(normalizedQuery);
  });

  productRail.innerHTML = filtered.map(productTemplate).join("");
  emptyState.hidden = filtered.length > 0;
  productRail.hidden = filtered.length === 0;
  bindProductActions();
}

function bindProductActions() {
  document.querySelectorAll(".heart-button").forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.toggle("is-active");
      const card = button.closest(".product-card");
      const product = products.find((item) => item.id === Number(card.dataset.id));
      showToast(button.classList.contains("is-active")
        ? `${product.name} — в избранном`
        : `${product.name} — удалён из избранного`);
    });
  });

  document.querySelectorAll(".quick-add").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".product-card");
      const product = products.find((item) => item.id === Number(card.dataset.id));
      cartTotal += 1;
      cartCount.textContent = cartTotal;
      showToast(`${product.name} добавлен в корзину`);
    });
  });
}

function setFilter(filter) {
  activeFilter = filter;
  filterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === filter);
  });
  renderProducts();
  productRail.scrollLeft = 0;
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => setFilter(button.dataset.filter));
});

collectionLinks.forEach((link) => {
  link.addEventListener("click", () => setFilter(link.dataset.collection));
});

document.querySelector(".rail-prev").addEventListener("click", () => {
  productRail.scrollBy({ left: -productRail.clientWidth * 0.72, behavior: "smooth" });
});

document.querySelector(".rail-next").addEventListener("click", () => {
  productRail.scrollBy({ left: productRail.clientWidth * 0.72, behavior: "smooth" });
});

searchToggle.addEventListener("click", () => {
  document.body.classList.add("search-open");
  setTimeout(() => globalSearchInput.focus(), 200);
});

searchClose.addEventListener("click", () => {
  document.body.classList.remove("search-open");
});

globalSearchInput.addEventListener("input", (event) => {
  searchQuery = event.target.value;
  setFilter("all");
});

document.querySelector(".global-search").addEventListener("submit", (event) => {
  event.preventDefault();
  document.body.classList.remove("search-open");
  document.querySelector("#catalog").scrollIntoView({ behavior: "smooth" });
});

menuButton.addEventListener("click", () => {
  const isOpen = document.body.classList.toggle("menu-open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
});

mobileLinks.forEach((link) => {
  link.addEventListener("click", () => {
    document.body.classList.remove("menu-open");
    menuButton.setAttribute("aria-expanded", "false");
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.body.classList.remove("search-open", "menu-open");
    menuButton.setAttribute("aria-expanded", "false");
  }
});

document.querySelector(".selection-button").addEventListener("click", () => {
  showToast("Подбор аромата откроется на следующем этапе");
});

renderProducts();
