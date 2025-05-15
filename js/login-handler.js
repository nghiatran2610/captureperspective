// js/login-handler.js
import UI from "./ui/index.js";
import * as events from "./events.js";
import urlFetcher from "./url-fetcher.js";

class VisualLoginHandler {
  constructor() {
    this.loginUrl = "";
    this.isLoggedIn = false;
    this.loginSection = null; // For the iframe
    this.loginFrame = null;
    this.loginFrameContainer = null;
    this.initialSessions = new Map();
    this._pollInterval = null;
    this._sessionMonitorInterval = null;
    this.monitorPollIntervalTime = 15000;
    this.selectedLoginOption = "";
    this._frameLoadHandler = null;
    this.loggedInUsername = null;

    this.textForOptionLogin = null;
    this.logoutButton = null;
    this.optionLoginRadio = null;
    this.optionContinueGuestRadio = null;
  }

  initialize() {
    this.addLoginUI();
    this._setupLoginOptionElements();
    console.log("VisualLoginHandler initialized.");
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
            // Directly call handleLoginOptionChange AND emit LOGIN_OPTION_SELECTED
            // This simplifies app.js's direct handling of radio changes.
            this.handleLoginOptionChange("continueWithoutLogin");
            events.emit(events.events.LOGIN_OPTION_SELECTED, {
              option: "continueWithoutLogin",
              isLoggedIn: this.isLoggedIn, // Will be false
              username: this.loggedInUsername, // Will be null
            });
          }
        }
      );
    }
    if (this.optionLoginRadio) {
      events.addDOMEventListener(this.optionLoginRadio, "change", () => {
        if (this.optionLoginRadio.checked) {
          this.handleLoginOptionChange("login");
          events.emit(events.events.LOGIN_OPTION_SELECTED, {
            option: "login",
            isLoggedIn: this.isLoggedIn,
            username: this.loggedInUsername,
          });
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
    // ... (no changes from previous version)
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
    // ... (no changes from previous version)
    this.loginSection = document.getElementById("loginSection");
    if (!this.loginSection) {
      console.error("#loginSection not found in HTML");
      return;
    }
    this.loginSection.innerHTML = `
      <div class="login-header"><h2>Authentication</h2><div id="loginStatus" class="login-status logged-out"><span class="login-status-icon">⚪</span><span class="login-status-text">Not authenticated</span></div></div>
      <div id="loginFrameContainer" class="login-frame-container hidden"><iframe id="loginFrame" class="login-frame" src="about:blank" sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-modals"></iframe></div>
    `;
    this.loginFrame = document.getElementById("loginFrame");
    this.loginFrameContainer = document.getElementById("loginFrameContainer");
    this.updateLoginStatus("logged-out", "Not authenticated");
  }

  async checkInitialSessionAndSetupUI() {
    console.log("Performing initial session check...");
    if (!urlFetcher.baseClientUrl || !urlFetcher.projectName) {
      this.updateLoginOptionsUI(null, false); // Reset to default, ensure "login" radio is not checked
      this.isLoggedIn = false;
      this.loggedInUsername = null;
      this.selectedLoginOption = "";
      this.updateLoginStatus("logged-out", "Project not selected");
      this.stopSessionMonitor();
      this.stopSessionPolling();
      console.warn(
        "Initial session check skipped: Project URL or name missing."
      );
      return { isLoggedIn: false, username: null };
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
            `Initial check: Found active session for user ${currentUsername} in project ${session.project}`
          );
          break;
        }
      }
    }

    if (activeUserSession) {
      this.isLoggedIn = true;
      this.loggedInUsername = activeUserSession.username;
      this.selectedLoginOption = "login"; // Set this as if user selected it
      this.updateLoginOptionsUI(this.loggedInUsername, true); // true to pre-check "Continue as [User]"
      this.updateLoginStatus(
        "logged-in",
        `Logged in as ${this.loggedInUsername}`
      );
      this.hideLoginFrame();
      this.startSessionMonitor();
      // No need to emit LOGIN_COMPLETE here, app.js will react to the return value
      return { isLoggedIn: true, username: this.loggedInUsername };
    } else {
      this.isLoggedIn = false;
      this.loggedInUsername = null;
      this.selectedLoginOption = ""; // No option pre-selected by initial check
      this.updateLoginOptionsUI(null, false); // Reset to default, ensure "login" radio is not checked
      this.updateLoginStatus("logged-out", "Not authenticated");
      this.stopSessionMonitor();
      this.stopSessionPolling();
      this.hideLoginFrame();
      return { isLoggedIn: false, username: null };
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
      this.textForOptionLogin.textContent = "Continue with Authentication";
      this.logoutButton.style.display = "none";
      if (preCheckLoginOption === false) {
        // Explicitly false to uncheck
        this.optionLoginRadio.checked = false;
        this.optionContinueGuestRadio.checked = false; // Ensure guest is also unchecked initially
      }
    }
  }

  handleLoginOptionChange(option) {
    // This method is now primarily responsible for internal state update
    // and initiating login IF NEEDED. app.js handles showing/hiding captureForm.
    this.selectedLoginOption = option;
    this.stopSessionMonitor(); // Always stop monitor on option change, restart if needed

    if (option === "login") {
      if (this.isLoggedIn && this.loggedInUsername) {
        console.log(
          `Login option selected, already authenticated as ${this.loggedInUsername}.`
        );
        this.updateLoginStatus(
          "logged-in",
          `Logged in as ${this.loggedInUsername}`
        );
        this.hideLoginFrame();
        this.startSessionMonitor();
      } else {
        // User clicked "Continue with Authentication" and is NOT already logged in.
        console.log(
          "Login option selected, preparing frame for active login attempt..."
        );
        this.isLoggedIn = false; // Ensure state is clean before login attempt
        this.loggedInUsername = null;
        this.prepareFrameLogin(); // This will show the login iframe
      }
    } else if (option === "continueWithoutLogin") {
      console.log("Continue without login selected.");
      this.isLoggedIn = false;
      this.loggedInUsername = null;
      this.stopSessionPolling(); // Stop any active attempt to find a new session
      this.hideLoginFrame();
      this.updateLoginStatus("logged-out", "Continuing as Guest");
      try {
        const screenshotIframe = document.getElementById("screenshotIframe");
        if (screenshotIframe && screenshotIframe.src !== "about:blank") {
          screenshotIframe.src = "about:blank";
        }
      } catch (e) {
        console.error("Error clearing #screenshotIframe:", e);
      }
    }
  }

  async prepareFrameLogin() {
    // ... (no changes from previous version, but ensure this is called when user actively chooses to login via form)
    if (this.isLoggedIn) {
      console.log(
        "prepareFrameLogin called but already logged in. Aborting iframe load."
      );
      this.hideLoginFrame();
      this.startSessionMonitor();
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
      this.hideLoginFrame();
      return;
    }

    this.loginUrl = this.determineLoginUrl();
    if (!this.loginUrl) {
      this.hideLoginFrame();
      return;
    }

    this.initialSessions.clear();
    this.stopSessionPolling();
    this.stopSessionMonitor(); // Stop continuous monitor before attempting new login

    this.updateLoginStatus("checking", "Preparing login...");
    if (this.loginSection) this.loginSection.style.display = "block"; // Ensure login section with iframe is visible

    try {
      const sessions = await this.fetchSessionListWithCacheBust();
      if (sessions === null) {
        this.hideLoginFrame();
        return;
      }
      sessions.forEach((s) => this.initialSessions.set(s.id, s.username));
    } catch (error) {
      this.updateLoginStatus("logged-out", "Error checking auth status.");
      this.hideLoginFrame();
      return;
    }

    if (this.loginFrameContainer)
      this.loginFrameContainer.classList.remove("hidden");
    if (this.loginFrame) {
      console.log(`Loading login URL in iframe: ${this.loginUrl}`);
      this.loginFrame.src = this.loginUrl;

      if (this._frameLoadHandler) {
        this.loginFrame.removeEventListener("load", this._frameLoadHandler);
      }
      this._frameLoadHandler = () => {
        console.log(
          "Login iframe LOADED, starting session polling for initial login."
        );
        this.updateLoginStatus(
          "checking",
          "Please log in via the form above..."
        );
        this.startSessionPolling();
      };
      this.loginFrame.addEventListener("load", this._frameLoadHandler, {
        once: true,
      });
    } else {
      this.updateLoginStatus("logged-out", "UI Error: Login frame missing.");
    }
  }

  startSessionPolling() {
    // ... (no changes from previous version)
    if (this._pollInterval) return;
    if (this.isLoggedIn) {
      this.stopSessionPolling();
      return;
    }
    this.updateLoginStatus(
      "checking",
      "Waiting for authentication in login form..."
    );
    console.log("Starting session polling (for active login attempt)...");

    const pollCallback = async () => {
      if (
        !this._pollInterval ||
        this.isLoggedIn ||
        this.selectedLoginOption !== "login"
      ) {
        this.stopSessionPolling();
        return;
      }
      const sessions = await this.fetchSessionListWithCacheBust();
      if (!this._pollInterval || sessions === null) return;

      let loggedInSession = null;
      for (const session of sessions) {
        const currentUsername = session.username;
        const isValidUsername =
          currentUsername &&
          currentUsername.toLowerCase() !== "unauthenticated" &&
          currentUsername.trim() !== "" &&
          currentUsername !== "null";
        // Check if it's a NEW valid session for the current project
        if (
          isValidUsername &&
          session.project === urlFetcher.projectName &&
          !this.initialSessions.has(session.id)
        ) {
          loggedInSession = session;
          break;
        }
      }
      if (loggedInSession) {
        this.stopSessionPolling();
        this.completeLogin(loggedInSession.username); // This will emit LOGIN_COMPLETE
      }
    };
    this._pollInterval = setInterval(pollCallback, 3000);
  }

  stopSessionPolling() {
    // ... (no changes from previous version)
    if (this._pollInterval) {
      console.log("Stopping session polling (for active login attempt).");
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  startSessionMonitor() {
    // ... (no changes from previous version)
    if (this._sessionMonitorInterval) return;
    if (
      !this.isLoggedIn ||
      !this.loggedInUsername ||
      this.selectedLoginOption !== "login"
    ) {
      this.stopSessionMonitor();
      return;
    }
    console.log(`Starting session monitor for user: ${this.loggedInUsername}`);

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
        return;
      }

      const currentUserStillActive = sessions.some(
        (s) =>
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
    // ... (no changes from previous version)
    if (this._sessionMonitorInterval) {
      console.log("Stopping session monitor.");
      clearInterval(this._sessionMonitorInterval);
      this._sessionMonitorInterval = null;
    }
  }

  handleAutoLogout() {
    // ... (no changes from previous version, but ensure app.js reacts to AUTO_LOGOUT_DETECTED)
    console.log("Auto-logout detected or session expired.");
    const previousUsername = this.loggedInUsername;
    this.isLoggedIn = false;
    this.loggedInUsername = null;
    this.selectedLoginOption = ""; // Reset selected option
    this.stopSessionMonitor();

    this.updateLoginStatus(
      "logged-out",
      `Session for ${previousUsername || "user"} expired.`
    );
    this.updateLoginOptionsUI(null, false); // Reset to default login options, uncheck radios
    events.emit(events.events.AUTO_LOGOUT_DETECTED, {
      username: previousUsername,
    });
  }

  async fetchSessionListWithCacheBust() {
    // ... (no changes from previous version)
    let baseFetchUrl;
    try {
      const currentToolUrl = window.location.href;
      const toolUrlRegex = /http(s)?:\/\/([^\/]+)\/system\/webdev\/([^\/]+)/;
      const toolUrlMatch = currentToolUrl.match(toolUrlRegex);
      if (!toolUrlMatch || !toolUrlMatch[3])
        throw new Error("Could not extract tool's project context.");
      const toolRunningUnderProject = toolUrlMatch[3];
      baseFetchUrl = `/system/webdev/${toolRunningUnderProject}/PerspectiveCapture/getSessionInfo`;
    } catch (e) {
      console.error(
        "fetchSessionList: Error constructing base URL:",
        e.message
      );
      this.updateLoginStatus("logged-out", "Error: Tool URL misconfig.");
      return null;
    }

    let queryParams = [];
    const targetProject = urlFetcher.projectName;
    if (targetProject && targetProject.trim() !== "") {
      queryParams.push(`projectName=${encodeURIComponent(targetProject)}`);
    }
    queryParams.push(`_cb=${new Date().getTime()}`);

    const fetchUrl = `${baseFetchUrl}?${queryParams.join("&")}`;

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
        if (res.status === 404) errorText = "Auth service not found.";
        else if (res.status === 401 || res.status === 403)
          errorText = "Not authorized for auth service.";
        console.error(
          `WorkspaceSessionList: Failed response ${res.status} from ${fetchUrl}.`
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
      return Array.isArray(data) ? data : [];
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

  completeLogin(username) {
    // ... (no changes from previous version, ensure LOGIN_COMPLETE is emitted)
    if (this.isLoggedIn && this.loggedInUsername === username) {
      if (!this._sessionMonitorInterval) this.startSessionMonitor();
      return;
    }
    if (this.isLoggedIn && this.loggedInUsername !== username) {
      this.stopSessionMonitor();
    }

    this.isLoggedIn = true;
    this.loggedInUsername = username || "Authenticated User";
    this.selectedLoginOption = "login"; // Mark that login path was taken
    console.log(`Login successful. User: '${this.loggedInUsername}'`);

    this.updateLoginStatus(
      "logged-in",
      `Logged in as ${this.loggedInUsername}`
    );
    this.updateLoginOptionsUI(this.loggedInUsername, true); // Ensure UI reflects this state and radio is checked
    this.hideLoginFrame();
    this.startSessionMonitor();

    events.emit(events.events.LOGIN_COMPLETE, {
      loggedIn: true,
      username: this.loggedInUsername,
    });
  }

  performLogout() {
    // ... (no changes from previous version, ensure USER_LOGGED_OUT is emitted)
    console.log("Performing logout...");
    const previousUsername = this.loggedInUsername;
    this.stopSessionMonitor();
    this.stopSessionPolling();
    this.isLoggedIn = false;
    this.loggedInUsername = null;
    this.selectedLoginOption = "";

    let logoutUrl = "/data/perspective/logout";
    if (urlFetcher.baseClientUrl) {
      try {
        const urlObj = new URL(urlFetcher.baseClientUrl);
        logoutUrl = `${urlObj.origin}/data/perspective/logout`;
      } catch (e) {
        console.warn(
          "Could not construct origin-based logout URL, using default. Error:",
          e
        );
      }
    }
    console.log(`Attempting to open logout URL: ${logoutUrl}`);
    window.open(logoutUrl, "_blank");

    this.updateLoginOptionsUI(null, false); // Reset UI to default "Continue with Authentication" etc., uncheck radios
    this.updateLoginStatus(
      "logged-out",
      `Logged out ${previousUsername || "user"}. Select an option.`
    );

    if (this.optionLoginRadio) this.optionLoginRadio.checked = false;
    if (this.optionContinueGuestRadio)
      this.optionContinueGuestRadio.checked = false;

    events.emit(events.events.USER_LOGGED_OUT, { username: previousUsername });
  }

  hideLoginFrame() {
    // ... (no changes from previous version)
    if (this.loginFrameContainer) {
      this.loginFrameContainer.classList.add("hidden");
      if (this.loginFrame && this.loginFrame.src !== "about:blank") {
        setTimeout(() => {
          if (this.loginFrame) {
            try {
              this.loginFrame.src = "about:blank";
            } catch (e) {
              console.warn(
                "Error setting loginFrame src to about:blank after hiding:",
                e
              );
            }
          }
        }, 300);
      }
    }
  }

  updateLoginStatus(status, text) {
    // ... (no changes from previous version)
    const statusElement = document.getElementById("loginStatus");
    if (!statusElement) return;
    statusElement.className = `login-status ${status}`;
    const icon = statusElement.querySelector(".login-status-icon");
    if (icon)
      icon.textContent =
        status === "logged-in" ? "✅" : status === "checking" ? "⏳" : "⚪";
    const lbl = statusElement.querySelector(".login-status-text");
    if (lbl) lbl.textContent = text;
  }

  getLoginStatus() {
    return this.isLoggedIn;
  }
  getLoggedInUsername() {
    return this.loggedInUsername;
  }
  getSelectedLoginOption() {
    return this.selectedLoginOption;
  } // Add this getter
}

export default new VisualLoginHandler();
