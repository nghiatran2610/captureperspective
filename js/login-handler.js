// js/login-handler.js
import UI from "./ui/index.js";
import * as events from "./events.js";
import urlFetcher from "./url-fetcher.js";

class VisualLoginHandler {
  constructor() {
    this.loginUrl = "";
    this.isLoggedIn = false;
    this.loginSection = null;
    this.initialSessions = new Map();
    this._pollInterval = null;
    this._sessionMonitorInterval = null;
    this.monitorPollIntervalTime = 15000;
    this.loginPollIntervalTime = 3000;
    this.selectedLoginOption = "";
    this.loggedInUsername = null;
    this.activeSessionId = null;
    this.loginTab = null;

    this.textForOptionLogin = null;
    this.logoutButton = null;
    this.optionLoginRadio = null;
    this.optionContinueGuestRadio = null;
  }

  initialize() {
    this.addLoginUI();
    this._setupLoginOptionElements();
    console.log("VisualLoginHandler initialized for new tab login.");
  }

  _setupLoginOptionElements() {
    this.optionLoginRadio = document.getElementById("optionLogin");
    this.optionContinueGuestRadio = document.getElementById(
      "optionContinueWithoutLogin"
    );
    this.textForOptionLogin = document.getElementById("textForOptionLogin");
    this.logoutButton = document.getElementById("logoutBtn");

    if (this.optionContinueGuestRadio) {
      events.addDOMEventListener(
        this.optionContinueGuestRadio,
        "change",
        async () => {
          if (this.optionContinueGuestRadio.checked) {
            await this.handleLoginOptionChange("continueWithoutLogin");
          }
        }
      );
    }
    if (this.optionLoginRadio) {
      events.addDOMEventListener(this.optionLoginRadio, "change", async () => {
        if (this.optionLoginRadio.checked) {
          await this.handleLoginOptionChange("login");
        }
      });
    }
    if (this.logoutButton) {
      events.addDOMEventListener(this.logoutButton, "click", () =>
        this.performLogout()
      );
    }
  }

  determineLoginUrl() {
    if (!urlFetcher.baseClientUrl || !urlFetcher.projectName) {
      console.warn(
        "Cannot determine login URL: Base URL or target project name not set."
      );
      this.updateLoginStatus(
        "logged-out",
        "Error: Project URL not set for login."
      );
      return null;
    }
    try {
      const urlObj = new URL(urlFetcher.baseClientUrl);
      const loginViewName = "Admin";
      const loginUrl = `${urlObj.origin}/data/perspective/login/${urlFetcher.projectName}/${loginViewName}?forceAuth=true`;
      console.log("Determined login URL:", loginUrl);
      return loginUrl;
    } catch (e) {
      console.error("Error constructing login URL:", e);
      this.updateLoginStatus(
        "logged-out",
        "Error: Invalid Project URL for login."
      );
      return null;
    }
  }

  addLoginUI() {
    this.loginSection = document.getElementById("loginSection");
    if (!this.loginSection) {
      console.error(
        "#loginSection not found in HTML. This section is now used for status messages."
      );
    }
    const oldFrameContainer = document.getElementById("loginFrameContainer");
    if (oldFrameContainer) {
      oldFrameContainer.remove();
    }
    this.updateLoginStatus("logged-out", "Not authenticated");
  }

