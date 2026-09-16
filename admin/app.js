const API_ROOT = "/api/admin";

const state = {
  admin: null,
  section: "dashboard",
  editingProduct: null,
  media: [],
  importFile: null,
};

const elements = Object.fromEntries([
  "login-view", "login-form", "login-message", "cms-view", "admin-name", "logout-button",
  "menu-button", "dashboard-title", "dashboard-new-product", "dashboard-stats", "dashboard-categories",
  "dashboard-health", "dashboard-recent-products", "dashboard-action-import",
  "catalog-search", "catalog-status", "catalog-type", "catalog-sort", "catalog-rows",
  "customer-search", "customer-rows", "new-product-button", "product-dialog", "product-form",
  "customer-dialog", "customer-dialog-title", "customer-detail",
  "product-dialog-title", "product-message", "add-variant-button", "variant-rows",
  "primary-media-row", "gallery-media-rows",
  "product-main-image-upload", "product-image-upload", "cancel-product", "catalog-import", "import-dialog", "import-preview",
  "apply-import", "cancel-import", "import-result",
  "staff-rows", "new-staff-button", "staff-dialog", "staff-form", "staff-password",
  "staff-message", "cancel-staff",
  "change-password-button", "password-dialog", "password-form", "password-message", "cancel-password",
].map((id) => [id, document.getElementById(id)]));

const statusLabels = { published: "Опубликован", draft: "Черновик", archived: "Архив" };
const providerLabels = { yandex: "Яндекс ID", vk: "VK ID", phone: "Телефон" };
const roleLabels = { owner: "Владелец", admin: "Администратор", editor: "Редактор", orders: "Заказы", analyst: "Аналитика" };
const dateFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const priceFormatter = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
const dayFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" });

function showLogin(message = "") {
  elements["cms-view"].hidden = true;
  elements["login-view"].hidden = false;
  elements["login-message"].textContent = message;
}

function showCms(admin) {
  state.admin = admin;
  elements["login-view"].hidden = true;
  elements["cms-view"].hidden = false;
  elements["admin-name"].textContent = admin.displayName || admin.email;
  const canManageStaff = ["owner", "admin"].includes(admin.role);
  document.querySelector('[data-section="staff"]').hidden = !canManageStaff;
}

async function api(path, options = {}) {
  const init = { credentials: "same-origin", ...options };
  if (init.body && !(init.body instanceof FormData)) {
    init.headers = { "Content-Type": "application/json", ...(init.headers || {}) };
    init.body = JSON.stringify(init.body);
  }
  const response = await fetch(`${API_ROOT}${path}`, init);
  if (response.status === 401 && path !== "/login") {
    showLogin("Сессия завершена. Войдите снова.");
    throw new Error("admin_not_authenticated");
  }
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || `HTTP ${response.status}`);
    error.data = data;
    error.status = response.status;
    throw error;
  }
  return data;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

function formatDay(value) {
  if (!value) return "Не указана";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Не указана" : dayFormatter.format(date);
}

function customerName(customer) {
  return customer.display_name
    || [customer.first_name, customer.last_name].filter(Boolean).join(" ")
    || "Без имени";
}

function makeCell(text, className = "") {
  const cell = document.createElement("td");
  cell.textContent = text ?? "—";
  if (className) cell.className = className;
  return cell;
}

function badge(status) {
  const node = document.createElement("span");
  node.className = `badge ${status}`;
  node.textContent = statusLabels[status] || status;
  return node;
}

function debounce(callback, delay = 280) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => callback(...args), delay);
  };
}

