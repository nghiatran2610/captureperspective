// perspective_capture/js/app.js
import config from "./config.js";
import AppState from "./state.js";
import UI from "./ui/index.js";
import URLProcessor from "./url-processor.js";
import * as ScreenshotCapture from "./screenshot/core.js";
import * as events from "./events.js";
import {
  handleError,
  ScreenshotError,
  URLProcessingError,
  AppError,
} from "./errors.js";
import urlSelector from "./ui/url-selector.js";
import LoginHandler from "./login-handler.js";
import urlFetcher from "./url-fetcher.js";

class App {
  constructor() {
    this.currentMode = "simple"; // 'simple' or 'advanced'
    this.captureScreenshots = this.captureScreenshots.bind(this);
    this._handleActionsInput = this._handleActionsInput.bind(this);
    this.baseUrl = ""; // Base URL for Perspective client (e.g., http://localhost:8088/data/perspective/client/ProjectName)
    this.baseUrlValid = false;
    this.gatewayBaseForProjects = ""; // e.g., http://localhost:8088/data/perspective/client/ (used to construct full project URLs)
    this.loginHandler = LoginHandler; // Instance of LoginHandler

    // For sequential captures and pause/resume
    this.isPaused = false;
    this.captureQueue = []; // Stores {url, index, capturePreset, captureFullPage, actionSequences}
    this.currentCaptureIndex = 0;
    this.pauseResumeCapture = this.pauseResumeCapture.bind(this);
    this._handleBaseUrlInput = this._handleBaseUrlInput.bind(this);
    this._handleProjectSelection = this._handleProjectSelection.bind(this);
    this._fetchAndPopulateProjects = this._fetchAndPopulateProjects.bind(this);
    this._initiateUrlFetching = this._initiateUrlFetching.bind(this);
    this._processingQueue = false; // Flag to indicate if capture queue is being processed
    this.startTotalTime = 0; // To measure total capture time
    this._toggleCaptureSettings = this._toggleCaptureSettings.bind(this);
    this._handleSourceChange = this._handleSourceChange.bind(this);
    this._handleLoadManualSource = this._handleLoadManualSource.bind(this);
    this._handleFileUpload = this._handleFileUpload.bind(this);
  }

  initialize() {
    const baseUrlInput = document.getElementById("baseUrlInput");
    if (baseUrlInput) {
      baseUrlInput.value = ""; // Clear it initially
      baseUrlInput.readOnly = true; // Make it readonly as it's populated by dropdown
    }
    const projectDropdown = document.getElementById("projectSelectorDropdown");
    if (projectDropdown) projectDropdown.disabled = true; // Disabled until projects load

    this._deriveGatewayBaseForProjects(); // Derive gateway for project URLs
    this._setupEventListeners(); // Set up DOM event listeners
    this._initializeUI(); // Initialize UI elements and their states
    this._setupEventHandlers(); // Set up application-level event handlers

    // Set default mode
    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");

    this.loginHandler.initialize(); // Initializes LoginHandler's own UI & listeners
    this._fetchAndPopulateProjects(); // Fetch and populate project dropdown

    // Show project selection, hide login options and capture form initially
    const baseUrlSection = document.getElementById("baseUrlSection");
    if (baseUrlSection) baseUrlSection.style.display = ""; // Show project selection

    this._setCaptureSettingsUIsDisabled(true); // Screenshot settings like preset, wait time
    const loginOptionRadios = document.querySelectorAll(
      'input[name="loginOption"]'
    );
    loginOptionRadios.forEach((radio) => (radio.disabled = true));
    const loginOptionSection = document.getElementById("loginOptionSection");
    if (loginOptionSection) loginOptionSection.style.display = "none";

    console.log("Application initialized.");
  }

  _deriveGatewayBaseForProjects() {
    try {
      const currentHref = window.location.href;
      // Regex to find http(s)://hostname:port part
      const gatewayMatch = currentHref.match(/^(https?:\/\/[^/]+)/i);
      if (gatewayMatch && gatewayMatch[1]) {
        const gatewayAddress = gatewayMatch[1]; // e.g., http://localhost:8088
        this.gatewayBaseForProjects = `${gatewayAddress}/data/perspective/client/`;
        console.log(
          "Gateway base for project URLs derived:",
          this.gatewayBaseForProjects
        );
      } else {
        // Fallback if regex fails (e.g., running from file://)
        this.gatewayBaseForProjects =
          "http://localhost:8088/data/perspective/client/"; // Common default
        console.warn(
          "Could not derive gateway base from current URL. Using fallback:",
          this.gatewayBaseForProjects
        );
      }
    } catch (e) {
      console.error("Error deriving gateway base:", e);
      this.gatewayBaseForProjects =
        "http://localhost:8088/data/perspective/client/";
    }
  }

  async _fetchAndPopulateProjects() {
    const projectDropdown = document.getElementById("projectSelectorDropdown");
    const excludedProjectName = "PerspectiveCapture"; // The tool's own project name
    if (!projectDropdown) return;

    projectDropdown.disabled = true;
    projectDropdown.innerHTML = '<option value="">Loading projects...</option>';
    try {
      const projects = await urlFetcher.fetchProjectList();
      projectDropdown.innerHTML =
        '<option value="">-- Select a Project --</option>'; // Default prompt
      if (projects && projects.length > 0) {
        projects.forEach((project) => {
          if (project !== excludedProjectName) {
            // Exclude the tool's own project
            const option = document.createElement("option");
            option.value = project;
            option.textContent = project;
            projectDropdown.appendChild(option);
          }
        });
        projectDropdown.disabled = false;
      } else {
        projectDropdown.innerHTML =
          '<option value="">No projects found</option>';
        UI.utils.showStatus(
          "No projects available or error fetching list.",
          true,
          0 // Persist error
        );
      }
    } catch (error) {
      console.error("Failed to fetch or populate project list:", error);
      projectDropdown.innerHTML =
        '<option value="">Error loading projects</option>';
      UI.utils.showStatus(
        error.message || "Could not load project list.",
        true,
        0 // Persist error
      );
    }
  }

  _setCaptureSettingsUIsDisabled(disabled) {
    const capturePresetSelect = UI.elements.capturePreset;
    const fullPageCheckbox = document.getElementById("fullPageCheckbox");
    const simpleWaitTimeInput = document.getElementById("simpleWaitTime");

    if (capturePresetSelect) capturePresetSelect.disabled = disabled;
    if (fullPageCheckbox) fullPageCheckbox.disabled = disabled;
    if (simpleWaitTimeInput) simpleWaitTimeInput.disabled = disabled;

    console.log(
      `Capture settings (Preset, FullPage, WaitTime) ${
        disabled ? "Disabled" : "Enabled"
      }.`
    );
  }

