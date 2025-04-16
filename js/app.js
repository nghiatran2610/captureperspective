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
import LoginHandler from "./login-handler.js";

class App {
  constructor() {
    this.currentMode = "advanced"; // Default mode
    this.captureScreenshots = this.captureScreenshots.bind(this);
    this.retryFailedUrls = this.retryFailedUrls.bind(this);
    this._handleModeChange = this._handleModeChange.bind(this);
    this._handleActionsInput = this._handleActionsInput.bind(this);
    this.generatePrefilledUrl = this.generatePrefilledUrl.bind(this); // Bind the new method
    this.prefilledUrl = null; // Will store the generated URL
    this.loginHandler = LoginHandler;
  }

  initialize() {
    this.prefilledUrl = this.generatePrefilledUrl();
    this._setupEventListeners();
    this._initializeUI();
    this._setupEventHandlers();
    this._updateUIMode();
    ContextMenuActionsHelper.addUIControls();
    this._checkCaptureButtonState();
    this.loginHandler.initialize();
    console.log("Application initialized with config:", config);
  }

  _setupEventListeners() {
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
    events.addDOMEventListener(
      UI.elements.actionsField,
      "input",
      this._handleActionsInput
    );

    // Add a direct input listener to check for content changes
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
    UI.elements.captureForm.style.display = "none";
    UI.elements.progressOutput.style.display = "none";
  }

  _handleModeChange(event) {
    this.currentMode = event.target.value;
    console.log("Mode changed to:", this.currentMode);
    this._updateUIMode();
    this._checkCaptureButtonState(); // Update button state when mode changes
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
    const regex = /http(s)?:\/\/([^\/]+)\/system\/webdev\/([^\/]+)/;
    const match = currentUrl.match(regex);

    if (match && match.length >= 4) {
      const protocol = match[1] ? "https" : "http";
      const host = match[2];
      const projectName = match[3];

      const prefilledUrl = `${protocol}://${host}/data/perspective/client/${projectName}`;
      console.log("Generated prefilled URL:", prefilledUrl);
      return prefilledUrl;
    }

    // Fallback: if pattern doesn't match, return a default URL or empty string
    console.log("URL pattern not matched, using default");
    return "";
  }

