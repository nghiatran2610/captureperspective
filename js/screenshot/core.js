// js/screenshot/core.js
// screenshot/core.js - Centralized screenshot capture functionality
import config from "../config.js";
import * as errorHandling from "../errors.js";
import * as events from "../events.js";
import * as actions from "./actions.js";
import * as screenshotUtils from "./utils.js";
import { prepareSVGsForCapture } from "./svgUtils.js";

let _waitTimeout = null;

export async function takeScreenshot(
  url,
  preset = "fullHD",
  captureFullPage = false,
  actionsList = []
) {
  if (_waitTimeout) {
    clearTimeout(_waitTimeout);
    _waitTimeout = null;
  }

  const startTime = performance.now();
  const iframe = document.getElementById("screenshotIframe");
  let detectedMountIssueDuringLoad = false;
  let detectedMountIssueMessage = null;

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

  let doc, win; // Declare here to be accessible in finally if needed for resets

  try {
    events.emit(events.events.CAPTURE_STARTED, {
      url,
      preset,
      captureFullPage,
    });

    // Initial check for contentWindow and contentDocument
    win = iframe.contentWindow;
    doc = iframe.contentDocument || win?.document;

    if (doc) {
      // Only observe if doc is available
      observer.observe(doc, {
        childList: true,
        subtree: true,
      });
    } else {
      console.warn(
        "takeScreenshot: iframe.contentDocument not available at observer setup for URL:",
        url
      );
      // Depending on how critical this is, you might choose to proceed or throw earlier.
      // For now, loadUrlInIframe will also check and might throw.
    }

    await loadUrlInIframe(iframe, url); // This can throw if iframe fails to load

    // Re-assign doc and win after load, as they might have changed (especially if src was about:blank)
    win = iframe.contentWindow;
    doc = iframe.contentDocument || win?.document;

    if (!doc || !win) {
      observer.disconnect(); // Ensure observer is disconnected if it was started
      throw new errorHandling.ScreenshotError(
        "Iframe content (document or window) became unavailable after load.",
        url
      );
    }

    // If the observer wasn't started due to initial null doc, try starting it now if doc is available
    // This is a bit defensive, ideally observer is set on a valid doc from the start.
    // However, the initial check for doc before loadUrlInIframe might mean observer was never started.
    // It's better to ensure the observer is attached to the final loaded document if possible.
    // For simplicity and to avoid re-observing, we'll assume the initial observe was on the correct (eventual) document
    // or that changes relevant to mount issues happen early.

    await new Promise((resolve) => setTimeout(resolve, 300));

    if (detectedMountIssueDuringLoad) {
      finalDetectedMountIssueMessage = detectedMountIssueMessage;
      wasMountIssueDetectedInRendering = true;
    }

    const renderResult = await waitForRendering(url, iframe);

    if (renderResult.detectedMountIssue) {
      wasMountIssueDetectedInRendering = true;
      finalDetectedMountIssueMessage =
        renderResult.mountIssueMessage ||
        finalDetectedMountIssueMessage ||
        "Mount issue detected during rendering.";
    }

    if (!renderResult.success && !renderResult.detectedMountIssue) {
      observer.disconnect();
      throw new errorHandling.ScreenshotError(
        `Failed to capture screenshot: ${renderResult.error}`,
        url,
        renderResult.error
      );
    }

    if (actionsList && actionsList.length > 0) {
      if (!doc)
        throw new errorHandling.ScreenshotError(
          "Cannot perform actions: iframe document not available.",
          url
        );
      await actions.performActions(doc, actionsList);
      if (detectedMountIssueDuringLoad && !wasMountIssueDetectedInRendering) {
        finalDetectedMountIssueMessage = detectedMountIssueMessage;
        wasMountIssueDetectedInRendering = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    observer.disconnect();
    const currentUrl = win.location.href;

    if (doc) {
      prepareSVGsForCapture(doc);
    }

    win.scrollTo(0, 0);
    await new Promise((resolve) =>
      requestAnimationFrame(() => setTimeout(resolve, 50))
    );

    let originalRootStyles = {},
      originalBodyStyles = {};

    if (captureFullPage) {
      if (!doc || !doc.body || !doc.documentElement) {
        throw new errorHandling.ScreenshotError(
          "Iframe document, body, or documentElement not available for height calculation.",
          url
        );
      }
      const bodyScrollHeight = doc.body.scrollHeight;
      const docScrollHeight = doc.documentElement.scrollHeight;
      const bodyOffsetHeight = doc.body.offsetHeight;
      const docOffsetHeight = doc.documentElement.offsetHeight;

      let maxBottom = 0;
      const allElements = doc.body.querySelectorAll("*");
      allElements.forEach((el) => {
        try {
          const rect = el.getBoundingClientRect();
          const scrollTop =
            win.pageYOffset ||
            doc.documentElement.scrollTop ||
            doc.body.scrollTop ||
            0;
          const elementBottom = rect.bottom + scrollTop;
          if (elementBottom > maxBottom) maxBottom = elementBottom;
        } catch (e) {
          /* ignore */
        }
      });

      actualHeight = Math.max(
        bodyScrollHeight,
        docScrollHeight,
        bodyOffsetHeight,
        docOffsetHeight,
        maxBottom,
        initialHeight
      );
      if (actualHeight <= 0)
        actualHeight = initialHeight > 0 ? initialHeight : 720;
      actualHeight = Math.max(actualHeight, initialHeight);
      console.log(
        `[Full Page] Calculated actualHeight: ${actualHeight} for ${url}`
      );

      originalRootStyles = {
        height: doc.documentElement.style.height,
        overflow: doc.documentElement.style.overflow,
        margin: doc.documentElement.style.margin,
      };
      doc.documentElement.style.height = `${actualHeight}px`;
      doc.documentElement.style.overflow = "visible";
      doc.documentElement.style.margin = "0";

      originalBodyStyles = {
        height: doc.body.style.height,
        overflow: doc.body.style.overflow,
        margin: doc.body.style.margin,
      };
      doc.body.style.height = `${actualHeight}px`;
      doc.body.style.overflow = "visible";
      doc.body.style.margin = "0";

      iframe.style.height = `${actualHeight}px`;
      if (doc.documentElement.offsetHeight === undefined) {
        /* no-op to trigger reflow */
      } // Check on doc.documentElement
      await new Promise((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 250))
      ); // Increased delay
    } else {
      actualHeight = initialHeight;
      iframe.style.height = `${actualHeight}px`;
      if (doc && doc.documentElement) {
        originalRootStyles = {
          height: doc.documentElement.style.height,
          overflow: doc.documentElement.style.overflow,
        };
        doc.documentElement.style.height = `${actualHeight}px`;
        doc.documentElement.style.overflow = "hidden";
      }
      if (doc && doc.body) {
        originalBodyStyles = {
          height: doc.body.style.height,
          overflow: doc.body.style.overflow,
        };
        doc.body.style.height = `${actualHeight}px`;
        doc.body.style.overflow = "hidden";
      }
      await new Promise((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 50))
      );
    }

    let tempFixedStyles = [];
    if (doc && win) {
      // Ensure doc and win are valid
      try {
        const fixedElements = Array.from(doc.querySelectorAll("*")).filter(
          (el) => {
            try {
              return win.getComputedStyle(el).position === "fixed";
            } catch (e) {
              return false;
            }
          }
        );
        tempFixedStyles = fixedElements.map((el) => {
          const originalPosition = el.style.position;
          const originalTop = el.style.top;
          const rect = el.getBoundingClientRect();
          const scrollTop =
            win.pageYOffset ||
            doc.documentElement.scrollTop ||
            doc.body.scrollTop ||
            0;
          el.style.position = "absolute";
          el.style.top = `${rect.top + scrollTop}px`;
          return { element: el, position: originalPosition, top: originalTop };
        });
        if (tempFixedStyles.length > 0)
          await new Promise((r) => setTimeout(r, 50));
      } catch (e) {
        console.warn("Error handling fixed elements:", e);
      }
    }

    const { screenshotData } = await captureScreenshotInternal(
      iframe,
      currentUrl,
      width,
      actualHeight
    );

    // Restore original styles for fixed elements
    if (tempFixedStyles.length > 0) {
      try {
        tempFixedStyles.forEach((item) => {
          item.element.style.position = item.position;
          item.element.style.top = item.top;
        });
      } catch (e) {
        console.warn("Error restoring fixed elements:", e);
      }
    }

    // Restore original root/body styles
    if (doc && doc.documentElement && originalRootStyles.height !== undefined) {
      doc.documentElement.style.height = originalRootStyles.height;
      doc.documentElement.style.overflow = originalRootStyles.overflow;
      doc.documentElement.style.margin = originalRootStyles.margin;
    }
    if (doc && doc.body && originalBodyStyles.height !== undefined) {
      doc.body.style.height = originalBodyStyles.height;
      doc.body.style.overflow = originalBodyStyles.overflow;
      doc.body.style.margin = originalBodyStyles.margin;
    }

    const thumbnailData = await screenshotUtils.createThumbnail(
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
      isFullPage: captureFullPage,
      width,
      height: actualHeight,
      url: currentUrl,
      detectedMountIssue: wasMountIssueDetectedInRendering,
      mountIssueMessage: wasMountIssueDetectedInRendering
        ? finalDetectedMountIssueMessage
        : null,
      error: false,
    };

    iframe.style.height = `${initialHeight}px`;
    iframe.src = "about:blank";
    events.emit(events.events.SCREENSHOT_TAKEN, { url: currentUrl, result });
    return result;
  } catch (error) {
    observer.disconnect();
    iframe.style.height = `${initialHeight}px`;
    iframe.src = "about:blank";
    const errorMessage =
      error instanceof errorHandling.ScreenshotError
        ? error.message
        : `Failed to capture screenshot for ${url}: ${error.message}`;

    const captureError = new errorHandling.ScreenshotError(
      errorMessage,
      url,
      error.reason || error.name // Use error.name if reason is not available
    );

    events.emit(events.events.CAPTURE_FAILED, { url, error: captureError });
    throw captureError;
  }
}