  async checkInitialSessionAndSetupUI() {
    console.log("Performing initial session check...");
    if (!urlFetcher.baseClientUrl || !urlFetcher.projectName) {
      this.updateLoginOptionsUI(null, false);
      this.isLoggedIn = false;
      this.loggedInUsername = null;
      this.activeSessionId = null;
      this.selectedLoginOption = "";
      this.updateLoginStatus("logged-out", "Project not selected");
      this.stopSessionMonitor();
      this.stopSessionPolling();
      console.warn(
        "Initial session check skipped: Project URL or name missing."
      );
      return { isLoggedIn: false, username: null, sessionId: null };
    }

    const sessions = await this.fetchSessionListWithCacheBust();
    let activeUserSession = null;

    if (sessions) {
      for (const session of sessions) {
        const currentUsername = session.username;
        const isValidUsername =
          currentUsername &&
          currentUsername.toLowerCase() !== "unauthenticated" &&
          currentUsername.trim() !== "" &&
          currentUsername !== "null";
        if (isValidUsername && session.project === urlFetcher.projectName) {
          activeUserSession = session;
          console.log(
            `Initial check: Found active session for user ${currentUsername} (ID: ${session.id}) in project ${session.project}`
          );
          break;
        }
      }
    }

    if (activeUserSession) {
      this.isLoggedIn = true;
      this.loggedInUsername = activeUserSession.username;
      this.activeSessionId = activeUserSession.id;
      this.selectedLoginOption = "";
      this.updateLoginOptionsUI(this.loggedInUsername, false);
      this.updateLoginStatus(
        "logged-in",
        `Active session for ${this.loggedInUsername}. Please select an option.`
      );
      this.startSessionMonitor();
      return {
        isLoggedIn: true,
        username: this.loggedInUsername,
        sessionId: this.activeSessionId,
      };
    } else {
      this.isLoggedIn = false;
      this.loggedInUsername = null;
      this.activeSessionId = null;
      this.selectedLoginOption = "";
      this.updateLoginOptionsUI(null, false);
      this.updateLoginStatus("logged-out", "Not authenticated");
      this.stopSessionMonitor();
      this.stopSessionPolling();
      return { isLoggedIn: false, username: null, sessionId: null };
    }
  }

  updateLoginOptionsUI(username, preCheckLoginOption = false) {
    if (
      !this.textForOptionLogin ||
      !this.logoutButton ||
      !this.optionLoginRadio ||
      !this.optionContinueGuestRadio
    ) {
      console.error("Cannot update login options UI: Key elements not found.");
      return;
    }

    if (username) {
      this.textForOptionLogin.textContent = `Continue as ${username}`;
      this.logoutButton.style.display = "inline-block";
      if (preCheckLoginOption) {
        this.optionLoginRadio.checked = true;
        this.optionContinueGuestRadio.checked = false;
      }
    } else {
      this.textForOptionLogin.textContent = "Login with Authentication";
      this.logoutButton.style.display = "none";
      if (preCheckLoginOption === false) {
        this.optionLoginRadio.checked = false;
      }
    }
  }

  async handleLoginOptionChange(option) {
    this.stopSessionMonitor();
    this.selectedLoginOption = option;

    if (option === "login") {
      if (this.isLoggedIn && this.loggedInUsername) {
        console.log(
          `Login option selected, continuing as authenticated user ${this.loggedInUsername} (Session ID: ${this.activeSessionId}).`
        );
        this.updateLoginStatus(
          "logged-in",
          `Logged in as ${this.loggedInUsername}`
        );
        this.startSessionMonitor();
        events.emit(events.events.LOGIN_OPTION_SELECTED, {
          option: "login",
          isLoggedIn: this.isLoggedIn,
          username: this.loggedInUsername,
          sessionId: this.activeSessionId,
        });
      } else {
        console.log("Login option selected, preparing for new tab login...");
        this.isLoggedIn = false;
        this.loggedInUsername = null;
        this.activeSessionId = null;
        await this.prepareFrameLogin();
      }
    } else if (option === "continueWithoutLogin") {
      console.log("Continue without login selected.");
      if (this.isLoggedIn && this.activeSessionId) {
        console.log(
          `User was logged in as ${this.loggedInUsername}. Performing logout before continuing as guest.`
        );
        await this.performLogout();
      }

      this.isLoggedIn = false;
      this.loggedInUsername = null;
      this.activeSessionId = null;
      this.stopSessionPolling();
      this.stopSessionMonitor();

      this.updateLoginStatus("logged-out", "Continuing as Guest");
      this.updateLoginOptionsUI(null, false);
      if (this.optionLoginRadio) this.optionLoginRadio.checked = false;

      try {
        const screenshotIframe = document.getElementById("screenshotIframe");
        if (screenshotIframe && screenshotIframe.src !== "about:blank") {
          screenshotIframe.src = "about:blank";
        }
      } catch (e) {
        console.error("Error clearing #screenshotIframe:", e);
      }
      events.emit(events.events.LOGIN_OPTION_SELECTED, {
        option: "continueWithoutLogin",
        isLoggedIn: this.isLoggedIn,
        username: this.loggedInUsername,
        sessionId: null,
      });
    }
  }