async function loadDashboard() {
  const data = await api("/dashboard");

  const cards = [
    { label: "Товары", value: data.published_products, meta: `${data.draft_products || 0} в черновиках`, tone: "ink" },
    { label: "Покупатели", value: data.customers, meta: "активных аккаунтов", tone: "sand" },
    { label: "Новые покупатели", value: data.new_customers_7d, meta: "за последние 7 дней", tone: "rose" },
  ];
  elements["dashboard-stats"].replaceChildren(...cards.map((item) => {
    const card = document.createElement("div");
    card.className = `dashboard-stat ${item.tone}`;
    const top = document.createElement("div");
    top.className = "dashboard-stat-top";
    const caption = document.createElement("span");
    const number = document.createElement("strong");
    const meta = document.createElement("small");
    caption.textContent = item.label;
    number.textContent = item.value ?? 0;
    meta.textContent = item.meta;
    top.append(caption);
    card.append(top, number, meta);
    return card;
  }));

  const categories = Array.isArray(data.categories) ? data.categories : [];
  const largestCategory = Math.max(1, ...categories.map((category) => Number(category.count) || 0));
  elements["dashboard-categories"].replaceChildren(...categories.slice(0, 7).map((category) => {
    const row = document.createElement("button");
    row.className = "category-row";
    row.type = "button";
    row.addEventListener("click", async () => {
      await switchSection("catalog");
      elements["catalog-type"].value = category.value;
      await loadCatalog();
    });
    const copy = document.createElement("span");
    const label = document.createElement("strong");
    const count = document.createElement("b");
    const track = document.createElement("span");
    const fill = document.createElement("i");
    label.textContent = category.value;
    count.textContent = category.count;
    fill.style.width = `${Math.max(4, (Number(category.count) || 0) / largestCategory * 100)}%`;
    copy.append(label, count);
    track.className = "category-track";
    track.append(fill);
    row.append(copy, track);
    return row;
  }));

  const totalProducts = Number(data.published_products || 0) + Number(data.draft_products || 0);
  const publishedShare = totalProducts ? Math.round(Number(data.published_products || 0) / totalProducts * 100) : 0;
  const health = document.createElement("div");
  health.className = "health-overview";
  const ring = document.createElement("div");
  ring.className = "health-ring";
  ring.style.setProperty("--health", `${publishedShare * 3.6}deg`);
  ring.innerHTML = `<strong>${publishedShare}%</strong><span>опубликовано</span>`;
  const healthList = document.createElement("div");
  healthList.className = "health-list";
  [
    ["Опубликовано", data.published_products || 0, "published"],
    ["Черновики", data.draft_products || 0, "draft"],
    ["Без фотографий", data.products_without_media || 0, "media"],
  ].forEach(([labelText, value, className]) => {
    const row = document.createElement("div");
    row.innerHTML = `<span><i class="${className}"></i>${labelText}</span><strong>${value}</strong>`;
    healthList.append(row);
  });
  health.append(ring, healthList);
  elements["dashboard-health"].replaceChildren(health);

  const recentProducts = Array.isArray(data.recent_products) ? data.recent_products : [];
  elements["dashboard-recent-products"].replaceChildren(...recentProducts.map((product) => {
    const row = document.createElement("button");
    row.className = "dashboard-product";
    row.type = "button";
    row.addEventListener("click", () => openProduct(product.id).catch(console.error));
    const image = document.createElement("img");
    image.src = product.imageUrl || "../assets/brand/logo-blue.svg";
    image.alt = "";
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    const detail = document.createElement("small");
    name.textContent = product.name;
    detail.textContent = product.typeLabel || product.productType || "Товар";
    copy.append(name, detail);
    row.append(image, copy);
    return row;
  }));
}

async function loadCatalog() {
  const params = new URLSearchParams({
    q: elements["catalog-search"].value.trim(),
    status: elements["catalog-status"].value,
    type: elements["catalog-type"].value,
    sort: elements["catalog-sort"].value,
  });
  const { products, productTypes = [], totalProducts = products.length } = await api(`/products?${params}`);
  const selectedType = elements["catalog-type"].value;
  const normalizedTypes = productTypes.map((type) => typeof type === "string"
    ? { value: type, count: null }
    : { value: type.value, count: Number(type.count) })
    .filter((type) => type.value)
    .sort((left, right) => (right.count || 0) - (left.count || 0) || left.value.localeCompare(right.value, "ru"));
  const typeOptions = normalizedTypes.map(({ value, count }) => new Option(
    Number.isFinite(count) ? `${value} — ${count}` : value,
    value,
  ));
  elements["catalog-type"].replaceChildren(
    new Option(`Все товары — ${Number(totalProducts) || 0}`, ""),
    ...typeOptions,
  );
  elements["catalog-type"].value = normalizedTypes.some((type) => type.value === selectedType) ? selectedType : "";
  if (!products.length) {
    const row = document.createElement("tr");
    const cell = makeCell("Товары не найдены", "empty-cell");
    cell.colSpan = 6;
    row.append(cell);
    elements["catalog-rows"].replaceChildren(row);
    return;
  }
  elements["catalog-rows"].replaceChildren(...products.map((product) => {
    const row = document.createElement("tr");
    row.addEventListener("click", () => openProduct(product.id));
    const productCell = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "product-cell";
    const image = document.createElement("img");
    image.src = product.imageUrl || "../assets/brand/logo-blue.svg";
    image.alt = "";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    const subtitle = document.createElement("span");
    title.textContent = product.name;
    subtitle.textContent = product.typeLabel || product.productType || "Товар";
    copy.append(title, subtitle);
    wrap.append(image, copy);
    productCell.append(wrap);
    row.append(
      productCell,
      makeCell(product.sku),
      makeCell(product.kind === "fragrance" ? "Аромат" : "Товар"),
      makeCell(product.variantCount),
      makeCell(product.minPrice === null ? "—" : `от ${priceFormatter.format(product.minPrice)}`),
    );
    const statusCell = document.createElement("td");
    statusCell.append(badge(product.status));
    row.append(statusCell);
    return row;
  }));
}

