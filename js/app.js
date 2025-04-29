// js/app.js
import config from "./config.js";
import AppState from "./state.js";
import UI from "./ui/index.js";
import URLProcessor from "./url-processor.js";
import * as ScreenshotCapture from "./screenshot/core.js";
import ContextMenuActionsHelper from "./context-menu-actions-helper.js";
import * as events from "./events.js";
import { handleError, ScreenshotError, URLProcessingError } from "./errors.js";
import urlSelector from "./ui/url-selector.js";
import LoginHandler from "./login-handler.js"; // Import the login handler
import urlFetcher from "./url-fetcher.js"; // Import urlFetcher

class App {
  constructor() {
    this.currentMode = "simple"; // Default mode - fixed to simple
    this.captureScreenshots = this.captureScreenshots.bind(this);
    this.retryFailedUrls = this.retryFailedUrls.bind(this);
    // this._handleModeChange = this._handleModeChange.bind(this); // Mode change is disabled
    this._handleActionsInput = this._handleActionsInput.bind(this);
    this.generatePrefilledUrl = this.generatePrefilledUrl.bind(this);
    this.prefilledUrl = null;
    this.baseUrl = ""; // Store the validated base URL
    this.baseUrlValid = false; // Track if base URL is valid
    this.loginHandler = LoginHandler; // Use the imported singleton instance

    // Add new properties for pause/resume functionality
    this.isPaused = false;
    this.captureQueue = [];
    this.currentCaptureIndex = 0;
    this.pauseResumeCapture = this.pauseResumeCapture.bind(this);
    this._handleBaseUrlInput = this._handleBaseUrlInput.bind(this); // Bind new handler
    this._initiateUrlFetching = this._initiateUrlFetching.bind(this); // Bind helper
    this._processingQueue = false; // Flag to prevent concurrent processing
  }

  initialize() {
    this.prefilledUrl = this.generatePrefilledUrl(); // Keep prefill logic for potential default
    this._setupEventListeners();
    this._initializeUI();
    this._setupEventHandlers();

    // Force simple mode classes
    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");

    // Initialize login handler - it will handle its own UI creation now
    this.loginHandler.initialize();

    // Initial UI State: Only Base URL section is visible
    const baseUrlSection = document.getElementById("baseUrlSection");
    // const loginOptionSection = document.getElementById('loginOptionSection'); // Let CSS handle initial hide
    const loginSection = document.getElementById("loginSection");
    const captureForm = UI.elements.captureForm;
    const progressOutput = UI.elements.progressOutput;

    if (baseUrlSection) baseUrlSection.style.display = "";
    // REMOVED: if (loginOptionSection) loginOptionSection.style.display = 'none'; // Let CSS handle initial hide
    if (loginSection) loginSection.style.display = "none";
    if (captureForm) captureForm.style.display = "none";
    if (progressOutput) progressOutput.style.display = "none";

    console.log("Application initialized. Waiting for Base URL.");
  }

  _handleBaseUrlInput(event) {
    const url = event.target.value.trim();
    const statusElement = document.getElementById("baseUrlStatus");
    const loginOptionSection = document.getElementById("loginOptionSection");

    // Clear previous status
    if (statusElement) statusElement.textContent = "";

    // Ensure login option section exists
    if (!loginOptionSection) {
      console.error("#loginOptionSection element not found in the DOM!");
      return;
    }

    if (!url) {
      this.baseUrlValid = false;
      this.baseUrl = "";
      if (statusElement) statusElement.textContent = "";
      loginOptionSection.style.display = "none"; // Hide options if URL is cleared
      urlFetcher.projectName = ""; // Clear project name in fetcher
      this._disableLoginOptions(); // Disable radio buttons
      return;
    }

    // Basic validation (presence of /client/)
    if (!url.includes("/client/")) {
      this.baseUrlValid = false;
      this.baseUrl = url; // Store invalid URL for potential re-edit
      if (statusElement) {
        statusElement.textContent =
          "Invalid format. Expected .../client/PROJECT_NAME";
        statusElement.style.color = "red";
      }
      loginOptionSection.style.display = "none"; // Hide options
      urlFetcher.projectName = ""; // Clear project name in fetcher
      this._disableLoginOptions(); // Disable radio buttons
      return;
    }

    // Attempt to set in URL Fetcher (this also extracts project name)
    const success = urlFetcher.setBaseClientUrl(url);

    if (success) {
      this.baseUrl = urlFetcher.baseClientUrl; // Store the potentially cleaned URL
      this.baseUrlValid = true;
      if (statusElement) {
        statusElement.textContent = `Project detected: ${urlFetcher.projectName}. Proceed to step 2.`;
        statusElement.style.color = "green";
      }
      // Show the Login Option section - Revert to plain display = 'block'
      console.log("Base URL valid, attempting to show login options...");
      loginOptionSection.style.display = "block"; // Use plain block
      console.log("Login options display style set to block.");
      this._enableLoginOptions(); // Enable radio buttons
    } else {
      this.baseUrlValid = false;
      this.baseUrl = url;
      if (statusElement) {
        statusElement.textContent =
          "Could not extract project name. Check format.";
        statusElement.style.color = "red";
      }
      loginOptionSection.style.display = "none"; // Hide options
      urlFetcher.projectName = ""; // Clear project name in fetcher
      this._disableLoginOptions(); // Disable radio buttons
    }
  }

