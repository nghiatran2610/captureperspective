// js/login-handler.js
// Combine New UI Flow with OLD (Working) Fetching Logic
// + Use SIMPLIFIED Polling Logic (Find ANY valid user)
// + Fix for race condition in completeLogin
// + Increased Polling Interval to 3000ms

import UI from "./ui/index.js";
import * as events from "./events.js";
import { handleError } from "./errors.js";
import urlFetcher from "./url-fetcher.js";

class VisualLoginHandler {
  constructor() {
    this.loginUrl = "";
    this.isLoggedIn = false;
    this.loginStatusElement = null;
    this.loginFrame = null;
    this.loginFrameContainer = null;
    this.loginSection = null;
    this.initialSessions = new Map();
    this._pollInterval = null;
    this.selectedLoginOption = 'continueWithoutLogin';
    this._frameLoadHandler = null;
  }

  initialize(options = {}) {
    this.addLoginUI(); // Adds structure, gets element refs

    const optionContinueWithoutLogin = document.getElementById('optionContinueWithoutLogin');
    const optionLogin = document.getElementById('optionLogin');
    if (optionContinueWithoutLogin) {
        // Starts disabled, enabled by app.js
        events.addDOMEventListener(optionContinueWithoutLogin,'change', () => {
             events.emit('LOGIN_OPTION_SELECTED', { option: 'continueWithoutLogin' });
        });
    }
    if (optionLogin) {
         // Starts disabled, enabled by app.js
         events.addDOMEventListener(optionLogin,'change', () => {
             events.emit('LOGIN_OPTION_SELECTED', { option: 'login' });
        });
    }
    console.log("VisualLoginHandler initialized. Structure added. Waiting for option selection.");
  }

  determineLoginUrl() {
    if (!urlFetcher.baseClientUrl || !urlFetcher.projectName) {
        console.warn("Cannot determine login URL: Base URL or project name not set.");
        return null;
    }
    try {
      const urlObj = new URL(urlFetcher.baseClientUrl);
      const loginViewName = 'Admin'; // IMPORTANT: Confirm this view name
      const loginUrl = `${urlObj.origin}/data/perspective/login/${urlFetcher.projectName}/${loginViewName}?forceAuth=true`;
      console.log("Determined login URL:", loginUrl);
      return loginUrl;
    } catch (e) {
      console.error('Error constructing login URL:', e);
      return null;
    }
  }

  addLoginUI() {
    this.loginSection = document.getElementById("loginSection");
    if (!this.loginSection) {
         console.error("#loginSection not found in HTML");
         return;
        }
    this.loginSection.innerHTML = `
      <div class="login-header"><h2>Authentication</h2><div id="loginStatus" class="login-status logged-out"><span class="login-status-icon">⚪</span><span class="login-status-text">Not authenticated</span></div></div>
      <div id="loginFrameContainer" class="login-frame-container hidden"><iframe id="loginFrame" class="login-frame" src="about:blank"></iframe></div>
    `;
    this.loginStatusElement = document.getElementById("loginStatus");
    this.loginFrame = document.getElementById("loginFrame");
    this.loginFrameContainer = document.getElementById("loginFrameContainer");
    this.updateLoginStatus('logged-out', 'Not authenticated');
    this.addLoginStyles();
  }

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

  handleLoginOptionChange(option) {
      this.selectedLoginOption = option;
      this.toggleLoginSectionVisibility(option);
      if (option === 'login' && !this.isLoggedIn) {
           this.prepareFrameLogin();
      } else if (option === 'continueWithoutLogin') {
           this.stopSessionPolling(); this.hideLoginFrame();
           this.updateLoginStatus('logged-out', 'Continuing without login');
      }
  }

  toggleLoginSectionVisibility(option) {
      if (!this.loginSection) return;
      if (option === 'login') {
          this.loginSection.style.display = 'block';
           // Show/hide iframe container is handled in prepareFrameLogin/hideLoginFrame/completeLogin
          if (this.isLoggedIn && this.loginFrameContainer) {
               this.loginFrameContainer.classList.add('hidden');
           }
      }
      else {
          this.loginSection.style.display = 'none';
        }
  }

