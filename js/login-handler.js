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
        () => {
          if (this.optionContinueGuestRadio.checked) {
            this.handleLoginOptionChange("continueWithoutLogin");
            events.emit(events.events.LOGIN_OPTION_SELECTED, {
              option: "continueWithoutLogin",
              isLoggedIn: this.isLoggedIn,
              username: this.loggedInUsername,
            });
          }
        }
      );
    }
    if (this.optionLoginRadio) {
      events.addDOMEventListener(this.optionLoginRadio, "change", () => {
        if (this.optionLoginRadio.checked) {
          this.handleLoginOptionChange("login");
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
      this.selectedLoginOption = ""; // MODIFIED: Clear selected option, user must re-select
      this.updateLoginOptionsUI(this.loggedInUsername, false); // MODIFIED: set preCheckLoginOption to false
      this.updateLoginStatus(
        "logged-in", // Status shows logged in, but choice is needed
        `Active session for ${this.loggedInUsername}. Please select an option.`
      );
      this.startSessionMonitor(); // Still monitor if a session is found
      return {
        isLoggedIn: true, // Indicates a session exists
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
        // It's also good practice to ensure the guest radio is also unchecked if no user and not pre-checking anything
        // this.optionContinueGuestRadio.checked = false; // This is handled in app.js _handleProjectSelection
      }
    }
  }

  handleLoginOptionChange(option) {
    this.selectedLoginOption = option;
    this.stopSessionMonitor(); // Stop previous monitor if any option is actively chosen

    if (option === "login") {
      if (this.isLoggedIn && this.loggedInUsername) {
        // This path is taken if user clicks "Continue as X" when a session was found
        console.log(
          `Login option selected, continuing as authenticated user ${this.loggedInUsername} (Session ID: ${this.activeSessionId}).`
        );
        this.updateLoginStatus(
          "logged-in",
          `Logged in as ${this.loggedInUsername}`
        );
        this.startSessionMonitor(); // Restart monitor for this confirmed session
        events.emit(events.events.LOGIN_OPTION_SELECTED, {
          option: "login",
          isLoggedIn: this.isLoggedIn,
          username: this.loggedInUsername,
          sessionId: this.activeSessionId,
        });
      } else {
        // This path is taken if user clicks "Login with Authentication" when no session was found
        console.log("Login option selected, preparing for new tab login...");
        this.isLoggedIn = false;
        this.loggedInUsername = null;
        this.activeSessionId = null;
        this.prepareFrameLogin();
      }
    } else if (option === "continueWithoutLogin") {
      console.log("Continue without login selected.");
      this.isLoggedIn = false;
      this.loggedInUsername = null;
      this.activeSessionId = null;
      this.stopSessionPolling(); // Ensure no polling if guest mode
      this.updateLoginStatus("logged-out", "Continuing as Guest");
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
      // If this happens, it means "Login with Auth" was clicked while already logged in.
      // We should ensure the monitor is running and the LOGIN_OPTION_SELECTED reflects the current state.
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

    this.initialSessions.clear();
    this.stopSessionPolling();
    this.stopSessionMonitor();
    this.activeSessionId = null;

    this.updateLoginStatus("checking", "Opening login tab...");

    try {
      const sessions = await this.fetchSessionListWithCacheBust();
      if (sessions === null) {
        // Error already handled by fetchSessionListWithCacheBust, just ensure UI reset
        if (this.optionLoginRadio) this.optionLoginRadio.checked = false;
        this.selectedLoginOption = "";
        return;
      }
      sessions.forEach((s) => this.initialSessions.set(s.id, s.username));
    } catch (error) {
      // Should be caught by fetchSessionList, but for safety
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
      // No LOGIN_OPTION_SELECTED event here, as the attempt failed.
    } else {
      this.updateLoginStatus("checking", "Waiting for login in new tab...");
      this.startSessionPolling();
      // Emit LOGIN_OPTION_SELECTED to inform app.js that a login process is initiated
      // but not yet complete. app.js uses this to hide capture form.
      events.emit(events.events.LOGIN_OPTION_SELECTED, {
        option: "login",
        isLoggedIn: false, // Not yet logged in through this attempt
        username: null,
        sessionId: null,
        loginPendingInNewTab: true,
      });
    }
  }

  startSessionPolling() {
    if (this._pollInterval) return; // Already polling
    if (this.isLoggedIn) {
      // If somehow already logged in, don't poll for new session
      this.stopSessionPolling();
      return;
    }
    // Only poll if "login" option is selected and no session monitor is active (which means not fully logged in yet)
    if (this.selectedLoginOption !== "login" || this._sessionMonitorInterval) {
      this.stopSessionPolling();
      return;
    }

    this.updateLoginStatus("checking", "Waiting for login in new tab...");
    console.log("Starting session polling (for new tab login attempt)...");

    const pollCallback = async () => {
      // Check conditions to stop polling inside the callback
      if (
        !this._pollInterval || // Poller was stopped
        this.isLoggedIn || // Logged in through some other means
        this.selectedLoginOption !== "login" || // Option changed
        this._sessionMonitorInterval // Session monitor took over (means login completed)
      ) {
        this.stopSessionPolling();
        return;
      }

      const sessions = await this.fetchSessionListWithCacheBust();
      if (!this._pollInterval || sessions === null) {
        // Poller stopped or error fetching
        return;
      }

      let loggedInSession = null;
      for (const session of sessions) {
        const currentUsername = session.username;
        const isValidUsername =
          currentUsername &&
          currentUsername.toLowerCase() !== "unauthenticated" &&
          currentUsername.trim() !== "" &&
          currentUsername !== "null";

        if (
          isValidUsername &&
          session.project === urlFetcher.projectName &&
          !this.initialSessions.has(session.id) // Must be a new session
        ) {
          loggedInSession = session;
          break;
        }
      }

      if (loggedInSession) {
        console.log(
          `New session detected for user: ${loggedInSession.username} (ID: ${loggedInSession.id})`
        );
        this.stopSessionPolling(); // Stop polling once new session is found
        this.completeLogin(loggedInSession.username, loggedInSession.id);
      } else {
        // Still polling, update status if necessary
        if (this._pollInterval) {
          // Check again, could have been stopped by another async op
          this.updateLoginStatus("checking", "Waiting for login in new tab...");
        }
      }
    };
    // Initial call delayed slightly to allow tab to open.
    setTimeout(pollCallback, this.loginPollIntervalTime / 2);
    this._pollInterval = setInterval(pollCallback, this.loginPollIntervalTime);
  }

  stopSessionPolling() {
    if (this._pollInterval) {
      console.log("Stopping session polling (for new tab login attempt).");
      clearInterval(this._pollInterval);
      this._pollInterval = null;
      // Update status only if login wasn't completed and no session monitor is active
      if (
        !this.isLoggedIn &&
        !this._sessionMonitorInterval &&
        this.selectedLoginOption === "login" // And the intent was to login
      ) {
        this.updateLoginStatus(
          "logged-out",
          "Login process stopped or new tab closed. Please select an option."
        );
      }
    }
  }

  startSessionMonitor() {
    if (this._sessionMonitorInterval) return; // Already monitoring
    // Only monitor if fully logged in and "login" option is active
    if (
      !this.isLoggedIn ||
      !this.loggedInUsername ||
      !this.activeSessionId ||
      this.selectedLoginOption !== "login"
    ) {
      this.stopSessionMonitor(); // Ensure it's stopped if conditions aren't met
      return;
    }
    console.log(
      `Starting session monitor for user: ${this.loggedInUsername} (Session ID: ${this.activeSessionId})`
    );

    const monitorCallback = async () => {
      // Check conditions to stop monitoring inside the callback
      if (
        !this._sessionMonitorInterval || // Monitor was stopped
        !this.isLoggedIn || // Logged out by other means
        this.selectedLoginOption !== "login" // Option changed
      ) {
        this.stopSessionMonitor();
        return;
      }
      const sessions = await this.fetchSessionListWithCacheBust();
      if (sessions === null) {
        console.warn(
          "Session monitor: could not fetch session list. Will retry."
        );
        return; // Keep monitor running, retry next interval
      }

      const currentUserStillActive = sessions.some(
        (s) =>
          s.id === this.activeSessionId &&
          s.username === this.loggedInUsername &&
          s.project === urlFetcher.projectName &&
          s.username && // Ensure username is not empty/null
          s.username.toLowerCase() !== "unauthenticated" &&
          s.username.trim() !== "" &&
          s.username !== "null"
      );

      if (!currentUserStillActive) {
        this.handleAutoLogout(); // This will also stop the monitor
      }
    };
    // Initial check soon after starting.
    setTimeout(monitorCallback, 100); // Short delay for initial check
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

    // Reset state
    this.isLoggedIn = false;
    this.loggedInUsername = null;
    this.activeSessionId = null;
    this.stopSessionMonitor(); // Ensure monitor is stopped
    this.stopSessionPolling(); // Ensure polling is stopped

    this.updateLoginStatus(
      "logged-out",
      `Session for ${previousUsername || "user"} expired or ended.`
    );
    // Update UI, ensuring no option is pre-checked
    this.updateLoginOptionsUI(null, false); // Reset text, hide logout
    if (this.optionLoginRadio) this.optionLoginRadio.checked = false;
    if (this.optionContinueGuestRadio)
      this.optionContinueGuestRadio.checked = false;
    this.selectedLoginOption = ""; // Clear selected option

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
        // Only update status if not already actively logged in or polling (to avoid overwriting specific messages)
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
          (
            s // Ensure basic session structure
          ) => typeof s.id !== "undefined" && typeof s.username !== "undefined"
        );
      }
      console.warn("fetchSessionList: Received data is not an array.", data);
      return []; // Return empty array if not array
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
    // Check if already in the desired state to prevent redundant updates/event emissions
    if (
      this.isLoggedIn &&
      this.loggedInUsername === username &&
      this.activeSessionId === sessionId
    ) {
      if (!this._sessionMonitorInterval) this.startSessionMonitor(); // Ensure monitor is running
      return; // Already completed for this session
    }

    // If previously logged in but with different details, stop old monitor
    if (
      this.isLoggedIn &&
      (this.loggedInUsername !== username || this.activeSessionId !== sessionId)
    ) {
      this.stopSessionMonitor(); // Stop monitor for old session
    }

    this.isLoggedIn = true;
    this.loggedInUsername = username || "Authenticated User"; // Fallback name
    this.activeSessionId = sessionId;
    this.selectedLoginOption = "login"; // Explicitly set this as login is complete
    console.log(
      `Login successful. User: '${this.loggedInUsername}', Session ID: ${this.activeSessionId}`
    );

    this.updateLoginStatus(
      "logged-in",
      `Logged in as ${this.loggedInUsername}.`
    );
    // Update UI, and pre-check the "login" radio to reflect the now active session state
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

    this.startSessionMonitor(); // Start monitoring the new active session

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

    // Immediately update UI to reflect logged-out state
    this.isLoggedIn = false;
    this.loggedInUsername = null;
    this.activeSessionId = null;
    this.stopSessionMonitor();
    this.stopSessionPolling();
    if (this.loginTab && !this.loginTab.closed) {
      // If a login tab was open, it's no longer relevant
      this.loginTab = null;
    }

    this.updateLoginOptionsUI(null, false); // Reset text, hide logout button
    // Explicitly uncheck radio buttons
    if (this.optionLoginRadio) this.optionLoginRadio.checked = false;
    if (this.optionContinueGuestRadio)
      this.optionContinueGuestRadio.checked = false;
    this.selectedLoginOption = ""; // Clear selected option

    this.updateLoginStatus(
      "logged-out",
      `Logged out ${previousUsername || "user"}. Select an option.`
    );

    events.emit(events.events.USER_LOGGED_OUT, {
      username: previousUsername,
      sessionId: previousSessionId,
    });

    // Construct the custom logout URL
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
      toolWebdevProject = toolUrlMatch[2]; // This should be 'PerspectiveCapture' or your tool's project
    } catch (e) {
      console.error(
        "Error constructing custom logout URL base:",
        e.message,
        "Falling back to generic logout."
      );
      // Fallback to generic Perspective logout if custom URL construction fails
      window.open(
        `${
          urlFetcher.baseClientUrl // Use the target project's base URL for generic logout
            ? new URL(urlFetcher.baseClientUrl).origin
            : window.location.origin // Fallback to current origin if baseClientUrl not set
        }/data/perspective/logout`,
        "_blank"
      );
      return;
    }

    // Use the tool's own project context for the custom logout endpoint
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
      // If no sessionId, open the generic Perspective logout page as a fallback
      // or your custom one if it can handle logout without a session ID (e.g. global logout)
      window.open(`${gatewayOrigin}/data/perspective/logout`, "_blank");
    }
  }

  hideLoginFrame() {
    // This method was for an iframe-based login, which is no longer the primary approach.
    // Kept for potential future use or if parts of the UI still reference it.
    // console.log("hideLoginFrame called (no-op for new tab login).");
  }

  updateLoginStatus(status, text) {
    const statusElement = document.getElementById("loginStatus");
    if (!statusElement) {
      console.warn("#loginStatus element not found for updating text:", text);
      return;
    }
    statusElement.className = `login-status ${status}`; // Apply class for styling
    const icon = statusElement.querySelector(".login-status-icon");
    if (icon)
      icon.textContent =
        status === "logged-in" ? "✅" : status === "checking" ? "⏳" : "⚪";
    const lbl = statusElement.querySelector(".login-status-text");
    if (lbl) lbl.textContent = text;

    // Manage visibility of the #loginSection (used for "Waiting for login tab..." messages)
    const loginMessageSection = document.getElementById("loginSection");
    if (loginMessageSection) {
      if (
        status === "checking" &&
        (text.toLowerCase().includes("new tab") ||
          text.toLowerCase().includes("opening login tab"))
      ) {
        loginMessageSection.innerHTML = `<p class="login-process-message">${text.replace(
          "... This page will update automatically when you return.", // Remove redundant part
          "..."
        )}</p>`;
        loginMessageSection.style.display = "block";
      } else if (
        status === "logged-in" || // Login complete
        (status === "logged-out" && // Logged out AND
          !(
            this.selectedLoginOption === "login" &&
            (this._pollInterval || this.loginTab)
          )) // not actively in a new tab login process
      ) {
        // Hide message section if login is complete, or if logged out and not waiting for a tab.
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
