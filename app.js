import { initializeFirebase } from "./modules/firebase.js";
import { switchView } from "./modules/ui.js";
import { createAuthManager } from "./modules/auth.js";
import { createScreensModule } from "./modules/screens.js";
import { createPlaylistsModule } from "./modules/playlists.js";
import { createAnalyticsModule } from "./modules/analytics.js";

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
  const screenModule = screens;
  screenModule.renderScreenRow(docId, s);
};

authManager.bind();
playlists.addPlaylistItemRow();