  _setupEventListeners() {
    // NEW: Listener for Base URL input
    const baseUrlInput = document.getElementById("baseUrlInput");
    if (baseUrlInput) {
      // Prefill if available
      baseUrlInput.value = this.prefilledUrl || "";
      // Trigger initial validation if prefilled
      if (baseUrlInput.value) {
        this._handleBaseUrlInput({ target: baseUrlInput }); // Simulate event
      }
      events.addDOMEventListener(
        baseUrlInput,
        "blur",
        this._handleBaseUrlInput
      ); // Validate on blur
      events.addDOMEventListener(
        baseUrlInput,
        "input",
        this._handleBaseUrlInput
      ); // Also validate on input for immediate feedback
    } else {
      console.error("Base URL input field (#baseUrlInput) not found!");
    }

    // Mode change listeners removed as mode is fixed
    // events.addDOMEventListener(UI.elements.modeAdvanced, "change", ...);
    // events.addDOMEventListener(UI.elements.modeSimple, "change", ...);

    events.addDOMEventListener(
      UI.elements.captureBtn,
      "click",
      this.captureScreenshots
    );
    events.addDOMEventListener(
      UI.elements.retryFailedBtn,
      "click",
      this.retryFailedUrls
    );
    // actionsField listener remains (harmless in simple mode)
    if (UI.elements.actionsField) {
      events.addDOMEventListener(
        UI.elements.actionsField,
        "input",
        this._handleActionsInput
      );
      events.addDOMEventListener(UI.elements.actionsField, "paste", () => {
        setTimeout(() => this._handleActionsInput(), 0);
      });
    }
  }

  _initializeUI() {
    // Set default wait time (will be copied to simple mode input later)
    if (UI.elements.waitTime) {
      UI.elements.waitTime.value = config.ui.defaultWaitTime || 5;
    }
    if (UI.elements.retryFailedBtn) {
      UI.elements.retryFailedBtn.disabled = true;
    }
    // Disable capture button initially
    if (UI.elements.captureBtn) {
      UI.elements.captureBtn.disabled = true;
    }
    // Create pause/resume button (will be hidden initially with captureForm)
    this.createPauseResumeButton();
  }

  // NEW: Handler for Base URL Input (Corrected with !important for debugging)
  _handleBaseUrlInput(event) {
    const url = event.target.value.trim();
    const statusElement = document.getElementById("baseUrlStatus");
    const loginOptionSection = document.getElementById("loginOptionSection");

    // Clear previous status
    if (statusElement) statusElement.textContent = "";

    // Ensure login option section exists
    if (!loginOptionSection) {
      console.error("#loginOptionSection element not found in the DOM!");
      return;
    }

    if (!url) {
      this.baseUrlValid = false;
      this.baseUrl = "";
      if (statusElement) statusElement.textContent = "";
      loginOptionSection.style.display = "none"; // Hide options if URL is cleared
      urlFetcher.projectName = ""; // Clear project name in fetcher
      this._disableLoginOptions(); // Disable radio buttons
      return;
    }

    // Basic validation (presence of /client/)
    if (!url.includes("/client/")) {
      this.baseUrlValid = false;
      this.baseUrl = url; // Store invalid URL for potential re-edit
      if (statusElement) {
        statusElement.textContent =
          "Invalid format. Expected .../client/PROJECT_NAME";
        statusElement.style.color = "red";
      }
      loginOptionSection.style.display = "none"; // Hide options
      urlFetcher.projectName = ""; // Clear project name in fetcher
      this._disableLoginOptions(); // Disable radio buttons
      return;
    }

    // Attempt to set in URL Fetcher (this also extracts project name)
    const success = urlFetcher.setBaseClientUrl(url);

    if (success) {
      this.baseUrl = urlFetcher.baseClientUrl; // Store the potentially cleaned URL
      this.baseUrlValid = true;
      if (statusElement) {
        statusElement.textContent = `Project detected: ${urlFetcher.projectName}. Proceed to step 2.`;
        statusElement.style.color = "green";
      }
      // Show the Login Option section - TRY WITH !important
      console.log(
        "Base URL valid, attempting to show login options with !important..."
      ); // Add log
      loginOptionSection.style.setProperty("display", "block", "important"); // Use setProperty
      console.log("Login options display style set to block !important."); // Add log
      this._enableLoginOptions(); // Enable radio buttons
    } else {
      this.baseUrlValid = false;
      this.baseUrl = url;
      if (statusElement) {
        statusElement.textContent =
          "Could not extract project name. Check format.";
        statusElement.style.color = "red";
      }
      loginOptionSection.style.display = "none"; // Hide options
      urlFetcher.projectName = ""; // Clear project name in fetcher
      this._disableLoginOptions(); // Disable radio buttons
    }
  }

  // Helper to disable login options
  _disableLoginOptions() {
    const radios = document.querySelectorAll('input[name="loginOption"]');
    radios.forEach((radio) => (radio.disabled = true));
    // Also reset the checked state to default maybe?
    const defaultRadio = document.getElementById("optionContinueWithoutLogin");
    if (defaultRadio) defaultRadio.checked = true;
  }
  // Helper to enable login options
  _enableLoginOptions() {
    const radios = document.querySelectorAll('input[name="loginOption"]');
    radios.forEach((radio) => (radio.disabled = false));
  }

  // _handleModeChange is removed as mode is fixed

  generatePrefilledUrl() {
    const currentUrl = window.location.href;
    // console.log("Current URL:", currentUrl); // Less verbose logging
    const regex = /http(s)?:\/\/([^\/]+)\/system\/webdev\/([^\/]+)/;
    const match = currentUrl.match(regex);
    if (match && match.length >= 4) {
      const protocol = match[1] ? "https" : "http";
      const host = match[2];
      const webdevProjectName = match[3];
      const prefilledUrl = `${protocol}://${host}/data/perspective/client/${webdevProjectName}`;
      console.log("Generated prefilled URL:", prefilledUrl);
      return prefilledUrl;
    }
    console.log("URL pattern not matched, returning empty prefilled URL.");
    return "";
  }