async function loadCustomers() {
  try {
    const params = new URLSearchParams({ q: elements["customer-search"].value.trim() });
    const { customers } = await api(`/customers?${params}`);
    if (!customers.length) {
      const row = document.createElement("tr");
      const cell = makeCell("Покупатели не найдены", "empty-cell");
      cell.colSpan = 5;
      row.append(cell);
      elements["customer-rows"].replaceChildren(row);
      return;
    }
    elements["customer-rows"].replaceChildren(...customers.map((customer) => {
      const row = document.createElement("tr");
      row.addEventListener("click", () => openCustomer(customer.id));
      row.append(
        makeCell(customerName(customer)),
        makeCell([customer.phone_e164, customer.email].filter(Boolean).join(" · ") || "—"),
        makeCell((customer.providers || []).map((item) => providerLabels[item] || item).join(", ") || "—"),
        makeCell(formatDate(customer.created_at)),
        makeCell(formatDate(customer.last_login_at)),
      );
      return row;
    }));
  } catch (error) {
    if (error.status === 403) {
      const row = document.createElement("tr");
      const cell = makeCell("У вашей роли нет доступа к покупателям", "empty-cell");
      cell.colSpan = 5;
      row.append(cell);
      elements["customer-rows"].replaceChildren(row);
      return;
    }
    throw error;
  }
}

function customerDetailItem(label, value, options = {}) {
  const item = document.createElement("div");
  item.className = "customer-detail-item";
  const caption = document.createElement("span");
  const content = document.createElement("strong");
  caption.textContent = label;
  content.textContent = value || "Не указано";
  if (options.wide) item.classList.add("is-wide");
  item.append(caption, content);
  return item;
}

function renderCustomerDetail(customer, identities) {
  const root = elements["customer-detail"];
  const heading = document.createElement("section");
  heading.className = "customer-profile-head";
  const avatar = document.createElement(customer.avatar_url ? "img" : "span");
  avatar.className = "customer-avatar";
  if (customer.avatar_url) {
    avatar.src = customer.avatar_url;
    avatar.alt = "";
  } else {
    avatar.textContent = customerName(customer).split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "—";
  }
  const identity = document.createElement("div");
  const title = document.createElement("h3");
  const meta = document.createElement("p");
  title.textContent = customerName(customer);
  meta.textContent = customer.status === "blocked" ? "Аккаунт заблокирован" : "Активный покупатель";
  identity.append(title, meta);
  heading.append(avatar, identity);

  const detailsTitle = document.createElement("h3");
  detailsTitle.className = "customer-section-title";
  detailsTitle.textContent = "Данные покупателя";
  const details = document.createElement("div");
  details.className = "customer-detail-grid";
  details.append(
    customerDetailItem("Имя", customer.first_name || "Не указано"),
    customerDetailItem("Фамилия", customer.last_name || "Не указана"),
    customerDetailItem("Email", customer.email || "Не указан", { wide: true }),
    customerDetailItem("Контактный телефон", customer.phone_e164 || "Не указан", { wide: true }),
    customerDetailItem("Дата рождения", formatDay(customer.birth_date)),
    customerDetailItem("Пол", ({ male: "Мужской", female: "Женский" })[customer.gender] || "Не указан"),
    customerDetailItem("Регистрация", formatDate(customer.created_at)),
    customerDetailItem("Обновление профиля", formatDate(customer.updated_at)),
  );

  const providersTitle = document.createElement("h3");
  providersTitle.className = "customer-section-title";
  providersTitle.textContent = "Способы входа";
  const providers = document.createElement("div");
  providers.className = "customer-providers";
  identities.forEach((provider) => {
    const card = document.createElement("article");
    card.className = "customer-provider-card";
    const top = document.createElement("div");
    const name = document.createElement("strong");
    const mark = document.createElement("span");
    name.textContent = providerLabels[provider.provider] || provider.provider;
    mark.textContent = provider.provider === "phone" ? "Подтверждён" : "Подключён";
    top.append(name, mark);
    card.append(
      top,
      customerDetailItem("ID у провайдера", provider.provider_subject, { wide: true }),
      customerDetailItem("Первый вход", formatDate(provider.created_at)),
      customerDetailItem("Последний вход", formatDate(provider.last_login_at)),
    );
    providers.append(card);
  });
  if (!identities.length) {
    const empty = document.createElement("p");
    empty.className = "subtle";
    empty.textContent = "Способы входа не найдены";
    providers.append(empty);
  }
  root.replaceChildren(heading, detailsTitle, details, providersTitle, providers);
}

