// screenshot/core.js - Core screenshot functionality
import config from "../config.js";
import * as errorHandling from "../errors.js";
import * as events from "../events.js";
import * as actions from "./actions.js";
import * as utils from "./utils.js";

// Private variable for timeout ID
let _waitTimeout = null;

/**
 * Take a screenshot of a URL using iframe
 * @param {string} url - URL to capture
 * @param {string} preset - Size preset to use
 * @param {Array} actionsList - Optional array of actions to perform before capturing
 * @returns {Promise<Object>} - Promise resolving to screenshot data
 */
export async function takeScreenshot(url, preset = "fullHD", actionsList = []) {
  // Clear any existing timeout
  if (_waitTimeout) {
    clearTimeout(_waitTimeout);
    _waitTimeout = null;
  }

  const startTime = performance.now();
  const iframe = document.getElementById("screenshotIframe");

  // Get dimensions from preset
  const sizePreset =
    config.screenshot.presets[preset] || config.screenshot.presets.fullHD;
  const width = sizePreset.width;
  const height = sizePreset.height;

  // Set iframe size to chosen preset
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;

  try {
    // Emit event: capture started
    events.emit(events.events.CAPTURE_STARTED, { url, preset });

    // Load the original URL into the iframe
    await loadUrlInIframe(iframe, url);

    // Wait for page rendering
    await waitForRendering(url);

    // If actions are provided, perform them to navigate within the page
    if (actionsList && actionsList.length > 0) {
      await actions.performActions(iframe.contentDocument, actionsList);
    }

    // *** NEW: Retrieve the current URL after performing actions ***
    // This will capture the URL of the submenu (if navigation occurred)
    const currentUrl = iframe.contentWindow.location.href;

    // Capture the screenshot using the current URL for overlay
    const { screenshotData, actualHeight } = await captureScreenshot(
      iframe,
      currentUrl,
      preset,
      width,
      height
    );

    // Create thumbnail and return results as before...
    // (Your existing code for thumbnail creation and returning the result)

    const endTime = performance.now();
    const timeTaken = ((endTime - startTime) / 1000).toFixed(2);
    const result = {
      screenshot: screenshotData,
      thumbnail: await utils.createThumbnail(
        screenshotData,
        config.screenshot.thumbnailSize.width,
        config.screenshot.thumbnailSize.height
      ),
      timeTaken,
      preset: preset,
      width: width,
      height: preset === "fullPage" ? actualHeight : height,
    };

    // Clean up by resetting iframe src and emitting event
    iframe.src = "about:blank";
    events.emit(events.events.SCREENSHOT_TAKEN, { url: currentUrl, result });

    return result;
  } catch (error) {
    // On error, clean up and rethrow as a ScreenshotError
    iframe.src = "about:blank";
    const captureError = new errorHandling.ScreenshotError(
      `Failed to capture screenshot for ${url}: ${error.message}`,
      url,
      error.message
    );
    events.emit(events.events.CAPTURE_FAILED, { url, error: captureError });
    throw captureError;
  }
}

/**
 * Load a URL in an iframe
 * @param {HTMLIFrameElement} iframe - The iframe element
 * @param {string} url - URL to load
 * @returns {Promise<void>} - Resolves when URL is loaded
 */
function loadUrlInIframe(iframe, url) {
  return new Promise((resolve, reject) => {
    const handleLoad = () => {
      iframe.removeEventListener("load", handleLoad);
      iframe.removeEventListener("error", handleError);
      resolve();
    };

    const handleError = () => {
      iframe.removeEventListener("load", handleLoad);
      iframe.removeEventListener("error", handleError);
      reject(new Error(`Failed to load ${url} in iframe`));
    };

    iframe.addEventListener("load", handleLoad);
    iframe.addEventListener("error", handleError);

    iframe.src = url;
  });
}

/**
 * Wait for page rendering to complete
 * @param {string} url - URL being captured
 * @returns {Promise<void>} - Resolves when rendering is complete
 */
function waitForRendering(url) {
  return new Promise((resolve) => {
    const waitTimeInSeconds =
      parseInt(document.getElementById("waitTime").value) || 10;
    let secondsLeft = waitTimeInSeconds;

    // Update message initially
    events.emit(events.events.CAPTURE_PROGRESS, {
      message: `Waiting for ${url} to render... (${secondsLeft}s remaining)`,
    });

    const startWait = () => {
      if (secondsLeft <= 0) {
        // Countdown complete
        resolve();
        return;
      }

      // Update countdown
      events.emit(events.events.CAPTURE_PROGRESS, {
        message: `Waiting for ${url} to render... (${secondsLeft}s remaining)`,
      });

      secondsLeft--;

      // Schedule next update
      _waitTimeout = setTimeout(startWait, 1000);
    };

    // Start the process
    _waitTimeout = setTimeout(startWait, 1000);
  });
}