  /**
   * Updates the UI to show the capture form elements (Simple Mode only).
   * Called after login option is selected or login completes.
   * Assumes Base URL is already validated and set.
   */
  _updateUIMode() {
    // Always ensure simple mode classes are set
    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");

    const captureForm = UI.elements.captureForm;
    const progressOutput = UI.elements.progressOutput;
    const urlListTextarea = UI.elements.urlList; // The original textarea

    // Show the main capture form and progress area
    if (captureForm) captureForm.style.display = "";
    if (progressOutput) progressOutput.style.display = "";

    // Hide the original textarea (URL Selector replaces it)
    if (urlListTextarea) urlListTextarea.style.display = "none";

    // Hide advanced options explicitely
    const advancedOptions = UI.elements.advancedOptions;
    if (advancedOptions) advancedOptions.style.display = "none";

    // Configure simple mode settings area
    this._setupSimpleModeSettings();

    // Initialize URL selector UI component
    // Ensure it hasn't been initialized already
    if (!document.getElementById("urlSelectorContainer")) {
      setTimeout(() => {
        // Use timeout to ensure DOM is ready
        urlSelector.initialize().catch((error) => {
          console.error("Failed to initialize URL selector:", error);
          if (typeof urlSelector.showFallbackUI === "function") {
            urlSelector.showFallbackUI();
          }
        });
      }, 0);
    }

    UI.utils.resetUI(); // Reset progress, output, thumbnails
    this._checkCaptureButtonState(); // Check button state after UI updates
  }

  /** Helper to create/ensure simple mode settings UI exists */
  _setupSimpleModeSettings() {
    // const urlList = UI.elements.urlList; // Reference point - urlList might be hidden/replaced
    const parentElement = document
      .getElementById("captureForm")
      ?.querySelector(".card"); // Find parent card more reliably

    if (!parentElement) {
      console.error("Cannot find parent node for simple mode settings.");
      return;
    }

    if (!document.getElementById("simpleModeSetting")) {
      const simpleModeSettings = document.createElement("div");
      simpleModeSettings.id = "simpleModeSetting";
      simpleModeSettings.className = "simple-mode-settings";

      const waitTimeContainer = document.createElement("div");
      waitTimeContainer.className = "setting-container";

      const waitTimeLabel = document.createElement("label");
      waitTimeLabel.textContent = "Max Wait Time (sec):";
      waitTimeLabel.htmlFor = "simpleWaitTime";
      waitTimeContainer.appendChild(waitTimeLabel);

      const simpleWaitTime = document.createElement("input");
      simpleWaitTime.type = "number";
      simpleWaitTime.id = "simpleWaitTime";
      simpleWaitTime.className = "wait-time-input";
      simpleWaitTime.min = "1";
      simpleWaitTime.max = "120";
      // Use value from the hidden main waitTime input as default
      simpleWaitTime.value = UI.elements.waitTime
        ? UI.elements.waitTime.value
        : config.ui.defaultWaitTime || 5;

      waitTimeContainer.appendChild(simpleWaitTime);
      simpleModeSettings.appendChild(waitTimeContainer);

      // Insert *after* the H2 title within the card
      const titleElement = parentElement.querySelector("h2#urlInputTitle");
      if (titleElement) {
        titleElement.insertAdjacentElement("afterend", simpleModeSettings);
      } else {
        console.warn("Could not find title H2 to insert settings after.");
        parentElement.insertBefore(
          simpleModeSettings,
          parentElement.firstChild
        ); // Fallback
      }
    } else {
      document.getElementById("simpleModeSetting").style.display = ""; // Ensure visible
      // Update value in case it was changed somehow (e.g., advanced mode interaction if enabled later)
      const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
      if (simpleWaitTimeInput && UI.elements.waitTime) {
        simpleWaitTimeInput.value = UI.elements.waitTime.value;
      }
    }
  }

  _handleActionsInput() {
    // Kept for potential future use, does nothing in simple mode.
    if (this.currentMode === "advanced") {
      // this._checkCaptureButtonState(); // Advanced mode logic
    }
  }

  _checkCaptureButtonState() {
    const captureBtn = UI.elements.captureBtn;
    const buttonContainer = UI.elements.buttonContainer;
    if (!captureBtn || !buttonContainer) return;

    // Ensure button container is visible if the capture form is visible
    if (UI.elements.captureForm.style.display !== "none") {
      buttonContainer.style.display = ""; // Use default display (flex)
      buttonContainer.classList.remove("hidden");

      // Capture button itself is enabled/disabled by URL_SELECTION_CHANGED event
      // but ensure it's visible
      captureBtn.style.display = "";
      captureBtn.classList.remove("initially-hidden");
      // Disable capture button initially after UI update, rely on URL_SELECTION_CHANGED to enable it
      captureBtn.disabled = urlSelector.selectedUrls.size === 0;
    } else {
      buttonContainer.style.display = "none";
      buttonContainer.classList.add("hidden");
    }
  }

