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
    this._handleLoadManualSource = this._handleLoadManualSource.bind(this);
    this._handleFileUpload = this._handleFileUpload.bind(this);
  }

  initialize() {
    const baseUrlInput = document.getElementById("baseUrlInput");
    if (baseUrlInput) {
      baseUrlInput.value = ""; // Explicitly set to empty
    }

    this._setupEventListeners();
    this._initializeUI();
    this._setupEventHandlers();

    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");

    this.loginHandler.initialize();

    const baseUrlSection = document.getElementById("baseUrlSection");
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
    this._handleBaseUrlInput({ target: baseUrlInput });
    this._setCaptureUIsDisabled(false); // Ensure UIs are enabled on init

    console.log("Application initialized.");
  }

  // NEW Helper method to disable/enable form inputs during capture
  _setCaptureUIsDisabled(disabled) {
    const baseUrlInput = document.getElementById("baseUrlInput");
    const capturePresetSelect = UI.elements.capturePreset;
    const fullPageCheckbox = document.getElementById("fullPageCheckbox");
    const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
    const pageSourceRadios = document.querySelectorAll(
      'input[name="pageSourceOption"]'
    );
    const manualJsonTextArea = document.getElementById("manualJsonText");
    const manualJsonFileInput = document.getElementById("manualJsonFile");
    const loadManualJsonBtn = document.getElementById("loadManualJsonBtn");

    // URL Selector specific elements (if initialized)
    const urlSearchInput = document.getElementById("urlSearch");
    const toggleSelectionBtn = document.getElementById("toggleSelectionBtn");

    if (baseUrlInput) baseUrlInput.disabled = disabled;

    // Screenshot Capture Settings
    if (capturePresetSelect) capturePresetSelect.disabled = disabled;
    if (fullPageCheckbox) fullPageCheckbox.disabled = disabled;
    if (simpleWaitTimeInput) simpleWaitTimeInput.disabled = disabled;

    // Page Source and Manual JSON Area
    pageSourceRadios.forEach((radio) => (radio.disabled = disabled));
    if (manualJsonTextArea) manualJsonTextArea.disabled = disabled;
    if (manualJsonFileInput) manualJsonFileInput.disabled = disabled;
    if (loadManualJsonBtn) loadManualJsonBtn.disabled = disabled;

    // URL Selector controls
    if (urlSearchInput) urlSearchInput.disabled = disabled;
    if (toggleSelectionBtn) toggleSelectionBtn.disabled = disabled;

    // Disable category checkboxes and URL item checkboxes within the URL selector
    if (urlSelector && urlSelector.categoriesContainer) {
      urlSelector.categoriesContainer
        .querySelectorAll(".category-checkbox, .url-checkbox")
        .forEach((cb) => (cb.disabled = disabled));
    }
    // Also disable toggling of the "Pages" section header
    const captureSettingsToggle = document.getElementById(
      "captureSettingsToggle"
    );
    if (captureSettingsToggle) {
      if (disabled) {
        captureSettingsToggle.style.pointerEvents = "none";
        captureSettingsToggle.style.opacity = "0.7";
      } else {
        captureSettingsToggle.style.pointerEvents = "";
        captureSettingsToggle.style.opacity = "1";
      }
    }
    // Disable login option radios
    const loginOptionRadios = document.querySelectorAll(
      'input[name="loginOption"]'
    );
    loginOptionRadios.forEach((radio) => (radio.disabled = disabled));

    console.log(`Capture UIs ${disabled ? "Disabled" : "Enabled"}`);
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
    const loginRadios = document.querySelectorAll('input[name="loginOption"]');
    loginRadios.forEach((radio) => {
      radio.checked = false;
    });
    if (this.loginHandler) {
      this.loginHandler.isLoggedIn = false;
      this.loginHandler.loggedInUsername = null;
      this.loginHandler.selectedLoginOption = "login";
      this.loginHandler.stopSessionPolling();
      this.loginHandler.hideLoginFrame();
      if (typeof this.loginHandler.updateLoginStatus === "function") {
        this.loginHandler.updateLoginStatus("logged-out", "Not authenticated");
      }
    }
    if (urlSelector.cleanup) urlSelector.cleanup();

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
      if (urlFetcher) urlFetcher.projectName = "";
      this._disableLoginOptions();
      this._checkCaptureButtonState();
      return;
    }

    const success = urlFetcher.setBaseClientUrl(url);
    if (success) {
      this.baseUrl = urlFetcher.baseClientUrl;
      this.baseUrlValid = true;
      statusElement.textContent = "";
      statusElement.style.color = "green";
      loginOptionSection.style.display = "block";
      this._enableLoginOptions();
    } else {
      this.baseUrlValid = false;
      this.baseUrl = url;
      statusElement.textContent =
        "Could not extract project name. Check format.";
      statusElement.style.color = "red";
      if (urlFetcher) urlFetcher.projectName = "";
      this._disableLoginOptions();
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
    if (UI.elements.waitTime && UI.elements.waitTime.id === "simpleWaitTime") {
      UI.elements.waitTime.value = config.ui.defaultWaitTime || 5;
      const hiddenWaitTime = document.getElementById("hiddenWaitTime");
      if (hiddenWaitTime) hiddenWaitTime.value = UI.elements.waitTime.value;
    } else if (UI.elements.waitTime) {
      UI.elements.waitTime.value = config.ui.defaultWaitTime || 5;
    }
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
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
    }
    if (
      !UI.elements.waitTime ||
      (UI.elements.waitTime.id !== "simpleWaitTime" &&
        this.currentMode === "simple")
    ) {
      const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
      UI.elements.waitTime = simpleWaitTimeInput || hiddenWaitTime;
    } else if (!UI.elements.waitTime) {
      UI.elements.waitTime = hiddenWaitTime;
    }
  }

  _disableLoginOptions() {
    const radios = document.querySelectorAll('input[name="loginOption"]');
    radios.forEach((radio) => {
      radio.disabled = true;
      radio.checked = false;
    });
  }

  _enableLoginOptions() {
    const radios = document.querySelectorAll('input[name="loginOption"]');
    radios.forEach((radio) => (radio.disabled = false));
  }

  generatePrefilledUrl() {
    if (!config.prefill.enabled) return config.prefill.fallbackUrl;
    return config.prefill.fallbackUrl;
  }

  _updateUIMode() {
    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");
    const advancedOptions = UI.elements.advancedOptions;
    if (advancedOptions) advancedOptions.style.display = "none";
    this._setupSimpleModeSettings();
    setTimeout(async () => {
      if (typeof urlSelector.initialize === "function") {
        try {
          await urlSelector.initialize();
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
      this._checkCaptureButtonState();
    }, 0);
    UI.utils.resetUI();
  }

  _setupSimpleModeSettings() {
    const parentElement = UI.elements.captureSettingsContent;
    const urlInputContainer = UI.elements.urlInputContainer;
    if (!parentElement || !urlInputContainer) {
      console.error(
        "Cannot setup simple settings: Parent or URL input container not found."
      );
      return;
    }
    const screenSizeRow = parentElement.querySelector(
      ".screen-size-row.important-setting-group"
    );
    if (!screenSizeRow) {
      console.error(
        "Critical UI Error: .screen-size-row.important-setting-group not found within captureSettingsContent."
      );
      return;
    }
    screenSizeRow.style.display = "flex";
    let waitTimeContainer = document.getElementById("simpleWaitTimeContainer");
    let simpleWaitTimeInput = document.getElementById("simpleWaitTime");
    if (!waitTimeContainer) {
      waitTimeContainer = document.createElement("div");
      waitTimeContainer.id = "simpleWaitTimeContainer";
      waitTimeContainer.className = "setting-container important-setting-group";
      const waitTimeLabel = document.createElement("label");
      waitTimeLabel.textContent = "Wait Time (sec)";
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
        const hidden = document.getElementById("hiddenWaitTime");
        if (hidden) hidden.value = event.target.value;
      });
      screenSizeRow.insertAdjacentElement("afterend", waitTimeContainer);
    } else {
      waitTimeContainer.style.display = "flex";
      if (!waitTimeContainer.classList.contains("important-setting-group")) {
        waitTimeContainer.classList.add("important-setting-group");
      }
    }
    if (simpleWaitTimeInput && UI.elements.waitTime !== simpleWaitTimeInput) {
      UI.elements.waitTime = simpleWaitTimeInput;
      const hiddenWaitTime = document.getElementById("hiddenWaitTime");
      if (hiddenWaitTime && simpleWaitTimeInput.value) {
        hiddenWaitTime.value = simpleWaitTimeInput.value;
      }
    }
  }

  _handleActionsInput() {
    console.log("Actions input changed (No direct action in simple mode UI)");
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
    if (manualJsonStatus) manualJsonStatus.textContent = "";

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
      if (urlSelectorContainer) urlSelectorContainer.style.display = "";
      else if (
        typeof urlSelector.initialize === "function" &&
        !document.getElementById("urlSelectorContainer")
      ) {
        console.warn(
          "URL Selector container not ready for 'automatic' source change handling yet."
        );
      }
      if (urlSelector.clearRenderedUrls) urlSelector.clearRenderedUrls();
      if (jsonTextArea) jsonTextArea.value = "";
      if (fileInput) fileInput.value = "";
      if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";
      if (this.baseUrlValid && this.loginHandler.isAuthenticatedForCapture()) {
        this._initiateUrlFetching();
      } else {
        if (
          urlSelector.container &&
          typeof urlSelector.showLoadingState === "function"
        ) {
          urlSelector.showLoadingState(
            "Waiting for Base URL & Authentication..."
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
      console.error(
        "Cannot load manual source: Crucial UI elements missing (textarea, status, load button)."
      );
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
      if (jsonTextArea) loadManualBtn.disabled = !jsonTextArea.value.trim();
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
      if (data.result.detectedMountIssue) {
        UI.utils.showStatus(
          `⚠️ Captured with mount issue: ${url
            .split("/")
            .pop()} (${sizeDesc}) (${timeTaken}s)`,
          false,
          7000
        );
      } else {
        UI.utils.showStatus(
          `✓ Captured: ${url.split("/").pop()} (${sizeDesc}) (${timeTaken}s)`,
          false,
          5000
        );
      }
    });
    events.on("URL_SELECTION_CHANGED", (data) =>
      this._checkCaptureButtonState()
    );
    events.on("LOGIN_OPTION_SELECTED", (data) => {
      if (!this.baseUrlValid) return;
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
    if (!this.baseUrlValid || !this.loginHandler.isAuthenticatedForCapture()) {
      if (
        urlSelector.container &&
        typeof urlSelector.showLoadingState === "function"
      )
        urlSelector.showLoadingState(
          "Waiting for Base URL & Authentication..."
        );
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
    urlSelector.showLoadingState();
    try {
      await urlFetcher.loadUrls();
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
        urlSelector.categoriesContainer.innerHTML = `<div class="url-selector-error"><p>${displayError}</p><p>Check server connection or Project URL. Ensure the backend service is running.</p></div>`;
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
      UI.utils.showStatus("Please provide a valid Base URL.", true);
      if (progressOutput) progressOutput.style.display = "none";
      return;
    }

    this._setCaptureUIsDisabled(true); // Disable UIs at the start

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
      this._processingQueue = false; // Ensure this is reset on setup error
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
        this._setCaptureUIsDisabled(false); // Re-enable UIs if not paused and finished
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
        // If paused, UIs remain disabled until resumed and completed
        if (this.startTotalTime > 0)
          UI.progress.updateStats(
            this.captureQueue.length,
            AppState.screenshots.size,
            AppState.failedUrls.length,
            totalTimeTakenSec
          );
      }
      this._checkCaptureButtonState(); // This will re-enable captureBtn if conditions met
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
    if (this.isPaused || this.currentCaptureIndex >= this.captureQueue.length) {
      if (this.isPaused) {
        this._processingQueue = false; // Mark as not processing if paused
        this._setCaptureUIsDisabled(false); // Re-enable UIs if paused and user might want to change settings before resuming (though pause button will be primary action)
        // Or keep them disabled: this._setCaptureUIsDisabled(true);
      }
      if (
        !this.isPaused &&
        this.currentCaptureIndex >= this.captureQueue.length
      ) {
        const captureWarningMessage = document.getElementById(
          "captureWarningMessage"
        );
        if (captureWarningMessage) captureWarningMessage.style.display = "none";
        this._setCaptureUIsDisabled(false); // Re-enable UIs when queue is fully done
      }
      return;
    }
    const captureWarningMessage = document.getElementById(
      "captureWarningMessage"
    );
    if (!this._processingQueue) {
      this._processingQueue = true;
      this._setCaptureUIsDisabled(true); // Ensure UIs are disabled when processing starts/resumes
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
          /* UI disable state handled by pauseResumeCapture */ break;
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
          /* UI disable state handled by pauseResumeCapture */ break;
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
      if (this.currentCaptureIndex < totalUrls && !this.isPaused)
        await new Promise((resolve) => setTimeout(resolve, 250));
      if (this.isPaused) {
        this._processingQueue = false;
        /* UI disable state handled by pauseResumeCapture */ break;
      }
    }
    const isFinished = this.currentCaptureIndex >= totalUrls;
    if (isFinished && !this.isPaused) {
      this._processingQueue = false;
      this._setCaptureUIsDisabled(false); // Re-enable UIs when queue is fully done
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
      // UIs remain disabled while paused, handled by pauseResumeCapture or initial call to captureScreenshots
    } else {
      // Should ideally not happen if logic is correct
      this._processingQueue = false;
      this._setCaptureUIsDisabled(false); // Fallback to enable
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
      if (captureWarningMessage) captureWarningMessage.style.display = "block";
      // When pausing, critical UIs should remain disabled.
      // _setCaptureUIsDisabled(true) is implicitly handled as it's not re-enabled here.
      // The "Pause" button itself will become "Resume" and stay enabled if queue not empty.
    } else {
      // Resuming
      console.log("Resume requested.");
      this._setCaptureUIsDisabled(true); // Explicitly ensure UI is disabled upon resuming
      if (UI.elements.progress) UI.utils.showStatus("", false, 1);
      if (captureWarningMessage) captureWarningMessage.style.display = "block";
      if (
        this.currentCaptureIndex < this.captureQueue.length &&
        !this._processingQueue
      ) {
        this.processCaptureQueue();
      } else if (this._processingQueue) {
        console.warn(
          "Resume clicked, but processing logic indicates it's already active or should be."
        );
      } else {
        if (captureWarningMessage) captureWarningMessage.style.display = "none";
        this._setCaptureUIsDisabled(false); // Re-enable if resuming but queue was already finished
      }
    }
    this.updatePauseResumeButton();
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
      pauseResumeBtn.disabled = !hasItemsToProcess; // Enable if there are items left
    } else {
      // Not paused (either running or stopped)
      pauseResumeBtn.innerHTML = "⏸️";
      pauseResumeBtn.title = "Pause capture";
      pauseResumeBtn.classList.remove("paused");
      // Disable Pause button if not processing OR if no items are left to process
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
    // Only allow toggling if not processing
    if (this._processingQueue) {
      console.log("Cannot toggle settings: Capture in progress.");
      return;
    }
    const isCollapsed = content.classList.toggle("collapsed");
    wrapper.classList.toggle("collapsed", isCollapsed);
    console.log(`Capture settings toggled. Collapsed: ${isCollapsed}`);
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