/**
 * Capture a screenshot using html2canvas and overlay the URL.
 * @param {HTMLIFrameElement} iframe - The iframe containing the page.
 * @param {string} url - The URL to overlay on the screenshot.
 * @param {string} preset - Size preset to use.
 * @param {number} width - Capture width.
 * @param {number} height - Capture height.
 * @returns {Promise<Object>} - An object containing the screenshot data and actual height.
 */

async function captureScreenshot(iframe, url, preset, width, height) {
  const doc = iframe.contentDocument;
  const docElement = doc.documentElement;

  events.emit(events.events.CAPTURE_PROGRESS, {
    message: `Capturing screenshot (${width}x${height})...`,
  });

  let actualHeight = height;
  let options = { ...config.screenshot.html2canvasOptions };

  if (preset === "fullPage") {
    const docBody = doc.body;
    actualHeight = Math.max(
      docElement.scrollHeight || 0,
      docBody ? docBody.scrollHeight : 0
    );
    options = {
      ...options,
      width: width,
      height: actualHeight,
      windowWidth: width,
      windowHeight: actualHeight,
      onclone: function (clonedDoc) {
        const style = clonedDoc.createElement("style");
        style.textContent = `
          body, html { height: auto !important; overflow: visible !important; }
          div, section, article, main { overflow: visible !important; }
        `;
        clonedDoc.head.appendChild(style);
      },
    };
  } else {
    options = {
      ...options,
      width: width,
      height: height,
      windowWidth: width,
      windowHeight: height,
    };
  }

  const canvas = await html2canvas(docElement, options);

  // --- Overlay the current URL onto the canvas ---
  const ctx = canvas.getContext("2d");
  const overlayHeight = 30;

  // Draw a semi-transparent background rectangle at the bottom
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, canvas.height - overlayHeight, canvas.width, overlayHeight);

  // Set text properties and draw the URL text
  ctx.font = "16px Arial";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(url, 10, canvas.height - overlayHeight / 2);
  // --- End overlay ---

  const screenshotData = canvas.toDataURL("image/png");
  return { screenshotData, actualHeight };
}

export { captureScreenshot };

/**
 * Download screenshot as a file
 * @param {string} screenshotData - Base64 screenshot data
 * @param {string} filename - Filename to save as
 */
export function downloadScreenshot(screenshotData, filename) {
  const link = document.createElement("a");
  link.href = screenshotData;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Emit event
  events.emit(events.events.SCREENSHOT_SAVED, { filename });
}

/**
 * Take a series of screenshots after performing different actions
 * @param {string} url - Base URL to capture
 * @param {string} preset - Size preset to use
 * @param {Array} actionSequences - Array of action sequences
 * @returns {Promise<Array>} - Promise resolving to array of screenshot data
 */
export async function takeSequentialScreenshots(
  url,
  preset = "fullHD",
  actionSequences = []
) {
  const results = [];

  try {
    // For each sequence in the action sequences
    for (let i = 0; i < actionSequences.length; i++) {
      const sequence = actionSequences[i];
      const sequenceName = sequence.name || `Step ${i + 1}`;

      events.emit(events.events.CAPTURE_PROGRESS, {
        message: `Starting sequence: ${sequenceName} (${i + 1}/${
          actionSequences.length
        })`,
      });

      // Take screenshot after performing the sequence actions
      const screenshotData = await takeScreenshot(
        url,
        preset,
        sequence.actions
      );

      // Add sequence info to the result
      results.push({
        ...screenshotData,
        sequenceName: sequenceName,
        sequenceIndex: i,
      });

      events.emit(events.events.CAPTURE_PROGRESS, {
        message: `Completed sequence: ${sequenceName} (${i + 1}/${
          actionSequences.length
        })`,
      });
    }

    return results;
  } catch (error) {
    // Create and throw a proper error
    const sequentialError = new errorHandling.ScreenshotError(
      `Error in sequential screenshots for ${url}: ${error.message}`,
      url,
      error.message
    );

    throw sequentialError;
  }
}
