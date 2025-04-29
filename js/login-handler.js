import UI from "./ui/index.js";
import * as events from "./events.js";
import { handleError } from "./errors.js";

/**
 * VisualLoginHandler - Handles iframe-based login and accurate status updates
 */
class VisualLoginHandler {
  constructor() {
    this.loginUrl = "";
    this.isLoggedIn = false;
    this.loginStatusElement = null;
    this.loginFrame = null;
    this.loginFrameContainer = null;
    this.loginSection = null; // Added reference to the login section div
    // Map of sessionId -> username snapshot before login
    this.initialSessions = new Map();
    this._pollInterval = null;
    this.selectedLoginOption = 'continueWithoutLogin'; // Default option
  }

  /**
   * Initialize UI and login logic
   */
  initialize(options = {}) {
    // Determine login URL (override if provided)
    this.loginUrl = options.loginUrl || this.determineLoginUrl();

    // Build and insert UI
    this.addLoginUI();

    // Find radio buttons and set up listeners
    const optionContinueWithoutLogin = document.getElementById('optionContinueWithoutLogin');
    const optionLogin = document.getElementById('optionLogin');
    if (optionContinueWithoutLogin) {
        optionContinueWithoutLogin.addEventListener('change', () => this.handleLoginOptionChange('continueWithoutLogin'));
    }
    if (optionLogin) {
        optionLogin.addEventListener('change', () => this.handleLoginOptionChange('login'));
    }

    // Initialize visibility based on default selected option
    this.toggleLoginSectionVisibility('continueWithoutLogin');

    console.log("VisualLoginHandler initialized; login URL:", this.loginUrl);
  }

  /**
   * Determine default login URL
   */
  determineLoginUrl() {
    try {
      const { protocol, host, href } = window.location;
      const m = href.match(/\/system\/webdev\/([^\/]+)/);
      const project = m ? m[1] : 'RF_Main_STG'; // Default project if not found
      // Assuming standard Perspective login page structure
      return `${protocol}//${host}/data/perspective/login/${project}/Admin?forceAuth=true`;
    } catch (e) {
      console.warn('determineLoginUrl failed:', e);
      return 'http://localhost:8088/data/perspective/login/RF_Main_STG/Admin?forceAuth=true'; // Fallback URL
    }
  }

  /**
   * Build and insert login section
   */
  addLoginUI() {
    // Assume #loginSection already exists in index.html
    this.loginSection = document.getElementById("loginSection");
    if (!this.loginSection) {
      console.error("#loginSection not found in HTML");
      return;
    }

    // Populate the login section with content
    this.loginSection.innerHTML = `
      <div class="login-header">
        <h2>Authentication</h2>
        <div id="loginStatus" class="login-status logged-out">
          <span class="login-status-icon">⚪</span>
          <span class="login-status-text">Not authenticated</span>
        </div>
      </div>
      <div id="loginFrameContainer" class="login-frame-container">
        <iframe id="loginFrame" class="login-frame" src="about:blank"></iframe>
      </div>
    `;

    this.loginStatusElement = document.getElementById("loginStatus");
    this.loginFrame = document.getElementById("loginFrame");
    this.loginFrameContainer = document.getElementById("loginFrameContainer");

    // Reset status
    this.updateLoginStatus('logged-out', 'Not authenticated');

    // Styles for the login section itself are already in styles.css now.
    // We might still need specific styles for the iframe and status.
    this.addLoginStyles();

    // Note: prepareFrameLogin is NOT called here anymore. It's called when 'Login' is selected.
  }

