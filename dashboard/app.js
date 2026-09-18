(function () {
  const { initializeFirebase, switchView: _switchView, createAuthManager, createScreensModule, createPlaylistsModule, createGroupsModule, createLiveViewModule, createLiveWallModule } = window.AppModules;

  const { auth, db } = initializeFirebase();
  const screens = createScreensModule({ db });
  const playlists = createPlaylistsModule({ db });
  const groups = createGroupsModule({ db });
  const liveview = createLiveViewModule ? createLiveViewModule() : null;
  const liveWall = createLiveWallModule ? createLiveWallModule({ db }) : null;

  // Wrap switchView so we mount/unmount Live Wall automatically
  let _currentView = '';
  function switchView(viewId, btn) {
    if (_currentView === 'liveWallView' && viewId !== 'liveWallView' && liveWall) {
      liveWall.unmount();
    }
    _switchView(viewId, btn);
    _currentView = viewId;
    if (viewId === 'liveWallView' && liveWall) {
      liveWall.mount();
    }
  }

  const authManager = createAuthManager(auth, (user) => {
    if (user) {
      screens.watchScreens();
      playlists.watchPlaylists();
      groups.watchGroups();
    }
  });

  window.switchView = switchView;
  window.login = authManager.login;
  window.logout = authManager.logout;
  window.addScreen = screens.addScreen;
  window.openAddScreenModal = screens.openAddScreenModal;
  window.closeAddScreenModal = screens.closeAddScreenModal;
  window.startRename = screens.startRename;
  window.cancelRename = screens.cancelRename;
  window.saveRename = screens.saveRename;
  window.onPlaylistChange = screens.onPlaylistChange;
  window.onAfterPlaylistChange = screens.onAfterPlaylistChange;
  window.onRotationChange = screens.onRotationChange;
  window.onLayoutChange = screens.onLayoutChange;
  window.onLayoutModeChange = screens.onLayoutModeChange;
  window.onBottomWebUrlChange = screens.onBottomWebUrlChange;
  window.onSplitRatioChange = screens.onSplitRatioChange;
  window.openScreenTimerModal = screens.openScreenTimerModal;
  window.closeScreenTimerModal = screens.closeScreenTimerModal;
  window.toggleModalTimerInputs = screens.toggleModalTimerInputs;
  window.updateModalTimerPreview = screens.updateModalTimerPreview;
  window.addTimerSlot = screens.addTimerSlot;
  window.removeTimerSlot = screens.removeTimerSlot;
  window.saveScreenTimerModal = screens.saveScreenTimerModal;
  window.pushChanges = screens.pushChanges;
  window.removeScreen = screens.removeScreen;
  window.filterScreensByStatus = screens.filterScreensByStatus;
  window.populateMassLaunchPlaylists = screens.populateMassLaunchPlaylists;
  window.updateMassLaunchTargetCount = screens.updateMassLaunchTargetCount;
  window.renderMassLaunchTvOverviewTable = screens.renderMassLaunchTvOverviewTable;
  window.onMassLaunchScreenPlaylistChange = screens.onMassLaunchScreenPlaylistChange;
  window.onMassLaunchScreenAfterPlaylistChange = screens.onMassLaunchScreenAfterPlaylistChange;
  window.onMassLaunchScreenTimerToggle = screens.onMassLaunchScreenTimerToggle;
  window.onMassLaunchScreenTimerStartChange = screens.onMassLaunchScreenTimerStartChange;
  window.onMassLaunchScreenTimerEndChange = screens.onMassLaunchScreenTimerEndChange;
  window.onMassLaunchScreenRotationChange = screens.onMassLaunchScreenRotationChange;
  window.saveMassLaunchConfig = screens.saveMassLaunchConfig;
  window.closeMassLaunchModal = screens.closeMassLaunchModal;
  window.executeMassLaunch = screens.executeMassLaunch;
  window.launchToAllScreens = screens.launchToAllScreens;
  window.editPlaylist = playlists.editPlaylist;
  window.deletePlaylist = playlists.deletePlaylist;
  window.addPlaylistItemRow = playlists.addPlaylistItemRow;
  window.savePlaylist = playlists.savePlaylist;
  const preview = window.AppModules.createPreviewModule ? window.AppModules.createPreviewModule({ db }) : null;
  if (preview) window.openPreview = preview.open;
  if (liveview) {
    window.openLiveView = liveview.openLiveView;
    window.closeLiveView = liveview.closeLiveView;
    window.attachLiveViewVideo = liveview.attachVideoElement;
  }

  window.saveGroup = groups.saveGroup;
  window.editGroup = groups.editGroup;
  window.cancelEditGroup = groups.cancelEditGroup;
  window.deleteGroup = groups.deleteGroup;
  window.toggleSelectAllGroupScreens = groups.toggleSelectAllGroupScreens;
  window.applyGroupSettings = groups.applyGroupSettings;
  window.openGroupSettingsModal = groups.openGroupSettingsModal;
  window.closeGroupSettingsModal = groups.closeGroupSettingsModal;
  window.saveGroupSettingsModal = groups.saveGroupSettingsModal;
  window.toggleModalGroupTimerInputs = groups.toggleModalGroupTimerInputs;
  window.toggleModalGroupSplitInputs = groups.toggleModalGroupSplitInputs;
  window.onGroupLayoutChange = groups.onGroupLayoutChange;
  window.onGroupPlaylistChange = groups.onGroupPlaylistChange;
  window.onGroupAfterPlaylistChange = groups.onGroupAfterPlaylistChange;
  window.onGroupTimerToggle = groups.onGroupTimerToggle;
  window.onGroupTimerStartChange = groups.onGroupTimerStartChange;
  window.onGroupTimerEndChange = groups.onGroupTimerEndChange;
  window.onGroupBottomWebUrlChange = groups.onGroupBottomWebUrlChange;
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