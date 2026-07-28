(function () {
  const { initializeFirebase, switchView, createAuthManager, createScreensModule, createPlaylistsModule, createAnalyticsModule } = window.AppModules;

  const { auth, db } = initializeFirebase();
  const screens = createScreensModule({ db });
  const playlists = createPlaylistsModule({ db });
  const analytics = createAnalyticsModule({ db });

  const authManager = createAuthManager(auth, (user) => {
    if (user) {
      screens.watchScreens();
      playlists.watchPlaylists();
      analytics.initAnalyticsFilters();
      analytics.loadAnalytics();
    }
  });

  window.switchView = switchView;
  window.login = authManager.login;
  window.logout = authManager.logout;
  window.addScreen = screens.addScreen;
  window.assignRotation = screens.assignRotation;
  window.assignPlaylist = screens.assignPlaylist;
  window.removeScreen = screens.removeScreen;
  window.editPlaylist = playlists.editPlaylist;
  window.deletePlaylist = playlists.deletePlaylist;
  window.addPlaylistItemRow = playlists.addPlaylistItemRow;
  window.savePlaylist = playlists.savePlaylist;
  window.loadAnalytics = analytics.loadAnalytics;
  window.populateAnalyticsScreenOptions = analytics.populateAnalyticsScreenOptions;

  window.renderScreenRow = (docId, s) => {
    screens.renderScreenRow(docId, s);
  };

  authManager.bind();
  if (document.getElementById("playlistItems")) {
    playlists.addPlaylistItemRow();
  }
})();