  _handleProjectSelection(event) {
    const selectedProjectName = event.target.value;
    const baseUrlInputElement = document.getElementById("baseUrlInput");
    const loginOptionSection = document.getElementById("loginOptionSection");
    const loginRadios = loginOptionSection.querySelectorAll(
      'input[name="loginOption"]'
    );

    if (!baseUrlInputElement || !loginOptionSection) return;

    this._hideCaptureFormAndPageSource(); // Always hide downstream UI on project change
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
    if (urlSelector.cleanup) urlSelector.cleanup(); // Clear URL selector content
    UI.utils.resetUI(); // Reset thumbnails and stats
    if (UI.elements.progressOutput)
      UI.elements.progressOutput.style.display = "none";

    // Reset login handler state related to current user/session
    this.loginHandler.updateLoginOptionsUI(null, false); // Reset login button text, logout visibility, uncheck radios

    if (!selectedProjectName) {
      // No project selected
      baseUrlInputElement.value = "";
      if (urlFetcher) urlFetcher.projectName = "";
      this.baseUrlValid = false;
      this.loginHandler.isLoggedIn = false;
      this.loginHandler.loggedInUsername = null;
      this.loginHandler.selectedLoginOption = "";
      this.loginHandler.stopSessionMonitor();
      this.loginHandler.stopSessionPolling();
      this.loginHandler.updateLoginStatus("logged-out", "Project not selected");

      loginOptionSection.style.display = "none"; // Hide login options
      loginRadios.forEach((radio) => (radio.disabled = true));
      this._setCaptureSettingsUIsDisabled(true);
    } else {
      // A project is selected
      loginOptionSection.style.display = "block"; // Show login options section
      loginRadios.forEach((radio) => (radio.disabled = false)); // Enable radio buttons

      if (!this.gatewayBaseForProjects) {
        UI.utils.showStatus("Error: Gateway configuration missing.", true, 0);
        baseUrlInputElement.value = "";
        this.baseUrlValid = false;
      } else {
        const fullProjectUrl =
          this.gatewayBaseForProjects + selectedProjectName;
        baseUrlInputElement.value = fullProjectUrl;
        // _handleBaseUrlInput will be called, which then calls loginHandler.checkInitialSessionAndSetupUI()
        this._handleBaseUrlInput({ target: baseUrlInputElement }); // Simulate input event
      }
      this._setCaptureSettingsUIsDisabled(false); // Enable screenshot settings
    }
    this._checkCaptureButtonState();
  }

  async _handleBaseUrlInput(event) {
    const url = event.target.value.trim();
    const loginOptionSection = document.getElementById("loginOptionSection");

    this._hideCaptureFormAndPageSource(); // Hide capture form until auth sorted

    if (!url || !url.includes("/client/")) {
      // Basic validation
      this.baseUrlValid = false;
      this.baseUrl = url;
      if (urlFetcher) urlFetcher.projectName = "";
      UI.utils.showStatus(
        url ? "Invalid Project URL format." : "Project URL is required.",
        true,
        0 // Persist error
      );
      loginOptionSection.style.display = "none";
      this.loginHandler.updateLoginOptionsUI(null, false);
      this.loginHandler.isLoggedIn = false;
      this.loginHandler.loggedInUsername = null;
      this.loginHandler.selectedLoginOption = "";
      this.loginHandler.stopSessionMonitor();
      this.loginHandler.stopSessionPolling();
      this.loginHandler.updateLoginStatus("logged-out", "Invalid project URL");
    } else {
      const success = urlFetcher.setBaseClientUrl(url); // Sets projectName in urlFetcher
      if (success) {
        this.baseUrl = urlFetcher.baseClientUrl;
        this.baseUrlValid = true;
        loginOptionSection.style.display = "block"; // Ensure login options are visible

        UI.utils.showStatus(
          `Project '${urlFetcher.projectName}' loaded. Checking session...`,
          false,
          4000
        );
        const sessionState =
          await this.loginHandler.checkInitialSessionAndSetupUI();

        if (sessionState.isLoggedIn) {
          console.log(
            `App: Initial session check found user: ${sessionState.username}. Login option UI updated.`
          );
          // loginHandler.updateLoginOptionsUI pre-checked the "Continue as [User]" radio.
          // We now need to ensure the capture form appears.
          this._showCaptureFormAndPageSource();
        } else {
          console.log(
            "App: No active session found on initial check. User needs to choose login option."
          );
          // UI is reset by loginHandler, ensure capture form is hidden.
          this._hideCaptureFormAndPageSource();
          // Make sure login message section (formerly iframe section) is hidden if not actively logging in
          if (
            this.loginHandler.loginSection &&
            this.loginHandler.loginSection.style.display !== "none"
          ) {
            // If not actively in a 'new tab' login flow, hide this.
            // updateLoginStatus will control it better.
            if (
              !this.loginHandler._pollInterval &&
              !this.loginHandler.loginTab
            ) {
              this.loginHandler.loginSection.style.display = "none";
              this.loginHandler.loginSection.innerHTML = "";
            }
          }
        }
      } else {
        this.baseUrlValid = false;
        this.baseUrl = url;
        if (urlFetcher) urlFetcher.projectName = "";
        UI.utils.showStatus("Could not identify project from URL.", true, 0);
        loginOptionSection.style.display = "none";
        this.loginHandler.updateLoginOptionsUI(null, false);
      }
    }
    this._checkCaptureButtonState();
  }

  _setupEventListeners() {
    const projectDropdown = document.getElementById("projectSelectorDropdown");
    if (projectDropdown) {
      events.addDOMEventListener(
        projectDropdown,
        "change",
        this._handleProjectSelection
      );
    } else {
      console.error("#projectSelectorDropdown element not found!");
    }

    if (UI.elements.captureBtn) {
      events.addDOMEventListener(
        UI.elements.captureBtn,
        "click",
        this.captureScreenshots
      );
    } else {
      console.error("#captureBtn element not found!");
    }

    // Toggle for "Pages" section visibility
    const titleToggleWrapper = document.getElementById("captureSettingsToggle");
    if (titleToggleWrapper) {
      events.addDOMEventListener(
        titleToggleWrapper,
        "click",
        this._toggleCaptureSettings
      );
    } else {
      console.error("#captureSettingsToggle element not found.");
    }

    // Page source option (Automatic / Manual JSON)
    const sourceRadios = document.querySelectorAll(
      'input[name="pageSourceOption"]'
    );
    sourceRadios.forEach((radio) => {
      events.addDOMEventListener(radio, "change", this._handleSourceChange);
    });

    const loadManualBtn = document.getElementById("loadManualJsonBtn");
    if (loadManualBtn) {
      events.addDOMEventListener(
        loadManualBtn,
        "click",
        this._handleLoadManualSource
      );
    } else {
      console.error("#loadManualJsonBtn not found!");
    }

    const fileInput = document.getElementById("manualJsonFile");
    if (fileInput) {
      events.addDOMEventListener(fileInput, "change", this._handleFileUpload);
    } else {
      console.error("#manualJsonFile input not found!");
    }

    // Advanced mode related listeners (if any were previously here, review if still needed)
    // e.g., UI.elements.actionsField.addEventListener('input', this._handleActionsInput);
  }