async function openCustomer(id) {
  elements["customer-dialog-title"].textContent = "Покупатель";
  elements["customer-detail"].textContent = "Загружаем данные…";
  elements["customer-dialog"].showModal();
  try {
    const { customer, identities } = await api(`/customers/${id}`);
    elements["customer-dialog-title"].textContent = customerName(customer);
    renderCustomerDetail(customer, identities || []);
  } catch (error) {
    elements["customer-detail"].textContent = error.status === 404
      ? "Покупатель не найден"
      : "Не удалось загрузить данные покупателя";
  }
}

async function updateStaff(id, role, status) {
  await api(`/staff/${id}`, { method: "PATCH", body: { role, status } });
  await loadStaff();
}

async function loadStaff() {
  const { staff } = await api("/staff");
  elements["staff-rows"].replaceChildren(...staff.map((person) => {
    const row = document.createElement("tr");
    const identity = document.createElement("td");
    const name = document.createElement("strong");
    const email = document.createElement("div");
    name.textContent = person.display_name;
    email.className = "subtle";
    email.textContent = person.email;
    identity.append(name, email);

    const roleCell = document.createElement("td");
    const roleSelect = document.createElement("select");
    roleSelect.style.minWidth = "150px";
    Object.entries(roleLabels).forEach(([value, label]) => {
      if (value === "owner" && state.admin.role !== "owner" && person.role !== "owner") return;
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = value === person.role;
      roleSelect.append(option);
    });
    const protectedOwner = person.role === "owner" && state.admin.role !== "owner";
    roleSelect.disabled = protectedOwner;
    roleSelect.addEventListener("change", () => updateStaff(person.id, roleSelect.value, person.status).catch(() => loadStaff()));
    roleCell.append(roleSelect);

    const statusCell = document.createElement("td");
    const statusButton = document.createElement("button");
    statusButton.className = "secondary";
    statusButton.type = "button";
    statusButton.textContent = person.status === "active" ? "Активен" : "Заблокирован";
    statusButton.disabled = person.id === state.admin.id || protectedOwner;
    statusButton.addEventListener("click", () => updateStaff(
      person.id,
      person.role,
      person.status === "active" ? "blocked" : "active",
    ).catch(() => loadStaff()));
    statusCell.append(statusButton);
    row.append(identity, roleCell, statusCell, makeCell(formatDate(person.last_login_at)), makeCell(formatDate(person.created_at)));
    return row;
  }));
}

async function switchSection(section) {
  if (section === "staff" && !["owner", "admin"].includes(state.admin?.role)) section = "dashboard";
  state.section = section;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.section === section));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.dataset.view === section));
  elements["cms-view"].classList.remove("menu-open");
  if (location.hash !== `#${section}`) history.replaceState(null, "", `#${section}`);
  if (section === "dashboard") await loadDashboard();
  if (section === "catalog") await loadCatalog();
  if (section === "customers") await loadCustomers();
  if (section === "staff") await loadStaff();
}

