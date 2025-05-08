// perspective_capture/js/app.js
import config from "./config.js";
import AppState from "./state.js";
import UI from "./ui/index.js";
import URLProcessor from "./url-processor.js";
import * as ScreenshotCapture from "./screenshot/core.js";
import ContextMenuActionsHelper from "./context-menu-actions-helper.js";
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
    this.currentMode = "simple"; // Default to simple mode
    this.captureScreenshots = this.captureScreenshots.bind(this);
    this._handleActionsInput = this._handleActionsInput.bind(this);
    // this.generatePrefilledUrl = this.generatePrefilledUrl.bind(this); // Deprecated by project dropdown
    // this.prefilledUrl = null; // Deprecated
    this.baseUrl = ""; // This will be the full Project URL: http://.../client/PROJECT_NAME
    this.baseUrlValid = false;
    this.gatewayBaseForProjects = ""; // E.g. http://GATEWAY_IP:PORT/data/perspective/client/
    this.loginHandler = LoginHandler;

    this.isPaused = false;
    this.captureQueue = [];
    this.currentCaptureIndex = 0;
    this.pauseResumeCapture = this.pauseResumeCapture.bind(this);
    this._handleBaseUrlInput = this._handleBaseUrlInput.bind(this);
    this._handleProjectSelection = this._handleProjectSelection.bind(this);
    this._fetchAndPopulateProjects = this._fetchAndPopulateProjects.bind(this);
    this._initiateUrlFetching = this._initiateUrlFetching.bind(this);
    this._processingQueue = false;
    this.startTotalTime = 0;
    this._toggleCaptureSettings = this._toggleCaptureSettings.bind(this);
    this._handleSourceChange = this._handleSourceChange.bind(this);
    this._handleLoadManualSource = this._handleLoadManualSource.bind(this);
    this._handleFileUpload = this._handleFileUpload.bind(this);
  }

  initialize() {
    const baseUrlInput = document.getElementById("baseUrlInput");
    if (baseUrlInput) {
      baseUrlInput.value = "";
      baseUrlInput.readOnly = true; // Make it read-only as it's auto-populated
    }
    const projectDropdown = document.getElementById("projectSelectorDropdown");
    if (projectDropdown) {
      projectDropdown.disabled = true; // Disable until projects are loaded
    }

    this._deriveGatewayBaseForProjects();
    this._setupEventListeners();
    this._initializeUI();
    this._setupEventHandlers();

    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");

    this.loginHandler.initialize();
    this._fetchAndPopulateProjects(); // Fetch projects on init

    const baseUrlSection = document.getElementById("baseUrlSection"); // This now contains the dropdown and the text input
    const loginOptionSection = document.getElementById("loginOptionSection");
    const loginSection = document.getElementById("loginSection");
    const captureForm = UI.elements.captureForm;
    const progressOutput = UI.elements.progressOutput;

    if (
      !baseUrlSection ||
      !loginOptionSection ||
      !loginSection ||
      !captureForm ||
      !progressOutput ||
      !baseUrlInput
    ) {
      console.error(
        "Initialization Error: One or more critical UI elements not found."
      );
      return;
    }

    baseUrlSection.style.display = "";
    // _handleBaseUrlInput is now triggered by _handleProjectSelection or manual override (if re-enabled)
    this._setCaptureUIsDisabled(false); // Ensure UIs are enabled on init (except capture button)

    console.log("Application initialized.");
  }

  _deriveGatewayBaseForProjects() {
    // Attempt to derive the part of the URL before the project name.
    // Example: http://localhost:8088/data/perspective/client/
    // This needs to be robust for your environment.
    try {
      const currentHref = window.location.href;
      // Regex to capture up to /data/perspective/client/
      // This assumes the tool is hosted in a way that this part of the URL is consistent relative to the gateway.
      // A more robust way could be configuration or a specific endpoint to get this base.
      const match = currentHref.match(
        /^(https?:\/\/[^\/]+\/data\/perspective\/client\/)/i
      );
      if (match && match[1]) {
        this.gatewayBaseForProjects = match[1];
        console.log(
          "Gateway base for project URLs derived:",
          this.gatewayBaseForProjects
        );
      } else {
        // Fallback if regex fails - This is a critical configuration.
        // You might want to make this a configurable value in config.js
        this.gatewayBaseForProjects =
          "http://localhost:8088/data/perspective/client/"; // Adjust this fallback
        console.warn(
          "Could not derive gateway base for projects from window.location. Using fallback:",
          this.gatewayBaseForProjects
        );
      }
    } catch (e) {
      console.error("Error deriving gateway base for projects:", e);
      this.gatewayBaseForProjects =
        "http://localhost:8088/data/perspective/client/"; // Default fallback
    }
  }

  async _fetchAndPopulateProjects() {
    const projectDropdown = document.getElementById("projectSelectorDropdown");
    const baseUrlStatus = document.getElementById("baseUrlStatus"); // For error messages related to project loading
    const refreshBtn = document.getElementById("refreshProjectsBtn");

    if (!projectDropdown || !baseUrlStatus || !refreshBtn) return;

    projectDropdown.disabled = true;
    refreshBtn.disabled = true;
    projectDropdown.innerHTML = '<option value="">Loading projects...</option>';
    baseUrlStatus.textContent = ""; // Clear previous status

    try {
      const projects = await urlFetcher.fetchProjectList();
      projectDropdown.innerHTML =
        '<option value="">-- Select a Project --</option>'; // Default option
      if (projects && projects.length > 0) {
        projects.forEach((project) => {
          const option = document.createElement("option");
          option.value = project;
          option.textContent = project;
          projectDropdown.appendChild(option);
        });
        projectDropdown.disabled = false;
        baseUrlStatus.textContent = "Select a project to continue."; // Prompt
        baseUrlStatus.style.color = "initial";
      } else {
        projectDropdown.innerHTML =
          '<option value="">No projects found</option>';
        baseUrlStatus.textContent =
          "No projects available or error fetching list.";
        baseUrlStatus.style.color = "orange";
      }
    } catch (error) {
      console.error("Failed to fetch or populate project list:", error);
      projectDropdown.innerHTML =
        '<option value="">Error loading projects</option>';
      projectDropdown.disabled = true; // Keep disabled on error
      baseUrlStatus.textContent =
        error.message ||
        "Could not load project list. Check gateway connection or console.";
      baseUrlStatus.style.color = "red";
    } finally {
      refreshBtn.disabled = false;
    }
  }

  _setCaptureUIsDisabled(disabled) {
    //const baseUrlInput = document.getElementById("baseUrlInput"); // Now read-only, mainly for display
    const projectDropdown = document.getElementById("projectSelectorDropdown");
    const refreshProjectsBtn = document.getElementById("refreshProjectsBtn");
    const capturePresetSelect = UI.elements.capturePreset;
    const fullPageCheckbox = document.getElementById("fullPageCheckbox");
    const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
    const loginOptionRadios = document.querySelectorAll(
      'input[name="loginOption"]'
    );

    //if (baseUrlInput) baseUrlInput.disabled = disabled; // Keep enabled but read-only potentially
    if (projectDropdown) projectDropdown.disabled = disabled;
    if (refreshProjectsBtn) refreshProjectsBtn.disabled = disabled;

    if (capturePresetSelect) capturePresetSelect.disabled = disabled;
    if (fullPageCheckbox) fullPageCheckbox.disabled = disabled;
    if (simpleWaitTimeInput) simpleWaitTimeInput.disabled = disabled;

    loginOptionRadios.forEach((radio) => (radio.disabled = disabled));

    console.log(
      `Critical Capture UIs (Project Select, Settings, Login Options) ${
        disabled ? "Disabled" : "Enabled"
      }.`
    );
  }

  // Inside your App class in js/app.js

  _handleProjectSelection(event) {
    const selectedProjectName = event.target.value;
    const baseUrlInputElement = document.getElementById("baseUrlInput");
    const statusElement = document.getElementById("baseUrlStatus");
    const loginOptionSection = document.getElementById("loginOptionSection"); // Get the section

    if (!baseUrlInputElement || !statusElement || !loginOptionSection) return;

    statusElement.textContent = ""; // Clear previous status

    // --- NEW: Reset login options when a new project is selected ---
    const loginRadios = loginOptionSection.querySelectorAll(
      'input[name="loginOption"]'
    );
    loginRadios.forEach((radio) => {
      radio.checked = false;
    });
    // Also immediately hide the login section itself if it was visible
    const loginSection = document.getElementById("loginSection");
    if (loginSection) loginSection.style.display = "none";
    // And hide the capture form and page source selector until a login option is chosen
    const captureForm = UI.elements.captureForm;
    const pageSourceSelection = document.getElementById("pageSourceSelection");
    if (captureForm) captureForm.style.display = "none";
    if (pageSourceSelection) pageSourceSelection.style.display = "none";
    // Reset login handler state slightly differently here - we know a project *is* selected,
    // but the login choice is cleared. Keep the login handler itself intact but ensure it knows
    // the UI choice is reset. Setting isLoggedIn to false might be too strong if they were previously logged in.
    // Let the selection of a login option re-trigger the necessary loginHandler logic.
    // We *do* need to ensure the capture button is disabled at this stage.
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
    // Clear previous URL selector content as well
    if (urlSelector.cleanup) urlSelector.cleanup();
    // -----------------------------------------------------------

    if (!selectedProjectName) {
      baseUrlInputElement.value = "";
      // Trigger reset logic in _handleBaseUrlInput (which also hides login options etc.)
      this._handleBaseUrlInput({ target: baseUrlInputElement });
      return;
    }

    if (!this.gatewayBaseForProjects) {
      console.error(
        "Gateway base URL for projects is not set. Cannot construct project URL."
      );
      statusElement.textContent = "Error: Gateway configuration missing.";
      statusElement.style.color = "red";
      baseUrlInputElement.value = "";
      this._handleBaseUrlInput({ target: baseUrlInputElement }); // Trigger reset
      return;
    }

    const fullProjectUrl = this.gatewayBaseForProjects + selectedProjectName;
    baseUrlInputElement.value = fullProjectUrl;

    // Programmatically trigger the _handleBaseUrlInput logic
    // This will validate the URL, set the project name, and enable the login options section
    this._handleBaseUrlInput({ target: baseUrlInputElement });

    // Note: _checkCaptureButtonState is called within _handleBaseUrlInput,
    // so the capture button state will be updated correctly based on the now-unchecked login option.
  }

  _handleBaseUrlInput(event) {
    // This function now primarily validates the URL set by project selection
    const url = event.target.value.trim(); // URL is now from the text input, populated by dropdown
    const statusElement = document.getElementById("baseUrlStatus");
    const loginOptionSection = document.getElementById("loginOptionSection");
    const loginSection = document.getElementById("loginSection");
    const captureForm = UI.elements.captureForm;
    const progressOutput = UI.elements.progressOutput;
    const pageSourceSelection = document.getElementById("pageSourceSelection");

    if (
      !statusElement ||
      !loginOptionSection ||
      !loginSection ||
      !captureForm ||
      !progressOutput ||
      !pageSourceSelection
    ) {
      console.error("Base URL change handler: Required UI sections not found!");
      return;
    }

    // Reset downstream UI elements and states IF the URL becomes invalid or empty
    if (!url || !url.includes("/client/")) {
      this.baseUrlValid = false;
      this.baseUrl = url;
      if (url && !url.includes("/client/")) {
        statusElement.textContent =
          "Invalid URL format. Expected .../client/PROJECT_NAME";
        statusElement.style.color = "red";
      } else if (!url) {
        statusElement.textContent =
          "Select a project or ensure URL is correct."; // Changed message
        statusElement.style.color = "initial";
      }
      if (urlFetcher) urlFetcher.projectName = "";
      this._disableLoginOptions();
      loginOptionSection.style.display = "none";
      loginSection.style.display = "none";
      captureForm.style.display = "none";
      progressOutput.style.display = "none";
      pageSourceSelection.style.display = "none";

      // Reset login options
      const loginRadios = document.querySelectorAll(
        'input[name="loginOption"]'
      );
      loginRadios.forEach((radio) => {
        radio.checked = false;
      });

      if (this.loginHandler) {
        this.loginHandler.isLoggedIn = false;
        this.loginHandler.loggedInUsername = null;
        this.loginHandler.stopSessionPolling();
        this.loginHandler.stopSessionMonitor();
        this.loginHandler.hideLoginFrame();
        if (typeof this.loginHandler.updateLoginStatus === "function") {
          this.loginHandler.updateLoginStatus(
            "logged-out",
            "Not authenticated"
          );
        }
      }
      if (urlSelector.cleanup) urlSelector.cleanup();
      this._checkCaptureButtonState();
      return;
    }

    const success = urlFetcher.setBaseClientUrl(url);
    if (success) {
      this.baseUrl = urlFetcher.baseClientUrl;
      this.baseUrlValid = true;
      statusElement.textContent = `Project: ${urlFetcher.projectName}`; // Show selected project
      statusElement.style.color = "green";
      loginOptionSection.style.display = "block";
      this._enableLoginOptions();
    } else {
      this.baseUrlValid = false;
      this.baseUrl = url;
      statusElement.textContent = "Could not extract project name from URL.";
      statusElement.style.color = "red";
      if (urlFetcher) urlFetcher.projectName = "";
      this._disableLoginOptions();
      // Hide downstream sections if project name extraction fails
      loginOptionSection.style.display = "none";
      loginSection.style.display = "none";
      captureForm.style.display = "none";
      pageSourceSelection.style.display = "none";
    }
    this._checkCaptureButtonState();
  }

  _setupEventListeners() {
    // const baseUrlInput = document.getElementById("baseUrlInput"); // Input is now read-only and driven by dropdown
    // if (baseUrlInput) {
    //   events.addDOMEventListener(baseUrlInput, "input", this._handleBaseUrlInput);
    //   events.addDOMEventListener(baseUrlInput, "blur", this._handleBaseUrlInput);
    // }

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

    const refreshProjectsBtn = document.getElementById("refreshProjectsBtn");
    if (refreshProjectsBtn) {
      events.addDOMEventListener(
        refreshProjectsBtn,
        "click",
        this._fetchAndPopulateProjects
      );
    } else {
      console.error("#refreshProjectsBtn element not found!");
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
  }

  // ... (rest of _initializeUI, _ensureHiddenWaitTimeStorage, _disableLoginOptions, _enableLoginOptions remain largely the same) ...
  _initializeUI() {
    this._ensureHiddenWaitTimeStorage();

    const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
    const hiddenWaitTimeInput = document.getElementById("hiddenWaitTime");
    const defaultWait = String(config.ui.defaultWaitTime || 5);

    if (simpleWaitTimeInput) simpleWaitTimeInput.value = defaultWait;
    if (hiddenWaitTimeInput) hiddenWaitTimeInput.value = defaultWait;

    UI.elements.waitTime = simpleWaitTimeInput || hiddenWaitTimeInput;

    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
    this.createPauseResumeButton();
    this._setCaptureSettingsCollapsed(false);
    const manualArea = document.getElementById("manualJsonInputArea");
    if (manualArea) manualArea.style.display = "none";
    const pageSourceSelection = document.getElementById("pageSourceSelection");
    if (pageSourceSelection) pageSourceSelection.style.display = "none";

    // Ensure baseUrlInput is marked as readOnly if project dropdown is the primary mechanism
    const baseUrlInput = document.getElementById("baseUrlInput");
    if (baseUrlInput && document.getElementById("projectSelectorDropdown")) {
      baseUrlInput.readOnly = true;
    }
  }

  _ensureHiddenWaitTimeStorage() {
    let hiddenWaitTime = document.getElementById("hiddenWaitTime");
    if (!hiddenWaitTime) {
      hiddenWaitTime = document.createElement("input");
      hiddenWaitTime.type = "hidden";
      hiddenWaitTime.id = "hiddenWaitTime";
      hiddenWaitTime.value = String(config.ui.defaultWaitTime || 5);
      document.body.appendChild(hiddenWaitTime);
    }
    if (!UI.elements.waitTime) {
      const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
      UI.elements.waitTime = simpleWaitTimeInput || hiddenWaitTime;
    }
  }

  _disableLoginOptions() {
    const radios = document.querySelectorAll('input[name="loginOption"]');
    radios.forEach((radio) => {
      radio.disabled = true;
      radio.checked = false;
    });
    // Also hide the login option section itself
    const loginOptionSection = document.getElementById("loginOptionSection");
    if (loginOptionSection) loginOptionSection.style.display = "none";
  }

  _enableLoginOptions() {
    const radios = document.querySelectorAll('input[name="loginOption"]');
    radios.forEach((radio) => (radio.disabled = false));
    // Show the login option section
    const loginOptionSection = document.getElementById("loginOptionSection");
    if (loginOptionSection) loginOptionSection.style.display = "block";
  }

  _updateUIMode() {
    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");
    const advancedOptionsEl = document.getElementById("advancedOptions");
    if (advancedOptionsEl) advancedOptionsEl.style.display = "none";
    this._setupSimpleModeSettings();
    setTimeout(async () => {
      if (typeof urlSelector.initialize === "function") {
        try {
          await urlSelector.initialize();
          if (UI.elements.captureForm.style.display !== "none") {
            this._handleSourceChange(); // This will trigger page fetching if 'automatic' and conditions met
          }
        } catch (error) {
          console.error(
            "Failed to initialize URL selector in _updateUIMode:",
            error
          );
          if (typeof urlSelector.showFallbackUIIfNeeded === "function") {
            urlSelector.showFallbackUIIfNeeded();
          }
        }
      }
      this._checkCaptureButtonState();
    }, 0);
    UI.utils.resetUI();
  }

  _setupSimpleModeSettings() {
    const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
    const hiddenWaitTimeInput = document.getElementById("hiddenWaitTime");
    if (simpleWaitTimeInput) {
      UI.elements.waitTime = simpleWaitTimeInput;
      if (hiddenWaitTimeInput && simpleWaitTimeInput.value) {
        hiddenWaitTimeInput.value = simpleWaitTimeInput.value;
      }
    } else if (hiddenWaitTimeInput) {
      UI.elements.waitTime = hiddenWaitTimeInput;
    } else {
      console.error(
        "Critical UI Error: No wait time input found for simple mode settings."
      );
    }
  }

  _handleActionsInput() {
    console.log("Actions input changed (managed by ContextMenuActionsHelper).");
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

    if (!manualArea) {
      console.error("Manual JSON input area not found during source change.");
      return;
    }
    if (manualJsonStatus) manualJsonStatus.textContent = "";

    // Always clear URL selector's selected URLs when source type changes
    if (urlSelector.selectedUrls) urlSelector.selectedUrls.clear();

    if (selectedSource === "manual") {
      manualArea.style.display = "";
      if (urlSelectorContainer) urlSelectorContainer.style.display = "none";
      if (urlSelector.clearRenderedUrls) urlSelector.clearRenderedUrls();
      if (urlFetcher) {
        urlFetcher.dataLoadedDirectly = false;
        urlFetcher.urlsList = [];
        urlFetcher.categorizedUrls = {};
      }
      this.captureQueue = [];
      AppState.reset();
      UI.utils.resetUI();
      if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
    } else {
      // 'automatic'
      manualArea.style.display = "none";
      if (urlSelectorContainer) {
        urlSelectorContainer.style.display = "";
      } else if (
        typeof urlSelector.initialize === "function" &&
        !document.getElementById("urlSelectorContainer")
      ) {
        console.warn(
          "URL Selector container not ready for 'automatic' source change. Attempting init then fetch."
        );
      }
      if (urlSelector.clearRenderedUrls) urlSelector.clearRenderedUrls();
      if (jsonTextArea) jsonTextArea.value = "";
      if (fileInput) fileInput.value = "";
      if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";

      if (this.baseUrlValid && this.loginHandler.isAuthenticatedForCapture()) {
        this._initiateUrlFetching(); // Fetches pages for the selected project
      } else {
        if (
          urlSelector.container &&
          typeof urlSelector.showLoadingState === "function"
        ) {
          urlSelector.showLoadingState(
            "Waiting for Project Selection & Authentication..."
          );
        }
        if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
      }
    }
    this._checkCaptureButtonState();
  }

  async _handleFileUpload(event) {
    const fileInput = event.target;
    const fileNameDisplay = document.getElementById("fileNameDisplay");
    const manualJsonStatus = document.getElementById("manualJsonStatus");
    const jsonTextArea = document.getElementById("manualJsonText");

    if (manualJsonStatus) {
      manualJsonStatus.textContent = "";
      manualJsonStatus.style.color = "";
    }
    if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";

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
      fileInput.value = "";
      return;
    }
    if (fileNameDisplay) fileNameDisplay.textContent = file.name;
    try {
      const fileContent = await this._readFileContent(file);
      if (jsonTextArea) {
        jsonTextArea.value = fileContent;
        console.log(`File "${file.name}" content loaded into textarea.`);
        // Automatically enable Load Pages button if content is now in textarea
        const loadManualBtn = document.getElementById("loadManualJsonBtn");
        if (loadManualBtn) loadManualBtn.disabled = false;
      }
    } catch (readError) {
      console.error("Error reading file:", readError);
      if (manualJsonStatus) {
        manualJsonStatus.textContent = `Error reading file: ${readError.message}`;
        manualJsonStatus.style.color = "red";
      }
      if (fileNameDisplay) fileNameDisplay.textContent = "Error reading file";
      fileInput.value = "";
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
    const fileInput = document.getElementById("manualJsonFile");
    const fileNameDisplay = document.getElementById("fileNameDisplay");

    if (!jsonTextArea || !manualJsonStatus || !loadBtn) {
      console.error("Cannot load manual source: Crucial UI elements missing.");
      return;
    }
    manualJsonStatus.textContent = "";
    manualJsonStatus.style.color = "";
    loadBtn.disabled = true;
    loadBtn.textContent = "Loading...";
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;

    const sourceContent = jsonTextArea.value.trim();
    const sourceDescription = fileInput?.files?.[0]?.name
      ? `file "${fileInput.files[0].name}"`
      : "textarea content";

    if (fileInput) fileInput.value = "";
    if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";

    if (!sourceContent) {
      manualJsonStatus.textContent =
        "Error: No JSON content to load (paste or upload a file).";
      manualJsonStatus.style.color = "red";
      loadBtn.disabled = false;
      loadBtn.textContent = "Load Pages";
      return;
    }
    try {
      manualJsonStatus.textContent = `Processing ${sourceDescription}...`;
      manualJsonStatus.style.color = "orange";
      await urlFetcher.setDataDirectly(sourceContent);
      if (urlFetcher.dataLoadedDirectly) {
        if (urlSelector.container) {
          urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
          if (urlSelectorContainer) urlSelectorContainer.style.display = "";
        } else if (typeof urlSelector.initialize === "function") {
          console.warn(
            "URL Selector was not initialized, attempting now for manual load."
          );
          await urlSelector.initialize();
          if (urlSelector.container) {
            urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
            if (urlSelectorContainer) urlSelectorContainer.style.display = "";
          } else {
            throw new Error(
              "Failed to initialize URL Selector for displaying manual data."
            );
          }
        }
        manualJsonStatus.textContent = `Success: Loaded ${urlFetcher.urlsList.length} pages from ${sourceDescription}. Select pages to capture.`;
        manualJsonStatus.style.color = "green";
      } else {
        const errorMsg =
          urlFetcher.error?.message ||
          "Failed to process JSON data. Check format and console.";
        manualJsonStatus.textContent = `Error: ${errorMsg}`;
        manualJsonStatus.style.color = "red";
        if (urlSelector.clearRenderedUrls) urlSelector.clearRenderedUrls();
        if (urlSelectorContainer) urlSelectorContainer.style.display = "none";
        if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
      }
    } catch (error) {
      console.error(
        `Error loading manual source from ${sourceDescription}:`,
        error
      );
      const errorMsg =
        error instanceof AppError
          ? error.message
          : "Invalid JSON format or structure.";
      manualJsonStatus.textContent = `Error: ${errorMsg}`;
      manualJsonStatus.style.color = "red";
      if (urlSelector.clearRenderedUrls) urlSelector.clearRenderedUrls();
      if (urlSelectorContainer) urlSelectorContainer.style.display = "none";
      if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = "Load Pages";
      this._checkCaptureButtonState();
    }
  }

  _readFileContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target.result);
      reader.onerror = (event) =>
        reject(
          new Error(
            "File could not be read. Error code: " +
              (event.target.error?.code || "unknown")
          )
        );
      reader.readAsText(file);
    });
  }

  _checkCaptureButtonState() {
    const captureBtn = UI.elements.captureBtn;
    const buttonContainer = UI.elements.buttonContainer;
    const loadManualBtn = document.getElementById("loadManualJsonBtn");

    if (!captureBtn || !buttonContainer) {
      console.warn(
        "Capture button or its container not found, cannot update state."
      );
      return;
    }
    const selectedSource = document.querySelector(
      'input[name="pageSourceOption"]:checked'
    )?.value;
    if (loadManualBtn && selectedSource === "manual") {
      const jsonTextArea = document.getElementById("manualJsonText");
      loadManualBtn.disabled = !(jsonTextArea && jsonTextArea.value.trim());
    } else if (loadManualBtn) {
      loadManualBtn.disabled = true;
    }

    const prerequisitesMet =
      !this._processingQueue &&
      this.baseUrlValid &&
      this.loginHandler.isAuthenticatedForCapture();
    let urlsAvailableAndSelected = false;
    if (selectedSource === "automatic") {
      urlsAvailableAndSelected =
        urlFetcher.urlsList.length > 0 && urlSelector.selectedUrls.size > 0;
    } else if (selectedSource === "manual") {
      urlsAvailableAndSelected =
        urlFetcher.dataLoadedDirectly && urlSelector.selectedUrls.size > 0;
    }
    const isReadyToCapture = prerequisitesMet && urlsAvailableAndSelected;
    captureBtn.disabled = !isReadyToCapture;

    const captureFormVisible = UI.elements.captureForm.style.display !== "none";
    if (captureFormVisible) {
      buttonContainer.style.display = "flex";
      buttonContainer.classList.remove("hidden");
    } else {
      buttonContainer.style.display = "none";
      buttonContainer.classList.add("hidden");
    }
  }

  _setupEventHandlers() {
    events.on(events.events.CAPTURE_PROGRESS, (data) => {
      if (data && data.message && UI.elements.progress) {
        let messageWithIcon = data.message;
        if (
          !messageWithIcon.startsWith("✓ ") &&
          !messageWithIcon.startsWith("✗ ") &&
          !messageWithIcon.startsWith("⚠️ ") &&
          !messageWithIcon.startsWith("ℹ️ ") &&
          !messageWithIcon.startsWith("⏳ ")
        ) {
          messageWithIcon = "⏳ " + data.message;
        }
        UI.progress.updateProgressMessage(messageWithIcon);
      }
    });
    events.on(events.events.SCREENSHOT_TAKEN, (data) => {
      if (!data || !data.result) return;
      const preset = data.result.preset || "N/A";
      const presetName = config.screenshot.presets[preset]?.name || preset;
      const width = data.result.width || "?";
      const height = data.result.height || "?";
      const timeTaken = data.result.timeTaken || "?";
      const isFullPage = data.result.isFullPage || false;
      const sizeDesc = isFullPage
        ? `Full Page (${width}x${height})`
        : `${presetName}`;
      const url = data.url || data.result.url || "Unknown URL";
      const pageName = url.split("/").pop() || url;
      if (data.result.detectedMountIssue) {
        UI.utils.showStatus(
          `⚠️ Captured with mount issue: ${pageName} (${sizeDesc}) (${timeTaken}s)`,
          false,
          7000
        );
      } else {
        UI.utils.showStatus(
          `✓ Captured: ${pageName} (${sizeDesc}) (${timeTaken}s)`,
          false,
          5000
        );
      }
    });
    events.on("URL_SELECTION_CHANGED", (data) =>
      this._checkCaptureButtonState()
    );
    events.on("LOGIN_OPTION_SELECTED", (data) => {
      if (!this.baseUrlValid && data.option === "login") {
        // Only block if trying to use login without valid base URL
        UI.utils.showStatus(
          "Please select or enter a valid Project URL first.",
          true
        );
        // Reset the radio button if possible or provide feedback
        const radioLogin = document.getElementById("optionLogin");
        if (radioLogin) radioLogin.checked = false; // Attempt to uncheck
        return;
      }

      this.loginHandler.handleLoginOptionChange(data.option);
      const captureForm = UI.elements.captureForm;
      const pageSourceSelection = document.getElementById(
        "pageSourceSelection"
      );
      if (
        data.option === "continueWithoutLogin" ||
        (data.option === "login" && this.loginHandler.isLoggedIn)
      ) {
        if (captureForm) captureForm.style.display = "";
        if (pageSourceSelection) pageSourceSelection.style.display = "";
        this._updateUIMode();
      } else if (data.option === "login" && !this.loginHandler.isLoggedIn) {
        if (captureForm) captureForm.style.display = "none";
        if (pageSourceSelection) pageSourceSelection.style.display = "none";
      }
      this._checkCaptureButtonState();
    });
    events.on("LOGIN_COMPLETE", (data) => {
      const captureForm = UI.elements.captureForm;
      const pageSourceSelection = document.getElementById(
        "pageSourceSelection"
      );
      if (data.loggedIn) {
        if (captureForm) captureForm.style.display = "";
        if (pageSourceSelection) pageSourceSelection.style.display = "";
        this._updateUIMode();
      } else {
        if (this.loginHandler.getSelectedLoginOption() === "login") {
          UI.utils.showStatus(
            "Login failed. Select 'Continue as Guest' or try login again.",
            true
          );
        }
        if (captureForm) captureForm.style.display = "none";
        if (pageSourceSelection) pageSourceSelection.style.display = "none";
      }
      this._checkCaptureButtonState();
    });
    events.on("AUTO_LOGOUT_DETECTED", (data) => {
      console.log(
        `App received AUTO_LOGOUT_DETECTED for user: ${
          data ? data.username : "unknown"
        }`
      );
      UI.utils.showStatus(
        `Your session has expired. Please log in again.`,
        true,
        0
      );
      const captureForm = UI.elements.captureForm;
      const progressOutput = UI.elements.progressOutput;
      const pageSourceSelection = document.getElementById(
        "pageSourceSelection"
      );
      const captureSettingsContent = document.getElementById(
        "captureSettingsContent"
      );
      if (captureForm) captureForm.style.display = "none";
      if (progressOutput) progressOutput.style.display = "none";
      if (pageSourceSelection) pageSourceSelection.style.display = "none";
      if (
        captureSettingsContent &&
        !captureSettingsContent.classList.contains("collapsed")
      ) {
        this._setCaptureSettingsCollapsed(true);
      }
      if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
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
  }

  async _initiateUrlFetching() {
    // For fetching pages within a selected project
    const selectedSource = document.querySelector(
      'input[name="pageSourceOption"]:checked'
    )?.value;
    if (selectedSource !== "automatic") {
      if (
        urlSelector.container &&
        typeof urlSelector.clearRenderedUrls === "function"
      )
        urlSelector.clearRenderedUrls();
      return;
    }
    if (!this.baseUrlValid || !this.loginHandler.isAuthenticatedForCapture()) {
      if (
        urlSelector.container &&
        typeof urlSelector.showLoadingState === "function"
      ) {
        urlSelector.showLoadingState(
          "Waiting for Project Selection & Authentication..."
        );
      }
      return;
    }
    if (
      !urlSelector.container &&
      typeof urlSelector.initialize === "function" &&
      !document.getElementById("urlSelectorContainer")
    ) {
      await urlSelector.initialize();
    }
    if (!urlSelector.container) {
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
      await urlFetcher.loadUrls(); // Fetches pages for the project set in urlFetcher.projectName
      if (urlSelector.renderUrlCategories)
        urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
      if (urlSelector.updateSelectionCounter)
        urlSelector.updateSelectionCounter();
    } catch (error) {
      const displayError =
        error instanceof AppError
          ? error.message
          : "Failed to load page list from server.";
      if (urlSelector.categoriesContainer) {
        urlSelector.categoriesContainer.innerHTML = `<div class="url-selector-error"><p>${displayError}</p><p>Check server connection or Project URL. Ensure the backend service for listing pages is running correctly for project '${urlFetcher.projectName}'.</p></div>`;
      } else if (typeof urlSelector.showFallbackUIIfNeeded === "function") {
        urlSelector.showFallbackUIIfNeeded();
      }
      if (urlSelector.updateSelectionCounter)
        urlSelector.updateSelectionCounter();
    } finally {
      this._checkCaptureButtonState();
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
    progressOutput.style.display = "";

    if (this._processingQueue) {
      UI.utils.showStatus("Capture is already running...", false, 3000);
      return;
    }
    if (!this.loginHandler.isAuthenticatedForCapture()) {
      UI.utils.showStatus("Please authenticate or continue as guest.", true);
      if (progressOutput) progressOutput.style.display = "none";
      return;
    }
    if (!this.baseUrlValid) {
      UI.utils.showStatus("Please select a valid Project first.", true); // Updated message
      if (progressOutput) progressOutput.style.display = "none";
      return;
    }
    this._setCaptureUIsDisabled(true);
    this.startTotalTime = performance.now();
    let urlList = [];
    let errorInCaptureSetup = false;

    try {
      AppState.reset();
      UI.utils.resetUI();
      this._setCaptureSettingsCollapsed(true);
      const capturePreset =
        UI.elements.capturePreset?.value || config.screenshot.defaultPreset;
      const fullPageCheckbox = document.getElementById("fullPageCheckbox");
      const captureFullPage = fullPageCheckbox
        ? fullPageCheckbox.checked
        : false;
      if (typeof urlSelector.getSelectedUrlsForCapture === "function") {
        urlList = urlSelector.getSelectedUrlsForCapture();
      } else {
        errorInCaptureSetup = true;
        throw new AppError(
          "URL Selector component not available or not initialized."
        );
      }
      if (urlList.length === 0) {
        errorInCaptureSetup = true;
        throw new URLProcessingError(
          "Please select at least one page to capture.",
          "No URLs selected"
        );
      }
      UI.progress.updateStats(urlList.length, 0, 0, 0);
      if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
      if (captureWarningMessage) {
        captureWarningMessage.textContent =
          "The browser needs to be active for the screenshot to be captured properly";
        captureWarningMessage.style.display = "block";
      }
      this.captureQueue = urlList.map((url, index) => ({
        url,
        index,
        capturePreset,
        captureFullPage,
        actionSequences: [],
      }));
      this.currentCaptureIndex = 0;
      this.isPaused = false;
      this._processingQueue = true;
      this.updatePauseResumeButton();
      await this.processCaptureQueue();
    } catch (error) {
      errorInCaptureSetup = true;
      handleError(error, { logToConsole: true, showToUser: true });
      this._processingQueue = false;
      this._setCaptureSettingsCollapsed(false);
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
      const isQueueFullyProcessed =
        this.currentCaptureIndex >= this.captureQueue.length;
      if (captureWarningMessage) captureWarningMessage.style.display = "none";
      if (!this.isPaused) {
        this._processingQueue = false;
        this._setCaptureUIsDisabled(false);
        if (isQueueFullyProcessed && this.startTotalTime > 0) {
          UI.progress.updateStats(
            this.captureQueue.length,
            AppState.screenshots.size,
            AppState.failedUrls.length,
            totalTimeTakenSec
          );
          if (!errorInCaptureSetup) {
            const failedCount = AppState.failedUrls.length;
            const successCount = AppState.screenshots.size;
            const totalProcessedOrAttempted = this.captureQueue?.length || 0;
            const hadFailures = failedCount > 0;
            const icon = hadFailures ? "⚠️ " : "✓ ";
            const completionMessageText = `Capture complete. Processed ${totalProcessedOrAttempted} pages (${successCount} success, ${failedCount} failed).`;
            UI.utils.showStatus(icon + completionMessageText, hadFailures, 0);
          }
        } else if (
          !isQueueFullyProcessed &&
          !errorInCaptureSetup &&
          this.startTotalTime > 0
        ) {
          if (
            AppState.screenshots.size > 0 ||
            AppState.failedUrls.length > 0 ||
            this.captureQueue.length > 0
          ) {
            const failedCount = AppState.failedUrls.length;
            const successCount = AppState.screenshots.size;
            const totalPagesInQueue =
              this.captureQueue?.length || successCount + failedCount;
            const icon = failedCount > 0 ? "⚠️ " : "ℹ️ ";
            UI.utils.showStatus(
              `${icon}Processing finished. Captured ${
                successCount + failedCount
              } of ${totalPagesInQueue} pages.`,
              failedCount > 0,
              0
            );
            UI.progress.updateStats(
              totalPagesInQueue,
              successCount,
              failedCount,
              totalTimeTakenSec
            );
          } else if (!errorInCaptureSetup) {
            UI.utils.showStatus("ℹ️ No pages were processed.", false, 0);
          }
        }
      } else {
        if (this.startTotalTime > 0)
          UI.progress.updateStats(
            this.captureQueue.length,
            AppState.screenshots.size,
            AppState.failedUrls.length,
            totalTimeTakenSec
          );
      }
      this._checkCaptureButtonState();
      this.updatePauseResumeButton();
      const pdfBtnVisible = AppState.screenshots.size > 0;
      const combineAllPdfBtn = document.querySelector(".combine-all-pdf-btn");
      if (combineAllPdfBtn?.parentElement) {
        const pdfContainer =
          combineAllPdfBtn.closest(".combine-all-pdf-container") ||
          combineAllPdfBtn.parentElement;
        pdfContainer.style.display = pdfBtnVisible ? "flex" : "none";
        combineAllPdfBtn.disabled = !pdfBtnVisible;
      }
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
    if (this.isPaused || this.currentCaptureIndex >= this.captureQueue.length) {
      if (this.isPaused) {
        this._processingQueue = false;
      }
      if (
        !this.isPaused &&
        this.currentCaptureIndex >= this.captureQueue.length
      ) {
        if (captureWarningMessage) captureWarningMessage.style.display = "none";
        this._setCaptureUIsDisabled(false);
      }
      return;
    }
    if (!this._processingQueue) {
      this._processingQueue = true;
      this._setCaptureUIsDisabled(true);
      this.updatePauseResumeButton();
      if (
        captureWarningMessage &&
        captureWarningMessage.style.display === "none"
      ) {
        captureWarningMessage.textContent =
          "The browser needs to be active for the screenshot to be captured properly";
        captureWarningMessage.style.display = "block";
      }
    }
    const totalUrls = this.captureQueue.length;
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
    while (this.currentCaptureIndex < totalUrls && !this.isPaused) {
      const itemIndex = this.currentCaptureIndex;
      const item = this.captureQueue[itemIndex];
      if (!item || !item.url) {
        console.error(`Invalid item at queue index ${itemIndex}:`, item);
        AppState.addFailedUrl(`Invalid Item @ Queue Index ${itemIndex}`);
        this.currentCaptureIndex++;
        if (UI.elements.progressBar)
          UI.progress.updateProgress(this.currentCaptureIndex, totalUrls);
        continue;
      }
      const { url, index, capturePreset, captureFullPage, actionSequences } =
        item;
      if (UI.elements.progress)
        UI.progress.updateProgressMessage(
          `⏳ Processing ${itemIndex + 1} of ${totalUrls}: ${url}`
        );
      if (UI.elements.progressBar)
        UI.progress.updateProgress(itemIndex, totalUrls);
      let result;
      try {
        result = await ScreenshotCapture.takeScreenshot(
          url,
          capturePreset,
          captureFullPage,
          actionSequences || []
        );
        if (this.isPaused) {
          this._processingQueue = false;
          break;
        }
        const timestamp = URLProcessor.getTimestamp();
        const baseFileName = URLProcessor.generateFilename(url, index, "");
        const fullPageSuffix = captureFullPage ? "_FullPage" : "";
        const mountIssueSuffix = result.detectedMountIssue
          ? "_MountIssueDetected"
          : "";
        const fileName = baseFileName.replace(
          ".png",
          `${fullPageSuffix}${mountIssueSuffix}_${timestamp}.png`
        );
        result.fileName = fileName;
        if (result.detectedMountIssue) {
          console.warn(
            `Screenshot for ${url} captured with detected mount issue: ${result.mountIssueMessage}`
          );
        }
        UI.thumbnails.addLiveThumbnail(result, result.fileName, url);
        AppState.addScreenshot(url, result);
        AppState.removeFailedUrl(url);
      } catch (error) {
        if (this.isPaused) {
          this._processingQueue = false;
          break;
        }
        handleError(error, { logToConsole: true, showToUser: false });
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
          errorMessage: error.message || "Unknown error during capture",
          sequenceName: url,
          url: error.url || url,
          detectedMountIssue: wasMountIssueCatastrophic,
          mountIssueMessage: wasMountIssueCatastrophic ? error.message : null,
        };
        UI.thumbnails.addLiveThumbnail(errorResult, fileName, url);
        AppState.addFailedUrl(url);
        const displayError =
          error instanceof ScreenshotError
            ? `(${error.reason || error.message})`
            : `(${error.message || "Unknown"})`;
        UI.utils.showStatus(
          `✗ Failed to capture: ${url.split("/").pop()} ${displayError}`,
          true
        );
      }
      this.currentCaptureIndex++;
      if (UI.elements.progressBar)
        UI.progress.updateProgress(this.currentCaptureIndex, totalUrls);
      if (this.currentCaptureIndex < totalUrls && !this.isPaused) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (this.isPaused) {
        this._processingQueue = false;
        break;
      }
    }
    const isFinished = this.currentCaptureIndex >= totalUrls;
    if (isFinished && !this.isPaused) {
      this._processingQueue = false;
      this._setCaptureUIsDisabled(false);
      if (captureWarningMessage) captureWarningMessage.style.display = "none";
    } else if (this.isPaused) {
      if (UI.elements.progress)
        UI.utils.showStatus(
          `⏳ Capture paused at URL ${
            this.currentCaptureIndex + 1
          } of ${totalUrls}. Click Resume (▶️) to continue.`,
          false,
          0
        );
      if (captureWarningMessage) captureWarningMessage.style.display = "block";
    } else {
      this._processingQueue = false;
      this._setCaptureUIsDisabled(false);
      if (captureWarningMessage) captureWarningMessage.style.display = "none";
    }
  }

  createPauseResumeButton() {
    const buttonContainer = UI.elements.buttonContainer;
    if (!buttonContainer || document.getElementById("pauseResumeBtn")) return;
    const pauseResumeBtn = document.createElement("button");
    pauseResumeBtn.id = "pauseResumeBtn";
    pauseResumeBtn.className = "btn icon-btn pause-resume-btn";
    pauseResumeBtn.innerHTML = "⏸️";
    pauseResumeBtn.title = "Pause capture";
    events.addDOMEventListener(
      pauseResumeBtn,
      "click",
      this.pauseResumeCapture
    );
    const captureBtn = UI.elements.captureBtn;
    if (captureBtn && buttonContainer.contains(captureBtn)) {
      captureBtn.insertAdjacentElement("afterend", pauseResumeBtn);
    } else {
      buttonContainer.appendChild(pauseResumeBtn);
    }
    pauseResumeBtn.disabled = true;
  }

  pauseResumeCapture() {
    this.isPaused = !this.isPaused;
    const captureWarningMessage = document.getElementById(
      "captureWarningMessage"
    );
    if (this.isPaused) {
      console.log("Pause requested.");
      if (UI.elements.progress)
        UI.utils.showStatus(
          `⏳ Capture paused. Click Resume (▶️) to continue.`,
          false,
          0
        );
      if (captureWarningMessage) captureWarningMessage.style.display = "block";
    } else {
      console.log("Resume requested.");
      this._setCaptureUIsDisabled(true);
      if (UI.elements.progress) UI.utils.showStatus("", false, 1);
      if (
        captureWarningMessage &&
        this.captureQueue.length > this.currentCaptureIndex
      ) {
        captureWarningMessage.textContent =
          "The browser needs to be active for the screenshot to be captured properly";
        captureWarningMessage.style.display = "block";
      }
      if (
        this.currentCaptureIndex < this.captureQueue.length &&
        !this._processingQueue
      ) {
        this.processCaptureQueue();
      } else if (this._processingQueue) {
        console.warn(
          "Resume clicked, but processing logic indicates it's already active."
        );
      } else {
        if (captureWarningMessage) captureWarningMessage.style.display = "none";
        this._setCaptureUIsDisabled(false);
      }
    }
    this.updatePauseResumeButton();
  }

  updatePauseResumeButton() {
    const pauseResumeBtn = document.getElementById("pauseResumeBtn");
    if (!pauseResumeBtn) return;
    const hasItemsToProcess =
      this.currentCaptureIndex < this.captureQueue.length;
    const isActivelyProcessing = this._processingQueue && !this.isPaused;
    if (this.isPaused) {
      pauseResumeBtn.innerHTML = "▶️";
      pauseResumeBtn.title = "Resume capture";
      pauseResumeBtn.classList.add("paused");
      pauseResumeBtn.disabled = !hasItemsToProcess;
    } else {
      pauseResumeBtn.innerHTML = "⏸️";
      pauseResumeBtn.title = "Pause capture";
      pauseResumeBtn.classList.remove("paused");
      pauseResumeBtn.disabled = !isActivelyProcessing || !hasItemsToProcess;
    }
  }

  _toggleCaptureSettings() {
    const content = document.getElementById("captureSettingsContent");
    const wrapper = document.getElementById("captureSettingsToggle");
    if (!content || !wrapper) {
      console.warn(
        "Could not toggle 'Pages' settings: Content or wrapper not found."
      );
      return;
    }
    const isCollapsed = content.classList.toggle("collapsed");
    wrapper.classList.toggle("collapsed", isCollapsed);
    console.log(`"Pages" section toggled. Collapsed: ${isCollapsed}`);
  }

  _setCaptureSettingsCollapsed(collapsed) {
    const content = document.getElementById("captureSettingsContent");
    const wrapper = document.getElementById("captureSettingsToggle");
    if (!content || !wrapper) {
      return;
    }
    content.classList.toggle("collapsed", collapsed);
    wrapper.classList.toggle("collapsed", collapsed);
  }
}
export default App;