  /**
   * Inject CSS for the login UI (only iframe and status specific styles)
   */
  addLoginStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .login-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
      .login-header h2 { margin:0; font-size:1.3em; }
      .login-status { display:flex; align-items:center; padding:3px 10px; border:1px solid #e2e8f0; border-radius:4px; font-size:13px; transition:all .3s; }
      .login-status.logged-out { background:#f8d7da; border-color:#f5c6cb; }
      .login-status.checking  { background:#fff3cd; border-color:#ffeeba; }
      .login-status.logged-in { background:#d4edda; border-color:#c3e6cb; }
      .login-status-icon { margin-right:5px; font-size:12px; }
      .login-frame-container { margin:10px 0; border:1px solid #ddd; border-radius:4px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
      .login-frame { width:100%; height:350px; border:none; }
      /* Add a hidden class for the iframe container */
      .login-frame-container.hidden { display: none; }
    `;
    document.head.appendChild(style);
  }


  /**
   * Handle change in login option radio buttons
   * @param {string} option - 'continueWithoutLogin' or 'login'
   */
  handleLoginOptionChange(option) {
      this.selectedLoginOption = option;
      this.toggleLoginSectionVisibility(option);

      // Emit an event so app.js knows which option was selected
      events.emit('LOGIN_OPTION_SELECTED', { option: this.selectedLoginOption });
  }

  /**
   * Show or hide the login section (card with iframe/status)
   * @param {string} option - 'continueWithoutLogin' or 'login'
   */
  toggleLoginSectionVisibility(option) {
      if (!this.loginSection) return;

      if (option === 'login') {
          this.loginSection.style.display = 'block';
          // Only prepare frame login if not already logged in
          if (!this.isLoggedIn) {
              this.prepareFrameLogin();
          } else {
               // If already logged in and option is 'login', ensure iframe is hidden
               this.hideLoginFrame();
          }
      } else {
          this.loginSection.style.display = 'none';
          // Stop polling and hide iframe if choosing not to log in
          this.stopSessionPolling();
          this.hideLoginFrame();
      }
  }

  /**
   * Snapshot sessions, show iframe, and start polling for login
   * Called when the 'Login' option is selected.
   */
  async prepareFrameLogin() {
    // Clear previous state
    this.isLoggedIn = false;
    this.initialSessions.clear();
    this.stopSessionPolling(); // Ensure no previous polling is active

    // Snapshot current sessions before loading login page
    const sessions = await this.fetchSessionList();
    sessions.forEach(s => this.initialSessions.set(s.id, s.username));
     console.log("Initial sessions snapshot:", this.initialSessions);


    // Display iframe container
    if (this.loginFrameContainer) this.loginFrameContainer.classList.remove('hidden'); // Show iframe

    // Load login URL if not already loaded or is about:blank
    if (!this.loginFrame.src || this.loginFrame.src === 'about:blank' || this.loginFrame.src !== this.loginUrl) {
         console.log(`Loading login URL in iframe: ${this.loginUrl}`);
         this.loginFrame.src = this.loginUrl;
         // Add listener for load to start polling
         this.loginFrame.removeEventListener('load', this._frameLoadHandler); // Remove previous if any
         this._frameLoadHandler = () => { // Store handler to remove it later
             console.log("Login iframe loaded, starting session polling.");
             this.startSessionPolling();
             this.loginFrame.removeEventListener('load', this._frameLoadHandler); // Remove after first load
         };
         this.loginFrame.addEventListener('load', this._frameLoadHandler);
    } else {
        // If login page is already loaded, just start polling
        console.log("Login iframe already loaded, starting session polling.");
        this.startSessionPolling();
    }


  }

  /**
   * Poll the session endpoint until a real login appears
   */
  startSessionPolling() {
    if (this._pollInterval) {
        console.log("Polling already active.");
        return; // Don't start if already polling
    }
    this.updateLoginStatus('checking', 'Waiting for authentication…');
    console.log("Starting session polling...");

    this._pollInterval = setInterval(async () => {
      console.log("Polling...");
      const sessions = await this.fetchSessionList();
      // Filter for either a new session or an existing session whose username changed
      const valid = sessions.filter(s => {
        const initial = this.initialSessions.get(s.id);
        const isNew = !this.initialSessions.has(s.id);
        // Consider any username other than 'unauthenticated' as potentially valid
        const usernameValid = s.username && s.username.toLowerCase() !== 'unauthenticated' && s.username !== 'null'; // Also check for 'null' string
        // Check if an existing session's username changed AND is now valid
        const changedAndValid = initial !== undefined && usernameValid && s.username !== initial;
         // Log individual session check for debugging
        // console.log(`Session ID: ${s.id}, Username: ${s.username}, Initial Username: ${initial}, IsNew: ${isNew}, UsernameValid: ${usernameValid}, ChangedAndValid: ${changedAndValid}`);
        return (isNew && usernameValid) || changedAndValid;
      });

      if (valid.length > 0) {
        console.log("Valid session found, stopping polling.");
        this.stopSessionPolling();
        // Find the latest valid session based on uptime (or simply the first one found)
        const latest = valid.reduce((a, b) => b.uptimeMs > a.uptimeMs ? b : a, valid[0]); // Use reduce for simplicity
        this.completeLogin(latest.username);
      } else {
           console.log("No valid session found yet.");
      }
    }, 3000); // Poll every 3 seconds
  }

    /**
     * Stop the session polling
     */
    stopSessionPolling() {
        if (this._pollInterval) {
            console.log("Stopping session polling.");
            clearInterval(this._pollInterval);
            this._pollInterval = null;
        }
    }


  /**
   * Fetch all sessions from the backend
   */
  async fetchSessionList() {

    // Construct the endpoint URL based on the current page URL
    const currentUrl = window.location.href;
    const regex = /http(s)?:\/\/([^\/]+)\/system\/webdev\/([^\/]+)/; // Matches http(s)://host/system/webdev/ProjectName
    const match = currentUrl.match(regex);

    let fetchUrl = '';
    if (match && match[1] && match[2] && match[3]) {
        const protocol = match[1] ? 'https' : 'http';
        const host = match[2];
        const projectName = match[3]; // This is the WebDev project name
        // Construct the session info endpoint URL - assuming 'PerspectiveCapture' WebDev resource
        fetchUrl = `${protocol}://${host}/system/webdev/${projectName}/PerspectiveCapture/getSessionInfo`;
        //console.log("Constructed fetchSessionList URL:", fetchUrl); // Debugging
    } else {
        console.warn("Could not construct fetchSessionList URL from current page URL. Using fallback.");
        // Fallback URL if current URL pattern doesn't match
        fetchUrl = '/system/webdev/RF_Main_STG/PerspectiveCapture/getSessionInfo'; // Assuming a default structure
    }


    try {
      // Use 'include' credentials to send cookies
      const res = await fetch(fetchUrl, { credentials: 'include' });
      if (!res.ok) {
          console.error(`WorkspaceSessionList failed: HTTP Status ${res.status}`, await res.text());
          throw new Error(`Failed to fetch sessions: Status ${res.status}`);
      }
      const data = await res.json();
      // console.log("fetchSessionList data:", data); // Debugging received data
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('fetchSessionList error:', e);
       // Update status if fetching fails repeatedly (after a few attempts)
        if (!this.loginStatusElement.classList.contains('logged-in')) {
             this.updateLoginStatus('logged-out', 'Error fetching sessions');
        }
      // Re-throw error to potentially stop polling or indicate failure in caller
      // throw e;
      return []; // Return empty array on error to prevent crashing
    }
  }

  /**
   * Finalize login: update UI and emit event
   * @param {string} username - The logged-in username
   */
  completeLogin(username) {
    if (this.isLoggedIn) return; // Prevent duplicate completion
    this.isLoggedIn = true;
    console.log(`Login successful as ${username}`);
    this.updateLoginStatus('logged-in', `Logged in as ${username}`);
    events.emit('LOGIN_SUCCESSFUL', { username });
    this.hideLoginFrame();

    // Emit an event to app.js to indicate that login is complete and UI can proceed
     events.emit('LOGIN_COMPLETE', { loggedIn: true, username: username });
  }

   /**
     * Indicate login failure (e.g. if polling stops without success, or initial check fails)
     * This might be called if fetchSessionList repeatedly fails, or if the user closes the login iframe
     * or if we detect 'unauthenticated' after initial polling.
     * For now, simple visual indicator. More robust failure detection needed.
     */
    indicateLoginFailed() {
        this.isLoggedIn = false;
        console.warn("Login process indicated as failed.");
        this.updateLoginStatus('logged-out', 'Authentication failed or skipped');
        this.hideLoginFrame();
        this.stopSessionPolling();

        // Emit an event to app.js to indicate that login failed/skipped and UI can proceed
        // This assumes 'continueWithoutLogin' is treated similarly to a failed login for UI flow purposes.
        events.emit('LOGIN_COMPLETE', { loggedIn: false });
    }


  /**
   * Hide the login iframe container
   */
  hideLoginFrame() {
    if (this.loginFrameContainer) {
        this.loginFrameContainer.classList.add('hidden'); // Use hidden class
        this.loginFrame.src = 'about:blank'; // Clear iframe content
    }
  }

  /**
   * Update the status bubble icon and text
   * @param {string} status - 'logged-in', 'logged-out', 'checking'
   * @param {string} text - Status message
   */
  updateLoginStatus(status, text) {
    if (!this.loginStatusElement) return;
    ['logged-in','logged-out','checking'].forEach(c => this.loginStatusElement.classList.remove(c));
    this.loginStatusElement.classList.add(status);

    const icon = this.loginStatusElement.querySelector('.login-status-icon');
    if (icon) icon.textContent = status === 'logged-in' ? '✅' : status === 'checking' ? '⏳' : '⚪';

    const lbl = this.loginStatusElement.querySelector('.login-status-text');
    if (lbl) lbl.textContent = text;
  }

    /**
     * Get the currently selected login option
     * @returns {string} 'continueWithoutLogin' or 'login'
     */
    getSelectedLoginOption() {
        return this.selectedLoginOption;
    }

    /**
     * Check if the user is considered authenticated for the purpose of capturing.
     * This is true if 'continueWithoutLogin' is selected OR if login was successful.
     * @returns {boolean}
     */
    isAuthenticatedForCapture() {
        return this.selectedLoginOption === 'continueWithoutLogin' || this.isLoggedIn;
    }


  getLoginStatus() { return this.isLoggedIn; } // is logged in via iframe
  getLoginUrl()    { return this.loginUrl;  }
  setLoginUrl(u)   { if (u) this.loginUrl = u.trim(); }
}

export default new VisualLoginHandler();