  _updateUIMode() {
    const body = document.body;
    const urlList = UI.elements.urlList;
    const advancedOptions = UI.elements.advancedOptions;
    const captureBtn = UI.elements.captureBtn;
    const urlHelpText = UI.elements.urlHelpText;
    const statsSection = UI.elements.stats;
    const advancedWaitTimeField = UI.elements.waitTime;
    const capturePreset = UI.elements.capturePreset;

    UI.elements.captureForm.style.display = "";
    UI.elements.progressOutput.style.display = "";

    // Clean up URL selector first if we're switching modes
    if (
      this.currentMode === "advanced" &&
      typeof urlSelector.cleanup === "function"
    ) {
      urlSelector.cleanup();
    }

    if (this.currentMode === "simple") {
      body.classList.add("simple-mode");
      body.classList.remove("advanced-mode");
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

      // Initialize URL selector
      setTimeout(() => {
        urlSelector.initialize().catch((error) => {
          console.error("Failed to initialize URL selector:", error);
        });
      }, 0);
    } else {
      // Advanced mode (existing code remains unchanged)
      body.classList.remove("simple-mode");
      body.classList.add("advanced-mode");
      urlList.rows = 1;
      urlList.placeholder = "Enter a single URL";

      // Set prefilled URL value in advanced mode
      const prefilledUrl = this.generatePrefilledUrl();
      urlList.value = prefilledUrl;

      UI.elements.urlInputTitle.textContent = "Enter Single URL to Capture";
      advancedOptions.style.display = "block";
      captureBtn.classList.add("initially-hidden");

      // Hide stats in advanced mode
      if (statsSection) statsSection.style.display = "none";

      // Hide simple mode settings in advanced mode
      if (document.getElementById("simpleModeSetting")) {
        document.getElementById("simpleModeSetting").style.display = "none";
      }

      if (urlHelpText) {
        urlHelpText.style.display = "block";

        // Ensure the textarea is positioned right after the help text
        if (urlHelpText.parentElement && urlList.parentElement) {
          // Only move if it's not already in the right position
          if (urlHelpText.nextSibling !== urlList) {
            urlHelpText.parentElement.insertBefore(
              urlList,
              urlHelpText.nextSibling
            );
          }
        }
      }

      // Add input event listener to enforce single URL
      if (!urlList._singleUrlListener) {
        urlList._singleUrlListener = function () {
          // Get the text content
          const text = this.value;

          // If there's a newline character, keep only the first line
          if (text.includes("\n")) {
            const firstLine = text.split("\n")[0].trim();
            this.value = firstLine;

            // Show a brief message
            const warningMsg = document.createElement("div");
            warningMsg.className = "help-text";
            warningMsg.style.color = "#e74c3c";
            warningMsg.textContent = "Advanced mode only allows a single URL";

            // Insert the warning after the URL input
            this.parentNode.insertBefore(warningMsg, this.nextSibling);

            // Remove the warning after a short delay
            setTimeout(() => {
              if (warningMsg.parentNode) {
                warningMsg.parentNode.removeChild(warningMsg);
              }
            }, 3000);
          }
        };

        urlList.addEventListener("input", urlList._singleUrlListener);
      }
    }

    UI.utils.resetUI();

    // Additional step: Check if we have a prefilled URL in advanced mode
    // and should adjust button state accordingly
    if (this.currentMode === "advanced" && urlList.value) {
      this._handleActionsInput(); // Will check action field and update button state
    }
  }
  _handleActionsInput() {
    // Simply check the capture button state whenever the content changes
    if (this.currentMode === "advanced") {
      this._checkCaptureButtonState();
    }
  }

  _checkCaptureButtonState() {
    const captureBtn = UI.elements.captureBtn;
    const buttonContainer = UI.elements.buttonContainer;
    if (!captureBtn || !buttonContainer) return;

    if (this.currentMode === "simple") {
      // --- Simple Mode ---
      // Ensure the container is visible
      buttonContainer.style.display = "";
      buttonContainer.classList.remove("hidden");

      // Ensure the capture button itself is enabled and visible
      captureBtn.disabled = false;
      captureBtn.style.display = "";
      captureBtn.classList.remove("initially-hidden");
    } else {
      // --- Advanced Mode ---
      const actionsText = UI.elements.actionsField
        ? UI.elements.actionsField.value.trim()
        : "";
      let isValidJson = false;

      if (actionsText) {
        try {
          const parsed = JSON.parse(actionsText);
          // Valid if it's a non-null object (includes non-empty arrays)
          isValidJson = typeof parsed === "object" && parsed !== null;
          if (Array.isArray(parsed) && parsed.length === 0) {
            isValidJson = false; // Treat empty array as invalid for starting capture
          }
        } catch (e) {
          isValidJson = false;
        }
      }

      if (isValidJson) {
        // Show container and enable button
        buttonContainer.style.display = "";
        buttonContainer.classList.remove("hidden");
        captureBtn.disabled = false;
        captureBtn.style.display = "";
        captureBtn.classList.remove("initially-hidden");
      } else {
        // Hide the entire container
        buttonContainer.style.display = "none";
        buttonContainer.classList.add("hidden");
        captureBtn.disabled = true;
        captureBtn.classList.add("initially-hidden");
      }
    }
  }

