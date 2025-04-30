// js/app.js
import config from "./config.js";
import AppState from "./state.js";
import UI from "./ui/index.js";
import URLProcessor from "./url-processor.js";
import * as ScreenshotCapture from "./screenshot/core.js";
import ContextMenuActionsHelper from "./context-menu-actions-helper.js"; // Unused but keep import
import * as events from "./events.js";
import { handleError, ScreenshotError, URLProcessingError, AppError } from "./errors.js";
import urlSelector from "./ui/url-selector.js";
import LoginHandler from "./login-handler.js";
import urlFetcher from "./url-fetcher.js";

class App {
  constructor() {
    this.currentMode = "simple";
    this.captureScreenshots = this.captureScreenshots.bind(this);
    // this.retryFailedUrls = this.retryFailedUrls.bind(this); // REMOVED
    this._handleActionsInput = this._handleActionsInput.bind(this);
    this.generatePrefilledUrl = this.generatePrefilledUrl.bind(this);
    this.prefilledUrl = null;
    this.baseUrl = "";
    this.baseUrlValid = false;
    this.loginHandler = LoginHandler;

    this.isPaused = false;
    this.captureQueue = [];
    this.currentCaptureIndex = 0;
    this.pauseResumeCapture = this.pauseResumeCapture.bind(this);
    this._handleBaseUrlInput = this._handleBaseUrlInput.bind(this);
    this._initiateUrlFetching = this._initiateUrlFetching.bind(this);
    this._processingQueue = false;
    this.startTotalTime = 0;
    this._toggleCaptureSettings = this._toggleCaptureSettings.bind(this); // Add binding for new method
  }

