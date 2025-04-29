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

class App {
  constructor() {
    this.currentMode = "simple"; // Default mode - fixed to simple
    this.captureScreenshots = this.captureScreenshots.bind(this);
    this.retryFailedUrls = this.retryFailedUrls.bind(this);
    this._handleModeChange = this._handleModeChange.bind(this);
    this._handleActionsInput = this._handleActionsInput.bind(this);
    this.generatePrefilledUrl = this.generatePrefilledUrl.bind(this);
    this.prefilledUrl = null;
    this.loginHandler = LoginHandler; // Use the imported singleton instance

    // Add new properties for pause/resume functionality
    this.isPaused = false;
    this.captureQueue = [];
    this.currentCaptureIndex = 0;
    this.pauseResumeCapture = this.pauseResumeCapture.bind(this);
  }

  initialize() {
    this.prefilledUrl = this.generatePrefilledUrl();
    this._setupEventListeners();
    this._initializeUI();
    this._setupEventHandlers();

    // Force simple mode classes
    document.body.classList.add("simple-mode");
    document.body.classList.remove("advanced-mode");

    // We still need this for compatibility, but it won't change the mode
    this._updateUIMode();

    // Initialize login handler - it will handle its own UI creation now
    this.loginHandler.initialize();

    // Initially hide the capture form and progress output until login option is selected
    UI.elements.captureForm.style.display = "none";
    UI.elements.progressOutput.style.display = "none";


    console.log("Application initialized with config:", config);
  }

  _setupEventListeners() {
    // Mode change listeners are still needed by LoginHandler, but App ignores them
    events.addDOMEventListener(
      UI.elements.modeAdvanced,
      "change",
      this._handleModeChange
    );
    events.addDOMEventListener(
      UI.elements.modeSimple,
      "change",
      this._handleModeChange
    );
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
     if (UI.elements.actionsField) {
        events.addDOMEventListener(
          UI.elements.actionsField,
          "input",
          this._handleActionsInput
        );

        // Also check for paste events
        events.addDOMEventListener(UI.elements.actionsField, "paste", () => {
          // Use setTimeout to ensure we check after the paste content is applied
          setTimeout(() => this._handleActionsInput(), 0);
        });
     }
  }

  _initializeUI() {
    if (UI.elements.waitTime) {
      UI.elements.waitTime.value = config.ui.defaultWaitTime || 5;
    }
    if (UI.elements.retryFailedBtn) {
      UI.elements.retryFailedBtn.disabled = true;
    }
    // captureForm and progressOutput are initially hidden
    this.createPauseResumeButton();
  }

  _handleModeChange(event) {
    // Always use simple mode, ignore the event from radio buttons
    this.currentMode = "simple";
    console.log("Mode is fixed to simple");
    // UI update is now triggered by login option selection via event
  }


  /**
   * Generates a prefilled URL value based on the current page URL
   * Converts URLs like http://localhost:8088/system/webdev/RF_Main_STG/perspective_capture/index.html
   * to http://localhost:8088/data/perspective/client/RF_Main_STG
   * @returns {string} The prefilled URL
   */
  generatePrefilledUrl() {
    const currentUrl = window.location.href;
    console.log("Current URL:", currentUrl);

    // Extract the relevant parts using regex
    // Updated regex to correctly capture host and webdev project name
    const regex = /http(s)?:\/\/([^\/]+)\/system\/webdev\/([^\/]+)/;
    const match = currentUrl.match(regex);

    if (match && match.length >= 4) {
      const protocol = match[1] ? "https" : "http";
      const host = match[2]; // Hostname or IP and optional port
      const webdevProjectName = match[3]; // The WebDev resource name (e.g., RF_Main_STG)

      // Construct the client URL format
      const prefilledUrl = `${protocol}://${host}/data/perspective/client/${webdevProjectName}`;
      console.log("Generated prefilled URL:", prefilledUrl);
      return prefilledUrl;
    }

    // Fallback: if pattern doesn't match, return a default URL or empty string
    console.log("URL pattern not matched, returning empty prefilled URL.");
    return "";
  }