  async prepareFrameLogin() {
    if (!urlFetcher.baseClientUrl || !urlFetcher.projectName) {
         console.error("Cannot prepare login: Base URL or Project Name missing.");
         this.updateLoginStatus('logged-out', 'Error: Base URL not set.');
         return;
        }
    this.loginUrl = this.determineLoginUrl(); // Determine URL *now*
    if (!this.loginUrl) {
         console.error("Could not determine Login URL.");
         this.updateLoginStatus('logged-out', 'Error: Cannot determine login URL.');
         return;
        }

    // --- Reset isLoggedIn flag HERE ---
    this.isLoggedIn = false;
    this.initialSessions.clear();
    this.stopSessionPolling(); // Ensure any previous polling is stopped

    try { // Snapshot sessions BEFORE loading iframe
      const sessions = await this.fetchSessionList(); // Uses OLD working fetch logic now
      if (sessions === null) {
          this.updateLoginStatus('logged-out', 'Error fetching session info.');
          return;
         }
      sessions.forEach(s => this.initialSessions.set(s.id, s.username));
      console.log("Initial sessions snapshot:", JSON.stringify(Array.from(this.initialSessions.entries()))); // Use JSON stringify for map logging
    } catch (error) {
         console.error("Error snapshotting initial sessions:", error);
         this.updateLoginStatus('logged-out', 'Error checking sessions.');
        }

    if (this.loginFrameContainer) this.loginFrameContainer.classList.remove('hidden');

    if (this.loginFrame && (!this.loginFrame.src || this.loginFrame.src === 'about:blank' || this.loginFrame.src !== this.loginUrl)) {
         console.log(`Loading login URL in iframe: ${this.loginUrl}`);
         this.loginFrame.src = this.loginUrl;

         // --- Use { once: true } for the load listener ---
         if (this._frameLoadHandler) {
             // Remove previous listener just in case (though 'once' should handle it)
             this.loginFrame.removeEventListener('load', this._frameLoadHandler);
         }
         this._frameLoadHandler = () => {
             console.log("Login iframe LOADED (once listener), starting session polling.");
             this.startSessionPolling(); // Uses SIMPLIFIED poll logic now
         };
         // Add listener with the 'once' option
         this.loginFrame.addEventListener('load', this._frameLoadHandler, { once: true });
         // --- End change ---

    } else if (this.loginFrame && this.loginFrame.src === this.loginUrl) {
        // If login page is already loaded (e.g., user clicks away and back), restart polling
        // But ensure we reset the state correctly first
         console.log("Login iframe already loaded, restarting session polling.");
         this.stopSessionPolling(); // Stop any previous polling just in case
         this.startSessionPolling(); // Uses SIMPLIFIED poll logic now
    } else if (!this.loginFrame) {
         console.error("Login iframe element not found.");
        }
  }

