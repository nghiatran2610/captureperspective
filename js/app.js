// app.js - Main application controller
import config from "./config.js";
import AppState from "./state.js";
import UI from "./ui/index.js";
import URLProcessor from "./url-processor.js";
import * as ScreenshotCapture from "./screenshot/core.js";
import MenuActionsHelper from "./menu-actions-helper.js";
import ContextMenuActionsHelper from "./context-menu-actions-helper.js";
import * as events from "./events.js";
import { handleError, ScreenshotError, URLProcessingError } from "./errors.js";
import * as utils from "./screenshot/utils.js";

class App {
  constructor() {
    this.captureScreenshots = this.captureScreenshots.bind(this);
    this.retryFailedUrls = this.retryFailedUrls.bind(this);
    this.toggleAdvancedOptions = this.toggleAdvancedOptions.bind(this);
    this.menuActionsHelper = MenuActionsHelper;
    this.contextMenuActionsHelper = ContextMenuActionsHelper;
  }

  initialize() {
    this._setupEventListeners();
    this._initializeUI();
    this._setupEventHandlers();
    console.log("Application initialized with config:", config);
  }

  _setupEventListeners() {
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
      UI.elements.toggleAdvanced,
      "click",
      this.toggleAdvancedOptions
    );
    events.addDOMEventListener(document, "keydown", (event) => {
      if (event.ctrlKey && event.key === "Enter") {
        this.captureScreenshots();
        event.preventDefault();
      }
    });
  }

  _initializeUI() {
    if (UI.elements.waitTime) {
      UI.elements.waitTime.value = config.ui.defaultWaitTime || 5;
    }
    // Naming Pattern and Custom Text inputs have been removed.
    if (UI.elements.retryFailedBtn) {
      UI.elements.retryFailedBtn.disabled = true;
    }
  }

  _setupEventHandlers() {
    events.on(events.events.CAPTURE_PROGRESS, (data) => {
      UI.progress.updateProgressMessage(data.message);
    });
    events.on(events.events.CAPTURE_FAILED, (data) => {
      UI.utils.showStatus(
        `✗ Failed to capture screenshot: ${data.url} (${data.error.message})`,
        true
      );
    });
    events.on(events.events.SCREENSHOT_TAKEN, (data) => {
      if (!this.usingActionSequences) {
        UI.utils.showStatus(
          `✓ Screenshot captured: ${data.url} (${data.result.preset} - ${data.result.width}x${data.result.height}) (Time: ${data.result.timeTaken}s)`
        );
      }
    });
  }

  toggleAdvancedOptions() {
    const advancedSection = UI.elements.advancedOptions;
    const toggleBtn = UI.elements.toggleAdvanced;
    if (advancedSection.style.display === "block") {
      advancedSection.style.display = "none";
      toggleBtn.textContent = "Advanced Options ▼";
    } else {
      advancedSection.style.display = "block";
      toggleBtn.textContent = "Advanced Options ▲";
    }
  }

  _processSequentialResults(results, i, url, timestamp) {
    let validScreenshots = 0;
    let errorScreenshots = 0;
    for (let j = 0; j < results.length; j++) {
      const actionResult = results[j];
      const sequenceName = actionResult.sequenceName || `Step ${j + 1}`;
      // Always generate filename using the fixed default pattern.
      const baseFileName = URLProcessor.generateFilename(url, i, "");
      const fileName = baseFileName.replace(
        ".png",
        `_${sequenceName.replace(/\s+/g, "_")}_${timestamp}.png`
      );
      if (actionResult.error) {
        errorScreenshots++;
        UI.thumbnails.addLiveThumbnail(
          actionResult,
          fileName,
          sequenceName,
          false,
          false
        );
        UI.utils.showStatus(
          `✗ Failed for "${sequenceName}": ${
            actionResult.errorMessage || "Mount error"
          }`,
          true
        );
        continue;
      }
      validScreenshots++;
      const isToolbarAction = sequenceName.includes("Button");
      actionResult.fileName = fileName;
      UI.thumbnails.addLiveThumbnail(
        actionResult,
        fileName,
        sequenceName,
        false,
        isToolbarAction
      );
    }
    if (validScreenshots > 0 && errorScreenshots > 0) {
      UI.utils.showStatus(
        `✓ ${validScreenshots} screenshots captured for ${url} (${errorScreenshots} errors)`,
        false
      );
    } else if (validScreenshots > 0) {
      UI.utils.showStatus(
        `✓ ${validScreenshots} screenshots captured for ${url}`,
        false
      );
    } else if (errorScreenshots > 0) {
      UI.utils.showStatus(
        `✗ All ${errorScreenshots} screenshot attempts failed for ${url}`,
        true
      );
    }
  }

  async captureScreenshots() {
    const startTotalTime = performance.now();
    try {
      AppState.reset();
      UI.utils.resetUI();
      this.usingActionSequences = false;
      UI.thumbnails.createLiveThumbnailsContainer();
      UI.thumbnails.addCombineAllToPDFButton();
      const rawUrlList = UI.elements.urlList.value;
      const urlList = URLProcessor.processUrlList(rawUrlList);
      UI.progress.updateStats(urlList.length, 0, 0, 0);
      if (urlList.length === 0) {
        throw new URLProcessingError(
          "Please enter at least one valid local URL.",
          rawUrlList
        );
      }
      // Always use fixed naming format; no naming pattern or custom text.
      const capturePreset = UI.elements.capturePreset.value || "fullHD";
      const actionsText = UI.elements.actionsField
        ? UI.elements.actionsField.value.trim()
        : "";
      let actionSequences = [];
      if (actionsText) {
        try {
          actionSequences = JSON.parse(actionsText);
          console.log(`Loaded ${actionSequences.length} action sequences`);
          this.usingActionSequences = actionSequences.length > 0;
        } catch (error) {
          throw new Error(
            `Error parsing actions JSON: ${error.message}. Please check the format.`
          );
        }
      }
      UI.elements.retryFailedBtn.disabled = true;
      for (let i = 0; i < urlList.length; i++) {
        const url = urlList[i];
        UI.progress.updateProgressMessage(
          `Processing ${i + 1} of ${urlList.length}: ${url}`
        );
        try {
          let result;
          if (actionSequences && actionSequences.length > 0) {
            try {
              const timestamp = URLProcessor.getTimestamp();
              const processImmediately = (actionResult) => {
                const sequenceName = actionResult.sequenceName || "Unknown";
                console.log(
                  `Processing immediate result for ${url} - ${sequenceName}`,
                  actionResult
                );
                const baseFileName = URLProcessor.generateFilename(url, i, "");
                const fileName = baseFileName.replace(
                  ".png",
                  `_${sequenceName.replace(/\s+/g, "_")}_${timestamp}.png`
                );
                if (actionResult.error) {
                  UI.thumbnails.addLiveThumbnail(
                    actionResult,
                    fileName,
                    sequenceName,
                    false,
                    false
                  );
                  UI.utils.showStatus(
                    `✗ Failed for "${sequenceName}": ${
                      actionResult.errorMessage || "Mount error"
                    }`,
                    true
                  );
                  return;
                }
                const isToolbarAction = sequenceName.includes("Button");
                actionResult.fileName = fileName;
                UI.thumbnails.addLiveThumbnail(
                  actionResult,
                  fileName,
                  sequenceName,
                  false,
                  isToolbarAction
                );
                UI.utils.showStatus(
                  `✓ Screenshot captured: ${sequenceName} (${actionResult.preset} - ${actionResult.width}x${actionResult.height}) (Time: ${actionResult.timeTaken}s)`,
                  false
                );
                if (!result) {
                  result = actionResult;
                }
              };
              const results = await ScreenshotCapture.takeSequentialScreenshots(
                url,
                capturePreset,
                actionSequences,
                processImmediately
              );
              console.log(`Got ${results.length} results for ${url}`, results);
              const lastValidResult = results.filter((r) => !r.error).pop();
              if (lastValidResult) {
                result = lastValidResult;
                console.log(`Valid result found for ${url}`, result);
              } else {
                console.warn(`No valid results found for ${url}`);
              }
            } catch (error) {
              console.error(`Error capturing screenshots for ${url}:`, error);
              AppState.addFailedUrl(url);
              UI.utils.showStatus(
                `✗ Failed to capture screenshots: ${url} (${error.message})`,
                true
              );
              UI.progress.updateStats(
                urlList.length,
                i,
                AppState.failedUrls.length + 1,
                0
              );
              continue;
            }
          } else {
            try {
              result = await ScreenshotCapture.takeScreenshot(
                url,
                capturePreset
              );
              console.log(`Screenshot captured for ${url}`, result);
              const timestamp = URLProcessor.getTimestamp();
              const fileName = URLProcessor.generateFilename(
                url,
                i,
                ""
              ).replace(".png", `_${timestamp}.png`);
              result.fileName = fileName;
              UI.thumbnails.addLiveThumbnail(result, fileName);
              console.log(`Thumbnail added for ${url}`);
            } catch (error) {
              console.error(`Error capturing screenshot for ${url}:`, error);
              if (
                error.message &&
                (error.message.includes(
                  "No view configured for center mount"
                ) ||
                  error.message.includes(
                    "Mount definition should contain a property"
                  ))
              ) {
                const errorResult = {
                  error: true,
                  errorMessage: error.message,
                  sequenceName: url,
                };
                const timestamp = URLProcessor.getTimestamp();
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
                UI.utils.showStatus(
                  `✗ Failed to capture screenshot: ${url} (Mount error)`,
                  true
                );
                AppState.addFailedUrl(url);
                continue;
              }
              AppState.addFailedUrl(url);
              UI.utils.showStatus(
                `✗ Failed to capture screenshot: ${url} (${error.message})`,
                true
              );
              UI.progress.updateStats(
                urlList.length,
                i,
                AppState.failedUrls.length + 1,
                0
              );
              continue;
            }
          }
          if (result) {
            AppState.addScreenshot(url, result);
          } else {
            console.warn(`No result available to add to AppState for ${url}`);
          }
          UI.progress.updateStats(
            urlList.length,
            i + 1,
            AppState.failedUrls.length,
            0
          );
        } catch (error) {
          AppState.addFailedUrl(url);
          UI.utils.showStatus(
            `✗ Failed to capture screenshot: ${url} (${error.message})`,
            true
          );
          UI.progress.updateStats(
            urlList.length,
            i,
            AppState.failedUrls.length + 1,
            0
          );
        }
        UI.progress.updateProgress(i + 1, urlList.length);
      }
      const endTotalTime = performance.now();
      const totalTimeTaken = ((endTotalTime - startTotalTime) / 1000).toFixed(
        2
      );
      const successCount = urlList.length - AppState.failedUrls.length;
      UI.progress.updateStats(
        urlList.length,
        successCount,
        AppState.failedUrls.length,
        totalTimeTaken
      );
      UI.progress.updateProgressMessage(
        `Completed processing ${urlList.length} URLs (Total Time: ${totalTimeTaken}s)`
      );
      UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;
    } catch (error) {
      handleError(error, { logToConsole: true, showToUser: true });
    }
  }

  async retryFailedUrls() {
    if (AppState.failedUrls.length === 0) {
      alert("No failed URLs to retry.");
      return;
    }
    const startTotalTime = performance.now();
    try {
      const urlsToRetry = [...AppState.failedUrls];
      AppState.failedUrls = [];
      this.usingActionSequences = false;
      const capturePreset = UI.elements.capturePreset.value || "fullHD";
      const actionsText = UI.elements.actionsField
        ? UI.elements.actionsField.value.trim()
        : "";
      let actionSequences = [];
      if (actionsText) {
        try {
          actionSequences = JSON.parse(actionsText);
          this.usingActionSequences = actionSequences.length > 0;
        } catch (error) {
          throw new Error(
            `Error parsing actions JSON: ${error.message}. Please check the format.`
          );
        }
      }
      let completed = 0;
      UI.progress.updateProgressMessage(
        `Retrying ${urlsToRetry.length} failed URLs...`
      );
      UI.elements.progressBar.style.width = "0%";
      for (let i = 0; i < urlsToRetry.length; i++) {
        const url = urlsToRetry[i];
        UI.progress.updateProgressMessage(
          `Retrying ${i + 1} of ${urlsToRetry.length}: ${url}`
        );
        try {
          let result;
          if (actionSequences && actionSequences.length > 0) {
            try {
              const timestamp = URLProcessor.getTimestamp();
              const processImmediately = (actionResult) => {
                const sequenceName = actionResult.sequenceName || "Unknown";
                console.log(
                  `Processing immediate result for ${url} - ${sequenceName}`,
                  actionResult
                );
                const baseFileName = URLProcessor.generateFilename(url, i, "");
                const fileName = baseFileName.replace(
                  ".png",
                  `_${sequenceName.replace(/\s+/g, "_")}_${timestamp}.png`
                );
                if (actionResult.error) {
                  UI.thumbnails.addLiveThumbnail(
                    actionResult,
                    fileName,
                    sequenceName,
                    true,
                    false
                  );
                  UI.utils.showStatus(
                    `✗ Failed for "${sequenceName}": ${
                      actionResult.errorMessage || "Mount error"
                    }`,
                    true
                  );
                  return;
                }
                const isToolbarAction = sequenceName.includes("Button");
                actionResult.fileName = fileName;
                UI.thumbnails.addLiveThumbnail(
                  actionResult,
                  fileName,
                  sequenceName,
                  true,
                  isToolbarAction
                );
                UI.utils.showStatus(
                  `✓ Screenshot captured: ${sequenceName} (${actionResult.preset} - ${actionResult.width}x${actionResult.height}) (Time: ${actionResult.timeTaken}s)`,
                  false
                );
                if (!result) {
                  result = actionResult;
                }
              };
              const results = await ScreenshotCapture.takeSequentialScreenshots(
                url,
                capturePreset,
                actionSequences,
                processImmediately
              );
              console.log(`Got ${results.length} results for ${url}`, results);
              const lastValidResult = results.filter((r) => !r.error).pop();
              if (lastValidResult) {
                result = lastValidResult;
                console.log(`Valid result found for ${url}`, result);
              } else {
                console.warn(`No valid results found for ${url}`);
              }
            } catch (error) {
              console.error(`Error capturing screenshots for ${url}:`, error);
              AppState.addFailedUrl(url);
              UI.utils.showStatus(
                `✗ Failed to retry screenshot: ${url} (${error.message})`,
                true
              );
              continue;
            }
          } else {
            try {
              result = await ScreenshotCapture.takeScreenshot(
                url,
                capturePreset
              );
              const timestamp = URLProcessor.getTimestamp();
              const urlIndex = AppState.orderedUrls.indexOf(url);
              const fileName = URLProcessor.generateFilename(
                url,
                urlIndex,
                ""
              ).replace(".png", `_${timestamp}.png`);
              result.fileName = fileName;
              UI.thumbnails.addLiveThumbnail(result, fileName, null, true);
            } catch (error) {
              if (
                error.message &&
                (error.message.includes(
                  "No view configured for center mount"
                ) ||
                  error.message.includes(
                    "Mount definition should contain a property"
                  ))
              ) {
                const errorResult = {
                  error: true,
                  errorMessage: error.message,
                  sequenceName: url,
                };
                const timestamp = URLProcessor.getTimestamp();
                const urlIndex = AppState.orderedUrls.indexOf(url);
                const fileName = URLProcessor.generateFilename(
                  url,
                  urlIndex,
                  ""
                ).replace(".png", `_Error_${timestamp}.png`);
                UI.thumbnails.addLiveThumbnail(
                  errorResult,
                  fileName,
                  url,
                  true,
                  false
                );
                UI.utils.showStatus(
                  `✗ Failed to retry screenshot: ${url} (Mount error)`,
                  true
                );
                AppState.addFailedUrl(url);
                continue;
              }
              throw error;
            }
          }
          if (result) {
            AppState.addScreenshot(url, result);
            AppState.removeFailedUrl(url);
            UI.elements.processedCount.textContent =
              parseInt(UI.elements.processedCount.textContent) + 1;
          }
        } catch (error) {
          AppState.addFailedUrl(url);
          UI.utils.showStatus(
            `✗ Failed to capture screenshot on retry: ${url} (${error.message})`,
            true
          );
        }
        completed++;
        UI.progress.updateProgress(completed, urlsToRetry.length);
      }
      const endTotalTime = performance.now();
      const totalTimeTaken = ((endTotalTime - startTotalTime) / 1000).toFixed(
        2
      );
      UI.elements.failedCount.textContent =
        AppState.failedUrls.length.toString();
      UI.elements.totalTime.textContent = `${totalTimeTaken}s`;
      UI.progress.updateProgressMessage(
        `Completed retrying ${urlsToRetry.length} URLs (Total Time: ${totalTimeTaken}s).`
      );
      UI.elements.retryFailedBtn.disabled = AppState.failedUrls.length === 0;
    } catch (error) {
      handleError(error, { logToConsole: true, showToUser: true });
    }
  }
}

export default App;
