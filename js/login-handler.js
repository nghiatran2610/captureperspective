// js/login-handler.js
import UI from "./ui/index.js";
import * as events from "./events.js";
// import { handleError } from "./errors.js"; // Not directly used here, but good for overall context
import urlFetcher from "./url-fetcher.js"; // Import urlFetcher to access target projectName

class VisualLoginHandler {
  constructor() {
    this.loginUrl = "";
    this.isLoggedIn = false;
    this.loginSection = null;
    this.loginFrame = null;
    this.loginFrameContainer = null;
    this.initialSessions = new Map();
    this._pollInterval = null;
    this.selectedLoginOption = 'login'; // Default to login
    this._frameLoadHandler = null;
    this.loggedInUsername = null;
  }

  initialize(options = {}) {
    this.addLoginUI(); // Adds structure, gets element refs

    const optionContinueWithoutLogin = document.getElementById('optionContinueWithoutLogin');
    const optionLogin = document.getElementById('optionLogin');
    if (optionContinueWithoutLogin) {
        events.addDOMEventListener(optionContinueWithoutLogin,'change', () => {
             events.emit('LOGIN_OPTION_SELECTED', { option: 'continueWithoutLogin' });
        });
    }
    if (optionLogin) {
         events.addDOMEventListener(optionLogin,'change', () => {
             events.emit('LOGIN_OPTION_SELECTED', { option: 'login' });
        });
    }
    console.log("VisualLoginHandler initialized. Structure added. Waiting for option selection.");
  }