  _setupEventHandlers() {
    // Existing progress/screenshot handlers
    events.on(events.events.CAPTURE_PROGRESS, (data) =>
      UI.progress.updateProgressMessage(data.message)
    );
    events.on(events.events.SCREENSHOT_TAKEN, (data) => {
      // Check if data and result exist before accessing properties
      const preset = data.result?.preset || "N/A";
      const width = data.result?.width || "?";
      const height = data.result?.height || "?";
      const timeTaken = data.result?.timeTaken || "?";
      UI.utils.showStatus(
        `✓ Screenshot captured: ${data.url} (${preset} - ${width}x${height}) (Time: ${timeTaken}s)`,
        false, // Success
        5000 // Auto-remove after 5s
      );
    });

    // CONTEXT_ACTIONS_GENERATED (Advanced Mode only - harmless here)
    events.on("CONTEXT_ACTIONS_GENERATED", () => {
      if (this.currentMode === "advanced") {
        // this._checkCaptureButtonState(); // Advanced mode logic
      }
    });

    // URL selection changes (Simple Mode)
    events.on("URL_SELECTION_CHANGED", (data) => {
      // Only enable capture button if not currently processing
      if (this.currentMode === "simple" && !this._processingQueue) {
        UI.elements.captureBtn.disabled = data.count === 0;
      }
    });

    // Login Option Selected
    events.on("LOGIN_OPTION_SELECTED", (data) => {
      console.log("LOGIN_OPTION_SELECTED event received:", data);
      if (!this.baseUrlValid) {
        UI.utils.showStatus(
          "Please enter and validate a Base URL first.",
          true
        );
        // Reset radio button visually if needed? Or just prevent proceeding.
        const radios = document.querySelectorAll('input[name="loginOption"]');
        radios.forEach((radio) => {
          if (radio.value === this.loginHandler.selectedLoginOption)
            radio.checked = true;
        });
        return;
      }
      this.loginHandler.handleLoginOptionChange(data.option); // Let handler manage login section visibility

      if (data.option === "continueWithoutLogin") {
        // Show capture form and initiate URL fetching immediately
        this._updateUIMode();
        this._initiateUrlFetching();
      }
      // If 'login' is selected, we wait for LOGIN_COMPLETE
    });

    // Login Process Complete
    events.on("LOGIN_COMPLETE", (data) => {
      console.log("LOGIN_COMPLETE event received:", data);
      if (data.loggedIn) {
        // Show capture form and initiate URL fetching after successful login
        this._updateUIMode();
        this._initiateUrlFetching();
      } else {
        // Handle case where login failed or was cancelled
        // If 'login' was selected and it failed, UI stays on login step.
        // If 'continueWithoutLogin' was chosen, the UI is already shown.
        console.log("Login was not successful or was skipped.");
        // If login failed, we might want to hide the capture form again?
        // Or allow user to switch back to 'Continue without login'?
        if (
          this.loginHandler.selectedLoginOption === "login" &&
          !data.loggedIn
        ) {
          // Maybe prompt user or show an error state, keep capture form hidden
          UI.utils.showStatus(
            "Login failed. Select 'Continue without login' or try again.",
            true
          );
          // Optionally hide capture form if it was shown prematurely
          // if (UI.elements.captureForm) UI.elements.captureForm.style.display = 'none';
          // if (UI.elements.progressOutput) UI.elements.progressOutput.style.display = 'none';
        }
      }
    });
  }

  /**
   * Helper function to initiate the URL fetching process.
   * Assumes Base URL has been validated and set in urlFetcher.
   */
  async _initiateUrlFetching() {
    if (!this.baseUrlValid || !urlFetcher.projectName) {
      UI.utils.showStatus(
        "Cannot fetch URLs: Base URL is not valid or project not detected.",
        true
      );
      // Try to show fallback UI in URL selector area
      if (urlSelector.container && urlSelector.showFallbackUI) {
        // If selector exists, try to show fallback within it
        if (urlSelector.categoriesContainer) {
          urlSelector.categoriesContainer.innerHTML = `
                         <div class="url-selector-error">
                             <p>Failed to fetch pages. Base URL invalid.</p>
                             <p>Please correct the Base URL.</p>
                         </div>`;
        }
      } else if (UI.elements.urlList) {
        // If selector failed to init, maybe show the original textarea
        UI.elements.urlList.style.display = "block";
        const parent = UI.elements.urlList.parentElement;
        if (parent) {
          const fallbackNote = document.createElement("div");
          fallbackNote.className = "help-text";
          fallbackNote.style.color = "#dc3545";
          fallbackNote.textContent =
            "Failed to load URLs automatically. Please enter URLs manually.";
          parent.insertBefore(fallbackNote, UI.elements.urlList);
        }
      }
      return;
    }

    // Ensure URL selector is initialized and ready
    if (!document.getElementById("urlSelectorContainer")) {
      console.warn(
        "URL Selector container not ready, attempting initialization again."
      );
      // Initialize UI first if not already done
      this._updateUIMode();
      await new Promise((resolve) => setTimeout(resolve, 50)); // Short delay for DOM update

      if (!document.getElementById("urlSelectorContainer")) {
        UI.utils.showStatus("URL Selector UI failed to initialize.", true);
        return;
      }
    }

    console.log(`Initiating URL fetch for project: ${urlFetcher.projectName}`);
    urlSelector.showLoadingState(); // Show loading spinner in selector

    try {
      await urlFetcher.loadUrls();
      urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
      // Enable capture button if URLs loaded successfully (it will be disabled again if 0 URLs)
      UI.elements.captureBtn.disabled = urlSelector.selectedUrls.size === 0; // Set initial state based on selection
    } catch (error) {
      console.error("Failed to load or render URLs:", error);
      UI.utils.showStatus(`Failed to load URLs: ${error.message}`, true);
      // Show fallback in the selector area
      if (urlSelector.categoriesContainer) {
        urlSelector.categoriesContainer.innerHTML = `
                    <div class="url-selector-error">
                        <p>Failed to load pages: ${error.message}</p>
                        <p>Please check the Base URL and network connection.</p>
                    </div>`;
      } else {
        urlSelector.showFallbackUI(); // Full fallback if container doesn't exist
      }
      UI.elements.captureBtn.disabled = true; // Disable capture if loading failed
    }
  }

