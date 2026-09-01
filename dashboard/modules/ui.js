(function () {
  const AppModules = window.AppModules || {};

  AppModules.switchView = function switchView(viewId, btn) {
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    const target = document.getElementById(viewId);
    if (target) target.classList.add("active");
    
    document.querySelectorAll(".navBtn").forEach((navBtn) => navBtn.classList.remove("active"));
    if (btn) btn.classList.add("active");
  };

  AppModules.showToast = function showToast(message, type = "info") {
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast-item toast-${type}`;
    
    const iconSvg = type === "success" 
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`
      : type === "error"
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>`;

    toast.innerHTML = `<div class="toast-icon">${iconSvg}</div><div class="toast-text">${message}</div>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("show");
    }, 10);

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };

  window.AppModules = AppModules;
})();

