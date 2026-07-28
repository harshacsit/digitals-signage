(function () {
  const AppModules = window.AppModules || {};

  AppModules.createAuthManager = function createAuthManager(auth, onAuthStateChanged) {
    function setAuthUi(user) {
      const loginBox = document.getElementById("loginBox");
      const app = document.getElementById("app");

      if (loginBox) loginBox.style.display = user ? "none" : "block";
      if (app) app.style.display = user ? "block" : "none";
    }

    function login() {
      const emailInput = document.getElementById("email");
      const passwordInput = document.getElementById("password");
      const errorBox = document.getElementById("loginError");
      const email = emailInput ? emailInput.value : "";
      const password = passwordInput ? passwordInput.value : "";

      if (!email || !password) {
        if (errorBox) errorBox.textContent = "Enter both email and password.";
        return Promise.resolve(null);
      }

      if (errorBox) errorBox.textContent = "";
      return auth.signInWithEmailAndPassword(email, password)
        .catch((err) => {
          if (errorBox) errorBox.textContent = err.message || "Unable to sign in right now.";
          return null;
        });
    }

    function logout() {
      const errorBox = document.getElementById("loginError");
      if (errorBox) errorBox.textContent = "";
      return auth.signOut();
    }

    function bind() {
      auth.onAuthStateChanged((user) => {
        setAuthUi(user);
        onAuthStateChanged(user);
      });
    }

    return { login, logout, bind };
  };

  window.AppModules = AppModules;
})();
