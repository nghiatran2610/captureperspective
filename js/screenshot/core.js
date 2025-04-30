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
export async function takeScreenshot(url, preset = "fullHD", captureFullPage = false, actionsList = []) {
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
          if (node.nodeType === 1) { // Element node
            const text = node.textContent || "";
            if (text.includes("No view configured for center mount") || text.includes("Mount definition should contain a property")) {
              mountErrorDetected = true;
              console.log("Mount error detected by observer:", text);
            }
             // Check children for error messages too
             const errorEls = node.querySelectorAll(".error-message, .warning-message, .error");
             for(const el of errorEls) {
                 const elText = el.textContent || "";
                 if (elText.includes("No view configured for center mount") || elText.includes("Mount definition should contain a property")) {
                     mountErrorDetected = true;
                     console.log("Mount error detected in child element:", elText);
                 }
             }
          }
        }
      }
    }
  });

  // --- MODIFIED: Get base dimensions from preset ---
  const basePreset = config.screenshot.presets[preset] || config.screenshot.presets.fullHD;
  let width = basePreset.width;
  let initialHeight = basePreset.height; // Use preset height initially or if not capturing full page
  let actualHeight = initialHeight; // This will be updated if captureFullPage is true
  // --- END MODIFICATION ---

  // Set initial dimensions for the iframe based on the *base* preset.
  iframe.style.width = `${width}px`;
  iframe.style.height = `${initialHeight}px`; // Start with preset height

  try {
    events.emit(events.events.CAPTURE_STARTED, { url, preset, captureFullPage });

    // Start observing the iframe for changes
     observer.observe(iframe.contentDocument || iframe.contentWindow.document, { childList: true, subtree: true });


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
       throw new errorHandling.ScreenshotError(`Failed to capture screenshot: ${renderResult.error}`, url, renderResult.error);
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
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Stop observing now that we're past the error-prone part
     observer.disconnect();


    // Retrieve the current URL from the iframe after navigation.
    const currentUrl = iframe.contentWindow.location.href;


    // --- MODIFIED: Calculate height only if captureFullPage is true ---
    if (captureFullPage) {
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
           try {
               const rect = el.getBoundingClientRect();
               // Need to account for potential scroll position within iframe
               const scrollTop = iframe.contentWindow.pageYOffset || doc.documentElement.scrollTop || doc.body.scrollTop || 0;
               const bottom = rect.bottom + scrollTop;
               if (bottom > maxBottom) {
                   maxBottom = bottom;
               }
           } catch(e) { /* ignore elements that might cause errors like SVG */ }
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
        initialHeight // Ensure minimum height is the preset height
      );
      console.log(`Final calculated height for Full Page (Width: ${width}):`, actualHeight);

      // Update the iframe height *only* if capturing full page
      iframe.style.height = `${actualHeight}px`;

       // Ensure that the body and documentElement heights are set to allow full capture
       try {
         doc.body.style.height = 'auto';
         doc.body.style.overflow = 'visible';
         doc.documentElement.style.height = 'auto';
         doc.documentElement.style.overflow = 'visible';
       } catch(e) { console.warn("Couldn't set document styles:", e); }

      // Wait for the resize to take effect
      await new Promise(resolve => setTimeout(resolve, 300));
    } else {
      // If not capturing full page, actualHeight remains the initial preset height
      actualHeight = initialHeight;
      console.log(`Using fixed height from preset ${preset}: ${actualHeight}`);
       // Ensure iframe is set to the correct fixed height
       iframe.style.height = `${actualHeight}px`;
    }
    // --- END MODIFICATION ---


    // Capture the screenshot using the determined width and actualHeight
    const { screenshotData } = await captureScreenshotInternal(iframe, currentUrl, width, actualHeight);

    // Create a thumbnail for display.
    const thumbnailData = await utils.createThumbnail(
      screenshotData,
      config.screenshot.thumbnailSize.width,
      config.screenshot.thumbnailSize.height
    );

    const endTime = performance.now();
    const timeTaken = ((endTime - startTime) / 1000).toFixed(2);

    // --- MODIFIED: Include final dimensions and full page flag in result ---
    const result = {
      screenshot: screenshotData,
      thumbnail: thumbnailData,
      timeTaken,
      preset: preset, // The base preset selected
      isFullPage: captureFullPage, // Indicate if full page was captured
      width: width, // Final width used
      height: actualHeight, // Final height used (calculated or preset)
      url: currentUrl // Add the URL to the result
    };
    // --- END MODIFICATION ---


    // Clean up by resetting the iframe and emit the completion event.
    iframe.src = "about:blank";
    events.emit(events.events.SCREENSHOT_TAKEN, { url: currentUrl, result });

    return result;

  } catch (error) {
    // Clean up observer
     observer.disconnect();


    // On error, reset the iframe and propagate the error.
    iframe.src = "about:blank";
    // Ensure error includes relevant context
    const errorMessage = error instanceof errorHandling.ScreenshotError ? error.message : `Failed to capture screenshot for ${url}: ${error.message}`;
    const captureError = new errorHandling.ScreenshotError(
      errorMessage,
      url,
      error.reason || error.message // Include original reason if available
    );
    events.emit(events.events.CAPTURE_FAILED, { url, error: captureError });
    throw captureError; // Rethrow the standardized error
  }
} // End takeScreenshot


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
        // Even after load, wait a short moment for potential redirects or initial script exec
        setTimeout(resolve, 200);
    };


    const handleError = (event) => {
        console.error(`Iframe error event for ${url}:`, event);
        cleanup();
        reject(new Error(`Error loading ${url} in iframe`));
    };

     const cleanup = () => {
         clearTimeout(loadTimeout);
         iframe.removeEventListener('load', handleLoad);
         iframe.removeEventListener('error', handleError);
     };


    iframe.addEventListener('load', handleLoad);
    iframe.addEventListener('error', handleError);


    // Check if src is already the target URL and if it's loaded
    try {
        if (iframe.contentWindow?.location?.href === url && iframe.contentDocument?.readyState === 'complete') {
            console.log(`Iframe already loaded with ${url}`);
            handleLoad(); // Treat as loaded
            return;
        }
    } catch (e) {
        // Ignore cross-origin errors if just checking href
        console.warn("Cross-origin check failed, proceeding with src assignment.");
    }


    iframe.src = url;
  });
} // End loadUrlInIframe

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
    // --- MODIFIED: Get wait time from the input field directly ---
    let waitTimeInSeconds = 10; // Default
    try {
        const waitTimeInput = document.getElementById("waitTime") || document.getElementById("simpleWaitTime");
        if (waitTimeInput && waitTimeInput.value) {
            waitTimeInSeconds = parseInt(waitTimeInput.value, 10);
             if (isNaN(waitTimeInSeconds) || waitTimeInSeconds < 1) {
               waitTimeInSeconds = 10; // Fallback to default if invalid
             }
        }
    } catch(e) { console.warn("Error reading wait time, using default.", e); }
    // --- END MODIFICATION ---

    let secondsLeft = waitTimeInSeconds;
    let consoleErrorFound = false;
    let detectedErrorMsg = null; // Store specific error message found

    // Clear previous timeout if exists
    if (_waitTimeout) {
        clearTimeout(_waitTimeout);
        _waitTimeout = null;
    }


    events.emit(events.events.CAPTURE_PROGRESS, {
      message: `Waiting for ${url} to render... (${secondsLeft}s remaining)`,
    });


    // Override console.warn and console.error to catch mount errors (within the iframe context if possible)
    const iframeWin = iframe.contentWindow;
    const originalWarn = iframeWin ? iframeWin.console.warn : console.warn;
    const originalError = iframeWin ? iframeWin.console.error : console.error;
    let restoreConsoleNeeded = false;


    const checkAndRestoreConsole = () => {
        if(restoreConsoleNeeded) {
             if (iframeWin) {
                 iframeWin.console.warn = originalWarn;
                 iframeWin.console.error = originalError;
             } else {
                 console.warn = originalWarn;
                 console.error = originalError;
             }
             restoreConsoleNeeded = false;
             console.log("Restored console functions.");
        }
    }


    const consoleProxyHandler = (originalFunc, type) => (...args) => {
         originalFunc.apply(console, args); // Log normally first


         // Check if this is a mount error
         const text = args.join(" ");
         if (text.includes("No view configured for center mount") || text.includes("Mount definition should contain a property")) {
           console.warn(`*** Mount Error Detected via console.${type} ***`);
           consoleErrorFound = true;
           detectedErrorMsg = "No view configured for center mount error detected in console";
           // Resolve immediately if an error is found
           checkAndRestoreConsole();
           if (_waitTimeout) clearTimeout(_waitTimeout);
           resolve({ success: false, error: detectedErrorMsg });
         }
       };


     if (iframeWin) {
         iframeWin.console.warn = consoleProxyHandler(originalWarn, 'warn');
         iframeWin.console.error = consoleProxyHandler(originalError, 'error');
         restoreConsoleNeeded = true;
     } else {
         console.warn = consoleProxyHandler(originalWarn, 'warn');
         console.error = consoleProxyHandler(originalError, 'error');
         restoreConsoleNeeded = true;
     }


    // Wait for the DOM content to be fully loaded and images to be loaded
    const waitForImages = () => {
      try {
        if (!iframe.contentDocument) return false;

        const imgElements = iframe.contentDocument.querySelectorAll('img');
        // Check if all images are loaded (complete=true means loaded or error)
        // Also check naturalWidth > 0 for successfully loaded images
        const allImagesLoaded = Array.from(imgElements).every(img => img.complete && img.naturalWidth !== 0);

        // Check for background images (basic check, less reliable)
        // Note: This is harder to track reliably. Focus on <img> tags.

        return allImagesLoaded;
      } catch (e) {
        console.warn("Error checking image loading status:", e);
        return true; // Assume images are loaded if there's an error checking
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
          if (text.includes("No view configured for center mount") || text.includes("Mount definition should contain a property")) {
            return {
              found: true,
              message: "No view configured for center mount error detected in DOM",
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
       // Clear timeout if it's already resolved/rejected
       if (!resolve) return;


      // Check for errors immediately
      const errorCheck = checkForErrors();
      if (errorCheck.found) {
        checkAndRestoreConsole();
        detectedErrorMsg = errorCheck.message;
         if (_waitTimeout) clearTimeout(_waitTimeout);
         _waitTimeout = null;
         resolve({ success: false, error: detectedErrorMsg });
         resolve = null; // Prevent multiple resolves
        return;
      }
      // Check if console error was found by proxy
      if (consoleErrorFound) {
           // Already resolved in proxy, just ensure cleanup
           checkAndRestoreConsole();
            if (_waitTimeout) clearTimeout(_waitTimeout);
            _waitTimeout = null;
           resolve = null; // Prevent multiple resolves
           return;
      }


      // Check if all images are loaded
      const imagesLoaded = waitForImages();


      // Check if countdown finished or images loaded
      if ((secondsLeft <= 0 && imagesLoaded)) {
        checkAndRestoreConsole();
        // Give a little extra time after images are loaded for any JavaScript rendering
        setTimeout(() => {
           if (resolve) { // Check if not already resolved by error
             resolve({ success: true, error: null });
             resolve = null; // Prevent multiple resolves
           }
        }, 500);
        _waitTimeout = null;
        return;
      }


      events.emit(events.events.CAPTURE_PROGRESS, {
        message: `Waiting for ${url} to render... (${secondsLeft}s remaining)`,
      });


      secondsLeft--;


      // Ensure timeout isn't rescheduled if already resolved
      if (resolve) {
         _waitTimeout = setTimeout(countdown, 1000);
      } else {
           _waitTimeout = null; // Clear timeout ref if resolved
      }


    };


    _waitTimeout = setTimeout(countdown, 1000); // Start the countdown
  });
} // End waitForRendering


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


  // --- MODIFIED: Set html2canvas options based on determined width/height ---
  const options = {
    ...config.screenshot.html2canvasOptions,
    width: width,
    height: height,
    windowWidth: width, // Important: Tell html2canvas the intended window size
    windowHeight: height,
    x: 0, // Start capture from top-left
    y: 0,
    scrollX: 0, // Ensure no scrolling offset is applied by html2canvas itself
    scrollY: 0,
    ignoreElements: (element) => {
        // Example: Ignore elements specifically marked
        return element.classList && element.classList.contains('screenshot-ignore');
    },
    onclone: (documentClone) => {
        // Ensure the cloned document reflects the correct height for full page captures
        if (documentClone.body) {
          documentClone.body.style.height = `${height}px`;
          documentClone.body.style.overflow = 'visible'; // Prevent potential scrollbars in clone
        }
        if (documentClone.documentElement) {
            documentClone.documentElement.style.height = `${height}px`;
            documentClone.documentElement.style.overflow = 'visible';
        }
    }
  };
  // --- END MODIFICATION ---


  // --- Temporarily handle fixed elements for better full page capture ---
  let originalStyles = [];
  if (height > iframe.contentWindow.innerHeight) { // Simple check if likely full page
      try {
         const fixedElements = Array.from(doc.querySelectorAll('*')).filter(el => {
             try {
                 return iframe.contentWindow.getComputedStyle(el).position === 'fixed';
             } catch (e) { return false; } // Ignore elements that error on getComputedStyle
         });


         originalStyles = fixedElements.map(el => ({
             element: el,
             position: el.style.position,
             // Store other relevant styles if needed (top, bottom, etc.)
         }));


         fixedElements.forEach(item => {
             item.element.style.position = 'absolute'; // Change to absolute during capture
         });
         console.log(`Temporarily changed position for ${fixedElements.length} fixed elements.`);
      } catch (e) {
          console.warn("Error handling fixed elements:", e);
      }
  }
  // --- End fixed element handling ---


  // Generate the canvas using html2canvas
  const canvas = await html2canvas(doc.documentElement, options);


   // --- Restore fixed elements ---
   if (originalStyles.length > 0) {
       try {
         originalStyles.forEach(item => {
             item.element.style.position = item.position; // Restore original position
         });
         console.log(`Restored position for ${originalStyles.length} fixed elements.`);
       } catch (e) {
           console.warn("Error restoring fixed elements:", e);
       }
   }
   // --- End restore ---


  // Overlay the URL onto the canvas
  const ctx = canvas.getContext("2d");
  const overlayHeight = 30; // Height of the URL overlay bar
  const textY = canvas.height - overlayHeight / 2; // Center text vertically in the bar

  // Draw overlay bar
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; // Slightly darker overlay
  ctx.fillRect(0, canvas.height - overlayHeight, canvas.width, overlayHeight);


  // Draw URL text
  ctx.font = "14px Arial"; // Slightly smaller font
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";


  // Add padding to the text
  const textX = 10;
  ctx.fillText(url, textX, textY);

  // Convert canvas to data URL
  const screenshotData = canvas.toDataURL("image/png"); // Use PNG for better quality

  // Clean up canvas to free memory
  canvas.width = 1;
  canvas.height = 1;


  return { screenshotData };
} // End captureScreenshotInternal


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
       // Optionally show an error to the user
       // UI.utils.showStatus(`Error downloading ${filename}: ${error.message}`, true);
  }
} // End downloadScreenshot