  determineLoginUrl() {
    // This method now relies on urlFetcher.baseClientUrl (the target project's base URL)
    // and urlFetcher.projectName (the target project's name) for constructing the login iframe URL.
    if (!urlFetcher.baseClientUrl || !urlFetcher.projectName) {
        console.warn("Cannot determine login URL: Base URL or target project name not set in urlFetcher.");
        this.updateLoginStatus("logged-out", "Error: Project URL not set for login.");
        return null;
    }
    try {
      // urlFetcher.baseClientUrl is like http://localhost:8088/data/perspective/client/TARGET_PROJECT
      const urlObj = new URL(urlFetcher.baseClientUrl);
      
      // The loginViewName is an assumption. If your Perspective projects have a standard login
      // view (e.g., 'Login', 'AdminLogin', or just rely on the project's default login behavior),
      // adjust this path accordingly. Forcing authentication is usually done by IdP or project settings.
      // A common pattern for a dedicated login view might be /TARGET_PROJECT/path/to/LoginView
      // Forcing auth often means redirecting to an IdP or a specific login page if not authenticated.
      // The `forceAuth=true` is a placeholder for any query parameters your login mechanism might use.
      const loginViewName = 'Admin'; // IMPORTANT: Confirm this view name or login path strategy
      
      // Construct login URL targeting the specific project's login mechanism.
      // Example: http://localhost:8088/data/perspective/login/TARGET_PROJECT/LoginViewName
      const loginUrl = `${urlObj.origin}/data/perspective/login/${urlFetcher.projectName}/${loginViewName}?forceAuth=true`;
      
      console.log("Determined login URL (for target project context):", loginUrl);
      return loginUrl;
    } catch (e) {
      console.error('Error constructing login URL:', e);
      this.updateLoginStatus("logged-out", "Error: Invalid Project URL for login.");
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
    this.updateLoginStatus('logged-out', 'Not authenticated'); // Initial status
    this.addLoginStyles(); // Call to add styles if they aren't in CSS file
  }

  addLoginStyles() {
     // This function might be redundant if all styles are in styles.css
     // Kept for consistency with previous versions if it injects critical dynamic styles.
     const styleId = "loginHandlerStyles";
     if (document.getElementById(styleId)) return; // Avoid duplicate styles

     const style = document.createElement("style");
     style.id = styleId;
     style.textContent = `
       /* Styles moved to styles.css for better organization */
       /* .login-header { display:flex; ... } etc. */
     `;
     // If you still need dynamic styles here, uncomment and fill. Otherwise, this can be minimal.
     // document.head.appendChild(style);
     // console.log("Login styles (potentially minimal if moved to CSS) checked/applied.");
  }

  handleLoginOptionChange(option) {
      const previouslyLoggedIn = this.isLoggedIn;
      this.selectedLoginOption = option;
      this.toggleLoginSectionVisibility(option); // Manages display of the entire login section

      if (option === 'login' && !previouslyLoggedIn) {
           console.log("Login option selected, preparing frame login...");
           this.prepareFrameLogin(); // This will show the login frame if not logged in
      } else if (option === 'continueWithoutLogin') {
           console.log("Continue without login selected.");
           this.stopSessionPolling();
           this.hideLoginFrame(); // Ensure frame is hidden
           if (previouslyLoggedIn) { // If switching from a logged-in state
               console.log("Resetting internal login state and clearing main screenshot iframe...");
               this.isLoggedIn = false;
               this.loggedInUsername = null;
               try {
                   const screenshotIframe = document.getElementById('screenshotIframe');
                   if (screenshotIframe && screenshotIframe.src !== 'about:blank') {
                       screenshotIframe.src = 'about:blank'; // Clear Perspective session in main iframe
                   }
               } catch(e) { console.error("Error clearing #screenshotIframe:", e); }
           }
           this.updateLoginStatus('logged-out', 'Continuing without login');
      } else if (option === 'login' && previouslyLoggedIn) {
           console.log("Login option selected, but already logged in as " + this.loggedInUsername);
           this.hideLoginFrame(); // Keep frame hidden
           // Status is already 'logged-in', re-affirm it
           this.updateLoginStatus('logged-in', `Logged in as ${this.loggedInUsername || 'user'}`);
      }
  }

  toggleLoginSectionVisibility(option) {
      if (!this.loginSection) return;
      if (option === 'login') {
          this.loginSection.style.display = 'block';
          // If already logged in, the login frame itself should remain hidden
          if (this.isLoggedIn && this.loginFrameContainer) {
               this.loginFrameContainer.classList.add('hidden');
           } else if (!this.isLoggedIn && this.loginFrameContainer) {
               // If 'login' is chosen and not yet logged in, prepareFrameLogin will handle showing the frame.
               // We don't explicitly show it here to avoid flicker if prepareFrameLogin fails early.
           }
      } else { // 'continueWithoutLogin'
          this.loginSection.style.display = 'none';
      }
  }

  async prepareFrameLogin() {
    if (!urlFetcher.baseClientUrl || !urlFetcher.projectName) {
        console.error("prepareFrameLogin: Base URL or target project name for login context is not set in urlFetcher.");
        this.updateLoginStatus("logged-out", "Error: Project URL must be set first.");
        this.hideLoginFrame();
        return;
    }

    this.loginUrl = this.determineLoginUrl();
    if (!this.loginUrl) {
        console.error("prepareFrameLogin: Could not determine a valid login URL.");
        // determineLoginUrl should have already set an error status.
        this.hideLoginFrame();
        return;
    }

    this.isLoggedIn = false; // Reset login state for a new attempt
    this.loggedInUsername = null;
    this.initialSessions.clear();
    this.stopSessionPolling();

    this.updateLoginStatus('checking', 'Preparing login process...');

    try {
      const sessions = await this.fetchSessionList(); // fetchSessionList now includes targetProjectName
      if (sessions === null) {
          console.error("prepareFrameLogin: Failed to fetch initial session list. Login cannot proceed.");
          // fetchSessionList would have updated the status to an error.
          this.hideLoginFrame();
          return;
      }
      sessions.forEach(s => this.initialSessions.set(s.id, s.username));
      console.log("Initial sessions snapshot taken:", this.initialSessions.size > 0 ? JSON.stringify(Array.from(this.initialSessions.entries())) : "No initial sessions found.");
    } catch (error) { // Should be caught by fetchSessionList, but as a fallback
      console.error("prepareFrameLogin: Exception fetching initial session list:", error);
      this.updateLoginStatus("logged-out", "Error checking auth status.");
      this.hideLoginFrame();
      return;
    }

    // Proceed to show and load iframe
    if (this.loginFrameContainer) this.loginFrameContainer.classList.remove('hidden');

    if (this.loginFrame) {
        if (this.loginFrame.src !== this.loginUrl) { // Load only if different or blank
            console.log(`Loading login URL in iframe: ${this.loginUrl}`);
            this.loginFrame.src = this.loginUrl;
        } else {
            console.log("Login iframe already has the correct URL. Consider reloading or just polling.");
            // Optionally force a reload if state might be stale:
            // this.loginFrame.contentWindow.location.reload();
        }
        // Always (re)attach load listener for starting polling
        if (this._frameLoadHandler) { this.loginFrame.removeEventListener('load', this._frameLoadHandler); }
        this._frameLoadHandler = () => {
            console.log("Login iframe LOADED (src='" + this.loginFrame.src + "'), starting session polling.");
            this.updateLoginStatus('checking', 'Login page loaded, monitoring session...');
            this.startSessionPolling();
        };
        this.loginFrame.addEventListener('load', this._frameLoadHandler, { once: true });
    } else {
        console.error("Login iframe element not found in prepareFrameLogin.");
        this.updateLoginStatus("logged-out", "UI Error: Login frame missing.");
    }
  }

  startSessionPolling() {
    if (this._pollInterval) {
        console.log("Session polling already active.");
        return;
    }
    // Status update is conditional: if it's not already 'checking' or 'logged-in'
    if (!this.isLoggedIn && (!this.loginStatus || !this.loginStatus.classList.contains('checking'))) {
        this.updateLoginStatus('checking', 'Waiting for authentication…');
    }
    console.log("Starting session polling...");

    const pollCallback = async () => {
       if (!this._pollInterval) return; // Polling was stopped

       const currentOption = this.getSelectedLoginOption();
       if (currentOption !== 'login' || this.isLoggedIn) { // Stop if option changes or already logged in
           console.log("Login option changed or already logged in, stopping polling.");
           this.stopSessionPolling();
           return;
       }

       const sessions = await this.fetchSessionList();
       if (!this._pollInterval) return; // Polling stopped during fetch

       if (sessions === null) {
           console.warn("Polling: failed to fetch sessions, will retry.");
           // Optionally, update status to indicate a problem with polling
           // this.updateLoginStatus('checking', 'Auth check issue, retrying...');
           return;
       }

       let loggedInSession = null;
       for (const session of sessions) {
            const currentUsername = session.username;
            const isValidUsername = currentUsername && currentUsername.toLowerCase() !== 'unauthenticated' && currentUsername !== 'null' && currentUsername.trim() !== '';
            if (isValidUsername) {
                 // Simplified: first valid username found is considered the login.
                 // More robust would be to check against initialSessions for a *new* valid session.
                 console.log(`Polling: Found session with VALID username: ID=${session.id}, User=${currentUsername}`);
                 loggedInSession = session;
                 break;
            }
       }

       if (loggedInSession) {
         console.log(`Valid authenticated session found (User: ${loggedInSession.username}). Stopping polling.`);
         this.stopSessionPolling(); // Stop polling first
         if (!this.isLoggedIn) { // Prevent multiple calls if already processed
            this.completeLogin(loggedInSession.username);
         } else {
            console.warn("Polling found valid session, but isLoggedIn was already true. Current user: " + this.loggedInUsername);
         }
       } else {
           // console.log("Polling: No new authenticated session detected yet.");
       }
    };
    this._pollInterval = setInterval(pollCallback, 3000);
  }

  stopSessionPolling() {
       if (this._pollInterval) {
           console.log("Stopping session polling.");
           clearInterval(this._pollInterval);
           this._pollInterval = null;
       }
  }

  async fetchSessionList() {
    const currentToolUrl = window.location.href;
    const toolUrlRegex = /http(s)?:\/\/([^\/]+)\/system\/webdev\/([^\/]+)/;
    const toolUrlMatch = currentToolUrl.match(toolUrlRegex);

    if (!toolUrlMatch || !toolUrlMatch[3]) {
      console.error("fetchSessionList: Could not extract tool's project context from its own URL:", currentToolUrl);
      this.updateLoginStatus("logged-out", "Error: Tool URL misconfig.");
      return null;
    }
    const toolRunningUnderProject = toolUrlMatch[3];

    let fetchUrl = `/system/webdev/${toolRunningUnderProject}/PerspectiveCapture/getSessionInfo`;

    // --- ADDED: Append target projectName as query parameter ---
    const targetProjectNameForQuery = urlFetcher.projectName; // This is the project being screenshotted

    if (targetProjectNameForQuery && targetProjectNameForQuery.trim() !== "") {
      fetchUrl += `?projectName=${encodeURIComponent(targetProjectNameForQuery)}`;
      // console.log(`WorkspaceSessionList: Including target project in query: ${targetProjectNameForQuery}`);
    } else {
      // This case implies the main "Project URL" input in the UI might not be set or valid yet.
      // Depending on backend requirements for /getSessionInfo, this might be an issue.
      console.warn("fetchSessionList: Target project name (for query param) is not available from urlFetcher. Proceeding without it.");
      // If your backend *requires* projectName for /getSessionInfo, you should handle this more strictly:
      // this.updateLoginStatus("logged-out", "Error: Target project for auth check not specified.");
      // return null;
    }
    // --- END ADDITION ---
    
    console.log(`WorkspaceSessionList: Attempting to fetch from: ${fetchUrl}`);

    try {
      const res = await fetch(fetchUrl, { credentials: 'include' }); // Crucial for sending session cookies
      if (!res.ok) {
        console.error(`WorkspaceSessionList: Failed to fetch session info from ${fetchUrl}. Status: ${res.status} ${res.statusText}`);
        let errorText = `Auth check error (${res.status})`;
        if (res.status === 404) errorText = "Auth service not found.";
        else if (res.status === 401 || res.status === 403) errorText = "Not authorized for auth service.";
        this.updateLoginStatus("logged-out", errorText);
        return null;
      }
      const data = await res.json();
      // console.log("fetchSessionList: Raw data received:", data);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(`WorkspaceSessionList: Network or other error fetching from ${fetchUrl}:`, e);
      this.updateLoginStatus("logged-out", "Auth check network error.");
      return null;
    }
  }

  completeLogin(username) {
    try {
      if (this.isLoggedIn && this.loggedInUsername === username) {
        console.warn(`[completeLogin] Guard: Already logged in as ${username}. No action taken.`);
        return;
      }
       if (this.isLoggedIn && this.loggedInUsername !== username) {
        console.warn(`[completeLogin] Logged in as ${this.loggedInUsername}, but new login detected for ${username}. Updating user.`);
      }

      this.isLoggedIn = true;
      const finalUsername = username || 'Authenticated User'; // Fallback if username is empty
      this.loggedInUsername = finalUsername;
      console.log(`[completeLogin] Login successful. User: '${finalUsername}'`);
      
      this.updateLoginStatus('logged-in', `Logged in as ${finalUsername}`);
      this.hideLoginFrame(); // Hide the login iframe
      
      events.emit('LOGIN_SUCCESSFUL', { username: finalUsername });
      events.emit('LOGIN_COMPLETE', { loggedIn: true, username: finalUsername });
    } catch (error) {
         console.error("Error during completeLogin:", error);
         // Attempt to gracefully handle error during completion
         this.isLoggedIn = false; 
         this.loggedInUsername = null;
         this.updateLoginStatus('logged-out', 'Error finalizing login process');
         // Avoid emitting LOGIN_COMPLETE if completion itself failed to prevent loops.
    }
  }

   indicateLoginFailed() {
       if (this.isLoggedIn) return; // Don't mark as failed if somehow already logged in.
       
       this.isLoggedIn = false;
       this.loggedInUsername = null;
       console.warn("Login process explicitly indicated as failed or timed out.");
       this.updateLoginStatus('logged-out', 'Authentication failed or timed out');
       this.hideLoginFrame();
       this.stopSessionPolling(); // Crucial to stop polling on failure
       events.emit('LOGIN_COMPLETE', { loggedIn: false });
   }

   hideLoginFrame() {
       if (this.loginFrameContainer) {
           this.loginFrameContainer.classList.add('hidden');
           if (this.loginFrame && this.loginFrame.src !== 'about:blank') {
                // Delay clearing src slightly to avoid potential race conditions
                // or interrupting the browser if the login page itself does a redirect on success.
                setTimeout(() => {
                    if (this.loginFrame) { // Re-check if still exists
                        try {
                            this.loginFrame.src = 'about:blank';
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
      console.error("Cannot update login status: #loginStatus element not found.");
      return;
    }
    
    // Ensure statusElement is not null before trying to access classList or querySelector
    statusElement.classList.remove('logged-in', 'logged-out', 'checking');
    statusElement.classList.add(status); // Add the new status class
    
    const icon = statusElement.querySelector('.login-status-icon');
    if (icon) {
      icon.textContent = status === 'logged-in' ? '✅' : status === 'checking' ? '⏳' : '⚪';
    }
    
    const lbl = statusElement.querySelector('.login-status-text');
    if (lbl) {
      lbl.textContent = text;
    } else {
      console.error("Cannot update login status text: .login-status-text span not found within #loginStatus.");
    }
   }

   getSelectedLoginOption() {
        const checkedOption = document.querySelector('input[name="loginOption"]:checked');
        return checkedOption ? checkedOption.value : this.selectedLoginOption; // Fallback to stored option
    }

   isAuthenticatedForCapture() {
        const selectedOption = this.getSelectedLoginOption();
        if (selectedOption === 'continueWithoutLogin') {
            return true; // Always "authenticated" for capture if guest mode is chosen
        }
        // If 'login' option selected, actual login status matters
        return selectedOption === 'login' && this.isLoggedIn;
   }

  getLoginStatus() { return this.isLoggedIn; }
  getLoginUrl()    { return this.loginUrl;  }
  // setLoginUrl(u)   { if (u && typeof u === 'string') this.loginUrl = u.trim(); } // Typically not set externally
}

export default new VisualLoginHandler();