  _setupEventHandlers() {
    // Keep existing event handlers
    events.on(events.events.CAPTURE_PROGRESS, (data) => {
      UI.progress.updateProgressMessage(data.message);
    });
    events.on("URL_SELECTION_CHANGED", (data) => {
      console.log("URL_SELECTION_CHANGED event received", data);
      if (this.currentMode === "simple") {
        // Enable/disable capture button based on selection count
        UI.elements.captureBtn.disabled = data.count === 0;
      }
    });
    events.on(events.events.SCREENSHOT_TAKEN, (data) => {
      UI.utils.showStatus(
        `✓ Screenshot captured: ${data.url} (${data.result?.preset} - ${data.result?.width}x${data.result?.height}) (Time: ${data.result?.timeTaken}s)`,
        false // Mark as success
      );
    });
    // Event from context-menu-helper when actions are generated
    events.on("CONTEXT_ACTIONS_GENERATED", () => {
      console.log("CONTEXT_ACTIONS_GENERATED event received"); // Add log for debugging
      if (this.currentMode === "advanced") {
        this._checkCaptureButtonState(); // This will now run after generation
      }
    });

    // NEW: Add listener for URL selection changes
    events.on("URL_SELECTION_CHANGED", (data) => {
      console.log("URL_SELECTION_CHANGED event received", data); // Add log for debugging
      if (this.currentMode === "simple") {
        // Enable/disable capture button based on selection count
        UI.elements.captureBtn.disabled = data.count === 0;
      }
    });
  }

