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
    this.initialSessionIds = new Set();
    this._pollInterval = null;
  }

  /**
   * Initialize UI and login logic
   */
  initialize(options = {}) {
    // Set or detect login URL
    this.loginUrl = options.loginUrl || this.determineLoginUrl();

    // Build UI components
    this.addLoginUI();

    // Mode toggle (simple vs advanced)
    const simple = document.getElementById("modeSimple");
    const advanced = document.getElementById("modeAdvanced");
    if (simple) simple.addEventListener("change", () => this.updateLoginVisibility(true));
    if (advanced) advanced.addEventListener("change", () => this.updateLoginVisibility(false));

    // Apply initial visibility
    this.updateLoginVisibility(document.body.classList.contains("simple-mode"));
    console.log("VisualLoginHandler initialized; login URL:", this.loginUrl);
  }

  /**
   * Determine default login URL
   */
  determineLoginUrl() {
    try {
      const { protocol, host, href } = window.location;
      const m = href.match(/\/system\/webdev\/([^\/]+)/);
      const project = m ? m[1] : 'RF_Main_STG';
      return `${protocol}//${host}/data/perspective/login/${project}/Admin?forceAuth=true`;
    } catch (e) {
      console.warn('determineLoginUrl failed:', e);
      return 'http://localhost:8088/data/perspective/login/RF_Main_STG/Admin?forceAuth=true';
    }
  }

  /**
   * Build and insert login section
   */
  addLoginUI() {
    const form = document.getElementById("captureForm");
    if (!form) {
      console.error("#captureForm not found");
      return;
    }

    const section = document.createElement("div");
    section.id = "loginSection";
    section.className = "card";
    section.style.marginBottom = "15px";
    section.innerHTML = `
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
    form.parentNode.insertBefore(section, form);

    this.loginStatusElement = document.getElementById("loginStatus");
    this.loginFrame = document.getElementById("loginFrame");
    this.loginFrameContainer = document.getElementById("loginFrameContainer");

    // Ensure starting status is logged-out
    this.updateLoginStatus('logged-out', 'Not authenticated');

    this.addLoginStyles();
    this.prepareFrameLogin();
  }

  /**
   * Inject CSS for the login UI
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
    `;
    document.head.appendChild(style);
  }

  /**
   * Snapshot existing sessions, show iframe, then poll for new valid session only
   */
  async prepareFrameLogin() {
    // Capture all existing session IDs
    const existing = await this.fetchSessionList();
    existing.forEach(s => this.initialSessionIds.add(s.id));

    // Show the login iframe
    if (this.loginFrameContainer) this.loginFrameContainer.style.display = 'block';
    this.loginFrame.addEventListener('load', () => this.startSessionPolling(), { once: true });
    this.loginFrame.src = this.loginUrl;
  }

  /**
   * Poll endpoint for a new session with a real username
   */
  startSessionPolling() {
    if (this._pollInterval) return;
    this.updateLoginStatus('checking', 'Waiting for authentication…');

    this._pollInterval = setInterval(async () => {
      const sessions = await this.fetchSessionList();
      const newValid = sessions.filter(
        s => !this.initialSessionIds.has(s.id)
          && s.username
          && s.username.toLowerCase() !== 'unauthenticated'
      );
      if (newValid.length) {
        clearInterval(this._pollInterval);
        const latest = newValid.reduce((a,b) => b.uptimeMs > a.uptimeMs ? b : a, newValid[0]);
        this.completeLogin(latest.username);
      }
    }, 2000);
  }

  /**
   * Fetch all sessions from backend
   */
  async fetchSessionList() {
    try {
      const res = await fetch(
        '/system/webdev/RF_Main_STG/PerspectiveCapture/getSessionInfo',
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('fetchSessionList error:', e);
      return [];
    }
  }

  /**
   * Finalize login: update UI and fire event
   */
  completeLogin(username) {
    if (this.isLoggedIn) return;
    this.isLoggedIn = true;
    this.updateLoginStatus('logged-in', `Logged in as ${username}`);
    events.emit('LOGIN_SUCCESSFUL', { username });
    this.hideLoginFrame();
  }

  /**
   * Hide the login iframe
   */
  hideLoginFrame() {
    if (this.loginFrameContainer) this.loginFrameContainer.style.display = 'none';
  }

  /**
   * Update the status bubble text/icon
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

  getLoginStatus() { return this.isLoggedIn; }
  getLoginUrl()    { return this.loginUrl; }
  setLoginUrl(u)   { if (u) this.loginUrl = u.trim(); }
}

export default new VisualLoginHandler();
