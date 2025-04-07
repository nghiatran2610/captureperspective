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
 * This version properly handles full page height capture.
 *
 * @param {string} url - The URL to capture.
 * @param {string} [preset='fullHD'] - The size preset to use.
 * @param {Array} [actionsList=[]] - Optional array of actions to perform before capturing.
 * @returns {Promise<Object>} - An object containing the screenshot, thumbnail, time taken, etc.
 */
export async function takeScreenshot(url, preset = "fullHD", actionsList = []) {
  // Clear any existing timeout
  if (_waitTimeout) {
    clearTimeout(_waitTimeout);
    _waitTimeout = null;
  }

  const startTime = performance.now();
  const iframe = document.getElementById("screenshotIframe");
  let mountErrorDetected = false;

  // Set up a MutationObserver to watch for mount errors in the DOM
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        // Check each added node for error messages
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            // Element node
            const text = node.textContent || "";
            if (
              text.includes("No view configured for center mount") ||
              text.includes("Mount definition should contain a property")
            ) {
              mountErrorDetected = true;
              console.log("Mount error detected by observer:", text);
            }

            // Check children for error messages too
            const errorEls = node.querySelectorAll(
              ".error-message, .warning-message, .error"
            );
            for (const el of errorEls) {
              const elText = el.textContent || "";
              if (
                elText.includes("No view configured for center mount") ||
                elText.includes("Mount definition should contain a property")
              ) {
                mountErrorDetected = true;
                console.log("Mount error detected in child element:", elText);
              }
            }
          }
        }
      }
    }
  });

  let width, height;

  // Initialize with standard dimensions
  if (preset === "fullPage") {
    // For fullPage, use a fixed width but we'll determine the height later
    width = 1920;
    height = 1080; // initial height, will be updated
  } else {
    const sizePreset =
      config.screenshot.presets[preset] || config.screenshot.presets.fullHD;
    width = sizePreset.width;
    height = sizePreset.height;
  }

  // Set initial dimensions for the iframe.
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;

  try {
    events.emit(events.events.CAPTURE_STARTED, { url, preset });

    // Start observing the iframe for changes
    observer.observe(iframe.contentDocument || iframe.contentWindow.document, {
      childList: true,
      subtree: true,
    });

    // Load the URL into the iframe and wait for it to render.
    await loadUrlInIframe(iframe, url);

    // Wait a bit to ensure any mount errors are caught
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Check if a mount error was detected during loading
    if (mountErrorDetected) {
      observer.disconnect();
      throw new errorHandling.ScreenshotError(
        "Failed to capture screenshot: No view configured for center mount error detected",
        url,
        "Mount error detected during loading"
      );
    }

    const renderResult = await waitForRendering(url, iframe);

    // If rendering failed due to specific errors, abort screenshot capture
    if (!renderResult.success) {
      observer.disconnect();
      throw new errorHandling.ScreenshotError(
        `Failed to capture screenshot: ${renderResult.error}`,
        url,
        renderResult.error
      );
    }

    // Perform any action sequences (e.g., navigating to submenus)
    if (actionsList && actionsList.length > 0) {
      await actions.performActions(iframe.contentDocument, actionsList);

      // Check again for mount errors after actions
      if (mountErrorDetected) {
        observer.disconnect();
        throw new errorHandling.ScreenshotError(
          "Failed to capture screenshot: No view configured for center mount error detected after actions",
          url,
          "Mount error detected after actions"
        );
      }
      
      // Give the page a moment to settle after actions
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Stop observing now that we're past the error-prone part
    observer.disconnect();

    // Retrieve the current URL from the iframe after navigation.
    const currentUrl = iframe.contentWindow.location.href;

    // For fullPage, calculate the accurate page height
    let actualHeight = height;
    
    if (preset === "fullPage") {
      const doc = iframe.contentDocument;
      
      // Try multiple approaches to get the full page height
      const bodyScrollHeight = doc.body ? doc.body.scrollHeight : 0;
      const docScrollHeight = doc.documentElement ? doc.documentElement.scrollHeight : 0;
      const bodyOffsetHeight = doc.body ? doc.body.offsetHeight : 0;
      const docOffsetHeight = doc.documentElement ? doc.documentElement.offsetHeight : 0;
      
      // Find all elements and get their bottom positions
      const allElements = doc.querySelectorAll('*');
      let maxBottom = 0;
      
      for (const el of allElements) {
        const rect = el.getBoundingClientRect();
        const bottom = rect.bottom + window.pageYOffset;
        if (bottom > maxBottom) {
          maxBottom = bottom;
        }
      }
      
      console.log("Body scroll height:", bodyScrollHeight);
      console.log("Document scroll height:", docScrollHeight);
      console.log("Body offset height:", bodyOffsetHeight);
      console.log("Document offset height:", docOffsetHeight);
      console.log("Max element bottom:", maxBottom);
      
      // Use the maximum of all these values to ensure we capture everything
      actualHeight = Math.max(
        bodyScrollHeight,
        docScrollHeight,
        bodyOffsetHeight,
        docOffsetHeight,
        maxBottom,
        1080 // Minimum height of 1080
      );
      
      console.log("Final calculated height for fullPage:", actualHeight);
      
      // Update the iframe height to the calculated height
      iframe.style.height = `${actualHeight}px`;
      
      // Ensure that the body and documentElement heights are set to allow full capture
      try {
        doc.body.style.height = 'auto';
        doc.body.style.overflow = 'visible';
        doc.documentElement.style.height = 'auto';
        doc.documentElement.style.overflow = 'visible';
      } catch (e) {
        console.warn("Couldn't set document styles:", e);
      }
      
      // Wait for the resize to take effect
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Capture the screenshot
    const { screenshotData, actualHeight: finalHeight } =
      await captureScreenshot(iframe, currentUrl, preset, width, actualHeight);

    // Create a thumbnail for display.
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
      preset,
      width,
      height: preset === "fullPage" ? finalHeight : height,
    };

    // Clean up by resetting the iframe and emit the completion event.
    iframe.src = "about:blank";
    events.emit(events.events.SCREENSHOT_TAKEN, { url: currentUrl, result });

    return result;
  } catch (error) {
    // Clean up observer
    observer.disconnect();

    // On error, reset the iframe and propagate the error.
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
 * Load a URL into the iframe.
 *
 * @param {HTMLIFrameElement} iframe - The iframe element.
 * @param {string} url - The URL to load.
 * @returns {Promise<void>} - Resolves when the URL is loaded.
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
 * Wait for the page to render.
 * Also checks for specific errors like "No view configured for center mount"
 *
 * @param {string} url - The URL being captured.
 * @param {HTMLIFrameElement} iframe - The iframe containing the page.
 * @returns {Promise<{success: boolean, error: string|null}>} - Resolves when the rendering wait time is complete.
 */
function waitForRendering(url, iframe) {
  return new Promise((resolve) => {
    const waitTimeInSeconds =
      parseInt(document.getElementById("waitTime").value) || 10;
    let secondsLeft = waitTimeInSeconds;
    let consoleErrorFound = false;

    events.emit(events.events.CAPTURE_PROGRESS, {
      message: `Waiting for ${url} to render... (${secondsLeft}s remaining)`,
    });

    // Override console.warn and console.error to catch mount errors
    const originalWarn = console.warn;
    const originalError = console.error;

    console.warn = function (...args) {
      originalWarn.apply(console, args);

      // Check if this is a mount error
      const warningText = args.join(" ");
      if (
        warningText.includes("No view configured for center mount") ||
        warningText.includes("Mount definition should contain a property")
      ) {
        consoleErrorFound = true;
        console.warn = originalWarn; // Restore original
        resolve({
          success: false,
          error: "No view configured for center mount error in console",
        });
      }
    };

    console.error = function (...args) {
      originalError.apply(console, args);

      // Check if this is a mount error
      const errorText = args.join(" ");
      if (
        errorText.includes("No view configured for center mount") ||
        errorText.includes("Mount definition should contain a property")
      ) {
        consoleErrorFound = true;
        console.error = originalError; // Restore original
        resolve({
          success: false,
          error: "No view configured for center mount error in console",
        });
      }
    };

    // Wait for the DOM content to be fully loaded and images to be loaded
    const waitForImages = () => {
      try {
        if (!iframe.contentDocument) return false;
        
        const imgElements = iframe.contentDocument.querySelectorAll('img');
        const backgroundImgElements = Array.from(iframe.contentDocument.querySelectorAll('*')).filter(el => {
          const style = window.getComputedStyle(el);
          return style.backgroundImage && style.backgroundImage !== 'none';
        });
        
        // Check if all images are loaded
        const allImagesLoaded = Array.from(imgElements).every(img => {
          return img.complete;
        });
        
        return allImagesLoaded;
      } catch (e) {
        console.warn("Error checking image loading status:", e);
        return true; // Assume images are loaded if there's an error
      }
    };

    // Function to check for specific error messages in the DOM
    const checkForErrors = () => {
      try {
        if (!iframe.contentDocument) return { found: false };

        // Check for "No view configured for center mount" warning
        const errorElements = iframe.contentDocument.querySelectorAll(
          ".error-message, .warning-message, .error"
        );
        for (const el of errorElements) {
          const text = el.textContent || "";
          if (
            text.includes("No view configured for center mount") ||
            text.includes("Mount definition should contain a property")
          ) {
            return {
              found: true,
              message:
                "No view configured for center mount error detected in DOM",
            };
          }
        }

        // Check for other common error indicators
        const notFoundElements = iframe.contentDocument.querySelectorAll(
          '.not-found, .error-page, [data-error="not-found"]'
        );
        if (notFoundElements.length > 0) {
          return {
            found: true,
            message: "Page not found or error page detected",
          };
        }

        return { found: false };
      } catch (e) {
        console.warn("Error checking for page errors:", e);
        return { found: false };
      }
    };

    const countdown = () => {
      // Check for errors immediately
      const errorCheck = checkForErrors();
      if (errorCheck.found) {
        // Restore original console methods
        console.warn = originalWarn;
        console.error = originalError;
        resolve({ success: false, error: errorCheck.message });
        return;
      }

      // Check if all images are loaded
      const imagesLoaded = waitForImages();

      // Check if countdown finished
      if ((secondsLeft <= 0 && imagesLoaded) || consoleErrorFound) {
        // Restore original console methods
        console.warn = originalWarn;
        console.error = originalError;

        if (consoleErrorFound) {
          resolve({
            success: false,
            error: "No view configured for center mount error detected",
          });
        } else {
          // Give a little extra time after images are loaded for any JavaScript rendering
          setTimeout(() => {
            resolve({ success: true, error: null });
          }, 500);
        }
        return;
      }

      events.emit(events.events.CAPTURE_PROGRESS, {
        message: `Waiting for ${url} to render... (${secondsLeft}s remaining)`,
      });

      secondsLeft--;
      _waitTimeout = setTimeout(countdown, 1000);
    };

    _waitTimeout = setTimeout(countdown, 1000);
  });
}

/**
 * Capture a screenshot using html2canvas and overlay the URL.
 * Enhanced to properly handle fullPage captures of any height.
 *
 * @param {HTMLIFrameElement} iframe - The iframe containing the page.
 * @param {string} url - The URL to overlay on the screenshot.
 * @param {string} preset - The size preset.
 * @param {number} width - The capture width.
 * @param {number} height - The capture height (may be recalculated).
 * @returns {Promise<Object>} - An object containing the screenshot data and the actual height.
 */
async function captureScreenshot(iframe, url, preset, width, height) {
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  
  events.emit(events.events.CAPTURE_PROGRESS, {
    message: `Capturing screenshot (${width}x${height})...`,
  });

  if (preset === "fullPage") {
    // For fullPage, we need special handling to capture the entire document
    
    // Temporarily remove any fixed elements or modify their positioning
    // This prevents duplicated fixed elements in the screenshot
    const fixedElements = Array.from(doc.querySelectorAll('*')).filter(el => {
      const style = window.getComputedStyle(el);
      return style.position === 'fixed';
    });
    
    // Store original styles for restoration later
    const originalStyles = fixedElements.map(el => ({
      element: el,
      position: el.style.position,
      top: el.style.top,
      left: el.style.left,
      right: el.style.right,
      bottom: el.style.bottom
    }));
    
    // Modify fixed elements to ensure they're captured correctly
    fixedElements.forEach(el => {
      el.style.position = 'absolute';
    });
    
    // Set up html2canvas options for fullPage
    const options = {
      ...config.screenshot.html2canvasOptions,
      // Set explicit dimensions
      width: width,
      height: height,
      // These ensure the entire page is captured
      windowWidth: width,
      windowHeight: height,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      // Important for better rendering
      scale: 1,
      allowTaint: true,
      useCORS: true,
      logging: true,
      // Use the entire document
      ignoreElements: (element) => {
        // Ignore any elements that might interfere with capture
        return element.classList && 
               (element.classList.contains('screenshot-ignore') || 
                element.classList.contains('temp-element'));
      },
      onclone: (documentClone) => {
        // This is called with the cloned document before rendering
        // We can make additional adjustments here if needed
        const clonedBody = documentClone.body;
        if (clonedBody) {
          clonedBody.style.height = `${height}px`;
          clonedBody.style.overflow = 'visible';
        }
        documentClone.documentElement.style.height = `${height}px`;
        documentClone.documentElement.style.overflow = 'visible';
        return documentClone;
      }
    };

    // Generate the canvas using html2canvas
    const canvas = await html2canvas(doc.documentElement, options);
    
    // Restore original positioning for fixed elements
    originalStyles.forEach(item => {
      item.element.style.position = item.position;
      item.element.style.top = item.top;
      item.element.style.left = item.left;
      item.element.style.right = item.right;
      item.element.style.bottom = item.bottom;
    });
    
    // Overlay the URL onto the canvas
    const ctx = canvas.getContext("2d");
    const overlayHeight = 30;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, canvas.height - overlayHeight, canvas.width, overlayHeight);
    ctx.font = "16px Arial";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(url, 10, canvas.height - overlayHeight / 2);

    const screenshotData = canvas.toDataURL("image/png");
    return { screenshotData, actualHeight: canvas.height };
  } else {
    // For fixed size presets, keep the original approach
    const options = {
      ...config.screenshot.html2canvasOptions,
      width: width,
      height: height,
      windowWidth: width,
      windowHeight: height,
      scale: 1,
      allowTaint: true,
      useCORS: true
    };

    // Generate the canvas using html2canvas
    const canvas = await html2canvas(doc.documentElement, options);

    // Overlay the URL onto the canvas
    const ctx = canvas.getContext("2d");
    const overlayHeight = 30;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, canvas.height - overlayHeight, canvas.width, overlayHeight);
    ctx.font = "16px Arial";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(url, 10, canvas.height - overlayHeight / 2);

    const screenshotData = canvas.toDataURL("image/png");
    return { screenshotData, actualHeight: canvas.height };
  }
}

