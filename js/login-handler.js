import UI from "./ui/index.js";
import * as events from "./events.js";
import { handleError } from "./errors.js";

/**
 * VisualLoginHandler - Provides a simpler visual approach to authentication
 * Shows the login process in a visible iframe so users can see what's happening
 */
class VisualLoginHandler {
  constructor() {
    this.loginUrl = "http://localhost:8088/data/perspective/login/RF_Main_STG/Admin?forceAuth=true";
    this.defaultCredentials = {
      username: "",
      password: ""
    };
    this.isLoggedIn = false;
    this.loginStatusElement = null;
    this.loginFrame = null;
    this.loginFrameContainer = null;
  }

  /**
   * Initialize the login handler UI elements
   */
  initialize() {
    // Create login UI components for Simple Mode
    this.addLoginUI();

    // Add event listener for mode change to show/hide login UI
    const modeSimple = document.getElementById("modeSimple");
    const modeAdvanced = document.getElementById("modeAdvanced");

    if (modeSimple) {
      modeSimple.addEventListener("change", () =>
        this.updateLoginVisibility(true)
      );
    }

    if (modeAdvanced) {
      modeAdvanced.addEventListener("change", () =>
        this.updateLoginVisibility(false)
      );
    }

    // Initial visibility based on current mode
    this.updateLoginVisibility(document.body.classList.contains("simple-mode"));

    // Set up console message listener to detect "All auth challenges completed"
    this.setupConsoleMessageListener();

    console.log("Visual Login Handler initialized");
  }

  /**
   * Set up a listener for console messages to detect authentication success
   */
  setupConsoleMessageListener() {
    // Create a function to intercept console.log calls 
    const originalConsoleLog = console.log;
    console.log = (...args) => {
      // Call the original console.log
      originalConsoleLog.apply(console, args);
      
      // Check if any argument contains the auth success message
      const message = args.join(" ");
      if (message.includes("All auth challenges completed")) {
        console.log("Authentication success detected via console message");
        this.handleSuccessfulLogin();
      }
    };
    
    // Also try to listen for console messages from the iframe if possible
    if (window.addEventListener) {
      window.addEventListener("message", (event) => {
        if (event.data && typeof event.data === "string" && 
            event.data.includes("All auth challenges completed")) {
          console.log("Authentication success detected via iframe message");
          this.handleSuccessfulLogin();
        }
      });
    }
  }

  /**
   * Add login UI components to the page
   */
  addLoginUI() {
    // Find the container to insert login UI before URL selection
    const captureForm = document.getElementById("captureForm");
    if (!captureForm) {
      console.error("Cannot find captureForm element");
      return;
    }

    // Create login section container
    const loginSection = document.createElement("div");
    loginSection.id = "loginSection";
    loginSection.className = "card";
    loginSection.style.marginBottom = "15px";

    // Create login section content with enhanced design - add status indicator
    loginSection.innerHTML = `
      <div class="login-header">
        <h2 style="margin: 0; font-size: 1.3em;">
          Authentication
        </h2>
        <div id="loginStatus" class="login-status logged-out">
          <span class="login-status-icon">⚪</span>
          <span class="login-status-text">Not authenticated</span>
        </div>
      </div>
      
      <div id="loginFrameContainer" class="login-frame-container">
        <iframe id="loginFrame" class="login-frame" src="about:blank"></iframe>
      </div>
    `;

    // Insert login section before capture form
    captureForm.parentNode.insertBefore(loginSection, captureForm);

    this.loginStatusElement = document.getElementById("loginStatus");
    this.loginFrame = document.getElementById("loginFrame");
    this.loginFrameContainer = document.getElementById("loginFrameContainer");

    // Display login frame by default (since user is not logged in)
    this.showLoginFrame();

    // Add some CSS for the login section
    this.addLoginStyles();
  }

  /**
   * Add CSS styles for login UI components
   */
  addLoginStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .login-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      
      .auth-icon {
        font-size: 0.9em;
        margin-right: 5px;
      }
      
      .login-status {
        display: flex;
        align-items: center;
        font-size: 13px;
        background-color: #f8f9fa;
        padding: 3px 10px;
        border-radius: 4px;
        border: 1px solid #e2e8f0;
        transition: all 0.3s ease;
      }
      
      .login-status.logged-in {
        background-color: #d4edda;
        border-color: #c3e6cb;
      }
      
      .login-status.logged-out {
        background-color: #f8d7da;
        border-color: #f5c6cb;
      }
      
      .login-status.checking {
        background-color: #fff3cd;
        border-color: #ffeeba;
      }
      
      .login-status-icon {
        margin-right: 5px;
        font-size: 12px;
      }
      
      .login-frame-container {
        margin: 10px 0;
        border: 1px solid #ddd;
        border-radius: 4px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }
      
      .login-frame {
        width: 100%;
        height: 350px;
        border: none;
      }
      
      /* Styling for username display */
      .login-status-text {
        font-weight: 500;
      }
      
      .login-status.logged-in .login-status-text {
        color: #155724;
      }
      
      #loginSection h2::before {
        content: "🔒";
        margin-right: 10px;
        font-size: 16px;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Update login section visibility based on mode
   * @param {boolean} isSimpleMode - Whether simple mode is active
   */
  updateLoginVisibility(isSimpleMode) {
    const loginSection = document.getElementById("loginSection");
    if (loginSection) {
      loginSection.style.display = isSimpleMode ? "block" : "none";
    }
  }

