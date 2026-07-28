(function () {
  const AppModules = window.AppModules || {};

  AppModules.switchView = function switchView(viewId, btn) {
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    document.getElementById(viewId).classList.add("active");
    document.querySelectorAll(".navBtn").forEach((navBtn) => navBtn.classList.remove("active"));
    btn.classList.add("active");
  };

  window.AppModules = AppModules;
})();