  /**
   * Updates the UI based on the current mode and login state.
   * This is called after a login option is selected or login is complete.
   */
  _updateUIMode() {
      const body = document.body;
      const urlList = UI.elements.urlList;
      const advancedOptions = UI.elements.advancedOptions;
      const captureBtn = UI.elements.captureBtn;
      const urlHelpText = UI.elements.urlHelpText;
      const statsSection = UI.elements.stats;
      const advancedWaitTimeField = UI.elements.waitTime;
      const capturePreset = UI.elements.capturePreset;

      // Show the main capture form and progress area now
      UI.elements.captureForm.style.display = "";
      UI.elements.progressOutput.style.display = "";


      // Mode is fixed to simple, so only configure simple mode UI
      body.classList.add("simple-mode");
      body.classList.remove("advanced-mode");

      // Simple mode specific UI setup
      urlList.rows = 5;
      urlList.placeholder = "Enter URLs (one per line)";
      urlList.value = ""; // Clear any prefilled value
      UI.elements.urlInputTitle.textContent = "Select Pages to Capture";
      advancedOptions.style.display = "none";
      captureBtn.classList.remove("initially-hidden");
      captureBtn.disabled = true; // Disabled until URLs are selected

      // Show stats in simple mode
      if (statsSection) statsSection.style.display = "";

      if (urlHelpText) urlHelpText.style.display = "none";

      // Check if simple mode settings already exist to avoid duplication
      if (!document.getElementById("simpleModeSetting")) {
        // Create container for simple mode settings
        const simpleModeSettings = document.createElement("div");
        simpleModeSettings.id = "simpleModeSetting";
        simpleModeSettings.className = "simple-mode-settings";

        // Only create the wait time container, NOT a duplicate screen size selector
        const waitTimeContainer = document.createElement("div");
        waitTimeContainer.className = "setting-container";

        // Create label for wait time
        const waitTimeLabel = document.createElement("label");
        waitTimeLabel.textContent = "Max Wait Time (sec):";
        waitTimeLabel.htmlFor = "simpleWaitTime";
        waitTimeContainer.appendChild(waitTimeLabel);

        // Create separate wait time input for simple mode
        const simpleWaitTime = document.createElement("input");
        simpleWaitTime.type = "number";
        simpleWaitTime.id = "simpleWaitTime";
        simpleWaitTime.className = "wait-time-input";
        simpleWaitTime.min = "1";
        simpleWaitTime.max = "120";
        simpleWaitTime.value = config.ui.defaultWaitTime || 5;

        waitTimeContainer.appendChild(simpleWaitTime);
        simpleModeSettings.appendChild(waitTimeContainer);

        // Add settings container before the URL selection area
        const parentNode = urlList.parentNode;
        if (parentNode) {
          // Insert before the urlList or its replacement
          const referenceNode =
            document.getElementById("urlSelectorContainer") || urlList;
          parentNode.insertBefore(simpleModeSettings, referenceNode);
        }
      } else {
        // If settings already exist, just make sure they're visible
        document.getElementById("simpleModeSetting").style.display = "";
      }

      // Remove any input event listener for single URL enforcement
      if (urlList._singleUrlListener) {
        urlList.removeEventListener("input", urlList._singleUrlListener);
        delete urlList._singleUrlListener;
      }

      // Initialize URL selector now that capture form is visible
      setTimeout(() => {
        urlSelector.initialize().catch((error) => {
          console.error("Failed to initialize URL selector:", error);
          // Handle URL selector initialization failure - maybe show the manual textarea
          if (typeof urlSelector.showFallbackUI === 'function') {
               urlSelector.showFallbackUI();
          }
        });
      }, 0);


    UI.utils.resetUI(); // Reset UI elements for a new capture session
    this._checkCaptureButtonState(); // Check button state after UI updates
  }


  _handleActionsInput() {
    // This function is primarily for Advanced Mode.
    // Since mode is fixed to simple, this listener doesn't need complex logic here.
    // The checkCaptureButtonState is called by the CONTEXT_ACTIONS_GENERATED event in Advanced mode.
    // In Simple mode, button state is managed by URL_SELECTION_CHANGED.
    // We can keep it for now in case mode switching is re-enabled later.
    if (this.currentMode === "advanced") {
      this._checkCaptureButtonState();
    }
  }