  /**
   * Show login frame with the login URL
   */
  showLoginFrame() {
    const frameContainer = document.getElementById("loginFrameContainer");
    if (frameContainer) {
      frameContainer.style.display = "block";
    }

    if (this.loginFrame) {
      // Set up event listener to detect navigation events
      this.loginFrame.addEventListener("load", this.handleFrameLoad.bind(this));
      
      // Load the login page
      this.loginFrame.src = this.loginUrl;
    }
  }

  /**
   * Handle frame load event
   */
  handleFrameLoad() {
    try {
      const currentUrl = this.loginFrame.contentWindow.location.href;
      
      // If the URL is empty or about:blank, it's likely a logout
      if (!currentUrl || currentUrl === "about:blank") {
        this.handleLogout();
        return;
      }
      
      // Check for exit/logout in the URL
      if (currentUrl.toLowerCase().includes("logout") || 
          currentUrl.toLowerCase().includes("exit")) {
        this.handleLogout();
        return;
      }
      
      // Try to hook into iframe console
      try {
        if (this.loginFrame.contentWindow) {
          // Try to override console.log in the iframe
          const frameConsole = this.loginFrame.contentWindow.console;
          const originalFrameLog = frameConsole.log;
          
          frameConsole.log = (...args) => {
            // Call original
            originalFrameLog.apply(frameConsole, args);
            
            // Check for auth success message
            const message = args.join(" ");
            if (message.includes("All auth challenges completed")) {
              console.log("Authentication success detected in iframe console");
              this.handleSuccessfulLogin();
            }
          };
        }
      } catch (e) {
        // Cross-origin limitation, can't access iframe console
      }
    } catch (e) {
      // Cross-origin errors expected - silently continue
    }
  }

  /**
   * Handle successful login detected
   */
  handleSuccessfulLogin() {
    // Only process once
    if (this.isLoggedIn) return;
    
    // Update state
    this.isLoggedIn = true;
    
    // Try to find username if possible
    const username = this.findUsernameInFrame();
    
    // Update UI
    if (username) {
      this.updateLoginStatus("logged-in", `Logged in as ${username}`);
    } else {
      this.updateLoginStatus("logged-in", "Authentication successful");
    }
    
    // Emit login event
    events.emit("LOGIN_SUCCESSFUL", { username: username || "User" });
    
    // Hide login frame
    this.hideLoginFrame();
  }

  /**
   * Try to find username in the iframe
   * @returns {string|null} - Username if found, null otherwise
   */
  findUsernameInFrame() {
    try {
      // Try to get document from iframe
      const doc = this.loginFrame.contentDocument;
      if (!doc) return null;
      
      // Common user profile elements
      const selectors = [
        '.username', '.user-info', '.user-display', '.user-profile',
        '[id*="username"]', '[id*="user-name"]', '.user-account'
      ];
      
      // Try each selector
      for (const selector of selectors) {
        const el = doc.querySelector(selector);
        if (el && el.textContent && el.textContent.trim()) {
          return el.textContent.trim();
        }
      }
      
      // If no element found, look for the first element that might have a username
      const possibleUsernameContainers = doc.querySelectorAll(
        'header, footer, .header, .footer, .user-area, .account-info'
      );
      
      for (const container of possibleUsernameContainers) {
        // Look for text that might be a username (word with @ or period)
        const text = container.textContent;
        if (text) {
          const matches = text.match(/\b[A-Za-z0-9.]+\.[A-Za-z0-9.]+\b/);
          if (matches && matches.length > 0) {
            return matches[0];
          }
        }
      }
      
      return null;
    } catch (e) {
      // Can't access frame content due to cross-origin
      return null;
    }
  }

  /**
   * Handle logout state
   */
  handleLogout() {
    this.isLoggedIn = false;
    this.updateLoginStatus("logged-out", "Not authenticated");
  }

  /**
   * Hide login frame (used when user manually closes or after successful login)
   */
  hideLoginFrame() {
    const frameContainer = document.getElementById("loginFrameContainer");
    if (frameContainer) {
      frameContainer.style.display = "none";
    }
  }

  /**
   * Update login status UI
   * @param {string} status - Status class: 'logged-in', 'logged-out', or 'checking'
   * @param {string} message - Status message to display
   */
  updateLoginStatus(status, message) {
    if (!this.loginStatusElement) return;

    // Remove previous status classes
    this.loginStatusElement.classList.remove("logged-in", "logged-out", "checking");

    // Add new status class
    this.loginStatusElement.classList.add(status);

    // Update icon
    const iconElement = this.loginStatusElement.querySelector(".login-status-icon");
    if (iconElement) {
      iconElement.textContent = 
        status === "logged-in" ? "✅" : 
        status === "logged-out" ? "⚪" : 
        "⏳";
    }

    // Update text
    const textElement = this.loginStatusElement.querySelector(".login-status-text");
    if (textElement) {
      textElement.textContent = message;
    }
  }

  /**
   * Get the current login status
   * @returns {boolean} - Whether the user is logged in
   */
  getLoginStatus() {
    return this.isLoggedIn;
  }

  /**
   * Get the login URL for the iframe
   * @returns {string} - Login URL
   */
  getLoginUrl() {
    return this.loginUrl;
  }
}

export default new VisualLoginHandler();