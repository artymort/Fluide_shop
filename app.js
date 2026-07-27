const products = [
  {
    id: "100",
    title: "Blooming",
    original: "Dior Miss Dior Blooming Bouquet",
    gender: "female",
    category: "Люкс",
    format: "30 мл",
    price: 1990,
    image: "assets/products/blooming.jpg",
    notes: "Пион · дамасская роза · белый мускус",
    moods: ["floral", "fresh"],
  },
  {
    id: "044",
    title: "Bright Crystal",
    original: "Versace Bright Crystal",
    gender: "female",
    category: "Люкс",
    format: "30 мл",
    price: 1990,
    image: "assets/products/bright-crystal.jpg",
    notes: "Юдзу · пион · лотос · амбра",
    moods: ["floral", "fresh"],
  },
  {
    id: "049",
    title: "Dark Opium",
    original: "Yves Saint Laurent Black Opium",
    gender: "female",
    category: "Люкс",
    format: "30 мл",
    price: 1990,
    image: "assets/products/dark-opium.jpg",
    notes: "Кофе · жасмин · ваниль · пачули",
    moods: ["warm"],
  },
  {
    id: "016",
    title: "Aventus",
    original: "Creed Aventus",
    gender: "male",
    category: "Селектив",
    format: "30 мл",
    price: 3490,
    image: "assets/products/aventus.jpg",
    notes: "Бергамот · ананас · берёза · мускус",
    moods: ["fresh"],
  },
  {
    id: "025",
    title: "Baccarat",
    original: "Maison Francis Kurkdjian Baccarat Rouge 540",
    gender: "unisex",
    category: "Селектив",
    format: "30 мл",
    price: 3490,
    image: "assets/products/baccarat.jpg",
    notes: "Шафран · жасмин · амбра · кедр",
    moods: ["warm", "floral"],
  },
  {
    id: "026",
    title: "Ganymede",
    original: "Marc-Antoine Barrois Ganymede",
    gender: "unisex",
    category: "Селектив",
    format: "30 мл",
    price: 3490,
    image: "assets/products/ganymede.jpg",
    notes: "Мандарин · кожа · фиалка · бессмертник",
    moods: ["fresh", "warm"],
  },
];

const genderLabels = {
  female: "Для неё",
  male: "Для него",
  unisex: "Унисекс",
};

const state = {
  filter: "all",
  mood: null,
  query: "",
  cart: 0,
};

const header = document.querySelector("[data-header]");
const logo = document.querySelector("[data-logo]");
const productGrid = document.querySelector("[data-product-grid]");
const productCount = document.querySelector("[data-product-count]");
const searchInput = document.querySelector("[data-search]");
const cartCount = document.querySelector("[data-cart-count]");
const toast = document.querySelector("[data-toast]");
const nav = document.querySelector("[data-nav]");
const menuButton = document.querySelector("[data-menu-button]");

const formatPrice = (value) => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;

function updateHeader() {
  const shouldStick = window.scrollY > 90;
  header.classList.toggle("is-sticky", shouldStick);
  logo.src = shouldStick || document.body.classList.contains("menu-open")
    ? "assets/brand/logo-blue.svg"
    : "assets/brand/logo-white.svg";
}

function createProductCard(product) {
  return `
    <article class="product-card">
      <div class="product-card__visual">
        <img src="${product.image}" alt="Аромат FLUIDE ${product.title}" loading="lazy" />
        <span class="product-card__badge">${product.category}</span>
        <button class="favorite-button" type="button" aria-label="Добавить ${product.title} в избранное" data-favorite>♡</button>
        <button class="product-card__quick-add" type="button" data-add="${product.id}">
          Добавить в корзину
        </button>
      </div>
      <div class="product-card__info">
        <p class="product-card__category">${genderLabels[product.gender]} · ${product.format}</p>
        <div class="product-card__line">
          <h3>FLUIDE ${product.id} ${product.title}</h3>
          <strong>${formatPrice(product.price)}</strong>
        </div>
        <p class="product-card__inspired">Направление: ${product.original}</p>
        <p class="product-card__notes">${product.notes}</p>
      </div>
    </article>
  `;
}

function getVisibleProducts() {
  const normalizedQuery = state.query.trim().toLowerCase();

  return products.filter((product) => {
    const matchesGender = state.filter === "all" || product.gender === state.filter;
    const matchesMood = !state.mood || product.moods.includes(state.mood);
    const searchable = [product.title, product.original, product.notes, product.id, product.category]
      .join(" ")
      .toLowerCase();
    const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);

    return matchesGender && matchesMood && matchesQuery;
  });
}

function renderProducts() {
  const visibleProducts = getVisibleProducts();
  productCount.textContent = visibleProducts.length;

  productGrid.innerHTML = visibleProducts.length
    ? visibleProducts.map(createProductCard).join("")
    : '<p class="catalog__empty">По вашему запросу ничего не найдено. Попробуйте другую ноту или категорию.</p>';
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    state.mood = null;
    document.querySelectorAll("[data-filter]").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    renderProducts();
  });
});

document.querySelectorAll("[data-quick-filter]").forEach((link) => {
  link.addEventListener("click", () => {
    state.filter = "all";
    state.mood = link.dataset.quickFilter;
    document.querySelectorAll("[data-filter]").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.filter === "all");
    });
    renderProducts();
  });
});

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderProducts();
});

document.querySelector(".search-trigger").addEventListener("click", () => {
  document.querySelector("#catalog").scrollIntoView({ behavior: "smooth" });
  window.setTimeout(() => searchInput.focus(), 550);
});

productGrid.addEventListener("click", (event) => {
  const favorite = event.target.closest("[data-favorite]");
  const addButton = event.target.closest("[data-add]");

  if (favorite) {
    const isActive = favorite.classList.toggle("is-active");
    favorite.textContent = isActive ? "♥" : "♡";
    favorite.setAttribute("aria-pressed", String(isActive));
  }

  if (addButton) {
    const product = products.find((item) => item.id === addButton.dataset.add);
    state.cart += 1;
    cartCount.textContent = state.cart;
    showToast(`${product.title} добавлен в корзину`);
  }
});

menuButton.addEventListener("click", () => {
  const isOpen = document.body.classList.toggle("menu-open");
  nav.classList.toggle("is-open", isOpen);
  menuButton.setAttribute("aria-expanded", String(isOpen));
  updateHeader();
});

nav.addEventListener("click", (event) => {
  if (event.target.matches("a") && document.body.classList.contains("menu-open")) {
    document.body.classList.remove("menu-open");
    nav.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    updateHeader();
  }
});

document.querySelector("[data-selection-button]").addEventListener("click", () => {
  showToast("Интерактивный подбор подключим на следующем этапе");
});

window.addEventListener("scroll", updateHeader, { passive: true });

renderProducts();
updateHeader();