/**
 * Take sequential screenshots by executing different action sequences.
 * NOTE: This function is primarily for Advanced Mode and might not be used
 * in the Simple Mode implemented currently. Kept for potential future use.
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
  captureFullPage = false, // Added flag
  actionSequences = [],
  processCallback = null
) {
  const results = [];
  if (!actionSequences || actionSequences.length === 0) {
      console.warn("takeSequentialScreenshots called without action sequences. Taking single screenshot.");
       // Fallback to taking a single screenshot if no sequences provided
       try {
           const singleResult = await takeScreenshot(url, preset, captureFullPage, []);
            const timestamp = URLProcessor.getTimestamp();
            const fullPageSuffix = captureFullPage ? "_FullPage" : "";
            singleResult.fileName = URLProcessor.generateFilename(url, 0, "").replace(".png", `${fullPageSuffix}_${timestamp}.png`);
            singleResult.sequenceName = "Base Page"; // Assign a default name
            results.push(singleResult);
            if (typeof processCallback === "function") {
                 processCallback(singleResult);
             }
       } catch (error) {
           console.error(`Error taking base screenshot for sequential capture: ${url}`, error);
            const errorResult = {
                sequenceName: "Base Page (Error)",
                error: true,
                errorMessage: error.message,
                 url: url // Include URL in error result
             };
             results.push(errorResult);
              if (typeof processCallback === "function") {
                 processCallback(errorResult);
             }
           // Decide if the entire process should stop on base page error
           throw new errorHandling.ScreenshotError(`Base screenshot failed for sequential capture: ${error.message}`, url, error.reason);
       }
      return results; // Return the single result or error
  }


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

        // Take the screenshot with the sequence actions
        // --- MODIFIED: Pass captureFullPage ---
        const screenshotData = await takeScreenshot(
          url, // Use the base URL, actions should navigate
          preset,
          captureFullPage,
          sequence.actions
        );
        // --- END MODIFICATION ---

        // Add sequence info
        const result = {
          ...screenshotData,
          sequenceName: sequenceName,
          sequenceIndex: i,
        };

         // Generate filename including sequence name and timestamp
         const timestamp = URLProcessor.getTimestamp();
          const safeSequenceName = URLProcessor.sanitizeFilename(sequenceName);
          const fullPageSuffix = captureFullPage ? "_FullPage" : "";
          result.fileName = `${safeSequenceName}${fullPageSuffix}_${timestamp}.png`;


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
           console.error(`Error in sequence "${sequenceName}":`, sequenceError);
           const timestamp = URLProcessor.getTimestamp();
           const safeSequenceName = URLProcessor.sanitizeFilename(sequenceName);
            const fullPageSuffix = captureFullPage ? "_FullPage" : ""; // Include suffix even for errors
           const errorFileName = `${safeSequenceName}${fullPageSuffix}_Error_${timestamp}.png`;


        // If this is a mount error, log it and create an error result
        if (
          sequenceError.message &&
          (sequenceError.message.includes("No view configured") ||
            sequenceError.message.includes("Mount definition"))
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
             fileName: errorFileName, // Add filename to error result
             url: sequenceError.url || url // Add URL if available in error
          };

          results.push(errorResult); // Add error result to array

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

          // Decide whether to continue or stop on mount errors
          // continue; // Skip to next sequence if desired

          // OR: Stop the entire process on mount error
           throw new errorHandling.ScreenshotError(`Mount error during sequence "${sequenceName}": ${sequenceError.message}`, url, sequenceError.reason);


        } else {
             // Handle other errors during a sequence
             const errorResult = {
                 sequenceName: sequenceName + " (Error)",
                 sequenceIndex: i,
                 error: true,
                 errorMessage: sequenceError.message,
                 fileName: errorFileName,
                 url: sequenceError.url || url
             };
             results.push(errorResult);


             if (typeof processCallback === "function") {
                 processCallback(errorResult);
             }
             events.emit("SCREENSHOT_SEQUENCE_ERROR", { url, error: errorResult, sequenceName, sequenceIndex: i, totalSequences: actionSequences.length });


             // Rethrow to stop the entire process on other sequence errors
             throw sequenceError;
        }
      } // End catch sequenceError

        // Optional delay between sequences
        await new Promise(r => setTimeout(r, 200));


    } // End for loop

    return results;

  } catch (error) {
     // Catch errors that stop the entire sequential process
    const sequentialError = new errorHandling.ScreenshotError(
      `Error during sequential screenshots for ${url}: ${error.message}`,
      url,
      error.message
    );
    // Emit a general failure event if the loop was aborted
     events.emit(events.events.CAPTURE_FAILED, { url, error: sequentialError });
    throw sequentialError; // Rethrow to be caught by the calling function (e.g., captureScreenshots in app.js)
  }
} // End takeSequentialScreenshots