  initialize() {
    this.prefilledUrl = this.generatePrefilledUrl();
    this._setupEventListeners();
    this._initializeUI();
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

    if (baseUrlSection) baseUrlSection.style.display = "";
    if (loginOptionSection) loginOptionSection.style.display = "none";
    if (loginSection) loginSection.style.display = "none";
    if (captureForm) captureForm.style.display = "none";
    if (progressOutput) progressOutput.style.display = "none";

    let isValidOnLoad = false;
    if (baseUrlInput && baseUrlInput.value) {
      isValidOnLoad = urlFetcher.setBaseClientUrl(baseUrlInput.value);
      this.baseUrlValid = isValidOnLoad;
      this.baseUrl = isValidOnLoad ? urlFetcher.baseClientUrl : baseUrlInput.value;
    }

    if (isValidOnLoad) {
      this._enableLoginOptions();
      if (loginOptionSection) loginOptionSection.style.display = "block";
      const statusElement = document.getElementById("baseUrlStatus");
      if(statusElement) statusElement.textContent = "Base URL seems valid.";
    } else {
      this._disableLoginOptions();
      const statusElement = document.getElementById("baseUrlStatus");
      if (statusElement && baseUrlInput && baseUrlInput.value) {
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


    if (statusElement) { statusElement.textContent = ""; statusElement.style.color = ""; }
    if (!loginOptionSection || !loginSection || !captureForm || !progressOutput) {
      console.error("One or more required sections not found!"); return;
    }


    if (!url || !url.includes("/client/")) {
      this.baseUrlValid = false; this.baseUrl = url;
      if (statusElement) {
          if (url && !url.includes("/client/")) {
             statusElement.textContent = "Invalid format. Expected .../client/PROJECT_NAME"; statusElement.style.color = "red";
          } else { statusElement.textContent = ""; }
      }
      loginOptionSection.style.display = "none"; loginSection.style.display = "none"; captureForm.style.display = "none"; progressOutput.style.display = "none";
      urlFetcher.projectName = ""; this._disableLoginOptions();
      return;
    }


    const success = urlFetcher.setBaseClientUrl(url);
    if (success) {
      this.baseUrl = urlFetcher.baseClientUrl; this.baseUrlValid = true;
      if (statusElement) { statusElement.textContent = "Base URL looks valid."; statusElement.style.color = "green"; }
      loginOptionSection.style.display = "block"; this._enableLoginOptions();
      loginSection.style.display = "none"; captureForm.style.display = "none"; progressOutput.style.display = "none";
    } else {
      this.baseUrlValid = false; this.baseUrl = url;
      if (statusElement) { statusElement.textContent = "Could not extract project name. Check format."; statusElement.style.color = "red"; }
      loginOptionSection.style.display = "none"; loginSection.style.display = "none"; captureForm.style.display = "none"; progressOutput.style.display = "none";
      urlFetcher.projectName = ""; this._disableLoginOptions();
    }
  }


  _setupEventListeners() {
    const baseUrlInput = document.getElementById("baseUrlInput");
    if (baseUrlInput) {
      baseUrlInput.value = this.prefilledUrl || "";
      if (baseUrlInput.value) { this._handleBaseUrlInput({ target: baseUrlInput }); }
      events.addDOMEventListener(baseUrlInput, "blur", this._handleBaseUrlInput);
      events.addDOMEventListener(baseUrlInput, "input", this._handleBaseUrlInput);
    } else { console.error("#baseUrlInput not found!"); }

    events.addDOMEventListener(UI.elements.captureBtn, "click", this.captureScreenshots);
    // REMOVED Listener for retry button

    if (UI.elements.actionsField) { // Keep for potential future use
      events.addDOMEventListener(UI.elements.actionsField, "input", this._handleActionsInput);
      events.addDOMEventListener(UI.elements.actionsField, "paste", () => setTimeout(() => this._handleActionsInput(), 0));
    }

    // --- ADDED: Event listener for collapsible header ---
    const titleHeader = UI.elements.urlInputTitle;
     if (titleHeader) {
         events.addDOMEventListener(titleHeader, "click", this._toggleCaptureSettings);
     } else {
          console.error("#urlInputTitle element not found for toggle listener.");
     }
     // --- END ADDED ---
  }

  _initializeUI() {
    if (UI.elements.waitTime) { UI.elements.waitTime.value = config.ui.defaultWaitTime || 5; }
    // No retry button to disable
    if (UI.elements.captureBtn) { UI.elements.captureBtn.disabled = true; }
    this.createPauseResumeButton(); // Creates pause button
     // Ensure settings content is expanded initially
     this._setCaptureSettingsCollapsed(false);
  }


  _disableLoginOptions() {
    const radios = document.querySelectorAll('input[name="loginOption"]');
    radios.forEach((radio) => { radio.disabled = true; radio.checked = false; });
  }
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
          const prefilledUrl = config.prefill.targetTemplate
                .replace('$1', match[1] || '')
                .replace('$2', match[2])
                .replace('$3', match[3]);
          console.log("Generated prefilled URL:", prefilledUrl);
          return prefilledUrl;
      } catch(e) {
          console.error("Error generating prefilled URL:", e);
          return config.prefill.fallbackUrl;
      }
    }
    console.log("URL pattern not matched, using fallback.");
    return config.prefill.fallbackUrl;
  }

  /** Updates UI for Simple Mode */
  _updateUIMode() {
    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");

    const captureForm = UI.elements.captureForm;
    const urlListTextarea = UI.elements.urlList;
    const advancedOptions = UI.elements.advancedOptions;

    if (captureForm) captureForm.style.display = "";
    if (urlListTextarea) urlListTextarea.style.display = "none"; // Replaced by selector
    if (advancedOptions) advancedOptions.style.display = "none"; // Hide advanced

    this._setupSimpleModeSettings(); // Add/ensure simple settings UI

    // Initialize URL selector if needed
    if (!document.getElementById("urlSelectorContainer")) {
      setTimeout(() => {
        urlSelector.initialize().catch((error) => {
          console.error("Failed to initialize URL selector:", error);
          if (typeof urlSelector.showFallbackUI === "function") urlSelector.showFallbackUI();
        });
      }, 0);
    }

    UI.utils.resetUI(); // Reset output areas
    this._checkCaptureButtonState();
    this._setCaptureSettingsCollapsed(false); // Ensure expanded when UI mode updates
  }

  /** Sets up simple mode wait time input */
  _setupSimpleModeSettings() {
    const parentElement = document.getElementById("url-input-container"); // Target card directly
    if (!parentElement) { console.error("#url-input-container not found."); return; }

    let simpleModeSettings = document.getElementById("simpleModeSetting");
    if (!simpleModeSettings) {
      simpleModeSettings = document.createElement("div");
      simpleModeSettings.id = "simpleModeSetting";
      simpleModeSettings.className = "simple-mode-settings"; // Use class for styling

      const waitTimeContainer = document.createElement("div");
      waitTimeContainer.className = "setting-container";
      const waitTimeLabel = document.createElement("label");
      waitTimeLabel.textContent = "Max Wait Time (sec):"; waitTimeLabel.htmlFor = "simpleWaitTime";
      waitTimeContainer.appendChild(waitTimeLabel);
      const simpleWaitTime = document.createElement("input");
      simpleWaitTime.type = "number"; simpleWaitTime.id = "simpleWaitTime"; simpleWaitTime.className = "wait-time-input";
      simpleWaitTime.min = "1"; simpleWaitTime.max = config.timing.maxWaitTime / 1000 || 120;
      simpleWaitTime.value = UI.elements.waitTime?.value || config.ui.defaultWaitTime || 5; // Sync initial value
      waitTimeContainer.appendChild(simpleWaitTime);
      simpleModeSettings.appendChild(waitTimeContainer);

      // Insert into the collapsible content wrapper
      const contentWrapper = document.getElementById("captureSettingsContent");
      if (contentWrapper) {
            contentWrapper.insertBefore(simpleModeSettings, contentWrapper.firstChild); // Add at the top
      } else {
           console.error("#captureSettingsContent not found for settings.");
            // Fallback: insert after header
            const titleElement = parentElement.querySelector("h2#urlInputTitle");
            if (titleElement) titleElement.insertAdjacentElement("afterend", simpleModeSettings);
            else parentElement.insertBefore(simpleModeSettings, parentElement.firstChild);
      }

    } else {
        simpleModeSettings.style.display = ""; // Ensure visible
        const simpleWaitTimeInput = document.getElementById("simpleWaitTime");
        if (simpleWaitTimeInput && UI.elements.waitTime) {
            simpleWaitTimeInput.value = UI.elements.waitTime.value;
        }
    }
  }

  _handleActionsInput() { /* No-op */ }

  /** Updates Capture button state */
  _checkCaptureButtonState() {
    const captureBtn = UI.elements.captureBtn;
    const buttonContainer = UI.elements.buttonContainer;
    if (!captureBtn || !buttonContainer) return;

    if (UI.elements.captureForm.style.display !== "none") {
      buttonContainer.style.display = ""; buttonContainer.classList.remove("hidden");
      captureBtn.style.display = ""; captureBtn.classList.remove("initially-hidden");
      captureBtn.disabled = this._processingQueue || urlSelector.selectedUrls.size === 0;
    } else {
      buttonContainer.style.display = "none"; buttonContainer.classList.add("hidden");
    }
  }

  _setupEventHandlers() {
    events.on(events.events.CAPTURE_PROGRESS, (data) => UI.progress.updateProgressMessage(data.message));
    events.on(events.events.SCREENSHOT_TAKEN, (data) => {
      const preset = data.result?.preset || "N/A";
       const presetName = config.screenshot.presets[preset]?.name || preset;
      const width = data.result?.width || "?"; const height = data.result?.height || "?";
      const timeTaken = data.result?.timeTaken || "?"; const isFullPage = data.result?.isFullPage || false;
      const sizeDesc = isFullPage ? `Full Page (${width}x${height})` : `${presetName}`;
      UI.utils.showStatus(`✓ Screenshot captured: ${data.url} (${sizeDesc}) (Time: ${timeTaken}s)`, false, 5000);
    });
    events.on("URL_SELECTION_CHANGED", (data) => {
      if (this.currentMode === "simple" && !this._processingQueue) {
        UI.elements.captureBtn.disabled = data.count === 0;
      }
    });
    events.on("LOGIN_OPTION_SELECTED", (data) => {
      if (!this.baseUrlValid) return;
      this.loginHandler.handleLoginOptionChange(data.option);
      if (data.option === "login") {
           if (UI.elements.captureForm) UI.elements.captureForm.style.display = "none";
           if (UI.elements.progressOutput) UI.elements.progressOutput.style.display = "none";
      }
      if (data.option === "continueWithoutLogin") {
        const loginSection = document.getElementById("loginSection");
        if (loginSection) loginSection.style.display = "none";
        this._updateUIMode(); this._initiateUrlFetching();
      }
    });
    events.on("LOGIN_COMPLETE", (data) => {
      if (data.loggedIn) {
        this._updateUIMode(); this._initiateUrlFetching();
      } else {
        if (this.loginHandler.selectedLoginOption === "login") {
          UI.utils.showStatus("Login failed. Select 'Continue without login' or try again.", true);
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
      if (urlSelector.container && typeof urlSelector.showFallbackUI === "function") {
         if (urlSelector.categoriesContainer) {
             urlSelector.categoriesContainer.innerHTML = `<div class="url-selector-error"><p>Failed to fetch pages. Base URL invalid.</p><p>Please correct the Base URL.</p></div>`;
         } else { urlSelector.showFallbackUI(); }
      }
      return;
    }
    if (!document.getElementById("urlSelectorContainer")) {
       await new Promise(resolve => setTimeout(resolve, 100));
        if (!document.getElementById("urlSelectorContainer")) {
           UI.utils.showStatus("URL Selector UI failed to initialize.", true); return;
        }
    }
    urlSelector.showLoadingState();
    try {
      await urlFetcher.loadUrls(); urlSelector.renderUrlCategories(urlFetcher.categorizedUrls);
      UI.elements.captureBtn.disabled = this._processingQueue || urlSelector.selectedUrls.size === 0;
    } catch (error) {
      handleError(error, { logToConsole: true, showToUser: true }); // Use central handler
      if (urlSelector.categoriesContainer) {
        urlSelector.categoriesContainer.innerHTML = `<div class="url-selector-error"><p>Failed to load pages: ${error.message}</p><p>Please check the Base URL and network connection.</p></div>`;
      } else if(typeof urlSelector.showFallbackUI === "function") { urlSelector.showFallbackUI(); }
      UI.elements.captureBtn.disabled = true;
    }
  } // End _initiateUrlFetching

  /** Starts the main screenshot capture process */
  async captureScreenshots() {
    const progressOutput = UI.elements.progressOutput;
    if (progressOutput) { progressOutput.style.display = ""; }
    else { console.error("Progress output element not found!"); }

    if (this._processingQueue) { UI.utils.showStatus("Capture is already in progress.", false, 3000); return; }
    if (!this.loginHandler.isAuthenticatedForCapture()) {
      UI.utils.showStatus("Please complete the login selection step first.", true);
      if (progressOutput) progressOutput.style.display = "none"; return;
    }
    if (!this.baseUrlValid) {
      UI.utils.showStatus("Please enter and validate a Base URL first.", true);
      if (progressOutput) progressOutput.style.display = "none"; return;
    }

    this.startTotalTime = performance.now();
    let urlList = [];

    try {
      AppState.reset();
      UI.utils.resetUI();
      this.usingActionSequences = false;
      this.isPaused = false;
      this.captureQueue = [];
      this.currentCaptureIndex = 0;
      this.updatePauseResumeButton();
      this._setCaptureSettingsCollapsed(true); // Collapse settings on start

      const capturePreset = UI.elements.capturePreset.value || "fullHD";
      const fullPageCheckbox = document.getElementById("fullPageCheckbox");
      const captureFullPage = fullPageCheckbox ? fullPageCheckbox.checked : false;

      // --- Lines attempting to set UI.elements.waitTime.value REMOVED ---

      if (typeof urlSelector.getSelectedUrlsForCapture === "function") {
        urlList = urlSelector.getSelectedUrlsForCapture();
      } else { throw new Error("URL Selector component not available."); }

      if (urlList.length === 0) {
        throw new URLProcessingError("Please select at least one page to capture.", "No URLs selected");
      }

      UI.progress.updateStats(urlList.length, 0, 0, 0);
      UI.elements.captureBtn.disabled = true;
      const pauseResumeBtn = document.getElementById("pauseResumeBtn");
      if (pauseResumeBtn) pauseResumeBtn.disabled = false;

      this.captureQueue = urlList.map((url, index) => ({
        url, index, capturePreset, captureFullPage, actionSequences: [],
      }));
      this.currentCaptureIndex = 0;

      this._processingQueue = true;
      await this.processCaptureQueue();

    } catch (error) {
       handleError(error, { logToConsole: true, showToUser: true });
       this._processingQueue = false;
       this._setCaptureSettingsCollapsed(false); // Expand on error
       this._checkCaptureButtonState(); this.updatePauseResumeButton();
    } finally {
        const isFinished = this.currentCaptureIndex >= this.captureQueue.length;
        const endTotalTime = performance.now();
        const totalTimeTaken = this.startTotalTime ? ((endTotalTime - this.startTotalTime) / 1000).toFixed(2) : "N/A";

        if (this.startTotalTime && isFinished) {
            UI.progress.updateStats( AppState.orderedUrls.length + AppState.failedUrls.length, AppState.screenshots.size, AppState.failedUrls.length, totalTimeTaken );
        }

        if (!this.isPaused && isFinished) {
             this._checkCaptureButtonState();
             this.updatePauseResumeButton();
             this._setCaptureSettingsCollapsed(false);
        } else if (!this.isPaused && !isFinished) {
             this._checkCaptureButtonState();
             this.updatePauseResumeButton();
             this._setCaptureSettingsCollapsed(false);
        } else if (this.isPaused) {
             this._setCaptureSettingsCollapsed(true);
             if(UI.elements.captureBtn) UI.elements.captureBtn.disabled = true;
        }

       const pdfBtnVisible = AppState.screenshots.size > 0;
       const combineAllPdfBtn = document.querySelector(".combine-all-pdf-btn");
       if (combineAllPdfBtn) {
            combineAllPdfBtn.style.display = pdfBtnVisible ? "inline-block" : "none";
            combineAllPdfBtn.disabled = !pdfBtnVisible;
       }
    }
  } // End captureScreenshots


  /** Processes the capture queue items */
  async processCaptureQueue() {
    if (this.isPaused || this.currentCaptureIndex >= this.captureQueue.length) {
      if(this.isPaused) this._processingQueue = false;
      return;
    }
    if (!this._processingQueue) { this._processingQueue = true; console.log("Starting/Resuming queue."); }

    const totalUrls = this.captureQueue.length;

    while (this.currentCaptureIndex < totalUrls) {
      if (this.isPaused) { console.log(`[Loop Start] Pause detected. Index: ${this.currentCaptureIndex}`); this._processingQueue = false; break; }

      const item = this.captureQueue[this.currentCaptureIndex];
      if (!item || !item.url) { console.error(`Invalid item at index ${this.currentCaptureIndex}`, item); this.currentCaptureIndex++; continue; }
      const { url, index, capturePreset, captureFullPage, actionSequences } = item;

      UI.progress.updateProgressMessage(`Processing ${this.currentCaptureIndex + 1} of ${totalUrls}: ${url}`);

      try {
        if (this.isPaused) { console.log(`[Pre-Capture Check] Pause detected for URL: ${url}. Breaking.`); this._processingQueue = false; break; }

        const result = await ScreenshotCapture.takeScreenshot(url, capturePreset, captureFullPage, actionSequences);

        if (this.isPaused) { console.log(`[Post-Capture Check] Pause detected for URL: ${url}. Breaking.`); this._processingQueue = false; break; }

        const timestamp = URLProcessor.getTimestamp();
        let baseFileName = URLProcessor.generateFilename(url, index, "");
        const fullPageSuffix = captureFullPage ? "_FullPage" : "";
        const fileName = baseFileName.replace(".png", `${fullPageSuffix}_${timestamp}.png`);
        result.fileName = fileName;
        UI.thumbnails.addLiveThumbnail(result, fileName);
        AppState.addScreenshot(url, result); AppState.removeFailedUrl(url);

      } catch (error) {
         if (this.isPaused) { console.log(`[Capture Error Check] Pause detected for URL: ${url}. Breaking.`); this._processingQueue = false; break; }
         handleError(error, { logToConsole: true, showToUser: false });
         const timestamp = URLProcessor.getTimestamp();
         let baseFileName = URLProcessor.generateFilename(url, index, "");
         const fullPageSuffix = captureFullPage ? "_FullPage" : "";
         const fileName = baseFileName.replace(".png", `${fullPageSuffix}_Error_${timestamp}.png`);
          if ( error instanceof AppError && (error.message.includes("No view configured") || error.message.includes("Mount definition")) ) {
              const errorResult = { error: true, errorMessage: error.message, sequenceName: url, url: error.url || url };
              UI.thumbnails.addLiveThumbnail( errorResult, fileName, url, false, false );
              UI.utils.showStatus(`✗ Failed: ${url} (Mount error)`, true); AppState.addFailedUrl(url);
          } else {
              const errorResult = { error: true, errorMessage: error.message, sequenceName: url, url: error.url || url };
              UI.thumbnails.addLiveThumbnail( errorResult, fileName, url, false, false );
              AppState.addFailedUrl(url); UI.utils.showStatus(`✗ Failed: ${url} (${error.message || 'Unknown error'})`, true);
          }
      }

      if (this.isPaused) { console.log(`[Post-Processing Check] Pause detected. Index: ${this.currentCaptureIndex}`); this._processingQueue = false; break; }

      UI.progress.updateProgress(this.currentCaptureIndex + 1, totalUrls);
      this.currentCaptureIndex++;

      if (this.currentCaptureIndex < totalUrls) {
          if(this.isPaused){ console.log(`[Pre-Delay Check] Pause detected. Index: ${this.currentCaptureIndex}`); this._processingQueue = false; break; }
          await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } // End while loop

    const isFinished = this.currentCaptureIndex >= totalUrls;
    if (isFinished) {
      console.log("Queue processing complete.");
      if (!this.isPaused) { UI.progress.updateProgressMessage(`Capture complete. Processed ${totalUrls} pages.`); setTimeout(() => UI.utils.showStatus("", false, 1), 3000); }
      this._processingQueue = false;
    } else if (this.isPaused) {
        console.log("Queue processing paused.");
        if (this._processingQueue) { this._processingQueue = false; }
         UI.utils.showStatus( `Capture paused. Click "Resume" to continue (next URL: ${this.currentCaptureIndex + 1} of ${totalUrls})`, false, 0 );
    } else {
       console.warn("Queue loop finished unexpectedly."); this._processingQueue = false;
    }

    this._checkCaptureButtonState();
    // No retry button update needed
    this.updatePauseResumeButton();

  } // End processCaptureQueue


  /** Creates the Pause/Resume button */
  createPauseResumeButton() {
    const buttonContainer = UI.elements.buttonContainer;
    if (!buttonContainer || document.getElementById("pauseResumeBtn")) return;

    const pauseResumeBtn = document.createElement("button");
    pauseResumeBtn.id = "pauseResumeBtn";
    pauseResumeBtn.className = "btn icon-btn pause-resume-btn";
    pauseResumeBtn.innerHTML = "⏸️"; pauseResumeBtn.title = "Pause capture";
    pauseResumeBtn.addEventListener("click", this.pauseResumeCapture);

    const captureBtn = UI.elements.captureBtn;
    // Insert after capture button
    if (captureBtn && buttonContainer.contains(captureBtn)) {
        captureBtn.insertAdjacentElement("afterend", pauseResumeBtn);
    } else { buttonContainer.appendChild(pauseResumeBtn); } // Fallback append

    pauseResumeBtn.disabled = true;
  } // End createPauseResumeButton


  /** Handles Pause/Resume button click */
  pauseResumeCapture() {
    this.isPaused = !this.isPaused;
    if (!this.isPaused) { // --- RESUMING ---
        UI.utils.showStatus("", false, 1); // Clear pause message
        if (this.currentCaptureIndex < this.captureQueue.length && !this._processingQueue) {
            UI.utils.showStatus( `Capture resuming from URL ${this.currentCaptureIndex + 1} of ${this.captureQueue.length}`, false, 3000 );
            this._processingQueue = true; this.updatePauseResumeButton();
            this.processCaptureQueue();
        } else {
             console.log("Resume clicked but queue finished or already processing.");
             this._processingQueue = this._processingQueue || false;
             this.updatePauseResumeButton();
        }
    } else { // --- PAUSING ---
      console.log("Pause requested.");
      this.updatePauseResumeButton();
    }
  } // End pauseResumeCapture


  /** Updates the Pause/Resume button state */
  updatePauseResumeButton() {
    const pauseResumeBtn = document.getElementById("pauseResumeBtn");
    if (!pauseResumeBtn) return;
    const hasItemsToProcess = this.currentCaptureIndex < this.captureQueue.length;
    if (this.isPaused) {
        pauseResumeBtn.innerHTML = "▶️"; pauseResumeBtn.title = "Resume capture"; pauseResumeBtn.classList.add("paused");
        pauseResumeBtn.disabled = !hasItemsToProcess;
    } else {
        pauseResumeBtn.innerHTML = "⏸️"; pauseResumeBtn.title = "Pause capture"; pauseResumeBtn.classList.remove("paused");
        pauseResumeBtn.disabled = !this._processingQueue || !hasItemsToProcess;
    }
  } // End updatePauseResumeButton


  /** Toggles the visibility of the capture settings section */
  _toggleCaptureSettings() {
      const content = document.getElementById("captureSettingsContent"); // Use ID directly
      const header = UI.elements.urlInputTitle;
      if (!content || !header) return;

      const isCollapsed = content.classList.toggle('collapsed');
      header.classList.toggle('collapsed', isCollapsed);
       const indicator = header.querySelector('.collapse-indicator');
       if(indicator) indicator.textContent = isCollapsed ? '►' : '▲';
  }

   /** Sets the collapsed state of the capture settings */
   _setCaptureSettingsCollapsed(collapsed) {
       const content = document.getElementById("captureSettingsContent");
       const header = UI.elements.urlInputTitle;
       if (!content || !header) return;

       // Only change if the state is different
       if (content.classList.contains('collapsed') !== collapsed) {
           content.classList.toggle('collapsed', collapsed);
           header.classList.toggle('collapsed', collapsed);
            const indicator = header.querySelector('.collapse-indicator');
            if(indicator) indicator.textContent = collapsed ? '►' : '▲';
       }
   }

   // --- retryFailedUrls FUNCTION REMOVED ---

} // End App Class

export default App;