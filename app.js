const products = [
  {
    id: "100",
    title: "Blooming",
    gender: "female",
    category: "Люкс",
    price: 1990,
    image: "assets/products/blooming.jpg",
    notes: "Пион · дамасская роза · белый мускус",
  },
  {
    id: "044",
    title: "Bright Crystal",
    gender: "female",
    category: "Люкс",
    price: 1990,
    image: "assets/products/bright-crystal.jpg",
    notes: "Юдзу · пион · лотос · амбра",
  },
  {
    id: "049",
    title: "Dark Opium",
    gender: "female",
    category: "Люкс",
    price: 1990,
    image: "assets/products/dark-opium.jpg",
    notes: "Кофе · жасмин · ваниль · пачули",
  },
  {
    id: "016",
    title: "Aventus",
    gender: "male",
    category: "Селектив",
    price: 3490,
    image: "assets/products/aventus.jpg",
    notes: "Бергамот · ананас · берёза · мускус",
  },
  {
    id: "025",
    title: "Baccarat",
    gender: "unisex",
    category: "Селектив",
    price: 3490,
    image: "assets/products/baccarat.jpg",
    notes: "Шафран · жасмин · амбра · кедр",
  },
  {
    id: "026",
    title: "Ganymede",
    gender: "unisex",
    category: "Селектив",
    price: 3490,
    image: "assets/products/ganymede.jpg",
    notes: "Мандарин · кожа · фиалка · бессмертник",
  },
];

const genderNames = {
  female: "Для неё",
  male: "Для него",
  unisex: "Унисекс",
};

const state = {
  filter: "all",
  query: "",
  cart: 0,
};

const header = document.querySelector("[data-header]");
const grid = document.querySelector("[data-product-grid]");
const searchInput = document.querySelector("[data-search]");
const cartCount = document.querySelector("[data-cart-count]");
const toast = document.querySelector("[data-toast]");
const nav = document.querySelector("[data-nav]");
const menuButton = document.querySelector("[data-menu-button]");

const formatPrice = (value) => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;

function productCard(product) {
  return `
    <article class="product-card">
      <div class="product-card__visual">
        <img src="${product.image}" alt="FLUIDE ${product.id} ${product.title}" loading="lazy" />
        <span class="product-card__badge">${product.category}</span>
        <button class="favorite" type="button" aria-label="Добавить ${product.title} в избранное" data-favorite>♡</button>
        <button class="quick-add" type="button" data-add="${product.id}">Добавить в корзину</button>
      </div>
      <div class="product-card__info">
        <p class="product-card__meta">${genderNames[product.gender]} · 30 мл</p>
        <div class="product-card__title">
          <h3>FLUIDE ${product.id} ${product.title}</h3>
          <strong>${formatPrice(product.price)}</strong>
        </div>
        <p class="product-card__notes">${product.notes}</p>
      </div>
    </article>
  `;
}

function visibleProducts() {
  const query = state.query.trim().toLowerCase();

  return products.filter((product) => {
    const matchesFilter = state.filter === "all" || product.gender === state.filter;
    const matchesSearch =
      !query ||
      [product.id, product.title, product.notes, product.category]
        .join(" ")
        .toLowerCase()
        .includes(query);

    return matchesFilter && matchesSearch;
  });
}

function renderProducts() {
  const visible = visibleProducts();
  grid.innerHTML = visible.length
    ? visible.map(productCard).join("")
    : '<p class="catalog-empty">Ничего не найдено. Попробуйте другую ноту или категорию.</p>';
}

function setFilter(filter) {
  state.filter = filter;
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === filter);
  });
  renderProducts();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => setFilter(button.dataset.filter));
});

document.querySelectorAll("[data-direction]").forEach((link) => {
  link.addEventListener("click", () => setFilter(link.dataset.direction));
});

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderProducts();
});

document.querySelector(".search-button").addEventListener("click", () => {
  document.querySelector("#catalog").scrollIntoView({ behavior: "smooth" });
  window.setTimeout(() => searchInput.focus(), 450);
});

grid.addEventListener("click", (event) => {
  const favorite = event.target.closest("[data-favorite]");
  const add = event.target.closest("[data-add]");

  if (favorite) {
    const active = favorite.classList.toggle("is-active");
    favorite.textContent = active ? "♥" : "♡";
    favorite.setAttribute("aria-pressed", String(active));
  }

  if (add) {
    const product = products.find((item) => item.id === add.dataset.add);
    state.cart += 1;
    cartCount.textContent = state.cart;
    showToast(`${product.title} добавлен в корзину`);
  }
});

menuButton.addEventListener("click", () => {
  const open = document.body.classList.toggle("menu-open");
  nav.classList.toggle("is-open", open);
  menuButton.setAttribute("aria-expanded", String(open));
});

nav.addEventListener("click", (event) => {
  if (event.target.matches("a")) {
    document.body.classList.remove("menu-open");
    nav.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
  }
});

document.querySelector("[data-selection-button]").addEventListener("click", () => {
  showToast("Подбор аромата подключим отдельным шагом");
});

window.addEventListener(
  "scroll",
  () => header.classList.toggle("is-scrolled", window.scrollY > 10),
  { passive: true },
);

renderProducts();