  async prepareFrameLogin() {
    if (this.isLoggedIn) {
      console.log(
        "prepareFrameLogin called but already logged in. Aborting new tab."
      );
      this.startSessionMonitor();
      events.emit(events.events.LOGIN_OPTION_SELECTED, {
        option: "login",
        isLoggedIn: true,
        username: this.loggedInUsername,
        sessionId: this.activeSessionId,
      });
      return;
    }

    if (!urlFetcher.baseClientUrl || !urlFetcher.projectName) {
      console.error(
        "prepareFrameLogin: Base URL or target project name not set."
      );
      this.updateLoginStatus(
        "logged-out",
        "Error: Project URL must be set first."
      );
      if (this.optionLoginRadio) this.optionLoginRadio.checked = false;
      this.selectedLoginOption = "";
      return;
    }

    this.loginUrl = this.determineLoginUrl();
    if (!this.loginUrl) {
      if (this.optionLoginRadio) this.optionLoginRadio.checked = false;
      this.selectedLoginOption = "";
      return;
    }

    this.initialSessions.clear(); // Clear before fetching
    this.stopSessionPolling();
    this.stopSessionMonitor();
    this.activeSessionId = null; // Ensure no active session ID from a previous state

    this.updateLoginStatus("checking", "Opening login tab...");

    try {
      // Fetch sessions *before* opening the tab to establish a baseline
      const sessions = await this.fetchSessionListWithCacheBust();
      if (sessions === null) {
        if (this.optionLoginRadio) this.optionLoginRadio.checked = false;
        this.selectedLoginOption = "";
        return;
      }
      sessions.forEach((s) => this.initialSessions.set(s.id, s.username));
      console.log(
        "Initial sessions recorded before opening login tab:",
        this.initialSessions
      );
    } catch (error) {
      this.updateLoginStatus(
        "logged-out",
        "Error checking authentication status."
      );
      if (this.optionLoginRadio) this.optionLoginRadio.checked = false;
      this.selectedLoginOption = "";
      return;
    }

    if (this.loginTab && !this.loginTab.closed) {
      this.loginTab.focus();
    } else {
      this.loginTab = window.open(this.loginUrl, "_blank");
    }

    if (!this.loginTab) {
      this.updateLoginStatus(
        "logged-out",
        "Popup blocker might have prevented login tab. Please allow popups for this site."
      );
      console.error(
        "Failed to open login tab. Possibly blocked by popup blocker."
      );
      if (this.optionLoginRadio) this.optionLoginRadio.checked = false;
      this.selectedLoginOption = "";
    } else {
      this.updateLoginStatus("checking", "Waiting for login in new tab...");
      this.startSessionPolling(); // This will now use the corrected logic
      events.emit(events.events.LOGIN_OPTION_SELECTED, {
        option: "login",
        isLoggedIn: false,
        username: null,
        sessionId: null,
        loginPendingInNewTab: true,
      });
    }
  }

  startSessionPolling() {
    if (this._pollInterval) return;
    if (
      this.isLoggedIn &&
      this.selectedLoginOption === "login" &&
      this._sessionMonitorInterval
    ) {
      this.stopSessionPolling();
      return;
    }
    if (
      this.selectedLoginOption !== "login" ||
      (this.isLoggedIn && this._sessionMonitorInterval)
    ) {
      this.stopSessionPolling();
      return;
    }

    this.updateLoginStatus("checking", "Waiting for login in new tab...");
    console.log("Starting session polling (for new tab login attempt)...");

    const pollCallback = async () => {
      if (
        !this._pollInterval ||
        (this.isLoggedIn && this._sessionMonitorInterval) ||
        this.selectedLoginOption !== "login"
      ) {
        this.stopSessionPolling();
        return;
      }

      const sessions = await this.fetchSessionListWithCacheBust();
      if (!this._pollInterval || sessions === null) {
        return;
      }

      let identifiedAuthenticatedSession = null;
      for (const session of sessions) {
        const currentUsername = session.username;
        const isValidUsername =
          currentUsername &&
          currentUsername.toLowerCase() !== "unauthenticated" &&
          currentUsername.trim() !== "" &&
          currentUsername !== "null";

        if (isValidUsername && session.project === urlFetcher.projectName) {
          // This is a valid, authenticated session for the project.
          // If we initiated a login, any such session found is the target.
          identifiedAuthenticatedSession = session;
          break;
        }
      }

      if (identifiedAuthenticatedSession) {
        // FIX: An authenticated session for the project was found after login was initiated.
        // No need to strictly check against initialSessions if the intent was to log in.
        console.log(
          `Authenticated session identified during polling: User: ${identifiedAuthenticatedSession.username} (ID: ${identifiedAuthenticatedSession.id})`
        );
        this.stopSessionPolling();
        this.completeLogin(
          identifiedAuthenticatedSession.username,
          identifiedAuthenticatedSession.id
        );
      } else {
        if (this._pollInterval) {
          this.updateLoginStatus("checking", "Waiting for login in new tab...");
        }
      }
    };
    setTimeout(pollCallback, this.loginPollIntervalTime / 2);
    this._pollInterval = setInterval(pollCallback, this.loginPollIntervalTime);
  }