  _initializeUI() {
    this._ensureHiddenWaitTimeStorage(); // Ensure hidden input for wait time exists

    // Set default wait time from config
    const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
    const hiddenWaitTimeInput = document.getElementById("hiddenWaitTime"); // Should exist now
    const defaultWait = String(config.ui.defaultWaitTime || 5);

    if (simpleWaitTimeInput) simpleWaitTimeInput.value = defaultWait;
    if (hiddenWaitTimeInput) hiddenWaitTimeInput.value = defaultWait; // Sync hidden with visible/default
    UI.elements.waitTime = simpleWaitTimeInput || hiddenWaitTimeInput; // Prioritize visible

    // Disable capture button initially
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
    // Hide capture button container
    if (UI.elements.buttonContainer)
      UI.elements.buttonContainer.style.display = "none";

    this.createPauseResumeButton(); // Create and add pause/resume button
    this._setCaptureSettingsCollapsed(false); // Start with "Pages" section expanded

    // Hide manual JSON input area initially
    const manualArea = document.getElementById("manualJsonInputArea");
    if (manualArea) manualArea.style.display = "none";

    // Hide page source selection initially (shown after auth)
    const pageSourceSelection = document.getElementById("pageSourceSelection");
    if (pageSourceSelection) pageSourceSelection.style.display = "none";

    // Login iframe section (now repurposed for status messages) should be hidden.
    const loginStatusSection = document.getElementById("loginSection");
    if (loginStatusSection) loginStatusSection.style.display = "none";

    // Base URL input should be read-only if project dropdown exists
    const baseUrlInput = document.getElementById("baseUrlInput");
    if (baseUrlInput && document.getElementById("projectSelectorDropdown")) {
      baseUrlInput.readOnly = true;
    }
    this._setCaptureSettingsUIsDisabled(true);
  }

  _ensureHiddenWaitTimeStorage() {
    let hiddenWaitTime = document.getElementById("hiddenWaitTime");
    if (!hiddenWaitTime) {
      hiddenWaitTime = document.createElement("input");
      hiddenWaitTime.type = "hidden";
      hiddenWaitTime.id = "hiddenWaitTime";
      hiddenWaitTime.value = String(config.ui.defaultWaitTime || 5); // Default value from config
      document.body.appendChild(hiddenWaitTime); // Append to body to ensure it's in DOM
    }
    // Ensure UI.elements.waitTime is set, preferring simpleWaitTimeInput if available
    if (!UI.elements.waitTime) {
      const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
      UI.elements.waitTime = simpleWaitTimeInput || hiddenWaitTime;
    }
  }

  _showCaptureFormAndPageSource() {
    const captureForm = UI.elements.captureForm;
    const pageSourceSelection = document.getElementById("pageSourceSelection");
    const buttonContainer = UI.elements.buttonContainer;

    if (captureForm) captureForm.style.display = "";
    if (pageSourceSelection) pageSourceSelection.style.display = "";
    if (buttonContainer) buttonContainer.style.display = "flex";

    // The #loginSection is primarily managed by loginHandler.updateLoginStatus.
    // If login is complete or guest mode, ensure any "waiting for tab" message is cleared.
    if (
      this.loginHandler.loginSection &&
      !this.loginHandler._pollInterval &&
      !this.loginHandler.loginTab
    ) {
      // If not actively polling for a new tab login, hide the message section.
      this.loginHandler.loginSection.style.display = "none";
      this.loginHandler.loginSection.innerHTML = "";
    }

    this._updateUIMode(); // This will also trigger _initiateUrlFetching if needed
    this._checkCaptureButtonState();
  }

  _hideCaptureFormAndPageSource() {
    const captureForm = UI.elements.captureForm;
    const pageSourceSelection = document.getElementById("pageSourceSelection");
    const buttonContainer = UI.elements.buttonContainer;

    if (captureForm) captureForm.style.display = "none";
    if (pageSourceSelection) pageSourceSelection.style.display = "none";
    if (buttonContainer) buttonContainer.style.display = "none";

    // The loginHandler.updateLoginStatus and prepareFrameLogin will manage
    // the visibility and content of #loginSection if a login process is active.
    // Don't unconditionally hide it here if it might contain "waiting for login tab" messages.

    if (urlSelector.cleanup) urlSelector.cleanup();
    this._checkCaptureButtonState();
  }

  _updateUIMode() {
    // This app primarily runs in "simple" mode based on current HTML.
    // "Advanced" mode (with manual JSON actions) is via ContextMenuActionsHelper.
    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");

    const advancedOptionsEl = document.getElementById("advancedOptions");
    if (advancedOptionsEl) advancedOptionsEl.style.display = "none";

    this._setupSimpleModeSettings(); // Ensures wait time is correctly referenced

    // Conditional URL fetching based on UI state
    // Use a timeout to ensure DOM updates from _showCaptureFormAndPageSource have rendered
    setTimeout(async () => {
      if (typeof urlSelector.initialize === "function") {
        try {
          await urlSelector.initialize(); // Ensure selector is ready
          const captureFormVisible =
            UI.elements.captureForm?.style.display !== "none";
          const pageSourceVisible =
            document.getElementById("pageSourceSelection")?.style.display !==
            "none";

          // Only fetch if the relevant UI sections are actually visible
          if (captureFormVisible && pageSourceVisible) {
            const selectedSource = document.querySelector(
              'input[name="pageSourceOption"]:checked'
            )?.value;
            if (selectedSource === "automatic") {
              this._initiateUrlFetching(); // Fetch URLs if automatic source is selected
            }
          }
        } catch (error) {
          console.error(
            "Failed to initialize/update URL selector in _updateUIMode:",
            error
          );
          if (typeof urlSelector.showFallbackUIIfNeeded === "function") {
            urlSelector.showFallbackUIIfNeeded();
          }
        }
      }
      this._checkCaptureButtonState(); // Update capture button state after potential URL load
    }, 0);
  }

  _setupSimpleModeSettings() {
    // Ensure the correct wait time input is referenced
    const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
    const hiddenWaitTimeInput = document.getElementById("hiddenWaitTime");

    if (simpleWaitTimeInput) {
      UI.elements.waitTime = simpleWaitTimeInput; // Prefer the visible one if present
      // Sync hidden input if simple mode is active and has a value
      if (hiddenWaitTimeInput && simpleWaitTimeInput.value) {
        hiddenWaitTimeInput.value = simpleWaitTimeInput.value;
      }
    } else if (hiddenWaitTimeInput) {
      // Fallback to hidden if simple mode input is not found (should not happen with current HTML)
      UI.elements.waitTime = hiddenWaitTimeInput;
    } else {
      // This should ideally not be reached if _ensureHiddenWaitTimeStorage worked
      console.error(
        "Critical UI Error: No wait time input found for simple mode settings."
      );
      // As a last resort, try to create and use the hidden one
      this._ensureHiddenWaitTimeStorage();
      UI.elements.waitTime = document.getElementById("hiddenWaitTime");
    }
  }

  _handleActionsInput() {
    // This is for the advanced mode JSON actions.
    // Validate JSON or provide feedback if needed.
    const actionsField = UI.elements.actionsField;
    if (actionsField) {
      try {
        if (actionsField.value.trim() !== "") {
          JSON.parse(actionsField.value);
        }
        // Optionally clear an error message if valid
      } catch (e) {
        // Optionally show an error message for invalid JSON
        console.warn("Invalid JSON in actions field:", e.message);
      }
    }
    this._checkCaptureButtonState();
  }