  _checkCaptureButtonState() {
    const captureBtn = UI.elements.captureBtn;
    const buttonContainer = UI.elements.buttonContainer;
    if (!captureBtn || !buttonContainer) return;

    // In Simple Mode, button state is controlled by URL_SELECTION_CHANGED event.
    // This function is mainly relevant for Advanced Mode or initial setup.
    // Since we are fixed in Simple mode, we rely on the URL_SELECTION_CHANGED handler.

    // However, we need to ensure the button container is visible once the form is shown.
     if (UI.elements.captureForm.style.display !== 'none') {
        buttonContainer.style.display = "";
        buttonContainer.classList.remove("hidden");

        // The capture button itself should be disabled initially in simple mode
        // until URLs are selected (handled by URL_SELECTION_CHANGED).
        // It should be visible though.
        captureBtn.style.display = "";
        captureBtn.classList.remove("initially-hidden");
     } else {
         // If the capture form is hidden, hide the button container
         buttonContainer.style.display = "none";
         buttonContainer.classList.add("hidden");
     }
  }

  _setupEventHandlers() {
    // Keep existing event handlers
    events.on(events.events.CAPTURE_PROGRESS, (data) => {
      UI.progress.updateProgressMessage(data.message);
    });
    events.on(events.events.SCREENSHOT_TAKEN, (data) => {
      UI.utils.showStatus(
        `✓ Screenshot captured: ${data.url} (${data.result?.preset} - ${data.result?.width}x${data.result?.height}) (Time: ${data.result?.timeTaken}s)`,
        false // Mark as success
      );
    });

    // Event from context-menu-helper when actions are generated (Advanced Mode only)
    // Since mode is fixed to simple, this handler is less critical but kept for future flexibility.
    events.on("CONTEXT_ACTIONS_GENERATED", () => {
      console.log("CONTEXT_ACTIONS_GENERATED event received");
      if (this.currentMode === "advanced") {
        this._checkCaptureButtonState();
      }
    });

    // NEW: Add listener for URL selection changes (Simple Mode specific)
    events.on("URL_SELECTION_CHANGED", (data) => {
      console.log("URL_SELECTION_CHANGED event received", data);
      if (this.currentMode === "simple") {
        // Enable/disable capture button based on selection count
        UI.elements.captureBtn.disabled = data.count === 0;
      }
    });

    // NEW: Add listener for LOGIN_OPTION_SELECTED event
    events.on('LOGIN_OPTION_SELECTED', (data) => {
        console.log('LOGIN_OPTION_SELECTED event received:', data);
        // When a login option is selected, update the UI mode to show the capture form
        this._updateUIMode();
    });

     // NEW: Add listener for LOGIN_COMPLETE event
    events.on('LOGIN_COMPLETE', (data) => {
        console.log('LOGIN_COMPLETE event received:', data);
         // Login process is complete (either successful or skipped/failed)
         // The _updateUIMode is already called by LOGIN_OPTION_SELECTED,
         // but we might add logic here if we need to react specifically to a successful login
         // (e.g., showing different UI elements). For now, just logging.
    });
  }


  // New method to handle pause/resume
  pauseResumeCapture() {
    this.isPaused = !this.isPaused;

    if (!this.isPaused && this.captureQueue.length > 0) {
      // We just resumed and have a queue - continue processing
      // Check if already processing to avoid multiple loops
      if (this._processingQueue) {
           console.log("Resume clicked but queue is already processing.");
           return;
      }
      UI.utils.showStatus(
        `Capture resumed from URL ${this.currentCaptureIndex + 1} of ${
          this.captureQueue.length
        }`,
        false
      );
      this.processCaptureQueue();
    } else if (this.isPaused) {
      // We just paused
      UI.utils.showStatus('Capture paused. Click "Resume" to continue.', false);
    }

    this.updatePauseResumeButton();
  }

  // Update the button text and style
  updatePauseResumeButton() {
    const pauseResumeBtn = document.getElementById("pauseResumeBtn");
    if (!pauseResumeBtn) return;

    pauseResumeBtn.textContent = this.isPaused ? "Resume" : "Pause";
    pauseResumeBtn.classList.toggle("paused", this.isPaused);
     pauseResumeBtn.title = this.isPaused ? "Resume capture" : "Pause capture";
  }