function addVariant(variant = {}) {
  const row = document.createElement("div");
  row.className = "variant-row";
  if (variant.id) row.dataset.id = variant.id;
  const fields = [
    ["SKU варианта", "sku", "text", variant.sku || ""],
    ["Объём, мл", "volumeMl", "number", variant.volumeMl ?? ""],
    ["Цена, ₽", "price", "number", variant.price ?? ""],
  ];
  fields.forEach(([labelText, name, type, value]) => {
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.name = name;
    input.type = type;
    input.value = value;
    input.required = name !== "volumeMl";
    if (type === "number") {
      input.min = "0";
      input.step = name === "price" ? "0.01" : "1";
    } else {
      input.pattern = "[A-Za-z0-9._-]{2,100}";
    }
    label.append(input);
    row.append(label);
  });
  const remove = document.createElement("button");
  remove.className = "remove-row";
  remove.type = "button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "Удалить вариант");
  remove.addEventListener("click", () => {
    if (elements["variant-rows"].children.length > 1) row.remove();
  });
  row.append(remove);
  elements["variant-rows"].append(row);
}

function renderMedia() {
  const buildRow = (media, index, primary = false) => {
    const row = document.createElement("div");
    row.className = "media-row";
    const image = document.createElement("img");
    image.className = "media-preview";
    image.src = media.url;
    image.alt = media.altText || "";
    const content = document.createElement("div");
    content.className = "media-content";
    const label = document.createElement("label");
    label.textContent = "Alt-текст";
    const input = document.createElement("input");
    input.value = media.altText || "";
    input.addEventListener("input", () => { state.media[index].altText = input.value; });
    label.append(input);

    const actions = document.createElement("div");
    actions.className = "media-actions";
    if (primary) {
      const replace = document.createElement("label");
      replace.className = "media-action";
      replace.htmlFor = "product-main-image-upload";
      replace.textContent = "Заменить фото";
      actions.append(replace);
    } else {
      const replace = document.createElement("label");
      replace.className = "media-action";
      replace.textContent = "Заменить";
      const replaceInput = document.createElement("input");
      replaceInput.type = "file";
      replaceInput.accept = "image/jpeg,image/png,image/webp,image/avif";
      replaceInput.hidden = true;
      replaceInput.addEventListener("change", async () => {
        const [file] = replaceInput.files;
        if (!file) return;
        elements["product-message"].textContent = "Заменяем изображение…";
        try {
          await uploadImage(file, index);
          elements["product-message"].textContent = "";
        } catch {
          elements["product-message"].textContent = "Не удалось заменить изображение. Проверьте формат и размер.";
        }
      });
      replace.append(replaceInput);
      actions.append(replace);

      const makePrimary = document.createElement("button");
      makePrimary.type = "button";
      makePrimary.className = "media-action";
      makePrimary.textContent = "Назначить основным";
      makePrimary.addEventListener("click", () => {
        state.media.unshift(state.media.splice(index, 1)[0]);
        renderMedia();
      });
      actions.append(makePrimary);

      const moveUp = document.createElement("button");
      moveUp.type = "button";
      moveUp.className = "media-action";
      moveUp.textContent = "Выше";
      moveUp.disabled = index === 1;
      moveUp.addEventListener("click", () => {
        [state.media[index - 1], state.media[index]] = [state.media[index], state.media[index - 1]];
        renderMedia();
      });
      const moveDown = document.createElement("button");
      moveDown.type = "button";
      moveDown.className = "media-action";
      moveDown.textContent = "Ниже";
      moveDown.disabled = index === state.media.length - 1;
      moveDown.addEventListener("click", () => {
        [state.media[index + 1], state.media[index]] = [state.media[index], state.media[index + 1]];
        renderMedia();
      });
      actions.append(moveUp, moveDown);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "media-action is-danger";
    remove.textContent = "Удалить";
    remove.addEventListener("click", () => {
      state.media.splice(index, 1);
      renderMedia();
    });
    actions.append(remove);
    content.append(label, actions);
    row.append(image, content);
    return row;
  };

  if (state.media[0]) {
    elements["primary-media-row"].replaceChildren(buildRow(state.media[0], 0, true));
  } else {
    const empty = document.createElement("div");
    empty.className = "media-empty";
    const copy = document.createElement("span");
    copy.textContent = "Основное фото пока не загружено";
    const upload = document.createElement("label");
    upload.className = "media-action";
    upload.htmlFor = "product-main-image-upload";
    upload.textContent = "Загрузить фото";
    empty.append(copy, upload);
    elements["primary-media-row"].replaceChildren(empty);
  }
  if (state.media.length > 1) {
    elements["gallery-media-rows"].replaceChildren(...state.media.slice(1).map((media, offset) => buildRow(media, offset + 1)));
  } else {
    const empty = document.createElement("p");
    empty.className = "media-empty";
    empty.textContent = "Дополнительных фотографий пока нет";
    elements["gallery-media-rows"].replaceChildren(empty);
  }
}

function resetProductForm() {
  state.editingProduct = null;
  state.media = [];
  elements["product-form"].reset();
  elements["product-form"].elements.id.value = "";
  elements["product-form"].elements.status.value = "draft";
  elements["product-dialog-title"].textContent = "Новый товар";
  elements["product-message"].textContent = "";
  elements["variant-rows"].replaceChildren();
  addVariant();
  renderMedia();
}

async function openProduct(id = null) {
  resetProductForm();
  if (id) {
    const { product, variants, media } = await api(`/products/${id}`);
    state.editingProduct = product;
    state.media = media;
    const form = elements["product-form"].elements;
    form.id.value = product.id;
    form.name.value = product.name || "";
    form.sku.value = product.sku || "";
    form.status.value = product.status || "draft";
    form.productType.value = product.productType || "";
    form.typeLabel.value = product.typeLabel || "";
    form.shortDescription.value = product.shortDescription || "";
    form.description.value = product.description || "";
    form.seoTitle.value = product.seoTitle || "";
    form.seoDescription.value = product.seoDescription || "";
    form.noindex.checked = Boolean(product.noindex);
    elements["product-dialog-title"].textContent = product.name;
    elements["variant-rows"].replaceChildren();
    variants.forEach(addVariant);
    if (!variants.length) addVariant();
    renderMedia();
  }
  elements["product-dialog"].showModal();
}

function serializeProductForm() {
  const form = elements["product-form"].elements;
  const variants = [...elements["variant-rows"].querySelectorAll(".variant-row")].map((row) => ({
    id: row.dataset.id || undefined,
    sku: row.querySelector('[name="sku"]').value.trim(),
    volumeMl: row.querySelector('[name="volumeMl"]').value === "" ? null : Number(row.querySelector('[name="volumeMl"]').value),
    price: Number(row.querySelector('[name="price"]').value),
    active: true,
  }));
  return {
    name: form.name.value.trim(),
    sku: form.sku.value.trim(),
    status: form.status.value,
    kind: state.editingProduct?.kind || (form.productType.value === "fragrance" ? "fragrance" : "product"),
    productType: form.productType.value.trim(),
    typeLabel: form.typeLabel.value.trim(),
    leadTimeDays: 1,
    shortDescription: form.shortDescription.value.trim(),
    description: form.description.value.trim(),
    seoTitle: form.seoTitle.value.trim(),
    seoDescription: form.seoDescription.value.trim(),
    noindex: form.noindex.checked,
    variants,
    media: state.media,
  };
}

async function uploadImage(file, replaceIndex = null) {
  const form = new FormData();
  form.append("file", file);
  const uploaded = await api("/media", { method: "POST", body: form });
  const media = {
    url: uploaded.url,
    altText: replaceIndex === null
      ? elements["product-form"].elements.name.value.trim()
      : state.media[replaceIndex]?.altText || elements["product-form"].elements.name.value.trim(),
  };
  if (replaceIndex === null) state.media.push(media);
  else state.media.splice(replaceIndex, 1, media);
  renderMedia();
}

function renderImportPreview(data) {
  const container = elements["import-preview"];
  const summary = document.createElement("p");
  summary.textContent = data.valid
    ? `Проверено строк: ${data.rowCount}. Ошибок нет.`
    : `Найдены ошибки: ${data.errors?.length || 0}. Исправьте файл и загрузите снова.`;
  const fragment = document.createDocumentFragment();
  fragment.append(summary);
  if (data.errors?.length) {
    const list = document.createElement("ul");
    data.errors.forEach((error) => {
      const item = document.createElement("li");
      item.textContent = typeof error === "string" ? error : `Строка ${error.row || "?"}: ${error.message || JSON.stringify(error)}`;
      list.append(item);
    });
    fragment.append(list);
  } else if (data.preview?.length) {
    const list = document.createElement("ul");
    data.preview.slice(0, 10).forEach((row) => {
      const item = document.createElement("li");
      item.style.color = "inherit";
      item.textContent = `${row.productSku} / ${row.variantSku} — ${row.name}, ${row.price} ₽`;
      list.append(item);
    });
    fragment.append(list);
  }
  container.replaceChildren(fragment);
  elements["apply-import"].disabled = !data.valid;
}

async function sendImport(apply = false) {
  if (!state.importFile) return;
  const body = new FormData();
  body.append("file", state.importFile);
  const response = await fetch(`${API_ROOT}/catalog.xlsx${apply ? "?apply=1" : ""}`, {
    method: "POST",
    credentials: "same-origin",
    body,
  });
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (response.status === 401) {
    showLogin("Сессия завершена. Войдите снова.");
    return;
  }
  if (apply && response.ok) {
    elements["import-dialog"].close();
    elements["import-result"].hidden = false;
    elements["import-result"].textContent = `Импорт завершён: создано товаров ${data.counts.productsCreated}, обновлено ${data.counts.productsUpdated}, создано вариантов ${data.counts.variantsCreated}, обновлено ${data.counts.variantsUpdated}.`;
    state.importFile = null;
    elements["catalog-import"].value = "";
    await Promise.all([loadCatalog(), loadDashboard()]);
    return;
  }
  renderImportPreview(data);
  elements["import-dialog"].showModal();
}

elements["login-form"].addEventListener("submit", async (event) => {
  event.preventDefault();
  elements["login-message"].textContent = "Входим…";
  const form = new FormData(event.currentTarget);
  try {
    const { admin } = await api("/login", {
      method: "POST",
      body: { email: form.get("email"), password: form.get("password") },
    });
    showCms(admin);
    event.currentTarget.reset();
    await switchSection(location.hash.slice(1) || "dashboard");
  } catch (error) {
    elements["login-message"].textContent = error.message === "too_many_requests"
      ? "Слишком много попыток. Попробуйте через 15 минут."
      : "Неверный email или пароль.";
  }
});

elements["logout-button"].addEventListener("click", async () => {
  await api("/logout", { method: "POST" }).catch(() => {});
  state.admin = null;
  showLogin();
});

document.querySelectorAll(".nav-item:not(:disabled)").forEach((button) => {
  button.addEventListener("click", () => switchSection(button.dataset.section).catch(console.error));
});
document.querySelectorAll("[data-dashboard-nav]").forEach((button) => {
  button.addEventListener("click", () => switchSection(button.dataset.dashboardNav).catch(console.error));
});
elements["menu-button"].addEventListener("click", () => elements["cms-view"].classList.toggle("menu-open"));
elements["catalog-search"].addEventListener("input", debounce(() => loadCatalog().catch(console.error)));
elements["catalog-status"].addEventListener("change", () => loadCatalog().catch(console.error));
elements["catalog-type"].addEventListener("change", () => loadCatalog().catch(console.error));
elements["catalog-sort"].addEventListener("change", () => loadCatalog().catch(console.error));
elements["customer-search"].addEventListener("input", debounce(() => loadCustomers().catch(console.error)));
elements["dashboard-new-product"].addEventListener("click", () => openProduct().catch(console.error));
elements["dashboard-action-import"].addEventListener("click", () => elements["catalog-import"].click());
elements["new-product-button"].addEventListener("click", () => openProduct().catch(console.error));
elements["add-variant-button"].addEventListener("click", () => addVariant());
elements["cancel-product"].addEventListener("click", () => elements["product-dialog"].close());
elements["product-main-image-upload"].addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  elements["product-message"].textContent = state.media.length ? "Заменяем основное фото…" : "Загружаем основное фото…";
  try {
    await uploadImage(file, state.media.length ? 0 : null);
    elements["product-message"].textContent = "";
  } catch {
    elements["product-message"].textContent = "Не удалось загрузить изображение. Проверьте формат и размер.";
  } finally {
    event.target.value = "";
  }
});
elements["product-image-upload"].addEventListener("change", async (event) => {
  const files = [...event.target.files];
  if (!files.length) return;
  elements["product-message"].textContent = files.length === 1 ? "Загружаем изображение…" : `Загружаем изображения: ${files.length}…`;
  try {
    for (const file of files) await uploadImage(file);
    elements["product-message"].textContent = "";
  } catch {
    elements["product-message"].textContent = "Не удалось загрузить изображение. Проверьте формат и размер.";
  } finally {
    event.target.value = "";
  }
});

