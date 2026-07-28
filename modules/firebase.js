(function () {
  const AppModules = window.AppModules || {};

  AppModules.initializeFirebase = function initializeFirebase() {
    const firebaseConfig = window.firebaseConfig || {
      apiKey: "",
      authDomain: "",
      projectId: "",
      storageBucket: "",
      messagingSenderId: "",
      appId: "",
      measurementId: ""
    };

    if (!window.firebaseConfig) {
      console.warn("Firebase config not loaded. Create a local config.js file from config.example.js.");
    }

    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      window.firebase.initializeApp(firebaseConfig);
    }

    return {
      auth: window.firebase.auth(),
      db: window.firebase.firestore()
    };
  };

  window.AppModules = AppModules;
})();