  async captureScreenshots() {
    // Prevent starting capture if already processing
    if (this._processingQueue) {
      console.log("Capture already in progress.");
      UI.utils.showStatus("Capture is already in progress.", false, 3000);
      return;
    }

    // Check if authentication is handled (either logged in or continued without)
    if (!this.loginHandler.isAuthenticatedForCapture()) {
      UI.utils.showStatus(
        "Please complete the login selection step first.",
        true
      );
      return;
    }
    // Ensure base URL is valid before proceeding
    if (!this.baseUrlValid) {
      UI.utils.showStatus("Please enter and validate a Base URL first.", true);
      return;
    }

    const startTotalTime = performance.now();
    let urlList = []; // Initialize urlList

    try {
      AppState.reset();
      UI.utils.resetUI(); // Resets progress, output, stats
      this.usingActionSequences = false; // Always false in simple mode
      // Ensure thumbnail container exists, create if needed
      if (!UI.elements.liveThumbnails) {
        UI.thumbnails.createLiveThumbnailsContainer();
      } else {
        // Clear existing thumbnails if container exists
        const contentSection =
          UI.elements.thumbnailsContent ||
          UI.elements.liveThumbnails.querySelector(".thumbnails-content");
        if (contentSection) contentSection.innerHTML = "";
      }
      // Ensure PDF button exists and is initially hidden/disabled
      UI.thumbnails.addCombineAllToPDFButton();
      const combineAllPdfBtn = UI.elements.liveThumbnails?.querySelector(
        ".combine-all-pdf-btn"
      );
      if (combineAllPdfBtn) {
        combineAllPdfBtn.style.display = "none"; // Hide initially
        combineAllPdfBtn.disabled = true;
      }

      // Reset pause state and queue
      this.isPaused = false;
      this.updatePauseResumeButton();
      this.captureQueue = [];
      this.currentCaptureIndex = 0;

      const capturePreset = UI.elements.capturePreset.value || "fullHD";
      // No action sequences in simple mode
      let actionSequences = []; // Keep let for consistency
      this.usingActionSequences = false;

      // Get URLs from the selector
      if (typeof urlSelector.getSelectedUrlsForCapture === "function") {
        urlList = urlSelector.getSelectedUrlsForCapture();
      } else {
        console.warn("URL Selector's getSelectedUrlsForCapture not available.");
        // Attempt fallback to manual text area if visible
        if (
          UI.elements.urlList &&
          UI.elements.urlList.style.display !== "none"
        ) {
          const rawUrlInput = UI.elements.urlList.value.trim();
          urlList = URLProcessor.processUrlList(rawUrlInput);
          console.warn(
            "Using manual URL input as URL selector is unavailable."
          );
        }
      }

      if (urlList.length === 0) {
        throw new URLProcessingError(
          "Please select at least one page to capture.",
          "No URLs selected"
        );
      }

      // Get wait time from the SIMPLE MODE input field
      const simpleWaitTimeEl = document.getElementById("simpleWaitTime");
      if (simpleWaitTimeEl && UI.elements.waitTime) {
        // Copy value to the element used by screenshot core
        UI.elements.waitTime.value = simpleWaitTimeEl.value;
        console.log("Using Wait Time:", UI.elements.waitTime.value);
      } else {
        console.error("Wait time input field (#simpleWaitTime) not found!");
        // Use default from config if element is missing
        UI.elements.waitTime.value = config.ui.defaultWaitTime || 5;
      }

      UI.progress.updateStats(urlList.length, 0, 0, 0);
      UI.elements.captureBtn.disabled = true;
      UI.elements.retryFailedBtn.disabled = true;

      const pauseResumeBtn = document.getElementById("pauseResumeBtn");
      if (pauseResumeBtn) pauseResumeBtn.disabled = false;

      this.captureQueue = urlList.map((url, index) => ({
        url,
        index,
        capturePreset,
        actionSequences: [], // Empty for simple mode
      }));
      this.currentCaptureIndex = 0;

      this._processingQueue = true;
      await this.processCaptureQueue(); // Await the processing
      // Processing flag is cleared inside processCaptureQueue or in finally block
    } catch (error) {
      handleError(error, { logToConsole: true, showToUser: true });
      this._processingQueue = false; // Ensure flag is cleared on setup error
    } finally {
      // This block runs after try/catch completes or if processing finished/paused
      this._processingQueue = false; // Ensure flag is cleared

      // Calculate time only if capture started and finished (not on setup error)
      let totalTimeTaken = "N/A";
      if (startTotalTime && this.captureQueue.length > 0) {
        // Check if queue was populated
        const endTotalTime = performance.now();
        totalTimeTaken = ((endTotalTime - startTotalTime) / 1000).toFixed(2);
      }

      // Update stats (might run even if queue didn't start due to error)
      if (this.captureQueue.length > 0) {
        // Only update stats if queue was populated
        UI.progress.updateStats(
          this.captureQueue.length, // Use queue length for total
          AppState.screenshots.size,
          AppState.failedUrls.length,
          totalTimeTaken // Use calculated time
        );

        const completionMessage = this.isPaused
          ? `Capture paused after processing ${this.currentCaptureIndex} of ${this.captureQueue.length} URLs`
          : `Completed processing ${this.captureQueue.length} URLs (Success: ${AppState.screenshots.size}, Failed: ${AppState.failedUrls.length}, Time: ${totalTimeTaken}s)`;
        UI.progress.updateProgressMessage(completionMessage);

        // Enable PDF button if screenshots were taken
        const combineAllPdfBtn = UI.elements.liveThumbnails?.querySelector(
          ".combine-all-pdf-btn"
        );
        if (combineAllPdfBtn && AppState.screenshots.size > 0) {
          combineAllPdfBtn.style.display = ""; // Show button
          combineAllPdfBtn.disabled = false; // Enable button
        }
      }

      // Re-enable capture button only if not paused and queue is empty AND URLs are selected
      UI.elements.captureBtn.disabled =
        this.isPaused ||
        this.captureQueue.length === 0 ||
        urlSelector.selectedUrls.size === 0;

      UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;

      const pauseResumeBtn = document.getElementById("pauseResumeBtn");
      if (pauseResumeBtn) {
        if (
          this.isPaused &&
          this.currentCaptureIndex < this.captureQueue.length
        ) {
          // Keep button enabled and in resume state
          pauseResumeBtn.textContent = "Resume";
          pauseResumeBtn.classList.add("paused");
          pauseResumeBtn.disabled = false;
        } else {
          // Disable button if capture finished or wasn't paused
          pauseResumeBtn.disabled = true;
          pauseResumeBtn.textContent = "Pause";
          pauseResumeBtn.classList.remove("paused");
        }
      }
    }
  }