function loadUrlInIframe(iframe, url) {
  return new Promise((resolve, reject) => {
    let loadFired = false;
    const timeoutDuration = 30000;

    const loadTimeout = setTimeout(() => {
      if (!loadFired) {
        console.error(`Iframe load timeout for ${url}`);
        cleanup();
        reject(new Error(`Timeout loading ${url} in iframe`));
      }
    }, timeoutDuration);

    const handleLoad = () => {
      if (loadFired) return;
      loadFired = true;
      console.log(`Iframe load event fired for ${url}`);
      // Check if contentDocument is accessible after load
      if (!iframe.contentDocument && !iframe.contentWindow?.document) {
        console.error(
          `Iframe contentDocument not accessible after load for ${url}. This might be a cross-origin issue or load failure.`
        );
        cleanup();
        // This specific error could be caught by takeScreenshot or we can reject here.
        // For now, let loadUrlInIframe resolve, and takeScreenshot will fail if doc/win are null.
        // Or, reject directly: reject(new Error(`Iframe contentDocument not accessible after load for ${url}`));
      }
      cleanup();
      setTimeout(resolve, 500);
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
        (iframe.contentDocument || iframe.contentWindow?.document)
          ?.readyState === "complete"
      ) {
        console.log(`Iframe already loaded with ${url}`);
        handleLoad();
        return;
      }
    } catch (e) {
      console.warn(
        "Cross-origin check during iframe load failed. Proceeding for " + url
      );
    }
    iframe.src = url; // This can also throw sync errors if URL is invalid like "chrome-error://..."
  });
}