  stopSessionPolling() {
    if (this._pollInterval) {
      console.log("Stopping session polling (for new tab login attempt).");
      clearInterval(this._pollInterval);
      this._pollInterval = null;
      if (
        !this.isLoggedIn &&
        !this._sessionMonitorInterval &&
        this.selectedLoginOption === "login"
      ) {
        this.updateLoginStatus(
          "logged-out",
          "Login process stopped or new tab closed. Please select an option."
        );
      }
    }
  }

  startSessionMonitor() {
    if (this._sessionMonitorInterval) return;
    if (
      !this.isLoggedIn ||
      !this.loggedInUsername ||
      !this.activeSessionId ||
      this.selectedLoginOption !== "login"
    ) {
      this.stopSessionMonitor();
      return;
    }
    console.log(
      `Starting session monitor for user: ${this.loggedInUsername} (Session ID: ${this.activeSessionId})`
    );

    const monitorCallback = async () => {
      if (
        !this._sessionMonitorInterval ||
        !this.isLoggedIn ||
        this.selectedLoginOption !== "login"
      ) {
        this.stopSessionMonitor();
        return;
      }
      const sessions = await this.fetchSessionListWithCacheBust();
      if (sessions === null) {
        console.warn(
          "Session monitor: could not fetch session list. Will retry."
        );
        return;
      }

      const currentUserStillActive = sessions.some(
        (s) =>
          s.id === this.activeSessionId &&
          s.username === this.loggedInUsername &&
          s.project === urlFetcher.projectName &&
          s.username &&
          s.username.toLowerCase() !== "unauthenticated" &&
          s.username.trim() !== "" &&
          s.username !== "null"
      );

      if (!currentUserStillActive) {
        this.handleAutoLogout();
      }
    };
    setTimeout(monitorCallback, 100);
    this._sessionMonitorInterval = setInterval(
      monitorCallback,
      this.monitorPollIntervalTime
    );
  }

  stopSessionMonitor() {
    if (this._sessionMonitorInterval) {
      console.log("Stopping session monitor.");
      clearInterval(this._sessionMonitorInterval);
      this._sessionMonitorInterval = null;
    }
  }

  handleAutoLogout() {
    console.log("Auto-logout detected or session expired.");
    const previousUsername = this.loggedInUsername;
    const previousSessionId = this.activeSessionId;

    this.isLoggedIn = false;
    this.loggedInUsername = null;
    this.activeSessionId = null;
    this.stopSessionMonitor();
    this.stopSessionPolling();

    this.updateLoginStatus(
      "logged-out",
      `Session for ${previousUsername || "user"} expired or ended.`
    );
    this.updateLoginOptionsUI(null, false);

    if (this.optionLoginRadio) this.optionLoginRadio.checked = false;
    if (this.optionContinueGuestRadio)
      this.optionContinueGuestRadio.checked = false;
    this.selectedLoginOption = "";

    events.emit(events.events.AUTO_LOGOUT_DETECTED, {
      username: previousUsername,
      sessionId: previousSessionId,
    });
  }