  // New method to process the capture queue
  async processCaptureQueue() {
    // If paused or queue is finished, return
    if (this.isPaused || this.currentCaptureIndex >= this.captureQueue.length) {
      this._processingQueue = false; // Ensure flag is false if stopping
      return;
    }

    // Set processing flag if not already set
    if (!this._processingQueue) {
      this._processingQueue = true;
      console.log("Starting or resuming queue processing.");
    }

    const totalUrls = this.captureQueue.length;

    // Process items while not paused and queue has items
    while (this.currentCaptureIndex < totalUrls && !this.isPaused) {
      const item = this.captureQueue[this.currentCaptureIndex];
      // Basic check for item validity
      if (!item || !item.url) {
        console.error(
          `Invalid item at index ${this.currentCaptureIndex}`,
          item
        );
        this.currentCaptureIndex++;
        continue; // Skip invalid item
      }
      const { url, index, capturePreset, actionSequences } = item; // actionSequences will be empty in simple mode

      UI.progress.updateProgressMessage(
        `Processing ${this.currentCaptureIndex + 1} of ${totalUrls}: ${url}`
      );

      try {
        // Simple mode processing (single screenshot per URL)
        // No need to check this.usingActionSequences as it's always false
        try {
          console.log(`Taking single screenshot for URL: ${url}`);
          const result = await ScreenshotCapture.takeScreenshot(
            url,
            capturePreset
          );

          // Generate filename with timestamp
          const timestamp = URLProcessor.getTimestamp();
          const fileName = URLProcessor.generateFilename(
            url,
            index,
            "" // No regex pattern in simple mode
          ).replace(".png", `_${timestamp}.png`);

          result.fileName = fileName; // Add filename to result object

          // Add thumbnail for the single screenshot
          UI.thumbnails.addLiveThumbnail(result, fileName);
          AppState.addScreenshot(url, result); // Mark URL as successful
        } catch (error) {
          // Handle errors specific to single screenshot capture
          console.error(`Error capturing simple screenshot for ${url}:`, error);

          const timestamp = URLProcessor.getTimestamp(); // Generate timestamp for error filename
          const fileName = URLProcessor.generateFilename(
            url,
            index,
            ""
          ).replace(".png", `_Error_${timestamp}.png`);

          // Check for specific 'No view configured' or 'Mount definition' errors
          if (
            error.message &&
            (error.message.includes("No view configured") ||
              error.message.includes("Mount definition"))
          ) {
            const errorResult = {
              error: true,
              errorMessage: error.message,
              sequenceName: url, // Use URL as sequence name for error display
            };

            // Add an error thumbnail
            UI.thumbnails.addLiveThumbnail(
              errorResult,
              fileName,
              url, // Pass URL as sequence name for display
              false, // Not a retry
              false // Not a toolbar action
            );
            UI.utils.showStatus(`✗ Failed: ${url} (Mount error)`, true);
            AppState.addFailedUrl(url); // Mark URL as failed
          } else {
            // Handle other types of errors for single screenshot capture
            // Create a generic error result for thumbnail display
            const errorResult = {
              error: true,
              errorMessage: error.message,
              sequenceName: url,
            };
            UI.thumbnails.addLiveThumbnail(
              errorResult,
              fileName,
              url,
              false,
              false
            );
            AppState.addFailedUrl(url); // Mark URL as failed
            UI.utils.showStatus(`✗ Failed: ${url} (${error.message})`, true); // Show the specific error message
          }
        }

        // Update stats after processing each URL
        UI.progress.updateStats(
          totalUrls,
          AppState.screenshots.size,
          AppState.failedUrls.length,
          0 // Time is updated at the end of the overall capture
        );
      } catch (error) {
        // Catch any uncaught errors during the processing of this URL
        console.error(`Unexpected error processing URL ${url}:`, error);
        AppState.addFailedUrl(url); // Mark URL as failed
        UI.utils.showStatus(`✗ Failed: ${url} (Unexpected error)`, true);
        UI.progress.updateStats(
          totalUrls,
          AppState.screenshots.size,
          AppState.failedUrls.length,
          0
        );
      }

      // Update progress bar regardless of success/failure
      UI.progress.updateProgress(this.currentCaptureIndex + 1, totalUrls);
      this.currentCaptureIndex++;

      // Check if we should pause after each URL
      if (this.isPaused) {
        UI.utils.showStatus(
          `Capture paused at URL ${this.currentCaptureIndex} of ${totalUrls}`,
          false,
          0 // Keep pause message visible
        );
        // Stop the loop
        break;
      }

      // Add a small delay between processing URLs to prevent overwhelming the system/browser
      if (this.currentCaptureIndex < totalUrls) {
        // Only wait if there are more items
        await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms delay
      }
    } // End while loop

    // After the loop finishes (either completed or paused)
    if (this.currentCaptureIndex >= totalUrls) {
      console.log("Queue processing complete.");
      // Final updates and cleanup if all URLs are processed
    } else if (this.isPaused) {
      console.log("Queue processing paused.");
      // Keep state as is, waiting for resume
    }

    // Clear processing flag when loop finishes or pauses
    this._processingQueue = false;

    // Update button states based on final status
    this._checkCaptureButtonState(); // Update capture button based on pause/completion and selection
    UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;

    // Ensure pause/resume button state is correct after processing
    const pauseResumeBtn = document.getElementById("pauseResumeBtn");
    if (pauseResumeBtn) {
      if (
        this.isPaused &&
        this.currentCaptureIndex < this.captureQueue.length
      ) {
        pauseResumeBtn.textContent = "Resume";
        pauseResumeBtn.classList.add("paused");
        pauseResumeBtn.disabled = false; // Keep enabled if paused with items left
      } else {
        pauseResumeBtn.disabled = true; // Disable if not paused or no items left
        pauseResumeBtn.textContent = "Pause"; // Reset text
        pauseResumeBtn.classList.remove("paused"); // Reset class
      }
    }
  }