  // Create the pause/resume button
  createPauseResumeButton() {
    const buttonContainer = UI.elements.buttonContainer;
    if (!buttonContainer) return;

    // Remove any existing pause/resume button
    const existingBtn = document.getElementById("pauseResumeBtn");
    if (existingBtn) existingBtn.remove();

    // Create new button
    const pauseResumeBtn = document.createElement("button");
    pauseResumeBtn.id = "pauseResumeBtn";
    pauseResumeBtn.className = "btn pause-resume-btn";
    pauseResumeBtn.textContent = "Pause"; // Initial text
    pauseResumeBtn.title = "Pause capture"; // Initial title
    pauseResumeBtn.addEventListener("click", this.pauseResumeCapture);

    // Insert after capture button but before retry button
    const captureBtn = UI.elements.captureBtn;
    const retryBtn = UI.elements.retryFailedBtn;

    if (captureBtn && captureBtn.parentNode) {
      buttonContainer.insertBefore(pauseResumeBtn, retryBtn);
    } else {
       // Fallback if insertBefore fails
       buttonContainer.appendChild(pauseResumeBtn);
       buttonContainer.appendChild(retryBtn); // Ensure retry is also added if needed
    }

    // Initially disabled until capture starts
    pauseResumeBtn.disabled = true;
  }
  async captureScreenshots() {
      // Prevent starting capture if already processing
      if (this._processingQueue) {
           console.log("Capture already in progress.");
           UI.utils.showStatus("Capture is already in progress.", false);
           return;
      }

      // Check if authentication is complete
      if (!this.loginHandler.isAuthenticatedForCapture()) {
          UI.utils.showStatus("Please select a login option first.", true);
          return;
      }


    const startTotalTime = performance.now();
    let urlList = []; // Initialize urlList

    try {
      AppState.reset();
      UI.utils.resetUI();
      this.usingActionSequences = false; // Reset flag
      UI.thumbnails.createLiveThumbnailsContainer();
      UI.thumbnails.addCombineAllToPDFButton(); // Add PDF combine button

      // Reset pause state and queue
      this.isPaused = false;
      this.updatePauseResumeButton();
      this.captureQueue = [];
      this.currentCaptureIndex = 0;


      const capturePreset = UI.elements.capturePreset.value || "fullHD";
      let actionSequences = []; // Only used in Advanced Mode

      // --- Get URLs based on Mode ---
      // Mode is fixed to simple, so always use the URL selector logic
      if (typeof urlSelector.getSelectedUrlsForCapture === "function") {
        urlList = urlSelector.getSelectedUrlsForCapture();
      }

      // Fallback to text input if URL selector isn't available or returned no URLs
      if (!urlList || urlList.length === 0) {
        const rawUrlInput = UI.elements.urlList.value.trim();
        urlList = URLProcessor.processUrlList(rawUrlInput);
        if (urlList.length > 0) {
             // If falling back to text area, assume single URL for simple mode (based on original simple mode intent)
             // Or adjust this logic based on how manual input should work in the new flow.
             // For now, let's keep it as multiple URLs if entered manually.
             console.warn("Using manual URL input as URL selector returned no URLs or is unavailable.");
        }
      }

      if (urlList.length === 0) {
        throw new URLProcessingError(
          "Please select at least one page or enter a URL to capture.",
          "No URLs selected/entered"
        );
      }

      actionSequences = []; // No actions in simple mode
      this.usingActionSequences = false; // Always false in simple mode

      // Get wait time from simple mode specific field
      const simpleWaitTimeEl = document.getElementById("simpleWaitTime");
      if (simpleWaitTimeEl && UI.elements.waitTime) {
        // Copy the value from the simple mode wait time input to the main waitTime element
        // which is used by the core capture logic.
        UI.elements.waitTime.value = simpleWaitTimeEl.value;
        console.log("Using Simple Mode Wait Time:", UI.elements.waitTime.value);
      } else if (UI.elements.waitTime) {
         console.warn("Simple Mode Wait Time element not found, using default main waitTime value.");
         // Ensure main waitTime has a default if the simple one isn't found
         if (!UI.elements.waitTime.value) {
              UI.elements.waitTime.value = config.ui.defaultWaitTime || 5;
         }
      } else {
           console.error("Main Wait Time element (waitTime) not found!");
      }

      // --- End Get URLs ---


      UI.progress.updateStats(urlList.length, 0, 0, 0);
      UI.elements.captureBtn.disabled = true; // Disable button during capture
      UI.elements.retryFailedBtn.disabled = true;

      // Enable pause/resume button
      const pauseResumeBtn = document.getElementById("pauseResumeBtn");
      if (pauseResumeBtn) pauseResumeBtn.disabled = false;

      // Set up the capture queue
      this.captureQueue = urlList.map((url, index) => ({
        url,
        index,
        capturePreset,
        actionSequences: [], // Always empty in simple mode
      }));

      this.currentCaptureIndex = 0;

      // Start processing the queue
      this._processingQueue = true; // Set processing flag
      await this.processCaptureQueue();
      this._processingQueue = false; // Clear processing flag


      const endTotalTime = performance.now();
      const totalTimeTaken = ((endTotalTime - startTotalTime) / 1000).toFixed(
        2
      );

      UI.progress.updateStats(
        urlList.length,
        AppState.screenshots.size,
        AppState.failedUrls.length,
        totalTimeTaken
      );

      const completionMessage = this.isPaused
        ? `Capture paused after processing ${this.currentCaptureIndex} of ${urlList.length} URLs`
        : `Completed processing ${urlList.length} URLs (Success: ${AppState.screenshots.size}, Failed: ${AppState.failedUrls.length}, Time: ${totalTimeTaken}s)`;

      UI.progress.updateProgressMessage(completionMessage);

      // Enable PDF button now that all captures (or the current segment) are complete
      const combineAllPdfBtn = document.querySelector(".combine-all-pdf-btn"); // Use querySelector as it might not have ID
      if (combineAllPdfBtn) {
        combineAllPdfBtn.disabled = false;
      }


    } catch (error) {
      // Catch setup errors before processing starts
      handleError(error, { logToConsole: true, showToUser: true });
       this._processingQueue = false; // Clear processing flag on error
    } finally {
      this._checkCaptureButtonState(); // Re-evaluate button state
      UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;

      // If paused, keep the pause button enabled and in 'Resume' state
      // Otherwise disable it as capture is complete or failed setup
      const pauseResumeBtn = document.getElementById("pauseResumeBtn");
      if (pauseResumeBtn) {
        if (this.isPaused && this.currentCaptureIndex < this.captureQueue.length) {
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
      const { url, index, capturePreset, actionSequences } = item; // actionSequences will be empty in simple mode

      UI.progress.updateProgressMessage(
        `Processing ${this.currentCaptureIndex + 1} of ${totalUrls}: ${url}`
      );

      try {
        let result;
        const timestamp = URLProcessor.getTimestamp();

        // Determine if we are using action sequences (only in Advanced Mode)
        const useActionSequences = this.currentMode === 'advanced' && actionSequences && actionSequences.length > 0;

        if (useActionSequences) {
          // Advanced Mode processing (sequential captures)
          try {
            const processImmediately = (actionResult) => {
              const sequenceName = actionResult.sequenceName || "Unknown";
              const baseFileName = URLProcessor.generateFilename(
                url,
                index,
                "" // No regex pattern in simple mode
              );
              // Append sequence name and timestamp to the filename
              const fileName = baseFileName.replace(
                ".png",
                `_${sequenceName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${timestamp}.png` // Sanitize sequence name
              );
              actionResult.fileName = fileName; // Add filename to result object
              if (actionResult.error) {
                // Use addLiveThumbnail to display error state
                 UI.thumbnails.addLiveThumbnail(
                  actionResult,
                  fileName,
                  sequenceName,
                  false, // Not a retry
                  false  // Not a toolbar action error
                );
                UI.utils.showStatus(
                  `✗ Failed "${sequenceName}": ${
                    actionResult.errorMessage || "Error"
                  }`,
                  true // Mark as error
                );
              } else {
                const isToolbarAction = sequenceName.includes("Button"); // Basic check for toolbar actions
                // Add successful thumbnail
                UI.thumbnails.addLiveThumbnail(
                  actionResult,
                  fileName,
                  sequenceName,
                  false, // Not a retry
                  isToolbarAction
                );
              }
               // If this is the first successful result for this URL, consider the URL processed successfully
               if (!result && !actionResult.error) {
                   result = actionResult;
               }
            };

            console.log(`Taking sequential screenshots for URL: ${url} with ${actionSequences.length} sequences.`);
            const sequenceResults =
              await ScreenshotCapture.takeSequentialScreenshots(
                url,
                capturePreset,
                actionSequences,
                processImmediately // Pass the callback for immediate processing
              );

             // After all sequences for this URL are processed, check if any were successful
            const anySuccess = sequenceResults.some(r => !r.error);
            if (anySuccess) {
                 // If at least one sequence succeeded, consider the overall URL capture successful for state tracking
                 AppState.addScreenshot(url, sequenceResults.find(r => !r.error)); // Add the first successful result
            } else {
                 // If all sequences failed, add to failed list
                 console.warn(`All action sequences failed for URL: ${url}`);
                 AppState.addFailedUrl(url);
            }

          } catch (error) {
            console.error(`Error during sequential capture for ${url}:`, error);
            // If an error occurred during sequential capture setup or a critical step, mark URL as failed
            AppState.addFailedUrl(url);
            UI.utils.showStatus(`✗ Failed: ${url} (${error.message})`, true); // Show overall error message
          }
        } else {
          // Simple mode processing (single screenshot per URL)
          try {
            console.log(`Taking single screenshot for URL: ${url}`);
            result = await ScreenshotCapture.takeScreenshot(url, capturePreset);

            // Generate filename with timestamp
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
            console.error(
              `Error capturing simple screenshot for ${url}:`,
              error
            );

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
               // Generate an error filename
              const fileName = URLProcessor.generateFilename(
                url,
                index,
                ""
              ).replace(".png", `_Error_${timestamp}.png`);

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
               AppState.addFailedUrl(url); // Mark URL as failed
               UI.utils.showStatus(`✗ Failed: ${url} (${error.message})`, true); // Show the specific error message
            }
          }
        }

        // Update stats after processing each URL (or group of sequences in advanced mode)
        // The success/fail state is determined within the try/catch blocks now
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

      // Check if we should pause after each URL (or batch of sequences)
      if (this.isPaused) {
        UI.utils.showStatus(
          `Capture paused at URL ${this.currentCaptureIndex} of ${totalUrls}`,
          false
        );
        // Stop the loop
        break;
      }

       // Add a small delay between processing URLs to prevent overwhelming the system/browser
       if (this.currentCaptureIndex < totalUrls) { // Only wait if there are more items
           await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
       }
    }

     // After the loop finishes (either completed or paused)
     if (this.currentCaptureIndex >= totalUrls) {
         console.log("Queue processing complete.");
         // Final updates and cleanup if all URLs are processed
     } else if (this.isPaused) {
         console.log("Queue processing paused.");
         // Keep state as is, waiting for resume
     }

    this._processingQueue = false; // Clear processing flag
    this._checkCaptureButtonState(); // Update button states
    UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;

    // Ensure pause/resume button state is correct after processing
    const pauseResumeBtn = document.getElementById("pauseResumeBtn");
    if (pauseResumeBtn) {
      if (this.isPaused && this.currentCaptureIndex < this.captureQueue.length) {
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
           UI.utils.showStatus("Retry is already in progress.", false);
           return;
      }

      // Check if authentication is complete (if login was chosen)
      // If 'continue without login' was chosen, isAuthenticatedForCapture is true.
       if (!this.loginHandler.isAuthenticatedForCapture()) {
          UI.utils.showStatus("Cannot retry: Authentication is required or login failed.", true);
          return;
      }


    if (AppState.failedUrls.length === 0) {
      alert("No failed URLs to retry.");
      return;
    }

    const startTotalTime = performance.now();
    let urlsToRetry = [...AppState.failedUrls];
    let currentFailedUrlsSnapshot = [...AppState.failedUrls]; // Snapshot before clearing
    AppState.failedUrls = []; // Clear failed list at the start of retry


    try {
      this.usingActionSequences = false; // Reset flag for retry context
      const capturePreset = UI.elements.capturePreset.value || "fullHD";
      let actionSequences = [];

      // Check for Advanced Mode actions only if in Advanced Mode (shouldn't happen with mode fixed)
      if (this.currentMode === "advanced") {
           // ... (existing advanced mode action parsing logic - kept for completeness but won't be hit in fixed simple mode)
           const actionsText = UI.elements.actionsField
            ? UI.elements.actionsField.value.trim()
            : "";
          if (!actionsText)
            throw new Error(
              "Cannot retry in Advanced mode without Context Actions JSON."
            );
          try {
            actionSequences = JSON.parse(actionsText);
            if (!Array.isArray(actionSequences) || actionSequences.length === 0) {
              throw new Error("Actions JSON must be a non-empty array.");
            }
            this.usingActionSequences = true;
          } catch (error) {
            throw new Error(
              `Cannot retry: Error parsing actions JSON: ${error.message}.`
            );
          }
      }
       // Note: Simple mode retry will always have this.usingActionSequences = false;


      let completed = 0;
      let retriedSuccessCount = 0;
      UI.progress.updateProgressMessage(
        `Retrying ${urlsToRetry.length} failed URLs...`
      );
      UI.elements.progressBar.style.width = "0%"; // Reset progress bar for retry
      UI.elements.retryFailedBtn.disabled = true; // Disable while retrying
      UI.elements.captureBtn.disabled = true; // Also disable main capture button

       // Disable pause/resume button during retry (or decide if pause/resume should apply to retry too)
       // For simplicity, disabling pause/resume during retry for now.
       const pauseResumeBtn = document.getElementById("pauseResumeBtn");
       if (pauseResumeBtn) {
           pauseResumeBtn.disabled = true;
           pauseResumeBtn.textContent = "Pause"; // Reset text/state visual
           pauseResumeBtn.classList.remove("paused");
       }


      // --- Retry Loop ---
      for (let i = 0; i < urlsToRetry.length; i++) {
        const url = urlsToRetry[i];
        UI.progress.updateProgressMessage(
          `Retrying ${i + 1} of ${urlsToRetry.length}: ${url}`
        );
        try {
          let result = null;
          const timestamp = URLProcessor.getTimestamp();
          // Try to find the original index for filename generation if needed
          const originalIndex = AppState.orderedUrls.indexOf(url);
          const filenameIndex = originalIndex !== -1 ? originalIndex : i; // Use original index if found, otherwise current retry index


          if (this.usingActionSequences) {
            // Advanced mode retry (sequential captures)
            try {
               const processImmediatelyRetry = (actionResult) => {
                const sequenceName = actionResult.sequenceName || "Unknown";
                const baseFileName = URLProcessor.generateFilename(
                  url,
                  filenameIndex,
                  "" // No regex pattern in simple mode context, even in advanced retry
                );
                 // Append sequence name, Retry indicator, and timestamp to the filename
                const fileName = baseFileName.replace(
                  ".png",
                  `_${sequenceName.replace(/[^a-zA-Z0-9_-]/g, "_")}_Retry_${timestamp}.png` // Sanitize sequence name
                );
                 actionResult.fileName = fileName; // Add filename to result object

                if (actionResult.error) {
                  UI.thumbnails.addLiveThumbnail(
                    actionResult,
                    fileName,
                    sequenceName,
                    true, // Is a retry
                    false // Not a toolbar action error (error applies to the sequence)
                  );
                  UI.utils.showStatus(
                    `✗ Retry Failed "${sequenceName}": ${
                      actionResult.errorMessage || "Error"
                    }`,
                    true
                  );
                } else {
                  const isToolbarAction = sequenceName.includes("Button"); // Basic check
                   UI.thumbnails.addLiveThumbnail(
                    actionResult,
                    fileName,
                    sequenceName,
                    true, // Is a retry
                    isToolbarAction
                  );
                }
                // If this is the first successful result for this URL sequence group, update the overall result
                if (!result && !actionResult.error) {
                    result = actionResult;
                }
              };

              console.log(`Retrying sequential screenshots for URL: ${url} with ${actionSequences.length} sequences.`);
              const sequenceResultsRetry =
                await ScreenshotCapture.takeSequentialScreenshots(
                  url,
                  capturePreset,
                  actionSequences,
                  processImmediatelyRetry // Pass the callback
                );

               // After all sequences for this URL retry are processed, check if any were successful
              const anySuccessRetry = sequenceResultsRetry.some(r => !r.error);
              if (anySuccessRetry) {
                   // If at least one sequence succeeded, consider the overall URL retry successful for state tracking
                   AppState.addScreenshot(url, sequenceResultsRetry.find(r => !r.error)); // Add the first successful result
                   retriedSuccessCount++; // Increment count for successfully retried URLs
              } else {
                   // If all sequences failed again, add back to failed list
                   console.warn(`All action sequences failed during retry for URL: ${url}`);
                   AppState.addFailedUrl(url); // Add back to failed list
              }


            } catch (error) {
              console.error(`Error during sequential retry for ${url}:`, error);
               // If an error occurred during sequential retry setup or a critical step, add URL back to failed list
              AppState.addFailedUrl(url); // Add back to failed list
               UI.utils.showStatus(`✗ Retry Failed: ${url} (${error.message})`, true); // Show overall error message
            }
          } else {
            // Simple mode retry (single screenshot per URL)
            try {
              console.log(`Retrying simple screenshot for URL: ${url}`);
              result = await ScreenshotCapture.takeScreenshot(
                url,
                capturePreset
              );

              // Generate filename with Retry indicator and timestamp
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
                 // Generate an error filename with Retry indicator
                const fileName = URLProcessor.generateFilename(
                  url,
                  filenameIndex,
                  ""
                ).replace(".png", `_Error_Retry_${timestamp}.png`);

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
                 AppState.addFailedUrl(url); // Add back to failed list
                 UI.utils.showStatus(`✗ Retry Failed: ${url} (${error.message})`, true); // Show the specific error message
              }
            }
          }
        } catch (error) {
           // Catch any uncaught errors during the processing of this retry URL
            console.error(`Unexpected error processing retry URL ${url}:`, error);
            AppState.addFailedUrl(url); // Add URL back to failed list
            UI.utils.showStatus(`✗ Retry Failed: ${url} (Unexpected error)`, true);
        }

        completed++;
        UI.progress.updateProgress(completed, urlsToRetry.length); // Update progress bar based on original failed list count

        // Add a small delay between retrying URLs
         if (i < urlsToRetry.length - 1) { // Only wait if there are more items
             await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
         }

      } // --- End Retry Loop ---

      const endTotalTime = performance.now();
      const totalTimeTaken = ((endTotalTime - startTotalTime) / 1000).toFixed(
        2
      );
      const finalSuccessCount = AppState.screenshots.size;
      const finalFailedCount = AppState.failedUrls.length;

      // Update stats with final counts
      // Note: Total URLs in stats might still show the initial total,
      // but processed/failed reflect the outcome of the retry attempts.
      UI.progress.updateStats(
           AppState.orderedUrls.length + currentFailedUrlsSnapshot.length, // Approximation of total processed + originally failed
           finalSuccessCount,
           finalFailedCount,
           totalTimeTaken
       );


      UI.progress.updateProgressMessage(
        `Retry complete. ${retriedSuccessCount} of ${urlsToRetry.length} URLs successfully retried. (Remaining Failed: ${finalFailedCount}, Time: ${totalTimeTaken}s)`
      );
    } catch (error) {
      // Catch setup errors for retry
      handleError(error, { logToConsole: true, showToUser: true });
      AppState.failedUrls = currentFailedUrlsSnapshot; // Restore failed list on setup error
       UI.progress.updateProgressMessage("Retry failed due to setup error.");
    } finally {
      // Re-enable retry button if there are still failed URLs
      UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;
       // Re-enable main capture button
      this._checkCaptureButtonState();

       // Ensure pause/resume button is disabled after retry is fully complete
       const pauseResumeBtn = document.getElementById("pauseResumeBtn");
       if (pauseResumeBtn) {
           pauseResumeBtn.disabled = true;
           pauseResumeBtn.textContent = "Pause"; // Reset text
           pauseResumeBtn.classList.remove("paused"); // Reset class
       }
    }
  }
} // End App Class

export default App;