  async fetchSessionListWithCacheBust() {
    let gatewayOrigin, toolWebdevProject;
    try {
      const currentToolUrl = window.location.href;
      const toolUrlRegex = /^(https?:\/\/[^\/]+)\/system\/webdev\/([^\/]+)/;
      const toolUrlMatch = currentToolUrl.match(toolUrlRegex);

      if (!toolUrlMatch || !toolUrlMatch[1] || !toolUrlMatch[2]) {
        console.error(
          "Failed to parse tool's own project context from URL:",
          currentToolUrl,
          "Regex did not match expected structure /system/webdev/PROJECT_NAME/..."
        );
        throw new Error(
          "Could not extract tool's project context. Ensure the tool is running under a path like /system/webdev/PROJECT_NAME/."
        );
      }
      gatewayOrigin = toolUrlMatch[1];
      toolWebdevProject = toolUrlMatch[2];
    } catch (e) {
      console.error(
        "fetchSessionList: Error parsing current tool URL:",
        e.message
      );
      this.updateLoginStatus("logged-out", "Error: Tool URL misconfiguration.");
      return null;
    }
    const baseFetchUrl = `${gatewayOrigin}/system/webdev/${toolWebdevProject}/${toolWebdevProject}/getSessionInfo`;

    let queryParams = [];
    const targetProject = urlFetcher.projectName;
    if (targetProject && targetProject.trim() !== "") {
      queryParams.push(`projectName=${encodeURIComponent(targetProject)}`);
    }
    queryParams.push(`_cb=${new Date().getTime()}`);

    const fetchUrl = `${baseFetchUrl}?${queryParams.join("&")}`;
    console.debug("Fetching session list from:", fetchUrl);

    try {
      const res = await fetch(fetchUrl, {
        method: "GET",
        credentials: "include",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      });
      if (!res.ok) {
        let errorText = `Auth check error (${res.status})`;
        const responseText = await res.text();
        if (res.status === 404)
          errorText = `Authentication service endpoint not found at ${fetchUrl}.`;
        else if (res.status === 401 || res.status === 403)
          errorText = "Not authorized to access authentication service.";
        else errorText += ` - ${responseText.substring(0, 100)}`;

        console.error(
          `WorkspaceSessionList: Failed response ${res.status} from ${fetchUrl}. Message: ${responseText}`
        );
        if (
          !this.isLoggedIn &&
          !this._pollInterval &&
          !this._sessionMonitorInterval
        ) {
          this.updateLoginStatus("logged-out", errorText);
        }
        return null;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.filter(
          (s) =>
            typeof s.id !== "undefined" && typeof s.username !== "undefined"
        );
      }
      console.warn("fetchSessionList: Received data is not an array.", data);
      return [];
    } catch (e) {
      console.error(
        `WorkspaceSessionList: Network or JSON parse error from ${fetchUrl}:`,
        e
      );
      if (
        !this.isLoggedIn &&
        !this._pollInterval &&
        !this._sessionMonitorInterval
      ) {
        this.updateLoginStatus("logged-out", "Auth check network error.");
      }
      return null;
    }
  }

  completeLogin(username, sessionId) {
    if (
      this.isLoggedIn &&
      this.loggedInUsername === username &&
      this.activeSessionId === sessionId
    ) {
      if (!this._sessionMonitorInterval) this.startSessionMonitor();
      return;
    }
    if (
      this.isLoggedIn &&
      (this.loggedInUsername !== username || this.activeSessionId !== sessionId)
    ) {
      this.stopSessionMonitor();
    }

    this.isLoggedIn = true;
    this.loggedInUsername = username || "Authenticated User";
    this.activeSessionId = sessionId;
    this.selectedLoginOption = "login";
    console.log(
      `Login successful. User: '${this.loggedInUsername}', Session ID: ${this.activeSessionId}`
    );

    this.updateLoginStatus(
      "logged-in",
      `Logged in as ${this.loggedInUsername}.`
    );
    this.updateLoginOptionsUI(this.loggedInUsername, true);

    if (this.loginTab && !this.loginTab.closed) {
      try {
        this.loginTab.close();
        console.log("Login tab attempted to close by the tool.");
      } catch (e) {
        console.warn(
          "Could not programmatically close the login tab. User should close it manually if it's still open.",
          e
        );
      }
      this.loginTab = null;
    }

    this.startSessionMonitor();

    events.emit(events.events.LOGIN_COMPLETE, {
      loggedIn: true,
      username: this.loggedInUsername,
      sessionId: this.activeSessionId,
    });
  }