  async retryFailedUrls() {
    // Prevent starting retry if already processing
    if (this._processingQueue) {
      console.log("Retry already in progress.");
      UI.utils.showStatus("Retry is already in progress.", false, 3000);
      return;
    }

    // Check if authentication is handled
    if (!this.loginHandler.isAuthenticatedForCapture()) {
      UI.utils.showStatus(
        "Cannot retry: Authentication is required or login failed.",
        true
      );
      return;
    }
    // Ensure base URL is valid before proceeding
    if (!this.baseUrlValid) {
      UI.utils.showStatus(
        "Cannot retry: Please enter and validate a Base URL first.",
        true
      );
      return;
    }

    if (AppState.failedUrls.length === 0) {
      UI.utils.showStatus("No failed URLs to retry.", false, 3000);
      return;
    }

    const startTotalTime = performance.now();
    let urlsToRetry = [...AppState.failedUrls];
    let originalFailedCount = urlsToRetry.length;
    let currentFailedUrlsSnapshot = [...AppState.failedUrls]; // Snapshot before clearing
    AppState.failedUrls = []; // Clear failed list at the start of retry
    this._processingQueue = true; // Set processing flag for retry

    try {
      this.usingActionSequences = false; // Always false in simple mode retry
      const capturePreset = UI.elements.capturePreset.value || "fullHD";
      // No action sequences in simple mode retry
      let actionSequences = [];

      // Ensure correct wait time is used during retry
      const simpleWaitTimeEl = document.getElementById("simpleWaitTime");
      if (simpleWaitTimeEl && UI.elements.waitTime) {
        UI.elements.waitTime.value = simpleWaitTimeEl.value;
        console.log("Using Wait Time for Retry:", UI.elements.waitTime.value);
      } else {
        console.error("Wait time input field not found for retry!");
        UI.elements.waitTime.value = config.ui.defaultWaitTime || 5;
      }

      let completed = 0;
      let retriedSuccessCount = 0;
      UI.progress.updateProgressMessage(
        `Retrying ${urlsToRetry.length} failed URLs...`
      );
      UI.elements.progressBar.style.width = "0%"; // Reset progress bar for retry
      UI.elements.retryFailedBtn.disabled = true; // Disable while retrying
      UI.elements.captureBtn.disabled = true; // Also disable main capture button

      // Disable pause/resume button during retry
      const pauseResumeBtn = document.getElementById("pauseResumeBtn");
      if (pauseResumeBtn) {
        pauseResumeBtn.disabled = true;
        pauseResumeBtn.textContent = "Pause";
        pauseResumeBtn.classList.remove("paused");
      }

      // --- Retry Loop ---
      for (let i = 0; i < urlsToRetry.length; i++) {
        const url = urlsToRetry[i];
        // Check if URL is valid before attempting retry
        if (!url) {
          console.warn(`Skipping invalid URL in retry list at index ${i}`);
          completed++;
          continue;
        }
        UI.progress.updateProgressMessage(
          `Retrying ${i + 1} of ${urlsToRetry.length}: ${url}`
        );
        try {
          // Simple mode retry (single screenshot per URL)
          // No need to check this.usingActionSequences
          try {
            console.log(`Retrying simple screenshot for URL: ${url}`);
            const result = await ScreenshotCapture.takeScreenshot(
              url,
              capturePreset
            );

            // Generate filename with Retry indicator and timestamp
            const timestamp = URLProcessor.getTimestamp();
            // Try to find the original index for filename generation if needed
            const originalIndex = AppState.orderedUrls.indexOf(url);
            const filenameIndex = originalIndex !== -1 ? originalIndex : i;

            const fileName = URLProcessor.generateFilename(
              url,
              filenameIndex,
              ""
            ).replace(".png", `_Retry_${timestamp}.png`);

            result.fileName = fileName; // Add filename to result object

            // Add thumbnail for the retried screenshot
            UI.thumbnails.addLiveThumbnail(result, fileName, null, true); // Pass true for isRetry
            AppState.addScreenshot(url, result); // Mark URL as successful
            retriedSuccessCount++; // Increment count for successfully retried URLs
          } catch (error) {
            // Handle errors specific to simple screenshot retry
            console.error(
              `Error retrying simple screenshot for ${url}:`,
              error
            );

            const timestamp = URLProcessor.getTimestamp();
            const originalIndex = AppState.orderedUrls.indexOf(url);
            const filenameIndex = originalIndex !== -1 ? originalIndex : i;
            const fileName = URLProcessor.generateFilename(
              url,
              filenameIndex,
              ""
            ).replace(".png", `_Error_Retry_${timestamp}.png`);

            // Check for specific 'No view configured' or 'Mount definition' errors during retry
            if (
              error.message &&
              (error.message.includes("No view configured") ||
                error.message.includes("Mount definition"))
            ) {
              const errorResult = {
                error: true,
                errorMessage: error.message,
                sequenceName: url + " (Retry Failed)", // Use URL as sequence name for error display
              };

              // Add an error thumbnail for the failed retry
              UI.thumbnails.addLiveThumbnail(
                errorResult,
                fileName,
                url + " (Retry)", // Pass URL + Retry for display name
                true, // Is a retry
                false // Not a toolbar action
              );
              UI.utils.showStatus(`✗ Retry Failed: ${url} (Mount error)`, true);
              AppState.addFailedUrl(url); // Add back to failed list
            } else {
              // Handle other types of errors for simple screenshot retry
              const errorResult = {
                error: true,
                errorMessage: error.message,
                sequenceName: url + " (Retry Failed)",
              };
              UI.thumbnails.addLiveThumbnail(
                errorResult,
                fileName,
                url + " (Retry)",
                true,
                false
              );
              AppState.addFailedUrl(url); // Add back to failed list
              UI.utils.showStatus(
                `✗ Retry Failed: ${url} (${error.message})`,
                true
              ); // Show the specific error message
            }
          }
        } catch (error) {
          // Catch any uncaught errors during the processing of this retry URL
          console.error(`Unexpected error processing retry URL ${url}:`, error);
          AppState.addFailedUrl(url); // Add URL back to failed list
          UI.utils.showStatus(
            `✗ Retry Failed: ${url} (Unexpected error)`,
            true
          );
        }

        completed++;
        UI.progress.updateProgress(completed, urlsToRetry.length); // Update progress bar based on original failed list count

        // Add a small delay between retrying URLs
        if (i < urlsToRetry.length - 1) {
          // Only wait if there are more items
          await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms delay
        }
      } // --- End Retry Loop ---

      const endTotalTime = performance.now();
      const totalTimeTaken = ((endTotalTime - startTotalTime) / 1000).toFixed(
        2
      );
      const finalSuccessCount = AppState.screenshots.size;
      const finalFailedCount = AppState.failedUrls.length;

      // Determine the correct total count for stats (initial successes + originally failed)
      // Need to get initial success count before retry started
      const initialSuccessCount = AppState.orderedUrls.length; // This now includes successfully retried URLs
      const totalAttempted = initialSuccessCount + finalFailedCount; // Total is current success + current fail

      // Update stats with final counts reflecting retry results
      UI.progress.updateStats(
        totalAttempted,
        finalSuccessCount,
        finalFailedCount,
        totalTimeTaken
      );

      UI.progress.updateProgressMessage(
        `Retry complete. ${retriedSuccessCount} of ${originalFailedCount} URLs successfully retried. (Remaining Failed: ${finalFailedCount}, Time: ${totalTimeTaken}s)`
      );
    } catch (error) {
      // Catch setup errors for retry
      handleError(error, { logToConsole: true, showToUser: true });
      AppState.failedUrls = currentFailedUrlsSnapshot; // Restore failed list on setup error
      UI.progress.updateProgressMessage("Retry failed due to setup error.");
    } finally {
      this._processingQueue = false; // Clear processing flag
      // Re-enable capture button based on URL selection state
      UI.elements.captureBtn.disabled =
        this.isPaused ||
        this.captureQueue.length > 0 ||
        this._processingQueue ||
        urlSelector.selectedUrls.size === 0;
      UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;

      // Ensure pause/resume button is disabled after retry is fully complete
      const pauseResumeBtn = document.getElementById("pauseResumeBtn");
      if (pauseResumeBtn) {
        pauseResumeBtn.disabled = true;
        pauseResumeBtn.textContent = "Pause"; // Reset text
        pauseResumeBtn.classList.remove("paused"); // Reset class
      }
    }
  }

