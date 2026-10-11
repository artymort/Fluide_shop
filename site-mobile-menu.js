(() => {
  const menu = document.querySelector(".mobile-nav");
  const toggle = document.querySelector(".menu-toggle");
  const closeButton = menu?.querySelector(".mobile-nav-close");
  if (!menu || !toggle || !closeButton) return;

  const close = (restoreFocus = false) => {
    menu.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("mobile-menu-open");
    if (restoreFocus) toggle.focus();
  };

  toggle.addEventListener("click", () => {
    const open = menu.classList.contains("is-open");
    document.body.classList.toggle("mobile-menu-open", open);
    if (open) closeButton.focus();
  });
  closeButton.addEventListener("click", () => close(true));
  menu.querySelectorAll(".mobile-nav-links a").forEach(link => link.addEventListener("click", () => close()));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && menu.classList.contains("is-open")) close(true);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900 && menu.classList.contains("is-open")) close();
  });
})();