/**
 * Download the screenshot as a file.
 *
 * @param {string} screenshotData - The Base64 screenshot data.
 * @param {string} filename - The filename to save the screenshot as.
 */
export function downloadScreenshot(screenshotData, filename) {
  const link = document.createElement("a");
  link.href = screenshotData;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  events.emit(events.events.SCREENSHOT_SAVED, { filename });
}

/**
 * Take sequential screenshots by executing different action sequences.
 * Process results immediately after each capture.
 *
 * @param {string} url - The base URL to capture.
 * @param {string} [preset='fullHD'] - The size preset to use.
 * @param {Array} [actionSequences=[]] - An array of action sequences.
 * @param {Function} [processCallback=null] - Optional callback to process each result immediately
 * @returns {Promise<Array>} - An array of screenshot results.
 */
export async function takeSequentialScreenshots(
  url,
  preset = "fullHD",
  actionSequences = [],
  processCallback = null
) {
  const results = [];
  try {
    for (let i = 0; i < actionSequences.length; i++) {
      const sequence = actionSequences[i];
      const sequenceName = sequence.name || `Step ${i + 1}`;

      try {
        events.emit(events.events.CAPTURE_PROGRESS, {
          message: `Starting sequence: ${sequenceName} (${i + 1}/${
            actionSequences.length
          })`,
        });

        // Take the screenshot
        const screenshotData = await takeScreenshot(
          url,
          preset,
          sequence.actions
        );

        // Add sequence info
        const result = {
          ...screenshotData,
          sequenceName: sequenceName,
          sequenceIndex: i,
        };

        // Add to results array
        results.push(result);

        // Process this result immediately if callback provided
        if (typeof processCallback === "function") {
          processCallback(result);
        }

        events.emit(events.events.CAPTURE_PROGRESS, {
          message: `Completed sequence: ${sequenceName} (${i + 1}/${
            actionSequences.length
          })`,
        });

        // Emit a custom event for this specific screenshot
        events.emit("SCREENSHOT_SEQUENCE_TAKEN", {
          url,
          result,
          sequenceName,
          sequenceIndex: i,
          totalSequences: actionSequences.length,
        });
      } catch (sequenceError) {
        // If this is a mount error, log it and continue with the next sequence
        if (
          sequenceError.message &&
          (sequenceError.message.includes(
            "No view configured for center mount"
          ) ||
            sequenceError.message.includes(
              "Mount definition should contain a property"
            ))
        ) {
          console.warn(
            `Skipping sequence "${sequenceName}" due to mount error:`,
            sequenceError.message
          );
          events.emit(events.events.CAPTURE_PROGRESS, {
            message: `Skipped sequence: ${sequenceName} due to mount error (${
              i + 1
            }/${actionSequences.length})`,
          });

          // Create an error result
          const errorResult = {
            sequenceName: sequenceName + " (Error: No view configured)",
            sequenceIndex: i,
            error: true,
            errorMessage: sequenceError.message,
          };

          // Add to results array
          results.push(errorResult);

          // Process this error result immediately if callback provided
          if (typeof processCallback === "function") {
            processCallback(errorResult);
          }

          // Emit an error event
          events.emit("SCREENSHOT_SEQUENCE_ERROR", {
            url,
            error: errorResult,
            sequenceName,
            sequenceIndex: i,
            totalSequences: actionSequences.length,
          });

          continue; // Skip to next sequence
        }

        // For other errors, propagate them up
        throw sequenceError;
      }
    }
    return results;
  } catch (error) {
    const sequentialError = new errorHandling.ScreenshotError(
      `Error in sequential screenshots for ${url}: ${error.message}`,
      url,
      error.message
    );
    throw sequentialError;
  }
}