  // **** USE SIMPLIFIED POLLING LOGIC - ADJUSTED INTERVAL ****
  startSessionPolling() {
    if (this._pollInterval) return; // Don't start if already polling
    this.updateLoginStatus('checking', 'Waiting for authentication…');
    console.log("Starting session polling (SIMPLIFIED check)...");
    // Log initial sessions for comparison (still useful for debugging)
    console.log("Initial sessions snapshot used for polling:", JSON.stringify(Array.from(this.initialSessions.entries())));

    // Define the interval callback function separately
    const pollCallback = async () => {
       // --- Guard: Check if polling should have stopped ---
       if (!this._pollInterval) { return; }

       const currentOption = document.querySelector('input[name="loginOption"]:checked')?.value;
       if (currentOption !== 'login') {
           console.log("Login option changed, stopping polling.");
           this.stopSessionPolling(); return;
       }

      const sessions = await this.fetchSessionList();
      // --- Guard: Check if polling was stopped during await ---
      if (!this._pollInterval) { return; }

      if (sessions === null) {
          console.warn("Polling failed to fetch sessions, will retry."); return;
      }

      // console.log("Polling: Fetched sessions:", JSON.stringify(sessions)); // Can be verbose

      // --- SIMPLIFIED Check: Find ANY session with a valid username ---
      let loggedInSession = null;
      for (const session of sessions) {
           const currentUsername = session.username;
           // Define what constitutes a 'valid' logged-in username
           const isValidUsername = currentUsername && currentUsername.toLowerCase() !== 'unauthenticated' && currentUsername !== 'null' && currentUsername.trim() !== '';

           if (isValidUsername) {
                console.log(`Polling: Found session with VALID username: ID=${session.id}, User=${currentUsername}`);
                loggedInSession = session;
                break; // Found one, assume login is complete
           }
      }
      // --- End Simplified Check ---

      if (loggedInSession) { // If we found any valid session
        console.log(`Valid session found (ID: ${loggedInSession.id}). Stopping polling.`);
        // --- Stop polling IMMEDIATELY ---
        this.stopSessionPolling();
        // --- Call completeLogin AFTER stopping interval ---
        // Check isLoggedIn one last time before calling completeLogin to prevent race conditions if possible
        if (!this.isLoggedIn) {
             this.completeLogin(loggedInSession.username);
        } else {
            console.warn("Polling found valid session, but isLoggedIn flag was already true. Preventing duplicate completeLogin call.");
        }
      } else {
           // console.log("Polling: No valid authenticated session found yet."); // Less verbose
      }
    };

    // Start the interval - *** INCREASED DURATION ***
    this._pollInterval = setInterval(pollCallback, 3000); // Changed to 3000 (3 seconds)
  }


  // KEEP stopSessionPolling from current version
  stopSessionPolling() {
       if (this._pollInterval) {
           console.log("Stopping session polling.");
           clearInterval(this._pollInterval);
           this._pollInterval = null;
       }
  }


  // **** USE OLD (WORKING) SESSION FETCH LOGIC ****
  async fetchSessionList() {
    // console.log("Fetching session list (using previous working logic)..."); // Less verbose
    // Determine project name from the CURRENT page URL (tool's URL)
    const currentUrl = window.location.href;
    const regex = /http(s)?:\/\/([^\/]+)\/system\/webdev\/([^\/]+)/;
    const match = currentUrl.match(regex);

    // Check if the match is valid and has the project name group
    if (!match || !match[3]) {
        console.error("Could not extract project name from current tool URL:", currentUrl);
        this.updateLoginStatus('logged-out', 'Error: Cannot determine endpoint project.');
        return null; // Indicate critical failure
    }
    const projectName = match[3]; // e.g., RF_Main_STG
    const fetchUrl = `/system/webdev/${projectName}/PerspectiveCapture/getSessionInfo`;
    // console.log("Constructed fetchSessionList URL:", fetchUrl); // Less verbose

    try {
      const res = await fetch(fetchUrl, { credentials: 'include' });
      if (!res.ok) {
          console.error(`fetchSessionList failed: HTTP ${res.status}`, await res.text());
           // Update UI status only if not already logged in
          if (!this.isLoggedIn) {
               this.updateLoginStatus('logged-out', `Error fetching sessions (${res.status})`);
          }
          return null; // Indicate failure
      }
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('fetchSessionList fetch error:', e);
       if (!this.isLoggedIn) {
           this.updateLoginStatus('logged-out', 'Error fetching sessions (network)');
       }
      return null; // Indicate critical failure
    }
  }


