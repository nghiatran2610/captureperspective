// js/login-handler.js
// Based on user-provided version (simplified polling, 3000ms interval, completeLogin guard)
// + Default option set to 'login'
// + Includes fix for clearing main iframe when switching back

import UI from "./ui/index.js";
import * as events from "./events.js";
import { handleError } from "./errors.js";
import urlFetcher from "./url-fetcher.js";

class VisualLoginHandler {
  constructor() {
    this.loginUrl = "";
    this.isLoggedIn = false;
    this.loginSection = null;
    this.loginFrame = null; // Still needed for iframe logic
    this.loginFrameContainer = null; // Still needed for iframe logic
    this.initialSessions = new Map();
    this._pollInterval = null;
    // --- MODIFIED Default Option ---
    this.selectedLoginOption = 'login'; // Default to login
    // --- End Modification ---
    this._frameLoadHandler = null;
    this.loggedInUsername = null; // Keep storage for username
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
    // Get refs needed for iframe manipulation here
    this.loginFrame = document.getElementById("loginFrame");
    this.loginFrameContainer = document.getElementById("loginFrameContainer");
    // Update status using the function which now fetches elements internally
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

  // Includes logic to reset state/UI when switching back to "Continue without login"
  handleLoginOptionChange(option) {
      const previouslyLoggedIn = this.isLoggedIn;
      this.selectedLoginOption = option;
      this.toggleLoginSectionVisibility(option);

      if (option === 'login' && !previouslyLoggedIn) {
           console.log("Login option selected, preparing frame login...");
           this.prepareFrameLogin();
      } else if (option === 'continueWithoutLogin') {
           console.log("Continue without login selected.");
           this.stopSessionPolling();
           this.hideLoginFrame();
           if (previouslyLoggedIn) {
               console.log("Resetting internal flag and clearing main screenshot iframe...");
               this.isLoggedIn = false;
               this.loggedInUsername = null;
               try { // Clear main screenshot iframe
                   const screenshotIframe = document.getElementById('screenshotIframe');
                   if (screenshotIframe && screenshotIframe.src !== 'about:blank') {
                       console.log("Setting #screenshotIframe src to about:blank");
                       screenshotIframe.src = 'about:blank';
                   }
               } catch(e) { console.error("Error clearing #screenshotIframe:", e); }
           }
           this.updateLoginStatus('logged-out', 'Continuing without login');
      } else if (option === 'login' && previouslyLoggedIn) {
           console.log("Login option selected, but already logged in.");
           this.hideLoginFrame();
           if(this.isLoggedIn && this.loggedInUsername) {
                this.updateLoginStatus('logged-in', `Logged in as ${this.loggedInUsername}`);
           } else if (this.isLoggedIn) {
                this.updateLoginStatus('logged-in', `Logged in`);
           } else { this.prepareFrameLogin(); } // Fallback
      }
  }

  toggleLoginSectionVisibility(option) {
      if (!this.loginSection) return;
      if (option === 'login') {
          this.loginSection.style.display = 'block';
          if (this.isLoggedIn && this.loginFrameContainer) {
               this.loginFrameContainer.classList.add('hidden');
           }
      }
      else { this.loginSection.style.display = 'none'; }
  }

  async prepareFrameLogin() {
    if (!urlFetcher.baseClientUrl || !urlFetcher.projectName) { /* ... error ... */ return; }
    this.loginUrl = this.determineLoginUrl();
    if (!this.loginUrl) { /* ... error ... */ return; }

    this.isLoggedIn = false;
    this.loggedInUsername = null;
    this.initialSessions.clear();
    this.stopSessionPolling();

    try {
      const sessions = await this.fetchSessionList();
      if (sessions === null) { /* ... error ... */ return; }
      sessions.forEach(s => this.initialSessions.set(s.id, s.username));
      console.log("Initial sessions snapshot:", JSON.stringify(Array.from(this.initialSessions.entries())));
    } catch (error) { /* ... error handling ... */ }

    if (this.loginFrameContainer) this.loginFrameContainer.classList.remove('hidden');

    if (this.loginFrame && (!this.loginFrame.src || this.loginFrame.src === 'about:blank' || this.loginFrame.src !== this.loginUrl)) {
         console.log(`Loading login URL in iframe: ${this.loginUrl}`);
         this.loginFrame.src = this.loginUrl;
         if (this._frameLoadHandler) { this.loginFrame.removeEventListener('load', this._frameLoadHandler); }
         this._frameLoadHandler = () => {
             console.log("Login iframe LOADED (once listener), starting session polling.");
             this.startSessionPolling();
         };
         this.loginFrame.addEventListener('load', this._frameLoadHandler, { once: true });
    } else if (this.loginFrame && this.loginFrame.src === this.loginUrl) {
        console.log("Login iframe already loaded, restarting session polling.");
        this.stopSessionPolling();
        this.startSessionPolling();
    } else if (!this.loginFrame) { console.error("Login iframe element not found."); }
  }

  // Using SIMPLIFIED POLLING LOGIC with 3000ms interval
  startSessionPolling() {
    if (this._pollInterval) return;
    this.updateLoginStatus('checking', 'Waiting for authentication…');
    console.log("Starting session polling (SIMPLIFIED check)...");
    console.log("Initial sessions snapshot used for polling:", JSON.stringify(Array.from(this.initialSessions.entries())));

    const pollCallback = async () => {
       if (!this._pollInterval) { return; }
       const currentOption = document.querySelector('input[name="loginOption"]:checked')?.value;
       if (currentOption !== 'login') { console.log("Login option changed, stopping polling."); this.stopSessionPolling(); return; }
       const sessions = await this.fetchSessionList();
       if (!this._pollInterval) { return; }
       if (sessions === null) { console.warn("Polling failed to fetch sessions, will retry."); return; }
       // console.log("Polling: Fetched sessions:", JSON.stringify(sessions));
       let loggedInSession = null;
       for (const session of sessions) {
            const currentUsername = session.username;
            const isValidUsername = currentUsername && currentUsername.toLowerCase() !== 'unauthenticated' && currentUsername !== 'null' && currentUsername.trim() !== '';
            if (isValidUsername) {
                 console.log(`Polling: Found session with VALID username: ID=${session.id}, User=${currentUsername}`);
                 loggedInSession = session; break;
            }
       }
       if (loggedInSession) {
         console.log(`Valid session found (ID: ${loggedInSession.id}). Stopping polling.`);
         this.stopSessionPolling();
         if (!this.isLoggedIn) { this.completeLogin(loggedInSession.username); }
         else { console.warn("Polling found valid session, but isLoggedIn flag was already true."); }
       }
    };
    this._pollInterval = setInterval(pollCallback, 3000); // 3 seconds
  }

  stopSessionPolling() {
       if (this._pollInterval) {
           console.log("Stopping session polling.");
           clearInterval(this._pollInterval);
           this._pollInterval = null;
       }
  }

  // Using OLD WORKING SESSION FETCH LOGIC
  async fetchSessionList() {
    const currentUrl = window.location.href;
    const regex = /http(s)?:\/\/([^\/]+)\/system\/webdev\/([^\/]+)/;
    const match = currentUrl.match(regex);
    if (!match || !match[3]) { /* ... error handling ... */ return null; }
    const projectName = match[3];
    const fetchUrl = `/system/webdev/${projectName}/PerspectiveCapture/getSessionInfo`;
    try {
      const res = await fetch(fetchUrl, { credentials: 'include' });
      if (!res.ok) { /* ... error handling ... */ return null; }
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) { /* ... error handling ... */ return null; }
  }

  // Using completeLogin with Guard and stored username
  completeLogin(username) {
    try {
      console.log("[completeLogin] Entering function...");
      if (this.isLoggedIn) { console.warn("[completeLogin] Guard triggered: Already logged in state detected."); return; }
      this.isLoggedIn = true;
      const finalUsername = username || 'Unknown User';
      this.loggedInUsername = finalUsername; // Store username
      console.log(`[completeLogin] Username received: '${username}', Using: '${finalUsername}'`);
      console.log("[completeLogin] Attempting to call updateLoginStatus for 'logged-in'...");
      this.updateLoginStatus('logged-in', `Logged in as ${finalUsername}`);
      console.log("[completeLogin] Returned from updateLoginStatus.");
      console.log("[completeLogin] Attempting to emit events (LOGIN_SUCCESSFUL, LOGIN_COMPLETE)...");
      events.emit('LOGIN_SUCCESSFUL', { username: finalUsername });
      events.emit('LOGIN_COMPLETE', { loggedIn: true, username: finalUsername });
      console.log("[completeLogin] Finished emitting events.");
      console.log("[completeLogin] Attempting to hide login frame...");
      this.hideLoginFrame();
      console.log("[completeLogin] Finished hiding login frame.");
      console.log("[completeLogin] Function finished successfully.");
    } catch (error) {
         console.error("!!!!!!!! ERROR INSIDE completeLogin FUNCTION !!!!!!!!", error);
         this.isLoggedIn = false; this.loggedInUsername = null;
         try { this.updateLoginStatus('logged-out', 'Error during login completion'); }
         catch (finalError) { console.error("[completeLogin] Failed even to set error status:", finalError); }
    }
  }

   indicateLoginFailed() {
       if (this.isLoggedIn) return;
       this.isLoggedIn = false;
       this.loggedInUsername = null; // Clear username on failure too
       console.warn("Login process indicated as failed.");
       this.updateLoginStatus('logged-out', 'Authentication failed');
       this.hideLoginFrame();
       this.stopSessionPolling();
       events.emit('LOGIN_COMPLETE', { loggedIn: false });
   }

   hideLoginFrame() {
       if (this.loginFrameContainer) {
           this.loginFrameContainer.classList.add('hidden');
           if (this.loginFrame && this.loginFrame.src !== 'about:blank') { this.loginFrame.src = 'about:blank'; }
       }
   }

  // Using updateLoginStatus that re-fetches elements
  updateLoginStatus(status, text) {
    const statusElement = document.getElementById("loginStatus");
    if (!statusElement) { console.error("Cannot update login status: #loginStatus element not found."); return; }
    console.log(`Updating login status UI: Status='${status}', Text='${text}'`);
    statusElement.classList.remove('logged-in', 'logged-out', 'checking');
    statusElement.classList.add(status);
    const icon = statusElement.querySelector('.login-status-icon');
    if (icon) icon.textContent = status === 'logged-in' ? '✅' : status === 'checking' ? '⏳' : '⚪';
    const lbl = statusElement.querySelector('.login-status-text');
    if (lbl) { lbl.textContent = text; console.log("Successfully updated .login-status-text content."); }
    else { console.error("Cannot update login status text: .login-status-text element not found within #loginStatus."); }
   }

   getSelectedLoginOption() {
        const checkedOption = document.querySelector('input[name="loginOption"]:checked');
        return checkedOption ? checkedOption.value : this.selectedLoginOption;
    }

   isAuthenticatedForCapture() {
        const selectedOption = this.getSelectedLoginOption();
        const loginFailed = selectedOption === 'login' && !this.isLoggedIn && document.getElementById("loginStatus")?.classList.contains('logged-out');
        return selectedOption === 'continueWithoutLogin' || (selectedOption === 'login' && this.isLoggedIn);
   }

  getLoginStatus() { return this.isLoggedIn; }
  getLoginUrl()    { return this.loginUrl;  }
  setLoginUrl(u)   { if (u) this.loginUrl = u.trim(); }
} // End Class

export default new VisualLoginHandler();