  async captureScreenshots() {
    const startTotalTime = performance.now();
    let urlList = []; // Initialize urlList

    try {
      AppState.reset();
      UI.utils.resetUI();
      this.usingActionSequences = false; // Reset flag
      UI.thumbnails.createLiveThumbnailsContainer();
      UI.thumbnails.addCombineAllToPDFButton(); // Add PDF combine button

      const capturePreset = UI.elements.capturePreset.value || "fullHD";
      let actionSequences = [];

      // --- Mode-Specific Logic ---
      if (this.currentMode === "simple") {
        // Get URLs from URL selector if available
        if (typeof urlSelector.getSelectedUrlsForCapture === "function") {
          urlList = urlSelector.getSelectedUrlsForCapture();
        }

        // Fallback to text input if URL selector isn't available or returned no URLs
        if (!urlList || urlList.length === 0) {
          const rawUrlInput = UI.elements.urlList.value.trim();
          urlList = URLProcessor.processUrlList(rawUrlInput);
        }

        if (urlList.length === 0) {
          throw new URLProcessingError(
            "Please select at least one page to capture.",
            "No URLs selected"
          );
        }

        actionSequences = []; // No actions in simple mode
        this.usingActionSequences = false;

        // Get wait time from simple mode specific field
        const simpleWaitTimeEl = document.getElementById("simpleWaitTime");
        if (simpleWaitTimeEl && UI.elements.waitTime) {
          UI.elements.waitTime.value = simpleWaitTimeEl.value;
        }
      } else {
        // Advanced Mode
        const rawUrlInput = UI.elements.urlList.value.trim();
        const urls = rawUrlInput
          .split("\n")
          .map((url) => url.trim())
          .filter((url) => url);
        if (urls.length === 0)
          throw new URLProcessingError(
            "Please enter a valid URL.",
            rawUrlInput
          );
        if (urls.length > 1)
          throw new URLProcessingError(
            "Advanced mode only allows a single URL.",
            rawUrlInput
          );
        const singleUrl = urls[0];
        if (!URLProcessor.isValidUrl(singleUrl))
          throw new URLProcessingError(
            "The entered URL is not valid.",
            singleUrl
          );
        urlList = [singleUrl];

        const actionsText = UI.elements.actionsField
          ? UI.elements.actionsField.value.trim()
          : "";
        // ** Crucially, re-check JSON validity here before capture **
        if (!actionsText)
          throw new Error("Context Actions JSON is required in Advanced Mode.");
        try {
          actionSequences = JSON.parse(actionsText);
          if (!Array.isArray(actionSequences))
            throw new Error("Actions JSON must be an array.");
          if (actionSequences.length === 0) {
            throw new Error(
              "Context Actions JSON cannot be an empty array in Advanced Mode."
            );
          }
          console.log(`Loaded ${actionSequences.length} action sequences`);
          this.usingActionSequences = true; // Set true only if non-empty array parsed
        } catch (error) {
          throw new Error(
            `Error parsing actions JSON: ${error.message}. Please check the format.`
          );
        }
      }
      // --- End Mode-Specific Logic ---

      UI.progress.updateStats(urlList.length, 0, 0, 0);
      UI.elements.captureBtn.disabled = true; // Disable button during capture
      UI.elements.retryFailedBtn.disabled = true;

      // --- Capture Loop ---
      for (let i = 0; i < urlList.length; i++) {
        const url = urlList[i];
        UI.progress.updateProgressMessage(
          `Processing ${i + 1} of ${urlList.length}: ${url}`
        );
        try {
          let result;
          const timestamp = URLProcessor.getTimestamp();
          if (this.usingActionSequences) {
            // Advanced Mode
            try {
              const processImmediately = (actionResult) => {
                const sequenceName = actionResult.sequenceName || "Unknown";
                const baseFileName = URLProcessor.generateFilename(url, i, "");
                const fileName = baseFileName.replace(
                  ".png",
                  `_${sequenceName.replace(/\s+/g, "_")}_${timestamp}.png`
                );
                actionResult.fileName = fileName;
                if (actionResult.error) {
                  UI.thumbnails.addLiveThumbnail(
                    actionResult,
                    fileName,
                    sequenceName,
                    false,
                    false
                  );
                  UI.utils.showStatus(
                    `✗ Failed "${sequenceName}": ${
                      actionResult.errorMessage || "Error"
                    }`,
                    true
                  );
                } else {
                  const isToolbarAction = sequenceName.includes("Button");
                  UI.thumbnails.addLiveThumbnail(
                    actionResult,
                    fileName,
                    sequenceName,
                    false,
                    isToolbarAction
                  );
                }
                if (!result && !actionResult.error) result = actionResult;
              };
              const sequenceResults =
                await ScreenshotCapture.takeSequentialScreenshots(
                  url,
                  capturePreset,
                  actionSequences,
                  processImmediately
                );
              const firstSuccess = sequenceResults.find((r) => !r.error);
              if (!firstSuccess)
                console.warn(`All action sequences failed for ${url}`);
              else result = firstSuccess;
            } catch (error) {
              console.error(
                `Error during sequential capture for ${url}:`,
                error
              );
            }
          } else {
            // Simple mode
            try {
              result = await ScreenshotCapture.takeScreenshot(
                url,
                capturePreset
              );
              const fileName = URLProcessor.generateFilename(
                url,
                i,
                ""
              ).replace(".png", `_${timestamp}.png`);
              result.fileName = fileName;
              UI.thumbnails.addLiveThumbnail(result, fileName);
            } catch (error) {
              console.error(
                `Error capturing simple screenshot for ${url}:`,
                error
              );
              if (
                error.message &&
                (error.message.includes("No view configured") ||
                  error.message.includes("Mount definition"))
              ) {
                const errorResult = {
                  error: true,
                  errorMessage: error.message,
                  sequenceName: url,
                };
                const fileName = URLProcessor.generateFilename(
                  url,
                  i,
                  ""
                ).replace(".png", `_Error_${timestamp}.png`);
                UI.thumbnails.addLiveThumbnail(
                  errorResult,
                  fileName,
                  url,
                  false,
                  false
                );
                UI.utils.showStatus(`✗ Failed: ${url} (Mount error)`, true);
                AppState.addFailedUrl(url);
                UI.progress.updateStats(
                  urlList.length,
                  AppState.screenshots.size,
                  AppState.failedUrls.length,
                  0
                );
                UI.progress.updateProgress(i + 1, urlList.length);
                continue;
              } else {
                throw error;
              }
            }
          }
          if (result) AppState.addScreenshot(url, result);
          else AppState.addFailedUrl(url);
          UI.progress.updateStats(
            urlList.length,
            AppState.screenshots.size,
            AppState.failedUrls.length,
            0
          );
        } catch (error) {
          // Catch errors for the URL
          console.error(`Overall capture failed for ${url}: ${error.message}`);
          AppState.addFailedUrl(url);
          UI.utils.showStatus(`✗ Failed: ${url} (${error.message})`, true);
          UI.progress.updateStats(
            urlList.length,
            AppState.screenshots.size,
            AppState.failedUrls.length,
            0
          );
        }
        UI.progress.updateProgress(i + 1, urlList.length);
      } // --- End Capture Loop ---

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
      UI.progress.updateProgressMessage(
        `Completed processing ${urlList.length} URLs (Success: ${AppState.screenshots.size}, Failed: ${AppState.failedUrls.length}, Time: ${totalTimeTaken}s)`
      );

      // Enable PDF button now that all actions are complete
      const combineAllPdfBtn = document.getElementById("combineAllPdfBtn");
      if (combineAllPdfBtn) {
        combineAllPdfBtn.disabled = false;
      }
    } catch (error) {
      // Catch setup errors
      handleError(error, { logToConsole: true, showToUser: true });
    } finally {
      this._checkCaptureButtonState(); // Re-evaluate button state
      UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;
    }
  }

