// perspective_capture/js/app.js
import config from "./config.js";
import AppState from "./state.js";
import UI from "./ui/index.js";
import URLProcessor from "./url-processor.js";
import * as ScreenshotCapture from "./screenshot/core.js";
import ContextMenuActionsHelper from "./context-menu-actions-helper.js"; // Keep import if needed elsewhere
import * as events from "./events.js";
import {
  handleError,
  ScreenshotError,
  URLProcessingError, // Ensure this is imported
  AppError,
} from "./errors.js";
import urlSelector from "./ui/url-selector.js"; // Import urlSelector
import LoginHandler from "./login-handler.js";
import urlFetcher from "./url-fetcher.js"; // Ensure urlFetcher is imported

class App {
  constructor() {
    this.currentMode = "simple"; // Default to simple mode
    this.captureScreenshots = this.captureScreenshots.bind(this);
    this._handleActionsInput = this._handleActionsInput.bind(this); // Keep for potential future use
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
    this._initiateUrlFetching = this._initiateUrlFetching.bind(this); // Now only called for automatic source
    this._processingQueue = false; // Flag to indicate if queue processing is active
    this.startTotalTime = 0; // For overall timing
    this._toggleCaptureSettings = this._toggleCaptureSettings.bind(this);
    this._handleSourceChange = this._handleSourceChange.bind(this); // Add binding
    this._handleManualLoad = this._handleManualLoad.bind(this);   // Add binding
  }