function waitForRendering(url, iframe) {
  // ... (waitForRendering function remains largely unchanged but ensure robustness for null contentDocument)
  return new Promise((resolve) => {
    let waitTimeInSeconds = 10;
    try {
      const waitTimeInput =
        document.getElementById("waitTime") ||
        document.getElementById("simpleWaitTime");
      if (waitTimeInput && waitTimeInput.value) {
        const parsedTime = parseInt(waitTimeInput.value, 10);
        if (!isNaN(parsedTime) && parsedTime >= 1 && parsedTime <= 120) {
          waitTimeInSeconds = parsedTime;
        } else {
          console.warn(
            `Invalid wait time value: ${waitTimeInput.value}. Using default 10s.`
          );
        }
      }
    } catch (e) {
      console.warn("Error reading wait time, using default 10s.", e);
    }

    let secondsLeft = waitTimeInSeconds;
    let consoleMountErrorFound = false;
    let domMountErrorFound = false;
    let detectedMountIssueMsgInternal = null;
    let generalErrorMsg = null;

    if (_waitTimeout) {
      clearTimeout(_waitTimeout);
      _waitTimeout = null;
    }

    events.emit(events.events.CAPTURE_PROGRESS, {
      message: `<span class="status-spinner">⏳</span> Waiting for ${url} to render... (${secondsLeft}s remaining)`,
    });

    const iframeWin = iframe.contentWindow;
    let originalWarn, originalError;
    let restoreConsoleNeeded = false;

    if (iframeWin) {
      try {
        originalWarn = iframeWin.console.warn;
        originalError = iframeWin.console.error;
        restoreConsoleNeeded = true;
      } catch (e) {
        console.warn("Could not access iframe console for:", url, e);
      }
    }

    const checkAndRestoreConsole = () => {
      if (restoreConsoleNeeded && iframeWin) {
        try {
          iframeWin.console.warn = originalWarn;
          iframeWin.console.error = originalError;
        } catch (e) {
          console.warn("Error restoring iframe console for:", url, e);
        }
        restoreConsoleNeeded = false;
      }
    };

    const consoleProxyHandler =
      (originalFunc, type) =>
      (...args) => {
        if (typeof originalFunc === "function")
          originalFunc.apply(console, args);
        else console[type](...args);

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
        }
      };

    if (restoreConsoleNeeded && iframeWin) {
      iframeWin.console.warn = consoleProxyHandler(originalWarn, "warn");
      iframeWin.console.error = consoleProxyHandler(originalError, "error");
    }

    const waitForImages = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return false;
        const imgElements = doc.querySelectorAll("img");
        return Array.from(imgElements).every(
          (img) =>
            img.complete &&
            (img.naturalWidth !== 0 ||
              img.getAttribute("src")?.startsWith("data:image/svg+xml"))
        );
      } catch (e) {
        console.warn(
          "Error checking image loading status:",
          e.message,
          "for URL:",
          url
        );
        return true;
      }
    };

    const checkForDOMLoadErrors = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc)
          return {
            found: true,
            isMountIssue: false,
            message: "Iframe document not available during error check.",
          };

        const mountErrorElements = doc.querySelectorAll(
          ".error-message, .warning-message, .error, [class*='ErrorComponent']"
        );
        for (const el of mountErrorElements) {
          const text = el.textContent || "";
          if (
            text.includes("No view configured for center mount") ||
            text.includes("Mount definition should contain a property")
          ) {
            console.warn(`Mount issue Detected in DOM for ${url}: ${text}`);
            domMountErrorFound = true;
            detectedMountIssueMsgInternal =
              detectedMountIssueMsgInternal ||
              `DOM: ${text.substring(0, 100)}...`;
          }
        }

        const notFoundElements = doc.querySelectorAll(
          '.not-found, .error-page, [data-error="not-found"], body > h1:only-child, body > p:only-child'
        );
        if (notFoundElements.length > 0) {
          for (const el of notFoundElements) {
            const text = (el.textContent || "").toLowerCase();
            if (
              text.includes("not found") ||
              text.includes("error") ||
              text.includes("page load failed")
            ) {
              return {
                found: true,
                message:
                  "Page not found or general error page detected: " +
                  text.substring(0, 50),
                isMountIssue: false,
              };
            }
          }
        }
        return {
          found: false,
          isMountIssue: domMountErrorFound,
          message: null,
        };
      } catch (e) {
        console.warn(
          "Error checking for page errors in waitForRendering:",
          e.message,
          "for URL:",
          url
        );
        return {
          found: false,
          isMountIssue: false,
          message: "Error checking page state.",
        };
      }
    };

    const countdown = () => {
      if (!resolve) return; // Already resolved

      const domLoadErrorCheck = checkForDOMLoadErrors();
      if (domLoadErrorCheck.found && !domLoadErrorCheck.isMountIssue) {
        checkAndRestoreConsole();
        generalErrorMsg = domLoadErrorCheck.message;
        if (_waitTimeout) clearTimeout(_waitTimeout);
        _waitTimeout = null;
        resolve({
          success: false,
          error: generalErrorMsg,
          detectedMountIssue: false,
        });
        resolve = null;
        return;
      }

      const imagesLoaded = waitForImages();
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      const readyState = doc ? doc.readyState : "uninitialized";

      if (
        (secondsLeft <= 0 &&
          imagesLoaded &&
          (readyState === "complete" || readyState === "interactive")) ||
        (secondsLeft <= 0 && readyState === "complete")
      ) {
        checkAndRestoreConsole();
        setTimeout(() => {
          if (resolve) {
            const anyMountIssueFound =
              domMountErrorFound || consoleMountErrorFound;
            resolve({
              success: true,
              error: null,
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

      if (secondsLeft <= 0) {
        checkAndRestoreConsole();
        console.warn(
          `Wait time expired for ${url}. Images loaded: ${imagesLoaded}, readyState: ${readyState}. Proceeding with capture.`
        );
        if (resolve) {
          const anyMountIssueFound =
            domMountErrorFound || consoleMountErrorFound;
          resolve({
            success: true,
            error: null,
            detectedMountIssue: anyMountIssueFound,
            mountIssueMessage: anyMountIssueFound
              ? detectedMountIssueMsgInternal
              : null,
          });
          resolve = null;
        }
        _waitTimeout = null;
        return;
      }

      events.emit(events.events.CAPTURE_PROGRESS, {
        message: `<span class="status-spinner">⏳</span> Waiting for ${url} (${readyState})... (${secondsLeft}s remaining)`,
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

async function captureScreenshotInternal(iframe, pageUrl, width, height) {
  // Re-fetch doc and win here as they are scoped to this function
  const win = iframe.contentWindow;
  const doc = iframe.contentDocument || win?.document;

  if (!doc || !doc.documentElement) {
    // Check doc first
    throw new errorHandling.ScreenshotError(
      "Iframe document or documentElement is not available for capture.",
      pageUrl
    );
  }

  const targetNode = doc.documentElement; // Define targetNode here

  events.emit(events.events.CAPTURE_PROGRESS, {
    message: `Capturing with dom-to-image (${width}x${height})...`,
  });

  const domToImageOptions = {
    width: width,
    height: height,
    bgcolor: config.screenshot.domToImageOptions.bgcolor || "#ffffff",
    imagePlaceholder: config.screenshot.domToImageOptions.imagePlaceholder,
    cacheBust:
      config.screenshot.domToImageOptions.cacheBust !== undefined
        ? config.screenshot.domToImageOptions.cacheBust
        : true,
    filter: (node) => {
      if (!node || typeof node.classList === "undefined") return true;
      if (node.classList.contains("screenshot-ignore")) {
        return false;
      }
      if (node.tagName === "SCRIPT") return false;
      return true;
    },
    style: { margin: "0" },
  };

  // Styles should have been applied in takeScreenshot before calling this.
  // A final reflow trigger and small delay.
  if (targetNode.offsetHeight === undefined) {
    /* no-op */
  } // Trigger reflow on the actual targetNode
  await new Promise((resolve) =>
    requestAnimationFrame(() => setTimeout(resolve, 100))
  );

  let dataUrl;
  try {
    // targetNode is doc.documentElement, which should be valid if we reached here
    dataUrl = await domtoimage.toPng(targetNode, domToImageOptions);
  } catch (captureError) {
    console.error("dom-to-image.toPng failed:", captureError);
    throw new errorHandling.ScreenshotError(
      `dom-to-image capture failed: ${captureError.message}`,
      pageUrl,
      captureError
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const img = new Image();

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = (e) => {
      console.error("Error loading captured image for overlay:", e);
      reject(new Error("Failed to load captured image onto overlay canvas."));
    };
    img.src = dataUrl;
  });

  ctx.drawImage(img, 0, 0, width, height);

  const overlayHeight = 30;
  if (canvas.height >= overlayHeight) {
    const textY = canvas.height - overlayHeight / 2;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, canvas.height - overlayHeight, canvas.width, overlayHeight);
    ctx.font = "14px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const textX = 10;
    ctx.fillText(pageUrl, textX, textY);
  }

  const screenshotDataWithOverlay = canvas.toDataURL("image/png");
  canvas.width = 1;
  canvas.height = 1;

  return { screenshotData: screenshotDataWithOverlay };
}

export function downloadScreenshot(screenshotData, filename) {
  // ... (downloadScreenshot function remains unchanged)
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

export async function takeSequentialScreenshots(
  // ... (takeSequentialScreenshots function remains unchanged)
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
      singleResult.sequenceName = "Base Page";
      results.push(singleResult);
      if (typeof processCallback === "function") {
        processCallback(singleResult);
      }
    } catch (error) {
      const errorResult = {
        sequenceName: "Base Page (Error)",
        error: true,
        errorMessage: error.message,
        url: url,
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

        const resultWithSequenceInfo = {
          ...screenshotDataResult,
          sequenceName: sequenceName,
          sequenceIndex: i,
        };
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
        console.error(`Error in sequence "${sequenceName}":`, sequenceError);
        const errorResult = {
          sequenceName: sequenceName + " (Capture Error)",
          sequenceIndex: i,
          error: true,
          errorMessage: sequenceError.message,
          url: sequenceError.url || url,
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
        throw sequenceError;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return results;
  } catch (error) {
    const sequentialError = new errorHandling.ScreenshotError(
      `Error during sequential screenshots for ${url}: ${error.message}`,
      url,
      error.message
    );
    events.emit(events.events.CAPTURE_FAILED, { url, error: sequentialError });
    throw sequentialError;
  }
}
