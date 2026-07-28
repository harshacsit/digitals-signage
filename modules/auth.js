(function () {
  const AppModules = window.AppModules || {};

  AppModules.createAuthManager = function createAuthManager(auth, onAuthStateChanged) {
    function login() {
      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;

      auth.signInWithEmailAndPassword(email, password)
        .catch((err) => {
          const errorBox = document.getElementById("loginError");
          if (errorBox) errorBox.textContent = err.message;
        });
    }

    function logout() {
      auth.signOut();
    }

    function bind() {
      auth.onAuthStateChanged((user) => {
        const loginBox = document.getElementById("loginBox");
        const app = document.getElementById("app");

        if (loginBox) loginBox.style.display = user ? "none" : "block";
        if (app) app.style.display = user ? "block" : "none";

        onAuthStateChanged(user);
      });
    }

    return { login, logout, bind };
  };

  window.AppModules = AppModules;
})();