  // KEEP completeLogin from current version (includes logging and try/catch/guard)
  completeLogin(username) {
    try {
      console.log("[completeLogin] Entering function...");
      // --- Guard against race condition ---
      if (this.isLoggedIn) {
           console.warn("[completeLogin] Guard triggered: Already logged in state detected. Exiting redundant call.");
           return; // Prevent duplicate completion logic
      }
      // --- Set flag only AFTER the guard check ---
      this.isLoggedIn = true;
      const finalUsername = username || 'Unknown User'; // Fallback for safety

      console.log(`[completeLogin] Username received: '${username}', Using: '${finalUsername}'`);

      // Log BEFORE updating status
      console.log("[completeLogin] Attempting to call updateLoginStatus for 'logged-in'...");
      this.updateLoginStatus('logged-in', `Logged in as ${finalUsername}`);
      // Log AFTER updating status
      console.log("[completeLogin] Returned from updateLoginStatus.");

      // Log BEFORE emitting events
      console.log("[completeLogin] Attempting to emit events (LOGIN_SUCCESSFUL, LOGIN_COMPLETE)...");
      events.emit('LOGIN_SUCCESSFUL', { username: finalUsername });
      events.emit('LOGIN_COMPLETE', { loggedIn: true, username: finalUsername });
      // Log AFTER emitting events
      console.log("[completeLogin] Finished emitting events.");


      // Log BEFORE hiding frame
      console.log("[completeLogin] Attempting to hide login frame...");
      this.hideLoginFrame();
      // Log AFTER hiding frame
      console.log("[completeLogin] Finished hiding login frame.");

      console.log("[completeLogin] Function finished successfully."); // Log successful completion


    } catch (error) {
        console.error("!!!!!!!! ERROR INSIDE completeLogin FUNCTION !!!!!!!!", error);
         this.isLoggedIn = false; // Reset flag on error within completion logic
         try {
             this.updateLoginStatus('logged-out', 'Error during login completion');
         } catch (finalError) {
             console.error("[completeLogin] Failed even to set error status:", finalError);
         }
    }
  }

  // KEEP indicateLoginFailed from current version
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

  // KEEP hideLoginFrame from current version
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

  // KEEP updateLoginStatus from current version (includes logging)
  updateLoginStatus(status, text) {
     if (!this.loginStatusElement) {
         console.error("Cannot update login status: loginStatusElement not found.");
         return;
     }
     console.log(`Updating login status UI: Status='${status}', Text='${text}'`);
     // Remove previous status classes safely
     this.loginStatusElement.classList.remove('logged-in', 'logged-out', 'checking');
     // Add the new status class
     this.loginStatusElement.classList.add(status);

     const icon = this.loginStatusElement.querySelector('.login-status-icon');
     if (icon) icon.textContent = status === 'logged-in' ? '✅' : status === 'checking' ? '⏳' : '⚪';

     const lbl = this.loginStatusElement.querySelector('.login-status-text');
     if (lbl) {
         lbl.textContent = text;
         console.log("Successfully updated .login-status-text content.");
     } else {
         console.error("Cannot update login status text: .login-status-text element not found within #loginStatus.");
     }
   }

  // KEEP getSelectedLoginOption from current version
   getSelectedLoginOption() {
        // Read directly from the radio button state if available
        const checkedOption = document.querySelector('input[name="loginOption"]:checked');
        return checkedOption ? checkedOption.value : this.selectedLoginOption; // Fallback to stored value
    }

  // KEEP isAuthenticatedForCapture from current version
   isAuthenticatedForCapture() {
        const selectedOption = this.getSelectedLoginOption();
        // Also check if login process failed after 'login' was selected
        const loginFailed = selectedOption === 'login' && !this.isLoggedIn && this.loginStatusElement?.classList.contains('logged-out'); // Check current visual status too

        return selectedOption === 'continueWithoutLogin' || (selectedOption === 'login' && this.isLoggedIn);
   }

  // KEEP getters/setters
  getLoginStatus() { return this.isLoggedIn; }
  getLoginUrl()    { return this.loginUrl;  }
  setLoginUrl(u)   { if (u) this.loginUrl = u.trim(); }
}

export default new VisualLoginHandler();