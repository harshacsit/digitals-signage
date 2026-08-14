(function () {
  const { initializeFirebase, switchView, createAuthManager, createScreensModule, createPlaylistsModule, createAnalyticsModule, createPreviewModule, createGroupsModule } = window.AppModules;

  const { auth, db } = initializeFirebase();
  const screens = createScreensModule({ db });
  const playlists = createPlaylistsModule({ db });
  const analytics = createAnalyticsModule({ db });
  const preview = createPreviewModule({ db });
  const groups = createGroupsModule({ db });

  const authManager = createAuthManager(auth, (user) => {
    if (user) {
      screens.watchScreens();
      playlists.watchPlaylists();
      groups.watchGroups();
      analytics.initAnalyticsFilters();
      analytics.loadAnalytics();
    }
  });

  window.switchView = switchView;
  window.login = authManager.login;
  window.logout = authManager.logout;
  window.addScreen = screens.addScreen;
  window.startRename = screens.startRename;
  window.cancelRename = screens.cancelRename;
  window.saveRename = screens.saveRename;
  window.onPlaylistChange = screens.onPlaylistChange;
  window.onRotationChange = screens.onRotationChange;
  window.onLayoutChange = screens.onLayoutChange;
  window.onLayoutModeChange = screens.onLayoutModeChange;
  window.onBottomPlaylistChange = screens.onBottomPlaylistChange;
  window.onSplitRatioChange = screens.onSplitRatioChange;
  window.onBottomScrollChange = screens.onBottomScrollChange;
  window.pushChanges = screens.pushChanges;
  window.removeScreen = screens.removeScreen;
  window.filterScreensByStatus = screens.filterScreensByStatus;
  window.editPlaylist = playlists.editPlaylist;
  window.deletePlaylist = playlists.deletePlaylist;
  window.addPlaylistItemRow = playlists.addPlaylistItemRow;
  window.savePlaylist = playlists.savePlaylist;
  window.loadAnalytics = analytics.loadAnalytics;
  window.populateAnalyticsScreenOptions = analytics.populateAnalyticsScreenOptions;
  window.openPreview = preview.open;

  window.saveGroup = groups.saveGroup;
  window.editGroup = groups.editGroup;
  window.cancelEditGroup = groups.cancelEditGroup;
  window.deleteGroup = groups.deleteGroup;
  window.toggleSelectAllGroupScreens = groups.toggleSelectAllGroupScreens;
  window.applyGroupSettings = groups.applyGroupSettings;
  window.onGroupLayoutChange = groups.onGroupLayoutChange;
  window.onGroupPlaylistChange = groups.onGroupPlaylistChange;
  window.onGroupBottomPlaylistChange = groups.onGroupBottomPlaylistChange;
  window.onGroupSplitRatioChange = groups.onGroupSplitRatioChange;
  window.onGroupRotationChange = groups.onGroupRotationChange;
  window.renderGroupsTable = groups.renderGroupsTable;
  window.renderScreenCheckboxes = groups.renderScreenCheckboxes;

  window.renderScreenRow = (docId, s) => {
    screens.renderScreenRow(docId, s);
  };

  authManager.bind();
  if (document.getElementById("playlistItems")) {
    playlists.addPlaylistItemRow();
  }
})();