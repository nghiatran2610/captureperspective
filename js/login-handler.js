// js/login-handler.js
import UI from "./ui/index.js";
import * as events from "./events.js";
import urlFetcher from "./url-fetcher.js";

class VisualLoginHandler {
  constructor() {
    this.loginUrl = "";
    this.isLoggedIn = false;
    this.loginSection = null;
    this.loginFrame = null;
    this.loginFrameContainer = null;
    this.initialSessions = new Map();
    this._pollInterval = null; // For initial login detection
    this._sessionMonitorInterval = null; // For continuous polling AFTER login
    this.monitorPollIntervalTime = 15000; // Check active session every 15 seconds
    this.selectedLoginOption = "login"; // Default to login
    this._frameLoadHandler = null;
    this.loggedInUsername = null;
  }

  initialize(options = {}) {
    this.addLoginUI();

    const optionContinueWithoutLogin = document.getElementById(
      "optionContinueWithoutLogin"
    );
    const optionLogin = document.getElementById("optionLogin");
    if (optionContinueWithoutLogin) {
      events.addDOMEventListener(optionContinueWithoutLogin, "change", () => {
        events.emit("LOGIN_OPTION_SELECTED", {
          option: "continueWithoutLogin",
        });
      });
    }
    if (optionLogin) {
      events.addDOMEventListener(optionLogin, "change", () => {
        events.emit("LOGIN_OPTION_SELECTED", { option: "login" });
      });
    }
    console.log(
      "VisualLoginHandler initialized. Structure added. Waiting for option selection."
    );
  }

  determineLoginUrl() {
    if (!urlFetcher.baseClientUrl || !urlFetcher.projectName) {
      console.warn(
        "Cannot determine login URL: Base URL or target project name not set in urlFetcher."
      );
      this.updateLoginStatus(
        "logged-out",
        "Error: Project URL not set for login."
      );
      return null;
    }
    try {
      // urlFetcher.baseClientUrl is like http://localhost:8088/data/perspective/client/TARGET_PROJECT
      const urlObj = new URL(urlFetcher.baseClientUrl);

      // The loginViewName is an assumption. If your Perspective projects have a standard login
      // view (e.g., 'Login', 'AdminLogin', or just rely on the project's default login behavior),
      // adjust this path accordingly. Forcing authentication is usually done by IdP or project settings.
      const loginViewName = "Admin"; // IMPORTANT: Confirm this view name or login path strategy

      // Construct login URL targeting the specific project's login mechanism.
      const loginUrl = `${urlObj.origin}/data/perspective/login/${urlFetcher.projectName}/${loginViewName}?forceAuth=true`;

      console.log(
        "Determined login URL (for target project context):",
        loginUrl
      );
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
      console.error("#loginSection not found in HTML");
      return;
    }
    // Ensure existing content is cleared if any, or structure as needed
    this.loginSection.innerHTML = `
      <div class="login-header"><h2>Authentication</h2><div id="loginStatus" class="login-status logged-out"><span class="login-status-icon">⚪</span><span class="login-status-text">Not authenticated</span></div></div>
      <div id="loginFrameContainer" class="login-frame-container hidden"><iframe id="loginFrame" class="login-frame" src="about:blank" sandbox="allow-forms allow-scripts allow-same-origin allow-popups"></iframe></div>
    `;
    this.loginFrame = document.getElementById("loginFrame");
    this.loginFrameContainer = document.getElementById("loginFrameContainer");
    this.updateLoginStatus("logged-out", "Not authenticated"); // Initial status
    this.addLoginStyles(); // Call to add styles if they aren't in CSS file
  }

  addLoginStyles() {
    // This function might be redundant if all styles are in styles.css
    const styleId = "loginHandlerStyles";
    if (document.getElementById(styleId)) return; // Avoid duplicate styles

    const style = document.createElement("style");
    style.id = styleId;
    // style.textContent = `/* CSS for login handler UI if not in main styles.css */`;
    document.head.appendChild(style);
  }