  _handleSourceChange() {
    const selectedSource = document.querySelector(
      'input[name="pageSourceOption"]:checked'
    )?.value;
    const manualArea = document.getElementById("manualJsonInputArea");
    const urlSelectorContainer = document.getElementById(
      "urlSelectorContainer"
    );
    const manualJsonStatus = document.getElementById("manualJsonStatus");
    const jsonTextArea = document.getElementById("manualJsonText");
    const fileInput = document.getElementById("manualJsonFile");
    const fileNameDisplay = document.getElementById("fileNameDisplay");

    if (!manualArea) return; // Should not happen
    if (manualJsonStatus) manualJsonStatus.textContent = ""; // Clear status

    // Reset selections and UI when source changes
    if (urlSelector.selectedUrls) urlSelector.selectedUrls.clear();
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;

    if (selectedSource === "manual") {
      manualArea.style.display = "";
      if (urlSelectorContainer) urlSelectorContainer.style.display = "none";
      if (urlSelector.clearRenderedUrls) urlSelector.clearRenderedUrls(); // Clear any auto-loaded URLs
      if (urlFetcher) urlFetcher.dataLoadedDirectly = false; // Reset flag
      this.captureQueue = []; // Clear any pending captures from automatic source
      AppState.reset(); // Reset app state for screenshots
      UI.utils.resetUI(); // Clear thumbnails and stats from previous run
    } else {
      // 'automatic'
      manualArea.style.display = "none";
      if (urlSelectorContainer) urlSelectorContainer.style.display = ""; // Show URL selector
      if (urlSelector.clearRenderedUrls) urlSelector.clearRenderedUrls(); // Clear any stale selector content
      if (jsonTextArea) jsonTextArea.value = ""; // Clear manual input fields
      if (fileInput) fileInput.value = "";
      if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";

      // Fetch URLs if automatic source is selected and conditions are met
      const authOk =
        this.loginHandler.selectedLoginOption === "continueWithoutLogin" ||
        this.loginHandler.isLoggedIn;
      if (this.baseUrlValid && authOk) {
        this._initiateUrlFetching();
      } else {
        if (
          urlSelector.container &&
          typeof urlSelector.showLoadingState === "function"
        ) {
          urlSelector.showLoadingState(
            "Waiting for Project & Authentication..."
          );
        }
      }
    }
    this._checkCaptureButtonState();
  }

  async _handleFileUpload(event) {
    const fileInput = event.target;
    const fileNameDisplay = document.getElementById("fileNameDisplay");
    const manualJsonStatus = document.getElementById("manualJsonStatus");
    const jsonTextArea = document.getElementById("manualJsonText");
    const loadManualBtn = document.getElementById("loadManualJsonBtn");

    if (manualJsonStatus) {
      manualJsonStatus.textContent = "";
      manualJsonStatus.style.color = ""; // Reset color
    }
    if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";
    if (loadManualBtn) loadManualBtn.disabled = true;

    if (!fileInput.files || fileInput.files.length === 0) return;
    const file = fileInput.files[0];

    if (
      !file.type ||
      (file.type !== "application/json" &&
        !file.name.toLowerCase().endsWith(".json"))
    ) {
      if (manualJsonStatus) {
        manualJsonStatus.textContent =
          "Error: Please select a valid .json file.";
        manualJsonStatus.style.color = "red";
      }
      fileInput.value = ""; // Reset file input
      return;
    }

    if (fileNameDisplay) fileNameDisplay.textContent = file.name;

    try {
      const fileContent = await this._readFileContent(file);
      if (jsonTextArea) {
        jsonTextArea.value = fileContent;
        console.log(`File "${file.name}" content loaded into textarea.`);
        if (loadManualBtn) loadManualBtn.disabled = false; // Enable load button
      }
    } catch (readError) {
      console.error("Error reading file:", readError);
      if (manualJsonStatus) {
        manualJsonStatus.textContent = `Error reading file: ${readError.message}`;
        manualJsonStatus.style.color = "red";
      }
      if (fileNameDisplay) fileNameDisplay.textContent = "Error reading file";
      fileInput.value = ""; // Reset file input on error
    }
    this._checkCaptureButtonState();
  }

  async _handleLoadManualSource() {
    const jsonTextArea = document.getElementById("manualJsonText");
    const manualJsonStatus = document.getElementById("manualJsonStatus");
    const urlSelectorContainer = document.getElementById(
      "urlSelectorContainer"
    );
    const loadBtn = document.getElementById("loadManualJsonBtn");
    const fileInput = document.getElementById("manualJsonFile"); // To clear its value
    const fileNameDisplay = document.getElementById("fileNameDisplay"); // To reset its text

    if (!jsonTextArea || !manualJsonStatus || !loadBtn) return;

    manualJsonStatus.textContent = "";
    manualJsonStatus.style.color = "";
    loadBtn.disabled = true;
    loadBtn.textContent = "Loading...";
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;

    const sourceContent = jsonTextArea.value.trim();
    const sourceDescription = fileInput?.files?.[0]?.name
      ? `file "${fileInput.files[0].name}"`
      : "textarea content";

    // Clear file input after attempting to load, regardless of source (text or file)
    if (fileInput) fileInput.value = "";
    if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";

    if (!sourceContent) {
      manualJsonStatus.textContent = "Error: No JSON content to load.";
      manualJsonStatus.style.color = "red";
      loadBtn.disabled = false; // Re-enable if there was content initially
      loadBtn.textContent = "Load Pages";
      return;
    }

    try {
      manualJsonStatus.textContent = `Processing ${sourceDescription}...`;
      manualJsonStatus.style.color = "orange"; // Processing color
      await urlFetcher.setDataDirectly(sourceContent);

      if (urlFetcher.dataLoadedDirectly) {
        // Ensure URL selector is initialized if it wasn't already for some reason
        if (
          !urlSelectorContainer &&
          typeof urlSelector.initialize === "function"
        ) {
          await urlSelector.initialize();
        }
        if (document.getElementById("urlSelectorContainer")) {
          // Check if it exists after potential init
          urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
          document.getElementById("urlSelectorContainer").style.display = ""; // Make sure it's visible
        } else {
          throw new Error(
            "URL Selector UI could not be prepared for manual data."
          );
        }
        manualJsonStatus.textContent = `Success: Loaded ${urlFetcher.urlsList.length} pages. Select pages to capture.`;
        manualJsonStatus.style.color = "green";
      } else {
        // setDataDirectly might have set an error in urlFetcher
        const errorMsg =
          urlFetcher.error?.message || "Failed to process JSON data.";
        manualJsonStatus.textContent = `Error: ${errorMsg}`;
        manualJsonStatus.style.color = "red";
        if (urlSelector.clearRenderedUrls) urlSelector.clearRenderedUrls();
        if (urlSelectorContainer) urlSelectorContainer.style.display = "none";
      }
    } catch (error) {
      console.error(`Error loading manual source:`, error);
      const errorMsg =
        error instanceof AppError
          ? error.message
          : "Invalid JSON format or structure.";
      manualJsonStatus.textContent = `Error: ${errorMsg}`;
      manualJsonStatus.style.color = "red";
      if (urlSelector.clearRenderedUrls) urlSelector.clearRenderedUrls();
      if (urlSelectorContainer) urlSelectorContainer.style.display = "none";
    } finally {
      // Re-enable load button if there's still content in textarea (e.g., user wants to retry with edits)
      loadBtn.disabled = !jsonTextArea.value.trim();
      loadBtn.textContent = "Load Pages";
      this._checkCaptureButtonState();
    }
  }

