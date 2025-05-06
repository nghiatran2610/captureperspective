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
    this.generatePrefilledUrl = this.generatePrefilledUrl.bind(this);
    this.prefilledUrl = null;
    this.baseUrl = "";
    this.baseUrlValid = false;
    this.loginHandler = LoginHandler; // Use the imported singleton

    // State for pause/resume
    this.isPaused = false;
    this.captureQueue = []; // Stores {url, index, capturePreset, captureFullPage, actionSequences}
    this.currentCaptureIndex = 0;
    this.pauseResumeCapture = this.pauseResumeCapture.bind(this);
    this._handleBaseUrlInput = this._handleBaseUrlInput.bind(this);
    this._initiateUrlFetching = this._initiateUrlFetching.bind(this);
    this._processingQueue = false; // Flag to indicate if queue processing is active
    this.startTotalTime = 0; // For overall timing
    this._toggleCaptureSettings = this._toggleCaptureSettings.bind(this);
    this._handleSourceChange = this._handleSourceChange.bind(this);
    // Bind new handlers
    this._handleLoadManualSource = this._handleLoadManualSource.bind(this); // Renamed from _handleManualLoad
    this._handleFileUpload = this._handleFileUpload.bind(this);
  }
  initialize() {
    // Generate and set prefilled URL if applicable << REMOVE/COMMENT THIS BLOCK
    // this.prefilledUrl = this.generatePrefilledUrl(); // << REMOVE/COMMENT
    const baseUrlInput = document.getElementById("baseUrlInput");
    // if (baseUrlInput) {                                  // << REMOVE/COMMENT
    //   baseUrlInput.value = this.prefilledUrl || config.prefill.fallbackUrl; // << REMOVE/COMMENT
    // }                                                    // << REMOVE/COMMENT

    // Ensure the input is empty initially (optional, usually default)
    if (baseUrlInput) {
      baseUrlInput.value = ""; // Explicitly set to empty
    }

    // Setup listeners and initial UI state
    this._setupEventListeners(); // Includes new listeners now
    this._initializeUI();
    this._setupEventHandlers(); // Includes new handlers now

    // Set initial mode class on body
    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");

    // Initialize Login Handler
    this.loginHandler.initialize();

    // Initial UI Visibility Control based on prefilled URL state
    const baseUrlSection = document.getElementById("baseUrlSection");
    const loginOptionSection = document.getElementById("loginOptionSection");
    const loginSection = document.getElementById("loginSection");
    const captureForm = UI.elements.captureForm;
    const progressOutput = UI.elements.progressOutput;

    // Ensure all necessary elements exist before manipulating styles
    if (
      !baseUrlSection ||
      !loginOptionSection ||
      !loginSection ||
      !captureForm ||
      !progressOutput ||
      !baseUrlInput // Check moved here
    ) {
      console.error(
        "Initialization Error: One or more critical UI elements not found."
      );
      return;
    }

    // Make base URL section visible
    baseUrlSection.style.display = "";

    // Trigger initial validation based on the now empty value
    // This will correctly set the initial disabled state for subsequent sections
    this._handleBaseUrlInput({ target: baseUrlInput });

    console.log("Application initialized.");
  }

  _handleBaseUrlInput(event) {
    const url = event.target.value.trim();
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

    statusElement.textContent = "";
    statusElement.style.color = "";
    loginOptionSection.style.display = "none";
    loginSection.style.display = "none";
    captureForm.style.display = "none";
    progressOutput.style.display = "none";
    pageSourceSelection.style.display = "none";
    urlSelector.cleanup();

    if (!url || !url.includes("/client/")) {
      this.baseUrlValid = false;
      this.baseUrl = url;
      if (url && !url.includes("/client/")) {
        statusElement.textContent =
          "Invalid format. Expected .../client/PROJECT_NAME";
        statusElement.style.color = "red";
      } else if (!url) {
        statusElement.textContent = "";
      }
      urlFetcher.projectName = "";
      this._disableLoginOptions();
      this._checkCaptureButtonState();
      return;
    }

    const success = urlFetcher.setBaseClientUrl(url);
    if (success) {
      this.baseUrl = urlFetcher.baseClientUrl;
      this.baseUrlValid = true;
      statusElement.textContent = "Base URL looks valid.";
      statusElement.style.color = "green";
      loginOptionSection.style.display = "block";
      this._enableLoginOptions();
      captureForm.style.display = "none";
    } else {
      this.baseUrlValid = false;
      this.baseUrl = url;
      statusElement.textContent =
        "Could not extract project name. Check format.";
      statusElement.style.color = "red";
      urlFetcher.projectName = "";
      this._disableLoginOptions();
      captureForm.style.display = "none";
      urlSelector.cleanup();
    }
    this._checkCaptureButtonState();
  }

  _setupEventListeners() {
    const baseUrlInput = document.getElementById("baseUrlInput");
    if (baseUrlInput) {
      events.addDOMEventListener(
        baseUrlInput,
        "input",
        this._handleBaseUrlInput
      );
      events.addDOMEventListener(
        baseUrlInput,
        "blur",
        this._handleBaseUrlInput
      );
    } else {
      console.error("#baseUrlInput element not found!");
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

    // "Load Manual Pages" button listener
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

    // File input listener
    const fileInput = document.getElementById("manualJsonFile");
    if (fileInput) {
      events.addDOMEventListener(fileInput, "change", this._handleFileUpload);
    } else {
      console.error("#manualJsonFile input not found!");
    }
  }

  _initializeUI() {
    this._ensureHiddenWaitTimeStorage();
    if (UI.elements.waitTime) {
      UI.elements.waitTime.value = config.ui.defaultWaitTime || 5;
    }

    if (UI.elements.captureBtn) {
      UI.elements.captureBtn.disabled = true;
    }
    this.createPauseResumeButton();
    this._setCaptureSettingsCollapsed(false);

    const manualArea = document.getElementById("manualJsonInputArea");
    if (manualArea) manualArea.style.display = "none";

    const pageSourceSelection = document.getElementById("pageSourceSelection");
    if (pageSourceSelection) pageSourceSelection.style.display = "none";
  }

  _ensureHiddenWaitTimeStorage() {
    let hiddenWaitTime = document.getElementById("hiddenWaitTime");
    if (!hiddenWaitTime) {
      hiddenWaitTime = document.createElement("input");
      hiddenWaitTime.type = "hidden";
      hiddenWaitTime.id = "hiddenWaitTime";
      hiddenWaitTime.value = config.ui.defaultWaitTime || 5;
      document.body.appendChild(hiddenWaitTime);
      if (
        !UI.elements.waitTime ||
        UI.elements.waitTime.id !== "simpleWaitTime"
      ) {
        UI.elements.waitTime = hiddenWaitTime;
      }
    } else if (
      !UI.elements.waitTime ||
      UI.elements.waitTime.id !== "simpleWaitTime"
    ) {
      UI.elements.waitTime = hiddenWaitTime;
    }
  }

  _disableLoginOptions() {
    const radios = document.querySelectorAll('input[name="loginOption"]');
    radios.forEach((radio) => {
      radio.disabled = true;
      radio.checked = false;
    });
    const loginSection = document.getElementById("loginSection");
    const captureForm = UI.elements.captureForm;
    if (loginSection) loginSection.style.display = "none";
    if (captureForm) captureForm.style.display = "none";
  }

  _enableLoginOptions() {
    const radios = document.querySelectorAll('input[name="loginOption"]');
    radios.forEach((radio) => (radio.disabled = false));
  }

  generatePrefilledUrl() {
    if (!config.prefill.enabled) {
      return config.prefill.fallbackUrl;
    }
    const currentUrl = window.location.href;
    const regex = config.prefill.sourcePattern;
    const match = currentUrl.match(regex);
    if (match && match.length >= 4) {
      try {
        const prefilledUrl = config.prefill.targetTemplate
          .replace("$1", match[1] || "")
          .replace("$2", match[2])
          .replace("$3", match[3]);
        console.log("Generated prefilled URL:", prefilledUrl);
        return prefilledUrl;
      } catch (e) {
        console.error("Error generating prefilled URL:", e);
        return config.prefill.fallbackUrl;
      }
    }
    console.log("URL pattern not matched for prefill, using fallback.");
    return config.prefill.fallbackUrl;
  }

  _updateUIMode() {
    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");

    const captureForm = UI.elements.captureForm;
    const advancedOptions = UI.elements.advancedOptions;
    const pageSourceSelection = document.getElementById("pageSourceSelection");

    if (captureForm) captureForm.style.display = "";
    if (advancedOptions) advancedOptions.style.display = "none";
    if (pageSourceSelection) pageSourceSelection.style.display = "";

    this._setupSimpleModeSettings();

    setTimeout(async () => {
      if (!document.getElementById("urlSelectorContainer")) {
        console.log("Initializing URL Selector for Simple Mode...");
        try {
          await urlSelector.initialize();
          this._setCaptureSettingsCollapsed(false);
          this._handleSourceChange();
        } catch (error) {
          console.error("Failed to initialize URL selector:", error);
          if (typeof urlSelector.showFallbackUI === "function") {
            urlSelector.showFallbackUI();
          }
        }
      } else {
        urlSelector.clearRenderedUrls();
        this._setCaptureSettingsCollapsed(false);
        this._handleSourceChange();
      }
      this._checkCaptureButtonState();
    }, 0);

    UI.utils.resetUI();
  }

  _setupSimpleModeSettings() {
    const parentElement = UI.elements.captureSettingsContent;
    const urlInputContainer = UI.elements.urlInputContainer;
    if (!parentElement || !urlInputContainer) {
      console.error("Cannot setup simple settings...");
      return;
    }
    const screenSizeRow = parentElement.querySelector(
      ".screen-size-row.important-setting-group"
    );
    if (!screenSizeRow) {
      console.error(".screen-size-row... not found.");
      return;
    }

    let waitTimeContainer = document.getElementById("simpleWaitTimeContainer");
    let simpleWaitTimeInput = document.getElementById("simpleWaitTime");

    if (!waitTimeContainer) {
      waitTimeContainer = document.createElement("div");
      waitTimeContainer.id = "simpleWaitTimeContainer";
      waitTimeContainer.className = "setting-container important-setting-group";

      const waitTimeLabel = document.createElement("label");
      waitTimeLabel.textContent = "Max Wait Time (sec):";
      waitTimeLabel.htmlFor = "simpleWaitTime";
      waitTimeContainer.appendChild(waitTimeLabel);

      simpleWaitTimeInput = document.createElement("input");
      simpleWaitTimeInput.type = "number";
      simpleWaitTimeInput.id = "simpleWaitTime";
      simpleWaitTimeInput.className = "wait-time-input";
      simpleWaitTimeInput.min = "1";
      simpleWaitTimeInput.max = config.timing.maxWaitTime / 1000 || 120;
      const hiddenWait =
        document.getElementById("hiddenWaitTime") || UI.elements.waitTime;
      simpleWaitTimeInput.value =
        hiddenWait?.value || config.ui.defaultWaitTime || 5;
      waitTimeContainer.appendChild(simpleWaitTimeInput);

      events.addDOMEventListener(simpleWaitTimeInput, "change", (event) => {
        const hidden =
          document.getElementById("hiddenWaitTime") || UI.elements.waitTime;
        if (hidden) hidden.value = event.target.value;
      });

      screenSizeRow.insertAdjacentElement("afterend", waitTimeContainer);
    } else {
      waitTimeContainer.style.display = "";
      if (!waitTimeContainer.classList.contains("important-setting-group")) {
        waitTimeContainer.classList.add("important-setting-group");
      }
    }
    if (simpleWaitTimeInput && UI.elements.waitTime !== simpleWaitTimeInput) {
      UI.elements.waitTime = simpleWaitTimeInput;
    }
  }

  _handleActionsInput() {
    console.log("Actions input changed (Simple Mode - No Action)");
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
      console.error("Manual JSON input area not found.");
      return;
    }
    if (
      !urlSelectorContainer &&
      typeof urlSelector.initialize === "function" &&
      !document.getElementById("urlSelectorContainer")
    ) {
      console.warn(
        "URL Selector container not ready for source change handling yet."
      );
      return;
    }

    if (manualJsonStatus) manualJsonStatus.textContent = "";

    if (selectedSource === "manual") {
      manualArea.style.display = "";
      if (urlSelectorContainer) urlSelectorContainer.style.display = "none";
      urlSelector.clearRenderedUrls();
      urlFetcher.dataLoadedDirectly = false;
      urlFetcher.urlsList = [];
      urlFetcher.categorizedUrls = {};
      this.captureQueue = [];
      AppState.reset();
      UI.utils.resetUI();
      if (jsonTextArea) jsonTextArea.value = "";
      if (fileInput) fileInput.value = "";
      if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";
      UI.elements.captureBtn.disabled = true;
    } else {
      // 'automatic' selected
      manualArea.style.display = "none";
      if (urlSelectorContainer) urlSelectorContainer.style.display = "";
      urlSelector.clearRenderedUrls();
      if (jsonTextArea) jsonTextArea.value = "";
      if (fileInput) fileInput.value = "";
      if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";

      if (this.baseUrlValid && this.loginHandler.isAuthenticatedForCapture()) {
        console.log("Automatic source selected, initiating fetch...");
        this._initiateUrlFetching();
      } else {
        console.log("Automatic source selected, but prerequisites not met.");
        if (urlSelector.container) {
          urlSelector.showLoadingState("Waiting for Base URL/Login...");
        }
        UI.elements.captureBtn.disabled = true;
      }
    }
    this._checkCaptureButtonState();
  }

  // --- UPDATED: Handles file selection ---
  // Now only reads file and populates textarea. Does NOT trigger load.
  async _handleFileUpload(event) {
    const fileInput = event.target;
    const fileNameDisplay = document.getElementById("fileNameDisplay");
    const manualJsonStatus = document.getElementById("manualJsonStatus");
    const jsonTextArea = document.getElementById("manualJsonText");

    // Clear status and file display first
    if (manualJsonStatus) {
      manualJsonStatus.textContent = "";
      manualJsonStatus.style.color = "";
    }
    if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";

    if (!fileInput.files || fileInput.files.length === 0) {
      return; // No file selected
    }

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
      fileInput.value = ""; // Clear the invalid selection
      return;
    }

    if (fileNameDisplay) {
      fileNameDisplay.textContent = file.name; // Show selected file name
    }

    // Read the file content and put it into the textarea
    try {
      const fileContent = await this._readFileContent(file);
      if (jsonTextArea) {
        jsonTextArea.value = fileContent; // Populate textarea
        console.log(`File "${file.name}" content loaded into textarea.`);
        if (manualJsonStatus) {
          manualJsonStatus.textContent = `File "${file.name}" ready to load. Click "Load Manual Pages".`;
          manualJsonStatus.style.color = "blue"; // Use a neutral/info color
        }
      }
      // Optionally clear the file input after successful read?
      // fileInput.value = '';
      // if(fileNameDisplay) fileNameDisplay.textContent = 'File content loaded to textarea';
    } catch (readError) {
      console.error("Error reading file:", readError);
      if (manualJsonStatus) {
        manualJsonStatus.textContent = `Error reading file: ${readError.message}`;
        manualJsonStatus.style.color = "red";
      }
      if (fileNameDisplay) fileNameDisplay.textContent = "Error reading file";
      fileInput.value = ""; // Clear selection on error
    }
    // Update button state - might enable load button if textarea now has content
    this._checkCaptureButtonState();
  }

  // --- UPDATED: Handles the click on the "Load Manual Pages" button ---
  // Now ONLY reads from the textarea.
  async _handleLoadManualSource() {
    const jsonTextArea = document.getElementById("manualJsonText");
    const manualJsonStatus = document.getElementById("manualJsonStatus");
    const urlSelectorContainer = document.getElementById(
      "urlSelectorContainer"
    );
    const loadBtn = document.getElementById("loadManualJsonBtn");
    const fileInput = document.getElementById("manualJsonFile"); // Added ref
    const fileNameDisplay = document.getElementById("fileNameDisplay"); // Added ref

    if (
      !jsonTextArea ||
      !manualJsonStatus ||
      !urlSelectorContainer ||
      !loadBtn
    ) {
      console.error("Cannot load manual source: UI elements missing.");
      return;
    }

    manualJsonStatus.textContent = ""; // Clear previous status
    manualJsonStatus.style.color = "";
    loadBtn.disabled = true;
    loadBtn.textContent = "Loading...";
    UI.elements.captureBtn.disabled = true; // Disable capture while loading

    const sourceContent = jsonTextArea.value.trim();
    const sourceDescription = "textarea content";

    // --- Clear file input when loading from textarea ---
    if (fileInput) fileInput.value = "";
    if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";

    if (!sourceContent) {
      manualJsonStatus.textContent =
        "Error: Paste JSON content into the textarea first.";
      manualJsonStatus.style.color = "red";
      loadBtn.disabled = false;
      loadBtn.textContent = "Load Manual Pages";
      return;
    }

    try {
      manualJsonStatus.textContent = `Processing ${sourceDescription}...`;
      manualJsonStatus.style.color = "orange";

      await urlFetcher.setDataDirectly(sourceContent);

      if (urlFetcher.dataLoadedDirectly) {
        urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
        urlSelectorContainer.style.display = "";
        manualJsonStatus.textContent = `Success: Loaded ${urlFetcher.urlsList.length} pages from ${sourceDescription}.`;
        manualJsonStatus.style.color = "green";
      } else {
        const errorMsg =
          urlFetcher.error?.message ||
          "Failed to process JSON data. Check format.";
        manualJsonStatus.textContent = `Error: ${errorMsg}`;
        manualJsonStatus.style.color = "red";
        urlSelector.clearRenderedUrls();
        urlSelectorContainer.style.display = "none";
        UI.elements.captureBtn.disabled = true;
      }
    } catch (error) {
      console.error(
        `Error loading manual source from ${sourceDescription}:`,
        error
      );
      const errorMsg =
        error instanceof URLProcessingError
          ? error.message
          : "Invalid JSON format or structure.";
      manualJsonStatus.textContent = `Error: ${errorMsg}`;
      manualJsonStatus.style.color = "red";
      urlSelector.clearRenderedUrls();
      urlSelectorContainer.style.display = "none";
      UI.elements.captureBtn.disabled = true;
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = "Load Manual Pages";
      this._checkCaptureButtonState(); // Check main capture button state
    }
  }

  _readFileContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        resolve(event.target.result);
      };
      reader.onerror = (event) => {
        reject(
          new Error(
            "File could not be read. Error code: " + event.target.error.code
          )
        );
      };
      reader.readAsText(file); // Read the file as text
    });
  }

  _checkCaptureButtonState() {
    const captureBtn = UI.elements.captureBtn;
    const buttonContainer = UI.elements.buttonContainer;
    if (!captureBtn || !buttonContainer) {
      return;
    }

    const selectedSource = document.querySelector(
      'input[name="pageSourceOption"]:checked'
    )?.value;
    const isManualModeActiveAndLoaded =
      selectedSource === "manual" && urlFetcher.dataLoadedDirectly;

    const prerequisitesMet =
      !this._processingQueue &&
      this.baseUrlValid &&
      this.loginHandler.isAuthenticatedForCapture();
    const urlsSelected = urlSelector.selectedUrls.size > 0;
    const dataAvailableAndSelected =
      urlsSelected &&
      (selectedSource === "automatic" || isManualModeActiveAndLoaded);

    const isReadyToCapture = prerequisitesMet && dataAvailableAndSelected;

    captureBtn.disabled = !isReadyToCapture;

    if (UI.elements.captureForm.style.display !== "none") {
      buttonContainer.style.display = "";
      buttonContainer.classList.remove("hidden");
    } else {
      buttonContainer.style.display = "none";
      buttonContainer.classList.add("hidden");
    }
  }

  _setupEventHandlers() {
    events.on(events.events.CAPTURE_PROGRESS, (data) => {
      if (data && data.message) UI.progress.updateProgressMessage(data.message);
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
      UI.utils.showStatus(
        `✓ Captured: ${url} (${sizeDesc}) (${timeTaken}s)`,
        false,
        5000
      );
    });
    events.on("URL_SELECTION_CHANGED", (data) => {
      this._checkCaptureButtonState();
    });

    events.on("LOGIN_OPTION_SELECTED", (data) => {
      if (!this.baseUrlValid) {
        return;
      }
      this.loginHandler.handleLoginOptionChange(data.option);

      const captureForm = UI.elements.captureForm;
      const pageSourceSelection = document.getElementById(
        "pageSourceSelection"
      );

      if (data.option === "continueWithoutLogin") {
        this._updateUIMode();
      } else {
        if (captureForm) captureForm.style.display = "none";
        if (pageSourceSelection) pageSourceSelection.style.display = "none";
      }
      this._checkCaptureButtonState();
    });

    events.on("LOGIN_COMPLETE", (data) => {
      const loginSection = document.getElementById("loginSection");
      const captureForm = UI.elements.captureForm;
      const pageSourceSelection = document.getElementById(
        "pageSourceSelection"
      );

      if (loginSection) loginSection.style.display = "block";

      if (data.loggedIn) {
        this._updateUIMode();
      } else {
        if (this.loginHandler.getSelectedLoginOption() === "login") {
          UI.utils.showStatus(
            "Login failed. Select 'Continue without login' or try again.",
            true
          );
          if (captureForm) captureForm.style.display = "none";
          if (pageSourceSelection) pageSourceSelection.style.display = "none";
        }
      }
      this._checkCaptureButtonState();
    });
  }

  async _initiateUrlFetching() {
    const selectedSource = document.querySelector(
      'input[name="pageSourceOption"]:checked'
    )?.value;
    if (selectedSource !== "automatic") {
      console.log("Skipping automatic fetch, source is not 'automatic'.");
      if (urlSelector.container && urlSelector.clearRenderedUrls) {
        urlSelector.clearRenderedUrls();
      }
      return;
    }
    if (!this.baseUrlValid || !this.loginHandler.isAuthenticatedForCapture()) {
      console.warn(
        "Attempted automatic fetch, but Base URL/Login state invalid."
      );
      if (urlSelector.container && urlSelector.showLoadingState) {
        urlSelector.showLoadingState("Waiting for Base URL/Login...");
      }
      return;
    }
    if (
      !document.getElementById("urlSelectorContainer") ||
      !urlSelector.container
    ) {
      console.error("URL selector not ready for fetching.");
      UI.utils.showStatus("UI Error: URL Selector not ready.", true);
      return;
    }

    urlSelector.showLoadingState();
    try {
      console.log("Fetching URLs from endpoint (Automatic source).");
      await urlFetcher.loadUrls();
      console.log("Fetching from endpoint complete.");

      urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
      urlSelector.updateSelectionCounter();
    } catch (error) {
      handleError(error, { logToConsole: true, showToUser: true });
      const displayError =
        error instanceof AppError ? error.message : "Failed to load page list.";
      if (urlSelector.categoriesContainer) {
        urlSelector.categoriesContainer.innerHTML = `<div class="url-selector-error"><p>${displayError}</p><p>Check connection or Base URL.</p></div>`;
      } else if (typeof urlSelector.showFallbackUI === "function") {
        urlSelector.showFallbackUI();
      }
      urlSelector.updateSelectionCounter();
    } finally {
      this._checkCaptureButtonState();
    }
  }

  async captureScreenshots() {
    const progressOutput = UI.elements.progressOutput;
    if (!progressOutput) {
      UI.utils.showStatus("UI Error: Progress area missing.", true);
      return;
    }
    progressOutput.style.display = "";

    if (this._processingQueue) {
      UI.utils.showStatus("Capture running...", false, 3000);
      return;
    }
    if (!this.loginHandler.isAuthenticatedForCapture()) {
      UI.utils.showStatus("Please authenticate or continue as guest.", true);
      progressOutput.style.display = "none";
      return;
    }
    if (!this.baseUrlValid) {
      UI.utils.showStatus("Please provide a valid Base URL.", true);
      progressOutput.style.display = "none";
      return;
    }

    this.startTotalTime = performance.now();
    let urlList = [];

    try {
      AppState.reset();
      UI.utils.resetUI();
      // this.isPaused = false; // Moved down
      // this.captureQueue = []; // Moved down
      // this.currentCaptureIndex = 0; // Moved down
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
        throw new Error("URL Selector component not available.");
      }

      if (urlList.length === 0) {
        throw new URLProcessingError(
          "Please select at least one page.",
          "No URLs selected"
        );
      }

      UI.progress.updateStats(urlList.length, 0, 0, 0);
      UI.elements.captureBtn.disabled = true; // Disable main capture button

      // *** MODIFICATION START ***
      // Prepare queue and state variables related to processing BEFORE updating the pause/resume button
      this.captureQueue = urlList.map((url, index) => ({
        url,
        index,
        capturePreset,
        captureFullPage,
        actionSequences: [], // Assuming simple mode for this part, adjust if needed
      }));
      this.currentCaptureIndex = 0;
      this.isPaused = false; // Ensure isPaused is false at the start
      this._processingQueue = true; // Set processing flag to true

      this.updatePauseResumeButton(); // NOW update the pause/resume button.
      // _processingQueue is true, isPaused is false,
      // so the button should show "Pause" ⏸️ and be enabled.
      // *** MODIFICATION END ***

      await this.processCaptureQueue();
    } catch (error) {
      handleError(error, { logToConsole: true, showToUser: true });
      this._processingQueue = false; // Ensure reset on error
      this._setCaptureSettingsCollapsed(false);
      // this._checkCaptureButtonState(); // Redundant here, finally block handles it
      // this.updatePauseResumeButton(); // Redundant here, finally block handles it
      if (progressOutput) progressOutput.style.display = "none";
    } finally {
      const isFinished = this.currentCaptureIndex >= this.captureQueue.length;
      const endTotalTime = performance.now();
      const totalTimeTaken = this.startTotalTime
        ? ((endTotalTime - this.startTotalTime) / 1000).toFixed(2)
        : "N/A";

      if (this.startTotalTime && isFinished && !this.isPaused) {
        UI.progress.updateStats(
          this.captureQueue.length,
          AppState.screenshots.size,
          AppState.failedUrls.length,
          totalTimeTaken
        );
      }

      // If not paused (i.e., process completed or errored out fully),
      // then _processingQueue should be false.
      if (!this.isPaused) {
        this._processingQueue = false;
      }

      // Update button states after everything, regardless of pause state
      this._checkCaptureButtonState(); // This will enable/disable captureBtn
      this.updatePauseResumeButton(); // This will correctly reflect pause/resume state

      const pdfBtnVisible = AppState.screenshots.size > 0;
      const combineAllPdfBtn = document.querySelector(".combine-all-pdf-btn");
      if (combineAllPdfBtn?.parentElement) {
        const pdfContainer =
          combineAllPdfBtn.closest(".combine-all-pdf-container") ||
          combineAllPdfBtn.parentElement;
        pdfContainer.style.display = pdfBtnVisible ? "flex" : "none";
        combineAllPdfBtn.disabled = !pdfBtnVisible;
      }
      // Redundant _processingQueue = false removed, handled above or in processCaptureQueue
    }
  }

  async processCaptureQueue() {
    if (this.isPaused || this.currentCaptureIndex >= this.captureQueue.length) {
      if (this.isPaused) {
        this._processingQueue = false;
      }
      return;
    }
    if (!this._processingQueue) {
      this._processingQueue = true;
      console.log("Starting/Resuming queue processing...");
    }
    const totalUrls = this.captureQueue.length;
    while (this.currentCaptureIndex < totalUrls && !this.isPaused) {
      const itemIndex = this.currentCaptureIndex;
      const item = this.captureQueue[itemIndex];
      if (!item || !item.url) {
        console.error(`Invalid item at index ${itemIndex}`, item);
        AppState.addFailedUrl(`Invalid Item @ ${itemIndex}`);
        this.currentCaptureIndex++;
        continue;
      }
      const { url, index, capturePreset, captureFullPage, actionSequences } =
        item;
      UI.progress.updateProgressMessage(
        `Processing ${itemIndex + 1} of ${totalUrls}: ${url}`
      );
      UI.progress.updateProgress(itemIndex, totalUrls);
      try {
        const result = await ScreenshotCapture.takeScreenshot(
          url,
          capturePreset,
          captureFullPage,
          actionSequences
        );
        if (this.isPaused) {
          this._processingQueue = false;
          break;
        }
        const timestamp = URLProcessor.getTimestamp();
        const baseFileName = URLProcessor.generateFilename(url, index, "");
        const fullPageSuffix = captureFullPage ? "_FullPage" : "";
        const fileName = baseFileName.replace(
          ".png",
          `${fullPageSuffix}_${timestamp}.png`
        );
        result.fileName = fileName;
        UI.thumbnails.addLiveThumbnail(result, fileName, url);
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
        const fileName = baseFileName.replace(
          ".png",
          `${fullPageSuffix}_Error_${timestamp}.png`
        );
        const errorResult = {
          error: true,
          errorMessage: error.message || "Unknown error",
          sequenceName: url,
          url: error.url || url,
        };
        UI.thumbnails.addLiveThumbnail(errorResult, fileName, url);
        AppState.addFailedUrl(url);
        const displayError =
          error instanceof ScreenshotError
            ? `(${error.reason || error.message})`
            : `(${error.message || "Unknown"})`;
        UI.utils.showStatus(`✗ Failed: ${url} ${displayError}`, true);
      }
      this.currentCaptureIndex++;
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
      console.log("Queue processing finished normally.");
      const failedCount = AppState.failedUrls.length;
      const successCount = totalUrls - failedCount;
      const completionMessage = `Capture complete11. Processed ${totalUrls} pages (${successCount} success, ${failedCount} failed).`;
      UI.utils.showStatus(completionMessage, failedCount > 0, 0);
      this._processingQueue = false;
    } else if (this.isPaused) {
      console.log("Queue processing paused.");
      UI.utils.showStatus(
        `Capture paused at URL ${
          this.currentCaptureIndex + 1
        } of ${totalUrls}. Click Resume (▶️) to continue.`,
        false,
        0
      );
    } else {
      console.warn("Queue loop finished unexpectedly.");
      this._processingQueue = false;
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
    if (this.isPaused) {
      console.log("Pause requested.");
      this.updatePauseResumeButton();
    } else {
      console.log("Resume requested.");
      UI.utils.showStatus("", false, 1);
      this.updatePauseResumeButton();
      if (
        this.currentCaptureIndex < this.captureQueue.length &&
        !this._processingQueue
      ) {
        UI.utils.showStatus(
          `Capture resuming from URL ${this.currentCaptureIndex + 1} of ${
            this.captureQueue.length
          }`,
          false,
          3000
        );
        this.processCaptureQueue();
      } else if (this._processingQueue) {
        console.warn("Resume clicked, but processing seems active.");
      } else {
        console.log("Resume clicked, but capture queue is finished.");
        this._checkCaptureButtonState();
        this.updatePauseResumeButton();
      }
    }
  }

  updatePauseResumeButton() {
    const pauseResumeBtn = document.getElementById("pauseResumeBtn");
    if (!pauseResumeBtn) return;
    const hasItemsToProcess =
      this.currentCaptureIndex < this.captureQueue.length;
    const isProcessing = this._processingQueue;
    if (this.isPaused) {
      pauseResumeBtn.innerHTML = "▶️";
      pauseResumeBtn.title = "Resume capture";
      pauseResumeBtn.classList.add("paused");
      pauseResumeBtn.disabled = !hasItemsToProcess;
    } else {
      pauseResumeBtn.innerHTML = "⏸️";
      pauseResumeBtn.title = "Pause capture";
      pauseResumeBtn.classList.remove("paused");
      pauseResumeBtn.disabled = !isProcessing || !hasItemsToProcess;
    }
  }

  _toggleCaptureSettings() {
    const content = document.getElementById("captureSettingsContent");
    const wrapper = document.getElementById("captureSettingsToggle");

    if (!content || !wrapper) {
      console.warn("Could not toggle settings: Content or wrapper not found.");
      return;
    }

    const isCollapsed = content.classList.toggle("collapsed");
    wrapper.classList.toggle("collapsed", isCollapsed);

    console.log(`Settings toggled. Collapsed: ${isCollapsed}`);
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