elements["product-form"].addEventListener("submit", async (event) => {
  event.preventDefault();
  elements["product-message"].textContent = "Сохраняем…";
  const id = event.currentTarget.elements.id.value;
  try {
    await api(id ? `/products/${id}` : "/products", {
      method: id ? "PUT" : "POST",
      body: serializeProductForm(),
    });
    elements["product-dialog"].close();
    await Promise.all([loadCatalog(), loadDashboard()]);
  } catch (error) {
    elements["product-message"].textContent = error.status === 409
      ? "SKU уже используется другим товаром или вариантом."
      : "Не удалось сохранить. Проверьте обязательные поля и цены.";
  }
});

elements["catalog-import"].addEventListener("change", async (event) => {
  [state.importFile] = event.target.files;
  if (!state.importFile) return;
  elements["import-preview"].textContent = "Проверяем файл…";
  elements["apply-import"].disabled = true;
  elements["import-dialog"].showModal();
  await sendImport(false);
});
elements["apply-import"].addEventListener("click", () => sendImport(true).catch(console.error));
elements["cancel-import"].addEventListener("click", () => elements["import-dialog"].close());
elements["new-staff-button"].addEventListener("click", () => {
  elements["staff-form"].reset();
  elements["staff-form"].querySelector('button[type="submit"]').disabled = false;
  elements["staff-message"].textContent = "";
  elements["staff-password"].hidden = true;
  elements["staff-password"].textContent = "";
  elements["staff-dialog"].showModal();
});
elements["cancel-staff"].addEventListener("click", () => elements["staff-dialog"].close());
elements["staff-form"].addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  elements["staff-message"].textContent = "Создаём сотрудника…";
  try {
    const data = await api("/staff", {
      method: "POST",
      body: {
        displayName: formData.get("displayName"),
        email: formData.get("email"),
        role: formData.get("role"),
      },
    });
    elements["staff-message"].textContent = "";
    elements["staff-password"].hidden = false;
    elements["staff-password"].textContent = `Сотрудник создан. Пароль показывается один раз:\n\n${data.initialPassword}\n\nСкопируйте и передайте его сотруднику лично.`;
    event.currentTarget.querySelector('button[type="submit"]').disabled = true;
    await loadStaff();
  } catch (error) {
    elements["staff-message"].textContent = error.status === 409
      ? "Сотрудник с таким email уже существует."
      : "Не удалось создать сотрудника. Проверьте поля.";
  }
});
elements["change-password-button"].addEventListener("click", () => {
  elements["password-form"].reset();
  elements["password-message"].textContent = "";
  elements["password-dialog"].showModal();
});
elements["cancel-password"].addEventListener("click", () => elements["password-dialog"].close());
elements["password-form"].addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const newPassword = String(data.get("newPassword") || "");
  if (newPassword !== String(data.get("confirmPassword") || "")) {
    elements["password-message"].textContent = "Новые пароли не совпадают.";
    return;
  }
  elements["password-message"].textContent = "Сохраняем…";
  try {
    await api("/password", {
      method: "PATCH",
      body: { currentPassword: data.get("currentPassword"), newPassword },
    });
    elements["password-dialog"].close();
  } catch {
    elements["password-message"].textContent = "Текущий пароль неверен или новый пароль слишком короткий.";
  }
});

async function bootstrap() {
  try {
    const { admin } = await api("/session");
    showCms(admin);
    const initial = ["dashboard", "catalog", "customers", "staff"].includes(location.hash.slice(1))
      ? location.hash.slice(1)
      : "dashboard";
    await switchSection(initial);
  } catch (error) {
    if (error.message !== "admin_not_authenticated") showLogin("Не удалось подключиться к CMS.");
  }
}

bootstrap();