  _readFileContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target.result);
      reader.onerror = (event) => reject(new Error("File could not be read."));
      reader.readAsText(file);
    });
  }

  _checkCaptureButtonState() {
    const captureBtn = UI.elements.captureBtn;
    const buttonContainer = UI.elements.buttonContainer;
    const loadManualBtn = document.getElementById("loadManualJsonBtn");

    if (!captureBtn || !buttonContainer) return;

    const selectedSource = document.querySelector(
      'input[name="pageSourceOption"]:checked'
    )?.value;

    // Manage state of "Load Pages" button for manual source
    if (loadManualBtn && selectedSource === "manual") {
      const jsonTextArea = document.getElementById("manualJsonText");
      // Enable if textarea has content AND not currently loading
      loadManualBtn.disabled =
        !(jsonTextArea && jsonTextArea.value.trim()) ||
        loadManualBtn.textContent === "Loading...";
    } else if (loadManualBtn) {
      loadManualBtn.disabled = true; // Disable if not manual source
    }

    // Determine if prerequisites for capture are met
    const authOk =
      this.loginHandler.selectedLoginOption === "continueWithoutLogin" ||
      this.loginHandler.isLoggedIn;
    const prerequisitesMet =
      !this._processingQueue && this.baseUrlValid && authOk;

    let urlsAvailableAndSelected = false;
    if (selectedSource === "automatic") {
      urlsAvailableAndSelected =
        urlFetcher.urlsList.length > 0 && urlSelector.selectedUrls.size > 0;
    } else if (selectedSource === "manual") {
      // For manual, check if data was successfully loaded directly and items are selected
      urlsAvailableAndSelected =
        urlFetcher.dataLoadedDirectly && urlSelector.selectedUrls.size > 0;
    }

    const isReadyToCapture = prerequisitesMet && urlsAvailableAndSelected;
    captureBtn.disabled = !isReadyToCapture;

    // Show/hide the main button container based on overall UI state
    const captureFormVisible =
      UI.elements.captureForm?.style.display !== "none";
    const pageSourceVisible =
      document.getElementById("pageSourceSelection")?.style.display !== "none";

    if (captureFormVisible && pageSourceVisible) {
      buttonContainer.style.display = "flex"; // Use flex for better alignment of buttons
      buttonContainer.classList.remove("hidden");
    } else {
      buttonContainer.style.display = "none";
      buttonContainer.classList.add("hidden");
    }
  }

  _setupEventHandlers() {
    events.on(events.events.CAPTURE_PROGRESS, (data) => {
      if (data && data.message && UI.elements.progress) {
        // Prepend an informational icon if not already an error/success/spinner
        let messageToShow = data.message;
        const hasSpinner = messageToShow.includes(
          '<span class="status-spinner">'
        );
        const hasOtherIcon = ["✓ ", "✗ ", "⚠️ ", "ℹ️ "].some((icon) =>
          messageToShow.startsWith(icon)
        );
        if (!hasSpinner && !hasOtherIcon) {
          messageToShow = "ℹ️ " + data.message;
        }
        UI.progress.updateProgressMessage(messageToShow);
      }
    });

    events.on(events.events.SCREENSHOT_TAKEN, (data) => {
      if (!data || !data.result) return;
      const preset = data.result.preset || "N/A";
      const presetName = config.screenshot.presets[preset]?.name || preset;
      const targetWidth = data.result.width || "?";
      const targetHeight = data.result.height || "?";
      const isFullPage = data.result.isFullPage || false;
      const sizeDesc = isFullPage
        ? `Full Page (${targetWidth}x${targetHeight})`
        : `${presetName} (${targetWidth}x${targetHeight})`;
      const timeTaken = data.result.timeTaken || "?";
      const url = data.url || data.result.url || "Unknown URL";
      const pageName = URLProcessor.extractDefaultUrlSegment(url) || url; // Simple name extraction

      let statusMessageText;
      if (data.result.detectedMountIssue) {
        statusMessageText = `⚠️ Captured with mount issue: ${pageName} - ${sizeDesc} (${timeTaken}s)`;
      } else {
        statusMessageText = `✓ Captured: ${pageName} - ${sizeDesc} (${timeTaken}s)`;
      }

      UI.utils.showStatus(
        statusMessageText,
        data.result.detectedMountIssue,
        data.result.detectedMountIssue ? 7000 : 5000
      );
    });

    events.on("URL_SELECTION_CHANGED", () => this._checkCaptureButtonState());

    events.on(events.events.LOGIN_OPTION_SELECTED, (data) => {
      if (!this.baseUrlValid && data.option === "login") {
        UI.utils.showStatus("Please select a valid Project URL first.", true);
        const radioLogin = document.getElementById("optionLogin");
        if (radioLogin) radioLogin.checked = false;
        this.loginHandler.selectedLoginOption = ""; // Reset selection in handler
        return;
      }

      if (
        data.option === "continueWithoutLogin" ||
        (data.option === "login" && data.isLoggedIn) // Already logged in
      ) {
        this._showCaptureFormAndPageSource();
        if (this.loginHandler.loginSection) {
          if (!data.loginPendingInNewTab) {
            this.loginHandler.loginSection.style.display = "none";
            this.loginHandler.loginSection.innerHTML = "";
          }
        }
      } else if (data.option === "login" && data.loginPendingInNewTab) {
        this._hideCaptureFormAndPageSource();
        if (this.loginHandler.loginSection) {
          // loginHandler.updateLoginStatus will handle showing this with messages
        }
      }
      this._checkCaptureButtonState();
    });

    events.on(events.events.LOGIN_COMPLETE, (data) => {
      if (data.loggedIn) {
        this._showCaptureFormAndPageSource();
        if (this.loginHandler.loginSection) {
          this.loginHandler.loginSection.style.display = "none";
          this.loginHandler.loginSection.innerHTML = "";
        }
      } else {
        this._hideCaptureFormAndPageSource();
      }
      this._checkCaptureButtonState();
    });

    events.on(events.events.AUTO_LOGOUT_DETECTED, (data) => {
      console.log(
        `App received AUTO_LOGOUT_DETECTED for user: ${
          data?.username || "unknown"
        }`
      );
      UI.utils.showStatus(
        `Your session has expired. Please log in again or continue as guest.`,
        true,
        0
      );
      this._hideCaptureFormAndPageSource();
      this._setCaptureSettingsUIsDisabled(true);
      const loginOptionRadios = document.querySelectorAll(
        'input[name="loginOption"]'
      );
      loginOptionRadios.forEach((radio) => (radio.checked = false));

      if (this.loginHandler.loginSection) {
        this.loginHandler.loginSection.style.display = "none";
        this.loginHandler.loginSection.innerHTML = "";
      }

      if (this.isPaused) {
        this.isPaused = false;
        this.updatePauseResumeButton();
      }
      this._processingQueue = false;
      this.captureQueue = [];
      this.currentCaptureIndex = 0;
      AppState.reset();
      UI.utils.resetUI();
      this._checkCaptureButtonState();
    });

    events.on(events.events.USER_LOGGED_OUT, (data) => {
      console.log(
        `App received USER_LOGGED_OUT for user: ${data?.username || "unknown"}`
      );
      UI.utils.showStatus(
        `Successfully logged out ${
          data?.username || "user"
        }. Select a login option.`,
        false,
        5000
      );
      this._hideCaptureFormAndPageSource();
      this._setCaptureSettingsUIsDisabled(true);
      const loginOptionRadios = document.querySelectorAll(
        'input[name="loginOption"]'
      );
      loginOptionRadios.forEach((radio) => (radio.checked = false));

      if (this.loginHandler.loginSection) {
        this.loginHandler.loginSection.style.display = "none";
        this.loginHandler.loginSection.innerHTML = "";
      }
      this._checkCaptureButtonState();
    });
  }

  async _initiateUrlFetching() {
    const selectedSource = document.querySelector(
      'input[name="pageSourceOption"]:checked'
    )?.value;
    if (selectedSource !== "automatic") {
      // If not automatic, clear URL selector (or ensure it's hidden/reset)
      if (
        urlSelector.container &&
        typeof urlSelector.clearRenderedUrls === "function"
      )
        urlSelector.clearRenderedUrls();
      return;
    }

    // Ensure prerequisites for fetching are met (valid base URL, and either guest or logged in)
    const authOk =
      this.loginHandler.getSelectedLoginOption() === "continueWithoutLogin" ||
      this.loginHandler.getLoginStatus();
    if (!this.baseUrlValid || !authOk) {
      if (
        urlSelector.container &&
        typeof urlSelector.showLoadingState === "function"
      ) {
        urlSelector.showLoadingState("Waiting for Project & Authentication...");
      }
      return;
    }

    // Ensure URL selector is initialized
    if (
      !urlSelector.container &&
      typeof urlSelector.initialize === "function" &&
      !document.getElementById("urlSelectorContainer")
    ) {
      await urlSelector.initialize(); // This might create the DOM element
    }
    if (
      !urlSelector.container &&
      !document.getElementById("urlSelectorContainer")
    ) {
      // Re-check after init
      UI.utils.showStatus(
        "UI Error: URL Selector component failed to initialize.",
        true
      );
      return;
    }

    urlSelector.showLoadingState(
      `Loading pages for ${urlFetcher.projectName}...`
    );
    try {
      await urlFetcher.loadUrls(); // Fetches and processes URLs
      if (urlSelector.renderUrlCategories)
        urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
      if (urlSelector.updateSelectionCounter)
        urlSelector.updateSelectionCounter(); // Update count based on loaded URLs
    } catch (error) {
      console.error("Error initiating URL fetching or rendering:", error);
      const displayError =
        error instanceof AppError ? error.message : "Failed to load page list.";
      // Display error within the URL selector area if possible
      if (urlSelector.categoriesContainer) {
        // Check if categoriesContainer exists
        urlSelector.categoriesContainer.innerHTML = `<div class="url-selector-error"><p>${displayError}</p><p>Check server or Project URL. Ensure page listing service is running for '${urlFetcher.projectName}'.</p></div>`;
      } else if (typeof urlSelector.showFallbackUIIfNeeded === "function") {
        urlSelector.showFallbackUIIfNeeded(); // Fallback if categories container not found
      }
      if (urlSelector.updateSelectionCounter)
        urlSelector.updateSelectionCounter(); // Reset counter
    } finally {
      this._checkCaptureButtonState(); // Update capture button based on whether URLs loaded
    }
  }

  async captureScreenshots() {
    const progressOutput = UI.elements.progressOutput;
    const captureWarningMessage = document.getElementById(
      "captureWarningMessage"
    );

    if (!progressOutput) {
      UI.utils.showStatus("UI Error: Progress area missing.", true);
      return;
    }
    progressOutput.style.display = ""; // Show progress area

    if (this._processingQueue) {
      UI.utils.showStatus("Capture is already running...", false, 3000);
      return;
    }

    // Authentication Check
    const authOk =
      this.loginHandler.getSelectedLoginOption() === "continueWithoutLogin" ||
      this.loginHandler.getLoginStatus();
    if (!authOk) {
      UI.utils.showStatus("Please authenticate or continue as guest.", true);
      if (progressOutput) progressOutput.style.display = "none";
      return;
    }
    if (!this.baseUrlValid) {
      // Base URL (Project) Check
      UI.utils.showStatus("Please select a valid Project first.", true);
      if (progressOutput) progressOutput.style.display = "none";
      return;
    }

    this._setCaptureSettingsUIsDisabled(true);
    const projectDropdown = document.getElementById("projectSelectorDropdown");
    if (projectDropdown) projectDropdown.disabled = true;

    this.startTotalTime = performance.now();
    let urlList = [];
    let errorInCaptureSetup = false;

    try {
      AppState.reset();
      UI.utils.resetUI(); // Clear previous thumbnails, stats, etc.
      this._setCaptureSettingsCollapsed(true); // Collapse "Pages" settings section

      const capturePreset =
        UI.elements.capturePreset?.value || config.screenshot.defaultPreset;
      const fullPageCheckbox = document.getElementById("fullPageCheckbox");
      const captureFullPage = fullPageCheckbox
        ? fullPageCheckbox.checked
        : false;

      // Determine selected actions (currently only for advanced mode, but structure is here)
      // const actionsText = UI.elements.actionsField ? UI.elements.actionsField.value : "";
      // let actionSequences = [];
      // if (this.currentMode === "advanced" && actionsText.trim() !== "") {
      //   try {
      //     actionSequences = JSON.parse(actionsText);
      //     if (!Array.isArray(actionSequences)) throw new Error("Actions must be an array.");
      //   } catch (e) {
      //     throw new AppError(`Invalid JSON in Actions field: ${e.message}`);
      //   }
      // }

      // Get URLs from URL Selector
      if (typeof urlSelector.getSelectedUrlsForCapture === "function") {
        urlList = urlSelector.getSelectedUrlsForCapture();
      } else {
        throw new AppError("URL Selector component not available.");
      }

      if (urlList.length === 0) {
        throw new URLProcessingError(
          "Please select at least one page to capture.",
          "No URLs selected"
        );
      }

      UI.progress.updateStats(urlList.length, 0, 0, 0); // Reset stats display
      if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true; // Disable capture button during processing

      if (captureWarningMessage) {
        captureWarningMessage.textContent =
          "The browser needs to be active for screenshots.";
        captureWarningMessage.style.display = "block";
      }

      // Prepare the capture queue
      this.captureQueue = urlList.map((url, index) => ({
        url,
        index,
        capturePreset,
        captureFullPage,
        actionSequences: [], // Placeholder for now, context menu actions are separate
      }));

      this.currentCaptureIndex = 0;
      this.isPaused = false;
      this._processingQueue = true; // Set processing flag
      this.updatePauseResumeButton(); // Update button state
      await this.processCaptureQueue(); // Start processing
    } catch (error) {
      errorInCaptureSetup = true;
      handleError(error, { logToConsole: true, showToUser: true });
      this._processingQueue = false; // Reset flag on error
      this._setCaptureSettingsCollapsed(false); // Re-expand settings on error
      // If setup failed before any captures, hide progress output
      if (
        errorInCaptureSetup &&
        AppState.screenshots.size === 0 &&
        AppState.failedUrls.length === 0
      ) {
        if (progressOutput) progressOutput.style.display = "none";
      }
    } finally {
      const endTime = performance.now();
      const totalTimeTakenMs = this.startTotalTime
        ? endTime - this.startTotalTime
        : 0;
      const totalTimeTakenSec = (totalTimeTakenMs / 1000).toFixed(2);

      if (captureWarningMessage) captureWarningMessage.style.display = "none";

      const isQueueFullyProcessed =
        this.currentCaptureIndex >= this.captureQueue.length;

      if (!this.isPaused) {
        // Only finalize if not paused
        this._processingQueue = false; // Reset processing flag
        this._setCaptureSettingsUIsDisabled(false);
        if (projectDropdown) projectDropdown.disabled = false;

        if (isQueueFullyProcessed && this.startTotalTime > 0) {
          // Ensure capture actually ran
          UI.progress.updateStats(
            this.captureQueue.length,
            AppState.screenshots.size,
            AppState.failedUrls.length,
            totalTimeTakenSec
          );
          if (!errorInCaptureSetup) {
            // Only show completion message if setup was okay
            const failedCount = AppState.failedUrls.length;
            const successCount = AppState.screenshots.size;
            const totalAttempted = this.captureQueue?.length || 0; // Use optional chaining
            const hadFailures = failedCount > 0;
            const icon = hadFailures ? "⚠️ " : "✓ ";
            UI.utils.showStatus(
              `${icon}Capture complete. Processed ${totalAttempted} pages (${successCount} success, ${failedCount} failed).`,
              hadFailures, // isError flag
              0 // Persist message
            );
          }
        } else if (
          !isQueueFullyProcessed &&
          !errorInCaptureSetup &&
          this.startTotalTime > 0
        ) {
          // Capture started but was interrupted (not by pause, e.g. error mid-queue)
          // Or if captureScreenshots itself threw an error *after* some processing
          if (
            AppState.screenshots.size > 0 ||
            AppState.failedUrls.length > 0 ||
            this.captureQueue.length > 0
          ) {
            const failedCount = AppState.failedUrls.length;
            const successCount = AppState.screenshots.size;
            const totalInQueue =
              this.captureQueue?.length || successCount + failedCount;
            const icon = failedCount > 0 ? "⚠️ " : "ℹ️ ";
            UI.utils.showStatus(
              `${icon}Processing finished. Captured ${
                successCount + failedCount
              } of ${totalInQueue} pages.`,
              failedCount > 0,
              0 // Persist
            );
            UI.progress.updateStats(
              totalInQueue,
              successCount,
              failedCount,
              totalTimeTakenSec
            );
          } else if (!errorInCaptureSetup) {
            // No items processed, no setup error
            UI.utils.showStatus("ℹ️ No pages were processed.", false, 0);
          }
        }
      } else {
        // Is paused
        // Update stats even if paused
        if (this.startTotalTime > 0)
          UI.progress.updateStats(
            this.captureQueue.length,
            AppState.screenshots.size,
            AppState.failedUrls.length,
            totalTimeTakenSec
          );
      }
      this._checkCaptureButtonState(); // Re-enable capture button if appropriate
      this.updatePauseResumeButton(); // Update pause/resume button state

      // Update "Combine to PDF" button visibility
      const pdfBtnVisible = AppState.screenshots.size > 0;
      const combineAllPdfBtn = document.querySelector(".combine-all-pdf-btn");
      if (combineAllPdfBtn?.parentElement) {
        const pdfContainer =
          combineAllPdfBtn.closest(".combine-all-pdf-container") ||
          combineAllPdfBtn.parentElement;
        pdfContainer.style.display = pdfBtnVisible ? "flex" : "none";
        combineAllPdfBtn.disabled = !pdfBtnVisible;
      }
      // If setup error and no URLs were selected, hide progress output
      if (
        errorInCaptureSetup &&
        (!urlList || urlList.length === 0) &&
        progressOutput
      ) {
        progressOutput.style.display = "none";
      }
    }
  }

  async processCaptureQueue() {
    const captureWarningMessage = document.getElementById(
      "captureWarningMessage"
    );
    const projectDropdown = document.getElementById("projectSelectorDropdown");

    if (this.isPaused || this.currentCaptureIndex >= this.captureQueue.length) {
      if (this.isPaused) {
        // If paused, ensure processing flag is false
        this._processingQueue = false;
      }
      if (
        !this.isPaused &&
        this.currentCaptureIndex >= this.captureQueue.length
      ) {
        // Queue finished normally
        if (captureWarningMessage) captureWarningMessage.style.display = "none";
        this._setCaptureSettingsUIsDisabled(false);
        if (projectDropdown) projectDropdown.disabled = false;
      }
      return;
    }

    // If resuming or starting, ensure processing flag is true and UI is disabled
    if (!this._processingQueue) {
      // Should be true if called from captureScreenshots, but good check
      this._processingQueue = true;
      this._setCaptureSettingsUIsDisabled(true);
      if (projectDropdown) projectDropdown.disabled = true;
      this.updatePauseResumeButton();
      if (
        captureWarningMessage &&
        captureWarningMessage.style.display === "none" &&
        !this.isPaused
      ) {
        captureWarningMessage.textContent =
          "Browser needs to be active for screenshots.";
        captureWarningMessage.style.display = "block";
      }
    }

    const totalUrls = this.captureQueue.length;
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true; // Should be disabled already

    while (this.currentCaptureIndex < totalUrls && !this.isPaused) {
      const itemIndex = this.currentCaptureIndex; // Get current index before potential async ops
      const item = this.captureQueue[itemIndex];

      if (!item || !item.url) {
        console.error(`Invalid item at queue index ${itemIndex}:`, item);
        AppState.addFailedUrl(`Invalid Item @ Queue Index ${itemIndex}`);
        this.currentCaptureIndex++; // Move to next item
        if (UI.elements.progressBar)
          UI.progress.updateProgress(this.currentCaptureIndex, totalUrls);
        continue; // Skip this invalid item
      }

      const { url, index, capturePreset, captureFullPage, actionSequences } =
        item;

      if (UI.elements.progress)
        UI.progress.updateProgressMessage(
          `⏳ Processing ${
            itemIndex + 1
          } of ${totalUrls}: ${URLProcessor.extractDefaultUrlSegment(url)}`
        );
      if (UI.elements.progressBar)
        UI.progress.updateProgress(itemIndex, totalUrls); // Progress based on items *started*

      let result;
      try {
        result = await ScreenshotCapture.takeScreenshot(
          url,
          capturePreset,
          captureFullPage,
          actionSequences || [] // Ensure actions is an array
        );

        if (this.isPaused) {
          // Check pause state *after* await
          this._processingQueue = false; // Important to allow resume
          break; // Exit loop if paused
        }

        const timestamp = URLProcessor.getTimestamp(); // Generate timestamp *after* capture
        const baseFileName = URLProcessor.generateFilename(url, index, ""); // Pass index, not itemIndex
        const fullPageSuffix = captureFullPage ? "_FullPage" : "";
        const mountIssueSuffix = result.detectedMountIssue
          ? "_MountIssueDetected"
          : "";
        const fileName = baseFileName.replace(
          ".png",
          `${fullPageSuffix}${mountIssueSuffix}_${timestamp}.png`
        );
        result.fileName = fileName; // Add filename to result object

        if (result.detectedMountIssue)
          console.warn(
            `Screenshot for ${url} captured with mount issue: ${result.mountIssueMessage}`
          );

        UI.thumbnails.addLiveThumbnail(result, result.fileName, url);
        AppState.addScreenshot(url, result);
        AppState.removeFailedUrl(url); // Remove if it previously failed and was retried
      } catch (error) {
        if (this.isPaused) {
          // Check pause state *after* await in catch
          this._processingQueue = false;
          break; // Exit loop if paused
        }
        handleError(error, { logToConsole: true, showToUser: false }); // Log, but detailed UI update below
        const timestamp = URLProcessor.getTimestamp();
        const baseFileName = URLProcessor.generateFilename(url, index, "");
        const fullPageSuffix = captureFullPage ? "_FullPage" : "";
        const wasMountIssueCatastrophic =
          error.message?.includes("No view configured") ||
          error.message?.includes("Mount definition");
        const errorSuffix = wasMountIssueCatastrophic
          ? "_MountCaptureFailed"
          : "_Error";
        const fileName = baseFileName.replace(
          ".png",
          `${fullPageSuffix}${errorSuffix}_${timestamp}.png`
        );

        const errorResult = {
          error: true,
          errorMessage: error.message || "Unknown error",
          sequenceName: url, // Or a more descriptive name if available
          url: error.url || url, // Use error.url if ScreenshotError provided it
          detectedMountIssue: wasMountIssueCatastrophic, // From error analysis
          mountIssueMessage: wasMountIssueCatastrophic ? error.message : null,
        };
        UI.thumbnails.addLiveThumbnail(errorResult, fileName, url);
        AppState.addFailedUrl(url);
        const displayError =
          error instanceof ScreenshotError
            ? `(${error.reason || error.message})`
            : `(${error.message || "Unknown"})`;
        UI.utils.showStatus(
          `✗ Failed: ${URLProcessor.extractDefaultUrlSegment(
            url
          )} ${displayError}`,
          true
        );
      }

      this.currentCaptureIndex++; // Increment after processing (success or fail)
      if (UI.elements.progressBar)
        UI.progress.updateProgress(this.currentCaptureIndex, totalUrls); // Progress based on items *completed*

      if (this.currentCaptureIndex < totalUrls && !this.isPaused) {
        // If more items and not paused, delay slightly
        await new Promise((resolve) => setTimeout(resolve, 250)); // Small delay between captures
      }
      if (this.isPaused) {
        // Final check before loop continues or exits
        this._processingQueue = false;
        break;
      }
    }

    // After loop finishes (either completed or paused)
    const isFinished = this.currentCaptureIndex >= totalUrls;
    if (isFinished && !this.isPaused) {
      // Queue fully processed
      this._processingQueue = false; // Reset flag
      this._setCaptureSettingsUIsDisabled(false);
      if (projectDropdown) projectDropdown.disabled = false;
      if (captureWarningMessage) captureWarningMessage.style.display = "none";
      // Final completion message is handled in captureScreenshots's finally block
    } else if (this.isPaused) {
      // UI.utils.showStatus is now handled by captureScreenshots's finally block for paused state
      if (UI.elements.progress)
        UI.utils.showStatus(
          `⏳ Paused at ${
            this.currentCaptureIndex + 1
          } of ${totalUrls}. Resume (▶️) to continue.`,
          false,
          0
        );
      if (captureWarningMessage) captureWarningMessage.style.display = "block"; // Ensure warning visible if paused
    } else {
      // Should not be reached if loop logic is correct, but as a fallback
      this._processingQueue = false;
      this._setCaptureSettingsUIsDisabled(false);
      if (projectDropdown) projectDropdown.disabled = false;
      if (captureWarningMessage) captureWarningMessage.style.display = "none";
    }
    // this.updatePauseResumeButton(); // Ensure button state is correct after loop/pause
  }

  createPauseResumeButton() {
    const buttonContainer = UI.elements.buttonContainer;
    if (!buttonContainer || document.getElementById("pauseResumeBtn")) return; // Already exists or no container

    const pauseResumeBtn = document.createElement("button");
    pauseResumeBtn.id = "pauseResumeBtn";
    pauseResumeBtn.className = "btn icon-btn pause-resume-btn"; // Added 'icon-btn' for consistency if needed
    pauseResumeBtn.innerHTML = "⏸️"; // Pause icon
    pauseResumeBtn.title = "Pause capture";
    events.addDOMEventListener(
      pauseResumeBtn,
      "click",
      this.pauseResumeCapture
    );

    // Insert after captureBtn if it exists, otherwise append
    const captureBtn = UI.elements.captureBtn;
    if (captureBtn && buttonContainer.contains(captureBtn)) {
      captureBtn.insertAdjacentElement("afterend", pauseResumeBtn);
    } else {
      buttonContainer.appendChild(pauseResumeBtn);
    }
    pauseResumeBtn.disabled = true; // Initially disabled
  }

  pauseResumeCapture() {
    this.isPaused = !this.isPaused;
    const captureWarningMessage = document.getElementById(
      "captureWarningMessage"
    );
    const projectDropdown = document.getElementById("projectSelectorDropdown");

    if (this.isPaused) {
      console.log("Pause requested.");
      // Message about pause is handled by processCaptureQueue or captureScreenshots finally block
      if (captureWarningMessage) captureWarningMessage.style.display = "block"; // Show warning
    } else {
      // Resuming
      console.log("Resume requested.");
      this._setCaptureSettingsUIsDisabled(true); // Disable settings while processing
      if (projectDropdown) projectDropdown.disabled = true;
      UI.utils.showStatus("", false, 1); // Clear any "Paused" message

      // Show warning if resuming and items are left
      if (
        captureWarningMessage &&
        this.captureQueue.length > this.currentCaptureIndex
      ) {
        captureWarningMessage.textContent =
          "Browser needs to be active for screenshots.";
        captureWarningMessage.style.display = "block";
      }

      if (
        this.currentCaptureIndex < this.captureQueue.length &&
        !this._processingQueue
      ) {
        // If not already processing (e.g., was truly paused), start/resume the queue
        this.processCaptureQueue();
      } else if (this._processingQueue) {
        // This might happen if resume is clicked very rapidly.
        console.warn(
          "Resume clicked, but processing logic indicates it's already active."
        );
      } else {
        // Queue was already finished, nothing to resume
        if (captureWarningMessage) captureWarningMessage.style.display = "none";
        this._setCaptureSettingsUIsDisabled(false);
        if (projectDropdown) projectDropdown.disabled = false;
      }
    }
    this.updatePauseResumeButton();
  }

  updatePauseResumeButton() {
    const pauseResumeBtn = document.getElementById("pauseResumeBtn");
    if (!pauseResumeBtn) return;

    const hasItemsToProcess =
      this.currentCaptureIndex < this.captureQueue.length;
    const isActivelyProcessing = this._processingQueue && !this.isPaused; // True if running, not paused

    if (this.isPaused) {
      pauseResumeBtn.innerHTML = "▶️"; // Play icon for resume
      pauseResumeBtn.title = "Resume capture";
      pauseResumeBtn.classList.add("paused");
      pauseResumeBtn.disabled = !hasItemsToProcess; // Can only resume if items are left
    } else {
      // Not paused
      pauseResumeBtn.innerHTML = "⏸️"; // Pause icon
      pauseResumeBtn.title = "Pause capture";
      pauseResumeBtn.classList.remove("paused");
      // Can only pause if actively processing AND items are left
      pauseResumeBtn.disabled = !isActivelyProcessing || !hasItemsToProcess;
    }
  }

  _toggleCaptureSettings() {
    const content = document.getElementById("captureSettingsContent");
    const wrapper = document.getElementById("captureSettingsToggle"); // The clickable header/wrapper
    if (!content || !wrapper) return;

    const isCollapsed = content.classList.toggle("collapsed");
    wrapper.classList.toggle("collapsed", isCollapsed); // Sync state for indicator arrow
    console.log(`"Pages" section toggled. Collapsed: ${isCollapsed}`);
  }

  _setCaptureSettingsCollapsed(collapsed) {
    const content = document.getElementById("captureSettingsContent");
    const wrapper = document.getElementById("captureSettingsToggle");
    if (!content || !wrapper) return;

    content.classList.toggle("collapsed", collapsed);
    wrapper.classList.toggle("collapsed", collapsed);
  }
}

export default App;
