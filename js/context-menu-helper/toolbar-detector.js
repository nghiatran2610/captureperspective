// toolbar-detector.js - Functions for detecting and interacting with toolbar elements

import { getElementXPath } from './element-utils.js';

/**
 * Wait for a toolbar to load using only the fixed XPath.
 * @param {HTMLIFrameElement} iframe - The iframe element.
 * @param {number} [maxAttempts=10] - Maximum attempts.
 * @param {number} [interval=500] - Interval in ms.
 * @returns {Promise<Element|null>} - The toolbar element, or null.
 */
export async function waitForToolbar(iframe, maxAttempts = 10, interval = 500) {
  const fixedXPath =
    '//*[@id="app-container"]/div/div[3]/div[2]/div[2]/div[1]/div[1]/div/div[1]/div';
  console.log(
    "Checking for toolbar in URL:",
    iframe.contentWindow.location.href
  );
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const toolbar = iframe.contentDocument.evaluate(
        fixedXPath,
        iframe.contentDocument,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;
      if (toolbar) {
        const buttons = toolbar.querySelectorAll("button");
        if (buttons.length > 0) {
          console.log(
            `Toolbar found using fixed XPath with ${
              buttons.length
            } buttons after ${i + 1} attempts`
          );
          return toolbar;
        }
      }
      console.log(
        `Attempt ${
          i + 1
        }: No toolbar found using fixed XPath, waiting ${interval}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, interval));
    } catch (error) {
      console.warn(`Error in toolbar detection attempt ${i + 1}:`, error);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
  console.log(
    "No toolbar found after maximum attempts using fixed XPath in URL:",
    iframe.contentWindow.location.href
  );
  return null;
}

/**
 * Get toolbar button selectors by inspecting the toolbar element using only the fixed XPath.
 * @param {HTMLIFrameElement} iframe - The iframe element
 * @returns {Array} - Array of button objects with name and selector properties
 */
export function getToolbarButtonSelectors(iframe) {
  try {
    console.log(
      "Getting toolbar buttons for URL:",
      iframe.contentWindow.location.href
    );
    const fixedXPath =
      '//*[@id="app-container"]/div/div[3]/div[2]/div[2]/div[1]/div[1]/div/div[1]/div';
    const toolbar = iframe.contentDocument.evaluate(
      fixedXPath,
      iframe.contentDocument,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
    let buttons = [];
    if (toolbar) {
      buttons = toolbar.querySelectorAll("button");
      console.log(
        `Found toolbar with ${buttons.length} buttons using fixed XPath`
      );
    } else {
      console.log("No toolbar found using fixed XPath.");
    }
    if (buttons.length === 0) {
      console.log("No buttons found in page.");
      return [];
    }
    const iconToName = {
      "material/zoom_out_map": "Layout",
      "material/trending_up": "Trends",
      "material/article": "Document",
      "material/report": "Report",
      "material/unfold_less": "Collapse",
      "material/unfold_more": "Expand",
      "material/alarm": "Alarm",
      "material/list": "List",
      "material/view_module": "View Module",
    };
    const buttonList = [];
    Array.from(buttons).forEach((btn, index) => {
      if (btn.hasAttribute("disabled")) return;
      let parent = btn;
      let isHidden = false;
      while (parent && parent !== iframe.contentDocument.body) {
        const style = window.getComputedStyle(parent);
        if (style.visibility === "hidden" || style.display === "none") {
          isHidden = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (isHidden) return;
      let btnText = "";
      const icon = btn.querySelector("svg")?.getAttribute("data-icon") || "";
      if (icon && iconToName[icon]) {
        btnText = iconToName[icon];
      } else {
        const textElement = btn.querySelector(".text");
        btnText = textElement
          ? textElement.textContent.trim()
          : `Button ${index + 1}`;
      }
      let selector;
      if (btn.id) {
        selector = `#${btn.id}`;
      } else if (btn.hasAttribute("data-component")) {
        const componentType = btn.getAttribute("data-component");
        const sameTypeButtons = Array.from(
          iframe.contentDocument.querySelectorAll(
            `[data-component="${componentType}"]`
          )
        );
        const buttonIndex = sameTypeButtons.indexOf(btn) + 1;
        selector = `[data-component="${componentType}"]:nth-of-type(${buttonIndex})`;
      } else {
        const fullXPath = getElementXPath(btn, iframe.contentDocument);
        selector = fullXPath;
      }
      buttonList.push({
        name: `${btnText} Button`,
        selector,
      });
    });
    console.log("Detected toolbar buttons:", buttonList);
    return buttonList;
  } catch (error) {
    console.warn("Error getting toolbar button selectors:", error);
    return [];
  }
}

export default {
  waitForToolbar,
  getToolbarButtonSelectors
};