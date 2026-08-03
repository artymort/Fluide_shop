const products = [
  {
    id: 19,
    name: "FLUIDE 019 Cherry",
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
    label: "Унисекс",
    type: "Селектив",
    price: 3490,
    notes: "Кокосовая пудра · ваниль · мускус · пало санто",
    image: "assets/product-line/fragrance-vanilla-powder.png",
    color: "#ece4d7"
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
        <span class="product-kind">${product.type}</span>
        <button class="wish-button" type="button" aria-label="Добавить ${product.name} в избранное">♡</button>
        <img src="${product.image}" alt="${product.name}" loading="lazy">
        <button class="quick-buy" type="button">Добавить в корзину</button>
      </div>
      <div class="fragrance-info">
        <h3>${product.name}</h3>
        <p>${product.notes}</p>
        <div class="fragrance-meta">
          <span>${product.label} · 30 мл</span>
          <span>${formatPrice(product.price)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderProducts() {
  const query = searchQuery.trim().toLowerCase();
  const matches = products.filter((product) => {
    const searchable = `${product.name} ${product.label} ${product.type} ${product.notes}`.toLowerCase();
    return searchable.includes(query);
  });
  const visibleProducts = query || showAll ? matches : matches.slice(0, 4);

  fragranceGrid.innerHTML = visibleProducts.map(productTemplate).join("");
  fragranceGrid.classList.toggle("is-empty", visibleProducts.length === 0);

  if (!visibleProducts.length) {
    fragranceGrid.innerHTML = '<p class="no-results">Ничего не найдено. Попробуйте другую ноту или название.</p>';
  }

  showAllButton.hidden = Boolean(query);
  showAllButton.textContent = showAll ? "Скрыть" : "Смотреть все";
  bindProductActions();
}

function productFor(button) {
  const card = button.closest(".fragrance-card");
  return products.find((product) => product.id === Number(card.dataset.id));
}

function bindProductActions() {
  document.querySelectorAll(".wish-button").forEach((button) => {
    button.addEventListener("click", () => {
      const active = button.classList.toggle("active");
      const product = productFor(button);
      button.textContent = active ? "♥" : "♡";
      button.setAttribute("aria-label", active
        ? `Удалить ${product.name} из избранного`
        : `Добавить ${product.name} в избранное`);
      showToast(active
        ? `${product.name} добавлен в избранное`
        : `${product.name} удалён из избранного`);
    });
  });

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
