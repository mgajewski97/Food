import { t, state, isSpice } from "../helpers.js";

function createToast({
  type = "success",
  title = "",
  message = "",
  action = null,
}) {
  const container = document.getElementById("notification-container");
  const liveRegion = document.getElementById("toast-live-region");
  if (!container) return;
  const alert = document.createElement("div");
  const alertClass =
    type === "error"
      ? "alert-error"
      : type === "info"
        ? "alert-info"
        : type === "warning"
          ? "alert-warning"
          : "alert-success";
  alert.className = `alert ${alertClass} shadow-lg relative flex items-center gap-2`;
  const ariaLive = type === "error" ? "assertive" : "polite";
  const role = type === "error" ? "alert" : "status";
  alert.setAttribute("role", role);
  alert.setAttribute("aria-live", ariaLive);
  const body = document.createElement("div");
  body.className = "flex gap-2";
  const icon = document.createElement("span");
  icon.innerHTML =
    type === "error"
      ? '<i class="fa-solid fa-circle-xmark"></i>'
      : type === "info"
        ? '<i class="fa-solid fa-circle-info"></i>'
        : type === "warning"
          ? '<i class="fa-solid fa-triangle-exclamation"></i>'
          : '<i class="fa-solid fa-circle-check"></i>';
  const text = document.createElement("div");
  if (title) {
    const titleEl = document.createElement("span");
    titleEl.className = "font-bold block";
    titleEl.textContent = title;
    text.appendChild(titleEl);
  }
  if (message) {
    const msgEl = document.createElement("span");
    msgEl.textContent = message;
    text.appendChild(msgEl);
  }
  body.appendChild(icon);
  body.appendChild(text);
  alert.appendChild(body);
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm ml-auto mr-8";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      alert.remove();
      action.onClick && action.onClick();
    });
    alert.appendChild(btn);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn btn-xs btn-circle btn-ghost absolute top-1 right-1";
  close.setAttribute("title", t("close"));
  close.setAttribute("aria-label", t("close"));
  close.innerHTML = '<i class="fa-regular fa-xmark"></i>';
  close.addEventListener("click", () => alert.remove());
  alert.appendChild(close);
  container.appendChild(alert);

  if (liveRegion) {
    liveRegion.setAttribute("aria-live", ariaLive);
    liveRegion.textContent = `${title} ${message}`.trim();
  }

  const durations = {
    success: 2500,
    info: 3000,
    warning: 4000,
    error: 6000,
  };
  if (type !== "error") {
    const timeout = durations[type] || 3000;
    setTimeout(() => alert.remove(), timeout);
  } else {
    alert.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      alert.remove();
    });
  }
}

export const toast = {
  success: (title, message = "", action = null) =>
    createToast({ type: "success", title, message, action }),
  info: (title, message = "", action = null) =>
    createToast({ type: "info", title, message, action }),
  warning: (title, message = "", action = null) =>
    createToast({ type: "warning", title, message, action }),
  error: (title, message = "", action = null) =>
    createToast({ type: "error", title, message, action }),
};

export function showNotification({
  type = "info",
  title = "",
  message = "",
  action = null,
}) {
  const fn = toast[type] || toast.info;
  fn(title, message, action);
}

export function showLowStockToast(
  activateTab,
  renderSuggestions,
  renderShoppingList,
) {
  const container = document.getElementById("notification-container");
  if (!container) return;
  const existing = container.querySelector('[data-toast="low-stock"]');
  if (existing) existing.remove();
  const alert = document.createElement("div");
  alert.className = "alert alert-warning relative";
  alert.dataset.toast = "low-stock";
  alert.setAttribute("role", "status");
  alert.setAttribute("aria-live", "polite");
  const span = document.createElement("span");
  span.textContent = t("toast_low_stock");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-sm ml-auto mr-8";
  btn.dataset.action = "shopping";
  btn.textContent = t("toast_go_shopping");
  btn.addEventListener("click", () => {
    const hash = "#shopping";
    if (location.hash === hash) {
      activateTab("tab-shopping");
    } else {
      location.hash = hash;
    }
    renderSuggestions();
    renderShoppingList();
    alert.remove();
  });
  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn btn-xs btn-circle btn-ghost absolute top-1 right-1";
  close.dataset.action = "close";
  close.setAttribute("title", t("close"));
  close.setAttribute("aria-label", t("close"));
  close.innerHTML = '<i class="fa-regular fa-xmark"></i>';
  close.addEventListener("click", () => {
    alert.remove();
  });
  alert.appendChild(span);
  alert.appendChild(btn);
  alert.appendChild(close);
  container.appendChild(alert);
  const liveRegion = document.getElementById("toast-live-region");
  if (liveRegion) {
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.textContent = t("toast_low_stock");
  }
  state.lowStockToastShown = true;
}

export function checkLowStockToast(
  currentProducts,
  activateTab,
  renderSuggestions,
  renderShoppingList,
) {
  const low = (currentProducts || []).some((p) => {
    if (isSpice(p)) return ["none", "low"].includes(p.level);
    return p.main && p.threshold !== null && p.quantity <= p.threshold;
  });
  const container = document.getElementById("notification-container");
  const toast = container
    ? container.querySelector('[data-toast="low-stock"]')
    : null;
  if (low) {
    if (!state.lowStockToastShown) {
      showLowStockToast(activateTab, renderSuggestions, renderShoppingList);
    } else if (toast) {
      toast.querySelector("span").textContent = t("toast_low_stock");
      const btn = toast.querySelector('button[data-action="shopping"]');
      if (btn) btn.textContent = t("toast_go_shopping");
      const close = toast.querySelector('button[data-action="close"]');
      if (close) close.setAttribute("title", t("close"));
    }
  } else {
    if (toast) toast.remove();
    state.lowStockToastShown = false;
  }
}

export function showTopBanner(message, { actionLabel, onAction } = {}) {
  const container = document.getElementById("top-banner-container");
  if (!container) return;
  const banner = document.createElement("div");
  banner.className =
    "alert alert-error flex items-center justify-between gap-4";
  const msg = document.createElement("span");
  msg.textContent = message;
  banner.appendChild(msg);
  if (actionLabel && onAction) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm";
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => {
      banner.remove();
      onAction();
    });
    banner.appendChild(btn);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn btn-xs btn-circle btn-ghost";
  close.innerHTML = '<i class="fa-regular fa-xmark"></i>';
  close.addEventListener("click", () => banner.remove());
  banner.appendChild(close);
  container.appendChild(banner);
}
