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
      baseUrlInput.readOnly = true;
    }
    const projectDropdown = document.getElementById("projectSelectorDropdown");
    if (projectDropdown) {
      projectDropdown.disabled = true;
    }

    this._deriveGatewayBaseForProjects();
    this._setupEventListeners();
    this._initializeUI();
    this._setupEventHandlers();

    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");

    this.loginHandler.initialize();
    this._fetchAndPopulateProjects(); // Fetch projects on init

    const baseUrlSection = document.getElementById("baseUrlSection");
    const loginOptionSection = document.getElementById("loginOptionSection");
    const loginSection = document.getElementById("loginSection");
    const captureForm = UI.elements.captureForm;
    const progressOutput = UI.elements.progressOutput; // Keep reference

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
    this._setCaptureUIsDisabled(false); // Should be false to enable project selection initially

    console.log("Application initialized.");
  }

  // In js/app.js

  _deriveGatewayBaseForProjects() {
    try {
      const currentHref = window.location.href;
      // Extract the protocol, hostname, and port from the current URL
      // This regex captures "http://any.host.name:port" or "https://any.host.name:port"
      const gatewayMatch = currentHref.match(/^(https?:\/\/[^/]+)/i);

      if (gatewayMatch && gatewayMatch[1]) {
        const gatewayAddress = gatewayMatch[1]; // This will be like "http://localhost:8088" or "http://10.0.50.73:8088"
        this.gatewayBaseForProjects = `${gatewayAddress}/data/perspective/client/`;
        console.log(
          "Gateway base for project URLs derived directly:",
          this.gatewayBaseForProjects
        );
      } else {
        // Fallback if the regex somehow fails (should be very unlikely with valid URLs)
        this.gatewayBaseForProjects =
          "http://localhost:8088/data/perspective/client/";
        console.warn(
          "Could not derive gateway base from window.location.href. Using fallback:",
          this.gatewayBaseForProjects
        );
      }
    } catch (e) {
      console.error("Error deriving gateway base for projects:", e);
      this.gatewayBaseForProjects =
        "http://localhost:8088/data/perspective/client/"; // Default fallback on error
    }
  }

  async _fetchAndPopulateProjects() {
    const projectDropdown = document.getElementById("projectSelectorDropdown");
    // const baseUrlStatus = document.getElementById("baseUrlStatus"); // REMOVED

    if (!projectDropdown /*|| !baseUrlStatus*/) return; // ADJUSTED condition

    projectDropdown.disabled = true;
    projectDropdown.innerHTML = '<option value="">Loading projects...</option>';
    // baseUrlStatus.textContent = ""; // REMOVED

    try {
      const projects = await urlFetcher.fetchProjectList();
      projectDropdown.innerHTML =
        '<option value="">-- Select a Project --</option>';
      if (projects && projects.length > 0) {
        projects.forEach((project) => {
          const option = document.createElement("option");
          option.value = project;
          option.textContent = project;
          projectDropdown.appendChild(option);
        });
        projectDropdown.disabled = false;
        // baseUrlStatus.textContent = "Select a project to continue."; // REMOVED
        // baseUrlStatus.style.color = "initial"; // REMOVED
      } else {
        projectDropdown.innerHTML =
          '<option value="">No projects found</option>';
        // baseUrlStatus.textContent = "No projects available or error fetching list."; // REMOVED
        // baseUrlStatus.style.color = "orange"; // REMOVED
        UI.utils.showStatus(
          "No projects available or error fetching list.",
          true,
          0
        ); // Alternative feedback
      }
    } catch (error) {
      console.error("Failed to fetch or populate project list:", error);
      projectDropdown.innerHTML =
        '<option value="">Error loading projects</option>';
      projectDropdown.disabled = true;
      // baseUrlStatus.textContent = error.message || "Could not load project list. Check gateway connection or console."; // REMOVED
      // baseUrlStatus.style.color = "red"; // REMOVED
      UI.utils.showStatus(
        error.message ||
          "Could not load project list. Check gateway or console.",
        true,
        0
      ); // Alternative feedback
    }
  }

  _setCaptureUIsDisabled(disabled) {
    const projectDropdown = document.getElementById("projectSelectorDropdown");
    const capturePresetSelect = UI.elements.capturePreset;
    const fullPageCheckbox = document.getElementById("fullPageCheckbox");
    const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
    const loginOptionRadios = document.querySelectorAll(
      'input[name="loginOption"]'
    );

    if (projectDropdown) projectDropdown.disabled = disabled;
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

  _handleProjectSelection(event) {
    const selectedProjectName = event.target.value;
    const baseUrlInputElement = document.getElementById("baseUrlInput");
    // const statusElement = document.getElementById("baseUrlStatus"); // REMOVED
    const loginOptionSection = document.getElementById("loginOptionSection");
    const progressOutput = UI.elements.progressOutput;

    if (
      !baseUrlInputElement ||
      /*!statusElement ||*/ !loginOptionSection ||
      !progressOutput
    )
      return; // ADJUSTED condition

    // statusElement.textContent = ""; // REMOVED

    const loginRadios = loginOptionSection.querySelectorAll(
      'input[name="loginOption"]'
    );
    loginRadios.forEach((radio) => {
      radio.checked = false;
    });
    const loginSection = document.getElementById("loginSection");
    if (loginSection) loginSection.style.display = "none";
    const captureForm = UI.elements.captureForm;
    const pageSourceSelection = document.getElementById("pageSourceSelection");
    if (captureForm) captureForm.style.display = "none";
    if (pageSourceSelection) pageSourceSelection.style.display = "none";
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
    if (urlSelector.cleanup) urlSelector.cleanup();

    UI.utils.resetUI();
    progressOutput.style.display = "none";

    if (!selectedProjectName) {
      baseUrlInputElement.value = "";
      this._handleBaseUrlInput({ target: baseUrlInputElement }); // Will set error state
      return;
    }

    if (!this.gatewayBaseForProjects) {
      console.error(
        "Gateway base URL for projects is not set. Cannot construct project URL."
      );
      // statusElement.textContent = "Error: Gateway configuration missing."; // REMOVED
      // statusElement.style.color = "red"; // REMOVED
      UI.utils.showStatus(
        "Error: Gateway configuration missing for project URL.",
        true,
        0
      ); // Alternative
      baseUrlInputElement.value = "";
      this._handleBaseUrlInput({ target: baseUrlInputElement });
      return;
    }

    const fullProjectUrl = this.gatewayBaseForProjects + selectedProjectName;
    baseUrlInputElement.value = fullProjectUrl;
    this._handleBaseUrlInput({ target: baseUrlInputElement }); // This will update states
  }

  _handleBaseUrlInput(event) {
    const url = event.target.value.trim();
    // const statusElement = document.getElementById("baseUrlStatus"); // REMOVED
    const loginOptionSection = document.getElementById("loginOptionSection");
    const loginSection = document.getElementById("loginSection");
    const captureForm = UI.elements.captureForm;
    const progressOutput = UI.elements.progressOutput;
    const pageSourceSelection = document.getElementById("pageSourceSelection");

    if (
      /*!statusElement ||*/ // ADJUSTED condition
      !loginOptionSection ||
      !loginSection ||
      !captureForm ||
      !progressOutput ||
      !pageSourceSelection
    ) {
      console.error("Base URL change handler: Required UI sections not found!");
      return;
    }

    if (!url || !url.includes("/client/")) {
      this.baseUrlValid = false;
      this.baseUrl = url;
      if (url && !url.includes("/client/")) {
        // statusElement.textContent = "Invalid URL format. Expected .../client/PROJECT_NAME"; // REMOVED
        // statusElement.style.color = "red"; // REMOVED
        UI.utils.showStatus("Invalid Project URL format.", true, 0); // Alternative
      } else if (!url) {
        // statusElement.textContent = "Select a project or ensure URL is correct."; // REMOVED
        // statusElement.style.color = "initial"; // REMOVED
        // No explicit message needed if it's just empty, dropdown state is primary indicator
      }
      if (urlFetcher) urlFetcher.projectName = "";
      this._disableLoginOptions();
      loginOptionSection.style.display = "none";
      loginSection.style.display = "none";
      captureForm.style.display = "none";
      pageSourceSelection.style.display = "none";

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
      // statusElement.textContent = `Project: ${urlFetcher.projectName}`; // REMOVED
      // statusElement.style.color = "green"; // REMOVED
      // Optionally show a success message via UI.utils.showStatus if desired for project confirmation
      // UI.utils.showStatus(`Project '${urlFetcher.projectName}' selected.`, false, 3000);
      loginOptionSection.style.display = "block";
      this._enableLoginOptions();
    } else {
      this.baseUrlValid = false;
      this.baseUrl = url;
      // statusElement.textContent = "Could not extract project name from URL."; // REMOVED
      // statusElement.style.color = "red"; // REMOVED
      UI.utils.showStatus("Could not identify project from URL.", true, 0); // Alternative
      if (urlFetcher) urlFetcher.projectName = "";
      this._disableLoginOptions();
      loginOptionSection.style.display = "none";
      loginSection.style.display = "none";
      captureForm.style.display = "none";
      pageSourceSelection.style.display = "none";
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

    // Removed listener for refreshProjectsBtn

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
    this._setCaptureSettingsCollapsed(false); // Start expanded
    const manualArea = document.getElementById("manualJsonInputArea");
    if (manualArea) manualArea.style.display = "none";
    const pageSourceSelection = document.getElementById("pageSourceSelection");
    if (pageSourceSelection) pageSourceSelection.style.display = "none";

    const baseUrlInput = document.getElementById("baseUrlInput");
    if (baseUrlInput && document.getElementById("projectSelectorDropdown")) {
      baseUrlInput.readOnly = true; // Ensure it's readonly if dropdown exists
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
    // Ensure UI.elements.waitTime is set, preferring simpleWaitTimeInput if available
    if (!UI.elements.waitTime) {
      const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
      UI.elements.waitTime = simpleWaitTimeInput || hiddenWaitTime;
    }
  }

  _disableLoginOptions() {
    const radios = document.querySelectorAll('input[name="loginOption"]');
    radios.forEach((radio) => {
      radio.disabled = true;
      radio.checked = false; // Ensure no option is pre-selected when disabled
    });
    const loginOptionSection = document.getElementById("loginOptionSection");
    if (loginOptionSection) loginOptionSection.style.display = "none";
  }

  _enableLoginOptions() {
    const radios = document.querySelectorAll('input[name="loginOption"]');
    radios.forEach((radio) => (radio.disabled = false));
    const loginOptionSection = document.getElementById("loginOptionSection");
    if (loginOptionSection) loginOptionSection.style.display = "block";
  }

  _updateUIMode() {
    // Forcing simple mode based on previous user feedback
    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");
    const advancedOptionsEl = document.getElementById("advancedOptions");
    if (advancedOptionsEl) advancedOptionsEl.style.display = "none";

    // Setup simple mode specific settings (like wait time input)
    this._setupSimpleModeSettings();

    // Initialize or update URL selector and check capture button state
    // Wrapped in setTimeout to ensure DOM is fully updated from class changes
    setTimeout(async () => {
      if (typeof urlSelector.initialize === "function") {
        try {
          await urlSelector.initialize(); // Ensure URL selector is ready
          // If the capture form is visible (meaning a login option has been chosen),
          // trigger the source change handler to potentially load URLs.
          if (UI.elements.captureForm.style.display !== "none") {
            this._handleSourceChange();
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
      this._checkCaptureButtonState(); // Update button state based on current conditions
    }, 0);

    UI.utils.resetUI(); // Reset thumbnails, progress, etc.
  }

  _setupSimpleModeSettings() {
    // Ensure the correct wait time input is referenced
    const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
    const hiddenWaitTimeInput = document.getElementById("hiddenWaitTime"); // This might not exist if advanced mode UI is removed from HTML

    if (simpleWaitTimeInput) {
      UI.elements.waitTime = simpleWaitTimeInput;
      if (hiddenWaitTimeInput && simpleWaitTimeInput.value) {
        // Sync value if hidden input exists (though it might be unused in forced simple mode)
        hiddenWaitTimeInput.value = simpleWaitTimeInput.value;
      }
    } else if (hiddenWaitTimeInput) {
      // Fallback if simpleWaitTimeInput is somehow missing, though unlikely if HTML is correct for simple mode
      UI.elements.waitTime = hiddenWaitTimeInput;
    } else {
      console.error(
        "Critical UI Error: No wait time input found for simple mode settings."
      );
    }
  }

  _handleActionsInput() {
    // This method might be largely unused if advanced mode is effectively disabled
    console.log("Actions input changed (managed by ContextMenuActionsHelper).");
    // Potentially add logic here if actions can still be relevant in a simplified context
    // or ensure it doesn't interfere with simple mode.
  }

  _handleSourceChange() {
    const selectedSource = document.querySelector(
      'input[name="pageSourceOption"]:checked'
    )?.value;
    const manualArea = document.getElementById("manualJsonInputArea");
    const urlSelectorContainer = document.getElementById(
      "urlSelectorContainer" // This is the div created by url-selector.js
    );
    const manualJsonStatus = document.getElementById("manualJsonStatus");
    const jsonTextArea = document.getElementById("manualJsonText");
    const fileInput = document.getElementById("manualJsonFile");
    const fileNameDisplay = document.getElementById("fileNameDisplay");

    if (!manualArea) {
      // Check if manual area exists for hiding/showing
      console.error("Manual JSON input area not found during source change.");
      return; // Or handle gracefully
    }

    if (manualJsonStatus) manualJsonStatus.textContent = ""; // Clear previous status

    // Always clear selections when source changes
    if (urlSelector.selectedUrls) urlSelector.selectedUrls.clear();

    if (selectedSource === "manual") {
      manualArea.style.display = ""; // Show manual input options
      if (urlSelectorContainer) urlSelectorContainer.style.display = "none"; // Hide automatic selector
      if (urlSelector.clearRenderedUrls) urlSelector.clearRenderedUrls(); // Clear any auto-loaded URLs

      // Reset internal state related to automatic fetching
      if (urlFetcher) {
        urlFetcher.dataLoadedDirectly = false; // Mark that we're not using fetched data
        urlFetcher.urlsList = [];
        urlFetcher.categorizedUrls = {};
      }
      // Clear queue and state, reset UI for new manual list
      this.captureQueue = [];
      AppState.reset();
      UI.utils.resetUI();
      if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true; // Disable capture until manual list loaded
    } else {
      // 'automatic' source
      manualArea.style.display = "none"; // Hide manual input options
      if (urlSelectorContainer) {
        urlSelectorContainer.style.display = ""; // Show automatic selector
      } else if (
        typeof urlSelector.initialize === "function" &&
        !document.getElementById("urlSelectorContainer")
      ) {
        // If container isn't there yet, initialize might create it.
        // This scenario should be less common if initialize() is called robustly earlier.
        console.warn(
          "URL Selector container not ready for 'automatic' source change. Attempting init then fetch."
        );
      }
      if (urlSelector.clearRenderedUrls) urlSelector.clearRenderedUrls(); // Clear any previous selection

      // Clear manual input fields
      if (jsonTextArea) jsonTextArea.value = "";
      if (fileInput) fileInput.value = ""; // Reset file input
      if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";

      // Initiate fetching if conditions are met
      if (this.baseUrlValid && this.loginHandler.isAuthenticatedForCapture()) {
        this._initiateUrlFetching();
      } else {
        // Show placeholder/loading in URL selector if not ready to fetch
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

    // Reset status and display
    if (manualJsonStatus) {
      manualJsonStatus.textContent = "";
      manualJsonStatus.style.color = ""; // Reset color
    }
    if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";

    if (!fileInput.files || fileInput.files.length === 0) return;

    const file = fileInput.files[0];

    // Validate file type (client-side basic check)
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
      fileInput.value = ""; // Clear the invalid file from input
      return;
    }

    if (fileNameDisplay) fileNameDisplay.textContent = file.name;

    try {
      const fileContent = await this._readFileContent(file);
      if (jsonTextArea) {
        jsonTextArea.value = fileContent;
        console.log(`File "${file.name}" content loaded into textarea.`);
        // Enable the "Load Pages" button after successful file read (if it exists)
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
      fileInput.value = ""; // Clear file input on error
    }
    this._checkCaptureButtonState(); // Update capture button based on textarea content
  }

  async _handleLoadManualSource() {
    const jsonTextArea = document.getElementById("manualJsonText");
    const manualJsonStatus = document.getElementById("manualJsonStatus");
    const urlSelectorContainer = document.getElementById(
      "urlSelectorContainer"
    );
    const loadBtn = document.getElementById("loadManualJsonBtn");
    const fileInput = document.getElementById("manualJsonFile"); // To reset it
    const fileNameDisplay = document.getElementById("fileNameDisplay"); // To reset it

    if (!jsonTextArea || !manualJsonStatus || !loadBtn) {
      console.error("Cannot load manual source: Crucial UI elements missing.");
      return;
    }

    manualJsonStatus.textContent = ""; // Clear previous status
    manualJsonStatus.style.color = "";
    loadBtn.disabled = true; // Disable while processing
    loadBtn.textContent = "Loading...";
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;

    const sourceContent = jsonTextArea.value.trim();
    // Determine if content came from file (for logging/status messages)
    const sourceDescription = fileInput?.files?.[0]?.name
      ? `file "${fileInput.files[0].name}"`
      : "textarea content";

    // Reset file input after attempting to load from textarea (whether it was from file or paste)
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
      manualJsonStatus.style.color = "orange"; // Use a neutral/processing color

      await urlFetcher.setDataDirectly(sourceContent); // This now updates urlFetcher.dataLoadedDirectly

      if (urlFetcher.dataLoadedDirectly) {
        // Check the flag set by setDataDirectly
        // Initialize urlSelector if it hasn't been already (e.g. if app starts in manual mode)
        if (urlSelector.container) {
          // Check if container exists from previous init
          urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
          if (urlSelectorContainer) urlSelectorContainer.style.display = ""; // Ensure it's visible
        } else if (typeof urlSelector.initialize === "function") {
          // If not, try to initialize
          console.warn(
            "URL Selector was not initialized, attempting now for manual load."
          );
          await urlSelector.initialize();
          if (urlSelector.container) {
            // Check again after init
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
        // setDataDirectly should throw an error if processing failed,
        // so this 'else' might only be hit if _processData returns false without throwing.
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
      // Catch errors from setDataDirectly or urlSelector init
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
      this._checkCaptureButtonState(); // Update capture button based on outcome
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
    const buttonContainer = UI.elements.buttonContainer; // For showing/hiding the whole btn area
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

    // Enable/disable "Load Pages" button for manual source based on textarea content
    if (loadManualBtn && selectedSource === "manual") {
      const jsonTextArea = document.getElementById("manualJsonText");
      loadManualBtn.disabled = !(jsonTextArea && jsonTextArea.value.trim());
    } else if (loadManualBtn) {
      // If not manual source, disable it
      loadManualBtn.disabled = true;
    }

    // Determine if capture button should be enabled
    const prerequisitesMet =
      !this._processingQueue && // Not already processing
      this.baseUrlValid && // Valid base URL
      this.loginHandler.isAuthenticatedForCapture(); // Authenticated

    let urlsAvailableAndSelected = false;
    if (selectedSource === "automatic") {
      // For automatic, check if urlFetcher has URLs and urlSelector has selections
      urlsAvailableAndSelected =
        urlFetcher.urlsList.length > 0 && urlSelector.selectedUrls.size > 0;
    } else if (selectedSource === "manual") {
      // For manual, check if data was loaded directly and urlSelector has selections
      urlsAvailableAndSelected =
        urlFetcher.dataLoadedDirectly && urlSelector.selectedUrls.size > 0;
    }

    const isReadyToCapture = prerequisitesMet && urlsAvailableAndSelected;
    captureBtn.disabled = !isReadyToCapture;

    // Show/hide the main button container based on captureForm visibility
    const captureFormVisible = UI.elements.captureForm.style.display !== "none";
    if (captureFormVisible) {
      buttonContainer.style.display = "flex"; // or "block" or "" depending on desired layout
      buttonContainer.classList.remove("hidden");
    } else {
      buttonContainer.style.display = "none";
      buttonContainer.classList.add("hidden");
    }
  }

  _setupEventHandlers() {
    // Generic progress updates
    events.on(events.events.CAPTURE_PROGRESS, (data) => {
      if (data && data.message && UI.elements.progress) {
        let messageWithIcon = data.message;
        // Add an icon if not already present for visual cue
        if (
          !messageWithIcon.startsWith("✓ ") &&
          !messageWithIcon.startsWith("✗ ") &&
          !messageWithIcon.startsWith("⚠️ ") &&
          !messageWithIcon.startsWith("ℹ️ ") &&
          !messageWithIcon.startsWith("⏳ ")
        ) {
          messageWithIcon = "⏳ " + data.message; // Default to loading icon
        }
        UI.progress.updateProgressMessage(messageWithIcon);
      }
    });

    // After a screenshot is successfully taken
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
      const pageName = url.split("/").pop() || url; // Get last part of URL as a simple name

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

    // When URL selection changes in the URL selector component
    events.on("URL_SELECTION_CHANGED", (data) =>
      this._checkCaptureButtonState()
    );

    // When login option (Guest/Authenticated) changes
    events.on("LOGIN_OPTION_SELECTED", (data) => {
      // Prevent attempting login actions if base URL is not yet valid
      if (!this.baseUrlValid && data.option === "login") {
        UI.utils.showStatus(
          "Please select or enter a valid Project URL first.",
          true
        );
        // Uncheck the radio button if it was 'login'
        const radioLogin = document.getElementById("optionLogin");
        if (radioLogin) radioLogin.checked = false;
        return;
      }

      this.loginHandler.handleLoginOptionChange(data.option);
      const captureForm = UI.elements.captureForm;
      const pageSourceSelection = document.getElementById(
        "pageSourceSelection"
      );

      // Show capture form and page source selection if guest or already logged in
      if (
        data.option === "continueWithoutLogin" ||
        (data.option === "login" && this.loginHandler.isLoggedIn)
      ) {
        if (captureForm) captureForm.style.display = "";
        if (pageSourceSelection) pageSourceSelection.style.display = "";
        this._updateUIMode(); // This will also handle initial URL fetching if conditions are met
      } else if (data.option === "login" && !this.loginHandler.isLoggedIn) {
        // If "login" is chosen but user is not logged in, hide forms until login is complete
        if (captureForm) captureForm.style.display = "none";
        if (pageSourceSelection) pageSourceSelection.style.display = "none";
      }
      this._checkCaptureButtonState();
    });

    // After login process completes (successfully or not)
    events.on("LOGIN_COMPLETE", (data) => {
      const captureForm = UI.elements.captureForm;
      const pageSourceSelection = document.getElementById(
        "pageSourceSelection"
      );

      if (data.loggedIn) {
        if (captureForm) captureForm.style.display = "";
        if (pageSourceSelection) pageSourceSelection.style.display = "";
        this._updateUIMode(); // This re-evaluates UI, including potentially fetching URLs
      } else {
        // If login failed and "login" option was selected, show error
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

    // Handle auto-logout
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
      ); // Persistent message

      // Hide main functional areas
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

      // Collapse settings if open
      if (
        captureSettingsContent &&
        !captureSettingsContent.classList.contains("collapsed")
      ) {
        this._setCaptureSettingsCollapsed(true);
      }

      if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;

      // Reset any ongoing capture
      if (this.isPaused) {
        this.isPaused = false;
        this.updatePauseResumeButton();
      }
      this._processingQueue = false;
      this.captureQueue = [];
      this.currentCaptureIndex = 0;

      AppState.reset();
      UI.utils.resetUI(); // Clear thumbnails, etc.
      this._checkCaptureButtonState(); // Re-evaluate button states
    });
  }

  async _initiateUrlFetching() {
    const selectedSource = document.querySelector(
      'input[name="pageSourceOption"]:checked'
    )?.value;
    if (selectedSource !== "automatic") {
      // If not automatic, clear any existing URLs in the selector (e.g., if user switches back from manual)
      if (
        urlSelector.container &&
        typeof urlSelector.clearRenderedUrls === "function"
      )
        urlSelector.clearRenderedUrls();
      return; // Don't fetch if not in automatic mode
    }

    if (!this.baseUrlValid || !this.loginHandler.isAuthenticatedForCapture()) {
      // If prerequisites aren't met, show appropriate message in URL selector
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

    // Ensure URL selector is initialized
    if (
      !urlSelector.container &&
      typeof urlSelector.initialize === "function" &&
      !document.getElementById("urlSelectorContainer")
    ) {
      await urlSelector.initialize();
    }
    if (!urlSelector.container) {
      // Check again after potential initialization
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
      await urlFetcher.loadUrls(); // This fetches and processes URLs
      // Render the fetched and categorized URLs
      if (urlSelector.renderUrlCategories)
        urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
      if (urlSelector.updateSelectionCounter)
        urlSelector.updateSelectionCounter(); // Update count display
    } catch (error) {
      console.error("Error initiating URL fetching or rendering:", error);
      const displayError =
        error instanceof AppError
          ? error.message
          : "Failed to load page list from server.";
      // Display error within the URL selector area
      if (urlSelector.categoriesContainer) {
        // Check if the specific container exists
        urlSelector.categoriesContainer.innerHTML = `<div class="url-selector-error"><p>${displayError}</p><p>Check server connection or Project URL. Ensure the backend service for listing pages is running correctly for project '${urlFetcher.projectName}'.</p></div>`;
      } else if (typeof urlSelector.showFallbackUIIfNeeded === "function") {
        urlSelector.showFallbackUIIfNeeded(); // Or trigger a more generic fallback
      }
      if (urlSelector.updateSelectionCounter)
        urlSelector.updateSelectionCounter(); // Reset count display on error
    } finally {
      this._checkCaptureButtonState(); // Update capture button based on fetched URLs
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
    progressOutput.style.display = ""; // Make progress area visible

    if (this._processingQueue) {
      UI.utils.showStatus("Capture is already running...", false, 3000);
      return;
    }

    if (!this.loginHandler.isAuthenticatedForCapture()) {
      UI.utils.showStatus("Please authenticate or continue as guest.", true);
      if (progressOutput) progressOutput.style.display = "none"; // Hide progress if not ready
      return;
    }
    if (!this.baseUrlValid) {
      UI.utils.showStatus("Please select a valid Project first.", true);
      if (progressOutput) progressOutput.style.display = "none";
      return;
    }

    this._setCaptureUIsDisabled(true); // Disable inputs during capture
    this.startTotalTime = performance.now();
    let urlList = [];
    let errorInCaptureSetup = false;

    try {
      AppState.reset(); // Clear previous screenshots and failed URLs
      UI.utils.resetUI(); // Clear thumbnails and progress indicators
      this._setCaptureSettingsCollapsed(true); // Collapse settings during capture

      const capturePreset =
        UI.elements.capturePreset?.value || config.screenshot.defaultPreset;
      const fullPageCheckbox = document.getElementById("fullPageCheckbox");
      const captureFullPage = fullPageCheckbox
        ? fullPageCheckbox.checked
        : false;

      // Get URLs based on selected source (automatic or manual)
      // urlSelector.getSelectedUrlsForCapture() should correctly give the list of full URLs
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

      UI.progress.updateStats(urlList.length, 0, 0, 0); // Initial stats
      if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true; // Disable capture button

      // Show warning message
      if (captureWarningMessage) {
        captureWarningMessage.textContent =
          "The browser needs to be active for the screenshot to be captured properly";
        captureWarningMessage.style.display = "block";
      }

      // Populate the capture queue
      // Action sequences would come from advanced mode, for simple mode they are empty
      this.captureQueue = urlList.map((url, index) => ({
        url,
        index,
        capturePreset,
        captureFullPage,
        actionSequences: [], // Empty for simple mode; advanced mode would populate this
      }));

      this.currentCaptureIndex = 0;
      this.isPaused = false;
      this._processingQueue = true;
      this.updatePauseResumeButton(); // Enable pause button

      await this.processCaptureQueue(); // Start processing
    } catch (error) {
      errorInCaptureSetup = true; // Flag if error happened before queue processing started
      handleError(error, { logToConsole: true, showToUser: true });
      this._processingQueue = false; // Ensure queue is marked as not processing
      this._setCaptureSettingsCollapsed(false); // Re-expand settings on setup error
      // If the error was in setup and no screenshots were attempted, hide progress area
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

      // Hide warning message
      if (captureWarningMessage) captureWarningMessage.style.display = "none";

      // This block runs after the queue is processed or if an error stopped it early
      const isQueueFullyProcessed =
        this.currentCaptureIndex >= this.captureQueue.length;

      if (!this.isPaused) {
        // Only do these final steps if not paused
        this._processingQueue = false;
        this._setCaptureUIsDisabled(false); // Re-enable inputs

        if (isQueueFullyProcessed && this.startTotalTime > 0) {
          // If queue completed naturally
          UI.progress.updateStats(
            this.captureQueue.length,
            AppState.screenshots.size,
            AppState.failedUrls.length,
            totalTimeTakenSec
          );
          if (!errorInCaptureSetup) {
            // Only show completion message if setup was fine
            const failedCount = AppState.failedUrls.length;
            const successCount = AppState.screenshots.size;
            const totalProcessedOrAttempted = this.captureQueue?.length || 0; // Use queue length for total
            const hadFailures = failedCount > 0;
            const icon = hadFailures ? "⚠️ " : "✓ ";
            const completionMessageText = `Capture complete. Processed ${totalProcessedOrAttempted} pages (${successCount} success, ${failedCount} failed).`;
            UI.utils.showStatus(icon + completionMessageText, hadFailures, 0); // Persistent message
          }
        } else if (
          !isQueueFullyProcessed &&
          !errorInCaptureSetup &&
          this.startTotalTime > 0
        ) {
          // If queue stopped early but not due to setup error (e.g. manual stop, unexpected error during processing)
          // Check if any screenshots were processed or if the queue had items.
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
            // No items processed, no setup error
            UI.utils.showStatus("ℹ️ No pages were processed.", false, 0);
          }
        }
      } else {
        // If paused
        // Update stats even if paused
        if (this.startTotalTime > 0)
          UI.progress.updateStats(
            this.captureQueue.length,
            AppState.screenshots.size,
            AppState.failedUrls.length,
            totalTimeTakenSec
          );
      }

      this._checkCaptureButtonState(); // Re-evaluate capture button
      this.updatePauseResumeButton(); // Update pause/resume button state

      // Show/hide PDF button based on whether any screenshots were successfully taken
      const pdfBtnVisible = AppState.screenshots.size > 0;
      const combineAllPdfBtn = document.querySelector(".combine-all-pdf-btn");
      if (combineAllPdfBtn?.parentElement) {
        // Ensure parent exists before manipulating
        const pdfContainer =
          combineAllPdfBtn.closest(".combine-all-pdf-container") ||
          combineAllPdfBtn.parentElement;
        pdfContainer.style.display = pdfBtnVisible ? "flex" : "none";
        combineAllPdfBtn.disabled = !pdfBtnVisible;
      }

      // If setup failed and no URLs were selected or loaded, hide progressOutput again
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

    // If paused, or queue is empty, or already past the end of queue
    if (this.isPaused || this.currentCaptureIndex >= this.captureQueue.length) {
      if (this.isPaused) {
        this._processingQueue = false; // Mark as not actively processing if paused
      }
      // If processing is finished (not paused, but end of queue reached)
      if (
        !this.isPaused &&
        this.currentCaptureIndex >= this.captureQueue.length
      ) {
        if (captureWarningMessage) captureWarningMessage.style.display = "none";
        this._setCaptureUIsDisabled(false); // Re-enable UI
      }
      return;
    }

    // If resuming or starting, ensure processing flag is set and UI is disabled
    if (!this._processingQueue) {
      // This ensures it only runs once if called multiple times while processing
      this._processingQueue = true;
      this._setCaptureUIsDisabled(true);
      this.updatePauseResumeButton();
      // Show warning message if not already paused and queue is active
      if (
        captureWarningMessage &&
        captureWarningMessage.style.display === "none" &&
        !this.isPaused
      ) {
        captureWarningMessage.textContent =
          "The browser needs to be active for the screenshot to be captured properly";
        captureWarningMessage.style.display = "block";
      }
    }

    const totalUrls = this.captureQueue.length;
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true; // Keep capture button disabled

    // Process items in the queue one by one
    while (this.currentCaptureIndex < totalUrls && !this.isPaused) {
      const itemIndex = this.currentCaptureIndex; // Get current item index before async operations
      const item = this.captureQueue[itemIndex];

      // Basic check for valid item
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
          `⏳ Processing ${itemIndex + 1} of ${totalUrls}: ${url}`
        );
      if (UI.elements.progressBar)
        UI.progress.updateProgress(itemIndex, totalUrls); // Progress based on starting item

      let result;
      try {
        result = await ScreenshotCapture.takeScreenshot(
          url,
          capturePreset,
          captureFullPage,
          actionSequences || []
        );

        if (this.isPaused) {
          // Check if paused during the async screenshot operation
          this._processingQueue = false; // No longer actively processing this item
          break; // Exit the loop if paused
        }

        // Generate filename (moved from ScreenshotCapture.takeScreenshot to here for AppState context)
        const timestamp = URLProcessor.getTimestamp(); // URLProcessor method
        const baseFileName = URLProcessor.generateFilename(url, index, ""); // Use actual index from queue
        const fullPageSuffix = captureFullPage ? "_FullPage" : "";
        const mountIssueSuffix = result.detectedMountIssue
          ? "_MountIssueDetected"
          : ""; // Add suffix if mount issue
        const fileName = baseFileName.replace(
          ".png",
          `${fullPageSuffix}${mountIssueSuffix}_${timestamp}.png`
        );
        result.fileName = fileName; // Add filename to the result object

        if (result.detectedMountIssue) {
          console.warn(
            `Screenshot for ${url} captured with detected mount issue: ${result.mountIssueMessage}`
          );
          // UI.thumbnails.addLiveThumbnail will handle visual indication
        }

        UI.thumbnails.addLiveThumbnail(result, result.fileName, url); // Use generated filename
        AppState.addScreenshot(url, result); // Add to successful screenshots
        AppState.removeFailedUrl(url); // Remove from failed if it was retried and succeeded
      } catch (error) {
        if (this.isPaused) {
          // Check if paused during error handling
          this._processingQueue = false;
          break; // Exit loop
        }
        handleError(error, { logToConsole: true, showToUser: false }); // Log error, don't show generic modal for each

        // Construct a result object for error display in thumbnails
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
          sequenceName: url, // Or a more descriptive name if available
          url: error.url || url, // URL from the error if available, else from queue item
          detectedMountIssue: wasMountIssueCatastrophic, // If the error itself was a critical mount issue
          mountIssueMessage: wasMountIssueCatastrophic ? error.message : null,
        };
        UI.thumbnails.addLiveThumbnail(errorResult, fileName, url); // Add error thumbnail
        AppState.addFailedUrl(url); // Add to failed URLs

        // Show specific failure in status
        const displayError =
          error instanceof ScreenshotError
            ? `(${error.reason || error.message})`
            : `(${error.message || "Unknown"})`;
        UI.utils.showStatus(
          `✗ Failed to capture: ${url.split("/").pop()} ${displayError}`,
          true
        );
      }

      this.currentCaptureIndex++; // Increment after processing (success or fail)
      if (UI.elements.progressBar)
        UI.progress.updateProgress(this.currentCaptureIndex, totalUrls); // Update progress after item completion

      // Small delay before next item, unless paused or finished
      if (this.currentCaptureIndex < totalUrls && !this.isPaused) {
        await new Promise((resolve) => setTimeout(resolve, 250)); // Small breather
      }
      if (this.isPaused) {
        // Double check after potential delay
        this._processingQueue = false;
        break;
      }
    } // End while loop

    // After loop finishes (either completed or paused)
    const isFinished = this.currentCaptureIndex >= totalUrls;

    if (isFinished && !this.isPaused) {
      // Queue truly finished
      this._processingQueue = false;
      this._setCaptureUIsDisabled(false); // Re-enable UI
      if (captureWarningMessage) captureWarningMessage.style.display = "none";
      // Final status update will be handled by the 'finally' block in captureScreenshots
    } else if (this.isPaused) {
      // Paused mid-queue
      // _processingQueue was already set to false when pause was detected
      if (UI.elements.progress)
        UI.utils.showStatus(
          `⏳ Capture paused at URL ${
            this.currentCaptureIndex + 1
          } of ${totalUrls}. Click Resume (▶️) to continue.`,
          false,
          0
        );
      if (captureWarningMessage) captureWarningMessage.style.display = "block"; // Keep warning visible if paused
    } else {
      // Should not happen if logic is correct (e.g. unexpected break from loop)
      this._processingQueue = false;
      this._setCaptureUIsDisabled(false);
      if (captureWarningMessage) captureWarningMessage.style.display = "none";
    }
  }

  createPauseResumeButton() {
    const buttonContainer = UI.elements.buttonContainer;
    if (!buttonContainer || document.getElementById("pauseResumeBtn")) return; // Already exists

    const pauseResumeBtn = document.createElement("button");
    pauseResumeBtn.id = "pauseResumeBtn";
    pauseResumeBtn.className = "btn icon-btn pause-resume-btn"; // Basic styling
    pauseResumeBtn.innerHTML = "⏸️"; // Initial state: Pause
    pauseResumeBtn.title = "Pause capture";
    events.addDOMEventListener(
      pauseResumeBtn,
      "click",
      this.pauseResumeCapture
    );

    // Insert after the main capture button if it exists
    const captureBtn = UI.elements.captureBtn;
    if (captureBtn && buttonContainer.contains(captureBtn)) {
      captureBtn.insertAdjacentElement("afterend", pauseResumeBtn);
    } else {
      buttonContainer.appendChild(pauseResumeBtn); // Fallback append
    }
    pauseResumeBtn.disabled = true; // Initially disabled
  }

  pauseResumeCapture() {
    this.isPaused = !this.isPaused;
    const captureWarningMessage = document.getElementById(
      "captureWarningMessage"
    );

    if (this.isPaused) {
      console.log("Pause requested.");
      // Message about pausing will be handled in processCaptureQueue or main status update
      if (UI.elements.progress)
        UI.utils.showStatus(
          `⏳ Capture paused. Click Resume (▶️) to continue.`,
          false,
          0
        );
      if (captureWarningMessage) captureWarningMessage.style.display = "block";
    } else {
      // Resuming
      console.log("Resume requested.");
      this._setCaptureUIsDisabled(true); // Disable other UI elements while processing
      if (UI.elements.progress) UI.utils.showStatus("", false, 1); // Clear pause message

      // Show warning if resuming and queue is not empty
      if (
        captureWarningMessage &&
        this.captureQueue.length > this.currentCaptureIndex
      ) {
        captureWarningMessage.textContent =
          "The browser needs to be active for the screenshot to be captured properly";
        captureWarningMessage.style.display = "block";
      }

      // Only call processCaptureQueue if there are items left and it's not already trying to run
      if (
        this.currentCaptureIndex < this.captureQueue.length &&
        !this._processingQueue
      ) {
        this.processCaptureQueue();
      } else if (this._processingQueue) {
        // This case should ideally not happen if pause sets _processingQueue to false.
        // It means resume was clicked while the loop was somehow still considered active.
        console.warn(
          "Resume clicked, but processing logic indicates it's already active."
        );
      } else {
        // Queue finished or empty
        if (captureWarningMessage) captureWarningMessage.style.display = "none";
        this._setCaptureUIsDisabled(false); // Re-enable UI if queue is actually done
      }
    }
    this.updatePauseResumeButton();
  }

  updatePauseResumeButton() {
    const pauseResumeBtn = document.getElementById("pauseResumeBtn");
    if (!pauseResumeBtn) return;

    const hasItemsToProcess =
      this.currentCaptureIndex < this.captureQueue.length;
    const isActivelyProcessing = this._processingQueue && !this.isPaused; // True if queue is running and not paused

    if (this.isPaused) {
      pauseResumeBtn.innerHTML = "▶️"; // Play icon for "Resume"
      pauseResumeBtn.title = "Resume capture";
      pauseResumeBtn.classList.add("paused"); // For specific styling if needed
      // Enable resume if there are items left in the queue
      pauseResumeBtn.disabled = !hasItemsToProcess;
    } else {
      // Not paused
      pauseResumeBtn.innerHTML = "⏸️"; // Pause icon
      pauseResumeBtn.title = "Pause capture";
      pauseResumeBtn.classList.remove("paused");
      // Enable pause if actively processing and there are items left
      pauseResumeBtn.disabled = !isActivelyProcessing || !hasItemsToProcess;
    }
  }

  _toggleCaptureSettings() {
    const content = document.getElementById("captureSettingsContent");
    const wrapper = document.getElementById("captureSettingsToggle"); // The clickable header area
    if (!content || !wrapper) {
      console.warn(
        "Could not toggle 'Pages' settings: Content or wrapper not found."
      );
      return;
    }
    const isCollapsed = content.classList.toggle("collapsed");
    wrapper.classList.toggle("collapsed", isCollapsed); // Sync state for indicator
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
} // End App Class

export default App;