  createPauseResumeButton() {
    const buttonContainer = UI.elements.buttonContainer;
    if (!buttonContainer) return;

    const existingBtn = document.getElementById("pauseResumeBtn");
    if (existingBtn) existingBtn.remove();

    const pauseResumeBtn = document.createElement("button");
    pauseResumeBtn.id = "pauseResumeBtn";
    pauseResumeBtn.className = "btn pause-resume-btn";
    pauseResumeBtn.textContent = "Pause";
    pauseResumeBtn.title = "Pause capture";
    pauseResumeBtn.addEventListener("click", this.pauseResumeCapture);

    const captureBtn = UI.elements.captureBtn;
    const retryBtn = UI.elements.retryFailedBtn;

    // Insert after capture button but before retry button
    if (
      captureBtn &&
      retryBtn &&
      buttonContainer.contains(captureBtn) &&
      buttonContainer.contains(retryBtn)
    ) {
      buttonContainer.insertBefore(pauseResumeBtn, retryBtn);
    } else if (captureBtn && buttonContainer.contains(captureBtn)) {
      // If retry button doesn't exist yet, insert after capture button
      captureBtn.insertAdjacentElement("afterend", pauseResumeBtn);
    } else {
      // Fallback: append if buttons aren't found reliably
      buttonContainer.appendChild(pauseResumeBtn);
      if (retryBtn && buttonContainer.contains(retryBtn)) {
        buttonContainer.appendChild(retryBtn); // Ensure retry is last if appended
      }
    }

    pauseResumeBtn.disabled = true; // Initially disabled
  }

  pauseResumeCapture() {
    this.isPaused = !this.isPaused;

    if (
      !this.isPaused &&
      this.captureQueue.length > 0 &&
      this.currentCaptureIndex < this.captureQueue.length
    ) {
      // We just resumed and have items left in the queue
      if (this._processingQueue) {
        console.log("Resume clicked but queue is already processing.");
        this.updatePauseResumeButton(); // Update button state even if already processing
        return;
      }
      UI.utils.showStatus(
        `Capture resumed from URL ${this.currentCaptureIndex + 1} of ${
          this.captureQueue.length
        }`,
        false,
        3000 // Auto-hide resume message
      );
      this.processCaptureQueue(); // Start processing again
    } else if (this.isPaused) {
      // We just paused
      UI.utils.showStatus(
        'Capture paused. Click "Resume" to continue.',
        false,
        0
      ); // Keep message visible
      this._processingQueue = false; // Ensure flag is cleared if paused externally
    } else {
      // Attempted to resume but queue is empty or finished
      console.log("Resume clicked, but queue is empty or finished.");
      this.isPaused = false; // Ensure not stuck in paused state
    }

    this.updatePauseResumeButton();
  }

  updatePauseResumeButton() {
    const pauseResumeBtn = document.getElementById("pauseResumeBtn");
    if (!pauseResumeBtn) return;

    // Disable if processing is active (unless already paused)
    // pauseResumeBtn.disabled = this._processingQueue && !this.isPaused; // This might disable resume too soon

    if (this.isPaused) {
      pauseResumeBtn.textContent = "Resume";
      pauseResumeBtn.classList.add("paused");
      pauseResumeBtn.title = "Resume capture";
      pauseResumeBtn.disabled = false; // Always enabled when paused to allow resuming
    } else {
      pauseResumeBtn.textContent = "Pause";
      pauseResumeBtn.classList.remove("paused");
      pauseResumeBtn.title = "Pause capture";
      // Disable button only if NOT currently processing OR if queue is finished
      pauseResumeBtn.disabled =
        !this._processingQueue ||
        this.currentCaptureIndex >= this.captureQueue.length;
    }
  }
} // End App Class

export default App;
