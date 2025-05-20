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
    this.currentMode = "simple";
    this.captureScreenshots = this.captureScreenshots.bind(this);
    this._handleActionsInput = this._handleActionsInput.bind(this);
    this.baseUrl = "";
    this.baseUrlValid = false;
    this.gatewayBaseForProjects = "";
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
    this._handleLoadRelativeListSource =
      this._handleLoadRelativeListSource.bind(this);
    this._updateRelativePathInfoDisplay =
      this._updateRelativePathInfoDisplay.bind(this); // Renamed
  }

  initialize() {
    const baseUrlInput = document.getElementById("baseUrlInput");
    if (baseUrlInput) {
      baseUrlInput.value = "";
      baseUrlInput.readOnly = true;
    }
    const projectDropdown = document.getElementById("projectSelectorDropdown");
    if (projectDropdown) projectDropdown.disabled = true;

    this._deriveGatewayBaseForProjects();
    this._setupEventListeners();
    this._initializeUI();
    this._setupEventHandlers();

    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");

    this.loginHandler.initialize();
    this._fetchAndPopulateProjects();

    const baseUrlSection = document.getElementById("baseUrlSection");
    if (baseUrlSection) baseUrlSection.style.display = "";

    this._setCaptureSettingsUIsDisabled(true);
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
      const gatewayMatch = currentHref.match(/^(https?:\/\/[^/]+)/i);
      if (gatewayMatch && gatewayMatch[1]) {
        const gatewayAddress = gatewayMatch[1];
        this.gatewayBaseForProjects = `${gatewayAddress}/data/perspective/client/`;
        console.log(
          "Gateway base for project URLs derived:",
          this.gatewayBaseForProjects
        );
      } else {
        this.gatewayBaseForProjects =
          "http://localhost:8088/data/perspective/client/";
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
    const excludedProjectName = "PerspectiveCapture";
    if (!projectDropdown) return;

    projectDropdown.disabled = true;
    projectDropdown.innerHTML = '<option value="">Loading projects...</option>';
    try {
      const projects = await urlFetcher.fetchProjectList();
      projectDropdown.innerHTML =
        '<option value="">-- Select a Project --</option>';
      if (projects && projects.length > 0) {
        projects.forEach((project) => {
          if (project !== excludedProjectName) {
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
          0
        );
      }
    } catch (error) {
      console.error("Failed to fetch or populate project list:", error);
      projectDropdown.innerHTML =
        '<option value="">Error loading projects</option>';
      UI.utils.showStatus(
        error.message || "Could not load project list.",
        true,
        0
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

    this._hideCaptureFormAndPageSource();
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;

    this._performFullReset();

    this.loginHandler.updateLoginOptionsUI(null, false);

    if (this.loginHandler.optionLoginRadio) {
      this.loginHandler.optionLoginRadio.checked = false;
    }
    if (this.loginHandler.optionContinueGuestRadio) {
      this.loginHandler.optionContinueGuestRadio.checked = false;
    }
    this.loginHandler.selectedLoginOption = "";

    if (!selectedProjectName) {
      baseUrlInputElement.value = "";
      if (urlFetcher) urlFetcher.projectName = "";
      this.baseUrlValid = false;
      this.loginHandler.isLoggedIn = false;
      this.loginHandler.loggedInUsername = null;
      this.loginHandler.stopSessionMonitor();
      this.loginHandler.stopSessionPolling();
      this.loginHandler.updateLoginStatus("logged-out", "Project not selected");

      loginOptionSection.style.display = "none";
      loginRadios.forEach((radio) => (radio.disabled = true));
      this._setCaptureSettingsUIsDisabled(true);
    } else {
      loginOptionSection.style.display = "block";
      loginRadios.forEach((radio) => (radio.disabled = false));

      if (!this.gatewayBaseForProjects) {
        UI.utils.showStatus("Error: Gateway configuration missing.", true, 0);
        baseUrlInputElement.value = "";
        this.baseUrlValid = false;
      } else {
        const fullProjectUrl =
          this.gatewayBaseForProjects + selectedProjectName;
        baseUrlInputElement.value = fullProjectUrl;
        this._handleBaseUrlInput({ target: baseUrlInputElement });
      }
      this._setCaptureSettingsUIsDisabled(false);
    }
    this._checkCaptureButtonState();
    this._updateRelativePathInfoDisplay(); // Update info on project change
  }

  async _handleBaseUrlInput(event) {
    const url = event.target.value.trim();
    const loginOptionSection = document.getElementById("loginOptionSection");

    this._hideCaptureFormAndPageSource();

    if (!url || !url.includes("/client/")) {
      this.baseUrlValid = false;
      this.baseUrl = url; // Store it even if invalid for now
      if (urlFetcher) {
        urlFetcher.setBaseClientUrl(url); // Allow urlFetcher to also know, it might invalidate its state
        urlFetcher.projectName = ""; // Explicitly clear project name if URL is invalid
      }
      UI.utils.showStatus(
        url ? "Invalid Project URL format." : "Project URL is required.",
        true,
        0
      );
      if (loginOptionSection) loginOptionSection.style.display = "none";
      this.loginHandler.updateLoginOptionsUI(null, false);
      this.loginHandler.isLoggedIn = false;
      this.loginHandler.loggedInUsername = null;
      this.loginHandler.selectedLoginOption = "";
      this.loginHandler.stopSessionMonitor();
      this.loginHandler.stopSessionPolling();
      this.loginHandler.updateLoginStatus("logged-out", "Invalid project URL");
    } else {
      const success = urlFetcher.setBaseClientUrl(url);
      if (success) {
        this.baseUrl = urlFetcher.baseClientUrl; // Use the processed baseClientUrl
        this.baseUrlValid = true;
        if (loginOptionSection) loginOptionSection.style.display = "block";

        UI.utils.showStatus(
          `Project '${urlFetcher.projectName}' loaded. Checking session...`,
          false,
          4000
        );

        const sessionState =
          await this.loginHandler.checkInitialSessionAndSetupUI();

        this._hideCaptureFormAndPageSource();

        if (sessionState.isLoggedIn) {
          console.log(
            `App: Initial session check found user: ${sessionState.username}. Login option UI updated, but user must select an option.`
          );
        } else {
          console.log(
            "App: No active session found on initial check. User needs to choose login option."
          );
        }
        if (
          this.loginHandler.loginSection &&
          this.loginHandler.loginSection.style.display !== "none"
        ) {
          if (!this.loginHandler._pollInterval && !this.loginHandler.loginTab) {
            this.loginHandler.loginSection.style.display = "none";
            this.loginHandler.loginSection.innerHTML = "";
          }
        }
      } else {
        this.baseUrlValid = false;
        this.baseUrl = url;
        if (urlFetcher) urlFetcher.projectName = "";
        UI.utils.showStatus("Could not identify project from URL.", true, 0);
        if (loginOptionSection) loginOptionSection.style.display = "none";
        this.loginHandler.updateLoginOptionsUI(null, false);
      }
    }
    this._checkCaptureButtonState();
    this._updateRelativePathInfoDisplay(); // Update info on base URL change
  }

  _performFullReset() {
    console.log("[App._performFullReset] Performing full UI and data reset.");
    UI.utils.resetUI();
    AppState.reset();
    if (urlSelector.clearRenderedUrls) {
      urlSelector.clearRenderedUrls();
    }
    const jsonTextArea = document.getElementById("manualJsonText");
    if (jsonTextArea) jsonTextArea.value = "";
    const fileInput = document.getElementById("manualJsonFile");
    if (fileInput) fileInput.value = "";
    const fileNameDisplay = document.getElementById("fileNameDisplay");
    if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";

    const relativePathsTextArea = document.getElementById("relativePathsText");
    if (relativePathsTextArea) relativePathsTextArea.value = "";
    const loadRelativeListBtn = document.getElementById("loadRelativeListBtn");
    if (loadRelativeListBtn) loadRelativeListBtn.disabled = true;
    const loadManualJsonBtn = document.getElementById("loadManualJsonBtn");
    if (loadManualJsonBtn) loadManualJsonBtn.disabled = true;
    this._updateRelativePathInfoDisplay(); // Clear/update info on reset

    this.captureQueue = [];
    this.currentCaptureIndex = 0;
    if (this.isPaused) {
      this.isPaused = false;
    }
    this.updatePauseResumeButton();
    this._processingQueue = false;
    if (UI.elements.progressOutput)
      UI.elements.progressOutput.style.display = "none";
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

    const loadRelativeListBtn = document.getElementById("loadRelativeListBtn");
    if (loadRelativeListBtn) {
      events.addDOMEventListener(
        loadRelativeListBtn,
        "click",
        this._handleLoadRelativeListSource
      );
    } else {
      console.error("#loadRelativeListBtn not found!");
    }
    const relativePathsTextArea = document.getElementById("relativePathsText");
    if (relativePathsTextArea) {
      events.addDOMEventListener(relativePathsTextArea, "input", () => {
        if (loadRelativeListBtn) {
          loadRelativeListBtn.disabled = !relativePathsTextArea.value.trim();
        }
        this._checkCaptureButtonState();
        // No need to call _updateRelativePathInfoDisplay here, as it doesn't depend on textarea content, only base URL.
      });
    }
    const manualJsonTextArea = document.getElementById("manualJsonText");
    if (manualJsonTextArea && loadManualBtn) {
      events.addDOMEventListener(manualJsonTextArea, "input", () => {
        loadManualBtn.disabled = !manualJsonTextArea.value.trim();
        this._checkCaptureButtonState();
      });
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
    if (UI.elements.buttonContainer)
      UI.elements.buttonContainer.style.display = "none";

    this.createPauseResumeButton();
    this._setCaptureSettingsCollapsed(false);

    const manualArea = document.getElementById("manualJsonInputArea");
    if (manualArea) manualArea.style.display = "none";
    const relativeListArea = document.getElementById("relativeListInputArea");
    if (relativeListArea) relativeListArea.style.display = "none";

    const pageSourceSelection = document.getElementById("pageSourceSelection");
    if (pageSourceSelection) pageSourceSelection.style.display = "none";

    const loginStatusSection = document.getElementById("loginSection");
    if (loginStatusSection) loginStatusSection.style.display = "none";

    const baseUrlInput = document.getElementById("baseUrlInput");
    if (baseUrlInput && document.getElementById("projectSelectorDropdown")) {
      baseUrlInput.readOnly = true;
    }
    this._setCaptureSettingsUIsDisabled(true);
    this._updateRelativePathInfoDisplay(); // Initial call
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

  _showCaptureFormAndPageSource() {
    const captureForm = UI.elements.captureForm;
    const pageSourceSelection = document.getElementById("pageSourceSelection");
    const buttonContainer = UI.elements.buttonContainer;

    if (captureForm) captureForm.style.display = "";
    if (pageSourceSelection) pageSourceSelection.style.display = "";
    if (buttonContainer) buttonContainer.style.display = "flex";

    if (
      this.loginHandler.loginSection &&
      !this.loginHandler._pollInterval &&
      !this.loginHandler.loginTab
    ) {
      this.loginHandler.loginSection.style.display = "none";
      this.loginHandler.loginSection.innerHTML = "";
    }

    this._updateUIMode();
    this._checkCaptureButtonState();
  }

  _hideCaptureFormAndPageSource() {
    const captureForm = UI.elements.captureForm;
    const pageSourceSelection = document.getElementById("pageSourceSelection");
    const buttonContainer = UI.elements.buttonContainer;

    if (captureForm) captureForm.style.display = "none";
    if (pageSourceSelection) pageSourceSelection.style.display = "none";
    if (buttonContainer) buttonContainer.style.display = "none";

    const manualArea = document.getElementById("manualJsonInputArea");
    if (manualArea) manualArea.style.display = "none";
    const relativeListArea = document.getElementById("relativeListInputArea");
    if (relativeListArea) relativeListArea.style.display = "none";
    const urlSelectorContainer = document.getElementById(
      "urlSelectorContainer"
    );
    if (urlSelectorContainer) urlSelectorContainer.style.display = "none";

    if (urlSelector.cleanup) urlSelector.cleanup();
    this._checkCaptureButtonState();
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

          const captureFormVisible =
            UI.elements.captureForm?.style.display !== "none";
          const pageSourceVisible =
            document.getElementById("pageSourceSelection")?.style.display !==
            "none";

          if (captureFormVisible && pageSourceVisible) {
            const selectedSource = document.querySelector(
              'input[name="pageSourceOption"]:checked'
            )?.value;
            if (selectedSource === "automatic") {
              this._initiateUrlFetching();
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
      this._checkCaptureButtonState();
    }, 0);
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
      this._ensureHiddenWaitTimeStorage();
      UI.elements.waitTime = document.getElementById("hiddenWaitTime");
    }
  }

  _handleActionsInput() {
    const actionsField = UI.elements.actionsField;
    if (actionsField) {
      try {
        if (actionsField.value.trim() !== "") {
          JSON.parse(actionsField.value);
        }
      } catch (e) {
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
    const relativeListArea = document.getElementById("relativeListInputArea");
    const urlSelectorContainer = document.getElementById(
      "urlSelectorContainer"
    );

    const manualJsonStatus = document.getElementById("manualJsonStatus");
    const jsonTextArea = document.getElementById("manualJsonText");
    const fileInput = document.getElementById("manualJsonFile");
    const fileNameDisplay = document.getElementById("fileNameDisplay");
    const loadManualJsonBtn = document.getElementById("loadManualJsonBtn");

    const relativeListStatus = document.getElementById("relativeListStatus");
    const relativePathsTextArea = document.getElementById("relativePathsText");
    const loadRelativeListBtn = document.getElementById("loadRelativeListBtn");

    if (!manualArea || !relativeListArea) return;
    if (manualJsonStatus) manualJsonStatus.textContent = "";
    if (relativeListStatus) relativeListStatus.textContent = "";

    if (urlSelector.selectedUrls) urlSelector.selectedUrls.clear();
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
    if (urlFetcher) urlFetcher.dataLoadedDirectly = false;

    manualArea.style.display = "none";
    relativeListArea.style.display = "none";
    if (urlSelectorContainer) urlSelectorContainer.style.display = "none";
    if (urlSelector.clearRenderedUrls) urlSelector.clearRenderedUrls();

    if (selectedSource === "manual") {
      manualArea.style.display = "";
      if (jsonTextArea) jsonTextArea.value = "";
      if (fileInput) fileInput.value = "";
      if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";
      if (loadManualJsonBtn) loadManualJsonBtn.disabled = true;
    } else if (selectedSource === "relativeList") {
      relativeListArea.style.display = "";
      if (relativePathsTextArea) relativePathsTextArea.value = "";
      if (loadRelativeListBtn) loadRelativeListBtn.disabled = true;
    } else {
      // Automatic mode
      if (urlSelectorContainer) urlSelectorContainer.style.display = "";
      if (jsonTextArea) jsonTextArea.value = "";
      if (fileInput) fileInput.value = "";
      if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";
      if (relativePathsTextArea) relativePathsTextArea.value = "";

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
    this._updateRelativePathInfoDisplay(); // Update/show/hide info based on mode
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
      manualJsonStatus.style.color = "";
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
      fileInput.value = "";
      return;
    }

    if (fileNameDisplay) fileNameDisplay.textContent = file.name;

    try {
      const fileContent = await this._readFileContent(file);
      if (jsonTextArea) {
        jsonTextArea.value = fileContent;
        console.log(`File "${file.name}" content loaded into textarea.`);
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

    if (fileInput) fileInput.value = "";
    if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";

    if (!sourceContent) {
      manualJsonStatus.textContent = "Error: No JSON content to load.";
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
        if (
          !urlSelectorContainer &&
          typeof urlSelector.initialize === "function"
        ) {
          await urlSelector.initialize();
        }
        if (document.getElementById("urlSelectorContainer")) {
          urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
          document.getElementById("urlSelectorContainer").style.display = "";
        } else {
          throw new Error(
            "URL Selector UI could not be prepared for manual data."
          );
        }
        manualJsonStatus.textContent = `Success: Loaded ${urlFetcher.urlsList.length} pages. Select pages to capture.`;
        manualJsonStatus.style.color = "green";
      } else {
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
      loadBtn.disabled = !jsonTextArea.value.trim();
      loadBtn.textContent = "Load Pages";
      this._checkCaptureButtonState();
    }
  }

  async _handleLoadRelativeListSource() {
    const pathsTextArea = document.getElementById("relativePathsText");
    const relativeListStatus = document.getElementById("relativeListStatus");
    const urlSelectorContainer = document.getElementById(
      "urlSelectorContainer"
    );
    const loadBtn = document.getElementById("loadRelativeListBtn");

    if (!pathsTextArea || !relativeListStatus || !loadBtn) return;

    relativeListStatus.textContent = "";
    relativeListStatus.style.color = "";
    loadBtn.disabled = true;
    loadBtn.textContent = "Loading...";
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;

    const pathsContent = pathsTextArea.value.trim();

    if (!pathsContent) {
      relativeListStatus.textContent = "Error: No relative paths to load.";
      relativeListStatus.style.color = "red";
      loadBtn.disabled = false;
      loadBtn.textContent = "Load Paths";
      return;
    }

    const pathsArray = pathsContent
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p && !p.startsWith("#") && !p.startsWith("//"));

    if (pathsArray.length === 0) {
      relativeListStatus.textContent =
        "Error: No valid relative paths entered (after filtering comments/empty lines).";
      relativeListStatus.style.color = "red";
      loadBtn.disabled = !pathsTextArea.value.trim();
      loadBtn.textContent = "Load Paths";
      return;
    }

    try {
      relativeListStatus.textContent = `Processing ${pathsArray.length} relative paths...`;
      relativeListStatus.style.color = "orange";

      await urlFetcher.setPathsDirectly(pathsArray);

      if (urlFetcher.dataLoadedDirectly) {
        if (
          !urlSelectorContainer &&
          typeof urlSelector.initialize === "function"
        ) {
          await urlSelector.initialize();
        }
        if (document.getElementById("urlSelectorContainer")) {
          urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
          document.getElementById("urlSelectorContainer").style.display = "";
        } else {
          throw new Error(
            "URL Selector UI could not be prepared for relative path list data."
          );
        }
        relativeListStatus.textContent = `Success: Loaded ${urlFetcher.urlsList.length} pages. Select pages to capture.`;
        relativeListStatus.style.color = "green";
      } else {
        const errorMsg =
          urlFetcher.error?.message || "Failed to process relative path list.";
        relativeListStatus.textContent = `Error: ${errorMsg}`;
        relativeListStatus.style.color = "red";
        if (urlSelector.clearRenderedUrls) urlSelector.clearRenderedUrls();
        if (urlSelectorContainer) urlSelectorContainer.style.display = "none";
      }
    } catch (error) {
      console.error(`Error loading relative path list source:`, error);
      const errorMsg =
        error instanceof AppError
          ? error.message
          : "Error processing path list.";
      relativeListStatus.textContent = `Error: ${errorMsg}`;
      relativeListStatus.style.color = "red";
      if (urlSelector.clearRenderedUrls) urlSelector.clearRenderedUrls();
      if (urlSelectorContainer) urlSelectorContainer.style.display = "none";
    } finally {
      loadBtn.disabled = !pathsTextArea.value.trim();
      loadBtn.textContent = "Load Paths";
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
    const loadManualJsonBtn = document.getElementById("loadManualJsonBtn");
    const loadRelativeListBtn = document.getElementById("loadRelativeListBtn");

    if (!captureBtn || !buttonContainer) return;

    const selectedSource = document.querySelector(
      'input[name="pageSourceOption"]:checked'
    )?.value;

    if (loadManualJsonBtn && selectedSource === "manual") {
      const jsonTextArea = document.getElementById("manualJsonText");
      loadManualJsonBtn.disabled =
        !(jsonTextArea && jsonTextArea.value.trim()) ||
        loadManualJsonBtn.textContent === "Loading...";
    } else if (loadManualJsonBtn) {
      loadManualJsonBtn.disabled = true;
    }

    if (loadRelativeListBtn && selectedSource === "relativeList") {
      const pathsTextArea = document.getElementById("relativePathsText");
      loadRelativeListBtn.disabled =
        !(pathsTextArea && pathsTextArea.value.trim()) ||
        loadRelativeListBtn.textContent === "Loading...";
    } else if (loadRelativeListBtn) {
      loadRelativeListBtn.disabled = true;
    }

    const authOk =
      this.loginHandler.selectedLoginOption === "continueWithoutLogin" ||
      this.loginHandler.isLoggedIn;
    const prerequisitesMet =
      !this._processingQueue && this.baseUrlValid && authOk;

    let urlsAvailableAndSelected = false;
    if (selectedSource === "automatic") {
      urlsAvailableAndSelected =
        urlFetcher.urlsList.length > 0 && urlSelector.selectedUrls.size > 0;
    } else if (
      selectedSource === "manual" ||
      selectedSource === "relativeList"
    ) {
      urlsAvailableAndSelected =
        urlFetcher.dataLoadedDirectly && urlSelector.selectedUrls.size > 0;
    }

    const isReadyToCapture = prerequisitesMet && urlsAvailableAndSelected;
    captureBtn.disabled = !isReadyToCapture;

    const captureFormVisible =
      UI.elements.captureForm?.style.display !== "none";
    const pageSourceVisible =
      document.getElementById("pageSourceSelection")?.style.display !== "none";

    if (captureFormVisible && pageSourceVisible) {
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
      const pageName = URLProcessor.extractDefaultUrlSegment(url) || url;

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
      console.log(
        `[App Event] LOGIN_OPTION_SELECTED: Option: ${data.option}, LoggedIn: ${data.isLoggedIn}, Pending: ${data.loginPendingInNewTab}`
      );

      if (!data.loginPendingInNewTab) {
        this._performFullReset();
      } else {
        UI.utils.resetUI();
        AppState.reset();
      }

      if (
        !this.baseUrlValid &&
        data.option === "login" &&
        !data.loginPendingInNewTab
      ) {
        UI.utils.showStatus("Please select a valid Project URL first.", true);
        const radioLogin = document.getElementById("optionLogin");
        if (radioLogin) radioLogin.checked = false;
        this.loginHandler.selectedLoginOption = "";
        this._hideCaptureFormAndPageSource();
        return;
      }

      if (
        data.option === "continueWithoutLogin" ||
        (data.option === "login" &&
          data.isLoggedIn &&
          !data.loginPendingInNewTab)
      ) {
        this._showCaptureFormAndPageSource();
        if (this.loginHandler.loginSection) {
          this.loginHandler.loginSection.style.display = "none";
          this.loginHandler.loginSection.innerHTML = "";
        }
      } else if (data.option === "login" && data.loginPendingInNewTab) {
        this._hideCaptureFormAndPageSource();
      } else if (data.option === "") {
        this._hideCaptureFormAndPageSource();
      }
      this._checkCaptureButtonState();
    });

    events.on(events.events.LOGIN_COMPLETE, (data) => {
      console.log(
        `[App Event] LOGIN_COMPLETE: User ${data.username}, LoggedIn: ${data.loggedIn}`
      );
      this._performFullReset();

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
        `[App Event] AUTO_LOGOUT_DETECTED for user: ${
          data?.username || "unknown"
        }`
      );
      this._performFullReset();
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
      this._checkCaptureButtonState();
    });

    events.on(events.events.USER_LOGGED_OUT, (data) => {
      console.log(
        `[App Event] USER_LOGGED_OUT for user: ${data?.username || "unknown"}`
      );
      this._performFullReset();
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
      if (
        urlSelector.container &&
        typeof urlSelector.clearRenderedUrls === "function"
      )
        urlSelector.clearRenderedUrls();
      return;
    }

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

    if (
      !urlSelector.container &&
      typeof urlSelector.initialize === "function" &&
      !document.getElementById("urlSelectorContainer")
    ) {
      await urlSelector.initialize();
    }
    if (
      !urlSelector.container &&
      !document.getElementById("urlSelectorContainer")
    ) {
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
      await urlFetcher.loadUrls();
      if (urlSelector.renderUrlCategories)
        urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
      if (urlSelector.updateSelectionCounter)
        urlSelector.updateSelectionCounter();
    } catch (error) {
      console.error("Error initiating URL fetching or rendering:", error);
      const displayError =
        error instanceof AppError ? error.message : "Failed to load page list.";
      if (urlSelector.categoriesContainer) {
        urlSelector.categoriesContainer.innerHTML = `<div class="url-selector-error"><p>${displayError}</p><p>Check server or Project URL. Ensure page listing service is running for '${urlFetcher.projectName}'.</p></div>`;
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
    console.log("[App.captureScreenshots] Method invoked.");
    const progressOutput = UI.elements.progressOutput;
    const captureWarningMessage = document.getElementById(
      "captureWarningMessage"
    );

    if (!progressOutput) {
      UI.utils.showStatus("UI Error: Progress area missing.", true);
      console.error(
        "[App.captureScreenshots] Exiting: Progress output element missing."
      );
      return;
    }
    progressOutput.style.display = "";

    console.log(
      `[App.captureScreenshots] Current _processingQueue state at start: ${this._processingQueue}`
    );
    if (this._processingQueue) {
      UI.utils.showStatus("Capture is already running...", false, 3000);
      console.warn(
        "[App.captureScreenshots] Exiting: Capture already in progress because _processingQueue is true."
      );
      return;
    }

    const authOk =
      this.loginHandler.getSelectedLoginOption() === "continueWithoutLogin" ||
      this.loginHandler.getLoginStatus();
    if (!authOk) {
      UI.utils.showStatus("Please authenticate or continue as guest.", true);
      if (progressOutput) progressOutput.style.display = "none";
      console.warn("[App.captureScreenshots] Exiting: Auth not OK.");
      return;
    }
    if (!this.baseUrlValid) {
      UI.utils.showStatus("Please select a valid Project first.", true);
      if (progressOutput) progressOutput.style.display = "none";
      console.warn("[App.captureScreenshots] Exiting: Base URL not valid.");
      return;
    }

    this._setCaptureSettingsUIsDisabled(true);
    const projectDropdown = document.getElementById("projectSelectorDropdown");
    if (projectDropdown) projectDropdown.disabled = true;

    this.startTotalTime = performance.now();
    let urlList = [];
    let errorInCaptureSetup = false;

    try {
      console.log(
        "[App.captureScreenshots] Passed initial checks, entering TRY block."
      );
      console.log(
        `[App.captureScreenshots] AppState.screenshots size BEFORE AppState.reset(): ${AppState.screenshots.size}`
      );
      console.log(
        `[App.captureScreenshots] AppState.failedUrls.length BEFORE AppState.reset(): ${AppState.failedUrls.length}`
      );

      AppState.reset();
      UI.utils.resetUI();

      console.log(
        `[App.captureScreenshots] AppState.screenshots size AFTER AppState.reset(): ${AppState.screenshots.size}`
      );
      console.log(
        "[App.captureScreenshots] AppState and UI.utils.resetUI() calls completed."
      );

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
        throw new AppError("URL Selector component not available.");
      }

      if (urlList.length === 0) {
        throw new URLProcessingError(
          "Please select at least one page to capture.",
          "No URLs selected"
        );
      }
      console.log(
        `[App.captureScreenshots] Prepared to capture ${urlList.length} URLs.`
      );

      UI.progress.updateStats(urlList.length, 0, 0, 0);
      if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;

      if (captureWarningMessage) {
        captureWarningMessage.textContent =
          "The browser needs to be active for screenshots.";
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
      console.log(
        `[App.captureScreenshots] _processingQueue set to true. Starting queue processing.`
      );
      this.updatePauseResumeButton();
      await this.processCaptureQueue();
      console.log("[App.captureScreenshots] processCaptureQueue awaited.");
    } catch (error) {
      errorInCaptureSetup = true;
      handleError(error, { logToConsole: true, showToUser: true });
      this._processingQueue = false;
      console.error(
        "[App.captureScreenshots] Error during capture setup or processing:",
        error
      );
      this._setCaptureSettingsCollapsed(false);
      if (
        errorInCaptureSetup &&
        AppState.screenshots.size === 0 &&
        AppState.failedUrls.length === 0
      ) {
        if (progressOutput) progressOutput.style.display = "none";
      }
    } finally {
      console.log(
        `[App.captureScreenshots] Entering FINALLY block. isPaused: ${this.isPaused}`
      );
      const endTime = performance.now();
      const totalTimeTakenMs = this.startTotalTime
        ? endTime - this.startTotalTime
        : 0;
      const totalTimeTakenSec = (totalTimeTakenMs / 1000).toFixed(2);

      if (captureWarningMessage) captureWarningMessage.style.display = "none";

      const isQueueFullyProcessed =
        this.currentCaptureIndex >= this.captureQueue.length;

      console.log(
        `[App.captureScreenshots FINALLY] isQueueFullyProcessed: ${isQueueFullyProcessed}, currentCaptureIndex: ${this.currentCaptureIndex}, captureQueue.length: ${this.captureQueue.length}`
      );

      if (!this.isPaused) {
        console.log(
          "[App.captureScreenshots FINALLY] Not paused. Setting _processingQueue to false."
        );
        this._processingQueue = false;
        this._setCaptureSettingsUIsDisabled(false);
        if (projectDropdown) projectDropdown.disabled = false;

        if (isQueueFullyProcessed && this.startTotalTime > 0) {
          console.log(
            `[App.captureScreenshots FINALLY] Queue fully processed. Updating stats. AppState.screenshots.size: ${AppState.screenshots.size}, AppState.failedUrls.length: ${AppState.failedUrls.length}`
          );
          UI.progress.updateStats(
            this.captureQueue.length,
            AppState.screenshots.size,
            AppState.failedUrls.length,
            totalTimeTakenSec
          );
          if (!errorInCaptureSetup) {
            const failedCount = AppState.failedUrls.length;
            const successCount = AppState.screenshots.size;
            const totalAttempted = this.captureQueue?.length || 0;
            const hadFailures = failedCount > 0;
            const icon = hadFailures ? "⚠️ " : "✓ ";
            UI.utils.showStatus(
              `${icon}Capture complete. Processed ${totalAttempted} pages (${successCount} success, ${failedCount} failed).`,
              hadFailures,
              0
            );
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
            const totalInQueue =
              this.captureQueue?.length || successCount + failedCount;
            const icon = failedCount > 0 ? "⚠️ " : "ℹ️ ";
            UI.utils.showStatus(
              `${icon}Processing finished. Captured ${
                successCount + failedCount
              } of ${totalInQueue} pages.`,
              failedCount > 0,
              0
            );
            UI.progress.updateStats(
              totalInQueue,
              successCount,
              failedCount,
              totalTimeTakenSec
            );
          } else if (!errorInCaptureSetup) {
            UI.utils.showStatus("ℹ️ No pages were processed.", false, 0);
          }
        }
      } else {
        console.log(
          "[App.captureScreenshots FINALLY] Is paused. _processingQueue should have been set to false by processCaptureQueue."
        );
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
      console.log(
        `[App.captureScreenshots FINALLY] Final _processingQueue state: ${this._processingQueue}`
      );
    }
  }

  async processCaptureQueue() {
    const captureWarningMessage = document.getElementById(
      "captureWarningMessage"
    );
    const projectDropdown = document.getElementById("projectSelectorDropdown");
    console.log(
      `[App.processCaptureQueue] Starting. isPaused: ${this.isPaused}, currentCaptureIndex: ${this.currentCaptureIndex}, queueLength: ${this.captureQueue.length}`
    );

    if (this.isPaused || this.currentCaptureIndex >= this.captureQueue.length) {
      if (this.isPaused) {
        console.log(
          "[App.processCaptureQueue] Paused. Setting _processingQueue to false."
        );
        this._processingQueue = false;
      }
      if (
        !this.isPaused &&
        this.currentCaptureIndex >= this.captureQueue.length
      ) {
        console.log(
          "[App.processCaptureQueue] Queue finished. Setting _processingQueue to false."
        );
        this._processingQueue = false;
        if (captureWarningMessage) captureWarningMessage.style.display = "none";
        this._setCaptureSettingsUIsDisabled(false);
        if (projectDropdown) projectDropdown.disabled = false;
      }
      this.updatePauseResumeButton();
      console.log(
        `[App.processCaptureQueue] Exiting early. _processingQueue: ${this._processingQueue}`
      );
      return;
    }

    if (!this._processingQueue) {
      console.log(
        "[App.processCaptureQueue] _processingQueue was false, setting to true."
      );
      this._processingQueue = true;
    }
    this._setCaptureSettingsUIsDisabled(true);
    if (projectDropdown) projectDropdown.disabled = true;
    this.updatePauseResumeButton();

    if (
      captureWarningMessage &&
      captureWarningMessage.style.display === "none" &&
      !this.isPaused
    ) {
      captureWarningMessage.textContent =
        "The browser needs to be active for screenshots.";
      captureWarningMessage.style.display = "block";
    }

    const totalUrls = this.captureQueue.length;
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;

    while (this.currentCaptureIndex < totalUrls && !this.isPaused) {
      const itemIndex = this.currentCaptureIndex;
      const item = this.captureQueue[itemIndex];

      if (!item || !item.url) {
        console.error(
          `[App.processCaptureQueue] Invalid item at queue index ${itemIndex}:`,
          item
        );
        AppState.addFailedUrl(`Invalid Item @ Queue Index ${itemIndex}`);
        this.currentCaptureIndex++;
        if (UI.elements.progressBar)
          UI.progress.updateProgress(this.currentCaptureIndex, totalUrls);
        continue;
      }

      const { url, index, capturePreset, captureFullPage, actionSequences } =
        item;

      console.log(
        `[App.processCaptureQueue] Processing item ${
          itemIndex + 1
        }/${totalUrls}: ${url}`
      );
      if (UI.elements.progress)
        UI.progress.updateProgressMessage(
          `⏳ Processing ${
            itemIndex + 1
          } of ${totalUrls}: ${URLProcessor.extractDefaultUrlSegment(url)}`
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
          console.log(
            "[App.processCaptureQueue] Paused during takeScreenshot. Breaking loop."
          );
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

        if (result.detectedMountIssue)
          console.warn(
            `[App.processCaptureQueue] Screenshot for ${url} captured with mount issue: ${result.mountIssueMessage}`
          );

        UI.thumbnails.addLiveThumbnail(result, result.fileName, url);
        AppState.addScreenshot(url, result);
        AppState.removeFailedUrl(url);
      } catch (error) {
        if (this.isPaused) {
          console.log(
            "[App.processCaptureQueue] Paused during error handling. Breaking loop."
          );
          this._processingQueue = false;
          break;
        }
        console.error(
          `[App.processCaptureQueue] Error processing ${url}:`,
          error
        );
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
          errorMessage: error.message || "Unknown error",
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
          `✗ Failed: ${URLProcessor.extractDefaultUrlSegment(
            url
          )} ${displayError}`,
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
        console.log(
          "[App.processCaptureQueue] Paused at end of loop iteration."
        );
        this._processingQueue = false;
        break;
      }
    }

    const isFinished = this.currentCaptureIndex >= totalUrls;
    console.log(
      `[App.processCaptureQueue] Loop finished. isFinished: ${isFinished}, isPaused: ${this.isPaused}`
    );

    if (!this.isPaused) {
      this._processingQueue = false;
      if (isFinished) {
        this._setCaptureSettingsUIsDisabled(false);
        if (projectDropdown) projectDropdown.disabled = false;
        if (captureWarningMessage) captureWarningMessage.style.display = "none";
      }
    } else {
      this._processingQueue = false;
      if (UI.elements.progress)
        UI.utils.showStatus(
          `⏳ Paused at ${
            this.currentCaptureIndex + 1
          } of ${totalUrls}. Resume (▶️) to continue.`,
          false,
          0
        );
      if (captureWarningMessage) captureWarningMessage.style.display = "block";
    }
    this.updatePauseResumeButton();
    console.log(
      `[App.processCaptureQueue] Exiting. Final _processingQueue: ${this._processingQueue}`
    );
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
    const projectDropdown = document.getElementById("projectSelectorDropdown");

    if (this.isPaused) {
      console.log("Pause requested.");
      if (captureWarningMessage) captureWarningMessage.style.display = "block";
    } else {
      console.log("Resume requested.");
      this._setCaptureSettingsUIsDisabled(true);
      if (projectDropdown) projectDropdown.disabled = true;
      UI.utils.showStatus("", false, 1);

      if (
        captureWarningMessage &&
        this.captureQueue.length > this.currentCaptureIndex
      ) {
        captureWarningMessage.textContent =
          "The browser needs to be active for screenshots.";
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
    if (!content || !wrapper) return;

    const isCollapsed = content.classList.toggle("collapsed");
    wrapper.classList.toggle("collapsed", isCollapsed);
    console.log(`"Pages" section toggled. Collapsed: ${isCollapsed}`);
  }

  _setCaptureSettingsCollapsed(collapsed) {
    const content = document.getElementById("captureSettingsContent");
    const wrapper = document.getElementById("captureSettingsToggle");
    if (!content || !wrapper) return;

    content.classList.toggle("collapsed", collapsed);
    wrapper.classList.toggle("collapsed", collapsed);
  }

  // Renamed from _updateRelativePathExample
  _updateRelativePathInfoDisplay() {
    const infoDiv = document.getElementById("relativePathInfo");
    const currentProjectUrlDisplay = document.getElementById(
      "currentProjectUrlDisplay"
    );
    const finalUrlExamplePrefix = document.getElementById(
      "finalUrlExamplePrefix"
    );
    const selectedSource = document.querySelector(
      'input[name="pageSourceOption"]:checked'
    )?.value;

    if (!infoDiv || !currentProjectUrlDisplay || !finalUrlExamplePrefix) return;

    if (
      selectedSource === "relativeList" &&
      this.baseUrlValid &&
      urlFetcher.baseClientUrl
    ) {
      infoDiv.style.display = "block";
      currentProjectUrlDisplay.textContent = urlFetcher.baseClientUrl;
      finalUrlExamplePrefix.textContent = urlFetcher.baseClientUrl;
    } else {
      infoDiv.style.display = "none";
      currentProjectUrlDisplay.textContent = "N/A";
      finalUrlExamplePrefix.textContent = "PROJECT_URL";
    }
  }
}

export default App;
