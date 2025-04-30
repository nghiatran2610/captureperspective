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
    // const defaultLoginOptionRadio = document.getElementById("optionLogin"); // No longer checking default

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

      // --- Initialization now waits for explicit user selection ---
    } else {
      // If no valid prefilled URL, ensure options are disabled
      this._disableLoginOptions();
      const statusElement = document.getElementById("baseUrlStatus");
      if (statusElement && baseUrlInput && baseUrlInput.value) {
        // Show error only if there was input
        statusElement.textContent =
          "Initial Base URL invalid. Please check format.";
        statusElement.style.color = "red";
      }
    }

    console.log("Application initialized.");
  }

  _handleBaseUrlInput(event) {
    const url = event.target.value.trim();
    const statusElement = document.getElementById("baseUrlStatus");
    const loginOptionSection = document.getElementById("loginOptionSection");
    if (statusElement) statusElement.textContent = "";
    if (!loginOptionSection) {
      console.error("#loginOptionSection element not found!");
      return;
    }

    if (!url) {
      this.baseUrlValid = false;
      this.baseUrl = "";
      if (statusElement) statusElement.textContent = "";
      loginOptionSection.style.display = "none";
      urlFetcher.projectName = "";
      this._disableLoginOptions();
      if (UI.elements.captureForm)
        UI.elements.captureForm.style.display = "none";
      if (document.getElementById("loginSection"))
        document.getElementById("loginSection").style.display = "none";
      if (UI.elements.progressOutput)
        UI.elements.progressOutput.style.display = "none";
      return;
    }
    if (!url.includes("/client/")) {
      this.baseUrlValid = false;
      this.baseUrl = url;
      if (statusElement) {
        statusElement.textContent =
          "Invalid format. Expected .../client/PROJECT_NAME";
        statusElement.style.color = "red";
      }
      loginOptionSection.style.display = "none";
      urlFetcher.projectName = "";
      this._disableLoginOptions();
      return;
    }
    const success = urlFetcher.setBaseClientUrl(url);
    if (success) {
      this.baseUrl = urlFetcher.baseClientUrl;
      this.baseUrlValid = true;

      console.log("Base URL valid, attempting to show login options...");
      loginOptionSection.style.display = "block";
      console.log("Login options display style set to block.");
      this._enableLoginOptions();
      // --- Flow now waits for explicit user selection via LOGIN_OPTION_SELECTED event ---
      // Ensure dependent sections (login, capture form) are hidden initially after URL validation
      if (document.getElementById("loginSection")) {
          document.getElementById("loginSection").style.display = "none";
      }
      if (UI.elements.captureForm) {
          UI.elements.captureForm.style.display = "none";
      }
      if (UI.elements.progressOutput) {
           UI.elements.progressOutput.style.display = "none";
      }
      // --- End Wait ---
    } else {
      this.baseUrlValid = false;
      this.baseUrl = url;
      if (statusElement) {
        statusElement.textContent =
          "Could not extract project name. Check format.";
        statusElement.style.color = "red";
      }
      loginOptionSection.style.display = "none";
      urlFetcher.projectName = "";
      this._disableLoginOptions();
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
      this._disableLoginOptions(); // Disable and uncheck radio buttons
      // Also hide subsequent sections
        if (document.getElementById("loginSection")) {
          document.getElementById("loginSection").style.display = "none";
        }
        if (UI.elements.captureForm) {
          UI.elements.captureForm.style.display = "none";
        }
        if (UI.elements.progressOutput) {
          UI.elements.progressOutput.style.display = "none";
        }
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
      this._disableLoginOptions(); // Disable and uncheck radio buttons
       // Also hide subsequent sections
        if (document.getElementById("loginSection")) {
          document.getElementById("loginSection").style.display = "none";
        }
        if (UI.elements.captureForm) {
          UI.elements.captureForm.style.display = "none";
        }
        if (UI.elements.progressOutput) {
          UI.elements.progressOutput.style.display = "none";
        }
      return;
    }

    // Attempt to set in URL Fetcher (this also extracts project name)
    const success = urlFetcher.setBaseClientUrl(url);

    if (success) {
      this.baseUrl = urlFetcher.baseClientUrl; // Store the potentially cleaned URL
      this.baseUrlValid = true;

      // Show the Login Option section - TRY WITH !important
      console.log(
        "Base URL valid, attempting to show login options with !important..."
      ); // Add log
      loginOptionSection.style.setProperty("display", "block", "important"); // Use setProperty
      console.log("Login options display style set to block !important."); // Add log
      this._enableLoginOptions(); // Enable radio buttons

       // --- Flow now waits for explicit user selection via LOGIN_OPTION_SELECTED event ---
       // Ensure dependent sections (login, capture form) are hidden initially after URL validation
       if (document.getElementById("loginSection")) {
           document.getElementById("loginSection").style.display = "none";
       }
       if (UI.elements.captureForm) {
           UI.elements.captureForm.style.display = "none";
       }
       if (UI.elements.progressOutput) {
            UI.elements.progressOutput.style.display = "none";
       }
       // --- End Wait ---

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
      this._disableLoginOptions(); // Disable and uncheck radio buttons
       // Also hide subsequent sections
        if (document.getElementById("loginSection")) {
          document.getElementById("loginSection").style.display = "none";
        }
        if (UI.elements.captureForm) {
          UI.elements.captureForm.style.display = "none";
        }
        if (UI.elements.progressOutput) {
          UI.elements.progressOutput.style.display = "none";
        }
    }
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
    // const progressOutput = UI.elements.progressOutput; // Get reference, but don't show yet
    const urlListTextarea = UI.elements.urlList; // The original textarea

    // Show the main capture form BUT NOT progress output yet
    if (captureForm) captureForm.style.display = "";
    // REMOVED: if (progressOutput) progressOutput.style.display = ""; // Don't show it here

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

    // Reset UI clears *content* but shouldn't affect container visibility by default
    UI.utils.resetUI();
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
    events.on(events.events.CAPTURE_PROGRESS, (data) =>
      UI.progress.updateProgressMessage(data.message)
    );
    events.on(events.events.SCREENSHOT_TAKEN, (data) => {
      // --- MODIFIED: Construct description based on full page status ---
      const presetName = config.screenshot.presets[data.result?.preset]?.name || data.result?.preset || 'N/A';
      const width = data.result?.width || "?";
      const height = data.result?.height || "?";
      const timeTaken = data.result?.timeTaken || "?";
      const isFullPage = data.result?.isFullPage || false; // Assumes this property is added in core.js
      const sizeDesc = isFullPage ? `Full Page (${width}x${height})` : `${presetName}`;

      UI.utils.showStatus(
        `✓ Screenshot captured: ${data.url} (${sizeDesc}) (Time: ${timeTaken}s)`,
        false,
        5000
      );
      // --- END MODIFICATION ---
    });


    events.on("CONTEXT_ACTIONS_GENERATED", () => {
      /* ... advanced mode only ... */
    });

    events.on("URL_SELECTION_CHANGED", (data) => {
      if (this.currentMode === "simple" && !this._processingQueue) {
        UI.elements.captureBtn.disabled = data.count === 0;
      }
    });

    // Login Option Selected
    events.on("LOGIN_OPTION_SELECTED", (data) => {
      console.log("LOGIN_OPTION_SELECTED event received:", data);
      if (!this.baseUrlValid) {
        // Should not happen if radios are disabled correctly, but double-check
        console.warn("Login option selected, but Base URL is not valid.");
        return;
      }

      // Let handler manage login section visibility AND trigger login process if 'login' selected
      this.loginHandler.handleLoginOptionChange(data.option);

      // Hide the other dependent sections initially when an option is FIRST selected
      // The LOGIN_COMPLETE handler will show the capture form later if login is successful.
      if (data.option === "login") {
           if (UI.elements.captureForm) {
               UI.elements.captureForm.style.display = "none";
           }
           if (UI.elements.progressOutput) {
               UI.elements.progressOutput.style.display = "none";
           }
      }

      // Show capture form and fetch URLs ONLY if 'Continue without login' is chosen
      if (data.option === "continueWithoutLogin") {
        console.log(
          "Continue without login chosen by user, showing capture form and fetching URLs."
        );
        // Ensure login section is hidden if user switches TO this option
        if (document.getElementById("loginSection")) {
            document.getElementById("loginSection").style.display = "none";
        }
        this._updateUIMode(); // Show UI elements for capture
        this._initiateUrlFetching(); // Fetch URLs
      }
      // If 'login' is selected, the flow now waits for LOGIN_COMPLETE event.
    });

    // Login Process Complete
    events.on("LOGIN_COMPLETE", (data) => {
      console.log("LOGIN_COMPLETE event received:", data);
      // **** Show capture form ONLY if login was successful ****
      if (data.loggedIn) {
        console.log(
          "Login successful, showing capture form and fetching URLs."
        );
        this._updateUIMode(); // Show UI elements for capture
        this._initiateUrlFetching(); // Fetch URLs
      } else {
        // If login failed, keep capture form hidden.
        console.log("Login was not successful or was skipped.");
        if (
          this.loginHandler.selectedLoginOption === "login" &&
          !data.loggedIn
        ) {
          UI.utils.showStatus(
            "Login failed. Select 'Continue without login' or try again.",
            true
          );
          if (UI.elements.captureForm)
            UI.elements.captureForm.style.display = "none";
          if (UI.elements.progressOutput)
            UI.elements.progressOutput.style.display = "none";
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
    // --- Add this at the beginning ---
    const progressOutput = UI.elements.progressOutput;
    if (progressOutput) {
      console.log("Making progressOutput visible");
      progressOutput.style.display = ""; // Or 'block' - make it visible now
    } else {
      console.error("Progress output element not found!");
    }
    // --- End Add ---

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
      // Hide progress output again if prerequisites fail
      if (progressOutput) progressOutput.style.display = "none";
      return;
    }
    // Ensure base URL is valid before proceeding
    if (!this.baseUrlValid) {
      UI.utils.showStatus("Please enter and validate a Base URL first.", true);
      // Hide progress output again if prerequisites fail
      if (progressOutput) progressOutput.style.display = "none";
      return;
    }

    const startTotalTime = performance.now();
    let urlList = []; // Initialize urlList

    try {
      AppState.reset();
      UI.utils.resetUI(); // Reset content within progressOutput etc. FIRST
      this.usingActionSequences = false; // Always false in simple mode

      // Now that progressOutput is visible, ensure thumbnail container exists inside it
      if (!UI.elements.liveThumbnails) {
        UI.thumbnails.createLiveThumbnailsContainer();
      } else {
        const contentSection =
          UI.elements.thumbnailsContent ||
          UI.elements.liveThumbnails.querySelector(".thumbnails-content");
        if (contentSection) contentSection.innerHTML = ""; // Clear existing thumbs
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

      // --- MODIFIED: Read preset and full page checkbox ---
      const capturePreset = UI.elements.capturePreset.value || "fullHD";
      const fullPageCheckbox = document.getElementById("fullPageCheckbox");
      const captureFullPage = fullPageCheckbox ? fullPageCheckbox.checked : false;
      // --- END MODIFICATION ---

      let actionSequences = []; // Remains empty in simple mode
      this.usingActionSequences = false;

      // Get URLs from the selector
      if (typeof urlSelector.getSelectedUrlsForCapture === "function") {
        urlList = urlSelector.getSelectedUrlsForCapture();
      } else {
          throw new Error("URL Selector component not available.");
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
         UI.elements.waitTime.value = simpleWaitTimeEl.value; // Sync value
         console.log("Using Wait Time:", UI.elements.waitTime.value);
      } else {
         console.error("Wait time input field not found!");
         UI.elements.waitTime.value = config.ui.defaultWaitTime || 5;
      }

      UI.progress.updateStats(urlList.length, 0, 0, 0);
      UI.elements.captureBtn.disabled = true;
      UI.elements.retryFailedBtn.disabled = true;

      const pauseResumeBtn = document.getElementById("pauseResumeBtn");
      if (pauseResumeBtn) pauseResumeBtn.disabled = false;

      // --- MODIFIED: Add captureFullPage to queue items ---
      this.captureQueue = urlList.map((url, index) => ({
        url,
        index,
        capturePreset,
        captureFullPage, // Add the checkbox state
        actionSequences: [], // Still empty for simple mode
      }));
      // --- END MODIFICATION ---

      this.currentCaptureIndex = 0;

      this._processingQueue = true;
      await this.processCaptureQueue(); // Await the processing
    } catch (error) {
      handleError(error, { logToConsole: true, showToUser: true });
      this._processingQueue = false; // Ensure flag is cleared on setup error
      // Leave progressOutput visible to show error status
    } finally {
      // This block executes regardless of whether an error occurred in the try block
      // It might execute even if processCaptureQueue is still technically running asynchronously if not awaited correctly
      // Ensure processing flag is cleared reliably
      // this._processingQueue = false; // Moved clearing this flag inside processCaptureQueue completion/pause

      const endTotalTime = performance.now();
      const totalTimeTaken = ((endTotalTime - startTotalTime) / 1000).toFixed(2);

      // Update final stats using AppState
      UI.progress.updateStats(
        AppState.orderedUrls.length + AppState.failedUrls.length, // Total attempted
        AppState.screenshots.size, // Successful
        AppState.failedUrls.length, // Failed
        totalTimeTaken
      );

      // Update button states after completion or if an error occurred during setup
      if (!this._processingQueue) { // Only update buttons if queue is not running (or paused)
        UI.elements.captureBtn.disabled = urlSelector.selectedUrls.size === 0;
        UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;
         const pauseResumeBtn = document.getElementById("pauseResumeBtn");
         if (pauseResumeBtn) pauseResumeBtn.disabled = true; // Disable pause/resume once complete
      }
       // Show the combine PDF button if there are successful screenshots
      if (AppState.screenshots.size > 0) {
           const combineAllPdfBtn = UI.elements.liveThumbnails?.querySelector(".combine-all-pdf-btn");
           if (combineAllPdfBtn) {
               combineAllPdfBtn.style.display = "inline-block";
               combineAllPdfBtn.disabled = false;
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
      // --- MODIFIED: Destructure captureFullPage ---
      const { url, index, capturePreset, captureFullPage, actionSequences } = item;
      // --- END MODIFICATION ---

      UI.progress.updateProgressMessage(
        `Processing ${this.currentCaptureIndex + 1} of ${totalUrls}: ${url}`
      );

      try {
        // Simple mode processing (single screenshot per URL)
        // No need to check this.usingActionSequences as it's always false
        try {
          console.log(`Taking simple screenshot for URL: ${url} (Preset: ${capturePreset}, FullPage: ${captureFullPage})`);
          // --- MODIFIED: Pass captureFullPage to takeScreenshot ---
          const result = await ScreenshotCapture.takeScreenshot(
            url,
            capturePreset,
            captureFullPage, // Pass the boolean flag
            actionSequences // Pass empty actions array
          );
          // --- END MODIFICATION ---

          // Generate filename with timestamp
          const timestamp = URLProcessor.getTimestamp();
          let baseFileName = URLProcessor.generateFilename(url, index, ""); // No regex pattern
          // Add suffix if full page was captured
          const fullPageSuffix = captureFullPage ? "_FullPage" : "";
          const fileName = baseFileName.replace(".png", `${fullPageSuffix}_${timestamp}.png`);


          result.fileName = fileName; // Add filename to result object

          // Add thumbnail for the single screenshot
          UI.thumbnails.addLiveThumbnail(result, fileName);
          AppState.addScreenshot(url, result); // Mark URL as successful
          AppState.removeFailedUrl(url); // Ensure it's removed from failed list if it was retried
        } catch (error) {
          // Handle errors specific to single screenshot capture
          console.error(`Error capturing simple screenshot for ${url}:`, error);

          const timestamp = URLProcessor.getTimestamp(); // Generate timestamp for error filename
          let baseFileName = URLProcessor.generateFilename(url, index, "");
          const fullPageSuffix = captureFullPage ? "_FullPage" : ""; // Include suffix even for errors
          const fileName = baseFileName.replace(".png", `${fullPageSuffix}_Error_${timestamp}.png`);


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
          totalUrls, // Total URLs being processed in this run
          AppState.screenshots.size, // Current total successful
          AppState.failedUrls.length, // Current total failed
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
      UI.progress.updateProgressMessage(`Capture complete. Processed ${totalUrls} pages.`);
      this._processingQueue = false; // Clear flag on completion
      // Final updates are handled in the main captureScreenshots finally block
    } else if (this.isPaused) {
      console.log("Queue processing paused.");
      // Keep processing flag true while paused
    }

    // Update button states based on final status
    this._checkCaptureButtonState(); // Update capture button based on pause/completion and selection
    UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;

    // Ensure pause/resume button state is correct after processing loop iteration
     this.updatePauseResumeButton(); // Call consolidated update logic

  } // End processCaptureQueue

  async retryFailedUrls() {
    // Prevent starting retry if already processing
    if (this._processingQueue) {
      console.log("Retry or Capture already in progress.");
      UI.utils.showStatus("Process already running.", false, 3000);
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
    let urlsToRetry = [...AppState.failedUrls]; // Copy the list
    let originalFailedCount = urlsToRetry.length;
    let initialSuccessCount = AppState.screenshots.size; // Success count *before* retry

    // --- Reset state for retry ---
    this._processingQueue = true; // Set processing flag for retry
    this.isPaused = false; // Ensure not paused at start of retry

    // --- MODIFIED: Read preset and checkbox for retry ---
    const capturePreset = UI.elements.capturePreset.value || "fullHD";
    const fullPageCheckbox = document.getElementById("fullPageCheckbox");
    const captureFullPage = fullPageCheckbox ? fullPageCheckbox.checked : false;
    // --- END MODIFICATION ---

    this.captureQueue = urlsToRetry.map((url, index) => ({ // Create a queue for retry items
        url,
        index: index, // Use retry index, original index isn't critical here
        capturePreset,
        captureFullPage, // Add checkbox state
        actionSequences: [],
      }));
    this.currentCaptureIndex = 0;
    // --- End Reset state ---

    try {
      this.usingActionSequences = false; // Always false in simple mode retry

      // Ensure correct wait time is used during retry
      const simpleWaitTimeEl = document.getElementById("simpleWaitTime");
      if (simpleWaitTimeEl && UI.elements.waitTime) {
        UI.elements.waitTime.value = simpleWaitTimeEl.value;
        console.log("Using Wait Time for Retry:", UI.elements.waitTime.value);
      } else {
        console.error("Wait time input field not found for retry!");
        UI.elements.waitTime.value = config.ui.defaultWaitTime || 5;
      }

       // Clear only the failed URLs from the *state* before starting retry process
       AppState.failedUrls = [];

      UI.progress.updateProgressMessage(
        `Retrying ${urlsToRetry.length} failed URLs...`
      );
      UI.elements.progressBar.style.width = "0%"; // Reset progress bar for retry
      UI.elements.retryFailedBtn.disabled = true; // Disable while retrying
      UI.elements.captureBtn.disabled = true; // Also disable main capture button

      // Update pause/resume button for retry process
      this.updatePauseResumeButton(); // Should be enabled now if queue has items

      // Process the retry queue (this will handle pause/resume internally)
      await this.processCaptureQueue(); // Reuse the queue processing logic

      // --- Post-Retry Processing ---
      const endTotalTime = performance.now();
      const totalTimeTaken = ((endTotalTime - startTotalTime) / 1000).toFixed(2);
      const finalSuccessCount = AppState.screenshots.size; // Success count *after* retry
      const finalFailedCount = AppState.failedUrls.length; // Failed URLs *after* retry attempt
      const retriedSuccessCount = finalSuccessCount - initialSuccessCount; // How many succeeded during retry
      const totalAttempted = initialSuccessCount + originalFailedCount; // Initial success + original failures = total pages considered

       // Update final stats
       UI.progress.updateStats(
           totalAttempted,
           finalSuccessCount,
           finalFailedCount,
           totalTimeTaken
       );

       // Update final message based on retry results
       if (this.isPaused) {
           UI.progress.updateProgressMessage(
               `Retry paused. ${retriedSuccessCount} of ${originalFailedCount} URLs retried successfully so far.`
           );
       } else {
           UI.progress.updateProgressMessage(
               `Retry complete. ${retriedSuccessCount} of ${originalFailedCount} URLs successfully retried. (Remaining Failed: ${finalFailedCount}, Time: ${totalTimeTaken}s)`
           );
       }

    } catch (error) {
      // Catch setup errors for retry
      handleError(error, { logToConsole: true, showToUser: true });
      // Restore original failed URLs if setup failed before clearing
      if (AppState.failedUrls.length === 0) { // Check if it was cleared
           AppState.failedUrls = urlsToRetry; // Restore original list
      }
      UI.progress.updateProgressMessage("Retry failed due to setup error.");
      this._processingQueue = false; // Ensure flag is cleared on setup error
    } finally {
      // This block runs after retry completes or pauses or errors
      if (!this.isPaused) {
          this._processingQueue = false; // Clear processing flag only if not paused
      }
      // Update buttons based on final state
      this._checkCaptureButtonState();
      UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;
      this.updatePauseResumeButton(); // Update pause/resume button state
       // Ensure PDF button state is correct
        if (AppState.screenshots.size > 0) {
            const combineAllPdfBtn = UI.elements.liveThumbnails?.querySelector(".combine-all-pdf-btn");
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
       this._processingQueue = true; // Set flag before starting
      this.processCaptureQueue(); // Start processing again
    } else if (this.isPaused) {
      // We just paused
      UI.utils.showStatus(
        'Capture paused. Click "Resume" to continue.',
        false,
        0
      ); // Keep message visible
      // Don't clear processing flag here, allows resume logic to work
    } else {
      // Attempted to resume but queue is empty or finished
      console.log("Resume clicked, but queue is empty or finished.");
      this.isPaused = false; // Ensure not stuck in paused state
      this._processingQueue = false; // Clear flag if queue finished
    }

    this.updatePauseResumeButton();
  }

  updatePauseResumeButton() {
    const pauseResumeBtn = document.getElementById("pauseResumeBtn");
    if (!pauseResumeBtn) return;

    const hasItemsToProcess = this.currentCaptureIndex < this.captureQueue.length;

    if (this.isPaused) {
        pauseResumeBtn.textContent = "Resume";
        pauseResumeBtn.classList.add("paused");
        pauseResumeBtn.title = "Resume capture";
        pauseResumeBtn.disabled = false; // Always enable resume when paused
    } else {
        pauseResumeBtn.textContent = "Pause";
        pauseResumeBtn.classList.remove("paused");
        pauseResumeBtn.title = "Pause capture";
        // Disable pause button if not currently processing OR if there are no items left
        pauseResumeBtn.disabled = !this._processingQueue || !hasItemsToProcess;
    }
  }

} // End App Class

export default App;