  initialize() {
    // Generate and set prefilled URL if applicable
    this.prefilledUrl = this.generatePrefilledUrl();
    const baseUrlInput = document.getElementById("baseUrlInput");
    if (baseUrlInput) {
      baseUrlInput.value = this.prefilledUrl || config.prefill.fallbackUrl; // Use fallback if prefill fails
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
    if (!baseUrlSection || !loginOptionSection || !loginSection || !captureForm || !progressOutput || !baseUrlInput) {
        console.error("Initialization Error: One or more critical UI elements not found.");
        // Optionally display an error to the user
        // document.body.innerHTML = "Error: Application UI could not be initialized properly.";
        return;
    }

    // Make base URL section visible
    baseUrlSection.style.display = "";

    // Trigger initial validation based on potentially prefilled value
    if (baseUrlInput.value) {
       this._handleBaseUrlInput({ target: baseUrlInput });
    } else {
         // Explicitly handle empty initial state if needed
         this.baseUrlValid = false;
         this._disableLoginOptions();
         loginOptionSection.style.display = "none";
         loginSection.style.display = "none";
         captureForm.style.display = "none";
         progressOutput.style.display = "none";
    }

    console.log("Application initialized.");
  }

  // Handles Base URL input validation and subsequent UI state changes
  _handleBaseUrlInput(event) {
      const url = event.target.value.trim();
      const statusElement = document.getElementById("baseUrlStatus");
      const loginOptionSection = document.getElementById("loginOptionSection");
      const loginSection = document.getElementById("loginSection");
      const captureForm = UI.elements.captureForm;
      const progressOutput = UI.elements.progressOutput;
      const pageSourceSelection = document.getElementById("pageSourceSelection"); // Get source selector

      // Ensure elements exist
      if (!statusElement || !loginOptionSection || !loginSection || !captureForm || !progressOutput || !pageSourceSelection) {
          console.error("Base URL change handler: Required UI sections not found!");
          return;
      }

      // Clear previous status and hide dependent sections initially
      statusElement.textContent = "";
      statusElement.style.color = "";
      loginOptionSection.style.display = "none";
      loginSection.style.display = "none";
      captureForm.style.display = "none";
      progressOutput.style.display = "none";
      pageSourceSelection.style.display = 'none'; // Hide source selection too initially
      urlSelector.cleanup(); // Clean up old URL selector if URL becomes invalid


      // Basic check for presence of URL and '/client/' segment
      if (!url || !url.includes("/client/")) {
        this.baseUrlValid = false;
        this.baseUrl = url;
        if (url && !url.includes("/client/")) {
          statusElement.textContent = "Invalid format. Expected .../client/PROJECT_NAME";
          statusElement.style.color = "red";
        } else if (!url) {
            statusElement.textContent = ""; // Clear message if input is empty
        }
        urlFetcher.projectName = "";
        this._disableLoginOptions();
        // Ensure capture button is disabled
        this._checkCaptureButtonState();
        return;
      }

      // Attempt to set the base URL and extract project name
      const success = urlFetcher.setBaseClientUrl(url);
      if (success) {
        // URL is valid
        this.baseUrl = urlFetcher.baseClientUrl; // Store validated/cleaned URL
        this.baseUrlValid = true;
        statusElement.textContent = "Base URL looks valid.";
        statusElement.style.color = "green";
        loginOptionSection.style.display = "block"; // Show login options
        this._enableLoginOptions(); // Enable radio buttons
        // Keep capture form hidden until login/source choice is made
        captureForm.style.display = "none";

      } else {
        // URL format might be okay, but project name extraction failed
        this.baseUrlValid = false;
        this.baseUrl = url; // Store the entered URL
        statusElement.textContent = "Could not extract project name. Check format.";
        statusElement.style.color = "red";
        urlFetcher.projectName = "";
        this._disableLoginOptions();
         captureForm.style.display = "none"; // Ensure form stays hidden
         urlSelector.cleanup();
      }
      // Always reset capture button state when base URL changes significantly
       this._checkCaptureButtonState();
  }


  // Sets up primary event listeners, including new ones
  _setupEventListeners() {
    const baseUrlInput = document.getElementById("baseUrlInput");
    if (baseUrlInput) {
      events.addDOMEventListener(baseUrlInput, "input", this._handleBaseUrlInput);
      events.addDOMEventListener(baseUrlInput, "blur", this._handleBaseUrlInput);
    } else { console.error("#baseUrlInput element not found!"); }

    if (UI.elements.captureBtn) {
        events.addDOMEventListener( UI.elements.captureBtn, "click", this.captureScreenshots );
    } else { console.error("#captureBtn element not found!"); }

    const titleToggleWrapper = document.getElementById("captureSettingsToggle");
    if (titleToggleWrapper) {
      events.addDOMEventListener( titleToggleWrapper, "click", this._toggleCaptureSettings );
    } else { console.error("#captureSettingsToggle element not found."); }


    // --- NEW Listeners for Page Source ---
    const sourceRadios = document.querySelectorAll('input[name="pageSourceOption"]');
    sourceRadios.forEach(radio => {
        events.addDOMEventListener(radio, 'change', this._handleSourceChange);
    });

    const loadManualBtn = document.getElementById('loadManualJsonBtn');
    if (loadManualBtn) {
        events.addDOMEventListener(loadManualBtn, 'click', this._handleManualLoad);
    } else { console.error("#loadManualJsonBtn not found!"); }
  }

  // Initializes default UI states and element references
  _initializeUI() {
     // Ensure hidden storage exists for wait time if needed
     this._ensureHiddenWaitTimeStorage();
     if (UI.elements.waitTime) { // This ref might point to hidden or visible input
         UI.elements.waitTime.value = config.ui.defaultWaitTime || 5;
     }

    if (UI.elements.captureBtn) {
      UI.elements.captureBtn.disabled = true;
    }
    this.createPauseResumeButton();
    this._setCaptureSettingsCollapsed(false); // Start expanded

    // Ensure manual JSON area is hidden initially
    const manualArea = document.getElementById('manualJsonInputArea');
    if (manualArea) manualArea.style.display = 'none';

    // Ensure page source selection is hidden initially (shown when login completes)
    const pageSourceSelection = document.getElementById('pageSourceSelection');
    if(pageSourceSelection) pageSourceSelection.style.display = 'none';
  }

  // Helper to ensure hidden wait time storage exists if primary input isn't static
  _ensureHiddenWaitTimeStorage() {
      let hiddenWaitTime = document.getElementById('hiddenWaitTime');
      if (!hiddenWaitTime) {
          hiddenWaitTime = document.createElement('input');
          hiddenWaitTime.type = 'hidden';
          hiddenWaitTime.id = 'hiddenWaitTime';
          hiddenWaitTime.value = config.ui.defaultWaitTime || 5;
          document.body.appendChild(hiddenWaitTime); // Append somewhere safe
          // Only set UI.elements.waitTime if it's not already pointing to the visible input
          if (!UI.elements.waitTime || UI.elements.waitTime.id !== 'simpleWaitTime') {
             UI.elements.waitTime = hiddenWaitTime;
          }
      } else if (!UI.elements.waitTime || UI.elements.waitTime.id !== 'simpleWaitTime') {
          // If hidden exists, ensure UI.elements.waitTime points to it initially
          UI.elements.waitTime = hiddenWaitTime;
      }
  }


  // Helper to disable login radio buttons
   _disableLoginOptions() {
        const radios = document.querySelectorAll('input[name="loginOption"]');
        radios.forEach((radio) => { radio.disabled = true; radio.checked = false; });
        // Hide sections that depend on a valid login choice
        const loginSection = document.getElementById("loginSection");
        const captureForm = UI.elements.captureForm;
        if (loginSection) loginSection.style.display = 'none';
        if (captureForm) captureForm.style.display = 'none';

   }
   // Helper to enable login radio buttons
   _enableLoginOptions() {
        const radios = document.querySelectorAll('input[name="loginOption"]');
        radios.forEach((radio) => (radio.disabled = false));
         // Optionally, select the default ('login') if needed
         // const defaultOption = document.getElementById('optionLogin');
         // if (defaultOption) defaultOption.checked = true;
   }
   // Generates a prefilled Base URL
   generatePrefilledUrl() {
        if (!config.prefill.enabled) { return config.prefill.fallbackUrl; }
        const currentUrl = window.location.href;
        const regex = config.prefill.sourcePattern;
        const match = currentUrl.match(regex);
        if (match && match.length >= 4) {
          try {
            const prefilledUrl = config.prefill.targetTemplate
              .replace("$1", match[1] || "").replace("$2", match[2]).replace("$3", match[3]);
            console.log("Generated prefilled URL:", prefilledUrl);
            return prefilledUrl;
          } catch (e) { console.error("Error generating prefilled URL:", e); return config.prefill.fallbackUrl; }
        }
        console.log("URL pattern not matched for prefill, using fallback.");
        return config.prefill.fallbackUrl;
   }

  // Updates UI elements specific to the Simple Mode
  _updateUIMode() {
    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");

    const captureForm = UI.elements.captureForm;
    const advancedOptions = UI.elements.advancedOptions;
    const pageSourceSelection = document.getElementById('pageSourceSelection'); // Get source selector

    if (captureForm) captureForm.style.display = ""; // Show the main form
    if (advancedOptions) advancedOptions.style.display = "none"; // Hide advanced
    if (pageSourceSelection) pageSourceSelection.style.display = ''; // Show page source options


    this._setupSimpleModeSettings(); // Ensure wait time etc. are setup

    // Initialize URL selector UI if needed, or clear it
    // Use a timeout to ensure the DOM structure is ready after style changes
    setTimeout(async () => {
      if (!document.getElementById("urlSelectorContainer")) {
        console.log("Initializing URL Selector for Simple Mode...");
        try {
          await urlSelector.initialize(); // Creates the container dynamically
          this._setCaptureSettingsCollapsed(false); // Start expanded
          this._handleSourceChange(); // Trigger action based on default source selection AFTER init
        } catch (error) {
          console.error("Failed to initialize URL selector:", error);
          if (typeof urlSelector.showFallbackUI === "function") { urlSelector.showFallbackUI(); }
        }
      } else {
          urlSelector.clearRenderedUrls(); // Clear previous list
          this._setCaptureSettingsCollapsed(false); // Ensure expanded
          this._handleSourceChange(); // Trigger action based on default source selection
      }
      // Final button check after potential init/clear and source handling
      this._checkCaptureButtonState();
    }, 0);


    UI.utils.resetUI(); // Reset progress, output, stats
  }

  // Sets up simple mode specific settings UI elements (Wait Time)
  _setupSimpleModeSettings() {
      const parentElement = UI.elements.captureSettingsContent;
      const urlInputContainer = UI.elements.urlInputContainer;
      if (!parentElement || !urlInputContainer) { console.error("Cannot setup simple settings..."); return; }
      const screenSizeRow = parentElement.querySelector(".screen-size-row.important-setting-group");
      if (!screenSizeRow) { console.error(".screen-size-row... not found."); return; }

      let waitTimeContainer = document.getElementById("simpleWaitTimeContainer");
      let simpleWaitTimeInput = document.getElementById('simpleWaitTime');

      if (!waitTimeContainer) {
        // Create container and elements if they don't exist
        waitTimeContainer = document.createElement("div");
        waitTimeContainer.id = "simpleWaitTimeContainer";
        waitTimeContainer.className = "setting-container important-setting-group";

        const waitTimeLabel = document.createElement("label");
        waitTimeLabel.textContent = "Max Wait Time (sec):"; waitTimeLabel.htmlFor = "simpleWaitTime";
        waitTimeContainer.appendChild(waitTimeLabel);

        simpleWaitTimeInput = document.createElement("input");
        simpleWaitTimeInput.type = "number"; simpleWaitTimeInput.id = "simpleWaitTime";
        simpleWaitTimeInput.className = "wait-time-input"; simpleWaitTimeInput.min = "1";
        simpleWaitTimeInput.max = config.timing.maxWaitTime / 1000 || 120;
        // Use value from hidden storage or default
        const hiddenWait = document.getElementById('hiddenWaitTime') || UI.elements.waitTime;
        simpleWaitTimeInput.value = hiddenWait?.value || config.ui.defaultWaitTime || 5;
        waitTimeContainer.appendChild(simpleWaitTimeInput);

        // Add listener to update hidden storage
        events.addDOMEventListener(simpleWaitTimeInput, 'change', (event) => {
            const hidden = document.getElementById('hiddenWaitTime') || UI.elements.waitTime;
            if (hidden) hidden.value = event.target.value;
        });

        // Insert after screen size row
        screenSizeRow.insertAdjacentElement("afterend", waitTimeContainer);

      } else {
         // Ensure container is visible and styled correctly if it already exists
         waitTimeContainer.style.display = "";
         if (!waitTimeContainer.classList.contains("important-setting-group")) { waitTimeContainer.classList.add("important-setting-group"); }
      }
      // Ensure the main UI reference points to the visible input
      if (simpleWaitTimeInput && UI.elements.waitTime !== simpleWaitTimeInput) {
          UI.elements.waitTime = simpleWaitTimeInput;
      }
  }


  // Placeholder for handling actions input (no-op in simple mode)
  _handleActionsInput() {
    console.log("Actions input changed (Simple Mode - No Action)");
  }

  // Handles changes in the Page Source radio buttons
  _handleSourceChange() {
      const selectedSource = document.querySelector('input[name="pageSourceOption"]:checked')?.value;
      const manualArea = document.getElementById('manualJsonInputArea');
      const urlSelectorContainer = document.getElementById('urlSelectorContainer'); // The container for dynamic list
      const manualJsonStatus = document.getElementById('manualJsonStatus');

      // Ensure required elements are available
      if (!manualArea) { console.error("Manual JSON input area not found."); return; }
      // urlSelectorContainer might not exist yet if init hasn't completed, handle gracefully
      if (!urlSelectorContainer && typeof urlSelector.initialize === 'function' && !document.getElementById('urlSelectorContainer')) {
            console.warn("URL Selector container not ready for source change handling yet.");
            // It should be initialized shortly by _updateUIMode, this function will likely be called again.
            return;
       }

      // Clear previous status messages
      if (manualJsonStatus) manualJsonStatus.textContent = '';

      if (selectedSource === 'manual') {
          manualArea.style.display = ''; // Show manual input area
          if(urlSelectorContainer) urlSelectorContainer.style.display = 'none'; // Hide dynamic URL selector area
          urlSelector.clearRenderedUrls(); // Clear any previously loaded URLs and reset selector state
          urlFetcher.dataLoadedDirectly = false; // Reset flag in fetcher
          urlFetcher.urlsList = []; // Clear lists in fetcher
          urlFetcher.categorizedUrls = {};
          // Reset app state and UI related to previous captures
          this.captureQueue = []; AppState.reset(); UI.utils.resetUI();
          UI.elements.captureBtn.disabled = true; // Disable capture until manual JSON is loaded
      } else { // 'automatic' selected (default)
          manualArea.style.display = 'none'; // Hide manual input area
          if(urlSelectorContainer) urlSelectorContainer.style.display = ''; // Show dynamic URL selector area (or placeholder)
           urlSelector.clearRenderedUrls(); // Clear previous list before fetching/loading
          // Trigger automatic fetching *only if* base URL is valid and login is OK
          if (this.baseUrlValid && this.loginHandler.isAuthenticatedForCapture()) {
              console.log("Automatic source selected, initiating fetch...");
              this._initiateUrlFetching(); // Fetch data
          } else {
               console.log("Automatic source selected, but prerequisites (Base URL/Login) not met.");
               if (urlSelector.container) { // Check if selector is initialized
                    urlSelector.showLoadingState("Waiting for Base URL/Login..."); // Show waiting state
               }
                UI.elements.captureBtn.disabled = true;
          }
      }
      this._checkCaptureButtonState(); // Update main capture button state
  }

  // Handles the click on the "Load Pages from JSON" button
  async _handleManualLoad() {
      const jsonTextArea = document.getElementById('manualJsonText');
      const manualJsonStatus = document.getElementById('manualJsonStatus');
      const urlSelectorContainer = document.getElementById('urlSelectorContainer');
      const loadBtn = document.getElementById('loadManualJsonBtn');


      if (!jsonTextArea || !manualJsonStatus || !urlSelectorContainer || !loadBtn) {
          console.error("Cannot load manual JSON: UI elements missing.");
          return;
      }

      const jsonString = jsonTextArea.value.trim();
      manualJsonStatus.textContent = ''; // Clear previous status
      manualJsonStatus.style.color = '';
      loadBtn.disabled = true; // Disable button while processing
      loadBtn.textContent = 'Loading...';

      if (!jsonString) {
          manualJsonStatus.textContent = 'Error: JSON input cannot be empty.';
          manualJsonStatus.style.color = 'red';
          loadBtn.disabled = false;
          loadBtn.textContent = 'Load Pages from JSON';
          return;
      }

      try {
          manualJsonStatus.textContent = 'Processing JSON...';
          manualJsonStatus.style.color = 'orange';
          UI.elements.captureBtn.disabled = true; // Disable main capture button

          // Call urlFetcher's method, wait for it to finish
          await urlFetcher.setDataDirectly(jsonString);

          // Check the result flag set by setDataDirectly
          if (urlFetcher.dataLoadedDirectly) {
              urlSelector.renderUrlCategories(urlFetcher.categorizedUrls); // Render the loaded data
              urlSelectorContainer.style.display = ''; // Show the selector UI with loaded data
              manualJsonStatus.textContent = `Success: Loaded ${urlFetcher.urlsList.length} pages.`;
              manualJsonStatus.style.color = 'green';
              // Don't enable capture button here; wait for user selection
              // this._checkCaptureButtonState();
          } else {
              // setDataDirectly resolved with [], indicating processing error
              const errorMsg = urlFetcher.error?.message || 'Failed to process JSON data. Check format.';
              manualJsonStatus.textContent = `Error: ${errorMsg}`;
              manualJsonStatus.style.color = 'red';
              urlSelector.clearRenderedUrls(); // Clear display
              urlSelectorContainer.style.display = 'none'; // Hide selector UI
              UI.elements.captureBtn.disabled = true;
          }
      } catch (error) {
          // Catch errors thrown by setDataDirectly (e.g., invalid JSON parsing)
          console.error("Error loading manual JSON:", error);
          // Display the specific error message from URLProcessingError if available
          const errorMsg = error instanceof URLProcessingError ? error.message : "Invalid JSON format or structure.";
          manualJsonStatus.textContent = `Error: ${errorMsg}`;
          manualJsonStatus.style.color = 'red';
           urlSelector.clearRenderedUrls(); // Clear display
           urlSelectorContainer.style.display = 'none'; // Hide selector UI
           UI.elements.captureBtn.disabled = true;
      } finally {
           // Re-enable the load button regardless of success/failure
           loadBtn.disabled = false;
           loadBtn.textContent = 'Load Pages from JSON';
           // Check main capture button state after attempt (depends on selection now)
            this._checkCaptureButtonState();
      }
  }


  // Checks conditions and updates the main Capture button's state
  _checkCaptureButtonState() {
    const captureBtn = UI.elements.captureBtn;
    const buttonContainer = UI.elements.buttonContainer;
    if (!captureBtn || !buttonContainer) { return; }

    const selectedSource = document.querySelector('input[name="pageSourceOption"]:checked')?.value;
    // Manual mode requires data to have been loaded successfully via the button/setDataDirectly
    const isManualModeActiveAndLoaded = selectedSource === 'manual' && urlFetcher.dataLoadedDirectly;

    // Core prerequisites: Not processing, Base URL valid, Login OK
    const prerequisitesMet = !this._processingQueue && this.baseUrlValid && this.loginHandler.isAuthenticatedForCapture();
    // Data requirement: URLs selected AND ( EITHER automatic mode OR manual mode is loaded )
    const urlsSelected = urlSelector.selectedUrls.size > 0;
    const dataAvailableAndSelected = urlsSelected && (selectedSource === 'automatic' || isManualModeActiveAndLoaded);

    const isReadyToCapture = prerequisitesMet && dataAvailableAndSelected;

    captureBtn.disabled = !isReadyToCapture;

    // Update container visibility based on whether the form itself is visible
    if (UI.elements.captureForm.style.display !== 'none') {
        buttonContainer.style.display = ""; buttonContainer.classList.remove("hidden");
    } else {
        buttonContainer.style.display = "none"; buttonContainer.classList.add("hidden");
    }
  }

  // Sets up handlers for custom application events
  _setupEventHandlers() {
    events.on(events.events.CAPTURE_PROGRESS, (data) => { if (data && data.message) UI.progress.updateProgressMessage(data.message); });
    events.on(events.events.SCREENSHOT_TAKEN, (data) => {
        if (!data || !data.result) return;
        const preset = data.result.preset || "N/A"; const presetName = config.screenshot.presets[preset]?.name || preset;
        const width = data.result.width || "?"; const height = data.result.height || "?";
        const timeTaken = data.result.timeTaken || "?"; const isFullPage = data.result.isFullPage || false;
        const sizeDesc = isFullPage ? `Full Page (${width}x${height})` : `${presetName}`;
        const url = data.url || data.result.url || "Unknown URL";
        UI.utils.showStatus(`✓ Captured: ${url} (${sizeDesc}) (${timeTaken}s)`, false, 5000);
    });
    // Update capture button state whenever URL selection changes in the selector UI
    events.on("URL_SELECTION_CHANGED", (data) => { this._checkCaptureButtonState(); });

    // Handle changes in the selected login option
    events.on("LOGIN_OPTION_SELECTED", (data) => {
      if (!this.baseUrlValid) { return; } // Guard
      this.loginHandler.handleLoginOptionChange(data.option); // Let handler manage its UI

      const captureForm = UI.elements.captureForm;
      const pageSourceSelection = document.getElementById('pageSourceSelection');

      if (data.option === 'continueWithoutLogin') {
         // Guest mode selected: Show capture form and related sections
         this._updateUIMode(); // This shows form, source selection, initializes selector, triggers default source action
      } else { // 'login' option selected
          // Hide main capture form until login completes successfully
          if (captureForm) captureForm.style.display = 'none';
          if (pageSourceSelection) pageSourceSelection.style.display = 'none';
      }
      this._checkCaptureButtonState(); // Update button state
    });

    // Handle completion of the login process (success or failure)
    events.on("LOGIN_COMPLETE", (data) => {
      const loginSection = document.getElementById("loginSection");
      const captureForm = UI.elements.captureForm;
      const pageSourceSelection = document.getElementById('pageSourceSelection');

       if (loginSection) loginSection.style.display = 'block'; // Keep login status area visible

      if (data.loggedIn) {
        // Login successful: Show capture form, source selection, and init URL loading based on source
        this._updateUIMode();
      } else {
        // Login failed
        if (this.loginHandler.getSelectedLoginOption() === 'login') {
          UI.utils.showStatus("Login failed. Select 'Continue without login' or try again.", true);
          // Keep capture form hidden
          if (captureForm) captureForm.style.display = 'none';
           if (pageSourceSelection) pageSourceSelection.style.display = 'none';
        }
        // If 'continueWithoutLogin' was selected, LOGIN_COMPLETE(false) shouldn't occur.
      }
      this._checkCaptureButtonState(); // Update button state
    });
  }

  // Initiates URL loading ONLY for 'automatic' source selection
  async _initiateUrlFetching() {
      const selectedSource = document.querySelector('input[name="pageSourceOption"]:checked')?.value;
      // Only proceed if automatic source is selected
      if (selectedSource !== 'automatic') {
          console.log("Skipping automatic fetch, source is not 'automatic'.");
          // If selector exists, ensure it's cleared or shows appropriate placeholder
          if (urlSelector.container && urlSelector.clearRenderedUrls) {
              urlSelector.clearRenderedUrls();
          }
          return;
      }
      // Guard against running if prerequisites aren't met
      if (!this.baseUrlValid || !this.loginHandler.isAuthenticatedForCapture()) {
           console.warn("Attempted automatic fetch, but Base URL/Login state invalid.");
            if (urlSelector.container && urlSelector.showLoadingState) {
                urlSelector.showLoadingState("Waiting for Base URL/Login...");
            }
           return;
       }
       // Ensure URL selector is ready
       if (!document.getElementById("urlSelectorContainer") || !urlSelector.container) {
            console.error("URL selector not ready for fetching.");
            UI.utils.showStatus("UI Error: URL Selector not ready.", true);
           return;
        }

      urlSelector.showLoadingState(); // Show loading in selector UI
      try {
          console.log("Fetching URLs from endpoint (Automatic source).");
          await urlFetcher.loadUrls(); // Fetch normally
          console.log("Fetching from endpoint complete.");

          // Render fetched URLs
          urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
          // Update controls within the selector
          urlSelector.updateSelectionCounter();

      } catch (error) {
          // Use central handler AND update selector UI specifically
          handleError(error, { logToConsole: true, showToUser: true });
          const displayError = error instanceof AppError ? error.message : "Failed to load page list.";
          if (urlSelector.categoriesContainer) {
             urlSelector.categoriesContainer.innerHTML = `<div class="url-selector-error"><p>${displayError}</p><p>Check connection or Base URL.</p></div>`;
           } else if (typeof urlSelector.showFallbackUI === "function") { urlSelector.showFallbackUI(); }
          // Ensure controls are disabled
          urlSelector.updateSelectionCounter();

      } finally {
          // Always check main capture button state after attempt
          this._checkCaptureButtonState();
      }
  }


  // Starts the main screenshot capture process
  async captureScreenshots() {
    const progressOutput = UI.elements.progressOutput;
    if (!progressOutput) { UI.utils.showStatus("UI Error: Progress area missing.", true); return; }
    progressOutput.style.display = ""; // Show progress area

    // Prevent starting if already running, or prerequisites not met
    if (this._processingQueue) { UI.utils.showStatus("Capture running...", false, 3000); return; }
    if (!this.loginHandler.isAuthenticatedForCapture()) { UI.utils.showStatus("Please authenticate or continue as guest.", true); progressOutput.style.display = "none"; return; }
    if (!this.baseUrlValid) { UI.utils.showStatus("Please provide a valid Base URL.", true); progressOutput.style.display = "none"; return; }

    this.startTotalTime = performance.now();
    let urlList = []; // Full URLs for capture

    try {
      AppState.reset(); UI.utils.resetUI();
      this.isPaused = false; this.captureQueue = []; this.currentCaptureIndex = 0;
      this._setCaptureSettingsCollapsed(true); // Collapse settings during capture

      const capturePreset = UI.elements.capturePreset?.value || config.screenshot.defaultPreset;
      const fullPageCheckbox = document.getElementById("fullPageCheckbox");
      const captureFullPage = fullPageCheckbox ? fullPageCheckbox.checked : false;

      // Get selected URLs from the urlSelector component
       if (typeof urlSelector.getSelectedUrlsForCapture === "function") {
            urlList = urlSelector.getSelectedUrlsForCapture(); // Gets full URLs for selected paths
        } else { throw new Error("URL Selector component not available."); }

      if (urlList.length === 0) { throw new URLProcessingError("Please select at least one page.", "No URLs selected"); }

      // UI updates for starting capture
      UI.progress.updateStats(urlList.length, 0, 0, 0);
      UI.elements.captureBtn.disabled = true;
      this.updatePauseResumeButton(); // Enable pause

      // Populate queue
      this.captureQueue = urlList.map((url, index) => ({ url, index, capturePreset, captureFullPage, actionSequences: [], }));
      this.currentCaptureIndex = 0;

      // Start processing
      this._processingQueue = true;
      await this.processCaptureQueue(); // Async processing loop

    } catch (error) { // Handle setup errors (e.g., no URLs selected)
      handleError(error, { logToConsole: true, showToUser: true });
      this._processingQueue = false; this._setCaptureSettingsCollapsed(false);
      this._checkCaptureButtonState(); this.updatePauseResumeButton();
      if (progressOutput) progressOutput.style.display = 'none';
    } finally { // Runs after capture finishes, pauses, or errors during processing
        const isFinished = this.currentCaptureIndex >= this.captureQueue.length;
        const endTotalTime = performance.now();
        const totalTimeTaken = this.startTotalTime ? ((endTotalTime - this.startTotalTime) / 1000).toFixed(2) : "N/A";
        // Update final stats only if finished normally
        if (this.startTotalTime && isFinished && !this.isPaused) {
            UI.progress.updateStats( this.captureQueue.length, AppState.screenshots.size, AppState.failedUrls.length, totalTimeTaken );
        }
        // Final button states
        if (!this.isPaused) { this._checkCaptureButtonState(); this.updatePauseResumeButton(); }
        else { if (UI.elements.captureBtn) UI.elements.captureBtn.disabled = true; }
        // PDF button visibility
        const pdfBtnVisible = AppState.screenshots.size > 0;
        const combineAllPdfBtn = document.querySelector(".combine-all-pdf-btn");
        if (combineAllPdfBtn?.parentElement) {
            const pdfContainer = combineAllPdfBtn.closest(".combine-all-pdf-container") || combineAllPdfBtn.parentElement;
            pdfContainer.style.display = pdfBtnVisible ? "flex" : "none";
            combineAllPdfBtn.disabled = !pdfBtnVisible;
        }
        // Ensure processing flag is correct
        if (!this.isPaused) { this._processingQueue = false; }
    }
  }

  // Processes the capture queue items asynchronously
  async processCaptureQueue() {
     // --- THIS FUNCTION REMAINS UNCHANGED from the previous version ---
     // It iterates through this.captureQueue, calls takeScreenshot, handles results/errors,
     // updates progress, and respects the this.isPaused flag.
     if (this.isPaused || this.currentCaptureIndex >= this.captureQueue.length) { if (this.isPaused) { this._processingQueue = false; } return; }
     if (!this._processingQueue) { this._processingQueue = true; console.log("Starting/Resuming queue processing..."); }
     const totalUrls = this.captureQueue.length;
     while (this.currentCaptureIndex < totalUrls && !this.isPaused) {
       const itemIndex = this.currentCaptureIndex; const item = this.captureQueue[itemIndex];
       if (!item || !item.url) { console.error(`Invalid item at index ${itemIndex}`, item); AppState.addFailedUrl(`Invalid Item @ ${itemIndex}`); this.currentCaptureIndex++; continue; }
       const { url, index, capturePreset, captureFullPage, actionSequences } = item;
       UI.progress.updateProgressMessage(`Processing ${itemIndex + 1} of ${totalUrls}: ${url}`); UI.progress.updateProgress(itemIndex, totalUrls);
       try {
         const result = await ScreenshotCapture.takeScreenshot( url, capturePreset, captureFullPage, actionSequences );
         if (this.isPaused) { this._processingQueue = false; break; } // Check after async call
         const timestamp = URLProcessor.getTimestamp(); const baseFileName = URLProcessor.generateFilename(url, index, "");
         const fullPageSuffix = captureFullPage ? "_FullPage" : ""; const fileName = baseFileName.replace(".png", `${fullPageSuffix}_${timestamp}.png`);
         result.fileName = fileName; UI.thumbnails.addLiveThumbnail(result, fileName, url);
         AppState.addScreenshot(url, result); AppState.removeFailedUrl(url);
       } catch (error) {
         if (this.isPaused) { this._processingQueue = false; break; } // Check after async call error
         handleError(error, { logToConsole: true, showToUser: false });
         const timestamp = URLProcessor.getTimestamp(); const baseFileName = URLProcessor.generateFilename(url, index, "");
         const fullPageSuffix = captureFullPage ? "_FullPage" : ""; const fileName = baseFileName.replace(".png", `${fullPageSuffix}_Error_${timestamp}.png`);
         const errorResult = { error: true, errorMessage: error.message || "Unknown error", sequenceName: url, url: error.url || url, };
         UI.thumbnails.addLiveThumbnail(errorResult, fileName, url); AppState.addFailedUrl(url);
         const displayError = error instanceof ScreenshotError ? `(${error.reason || error.message})` : `(${error.message || 'Unknown'})`;
         UI.utils.showStatus(`✗ Failed: ${url} ${displayError}`, true);
       }
       this.currentCaptureIndex++; UI.progress.updateProgress(this.currentCaptureIndex, totalUrls);
       if (this.currentCaptureIndex < totalUrls && !this.isPaused) { await new Promise((resolve) => setTimeout(resolve, 250)); }
       if (this.isPaused) { this._processingQueue = false; break; } // Final check before next loop/exit
     }
     // Post-loop status update
     const isFinished = this.currentCaptureIndex >= totalUrls;
     if (isFinished && !this.isPaused) { console.log("Queue processing finished normally."); const failedCount = AppState.failedUrls.length; const successCount = totalUrls - failedCount; const completionMessage = `Capture complete. Processed ${totalUrls} pages (${successCount} success, ${failedCount} failed).`; UI.utils.showStatus(completionMessage, failedCount > 0, 0); this._processingQueue = false; }
     else if (this.isPaused) { console.log("Queue processing paused."); UI.utils.showStatus(`Capture paused at URL ${this.currentCaptureIndex + 1} of ${totalUrls}. Click Resume (▶️) to continue.`, false, 0); }
     else { console.warn("Queue loop finished unexpectedly."); this._processingQueue = false; }
  }


  // Creates the Pause/Resume button
  createPauseResumeButton() {
     const buttonContainer = UI.elements.buttonContainer; if (!buttonContainer || document.getElementById("pauseResumeBtn")) return;
     const pauseResumeBtn = document.createElement("button"); pauseResumeBtn.id = "pauseResumeBtn";
     pauseResumeBtn.className = "btn icon-btn pause-resume-btn"; pauseResumeBtn.innerHTML = "⏸️";
     pauseResumeBtn.title = "Pause capture"; events.addDOMEventListener(pauseResumeBtn, "click", this.pauseResumeCapture);
     const captureBtn = UI.elements.captureBtn;
     if (captureBtn && buttonContainer.contains(captureBtn)) { captureBtn.insertAdjacentElement("afterend", pauseResumeBtn); }
     else { buttonContainer.appendChild(pauseResumeBtn); }
     pauseResumeBtn.disabled = true;
  }

  // Handles Pause/Resume button click event
  pauseResumeCapture() {
     this.isPaused = !this.isPaused;
     if (this.isPaused) { console.log("Pause requested."); this.updatePauseResumeButton(); }
     else { console.log("Resume requested."); UI.utils.showStatus("", false, 1); this.updatePauseResumeButton();
       if (this.currentCaptureIndex < this.captureQueue.length && !this._processingQueue) {
         UI.utils.showStatus(`Capture resuming from URL ${this.currentCaptureIndex + 1} of ${this.captureQueue.length}`, false, 3000);
         this.processCaptureQueue(); // Will set _processingQueue flag
       } else if (this._processingQueue) { console.warn("Resume clicked, but processing seems active."); }
       else { console.log("Resume clicked, but capture queue is finished."); this._checkCaptureButtonState(); this.updatePauseResumeButton(); }
     }
  }

  // Updates the Pause/Resume button's state
  updatePauseResumeButton() {
     const pauseResumeBtn = document.getElementById("pauseResumeBtn"); if (!pauseResumeBtn) return;
     const hasItemsToProcess = this.currentCaptureIndex < this.captureQueue.length; const isProcessing = this._processingQueue;
     if (this.isPaused) { pauseResumeBtn.innerHTML = "▶️"; pauseResumeBtn.title = "Resume capture"; pauseResumeBtn.classList.add("paused"); pauseResumeBtn.disabled = !hasItemsToProcess; }
     else { pauseResumeBtn.innerHTML = "⏸️"; pauseResumeBtn.title = "Pause capture"; pauseResumeBtn.classList.remove("paused"); pauseResumeBtn.disabled = !isProcessing || !hasItemsToProcess; }
  }

  // Toggles the visibility of the settings/URL selector section
  _toggleCaptureSettings() {
     const content = document.getElementById("captureSettingsContent");
     const wrapper = document.getElementById("captureSettingsToggle");
     if (!content || !wrapper) { console.warn("Could not toggle settings: Content or wrapper not found."); return; }
     const isCollapsed = content.classList.toggle("collapsed");
     wrapper.classList.toggle("collapsed", isCollapsed);
     console.log(`Settings toggled. Collapsed: ${isCollapsed}`);
  }

  // Sets the collapsed/expanded state of the settings/URL selector section
  _setCaptureSettingsCollapsed(collapsed) {
      const content = document.getElementById("captureSettingsContent");
      const wrapper = document.getElementById("captureSettingsToggle");
      if (!content || !wrapper) { return; } // Might be called early
      // Use the second argument of toggle to explicitly set the class state
      content.classList.toggle("collapsed", collapsed);
      wrapper.classList.toggle("collapsed", collapsed);
  }

} // End App Class

export default App;