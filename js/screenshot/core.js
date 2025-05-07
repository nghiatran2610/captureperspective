// screenshot/core.js - Centralized screenshot capture functionality
import config from "../config.js";
import * as errorHandling from "../errors.js";
import * as events from "../events.js";
import * as actions from "./actions.js";
import * as utils from "./utils.js";

// Private variable for timeout ID
let _waitTimeout = null;

/**
 * Capture a screenshot of a URL with optional actions.
 * This version handles full page height capture based on a flag.
 *
 * @param {string} url - The URL to capture.
 * @param {string} [preset='fullHD'] - The base size preset key (e.g., 'fullHD', 'mobile').
 * @param {boolean} [captureFullPage=false] - Flag to indicate if full page height should be captured.
 * @param {Array} [actionsList=[]] - Optional array of actions to perform before capturing.
 * @returns {Promise<Object>} - An object containing the screenshot, thumbnail, time taken, etc.
 */
export async function takeScreenshot(
  url,
  preset = "fullHD",
  captureFullPage = false,
  actionsList = []
) {
  // Clear any existing timeout
  if (_waitTimeout) {
    clearTimeout(_waitTimeout);
    _waitTimeout = null;
  }

  const startTime = performance.now();
  const iframe = document.getElementById("screenshotIframe");
  let detectedMountIssueDuringLoad = false;
  let detectedMountIssueMessage = null;

  // Set up a MutationObserver to watch for mount errors in the DOM
  // This observer will only set flags, not throw errors directly.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            // Element node
            const text = node.textContent || "";
            if (
              text.includes("No view configured for center mount") ||
              text.includes("Mount definition should contain a property")
            ) {
              detectedMountIssueDuringLoad = true;
              detectedMountIssueMessage = text;
              console.warn("Mount issue detected by observer:", text);
            }
            const errorEls = node.querySelectorAll(
              ".error-message, .warning-message, .error"
            );
            for (const el of errorEls) {
              const elText = el.textContent || "";
              if (
                elText.includes("No view configured for center mount") ||
                elText.includes("Mount definition should contain a property")
              ) {
                detectedMountIssueDuringLoad = true;
                detectedMountIssueMessage = elText;
                console.warn(
                  "Mount issue detected in child element by observer:",
                  elText
                );
              }
            }
          }
        }
      }
    }
  });

  const basePreset =
    config.screenshot.presets[preset] || config.screenshot.presets.fullHD;
  let width = basePreset.width;
  let initialHeight = basePreset.height;
  let actualHeight = initialHeight;

  iframe.style.width = `${width}px`;
  iframe.style.height = `${initialHeight}px`;

  let wasMountIssueDetectedInRendering = false;
  let finalDetectedMountIssueMessage = null;

  try {
    events.emit(events.events.CAPTURE_STARTED, {
      url,
      preset,
      captureFullPage,
    });

    observer.observe(iframe.contentDocument || iframe.contentWindow.document, {
      childList: true,
      subtree: true,
    });

    await loadUrlInIframe(iframe, url);
    await new Promise((resolve) => setTimeout(resolve, 300)); // Allow observer to catch early errors

    if (detectedMountIssueDuringLoad) {
      console.warn(
        `Mount issue was detected during initial load for ${url}: ${detectedMountIssueMessage}`
      );
      finalDetectedMountIssueMessage = detectedMountIssueMessage;
      wasMountIssueDetectedInRendering = true; // Mark that an issue was found
    }

    // waitForRendering will now resolve successfully even if mount issues are found,
    // but will pass back a flag.
    const renderResult = await waitForRendering(url, iframe);

    if (renderResult.detectedMountIssue) {
      wasMountIssueDetectedInRendering = true;
      finalDetectedMountIssueMessage =
        renderResult.mountIssueMessage ||
        finalDetectedMountIssueMessage ||
        "Mount issue detected during rendering.";
      console.warn(
        `Mount issue noted by waitForRendering for ${url}: ${finalDetectedMountIssueMessage}`
      );
    }

    // If rendering truly failed for other reasons, then throw an error.
    if (!renderResult.success && !renderResult.detectedMountIssue) {
      observer.disconnect();
      throw new errorHandling.ScreenshotError(
        `Failed to capture screenshot: ${renderResult.error}`,
        url,
        renderResult.error
      );
    }

    if (actionsList && actionsList.length > 0) {
      await actions.performActions(iframe.contentDocument, actionsList);
      // Re-check observer flag after actions, as actions might trigger new mount issues
      if (detectedMountIssueDuringLoad && !wasMountIssueDetectedInRendering) {
        // If observer caught something new
        console.warn(
          `Mount issue detected by observer after actions for ${url}: ${detectedMountIssueMessage}`
        );
        finalDetectedMountIssueMessage = detectedMountIssueMessage;
        wasMountIssueDetectedInRendering = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    observer.disconnect();
    const currentUrl = iframe.contentWindow.location.href;

    if (captureFullPage) {
      const doc = iframe.contentDocument;
      const bodyScrollHeight = doc.body ? doc.body.scrollHeight : 0;
      const docScrollHeight = doc.documentElement
        ? doc.documentElement.scrollHeight
        : 0;
      const bodyOffsetHeight = doc.body ? doc.body.offsetHeight : 0;
      const docOffsetHeight = doc.documentElement
        ? doc.documentElement.offsetHeight
        : 0;

      const allElements = doc.querySelectorAll("*");
      let maxBottom = 0;
      for (const el of allElements) {
        try {
          const rect = el.getBoundingClientRect();
          const scrollTop =
            iframe.contentWindow.pageYOffset ||
            doc.documentElement.scrollTop ||
            doc.body.scrollTop ||
            0;
          const bottom = rect.bottom + scrollTop;
          if (bottom > maxBottom) {
            maxBottom = bottom;
          }
        } catch (e) {
          /* ignore elements that might cause errors like SVG */
        }
      }

      actualHeight = Math.max(
        bodyScrollHeight,
        docScrollHeight,
        bodyOffsetHeight,
        docOffsetHeight,
        maxBottom,
        initialHeight
      );
      iframe.style.height = `${actualHeight}px`;

      try {
        doc.body.style.height = "auto";
        doc.body.style.overflow = "visible";
        doc.documentElement.style.height = "auto";
        doc.documentElement.style.overflow = "visible";
      } catch (e) {
        console.warn("Couldn't set document styles:", e);
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    } else {
      actualHeight = initialHeight;
      iframe.style.height = `${actualHeight}px`;
    }

    const { screenshotData } = await captureScreenshotInternal(
      iframe,
      currentUrl,
      width,
      actualHeight
    );
    const thumbnailData = await utils.createThumbnail(
      screenshotData,
      config.screenshot.thumbnailSize.width,
      config.screenshot.thumbnailSize.height
    );

    const endTime = performance.now();
    const timeTaken = ((endTime - startTime) / 1000).toFixed(2);

    const result = {
      screenshot: screenshotData,
      thumbnail: thumbnailData,
      timeTaken,
      preset: preset,
      isFullPage: captureFullPage,
      width: width,
      height: actualHeight,
      url: currentUrl,
      // NEW: Add a flag and message for detected mount issues
      detectedMountIssue: wasMountIssueDetectedInRendering,
      mountIssueMessage: wasMountIssueDetectedInRendering
        ? finalDetectedMountIssueMessage
        : null,
      error: false, // Explicitly set error to false if we reached here, even with mount issues
    };

    iframe.src = "about:blank";
    events.emit(events.events.SCREENSHOT_TAKEN, { url: currentUrl, result });
    return result;
  } catch (error) {
    // This catch block now primarily handles non-mount-related errors
    observer.disconnect();
    iframe.src = "about:blank";
    const errorMessage =
      error instanceof errorHandling.ScreenshotError
        ? error.message
        : `Failed to capture screenshot for ${url}: ${error.message}`;
    // If it was a mount issue that somehow re-threw as a generic error, treat it as a detected issue for consistency.
    const isOriginalMountError =
      errorMessage.includes("No view configured") ||
      errorMessage.includes("Mount definition");

    const captureError = new errorHandling.ScreenshotError(
      errorMessage,
      url,
      error.reason || error.message
    );

    if (isOriginalMountError) {
      console.warn(
        `Treating originally thrown mount error as a detectable issue for URL: ${url}`
      );
      // For CAPTURE_FAILED, we might need to decide if we send a "pretend success" result
      // or the actual error. For now, let's emit the error but app.js will handle it.
      // The key is that takeScreenshot itself shouldn't throw if the goal was to capture the error state.
      // This path implies html2canvas or a preceding step failed *after* a mount error was detected
      // but before we could successfully mark it as `detectedMountIssue: true` and `error: false`.
      events.emit(events.events.CAPTURE_FAILED, {
        url,
        error: captureError, // Original error
      });
    } else {
      events.emit(events.events.CAPTURE_FAILED, { url, error: captureError });
    }
    throw captureError; // Rethrow the standardized error for App.js to handle
  }
}

/**
 * Load a URL into the iframe.
 *
 * @param {HTMLIFrameElement} iframe - The iframe element.
 * @param {string} url - The URL to load.
 * @returns {Promise<void>} - Resolves when the URL is loaded.
 */
function loadUrlInIframe(iframe, url) {
  return new Promise((resolve, reject) => {
    let loadFired = false;
    const timeoutDuration = 30000; // 30 seconds timeout for load

    const loadTimeout = setTimeout(() => {
      if (!loadFired) {
        console.error(`Iframe load timeout for ${url}`);
        cleanup();
        reject(new Error(`Timeout loading ${url} in iframe`));
      }
    }, timeoutDuration);

    const handleLoad = () => {
      if (loadFired) return; // Prevent multiple triggers
      loadFired = true;
      console.log(`Iframe load event fired for ${url}`);
      cleanup();
      setTimeout(resolve, 200); // Wait for potential redirects/initial scripts
    };

    const handleError = (event) => {
      console.error(`Iframe error event for ${url}:`, event);
      cleanup();
      reject(new Error(`Error loading ${url} in iframe`));
    };

    const cleanup = () => {
      clearTimeout(loadTimeout);
      iframe.removeEventListener("load", handleLoad);
      iframe.removeEventListener("error", handleError);
    };

    iframe.addEventListener("load", handleLoad);
    iframe.addEventListener("error", handleError);

    try {
      if (
        iframe.contentWindow?.location?.href === url &&
        iframe.contentDocument?.readyState === "complete"
      ) {
        console.log(`Iframe already loaded with ${url}`);
        handleLoad();
        return;
      }
    } catch (e) {
      console.warn(
        "Cross-origin check failed, proceeding with src assignment."
      );
    }
    iframe.src = url;
  });
}

/**
 * Wait for the page to render.
 * Checks for specific errors like "No view configured for center mount"
 * but will resolve successfully, passing a flag if such an error is found.
 *
 * @param {string} url - The URL being captured.
 * @param {HTMLIFrameElement} iframe - The iframe containing the page.
 * @returns {Promise<{success: boolean, error: string|null, detectedMountIssue?: boolean, mountIssueMessage?: string|null}>}
 */
function waitForRendering(url, iframe) {
  return new Promise((resolve) => {
    let waitTimeInSeconds = 10;
    try {
      const waitTimeInput =
        document.getElementById("waitTime") ||
        document.getElementById("simpleWaitTime");
      if (waitTimeInput && waitTimeInput.value) {
        waitTimeInSeconds = parseInt(waitTimeInput.value, 10);
        if (isNaN(waitTimeInSeconds) || waitTimeInSeconds < 1) {
          waitTimeInSeconds = 10;
        }
      }
    } catch (e) {
      console.warn("Error reading wait time, using default.", e);
    }

    let secondsLeft = waitTimeInSeconds;
    let consoleMountErrorFound = false;
    let domMountErrorFound = false; // Specific flag for DOM-detected mount errors
    let detectedMountIssueMsgInternal = null;
    let generalErrorMsg = null; // For non-mount errors that should fail rendering

    if (_waitTimeout) {
      clearTimeout(_waitTimeout);
      _waitTimeout = null;
    }

    events.emit(events.events.CAPTURE_PROGRESS, {
      message: `Waiting for ${url} to render... (${secondsLeft}s remaining)`,
    });

    const iframeWin = iframe.contentWindow;
    const originalWarn = iframeWin ? iframeWin.console.warn : console.warn;
    const originalError = iframeWin ? iframeWin.console.error : console.error;
    let restoreConsoleNeeded = false;

    const checkAndRestoreConsole = () => {
      if (restoreConsoleNeeded) {
        if (iframeWin) {
          iframeWin.console.warn = originalWarn;
          iframeWin.console.error = originalError;
        } else {
          console.warn = originalWarn; // Fallback if iframeWin was not available
          console.error = originalError;
        }
        restoreConsoleNeeded = false;
      }
    };

    const consoleProxyHandler =
      (originalFunc, type) =>
      (...args) => {
        originalFunc.apply(console, args);
        const text = args.join(" ");
        if (
          text.includes("No view configured for center mount") ||
          text.includes("Mount definition should contain a property")
        ) {
          console.warn(
            `Mount issue Detected via console.${type} for ${url}: ${text}`
          );
          consoleMountErrorFound = true;
          detectedMountIssueMsgInternal =
            detectedMountIssueMsgInternal ||
            `Console ${type}: ${text.substring(0, 100)}...`;
          // Don't resolve here, let countdown finish to capture the page state
        }
      };

    if (iframeWin) {
      // Check if iframe.contentWindow is accessible
      iframeWin.console.warn = consoleProxyHandler(originalWarn, "warn");
      iframeWin.console.error = consoleProxyHandler(originalError, "error");
      restoreConsoleNeeded = true;
    } else {
      console.warn(
        "Could not attach console proxy to iframe, console errors might not be caught for mount issue detection."
      );
    }

    const waitForImages = () => {
      try {
        if (!iframe.contentDocument) return false;
        const imgElements = iframe.contentDocument.querySelectorAll("img");
        return Array.from(imgElements).every(
          (img) => img.complete && img.naturalWidth !== 0
        );
      } catch (e) {
        console.warn("Error checking image loading status:", e);
        return true;
      }
    };

    const checkForDOMLoadErrors = () => {
      try {
        if (!iframe.contentDocument)
          return { found: false, isMountIssue: false };

        // Check for Perspective Mount Errors
        const mountErrorElements = iframe.contentDocument.querySelectorAll(
          ".error-message, .warning-message, .error"
        );
        for (const el of mountErrorElements) {
          const text = el.textContent || "";
          if (
            text.includes("No view configured for center mount") ||
            text.includes("Mount definition should contain a property")
          ) {
            console.warn(`Mount issue Detected in DOM for ${url}: ${text}`);
            domMountErrorFound = true; // Set DOM specific flag
            detectedMountIssueMsgInternal =
              detectedMountIssueMsgInternal ||
              `DOM: ${text.substring(0, 100)}...`;
            // This is a mount issue, not a general load error. We will proceed with screenshot.
            // So, return isMountIssue: true but found: false for general errors.
          }
        }

        // Check for other common error indicators (these are general failures)
        const notFoundElements = iframe.contentDocument.querySelectorAll(
          '.not-found, .error-page, [data-error="not-found"]'
        );
        if (notFoundElements.length > 0) {
          return {
            found: true,
            message: "Page not found or general error page detected",
            isMountIssue: false,
          };
        }
        return { found: false, isMountIssue: domMountErrorFound }; // Return if a mount issue was found in DOM
      } catch (e) {
        console.warn("Error checking for page errors:", e);
        return { found: false, isMountIssue: false };
      }
    };

    const countdown = () => {
      if (!resolve) return; // Already resolved

      const domLoadErrorCheck = checkForDOMLoadErrors();
      if (domLoadErrorCheck.found && !domLoadErrorCheck.isMountIssue) {
        // A general, non-mount error was found
        checkAndRestoreConsole();
        generalErrorMsg = domLoadErrorCheck.message;
        if (_waitTimeout) clearTimeout(_waitTimeout);
        _waitTimeout = null;
        resolve({
          success: false,
          error: generalErrorMsg,
          detectedMountIssue: false,
        }); // Hard fail
        resolve = null;
        return;
      }
      // If domLoadErrorCheck.isMountIssue is true, domMountErrorFound is already set.

      const imagesLoaded = waitForImages();

      if (secondsLeft <= 0 && imagesLoaded) {
        checkAndRestoreConsole();
        setTimeout(() => {
          // Extra grace period
          if (resolve) {
            const anyMountIssueFound =
              domMountErrorFound || consoleMountErrorFound;
            resolve({
              success: true, // SUCCESS is true, screenshot will be taken
              error: null, // No general error stopping the capture
              detectedMountIssue: anyMountIssueFound,
              mountIssueMessage: anyMountIssueFound
                ? detectedMountIssueMsgInternal
                : null,
            });
            resolve = null;
          }
        }, 500);
        _waitTimeout = null;
        return;
      }

      events.emit(events.events.CAPTURE_PROGRESS, {
        message: `Waiting for ${url} to render... (${secondsLeft}s remaining)`,
      });
      secondsLeft--;
      if (resolve) {
        _waitTimeout = setTimeout(countdown, 1000);
      } else {
        _waitTimeout = null;
      }
    };
    _waitTimeout = setTimeout(countdown, 1000);
  });
}

/**
 * Internal function to capture screenshot using html2canvas.
 *
 * @param {HTMLIFrameElement} iframe - The iframe containing the page.
 * @param {string} url - The URL to overlay on the screenshot.
 * @param {number} width - The capture width.
 * @param {number} height - The capture height.
 * @returns {Promise<{screenshotData: string}>} - An object containing the screenshot data.
 */
async function captureScreenshotInternal(iframe, url, width, height) {
  const doc = iframe.contentDocument;

  events.emit(events.events.CAPTURE_PROGRESS, {
    message: `Capturing screenshot (${width}x${height})...`,
  });

  const options = {
    ...config.screenshot.html2canvasOptions,
    width: width,
    height: height,
    windowWidth: width,
    windowHeight: height,
    x: 0,
    y: 0,
    scrollX: 0,
    scrollY: 0,
    ignoreElements: (element) => {
      return (
        element.classList && element.classList.contains("screenshot-ignore")
      );
    },
    onclone: (documentClone) => {
      if (documentClone.body) {
        documentClone.body.style.height = `${height}px`;
        documentClone.body.style.overflow = "visible";
      }
      if (documentClone.documentElement) {
        documentClone.documentElement.style.height = `${height}px`;
        documentClone.documentElement.style.overflow = "visible";
      }
    },
  };

  let originalStyles = [];
  if (height > iframe.contentWindow.innerHeight) {
    try {
      const fixedElements = Array.from(doc.querySelectorAll("*")).filter(
        (el) => {
          try {
            return (
              iframe.contentWindow.getComputedStyle(el).position === "fixed"
            );
          } catch (e) {
            return false;
          }
        }
      );
      originalStyles = fixedElements.map((el) => ({
        element: el,
        position: el.style.position,
      }));
      fixedElements.forEach((item) => {
        item.element.style.position = "absolute";
      });
    } catch (e) {
      console.warn("Error handling fixed elements:", e);
    }
  }

  const canvas = await html2canvas(doc.documentElement, options);

  if (originalStyles.length > 0) {
    try {
      originalStyles.forEach((item) => {
        item.element.style.position = item.position;
      });
    } catch (e) {
      console.warn("Error restoring fixed elements:", e);
    }
  }

  const ctx = canvas.getContext("2d");
  const overlayHeight = 30;
  const textY = canvas.height - overlayHeight / 2;
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, canvas.height - overlayHeight, canvas.width, overlayHeight);
  ctx.font = "14px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const textX = 10;
  ctx.fillText(url, textX, textY);

  const screenshotData = canvas.toDataURL("image/png");
  canvas.width = 1;
  canvas.height = 1;

  return { screenshotData };
}

/**
 * Download the screenshot as a file.
 *
 * @param {string} screenshotData - The Base64 screenshot data.
 * @param {string} filename - The filename to save the screenshot as.
 */
export function downloadScreenshot(screenshotData, filename) {
  try {
    if (!screenshotData || !filename) {
      console.error("Missing data or filename for download.");
      return;
    }
    const link = document.createElement("a");
    link.href = screenshotData;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    events.emit(events.events.SCREENSHOT_SAVED, { filename });
  } catch (error) {
    console.error("Error during screenshot download:", error);
  }
}

/**
 * Take sequential screenshots by executing different action sequences.
 * Process results immediately after each capture.
 *
 * @param {string} url - The base URL to capture.
 * @param {string} [preset='fullHD'] - The base size preset to use.
 * @param {boolean} [captureFullPage=false] - Whether to capture full page height.
 * @param {Array} [actionSequences=[]] - An array of action sequences.
 * @param {Function} [processCallback=null] - Optional callback to process each result immediately
 * @returns {Promise<Array>} - An array of screenshot results.
 */
export async function takeSequentialScreenshots(
  url,
  preset = "fullHD",
  captureFullPage = false,
  actionSequences = [],
  processCallback = null
) {
  const results = [];
  if (!actionSequences || actionSequences.length === 0) {
    console.warn(
      "takeSequentialScreenshots called without action sequences. Taking single screenshot."
    );
    try {
      const singleResult = await takeScreenshot(
        url,
        preset,
        captureFullPage,
        []
      );
      // Filename generation is now centralized in app.js based on the result.
      // Here, we just add sequence-specific info.
      singleResult.sequenceName = "Base Page";
      results.push(singleResult); // singleResult contains detectedMountIssue flags
      if (typeof processCallback === "function") {
        processCallback(singleResult);
      }
    } catch (error) {
      // This catch is for errors from the single takeScreenshot call
      const errorResult = {
        sequenceName: "Base Page (Error)",
        error: true, // This is a genuine capture error
        errorMessage: error.message,
        url: url,
        // Populate mount issue flags from the error if it was a ScreenshotError with that info
        detectedMountIssue:
          error instanceof errorHandling.ScreenshotError &&
          (error.message?.includes("No view configured") ||
            error.message?.includes("Mount definition")),
        mountIssueMessage:
          error instanceof errorHandling.ScreenshotError &&
          (error.message?.includes("No view configured") ||
            error.message?.includes("Mount definition"))
            ? error.message
            : null,
      };
      results.push(errorResult);
      if (typeof processCallback === "function") {
        processCallback(errorResult);
      }
      // Rethrow to indicate the base capture failed, which might be critical
      throw new errorHandling.ScreenshotError(
        `Base screenshot failed for sequential capture: ${error.message}`,
        url,
        error.reason
      );
    }
    return results;
  }

  try {
    for (let i = 0; i < actionSequences.length; i++) {
      const sequence = actionSequences[i];
      const sequenceName = sequence.name || `Step ${i + 1}`;
      let screenshotDataResult;

      try {
        events.emit(events.events.CAPTURE_PROGRESS, {
          message: `Starting sequence: ${sequenceName} (${i + 1}/${
            actionSequences.length
          })`,
        });

        screenshotDataResult = await takeScreenshot(
          url,
          preset,
          captureFullPage,
          sequence.actions
        );

        // screenshotDataResult from takeScreenshot already includes:
        // detectedMountIssue, mountIssueMessage, and error (which should be false if captured)
        const resultWithSequenceInfo = {
          ...screenshotDataResult,
          sequenceName: sequenceName,
          sequenceIndex: i,
          // 'error' field from screenshotDataResult is preserved.
          // If takeScreenshot "succeeded" by capturing a mount error page, screenshotDataResult.error is false.
        };
        // Filename generation will happen in app.js

        results.push(resultWithSequenceInfo);

        if (typeof processCallback === "function") {
          processCallback(resultWithSequenceInfo);
        }

        events.emit(events.events.CAPTURE_PROGRESS, {
          message: `Completed sequence: ${sequenceName} (${i + 1}/${
            actionSequences.length
          })`,
        });
        events.emit("SCREENSHOT_SEQUENCE_TAKEN", {
          url,
          result: resultWithSequenceInfo,
          sequenceName,
          sequenceIndex: i,
          totalSequences: actionSequences.length,
        });
      } catch (sequenceError) {
        // This catches errors if takeScreenshot itself threw for this sequence
        console.error(`Error in sequence "${sequenceName}":`, sequenceError);
        // This is a hard failure for this sequence if takeScreenshot threw.
        const errorResult = {
          sequenceName: sequenceName + " (Capture Error)",
          sequenceIndex: i,
          error: true, // Mark as a hard error for this sequence step
          errorMessage: sequenceError.message,
          url: sequenceError.url || url,
          // Check if the error from takeScreenshot was due to a mount issue that couldn't even be captured
          detectedMountIssue:
            sequenceError instanceof errorHandling.ScreenshotError &&
            (sequenceError.message?.includes("No view configured") ||
              sequenceError.message?.includes("Mount definition")),
          mountIssueMessage:
            sequenceError instanceof errorHandling.ScreenshotError &&
            (sequenceError.message?.includes("No view configured") ||
              sequenceError.message?.includes("Mount definition"))
              ? sequenceError.message
              : null,
        };
        results.push(errorResult);

        if (typeof processCallback === "function") {
          processCallback(errorResult);
        }
        events.emit("SCREENSHOT_SEQUENCE_ERROR", {
          url,
          error: errorResult,
          sequenceName,
          sequenceIndex: i,
          totalSequences: actionSequences.length,
        });

        // Rethrow to stop the entire sequential process on any hard sequence error.
        // If you want to continue to the next sequence on error, use `continue;` instead.
        throw sequenceError;
      }
      await new Promise((r) => setTimeout(r, 200)); // Optional delay between sequences
    }
    return results;
  } catch (error) {
    // Catch errors that stop the entire sequential process
    const sequentialError = new errorHandling.ScreenshotError(
      `Error during sequential screenshots for ${url}: ${error.message}`,
      url,
      error.message // Use the original error message for reason
    );
    events.emit(events.events.CAPTURE_FAILED, { url, error: sequentialError });
    throw sequentialError;
  }
}