  handleLoginOptionChange(option) {
    const previouslyLoggedIn = this.isLoggedIn;
    this.selectedLoginOption = option;
    this.toggleLoginSectionVisibility(option);

    this.stopSessionMonitor(); // Always stop continuous monitor when login option changes

    if (option === "login" && !previouslyLoggedIn) {
      console.log("Login option selected, preparing frame login...");
      this.prepareFrameLogin();
    } else if (option === "continueWithoutLogin") {
      console.log("Continue without login selected.");
      this.stopSessionPolling(); // Stop initial login poll if it was running
      this.hideLoginFrame();
      if (previouslyLoggedIn) {
        // If switching from a logged-in state
        console.log(
          "Resetting internal login state and clearing main screenshot iframe..."
        );
        this.isLoggedIn = false;
        this.loggedInUsername = null;
        try {
          const screenshotIframe = document.getElementById("screenshotIframe");
          if (screenshotIframe && screenshotIframe.src !== "about:blank") {
            screenshotIframe.src = "about:blank"; // Clear Perspective session in main iframe
          }
        } catch (e) {
          console.error("Error clearing #screenshotIframe:", e);
        }
      }
      this.updateLoginStatus("logged-out", "Continuing without login");
    } else if (option === "login" && previouslyLoggedIn) {
      console.log(
        "Login option selected, already logged in as " +
          this.loggedInUsername +
          ". Restarting session monitor."
      );
      this.hideLoginFrame(); // Keep frame hidden
      // Status is already 'logged-in', re-affirm it
      this.updateLoginStatus(
        "logged-in",
        `Logged in as ${this.loggedInUsername || "user"}`
      );
      this.startSessionMonitor(); // Restart monitor if login option is re-selected and user was logged in
    }
  }

  toggleLoginSectionVisibility(option) {
    if (!this.loginSection) return;
    if (option === "login") {
      this.loginSection.style.display = "block";
      // If already logged in, the login frame itself should remain hidden
      if (this.isLoggedIn && this.loginFrameContainer) {
        this.loginFrameContainer.classList.add("hidden");
      } else if (!this.isLoggedIn && this.loginFrameContainer) {
        // If 'login' is chosen and not yet logged in, prepareFrameLogin will handle showing the frame.
      }
    } else {
      // 'continueWithoutLogin'
      this.loginSection.style.display = "none";
    }
  }

