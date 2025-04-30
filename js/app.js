// js/app.js
import config from "./config.js";
import AppState from "./state.js";
import UI from "./ui/index.js";
import URLProcessor from "./url-processor.js";
import * as ScreenshotCapture from "./screenshot/core.js";
import ContextMenuActionsHelper from "./context-menu-actions-helper.js"; // Likely unused in simple mode but keep import
import * as events from "./events.js";
import { handleError, ScreenshotError, URLProcessingError, AppError } from "./errors.js"; // Import base AppError too
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
    this.startTotalTime = 0; // Track start time for duration calculation
  }

  initialize() {
    this.prefilledUrl = this.generatePrefilledUrl();
    this._setupEventListeners();
    this._initializeUI(); // Sets defaults, creates pause button
    this._setupEventHandlers();

    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");

    this.loginHandler.initialize();

    // Initial UI State Control
    const baseUrlSection = document.getElementById("baseUrlSection");
    const loginOptionSection = document.getElementById("loginOptionSection");
    const loginSection = document.getElementById("loginSection");
    const captureForm = UI.elements.captureForm;
    const progressOutput = UI.elements.progressOutput;
    const baseUrlInput = document.getElementById("baseUrlInput");

    // Show only Base URL section initially by default
    if (baseUrlSection) baseUrlSection.style.display = "";
    if (loginOptionSection) loginOptionSection.style.display = "none"; // Start hidden
    if (loginSection) loginSection.style.display = "none";
    if (captureForm) captureForm.style.display = "none"; // Start hidden
    if (progressOutput) progressOutput.style.display = "none"; // Start hidden

    // Check initial state of prefilled URL
    let isValidOnLoad = false;
    if (baseUrlInput && baseUrlInput.value) {
      isValidOnLoad = urlFetcher.setBaseClientUrl(baseUrlInput.value);
      this.baseUrlValid = isValidOnLoad;
      this.baseUrl = isValidOnLoad
        ? urlFetcher.baseClientUrl
        : baseUrlInput.value;
    }

    if (isValidOnLoad) {
      // If valid URL on load, show login options and enable them
      this._enableLoginOptions();
      if (loginOptionSection) loginOptionSection.style.display = "block";
      const statusElement = document.getElementById("baseUrlStatus");
      if(statusElement) statusElement.textContent = "Base URL seems valid."; // Provide feedback

      // --- Initialization now waits for explicit user selection ---
    } else {
      // If no valid prefilled URL, ensure options are disabled
      this._disableLoginOptions();
      const statusElement = document.getElementById("baseUrlStatus");
      if (statusElement && baseUrlInput && baseUrlInput.value) {
        // Show error only if there was input
        statusElement.textContent = "Initial Base URL invalid. Please check format.";
        statusElement.style.color = "red";
      }
    }

    console.log("Application initialized.");
  }

  // Updated Handler for Base URL Input
  _handleBaseUrlInput(event) {
    const url = event.target.value.trim();
    const statusElement = document.getElementById("baseUrlStatus");
    const loginOptionSection = document.getElementById("loginOptionSection");
    const loginSection = document.getElementById("loginSection");
    const captureForm = UI.elements.captureForm;
    const progressOutput = UI.elements.progressOutput;


    // Clear previous status
    if (statusElement) {
        statusElement.textContent = "";
        statusElement.style.color = ""; // Reset color
    }


    // Ensure elements exist
    if (!loginOptionSection || !loginSection || !captureForm || !progressOutput) {
      console.error("One or more required sections not found in the DOM!");
      return;
    }


    // --- Logic for Empty or Invalid URL ---
    if (!url || !url.includes("/client/")) {
      this.baseUrlValid = false;
      this.baseUrl = url;


      if (statusElement) {
          if (url && !url.includes("/client/")) {
             statusElement.textContent = "Invalid format. Expected .../client/PROJECT_NAME";
             statusElement.style.color = "red";
          } else {
               statusElement.textContent = ""; // Clear message if URL is empty
          }
      }


      // Hide all subsequent sections and disable/reset login options
      loginOptionSection.style.display = "none";
      loginSection.style.display = "none";
      captureForm.style.display = "none";
      progressOutput.style.display = "none";
      urlFetcher.projectName = "";
      this._disableLoginOptions(); // Disable and uncheck radio buttons
      return; // Exit early
    }


    // --- Logic for Potentially Valid URL ---
    const success = urlFetcher.setBaseClientUrl(url);


    if (success) {
      // --- URL is Valid ---
      this.baseUrl = urlFetcher.baseClientUrl;
      this.baseUrlValid = true;
      if (statusElement) {
          statusElement.textContent = "Base URL looks valid."; // Provide feedback
          statusElement.style.color = "green";
      }


      console.log("Base URL valid. Showing Login Options.");
      loginOptionSection.style.display = "block"; // SHOW Login Options
      this._enableLoginOptions(); // Enable radio buttons


      // Ensure subsequent sections are HIDDEN until a login option is chosen
      loginSection.style.display = "none";
      captureForm.style.display = "none";
      progressOutput.style.display = "none";


    } else {
      // --- URL is Invalid (e.g., cannot extract project name) ---
      this.baseUrlValid = false;
      this.baseUrl = url;


      if (statusElement) {
        statusElement.textContent = "Could not extract project name. Check format.";
        statusElement.style.color = "red";
      }


      // Hide all subsequent sections and disable/reset login options
      loginOptionSection.style.display = "none";
      loginSection.style.display = "none";
      captureForm.style.display = "none";
      progressOutput.style.display = "none";
      urlFetcher.projectName = "";
      this._disableLoginOptions(); // Disable and uncheck radio buttons
    }
  }


  _setupEventListeners() {
    // Listener for Base URL input
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

    // actionsField listener remains (potentially for future advanced mode)
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
    // Set default wait time (will be copied to simple mode input later if it exists)
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


  // Helper to disable login options
  _disableLoginOptions() {
    const radios = document.querySelectorAll('input[name="loginOption"]');
    radios.forEach((radio) => {
        radio.disabled = true;
        radio.checked = false; // Explicitly uncheck
    });
  }
  // Helper to enable login options
  _enableLoginOptions() {
    const radios = document.querySelectorAll('input[name="loginOption"]');
    radios.forEach((radio) => (radio.disabled = false));
  }


  generatePrefilledUrl() {
    const currentUrl = window.location.href;
    const regex = config.prefill.sourcePattern;
    const match = currentUrl.match(regex);
    if (match && match.length >= 4) {
      try {
          const protocol = match[1] ? "https" : "http";
          const host = match[2];
          const webdevProjectName = match[3];
          const prefilledUrl = config.prefill.targetTemplate
                .replace('$1', match[1] || '') // http(s) group might be undefined
                .replace('$2', host)
                .replace('$3', webdevProjectName);
          console.log("Generated prefilled URL:", prefilledUrl);
          return prefilledUrl;
      } catch(e) {
          console.error("Error generating prefilled URL from template:", e);
          return config.prefill.fallbackUrl; // Fallback on template error
      }
    }
    console.log("URL pattern not matched, using fallback prefilled URL.");
    return config.prefill.fallbackUrl;
  }

  /**
   * Updates the UI to show the capture form elements (Simple Mode only).
   */
  _updateUIMode() {
    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");

    const captureForm = UI.elements.captureForm;
    const urlListTextarea = UI.elements.urlList; // The original textarea

    // Show the main capture form (progress output shown when capture starts)
    if (captureForm) captureForm.style.display = "";

    // Hide the original textarea (URL Selector replaces it)
    if (urlListTextarea) urlListTextarea.style.display = "none";

    // Hide advanced options explicitely
    const advancedOptions = UI.elements.advancedOptions;
    if (advancedOptions) advancedOptions.style.display = "none";

    // Configure simple mode settings area
    this._setupSimpleModeSettings();

    // Initialize URL selector UI component if not already present
    if (!document.getElementById("urlSelectorContainer")) {
      setTimeout(() => { // Ensure DOM is ready
        urlSelector.initialize().catch((error) => {
          console.error("Failed to initialize URL selector:", error);
          if (typeof urlSelector.showFallbackUI === "function") {
            urlSelector.showFallbackUI();
          }
        });
      }, 0);
    }

    UI.utils.resetUI(); // Reset output areas
    this._checkCaptureButtonState(); // Check button state after UI updates
  }

  /** Helper to create/ensure simple mode settings UI exists */
  _setupSimpleModeSettings() {
    const parentElement = document.getElementById("captureForm")?.querySelector(".card");
    if (!parentElement) {
      console.error("Cannot find parent node for simple mode settings.");
      return;
    }

    let simpleModeSettings = document.getElementById("simpleModeSetting");
    if (!simpleModeSettings) {
      simpleModeSettings = document.createElement("div");
      simpleModeSettings.id = "simpleModeSetting";
      simpleModeSettings.className = "simple-mode-settings"; // Use class for styling

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
      simpleWaitTime.max = config.timing.maxWaitTime / 1000 || 120; // Use config
      simpleWaitTime.value = UI.elements.waitTime?.value || config.ui.defaultWaitTime || 5; // Sync initial value

      waitTimeContainer.appendChild(simpleWaitTime);
      simpleModeSettings.appendChild(waitTimeContainer);

      // Insert *after* the H2 title within the card
      const titleElement = parentElement.querySelector("h2#urlInputTitle");
      if (titleElement) {
        titleElement.insertAdjacentElement("afterend", simpleModeSettings);
      } else {
        parentElement.insertBefore(simpleModeSettings, parentElement.firstChild);
      }
    } else {
        simpleModeSettings.style.display = ""; // Ensure visible
        // Update value in case it was changed (though not possible in simple mode only)
        const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
        if (simpleWaitTimeInput && UI.elements.waitTime) {
            simpleWaitTimeInput.value = UI.elements.waitTime.value;
        }
    }
  }

  _handleActionsInput() {
    // No-op in simple mode
  }

  _checkCaptureButtonState() {
    const captureBtn = UI.elements.captureBtn;
    const buttonContainer = UI.elements.buttonContainer;
    if (!captureBtn || !buttonContainer) return;

    if (UI.elements.captureForm.style.display !== "none") {
      buttonContainer.style.display = ""; // Default display (flex)
      buttonContainer.classList.remove("hidden");
      captureBtn.style.display = "";
      captureBtn.classList.remove("initially-hidden");
      // Enable/disable based on URL selection and processing state
      captureBtn.disabled = this._processingQueue || urlSelector.selectedUrls.size === 0;
    } else {
      buttonContainer.style.display = "none";
      buttonContainer.classList.add("hidden");
    }
  }

  _setupEventHandlers() {
    events.on(events.events.CAPTURE_PROGRESS, (data) =>
      UI.progress.updateProgressMessage(data.message)
    );
    events.on(events.events.SCREENSHOT_TAKEN, (data) => {
      const preset = data.result?.preset || "N/A"; // Base preset key
       const presetName = config.screenshot.presets[preset]?.name || preset; // Get friendly name
      const width = data.result?.width || "?";
      const height = data.result?.height || "?";
      const timeTaken = data.result?.timeTaken || "?";
      const isFullPage = data.result?.isFullPage || false;
      const sizeDesc = isFullPage ? `Full Page (${width}x${height})` : `${presetName}`;

      // Use showStatus for success messages as well, with auto-hide
      UI.utils.showStatus(
        `✓ Screenshot captured: ${data.url} (${sizeDesc}) (Time: ${timeTaken}s)`,
        false, // Not an error
        5000 // Auto-hide after 5 seconds
      );
    });

    // Context actions event (unused in simple mode)
    events.on("CONTEXT_ACTIONS_GENERATED", () => {});

    // URL selection change
    events.on("URL_SELECTION_CHANGED", (data) => {
      // Enable/disable capture button only if not currently processing
      if (this.currentMode === "simple" && !this._processingQueue) {
        UI.elements.captureBtn.disabled = data.count === 0;
      }
    });

    // Login Option Selected
    events.on("LOGIN_OPTION_SELECTED", (data) => {
      console.log("LOGIN_OPTION_SELECTED event received:", data);
      if (!this.baseUrlValid) {
        console.warn("Login option selected, but Base URL is not valid.");
        return;
      }

      // Let handler manage login section visibility AND trigger login process if 'login' selected
      this.loginHandler.handleLoginOptionChange(data.option);

      // Hide the other dependent sections initially when an option is FIRST selected
      if (data.option === "login") {
           if (UI.elements.captureForm) UI.elements.captureForm.style.display = "none";
           if (UI.elements.progressOutput) UI.elements.progressOutput.style.display = "none";
      }

      // Show capture form and fetch URLs ONLY if 'Continue without login' is chosen
      if (data.option === "continueWithoutLogin") {
        console.log("Continue without login chosen by user, showing capture form and fetching URLs.");
        // Ensure login section is hidden if user switches TO this option
        const loginSection = document.getElementById("loginSection");
        if (loginSection) loginSection.style.display = "none";
        this._updateUIMode(); // Show capture form UI
        this._initiateUrlFetching(); // Fetch URLs
      }
      // If 'login' is selected, the flow now waits for LOGIN_COMPLETE event.
    });

    // Login Process Complete
    events.on("LOGIN_COMPLETE", (data) => {
      console.log("LOGIN_COMPLETE event received:", data);
      // Show capture form ONLY if login was successful
      if (data.loggedIn) {
        console.log("Login successful, showing capture form and fetching URLs.");
        this._updateUIMode(); // Show capture form UI
        this._initiateUrlFetching(); // Fetch URLs
      } else {
        // If login failed or was skipped
        console.log("Login was not successful or was skipped.");
        if (this.loginHandler.selectedLoginOption === "login" && !data.loggedIn) {
          // Show error only if user explicitly chose login and it failed
          UI.utils.showStatus( "Login failed. Select 'Continue without login' or try again.", true );
          if (UI.elements.captureForm) UI.elements.captureForm.style.display = "none";
          if (UI.elements.progressOutput) UI.elements.progressOutput.style.display = "none";
        }
      }
    });
  }

  /** Helper function to initiate the URL fetching process. */
  async _initiateUrlFetching() {
    if (!this.baseUrlValid || !urlFetcher.projectName) {
      UI.utils.showStatus("Cannot fetch URLs: Base URL is not valid or project not detected.", true);
      // Try to show fallback UI in URL selector area
      if (urlSelector.container && typeof urlSelector.showFallbackUI === "function") {
         if (urlSelector.categoriesContainer) {
             urlSelector.categoriesContainer.innerHTML = `<div class="url-selector-error"><p>Failed to fetch pages. Base URL invalid.</p><p>Please correct the Base URL.</p></div>`;
         } else {
             urlSelector.showFallbackUI(); // Full fallback if needed
         }
      }
      return;
    }

    // Ensure URL selector is initialized and ready
    if (!document.getElementById("urlSelectorContainer")) {
       console.warn("URL Selector container not ready, initialization might be pending.");
       // _updateUIMode should have been called before this, which schedules initialization
       // Add a small delay to wait for initialization potentially
       await new Promise(resolve => setTimeout(resolve, 100));
        if (!document.getElementById("urlSelectorContainer")) {
           UI.utils.showStatus("URL Selector UI failed to initialize.", true);
           return; // Stop if it still hasn't initialized
        }
    }

    console.log(`Initiating URL fetch for project: ${urlFetcher.projectName}`);
    urlSelector.showLoadingState(); // Show loading spinner in selector

    try {
      await urlFetcher.loadUrls();
      urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
      // Update capture button state after loading URLs
      UI.elements.captureBtn.disabled = this._processingQueue || urlSelector.selectedUrls.size === 0;
    } catch (error) {
      console.error("Failed to load or render URLs:", error);
      UI.utils.showStatus(`Failed to load URLs: ${error.message}`, true);
      // Show fallback in the selector area
      if (urlSelector.categoriesContainer) {
        urlSelector.categoriesContainer.innerHTML = `<div class="url-selector-error"><p>Failed to load pages: ${error.message}</p><p>Please check the Base URL and network connection.</p></div>`;
      } else if(typeof urlSelector.showFallbackUI === "function") {
        urlSelector.showFallbackUI(); // Full fallback
      }
      UI.elements.captureBtn.disabled = true; // Disable capture if loading failed
    }
  } // End _initiateUrlFetching

  async captureScreenshots() {
    const progressOutput = UI.elements.progressOutput;
    if (progressOutput) {
      progressOutput.style.display = ""; // Make progress area visible
    } else {
      console.error("Progress output element not found!");
    }

    if (this._processingQueue) {
      UI.utils.showStatus("Capture is already in progress.", false, 3000);
      return;
    }
    if (!this.loginHandler.isAuthenticatedForCapture()) {
      UI.utils.showStatus("Please complete the login selection step first.", true);
      if (progressOutput) progressOutput.style.display = "none";
      return;
    }
    if (!this.baseUrlValid) {
      UI.utils.showStatus("Please enter and validate a Base URL first.", true);
      if (progressOutput) progressOutput.style.display = "none";
      return;
    }

    this.startTotalTime = performance.now(); // Record start time
    let urlList = [];

    try {
      AppState.reset();
      UI.utils.resetUI(); // Reset output/progress/thumbnails container FIRST
      this.usingActionSequences = false;

      // Ensure thumbnail container exists (resetUI removes it)
      // It will be created by addLiveThumbnail if needed

      this.isPaused = false;
      this.captureQueue = [];
      this.currentCaptureIndex = 0;
      this.updatePauseResumeButton(); // Update state initially

      const capturePreset = UI.elements.capturePreset.value || "fullHD";
      const fullPageCheckbox = document.getElementById("fullPageCheckbox");
      const captureFullPage = fullPageCheckbox ? fullPageCheckbox.checked : false;

      // Get URLs from the selector
      if (typeof urlSelector.getSelectedUrlsForCapture === "function") {
        urlList = urlSelector.getSelectedUrlsForCapture();
      } else { throw new Error("URL Selector component not available."); }

      if (urlList.length === 0) {
        throw new URLProcessingError("Please select at least one page to capture.", "No URLs selected");
      }

      // Sync wait time from simple mode input
      const simpleWaitTimeEl = document.getElementById("simpleWaitTime");
      if (simpleWaitTimeEl && UI.elements.waitTime) {
         UI.elements.waitTime.value = simpleWaitTimeEl.value;
         console.log("Using Wait Time:", UI.elements.waitTime.value);
      } else {
         console.error("Wait time input field not found!");
         UI.elements.waitTime.value = config.ui.defaultWaitTime || 5;
      }

      UI.progress.updateStats(urlList.length, 0, 0, 0);
      UI.elements.captureBtn.disabled = true; // Disable during capture
      UI.elements.retryFailedBtn.disabled = true;
      const pauseResumeBtn = document.getElementById("pauseResumeBtn");
      if (pauseResumeBtn) pauseResumeBtn.disabled = false; // Enable pause button

      this.captureQueue = urlList.map((url, index) => ({
        url, index, capturePreset, captureFullPage, actionSequences: [],
      }));
      this.currentCaptureIndex = 0;

      this._processingQueue = true;
      await this.processCaptureQueue(); // Await the processing

    } catch (error) {
      // Handle errors during setup phase
       handleError(error, { logToConsole: true, showToUser: true });
       this._processingQueue = false; // Ensure flag is cleared on setup error
        // Update buttons after setup error
        this._checkCaptureButtonState();
        this.updatePauseResumeButton();
        UI.elements.retryFailedBtn.disabled = true; // No failed URLs yet potentially
    } finally {
        // This runs once after the entire process (or setup error) finishes
        const isFinished = this.currentCaptureIndex >= this.captureQueue.length;

        // Calculate time only if startTotalTime was recorded
        const endTotalTime = performance.now();
        const totalTimeTaken = this.startTotalTime ? ((endTotalTime - this.startTotalTime) / 1000).toFixed(2) : "N/A";

        // Update final stats using AppState if processing actually started
        if (this.startTotalTime && isFinished) { // Only update stats if fully finished
            UI.progress.updateStats(
                AppState.orderedUrls.length + AppState.failedUrls.length, // Total attempted
                AppState.screenshots.size, // Successful
                AppState.failedUrls.length, // Failed
                totalTimeTaken
            );
        }

        // Update button states (only re-enable capture/retry if finished and not paused)
        if (!this.isPaused && isFinished) {
             this._checkCaptureButtonState(); // Re-enable capture btn if needed
             UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;
             this.updatePauseResumeButton(); // Ensure pause button is disabled
        } else {
             // If paused or errored early, ensure capture/retry remain disabled
             if(UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
             if(UI.elements.retryFailedBtn) UI.elements.retryFailedBtn.disabled = true;
        }


       // Show the combine PDF button if there are successful screenshots
       if (AppState.screenshots.size > 0) {
            const combineAllPdfBtn = document.querySelector(".combine-all-pdf-btn"); // Find button
            if (combineAllPdfBtn) {
                combineAllPdfBtn.style.display = "inline-block"; // Show
                combineAllPdfBtn.disabled = false; // Enable
            }
       } else {
            // Ensure button is hidden/disabled if no screenshots succeeded
            const combineAllPdfBtn = document.querySelector(".combine-all-pdf-btn");
             if (combineAllPdfBtn) {
                 combineAllPdfBtn.style.display = "none";
                 combineAllPdfBtn.disabled = true;
             }
       }
    }
  } // End captureScreenshots

  // Updated method to process the capture queue with refined pause checks
  async processCaptureQueue() {
    if (this.isPaused || this.currentCaptureIndex >= this.captureQueue.length) {
      if(this.isPaused) this._processingQueue = false;
      return;
    }

    if (!this._processingQueue) {
      this._processingQueue = true;
      console.log("Starting or resuming queue processing.");
    }

    const totalUrls = this.captureQueue.length;

    while (this.currentCaptureIndex < totalUrls) {

      // --- CHECK PAUSE #1: Before getting item details ---
      if (this.isPaused) {
          console.log(`[Loop Start] Pause detected. Index: ${this.currentCaptureIndex}`);
          this._processingQueue = false;
          break;
      }
      // ---

      const item = this.captureQueue[this.currentCaptureIndex];
      if (!item || !item.url) {
        console.error(`Invalid item at index ${this.currentCaptureIndex}`, item);
        this.currentCaptureIndex++;
        continue;
      }
      const { url, index, capturePreset, captureFullPage, actionSequences } = item;

      UI.progress.updateProgressMessage(
        `Processing ${this.currentCaptureIndex + 1} of ${totalUrls}: ${url}`
      );

      try {
        // --- CHECK PAUSE #2: Immediately Before Screenshot ---
        if (this.isPaused) {
            console.log(`[Pre-Capture Check] Pause detected for URL: ${url} at index ${this.currentCaptureIndex}. Breaking loop.`);
            this._processingQueue = false;
            break; // Exit the while loop immediately
        }
        // ---

        // Capture process (can take time)
        const result = await ScreenshotCapture.takeScreenshot(
            url, capturePreset, captureFullPage, actionSequences
        );

        // --- CHECK PAUSE #3: Immediately After Screenshot (before processing result) ---
         if (this.isPaused) {
            console.log(`[Post-Capture Check] Pause detected after capture for URL: ${url}. Breaking before result processing.`);
            this._processingQueue = false;
            break; // Exit loop before processing result for this item if paused during capture
        }
        // ---

        // Process result if not paused
        const timestamp = URLProcessor.getTimestamp();
        let baseFileName = URLProcessor.generateFilename(url, index, "");
        const fullPageSuffix = captureFullPage ? "_FullPage" : "";
        const fileName = baseFileName.replace(".png", `${fullPageSuffix}_${timestamp}.png`);
        result.fileName = fileName;
        UI.thumbnails.addLiveThumbnail(result, fileName); // This handles container visibility
        AppState.addScreenshot(url, result);
        AppState.removeFailedUrl(url);

      } catch (error) {
         // Handle screenshot errors (check pause state again in case error happened during pause)
         if (this.isPaused) {
             console.log(`[Capture Error Check] Pause detected during error handling for URL: ${url}. Breaking.`);
             this._processingQueue = false;
             break;
         }

         console.error(`Error capturing simple screenshot for ${url}:`, error);
         const timestamp = URLProcessor.getTimestamp();
         let baseFileName = URLProcessor.generateFilename(url, index, "");
         const fullPageSuffix = captureFullPage ? "_FullPage" : "";
         const fileName = baseFileName.replace(".png", `${fullPageSuffix}_Error_${timestamp}.png`);
         // Handle specific errors... (Mount error check)
          if ( error instanceof AppError && (error.message.includes("No view configured") || error.message.includes("Mount definition")) ) {
              const errorResult = { error: true, errorMessage: error.message, sequenceName: url, url: error.url || url };
              UI.thumbnails.addLiveThumbnail( errorResult, fileName, url, false, false );
              UI.utils.showStatus(`✗ Failed: ${url} (Mount error)`, true);
              AppState.addFailedUrl(url);
          } else { // Handle other errors
              const errorResult = { error: true, errorMessage: error.message, sequenceName: url, url: error.url || url };
              UI.thumbnails.addLiveThumbnail( errorResult, fileName, url, false, false );
              AppState.addFailedUrl(url);
              UI.utils.showStatus(`✗ Failed: ${url} (${error.message || 'Unknown error'})`, true);
          }
      }

       // --- CHECK PAUSE #4: Before index increment ---
       if (this.isPaused) {
           console.log(`[Post-Processing Check] Pause detected before index increment. Index: ${this.currentCaptureIndex}`);
           this._processingQueue = false;
           break;
       }
       // ---

      // Update progress bar & index
      UI.progress.updateProgress(this.currentCaptureIndex + 1, totalUrls);
      this.currentCaptureIndex++; // Increment index *only after* all checks for the current item pass

      // Optional delay
      if (this.currentCaptureIndex < totalUrls) { // Check index *before* checking pause for delay
          // --- CHECK PAUSE #5: Before Delay ---
          if(this.isPaused){
               console.log(`[Pre-Delay Check] Pause detected. Index: ${this.currentCaptureIndex}`);
               this._processingQueue = false;
               break;
          }
          // ---
          await new Promise((resolve) => setTimeout(resolve, 250)); // Shorter delay?
      }

    } // End while loop

    // After loop finishes (completed or paused)
    const isFinished = this.currentCaptureIndex >= totalUrls;

    if (isFinished) {
      console.log("Queue processing complete.");
      // Clear processing message only if finished naturally
      if (!this.isPaused) {
          UI.progress.updateProgressMessage(`Capture complete. Processed ${totalUrls} pages.`);
          // Optionally clear message after a delay
           setTimeout(() => UI.utils.showStatus("", false, 1), 3000);
      }
      this._processingQueue = false; // Clear flag on natural completion
    } else if (this.isPaused) {
        console.log("Queue processing paused.");
         if (this._processingQueue) { // Safety check
             console.warn("Loop broke for pause, but _processingQueue is still true. Setting to false.");
             this._processingQueue = false;
         }
         // Update status message to reflect which URL it paused *before*
         UI.utils.showStatus(
           `Capture paused. Click "Resume" to continue (next URL: ${this.currentCaptureIndex + 1} of ${totalUrls})`,
           false, 0 // Keep message visible
         );
    } else {
       console.warn("Queue loop finished unexpectedly.");
       this._processingQueue = false; // Ensure flag is cleared
    }

    // Final button state updates (always run this)
    this._checkCaptureButtonState();
    UI.elements.retryFailedBtn.disabled = this._processingQueue || AppState.failedUrls.length === 0; // Also check processing flag
    this.updatePauseResumeButton();

  } // End processCaptureQueue


  async retryFailedUrls() {
    if (this._processingQueue) {
      UI.utils.showStatus("Process already running.", false, 3000);
      return;
    }
    if (!this.loginHandler.isAuthenticatedForCapture()) {
      UI.utils.showStatus("Cannot retry: Authentication is required or login failed.", true);
      return;
    }
    if (!this.baseUrlValid) {
      UI.utils.showStatus("Cannot retry: Please enter and validate a Base URL first.", true);
      return;
    }
    if (AppState.failedUrls.length === 0) {
      UI.utils.showStatus("No failed URLs to retry.", false, 3000);
      return;
    }

    this.startTotalTime = performance.now(); // Record start time for retry duration
    let urlsToRetry = [...AppState.failedUrls]; // Copy the list
    let originalFailedCount = urlsToRetry.length;
    let initialSuccessCount = AppState.screenshots.size; // Success count *before* retry

    // --- Reset state for retry ---
    this._processingQueue = true;
    this.isPaused = false;
    const capturePreset = UI.elements.capturePreset.value || "fullHD";
    const fullPageCheckbox = document.getElementById("fullPageCheckbox");
    const captureFullPage = fullPageCheckbox ? fullPageCheckbox.checked : false;
    this.captureQueue = urlsToRetry.map((url, index) => ({
        url, index, capturePreset, captureFullPage, actionSequences: [],
      }));
    this.currentCaptureIndex = 0;
    AppState.failedUrls = []; // Clear failed list *before* starting retry process
    // --- End Reset state ---

    try {
      this.usingActionSequences = false;

      // Sync wait time from simple mode input
      const simpleWaitTimeEl = document.getElementById("simpleWaitTime");
      if (simpleWaitTimeEl && UI.elements.waitTime) {
        UI.elements.waitTime.value = simpleWaitTimeEl.value;
        console.log("Using Wait Time for Retry:", UI.elements.waitTime.value);
      } else {
        console.error("Wait time input field not found for retry!");
        UI.elements.waitTime.value = config.ui.defaultWaitTime || 5;
      }

      UI.progress.updateProgressMessage(`Retrying ${urlsToRetry.length} failed URLs...`);
      UI.elements.progressBar.style.width = "0%";
      UI.elements.retryFailedBtn.disabled = true;
      UI.elements.captureBtn.disabled = true;
      this.updatePauseResumeButton(); // Enable pause button for retry

      // Process the retry queue
      await this.processCaptureQueue(); // Reuse the queue processing logic

      // --- Post-Retry Processing (only if not paused) ---
       if (!this.isPaused) {
           const endTotalTime = performance.now();
           const totalTimeTaken = ((endTotalTime - this.startTotalTime) / 1000).toFixed(2);
           const finalSuccessCount = AppState.screenshots.size;
           const finalFailedCount = AppState.failedUrls.length; // Failed URLs *after* retry attempt
           const retriedSuccessCount = finalSuccessCount - initialSuccessCount;
           const totalAttempted = initialSuccessCount + originalFailedCount;

           UI.progress.updateStats(totalAttempted, finalSuccessCount, finalFailedCount, totalTimeTaken);
           // Clear processing message only if finished naturally
           UI.progress.updateProgressMessage(
               `Retry complete. ${retriedSuccessCount} of ${originalFailedCount} URLs successfully retried. (Remaining Failed: ${finalFailedCount}, Time: ${totalTimeTaken}s)`
           );
           setTimeout(() => UI.utils.showStatus("", false, 1), 3000); // Clear after delay
       } else {
            // If retry was paused, stats/message updated within processCaptureQueue end
            console.log("Retry process was paused.");
       }

    } catch (error) {
      // Catch setup errors for retry
      handleError(error, { logToConsole: true, showToUser: true });
      AppState.failedUrls = urlsToRetry; // Restore original failed list on setup error
      UI.progress.updateProgressMessage("Retry failed due to setup error.");
      this._processingQueue = false; // Ensure flag is cleared on setup error
    } finally {
       // Final state updates after retry finishes or pauses
        const isFinished = this.currentCaptureIndex >= this.captureQueue.length;
       if (!this.isPaused && isFinished) { // Clear processing flag only if fully finished and not paused
            this._processingQueue = false;
       }
       this._checkCaptureButtonState(); // Update capture button
       UI.elements.retryFailedBtn.disabled = this._processingQueue || AppState.failedUrls.length === 0; // Update retry button
       this.updatePauseResumeButton(); // Update pause/resume button state
       // Ensure PDF button state is correct
        if (AppState.screenshots.size > 0) {
            const combineAllPdfBtn = document.querySelector(".combine-all-pdf-btn");
            if (combineAllPdfBtn) {
                combineAllPdfBtn.style.display = "inline-block";
                combineAllPdfBtn.disabled = false;
            }
        }
    }
  } // End retryFailedUrls


  createPauseResumeButton() {
    const buttonContainer = UI.elements.buttonContainer;
    if (!buttonContainer) return;

    const existingBtn = document.getElementById("pauseResumeBtn");
    if (existingBtn) return; // Avoid creating multiple if already exists

    const pauseResumeBtn = document.createElement("button");
    pauseResumeBtn.id = "pauseResumeBtn";
    pauseResumeBtn.className = "btn icon-btn pause-resume-btn"; // Add icon-btn class
    pauseResumeBtn.innerHTML = "⏸️"; // Initial icon: Pause
    pauseResumeBtn.title = "Pause capture"; // Initial title
    pauseResumeBtn.addEventListener("click", this.pauseResumeCapture);

    const captureBtn = UI.elements.captureBtn;
    const retryBtn = UI.elements.retryFailedBtn;

    // Insert after capture button but before retry button
    if (captureBtn && retryBtn && buttonContainer.contains(captureBtn) && buttonContainer.contains(retryBtn)) {
      buttonContainer.insertBefore(pauseResumeBtn, retryBtn);
    } else if (captureBtn && buttonContainer.contains(captureBtn)) {
      captureBtn.insertAdjacentElement("afterend", pauseResumeBtn);
    } else { // Fallback
      buttonContainer.appendChild(pauseResumeBtn);
      if (retryBtn && buttonContainer.contains(retryBtn)) {
        buttonContainer.appendChild(retryBtn); // Ensure retry is last
      }
    }

    pauseResumeBtn.disabled = true; // Initially disabled
  } // End createPauseResumeButton


  pauseResumeCapture() {
    this.isPaused = !this.isPaused; // Toggle pause state

    if (!this.isPaused) {
        // --- RESUMING ---
        // Clear any persistent pause messages first
        UI.utils.showStatus("", false, 1); // Clear status immediately

        // Check if there are items left and if not already processing
        if (this.currentCaptureIndex < this.captureQueue.length && !this._processingQueue) {
            UI.utils.showStatus( // Show resuming message temporarily
                `Capture resuming from URL ${this.currentCaptureIndex + 1} of ${this.captureQueue.length}`,
                false, 3000 // Auto-hide resume message
            );
            this._processingQueue = true; // Set flag *before* calling process
            this.updatePauseResumeButton(); // Update button state immediately
            this.processCaptureQueue(); // Start processing again
        } else if (this._processingQueue) {
             console.log("Resume clicked but queue is already processing.");
              // Update button state just in case
              this.updatePauseResumeButton();
        } else {
             console.log("Resume clicked, but queue is empty or finished.");
             this._processingQueue = false; // Ensure flag is false
              this.updatePauseResumeButton(); // Update button state
        }
    } else {
      // --- PAUSING ---
      // Status message is now set within processCaptureQueue when it breaks
      console.log("Pause requested.");
      // The processCaptureQueue loop will detect this flag and stop
       this.updatePauseResumeButton(); // Update button state immediately
    }
  } // End pauseResumeCapture


  // Updates the Pause/Resume button's icon, title, and disabled state
  updatePauseResumeButton() {
    const pauseResumeBtn = document.getElementById("pauseResumeBtn");
    if (!pauseResumeBtn) return;

    const hasItemsToProcess = this.currentCaptureIndex < this.captureQueue.length;

    if (this.isPaused) {
        pauseResumeBtn.innerHTML = "▶️"; // Play icon
        pauseResumeBtn.title = "Resume capture";
        pauseResumeBtn.classList.add("paused");
        // Enable resume ONLY if there are items left to process
        pauseResumeBtn.disabled = !hasItemsToProcess;
    } else {
        pauseResumeBtn.innerHTML = "⏸️"; // Pause icon
        pauseResumeBtn.title = "Pause capture";
        pauseResumeBtn.classList.remove("paused");
        // Disable pause button if not currently processing OR if there are no items left
        pauseResumeBtn.disabled = !this._processingQueue || !hasItemsToProcess;
    }
  } // End updatePauseResumeButton


} // End App Class

export default App;