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
    this._setupEventHandlers(); // Ensure this is called to register AUTO_LOGOUT_DETECTED

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
    this._handleBaseUrlInput({ target: baseUrlInput }); // Trigger initial check
    this._setCaptureUIsDisabled(false); // Ensure UIs are enabled on init

    console.log("Application initialized.");
  }

  // Helper method to disable/enable form inputs during capture
  _setCaptureUIsDisabled(disabled) {
    const baseUrlInput = document.getElementById("baseUrlInput");
    const capturePresetSelect = UI.elements.capturePreset;
    const fullPageCheckbox = document.getElementById("fullPageCheckbox");
    const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
    const loginOptionRadios = document.querySelectorAll(
      'input[name="loginOption"]'
    );

    if (baseUrlInput) baseUrlInput.disabled = disabled;

    // Screenshot Capture Settings
    if (capturePresetSelect) capturePresetSelect.disabled = disabled;
    if (fullPageCheckbox) fullPageCheckbox.disabled = disabled;
    if (simpleWaitTimeInput) simpleWaitTimeInput.disabled = disabled;

    // Disable login option radios
    loginOptionRadios.forEach((radio) => (radio.disabled = disabled));

    // Pages section elements (source selection, manual input, URL selector) are intentionally NOT disabled here
    // to allow users to prepare the next batch or change settings even if a capture is paused or just finished.
    // They are primarily gated by the main Capture button's state.

    console.log(
      `Critical Capture UIs (URL, Settings, Login Options) ${
        disabled ? "Disabled" : "Enabled"
      }. Pages section remains editable.`
    );
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

    // Reset downstream UI elements and states
    statusElement.textContent = "";
    statusElement.style.color = "";
    loginOptionSection.style.display = "none";
    loginSection.style.display = "none";
    captureForm.style.display = "none";
    progressOutput.style.display = "none";
    pageSourceSelection.style.display = "none";

    // Reset login options
    const loginRadios = document.querySelectorAll('input[name="loginOption"]');
    loginRadios.forEach((radio) => {
      radio.checked = false;
    });

    // Reset login handler state
    if (this.loginHandler) {
      this.loginHandler.isLoggedIn = false;
      this.loginHandler.loggedInUsername = null;
      // this.loginHandler.selectedLoginOption = 'login'; // Let it retain its default or last explicit state
      this.loginHandler.stopSessionPolling();
      this.loginHandler.stopSessionMonitor();
      this.loginHandler.hideLoginFrame();
      if (typeof this.loginHandler.updateLoginStatus === "function") {
        this.loginHandler.updateLoginStatus("logged-out", "Not authenticated");
      }
    }

    // Reset URL selector
    if (urlSelector.cleanup) urlSelector.cleanup();

    if (!url || !url.includes("/client/")) {
      this.baseUrlValid = false;
      this.baseUrl = url; // Store the potentially invalid URL
      if (url && !url.includes("/client/")) {
        statusElement.textContent =
          "Invalid format. Expected .../client/PROJECT_NAME";
        statusElement.style.color = "red";
      } else if (!url) {
        statusElement.textContent = ""; // Clear message if field is empty
      }
      if (urlFetcher) urlFetcher.projectName = ""; // Clear project name in fetcher
      this._disableLoginOptions();
      this._checkCaptureButtonState(); // Update capture button (should be disabled)
      return;
    }

    // Attempt to set the base client URL in the fetcher
    const success = urlFetcher.setBaseClientUrl(url);
    if (success) {
      this.baseUrl = urlFetcher.baseClientUrl; // Store validated URL
      this.baseUrlValid = true;
      statusElement.textContent = ""; // Valid, so clear status message
      // statusElement.style.color = "green"; // Or show a success check, then fade
      loginOptionSection.style.display = "block"; // Show login options
      this._enableLoginOptions();
    } else {
      this.baseUrlValid = false;
      this.baseUrl = url; // Store the invalid URL
      statusElement.textContent =
        "Could not extract project name. Check format.";
      statusElement.style.color = "red";
      if (urlFetcher) urlFetcher.projectName = "";
      this._disableLoginOptions();
    }
    this._checkCaptureButtonState(); // Update capture button state
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

    // Initialize simpleWaitTime and hiddenWaitTime
    const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
    const hiddenWaitTimeInput = document.getElementById("hiddenWaitTime");
    const defaultWait = String(config.ui.defaultWaitTime || 5);

    if (simpleWaitTimeInput) simpleWaitTimeInput.value = defaultWait;
    if (hiddenWaitTimeInput) hiddenWaitTimeInput.value = defaultWait;

    // Ensure UI.elements.waitTime points to the correct input based on mode (though mode handling is simplified)
    UI.elements.waitTime = simpleWaitTimeInput || hiddenWaitTimeInput;

    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
    this.createPauseResumeButton();

    // Set initial state for "Pages" (Capture Settings) section - expanded by default
    this._setCaptureSettingsCollapsed(false);

    // Manual JSON input area hidden by default
    const manualArea = document.getElementById("manualJsonInputArea");
    if (manualArea) manualArea.style.display = "none";

    // Page source selection (Auto/Manual) also hidden until login options are chosen
    const pageSourceSelection = document.getElementById("pageSourceSelection");
    if (pageSourceSelection) pageSourceSelection.style.display = "none";
  }

  _ensureHiddenWaitTimeStorage() {
    let hiddenWaitTime = document.getElementById("hiddenWaitTime");
    if (!hiddenWaitTime) {
      hiddenWaitTime = document.createElement("input");
      hiddenWaitTime.type = "hidden";
      hiddenWaitTime.id = "hiddenWaitTime";
      hiddenWaitTime.value = String(config.ui.defaultWaitTime || 5); // Ensure it's a string
      document.body.appendChild(hiddenWaitTime);
    }
    // This logic might be simplified if simpleWaitTime is always the primary source in simple mode
    if (!UI.elements.waitTime) {
      const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
      UI.elements.waitTime = simpleWaitTimeInput || hiddenWaitTime;
    }
  }

  _disableLoginOptions() {
    const radios = document.querySelectorAll('input[name="loginOption"]');
    radios.forEach((radio) => {
      radio.disabled = true;
      radio.checked = false; // Uncheck them
    });
  }

  _enableLoginOptions() {
    const radios = document.querySelectorAll('input[name="loginOption"]');
    radios.forEach((radio) => (radio.disabled = false));
  }

  generatePrefilledUrl() {
    // This function might be deprecated or needs rework if prefill logic changes
    // For now, it's not actively used in the primary flow from what's shown.
    if (!config.prefill.enabled) return config.prefill.fallbackUrl;
    // const currentUrl = window.location.href;
    // const match = currentUrl.match(config.prefill.sourcePattern);
    // if (match) {
    //   return config.prefill.targetTemplate
    //     .replace("$1", match[1] || "s") // Ensure 's' for https if $1 is empty
    //     .replace("$2", match[2])
    //     .replace("$3", match[3]);
    // }
    return config.prefill.fallbackUrl;
  }

  _updateUIMode() {
    // Simplified: always in "simple mode" visually based on current HTML.
    // Advanced options are managed by ContextMenuActionsHelper and its own UI elements.
    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode"); // Ensure advanced specific body classes are removed

    // Hide elements that were specific to the old "advanced mode" managed by app.js
    const advancedOptionsEl = document.getElementById("advancedOptions"); // This might be a legacy ID
    if (advancedOptionsEl) advancedOptionsEl.style.display = "none";

    const actionsFieldTextarea = UI.elements.actionsField; // This is the JSON textarea for context actions
    if (actionsFieldTextarea && actionsFieldTextarea.id === "actionsField") {
      // Its visibility is now controlled by the context-menu-helper UI.
      // However, if it was part of the old advanced mode toggle, ensure it's not wrongly shown here.
    }

    // Call _setupSimpleModeSettings to ensure correct elements are referenced for wait time etc.
    this._setupSimpleModeSettings();

    // Initialize or update URL selector if applicable
    setTimeout(async () => {
      if (typeof urlSelector.initialize === "function") {
        try {
          await urlSelector.initialize();
          // If the capture form (which contains page source selection) is visible,
          // trigger _handleSourceChange to potentially load URLs for "automatic" source.
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
      this._checkCaptureButtonState(); // Update capture button state after mode change
    }, 0); // Small delay to ensure DOM is ready

    UI.utils.resetUI(); // Reset thumbnails, progress etc.
  }

  _setupSimpleModeSettings() {
    // This method ensures that UI.elements.waitTime points to the correct input
    // for the simple mode. The actual HTML structure for these settings is now in index.html.
    const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
    const hiddenWaitTimeInput = document.getElementById("hiddenWaitTime"); // Fallback or storage

    if (simpleWaitTimeInput) {
      UI.elements.waitTime = simpleWaitTimeInput;
      if (hiddenWaitTimeInput && simpleWaitTimeInput.value) {
        hiddenWaitTimeInput.value = simpleWaitTimeInput.value; // Sync if needed
      }
    } else if (hiddenWaitTimeInput) {
      UI.elements.waitTime = hiddenWaitTimeInput; // Fallback if simple input not found
    } else {
      console.error(
        "Critical UI Error: No wait time input found for simple mode settings."
      );
    }
  }

  _handleActionsInput() {
    // This was for the advanced mode's action textarea.
    // In the current "simple mode" structure, this is less relevant unless
    // ContextMenuActionsHelper uses this field directly (which it does).
    // We can keep the log for now.
    console.log("Actions input changed (managed by ContextMenuActionsHelper).");
    // Potentially, if actionsField has content, enable/disable parts of ContextMenuActionsHelper UI or main capture button.
    // For now, ContextMenuActionsHelper is self-contained.
  }

  _handleSourceChange() {
    const selectedSource = document.querySelector(
      'input[name="pageSourceOption"]:checked'
    )?.value;
    const manualArea = document.getElementById("manualJsonInputArea");
    const urlSelectorContainer = document.getElementById(
      "urlSelectorContainer"
    ); // Re-fetch in case it was created by urlSelector.initialize
    const manualJsonStatus = document.getElementById("manualJsonStatus");
    const jsonTextArea = document.getElementById("manualJsonText");
    const fileInput = document.getElementById("manualJsonFile");
    const fileNameDisplay = document.getElementById("fileNameDisplay");

    if (!manualArea) {
      console.error("Manual JSON input area not found during source change.");
      return;
    }
    if (manualJsonStatus) manualJsonStatus.textContent = ""; // Clear previous status

    if (selectedSource === "manual") {
      manualArea.style.display = ""; // Show manual input options
      if (urlSelectorContainer) urlSelectorContainer.style.display = "none"; // Hide URL selector
      if (urlSelector.clearRenderedUrls) urlSelector.clearRenderedUrls(); // Clear any auto-loaded URLs

      // Reset fetcher state if switching to manual, as it's a different source
      if (urlFetcher) {
        urlFetcher.dataLoadedDirectly = false; // Will be true once manual data is loaded
        urlFetcher.urlsList = [];
        urlFetcher.categorizedUrls = {};
      }
      // Reset capture queue and UI related to previous captures
      this.captureQueue = [];
      AppState.reset();
      UI.utils.resetUI(); // Clears thumbnails, progress
      if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true; // Disable capture until manual URLs are loaded & selected
    } else {
      // 'automatic'
      manualArea.style.display = "none"; // Hide manual input options
      if (urlSelectorContainer) {
        urlSelectorContainer.style.display = ""; // Show URL selector
      } else if (
        typeof urlSelector.initialize === "function" &&
        !document.getElementById("urlSelectorContainer")
      ) {
        // This case should ideally be handled by prior initialization,
        // but as a fallback, log it. urlSelector.initialize is async.
        console.warn(
          "URL Selector container not ready for 'automatic' source change handling yet. Attempting init then fetch."
        );
      }

      // Clear manual input fields
      if (urlSelector.clearRenderedUrls) urlSelector.clearRenderedUrls(); // Also clear selector if it had manual data
      if (jsonTextArea) jsonTextArea.value = "";
      if (fileInput) fileInput.value = ""; // Reset file input
      if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen";

      // If base URL is valid and user is authenticated (or guest), fetch URLs
      if (this.baseUrlValid && this.loginHandler.isAuthenticatedForCapture()) {
        this._initiateUrlFetching();
      } else {
        // Show a waiting message in the URL selector area
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
    if (fileNameDisplay) fileNameDisplay.textContent = "No file chosen"; // Reset

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
      fileInput.value = ""; // Clear the invalid file
      return;
    }

    if (fileNameDisplay) fileNameDisplay.textContent = file.name;

    try {
      const fileContent = await this._readFileContent(file);
      if (jsonTextArea) {
        jsonTextArea.value = fileContent; // Populate textarea with file content
        console.log(`File "${file.name}" content loaded into textarea.`);
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
    this._checkCaptureButtonState(); // Update button states after file interaction
  }

  async _handleLoadManualSource() {
    const jsonTextArea = document.getElementById("manualJsonText");
    const manualJsonStatus = document.getElementById("manualJsonStatus");
    const urlSelectorContainer = document.getElementById(
      "urlSelectorContainer"
    );
    const loadBtn = document.getElementById("loadManualJsonBtn");
    const fileInput = document.getElementById("manualJsonFile"); // Get file input
    const fileNameDisplay = document.getElementById("fileNameDisplay"); // Get file name display

    if (!jsonTextArea || !manualJsonStatus || !loadBtn) {
      console.error(
        "Cannot load manual source: Crucial UI elements missing (textarea, status, load button)."
      );
      return;
    }

    manualJsonStatus.textContent = ""; // Clear previous status
    manualJsonStatus.style.color = "";
    loadBtn.disabled = true;
    loadBtn.textContent = "Loading...";
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;

    const sourceContent = jsonTextArea.value.trim();
    // Determine source description (file or textarea)
    const sourceDescription = fileInput?.files?.[0]?.name
      ? `file "${fileInput.files[0].name}"`
      : "textarea content";

    // Clear file input after attempting to load (whether from file or textarea)
    // This ensures that if user pastes, then uploads, then pastes again, the "Load" isn't stuck on file.
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
      manualJsonStatus.style.color = "orange"; // Neutral/processing color

      await urlFetcher.setDataDirectly(sourceContent); // This now handles parsing and _processData

      if (urlFetcher.dataLoadedDirectly) {
        // Check if data was successfully processed
        if (urlSelector.container) {
          // Ensure selector's main container is available
          urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
          if (urlSelectorContainer) urlSelectorContainer.style.display = ""; // Show selector
        } else if (typeof urlSelector.initialize === "function") {
          console.warn(
            "URL Selector was not initialized, attempting now for manual load."
          );
          await urlSelector.initialize(); // Initialize if not already
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
        // Error during _processData or setDataDirectly (e.g., invalid format)
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
      // Catch errors from setDataDirectly (e.g., JSON parse error)
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
    const buttonContainer = UI.elements.buttonContainer; // The main div holding capture + pause/resume
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

    // Enable/disable "Load Pages" button for manual source
    if (loadManualBtn && selectedSource === "manual") {
      const jsonTextArea = document.getElementById("manualJsonText");
      // Enable if textarea has content OR a file was selected (though file content isn't directly checked here, textarea is populated from file)
      loadManualBtn.disabled = !(jsonTextArea && jsonTextArea.value.trim());
    } else if (loadManualBtn) {
      loadManualBtn.disabled = true; // Disable if not in manual mode
    }

    // Determine if ready to capture
    const prerequisitesMet =
      !this._processingQueue && // Not already processing
      this.baseUrlValid &&
      this.loginHandler.isAuthenticatedForCapture();

    let urlsAvailableAndSelected = false;
    if (selectedSource === "automatic") {
      urlsAvailableAndSelected =
        urlFetcher.urlsList.length > 0 && urlSelector.selectedUrls.size > 0;
    } else if (selectedSource === "manual") {
      // For manual, check if data was loaded directly AND some URLs are selected in the selector
      urlsAvailableAndSelected =
        urlFetcher.dataLoadedDirectly && urlSelector.selectedUrls.size > 0;
    }

    const isReadyToCapture = prerequisitesMet && urlsAvailableAndSelected;
    captureBtn.disabled = !isReadyToCapture;

    // Show/hide the main button container (capture + pause/resume)
    // This container should be visible if the capture form itself is visible,
    // indicating the user has passed the Base URL and Login Option stages.
    const captureFormVisible = UI.elements.captureForm.style.display !== "none";
    if (captureFormVisible) {
      buttonContainer.style.display = "flex"; // Use flex for alignment
      buttonContainer.classList.remove("hidden");
    } else {
      buttonContainer.style.display = "none";
      buttonContainer.classList.add("hidden");
    }
  }

  _setupEventHandlers() {
    // Progress updates
    events.on(events.events.CAPTURE_PROGRESS, (data) => {
      if (data && data.message && UI.elements.progress) {
        let messageWithIcon = data.message;
        // Add a default icon if none is present in the message
        if (
          !messageWithIcon.startsWith("✓ ") &&
          !messageWithIcon.startsWith("✗ ") &&
          !messageWithIcon.startsWith("⚠️ ") &&
          !messageWithIcon.startsWith("ℹ️ ") &&
          !messageWithIcon.startsWith("⏳ ")
        ) {
          messageWithIcon = "⏳ " + data.message; // Default to hourglass
        }
        UI.progress.updateProgressMessage(messageWithIcon);
      }
    });

    // Screenshot taken successfully (or with mount issue)
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
      const pageName = url.split("/").pop() || url; // Get last part of URL for brevity

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

    // URL Selection changed from URLSelector
    events.on("URL_SELECTION_CHANGED", (data) =>
      this._checkCaptureButtonState()
    );

    // Login Option selected by user
    events.on("LOGIN_OPTION_SELECTED", (data) => {
      if (!this.baseUrlValid) return; // Base URL must be valid to proceed with login options

      this.loginHandler.handleLoginOptionChange(data.option); // Let handler manage its state and iframe

      const captureForm = UI.elements.captureForm;
      const pageSourceSelection = document.getElementById(
        "pageSourceSelection"
      );

      if (
        data.option === "continueWithoutLogin" ||
        (data.option === "login" && this.loginHandler.isLoggedIn)
      ) {
        // Show capture form and page source if guest or already logged in
        if (captureForm) captureForm.style.display = "";
        if (pageSourceSelection) pageSourceSelection.style.display = "";
        this._updateUIMode(); // This will also call _handleSourceChange if needed
      } else if (data.option === "login" && !this.loginHandler.isLoggedIn) {
        // Hide capture form if login required but not yet logged in
        if (captureForm) captureForm.style.display = "none";
        if (pageSourceSelection) pageSourceSelection.style.display = "none";
      }
      this._checkCaptureButtonState();
    });

    // Login process completed (either success or failure from handler's perspective)
    events.on("LOGIN_COMPLETE", (data) => {
      const captureForm = UI.elements.captureForm;
      const pageSourceSelection = document.getElementById(
        "pageSourceSelection"
      );

      if (data.loggedIn) {
        if (captureForm) captureForm.style.display = "";
        if (pageSourceSelection) pageSourceSelection.style.display = "";
        this._updateUIMode(); // This will also call _handleSourceChange
      } else {
        // If login failed and 'login' option was selected, keep form hidden
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

    // **** ADDED: Event handler for AUTO_LOGOUT_DETECTED ****
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
      ); // Keep message visible

      // Hide main capture form and related UI elements
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

      // If capture settings (Pages section) was open, collapse it
      if (
        captureSettingsContent &&
        !captureSettingsContent.classList.contains("collapsed")
      ) {
        this._setCaptureSettingsCollapsed(true);
      }

      // Disable capture button if not already
      if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;

      // If a capture process was paused, reset its state
      if (this.isPaused) {
        this.isPaused = false; // Reset pause state
        this.updatePauseResumeButton(); // Update button UI
      }
      this._processingQueue = false; // Ensure queue processing is marked as stopped
      this.captureQueue = []; // Clear any pending capture queue
      this.currentCaptureIndex = 0;
      AppState.reset(); // Reset any captured data
      UI.utils.resetUI(); // Clear thumbnails etc.

      // The login handler (handleAutoLogout) should manage showing the login iframe.
      // The app.js ensures the main capture UI is hidden.
      this._checkCaptureButtonState(); // Re-evaluate capture button state based on new login status
    });
  }

  async _initiateUrlFetching() {
    const selectedSource = document.querySelector(
      'input[name="pageSourceOption"]:checked'
    )?.value;
    if (selectedSource !== "automatic") {
      // If not automatic, ensure URL selector is cleared or appropriately reflects no auto data
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
          "Waiting for Base URL & Authentication..."
        );
      }
      return;
    }

    // Ensure URL selector is initialized before trying to use it
    if (
      !urlSelector.container &&
      typeof urlSelector.initialize === "function" &&
      !document.getElementById("urlSelectorContainer")
    ) {
      await urlSelector.initialize(); // Initialize if not already
    }
    if (!urlSelector.container) {
      // Check again after potential initialization
      UI.utils.showStatus(
        "UI Error: URL Selector component failed to initialize.",
        true
      );
      return;
    }

    urlSelector.showLoadingState(); // Show loading message in selector
    try {
      await urlFetcher.loadUrls(); // Attempt to fetch URLs
      if (urlSelector.renderUrlCategories)
        urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
      if (urlSelector.updateSelectionCounter)
        urlSelector.updateSelectionCounter(); // Update count (likely 0 initially)
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
      this._checkCaptureButtonState(); // Update capture button based on fetched URLs and selection
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

    if (!this.loginHandler.isAuthenticatedForCapture()) {
      UI.utils.showStatus("Please authenticate or continue as guest.", true);
      if (progressOutput) progressOutput.style.display = "none"; // Hide progress if not starting
      return;
    }
    if (!this.baseUrlValid) {
      UI.utils.showStatus("Please provide a valid Base URL.", true);
      if (progressOutput) progressOutput.style.display = "none";
      return;
    }

    this._setCaptureUIsDisabled(true); // Disable CRITICAL UIs at the start of capture attempt

    this.startTotalTime = performance.now();
    let urlList = [];
    let errorInCaptureSetup = false; // Flag for errors before queue processing starts

    try {
      AppState.reset();
      UI.utils.resetUI();
      this._setCaptureSettingsCollapsed(true); // Collapse "Pages" section during capture

      const capturePreset =
        UI.elements.capturePreset?.value || config.screenshot.defaultPreset;
      const fullPageCheckbox = document.getElementById("fullPageCheckbox");
      const captureFullPage = fullPageCheckbox
        ? fullPageCheckbox.checked
        : false;

      // Get URLs from the URL selector
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

      UI.progress.updateStats(urlList.length, 0, 0, 0); // Initialize stats
      if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true; // Disable capture button

      // Show warning message
      if (captureWarningMessage) {
        captureWarningMessage.textContent =
          "The browser needs to be active for the screenshot to be captured properly";
        captureWarningMessage.style.display = "block";
      }

      // Populate capture queue
      this.captureQueue = urlList.map((url, index) => ({
        url,
        index,
        capturePreset,
        captureFullPage,
        actionSequences: [], // Actions are not part of simple mode UI driven by app.js
      }));
      this.currentCaptureIndex = 0;
      this.isPaused = false;
      this._processingQueue = true; // Set flag that queue processing is active
      this.updatePauseResumeButton(); // Enable Pause button

      await this.processCaptureQueue(); // Start processing
    } catch (error) {
      errorInCaptureSetup = true; // Mark that setup failed
      handleError(error, { logToConsole: true, showToUser: true });
      this._processingQueue = false; // Ensure this is reset on setup error
      this._setCaptureSettingsCollapsed(false); // Re-open "Pages" section on error

      // If setup failed and no screenshots were even attempted, hide progress output
      if (
        errorInCaptureSetup &&
        AppState.screenshots.size === 0 &&
        AppState.failedUrls.length === 0
      ) {
        if (progressOutput) progressOutput.style.display = "none";
      }
    } finally {
      // This block runs regardless of whether an error occurred in the try block
      const endTime = performance.now();
      const totalTimeTakenMs = this.startTotalTime
        ? endTime - this.startTotalTime
        : 0;
      const totalTimeTakenSec = (totalTimeTakenMs / 1000).toFixed(2);

      const isQueueFullyProcessed =
        this.currentCaptureIndex >= this.captureQueue.length;

      if (captureWarningMessage) captureWarningMessage.style.display = "none"; // Hide warning

      if (!this.isPaused) {
        // If not paused, capture attempt is considered "finished" (fully or partially)
        this._processingQueue = false; // Mark queue processing as done
        this._setCaptureUIsDisabled(false); // Re-enable CRITICAL UIs if not paused and finished

        if (isQueueFullyProcessed && this.startTotalTime > 0) {
          // Queue completed fully
          UI.progress.updateStats(
            this.captureQueue.length,
            AppState.screenshots.size,
            AppState.failedUrls.length,
            totalTimeTakenSec
          );
          if (!errorInCaptureSetup) {
            // If setup itself didn't fail
            const failedCount = AppState.failedUrls.length;
            const successCount = AppState.screenshots.size;
            const totalProcessedOrAttempted = this.captureQueue?.length || 0;
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
          // Queue did not complete fully, but wasn't paused (implies an error stopped it mid-queue)
          // Only update stats and message if some processing happened
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
            // No processing happened, and setup was fine (e.g. 0 URLs selected after all)
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

      this._checkCaptureButtonState(); // Re-evaluate capture button state
      this.updatePauseResumeButton(); // Update pause/resume button state

      // Show/hide "Combine All to PDF" button based on whether any screenshots exist
      const pdfBtnVisible = AppState.screenshots.size > 0;
      const combineAllPdfBtn = document.querySelector(".combine-all-pdf-btn");
      if (combineAllPdfBtn?.parentElement) {
        const pdfContainer =
          combineAllPdfBtn.closest(".combine-all-pdf-container") ||
          combineAllPdfBtn.parentElement;
        pdfContainer.style.display = pdfBtnVisible ? "flex" : "none";
        combineAllPdfBtn.disabled = !pdfBtnVisible;
      }

      // If setup failed before any URLs were even determined, hide progress output.
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
        // UI message for pause is handled in pauseResumeCapture
        this._processingQueue = false; // Mark as not actively processing when paused
      }
      if (
        !this.isPaused &&
        this.currentCaptureIndex >= this.captureQueue.length
      ) {
        // Queue is done and not paused
        if (captureWarningMessage) captureWarningMessage.style.display = "none";
        this._setCaptureUIsDisabled(false); // Re-enable CRITICAL UIs
      }
      return; // Exit if paused or queue is empty/finished
    }

    // Ensure critical UIs are disabled if we are actively processing
    if (!this._processingQueue) {
      // Should be true if called from captureScreenshots
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
    if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true; // Keep capture button disabled

    while (this.currentCaptureIndex < totalUrls && !this.isPaused) {
      const itemIndex = this.currentCaptureIndex; // Capture index for this iteration
      const item = this.captureQueue[itemIndex];

      if (!item || !item.url) {
        console.error(`Invalid item at queue index ${itemIndex}:`, item);
        AppState.addFailedUrl(`Invalid Item @ Queue Index ${itemIndex}`);
        this.currentCaptureIndex++;
        if (UI.elements.progressBar)
          UI.progress.updateProgress(this.currentCaptureIndex, totalUrls);
        continue; // Skip to next item
      }

      const { url, index, capturePreset, captureFullPage, actionSequences } =
        item;
      if (UI.elements.progress)
        UI.progress.updateProgressMessage(
          `⏳ Processing ${itemIndex + 1} of ${totalUrls}: ${url}`
        );
      if (UI.elements.progressBar)
        UI.progress.updateProgress(itemIndex, totalUrls); // Progress before item starts

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
          this._processingQueue = false; // Mark as not processing if paused
          break; // Exit the loop
        }

        // Generate filename (moved from main captureScreenshots to here for per-item)
        const timestamp = URLProcessor.getTimestamp();
        const baseFileName = URLProcessor.generateFilename(url, index, ""); // index might be original index if needed
        const fullPageSuffix = captureFullPage ? "_FullPage" : "";
        const mountIssueSuffix = result.detectedMountIssue
          ? "_MountIssueDetected"
          : "";
        const fileName = baseFileName.replace(
          ".png",
          `${fullPageSuffix}${mountIssueSuffix}_${timestamp}.png`
        );
        result.fileName = fileName; // Add filename to result object

        if (result.detectedMountIssue) {
          console.warn(
            `Screenshot for ${url} captured with detected mount issue: ${result.mountIssueMessage}`
          );
        }
        UI.thumbnails.addLiveThumbnail(result, result.fileName, url); // Pass url as sequenceName for categorization
        AppState.addScreenshot(url, result);
        AppState.removeFailedUrl(url); // Remove from failed list if it was a retry
      } catch (error) {
        if (this.isPaused) {
          // Check if paused during error handling
          this._processingQueue = false;
          break; // Exit loop
        }
        handleError(error, { logToConsole: true, showToUser: false }); // Log error, UI update below

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
          sequenceName: url, // Use URL for sequence name in error case too
          url: error.url || url, // Original URL
          detectedMountIssue: wasMountIssueCatastrophic, // If the error itself was a catastrophic mount issue
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

      this.currentCaptureIndex++; // Increment after processing (success or fail)
      if (UI.elements.progressBar)
        UI.progress.updateProgress(this.currentCaptureIndex, totalUrls); // Update progress after item finishes

      if (this.currentCaptureIndex < totalUrls && !this.isPaused) {
        // If more items and not paused
        await new Promise((resolve) => setTimeout(resolve, 250)); // Brief pause between captures
      }
      if (this.isPaused) {
        // Final check before loop continues
        this._processingQueue = false;
        break;
      }
    } // End while loop

    // After loop finishes (either completed or paused)
    const isFinished = this.currentCaptureIndex >= totalUrls;
    if (isFinished && !this.isPaused) {
      this._processingQueue = false; // Done with queue
      this._setCaptureUIsDisabled(false); // Re-enable CRITICAL UIs
      if (captureWarningMessage) captureWarningMessage.style.display = "none";
    } else if (this.isPaused) {
      // _processingQueue is already set to false if paused inside loop
      if (UI.elements.progress)
        UI.utils.showStatus(
          `⏳ Capture paused at URL ${
            this.currentCaptureIndex + 1
          } of ${totalUrls}. Click Resume (▶️) to continue.`,
          false,
          0
        ); // Persistent message
      if (captureWarningMessage) captureWarningMessage.style.display = "block"; // Keep warning if paused
    } else {
      // Should not be reached if logic is correct, but as a fallback
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
    pauseResumeBtn.className = "btn icon-btn pause-resume-btn"; // General btn, specific icon, and functional class
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
    pauseResumeBtn.disabled = true; // Disabled initially
  }

  pauseResumeCapture() {
    this.isPaused = !this.isPaused;
    const captureWarningMessage = document.getElementById(
      "captureWarningMessage"
    );

    if (this.isPaused) {
      console.log("Pause requested.");
      // Message for pause is handled by processCaptureQueue's finally block or here
      if (UI.elements.progress)
        UI.utils.showStatus(
          `⏳ Capture paused. Click Resume (▶️) to continue.`,
          false,
          0
        );
      if (captureWarningMessage) captureWarningMessage.style.display = "block";
      // Critical UIs remain disabled by _setCaptureUIsDisabled(true) from captureScreenshots/processCaptureQueue start.
      // The user can still interact with the "Pages" section (URL Selector, etc.).
    } else {
      // Resuming
      console.log("Resume requested.");
      this._setCaptureUIsDisabled(true); // Ensure critical UIs are disabled before resuming
      if (UI.elements.progress) UI.utils.showStatus("", false, 1); // Clear pause message
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
        // Only restart queue processing if there are items left and it's not already marked as processing
        this.processCaptureQueue();
      } else if (this._processingQueue) {
        // This case should ideally not happen if isPaused was true.
        console.warn(
          "Resume clicked, but processing logic indicates it's already active."
        );
      } else {
        // Queue is finished or was never started properly
        if (captureWarningMessage) captureWarningMessage.style.display = "none";
        this._setCaptureUIsDisabled(false); // Nothing to resume, re-enable UIs
      }
    }
    this.updatePauseResumeButton();
  }

  updatePauseResumeButton() {
    const pauseResumeBtn = document.getElementById("pauseResumeBtn");
    if (!pauseResumeBtn) return;

    const hasItemsToProcess =
      this.currentCaptureIndex < this.captureQueue.length;
    const isActivelyProcessing = this._processingQueue && !this.isPaused; // True only when running

    if (this.isPaused) {
      pauseResumeBtn.innerHTML = "▶️";
      pauseResumeBtn.title = "Resume capture";
      pauseResumeBtn.classList.add("paused");
      pauseResumeBtn.disabled = !hasItemsToProcess; // Can resume if items are left
    } else {
      // Not paused
      pauseResumeBtn.innerHTML = "⏸️";
      pauseResumeBtn.title = "Pause capture";
      pauseResumeBtn.classList.remove("paused");
      // Can pause if actively processing AND items are left
      pauseResumeBtn.disabled = !isActivelyProcessing || !hasItemsToProcess;
    }
  }

  _toggleCaptureSettings() {
    const content = document.getElementById("captureSettingsContent"); // This is the "Pages" section content
    const wrapper = document.getElementById("captureSettingsToggle"); // This is the "Pages" H2 wrapper

    if (!content || !wrapper) {
      console.warn(
        "Could not toggle 'Pages' settings: Content or wrapper not found."
      );
      return;
    }

    // Allow toggling "Pages" section visibility even if capture is in progress.
    // This does not affect the capture process itself.
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
} // End App Class

export default App;