  async performLogout() {
    console.log("Performing logout...");
    const previousUsername = this.loggedInUsername;
    const previousSessionId = this.activeSessionId;

    this.isLoggedIn = false;
    this.loggedInUsername = null;
    this.activeSessionId = null;
    this.stopSessionMonitor();
    this.stopSessionPolling();
    if (this.loginTab && !this.loginTab.closed) {
      this.loginTab = null;
    }
    this.updateLoginOptionsUI(null, false);
    if (this.optionLoginRadio) this.optionLoginRadio.checked = false;
    if (this.optionContinueGuestRadio)
      this.optionContinueGuestRadio.checked = false;
    this.selectedLoginOption = "";
    this.updateLoginStatus(
      "logged-out",
      `Logged out ${previousUsername || "user"}. Select an option.`
    );
    events.emit(events.events.USER_LOGGED_OUT, {
      username: previousUsername,
      sessionId: previousSessionId,
    });

    let gatewayOrigin, toolWebdevProject;
    try {
      const currentToolUrl = window.location.href;
      const toolUrlRegex = /^(https?:\/\/[^\/]+)\/system\/webdev\/([^\/]+)/;
      const toolUrlMatch = currentToolUrl.match(toolUrlRegex);
      if (!toolUrlMatch || !toolUrlMatch[1] || !toolUrlMatch[2]) {
        throw new Error(
          "Could not extract tool's project context for custom logout URL."
        );
      }
      gatewayOrigin = toolUrlMatch[1];
      toolWebdevProject = toolUrlMatch[2];
    } catch (e) {
      console.error(
        "Error constructing custom logout URL base:",
        e.message,
        "Falling back to generic logout."
      );
      window.open(
        `${
          urlFetcher.baseClientUrl
            ? new URL(urlFetcher.baseClientUrl).origin
            : window.location.origin
        }/data/perspective/logout`,
        "_blank"
      );
      return;
    }

    const customLogoutUrl = `${gatewayOrigin}/system/webdev/${toolWebdevProject}/${toolWebdevProject}/logout`;

    if (previousSessionId) {
      const logoutUrlWithSession = `${customLogoutUrl}?sessionId=${encodeURIComponent(
        previousSessionId
      )}`;
      console.log(
        `Attempting to call custom logout endpoint: ${logoutUrlWithSession}`
      );
      try {
        const response = await fetch(logoutUrlWithSession, {
          method: "GET",
          credentials: "include",
        });
        if (response.ok) {
          console.log(
            `Custom logout endpoint called successfully for session ${previousSessionId}. Status: ${response.status}`
          );
        } else {
          console.warn(
            `Custom logout endpoint call for session ${previousSessionId} returned status: ${response.status}`
          );
        }
      } catch (error) {
        console.error(
          `Error calling custom logout endpoint for session ${previousSessionId}:`,
          error
        );
      }
    } else {
      console.warn(
        "No active session ID found to perform specific logout. User state cleared locally. Opening generic logout."
      );
      window.open(`${gatewayOrigin}/data/perspective/logout`, "_blank");
    }
  }

  hideLoginFrame() {
    // No-op
  }

  updateLoginStatus(status, text) {
    const statusElement = document.getElementById("loginStatus");
    if (!statusElement) {
      console.warn("#loginStatus element not found for updating text:", text);
      return;
    }
    statusElement.className = `login-status ${status}`;
    const icon = statusElement.querySelector(".login-status-icon");
    if (icon)
      icon.textContent =
        status === "logged-in" ? "✅" : status === "checking" ? "⏳" : "⚪";
    const lbl = statusElement.querySelector(".login-status-text");
    if (lbl) lbl.textContent = text;

    const loginMessageSection = document.getElementById("loginSection");
    if (loginMessageSection) {
      if (
        status === "checking" &&
        (text.toLowerCase().includes("new tab") ||
          text.toLowerCase().includes("opening login tab"))
      ) {
        loginMessageSection.innerHTML = `<p class="login-process-message">${text.replace(
          "... This page will update automatically when you return.",
          "..."
        )}</p>`;
        loginMessageSection.style.display = "block";
      } else if (
        status === "logged-in" ||
        (status === "logged-out" &&
          !(
            this.selectedLoginOption === "login" &&
            (this._pollInterval || this.loginTab)
          ))
      ) {
        loginMessageSection.innerHTML = "";
        loginMessageSection.style.display = "none";
      }
    }
  }

  getLoginStatus() {
    return this.isLoggedIn;
  }
  getLoggedInUsername() {
    return this.loggedInUsername;
  }
  getActiveSessionId() {
    return this.activeSessionId;
  }
  getSelectedLoginOption() {
    return this.selectedLoginOption;
  }
}

export default new VisualLoginHandler();