  async prepareFrameLogin() {
    if (!urlFetcher.baseClientUrl || !urlFetcher.projectName) {
      console.error(
        "prepareFrameLogin: Base URL or target project name for login context is not set in urlFetcher."
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
      // determineLoginUrl should have already set an error status.
      this.hideLoginFrame();
      return;
    }

    this.isLoggedIn = false; // Reset login state for a new attempt
    this.loggedInUsername = null;
    this.initialSessions.clear();
    this.stopSessionPolling(); // Stop any existing initial login polling
    this.stopSessionMonitor(); // Stop any existing continuous session monitoring

    this.updateLoginStatus("checking", "Preparing login process...");

    try {
      const sessions = await this.fetchSessionList(); // fetchSessionList now includes targetProjectName
      if (sessions === null) {
        // fetchSessionList would have updated the status to an error.
        this.hideLoginFrame();
        return;
      }
      sessions.forEach((s) => this.initialSessions.set(s.id, s.username));
      console.log(
        "Initial sessions snapshot taken:",
        this.initialSessions.size > 0
          ? JSON.stringify(Array.from(this.initialSessions.entries()))
          : "No initial sessions found."
      );
    } catch (error) {
      // Should be caught by fetchSessionList, but as a fallback
      console.error(
        "prepareFrameLogin: Exception fetching initial session list:",
        error
      );
      this.updateLoginStatus("logged-out", "Error checking auth status.");
      this.hideLoginFrame();
      return;
    }

    // Proceed to show and load iframe
    if (this.loginFrameContainer)
      this.loginFrameContainer.classList.remove("hidden");

    if (this.loginFrame) {
      if (this.loginFrame.src !== this.loginUrl) {
        // Load only if different or blank
        console.log(`Loading login URL in iframe: ${this.loginUrl}`);
        this.loginFrame.src = this.loginUrl;
      } else {
        console.log(
          "Login iframe already has the correct URL. Will reload to ensure fresh state."
        );
        try {
          this.loginFrame.contentWindow.location.reload();
        } catch (e) {
          console.warn(
            "Could not reload login iframe, might be cross-origin before login. Setting src again.",
            e
          );
          this.loginFrame.src = this.loginUrl; // Fallback to re-setting src
        }
      }
      // Always (re)attach load listener for starting polling
      if (this._frameLoadHandler) {
        this.loginFrame.removeEventListener("load", this._frameLoadHandler);
      }
      this._frameLoadHandler = () => {
        console.log(
          "Login iframe LOADED (src='" +
            this.loginFrame.src +
            "'), starting session polling for initial login."
        );
        this.updateLoginStatus(
          "checking",
          "Waiting..."
        );
        this.startSessionPolling(); // Start polling for INITIAL login
      };
      this.loginFrame.addEventListener("load", this._frameLoadHandler, {
        once: true,
      });
    } else {
      console.error("Login iframe element not found in prepareFrameLogin.");
      this.updateLoginStatus("logged-out", "UI Error: Login frame missing.");
    }
  }

  startSessionPolling() {
    // For INITIAL login detection
    if (this._pollInterval) {
      // console.log("Session polling (initial) already active.");
      return;
    }
    // Only update status if not already in a "checking" or "logged-in" state from monitor,
    // and if we are not already logged in.
    if (!this.isLoggedIn) {
      const statusElement = document.getElementById("loginStatus");
      if (
        !statusElement ||
        (!statusElement.classList.contains("checking") &&
          !statusElement.classList.contains("logged-in"))
      ) {
        this.updateLoginStatus("checking", "Waiting for authentication…");
      }
    }
    console.log("Starting session polling (for initial login)...");

    const pollCallback = async () => {
      if (!this._pollInterval) return; // Polling was stopped

      const currentOption = this.getSelectedLoginOption();
      if (currentOption !== "login" || this.isLoggedIn) {
        // Stop if option changes or already logged in
        // console.log("Initial Poll: Option changed or already logged in, stopping.");
        this.stopSessionPolling();
        return;
      }

      const sessions = await this.fetchSessionList();
      if (!this._pollInterval) return; // Polling stopped during fetch

      if (sessions === null) {
        // console.warn("Initial Poll: failed to fetch sessions, will retry.");
        return;
      }

      let loggedInSession = null;
      for (const session of sessions) {
        const currentUsername = session.username;
        const isValidUsername =
          currentUsername &&
          currentUsername.toLowerCase() !== "unauthenticated" &&
          currentUsername !== "null" &&
          currentUsername.trim() !== "";
        if (isValidUsername) {
          // More robust check: is this a *new* session not in initialSessions, or a known one that's now authenticated?
          // For simplicity, first valid username is taken as login.
          console.log(
            `Initial Poll: Found session with VALID username: ID=${session.id}, User=${currentUsername}`
          );
          loggedInSession = session;
          break;
        }
      }

      if (loggedInSession) {
        console.log(
          `Initial Poll: Valid authenticated session found (User: ${loggedInSession.username}). Stopping initial poll.`
        );
        this.stopSessionPolling(); // Stop this poll first
        if (!this.isLoggedIn) {
          // Prevent multiple calls if already processed
          this.completeLogin(loggedInSession.username);
        }
      } else {
        // console.log("Initial Poll: No new authenticated session detected yet.");
      }
    };
    this._pollInterval = setInterval(pollCallback, 3000); // Poll every 3 seconds for initial login
  }

  stopSessionPolling() {
    // For INITIAL login detection
    if (this._pollInterval) {
      console.log("Stopping session polling (for initial login).");
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  startSessionMonitor() {
    // For CONTINUOUS monitoring AFTER login
    if (this._sessionMonitorInterval) {
      // console.log("Session monitor already active.");
      return;
    }
    if (!this.isLoggedIn || this.selectedLoginOption !== "login") {
      // console.log("Not starting session monitor: not logged in or login option not selected.");
      return;
    }

    console.log(
      `Starting session monitor for user: ${this.loggedInUsername} (Interval: ${this.monitorPollIntervalTime}ms)`
    );
    this.updateLoginStatus(
      "logged-in",
      `Logged in as ${this.loggedInUsername || "user"}`
    ); // Re-affirm status

    const monitorCallback = async () => {
      if (
        !this._sessionMonitorInterval ||
        !this.isLoggedIn ||
        this.selectedLoginOption !== "login"
      ) {
        // console.log("Session Monitor: Conditions no longer met (e.g., logged out, option changed), stopping monitor.");
        this.stopSessionMonitor();
        return;
      }

      const sessions = await this.fetchSessionList();

      if (!this._sessionMonitorInterval) return; // Check again if stopped during async operation

      if (sessions === null) {
        console.warn(
          "Session Monitor: Failed to fetch sessions. This might indicate a network issue or actual logout."
        );
        // Potentially add a counter for consecutive failures before triggering logout
        return;
      }

      let currentUserStillActive = false;
      if (this.loggedInUsername) {
        // Ensure we have a username to check against
        for (const session of sessions) {
          if (session.username === this.loggedInUsername) {
            // Also ensure this session itself is still considered valid (not 'unauthenticated')
            const isValidUsername =
              session.username &&
              session.username.toLowerCase() !== "unauthenticated" &&
              session.username !== "null" &&
              session.username.trim() !== "";
            if (isValidUsername) {
              currentUserStillActive = true;
              break;
            }
          }
        }
      } else {
        // This case means isLoggedIn is true, but loggedInUsername is somehow null. Treat as logged out.
        currentUserStillActive = false;
        console.warn(
          "Session Monitor: isLoggedIn is true, but loggedInUsername is null. Treating as logged out."
        );
      }

      if (!currentUserStillActive) {
        console.log(
          `Session Monitor: User ${
            this.loggedInUsername || "(unknown)"
          } no longer has an active/valid session. Handling auto-logout.`
        );
        this.handleAutoLogout();
      } else {
        // console.log(`Session Monitor: User ${this.loggedInUsername} session still active.`);
      }
    };
    // Perform an immediate check slightly delayed to allow call stack to clear, then set interval
    setTimeout(monitorCallback, 100);
    this._sessionMonitorInterval = setInterval(
      monitorCallback,
      this.monitorPollIntervalTime
    );
  }

  stopSessionMonitor() {
    // For CONTINUOUS monitoring AFTER login
    if (this._sessionMonitorInterval) {
      console.log("Stopping session monitor.");
      clearInterval(this._sessionMonitorInterval);
      this._sessionMonitorInterval = null;
    }
  }

  handleAutoLogout() {
    console.log("Auto-logout detected or session expired.");
    const previousUsername = this.loggedInUsername;

    this.isLoggedIn = false;
    this.loggedInUsername = null;

    this.stopSessionMonitor(); // Crucial: stop this monitor

    this.updateLoginStatus(
      "logged-out",
      `Session for ${previousUsername || "user"} expired. Please log in.`
    );
    events.emit("AUTO_LOGOUT_DETECTED", { username: previousUsername });

    // If login option is still 'login', re-prepare the login frame to allow re-login
    if (this.selectedLoginOption === "login") {
      console.log("Attempting to show login frame again after auto-logout.");
      // This will make the login iframe visible and load the loginUrl.
      // The iframe's 'load' event will then trigger 'startSessionPolling' for a new initial login.
      this.prepareFrameLogin();
    }
  }

  async fetchSessionList() {
    const currentToolUrl = window.location.href;
    // Regex to capture up to /system/webdev/ProjectName/
    const toolUrlRegex = /http(s)?:\/\/([^\/]+)\/system\/webdev\/([^\/]+)/;
    const toolUrlMatch = currentToolUrl.match(toolUrlRegex);

    if (!toolUrlMatch || !toolUrlMatch[3]) {
      console.error(
        "fetchSessionList: Could not extract tool's project context from its own URL:",
        currentToolUrl
      );
      // Only update status if this isn't part of the session monitor's silent check
      // or if the user isn't already marked as logged out.
      if (!this._sessionMonitorInterval && this.isLoggedIn) {
        this.updateLoginStatus("logged-out", "Error: Tool URL misconfig.");
      }
      return null;
    }
    const toolRunningUnderProject = toolUrlMatch[3]; // The project this tool itself is running under

    // Construct the path to the API endpoint within the tool's project context
    let fetchUrl = `/system/webdev/${toolRunningUnderProject}/PerspectiveCapture/getSessionInfo`;

    // Append target projectName (the project being screenshotted) as query parameter
    const targetProjectNameForQuery = urlFetcher.projectName;

    if (targetProjectNameForQuery && targetProjectNameForQuery.trim() !== "") {
      fetchUrl += `?projectName=${encodeURIComponent(
        targetProjectNameForQuery
      )}`;
    } else {
      // This might be okay if the backend can infer or doesn't strictly need the target project for listing its sessions.
      console.warn(
        "fetchSessionList: Target project name (for query param) is not available from urlFetcher. Proceeding without it."
      );
    }

    // console.log(`WorkspaceSessionList: Attempting to fetch from: ${fetchUrl}`);

    try {
      const res = await fetch(fetchUrl, { credentials: "include" }); // Crucial for sending session cookies
      if (!res.ok) {
        console.error(
          `WorkspaceSessionList: Failed to fetch session info from ${fetchUrl}. Status: ${res.status} ${res.statusText}`
        );
        let errorText = `Auth check error (${res.status})`;
        if (res.status === 404) errorText = "Auth service not found.";
        else if (res.status === 401 || res.status === 403)
          errorText = "Not authorized for auth service.";

        // Avoid excessive UI updates if the monitor is running and this is a transient issue.
        // Only update status to "logged-out" if it's an initial poll or user was thought to be logged in.
        if (
          (!this._sessionMonitorInterval && !this.isLoggedIn) ||
          (this.isLoggedIn && this._sessionMonitorInterval)
        ) {
          // If session monitor is active and fails, it will lead to handleAutoLogout if persistent.
          // If initial poll fails, it's a hard stop.
        }
        if (!this.isLoggedIn && !this._sessionMonitorInterval) {
          // Only show error if it's an initial polling attempt
          this.updateLoginStatus("logged-out", errorText);
        }
        return null; // Indicate failure to fetch
      }
      const data = await res.json();
      // console.log("fetchSessionList: Raw data received:", data);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(
        `WorkspaceSessionList: Network or other error fetching from ${fetchUrl}:`,
        e
      );
      if (!this.isLoggedIn && !this._sessionMonitorInterval) {
        // Only show error if it's an initial polling attempt
        this.updateLoginStatus("logged-out", "Auth check network error.");
      }
      return null; // Indicate failure
    }
  }

  completeLogin(username) {
    try {
      // If already logged in as the same user, ensure monitor is running and exit
      if (this.isLoggedIn && this.loggedInUsername === username) {
        // console.warn(`[completeLogin] Guard: Already logged in as ${username}. Ensuring session monitor is active.`);
        if (!this._sessionMonitorInterval) this.startSessionMonitor();
        return;
      }
      // If logged in as a different user, or changing state
      if (this.isLoggedIn && this.loggedInUsername !== username) {
        console.warn(
          `[completeLogin] Logged in as ${this.loggedInUsername}, but new login detected for ${username}. Updating user.`
        );
        this.stopSessionMonitor(); // Stop monitor for old user
      }

      this.isLoggedIn = true;
      const finalUsername = username || "Authenticated User"; // Fallback if username is empty
      this.loggedInUsername = finalUsername;
      console.log(`[completeLogin] Login successful. User: '${finalUsername}'`);

      this.updateLoginStatus("logged-in", `Logged in as ${finalUsername}`);
      this.hideLoginFrame(); // Hide the login iframe

      events.emit("LOGIN_SUCCESSFUL", { username: finalUsername });
      events.emit("LOGIN_COMPLETE", {
        loggedIn: true,
        username: finalUsername,
      });

      this.startSessionMonitor(); // START CONTINUOUS MONITORING
    } catch (error) {
      console.error("Error during completeLogin:", error);
      this.isLoggedIn = false;
      this.loggedInUsername = null;
      this.updateLoginStatus("logged-out", "Error finalizing login process");
      this.stopSessionMonitor(); // Ensure monitor is stopped on error
    }
  }

  indicateLoginFailed() {
    // Called if login iframe itself implies failure or timeout
    if (this.isLoggedIn) return; // Don't mark as failed if somehow already logged in.

    this.isLoggedIn = false;
    this.loggedInUsername = null;
    console.warn(
      "Login process explicitly indicated as failed or timed out by iframe interaction."
    );
    this.updateLoginStatus("logged-out", "Authentication failed or timed out");
    this.hideLoginFrame();
    this.stopSessionPolling(); // Crucial to stop initial polling on failure
    this.stopSessionMonitor(); // Also stop continuous monitor if it somehow started
    events.emit("LOGIN_COMPLETE", { loggedIn: false });
  }

  hideLoginFrame() {
    if (this.loginFrameContainer) {
      this.loginFrameContainer.classList.add("hidden");
      // Clear src only if login is truly complete or explicitly stopped
      // Avoid clearing if we are about to reload it for re-login
      if (
        (this.isLoggedIn ||
          this.selectedLoginOption === "continueWithoutLogin") &&
        this.loginFrame &&
        this.loginFrame.src !== "about:blank"
      ) {
        setTimeout(() => {
          if (this.loginFrame) {
            // Re-check if still exists
            try {
              this.loginFrame.src = "about:blank";
            } catch (e) {
              console.warn("Error setting loginFrame src to about:blank:", e);
            }
          }
        }, 150);
      }
    }
  }

  updateLoginStatus(status, text) {
    const statusElement = document.getElementById("loginStatus");
    if (!statusElement) {
      console.error(
        "Cannot update login status: #loginStatus element not found."
      );
      return;
    }

    statusElement.classList.remove("logged-in", "logged-out", "checking");
    statusElement.classList.add(status);

    const icon = statusElement.querySelector(".login-status-icon");
    if (icon) {
      icon.textContent =
        status === "logged-in" ? "✅" : status === "checking" ? "⏳" : "⚪";
    }

    const lbl = statusElement.querySelector(".login-status-text");
    if (lbl) {
      lbl.textContent = text;
    }
  }

  getSelectedLoginOption() {
    const checkedOption = document.querySelector(
      'input[name="loginOption"]:checked'
    );
    return checkedOption ? checkedOption.value : this.selectedLoginOption; // Fallback to stored option
  }

  isAuthenticatedForCapture() {
    const selectedOption = this.getSelectedLoginOption();
    if (selectedOption === "continueWithoutLogin") {
      return true; // Always "authenticated" for capture if guest mode is chosen
    }
    // If 'login' option selected, actual login status matters
    return selectedOption === "login" && this.isLoggedIn;
  }

  getLoginStatus() {
    return this.isLoggedIn;
  }
  getLoginUrl() {
    return this.loginUrl;
  }
}

export default new VisualLoginHandler();