  async retryFailedUrls() {
    if (AppState.failedUrls.length === 0) {
      alert("No failed URLs to retry.");
      return;
    }
    const startTotalTime = performance.now();
    let urlsToRetry = [...AppState.failedUrls];
    let currentFailedUrlsSnapshot = [...AppState.failedUrls];

    try {
      AppState.failedUrls = [];
      this.usingActionSequences = false;
      const capturePreset = UI.elements.capturePreset.value || "fullHD";
      let actionSequences = [];

      if (this.currentMode === "advanced") {
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

      let completed = 0;
      let retriedSuccessCount = 0;
      UI.progress.updateProgressMessage(
        `Retrying ${urlsToRetry.length} failed URLs...`
      );
      UI.elements.progressBar.style.width = "0%";
      UI.elements.retryFailedBtn.disabled = true; // Disable while retrying
      UI.elements.captureBtn.disabled = true; // Also disable main capture button

      // --- Retry Loop ---
      for (let i = 0; i < urlsToRetry.length; i++) {
        const url = urlsToRetry[i];
        UI.progress.updateProgressMessage(
          `Retrying ${i + 1} of ${urlsToRetry.length}: ${url}`
        );
        try {
          let result = null;
          const timestamp = URLProcessor.getTimestamp();
          const originalIndex = AppState.orderedUrls.indexOf(url);
          if (this.usingActionSequences) {
            // Advanced mode retry
            try {
              const processImmediatelyRetry = (actionResult) => {
                const sequenceName = actionResult.sequenceName || "Unknown";
                const idx = originalIndex !== -1 ? originalIndex : i;
                const baseFileName = URLProcessor.generateFilename(
                  url,
                  idx,
                  ""
                );
                const fileName = baseFileName.replace(
                  ".png",
                  `_${sequenceName.replace(/\s+/g, "_")}_Retry_${timestamp}.png`
                );
                actionResult.fileName = fileName;
                if (actionResult.error) {
                  UI.thumbnails.addLiveThumbnail(
                    actionResult,
                    fileName,
                    sequenceName,
                    true,
                    false
                  );
                  UI.utils.showStatus(
                    `✗ Retry Failed "${sequenceName}": ${
                      actionResult.errorMessage || "Error"
                    }`,
                    true
                  );
                } else {
                  const isToolbarAction = sequenceName.includes("Button");
                  UI.thumbnails.addLiveThumbnail(
                    actionResult,
                    fileName,
                    sequenceName,
                    true,
                    isToolbarAction
                  );
                }
                if (!result && !actionResult.error) result = actionResult;
              };
              const sequenceResultsRetry =
                await ScreenshotCapture.takeSequentialScreenshots(
                  url,
                  capturePreset,
                  actionSequences,
                  processImmediatelyRetry
                );
              const firstSuccessRetry = sequenceResultsRetry.find(
                (r) => !r.error
              );
              if (!firstSuccessRetry)
                console.warn(
                  `All action sequences failed during retry for ${url}`
                );
              else result = firstSuccessRetry;
            } catch (error) {
              console.error(`Error during sequential retry for ${url}:`, error);
            }
          } else {
            // Simple mode retry
            try {
              result = await ScreenshotCapture.takeScreenshot(
                url,
                capturePreset
              );
              const idx = originalIndex !== -1 ? originalIndex : i;
              const fileName = URLProcessor.generateFilename(
                url,
                idx,
                ""
              ).replace(".png", `_Retry_${timestamp}.png`);
              result.fileName = fileName;
              UI.thumbnails.addLiveThumbnail(result, fileName, null, true);
            } catch (error) {
              console.error(
                `Error retrying simple screenshot for ${url}:`,
                error
              );
              if (
                error.message &&
                (error.message.includes("No view configured") ||
                  error.message.includes("Mount definition"))
              ) {
                const errorResult = {
                  error: true,
                  errorMessage: error.message,
                  sequenceName: url,
                };
                const idx = originalIndex !== -1 ? originalIndex : i;
                const fileName = URLProcessor.generateFilename(
                  url,
                  idx,
                  ""
                ).replace(".png", `_Error_Retry_${timestamp}.png`);
                UI.thumbnails.addLiveThumbnail(
                  errorResult,
                  fileName,
                  url,
                  true,
                  false
                );
                UI.utils.showStatus(
                  `✗ Retry Failed: ${url} (Mount error)`,
                  true
                );
                AppState.addFailedUrl(url);
                completed++;
                UI.progress.updateProgress(completed, urlsToRetry.length);
                continue;
              } else {
                throw error;
              }
            }
          }
          if (result) {
            AppState.addScreenshot(url, result);
            retriedSuccessCount++;
          } else {
            AppState.addFailedUrl(url);
          }
        } catch (error) {
          // Catch errors for the URL retry
          console.error(`Overall retry failed for ${url}: ${error.message}`);
          AppState.addFailedUrl(url);
          UI.utils.showStatus(
            `✗ Retry Failed: ${url} (${error.message})`,
            true
          );
        }
        completed++;
        UI.progress.updateProgress(completed, urlsToRetry.length);
      } // --- End Retry Loop ---

      const endTotalTime = performance.now();
      const totalTimeTaken = ((endTotalTime - startTotalTime) / 1000).toFixed(
        2
      );
      const finalSuccessCount = AppState.screenshots.size;
      const finalFailedCount = AppState.failedUrls.length;
      UI.elements.processedCount.textContent = finalSuccessCount.toString();
      UI.elements.failedCount.textContent = finalFailedCount.toString();
      UI.elements.totalTime.textContent = `${totalTimeTaken}s (Retry)`; // Display retry duration
      UI.progress.updateProgressMessage(
        `Retry complete. ${retriedSuccessCount} of ${urlsToRetry.length} URLs successfully retried. (Remaining Failed: ${finalFailedCount}, Total Time: ${totalTimeTaken}s)`
      );
    } catch (error) {
      // Catch setup errors for retry
      handleError(error, { logToConsole: true, showToUser: true });
      AppState.failedUrls = currentFailedUrlsSnapshot; // Restore failed list on setup error
    } finally {
      UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;
      this._checkCaptureButtonState(); // Re-evaluate capture button state
    }
  }
} // End App Class

export default App;
