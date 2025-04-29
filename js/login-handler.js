// js/login-handler.js
import UI from "./ui/index.js";
import * as events from "./events.js";
import { handleError } from "./errors.js";
import urlFetcher from "./url-fetcher.js"; // Import urlFetcher

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
    this._frameLoadHandler = null; // Store load handler reference
  }

  /**
   * Initialize UI and login logic
   */
  initialize(options = {}) {
    // Determine login URL (override if provided)
    // Login URL determination now depends on Base URL being set first by app.js
    // this.loginUrl = options.loginUrl || this.determineLoginUrl(); // Defer this

    // Build and insert UI structure (iframe, status)
    this.addLoginUI();

    // Find radio buttons and set up listeners (moved FROM app.js)
    const optionContinueWithoutLogin = document.getElementById('optionContinueWithoutLogin');
    const optionLogin = document.getElementById('optionLogin');
    if (optionContinueWithoutLogin) {
        // Disable initially until base URL is valid
        optionContinueWithoutLogin.disabled = true;
        events.addDOMEventListener(optionContinueWithoutLogin,'change', () => {
             events.emit('LOGIN_OPTION_SELECTED', { option: 'continueWithoutLogin' });
        });
    }
    if (optionLogin) {
        // Disable initially until base URL is valid
        optionLogin.disabled = true;
         events.addDOMEventListener(optionLogin,'change', () => {
             events.emit('LOGIN_OPTION_SELECTED', { option: 'login' });
        });
    }

    // Initial visibility is handled by app.js based on Base URL validation

    console.log("VisualLoginHandler initialized. Waiting for option selection.");
  }

  /**
   * Determine default login URL based on the validated base URL
   * This should be called *after* urlFetcher.setBaseClientUrl is successful.
   */
  determineLoginUrl() {
    if (!urlFetcher.baseClientUrl || !urlFetcher.projectName) {
        console.warn("Cannot determine login URL: Base URL or project name not set.");
        // Provide a generic placeholder or return null
        return null; // Or a default fallback if absolutely necessary
    }
    try {
      const urlObj = new URL(urlFetcher.baseClientUrl);
      // Construct standard login URL path - this might need adjustment based on actual system
      // Let's assume a pattern like /data/perspective/login might work, or rely on a known view if applicable
       return `${urlObj.origin}/data/perspective/login?forceAuth=true`; // More likely generic path
      // Example with project/view:
      // return `${urlObj.origin}/data/perspective/login/${urlFetcher.projectName}/YourDefaultLoginView?forceAuth=true`;
    } catch (e) {
      console.error('Error constructing login URL:', e);
      return null; // Return null on error
    }
  }


  /**
   * Build and insert login section structure
   */
  addLoginUI() {
    this.loginSection = document.getElementById("loginSection");
    if (!this.loginSection) {
      console.error("#loginSection not found in HTML");
      return;
    }

    // Populate the login section with content (status and iframe container)
    // The login form itself isn't created here, the iframe loads the system's login page
    this.loginSection.innerHTML = `
      <div class="login-header">
        <h2>Authentication</h2>
        <div id="loginStatus" class="login-status logged-out">
          <span class="login-status-icon">⚪</span>
          <span class="login-status-text">Not authenticated</span>
        </div>
      </div>
      <div id="loginFrameContainer" class="login-frame-container hidden"> <iframe id="loginFrame" class="login-frame" src="about:blank"></iframe>
      </div>
    `;

    this.loginStatusElement = document.getElementById("loginStatus");
    this.loginFrame = document.getElementById("loginFrame");
    this.loginFrameContainer = document.getElementById("loginFrameContainer");

    this.updateLoginStatus('logged-out', 'Not authenticated');
    this.addLoginStyles(); // Add necessary CSS
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
   * Handle change in login option radio buttons (called by app.js event)
   * @param {string} option - 'continueWithoutLogin' or 'login'
   */
  handleLoginOptionChange(option) {
      this.selectedLoginOption = option;
      this.toggleLoginSectionVisibility(option);

      // If switching TO 'login', prepare the frame
      if (option === 'login' && !this.isLoggedIn) {
           this.prepareFrameLogin();
      } else if (option === 'continueWithoutLogin') {
           // If switching away from login, stop polling and hide frame
           this.stopSessionPolling();
           this.hideLoginFrame();
           // Ensure status reflects the choice
            this.updateLoginStatus('logged-out', 'Continuing without login');
      }
  }

  /**
   * Show or hide the login section (card with iframe/status)
   * @param {string} option - 'continueWithoutLogin' or 'login'
   */
  toggleLoginSectionVisibility(option) {
      if (!this.loginSection) return;

      if (option === 'login') {
          this.loginSection.style.display = 'block'; // Show the whole login card
           // The iframe container's visibility is handled within prepareFrameLogin/hideLoginFrame
           if (this.isLoggedIn && this.loginFrameContainer) {
               // If already logged in, keep the iframe hidden
               this.loginFrameContainer.classList.add('hidden');
           } else if (!this.isLoggedIn && this.loginFrameContainer) {
                // If not logged in, ensure iframe container is potentially visible
                // (prepareFrameLogin will actually show it)
           }
      } else {
          this.loginSection.style.display = 'none'; // Hide the whole login card
      }
  }

  /**
   * Snapshot sessions, show iframe, and start polling for login
   * Called when the 'Login' option is selected.
   */
  async prepareFrameLogin() {
     // Ensure Base URL is set before trying to determine login URL or fetch sessions
     if (!urlFetcher.baseClientUrl || !urlFetcher.projectName) {
         console.error("Cannot prepare login: Base URL or Project Name missing.");
         this.updateLoginStatus('logged-out', 'Error: Base URL not set.');
         return;
     }

     // Determine the login URL now that base URL is available
     this.loginUrl = this.determineLoginUrl();
     if (!this.loginUrl) {
         console.error("Could not determine Login URL.");
         this.updateLoginStatus('logged-out', 'Error: Cannot determine login URL.');
         return;
     }


    // Clear previous state
    this.isLoggedIn = false;
    this.initialSessions.clear();
    this.stopSessionPolling(); // Ensure no previous polling is active

    // Snapshot current sessions before loading login page
     try {
        const sessions = await this.fetchSessionList();
        if (sessions === null) { // fetchSessionList returns null on critical error
             this.updateLoginStatus('logged-out', 'Error fetching session info.');
             return; // Stop if session fetching failed critically
        }
        sessions.forEach(s => this.initialSessions.set(s.id, s.username));
        console.log("Initial sessions snapshot:", this.initialSessions);
     } catch (error) {
          console.error("Error snapshotting initial sessions:", error);
          this.updateLoginStatus('logged-out', 'Error checking sessions.');
          // Optionally return here, or try to proceed with login page loading
     }


    // Display iframe container
    if (this.loginFrameContainer) this.loginFrameContainer.classList.remove('hidden');

    // Load login URL if not already loaded or is about:blank
    if (this.loginFrame && (!this.loginFrame.src || this.loginFrame.src === 'about:blank' || this.loginFrame.src !== this.loginUrl)) {
         console.log(`Loading login URL in iframe: ${this.loginUrl}`);
         this.loginFrame.src = this.loginUrl;

         // Add listener for load to start polling
         if (this._frameLoadHandler) {
             this.loginFrame.removeEventListener('load', this._frameLoadHandler); // Remove previous
         }
         this._frameLoadHandler = () => {
             console.log("Login iframe loaded, starting session polling.");
             this.startSessionPolling(); // Start polling ONLY after load
             // Consider removing the listener if it should only run once per src change
              // this.loginFrame.removeEventListener('load', this._frameLoadHandler);
              // No, keep it in case the user reloads the iframe manually
         };
         this.loginFrame.addEventListener('load', this._frameLoadHandler);
    } else if (this.loginFrame && this.loginFrame.src === this.loginUrl) {
        // If login page is already loaded, just start polling
        console.log("Login iframe already loaded, starting session polling.");
        this.startSessionPolling();
    } else if (!this.loginFrame) {
         console.error("Login iframe element not found.");
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
      // console.log("Polling..."); // Less verbose logging
       // Check if login option is still 'login', stop polling if user switched away
       const currentOption = document.querySelector('input[name="loginOption"]:checked')?.value;
       if (currentOption !== 'login') {
           console.log("Login option changed, stopping polling.");
           this.stopSessionPolling();
           return;
       }


      const sessions = await this.fetchSessionList();
       if (sessions === null) {
           console.warn("Polling failed to fetch sessions, will retry.");
           // Optionally increase interval or stop after N failures
           return;
       }

      // Filter for either a new session or an existing session whose username changed
      const valid = sessions.filter(s => {
        const initialUsername = this.initialSessions.get(s.id);
        const isNewSession = !this.initialSessions.has(s.id);
        // Consider any username other than 'unauthenticated' or null/empty as potentially valid
        const currentUsernameValid = s.username && s.username.toLowerCase() !== 'unauthenticated' && s.username !== 'null';
        // Check if an existing session's username changed AND is now valid
        const existingChangedAndValid = initialUsername !== undefined && currentUsernameValid && s.username !== initialUsername;
         // Log individual session check for debugging
        // console.log(`Session ID: ${s.id}, Username: ${s.username}, Initial: ${initialUsername}, IsNew: ${isNewSession}, ValidNow: ${currentUsernameValid}, ChangedValid: ${existingChangedAndValid}`);
        return (isNewSession && currentUsernameValid) || existingChangedAndValid;
      });

      if (valid.length > 0) {
        console.log("Valid session found, stopping polling.");
        this.stopSessionPolling();
        // Find the latest valid session based on uptime (or simply the first one found)
        const latest = valid.reduce((latestSession, currentSession) => {
           return (currentSession.uptimeMs || 0) > (latestSession.uptimeMs || 0) ? currentSession : latestSession;
        }, valid[0]);
        this.completeLogin(latest.username);
      } else {
           // console.log("No valid authenticated session found yet."); // Less verbose logging
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
       // Use the endpoint constructed by urlFetcher when setBaseClientUrl was called
       if (!urlFetcher.urlEndpoint) {
           console.error("Cannot fetch sessions: URL endpoint not constructed.");
           return null; // Return null to indicate critical failure
       }
       // Ensure the endpoint uses the correct base path (e.g., /system/webdev/...)
       // and targets the getSessionInfo resource.
       let fetchUrl = '';
       try {
            const baseEndpoint = new URL(urlFetcher.urlEndpoint); // Parse the getUrls endpoint
            baseEndpoint.pathname = baseEndpoint.pathname.replace('/getUrls', '/getSessionInfo'); // Change resource
            baseEndpoint.search = ''; // Remove query params like projectName from session info request
            fetchUrl = baseEndpoint.toString();
       } catch (e) {
            console.error("Error constructing session fetch URL from base endpoint:", e);
            return null;
       }


       // console.log("Fetching sessions from:", fetchUrl); // Less verbose logging


    try {
      // Use 'include' credentials to send cookies
      const res = await fetch(fetchUrl, { credentials: 'include' });
      if (!res.ok) {
          console.error(`WorkspaceSessionList failed: HTTP ${res.status}`, await res.text());
          // Don't throw, but return null to indicate failure
          return null;
      }
      const data = await res.json();
      // console.log("fetchSessionList data:", data); // Debugging received data
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('fetchSessionList fetch error:', e);
       // Update status only if not already logged in successfully
        if (!this.loginStatusElement?.classList.contains('logged-in')) {
             this.updateLoginStatus('logged-out', 'Error fetching sessions');
        }
      return null; // Return null on critical fetch error
    }
  }

  /**
   * Finalize login: update UI and emit event
   * @param {string} username - The logged-in username
   */
  completeLogin(username) {
    if (this.isLoggedIn) return; // Prevent duplicate completion
    this.isLoggedIn = true;
    const finalUsername = username || 'Unknown User'; // Fallback for safety
    console.log(`Login successful as ${finalUsername}`);
    this.updateLoginStatus('logged-in', `Logged in as ${finalUsername}`);
    events.emit('LOGIN_SUCCESSFUL', { username: finalUsername });
    this.hideLoginFrame();

    // Emit an event to app.js to indicate that login is complete and UI can proceed
     events.emit('LOGIN_COMPLETE', { loggedIn: true, username: finalUsername });
  }

   /**
     * Indicate login failure
     */
    indicateLoginFailed() {
        if (this.isLoggedIn) return; // Don't indicate failure if already logged in
        this.isLoggedIn = false;
        console.warn("Login process indicated as failed.");
        this.updateLoginStatus('logged-out', 'Authentication failed');
        this.hideLoginFrame();
        this.stopSessionPolling();

        // Emit an event to app.js to indicate that login failed
        events.emit('LOGIN_COMPLETE', { loggedIn: false });
    }


  /**
   * Hide the login iframe container
   */
  hideLoginFrame() {
    if (this.loginFrameContainer) {
        this.loginFrameContainer.classList.add('hidden'); // Use hidden class
        // Optionally clear iframe content to free resources
        if (this.loginFrame) {
            // Check if src is already blank to avoid unnecessary reload/event firing
             if (this.loginFrame.src !== 'about:blank') {
                this.loginFrame.src = 'about:blank';
             }
        }
    }
  }

  /**
   * Update the status bubble icon and text
   * @param {string} status - 'logged-in', 'logged-out', 'checking'
   * @param {string} text - Status message
   */
  updateLoginStatus(status, text) {
    if (!this.loginStatusElement) return;
    // Remove previous status classes safely
    this.loginStatusElement.classList.remove('logged-in', 'logged-out', 'checking');
    // Add the new status class
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
        // Read directly from the radio button state if available
         const checkedOption = document.querySelector('input[name="loginOption"]:checked');
         return checkedOption ? checkedOption.value : this.selectedLoginOption; // Fallback to stored value
    }

    /**
     * Check if the user is considered authenticated for the purpose of capturing.
     * This is true if 'continueWithoutLogin' is selected OR if login was successful.
     * @returns {boolean}
     */
    isAuthenticatedForCapture() {
         const selectedOption = this.getSelectedLoginOption();
         // Also check if login process failed after 'login' was selected
         const loginFailed = selectedOption === 'login' && !this.isLoggedIn && this.loginStatusElement?.classList.contains('logged-out'); // Check current visual status too

         return selectedOption === 'continueWithoutLogin' || (selectedOption === 'login' && this.isLoggedIn);
    }


  getLoginStatus() { return this.isLoggedIn; } // is logged in via iframe
  getLoginUrl()    { return this.loginUrl;  }
  setLoginUrl(u)   { if (u) this.loginUrl = u.trim(); }
}

export default new VisualLoginHandler();