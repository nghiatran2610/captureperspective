// js/context-menu-helper/toolbar-detector.js

import { getElementXPath } from "./element-utils.js";

/**
 * Wait for a toolbar to load using only the fixed XPath.
 * Looks for buttons OR specific divs acting as buttons.
 * @param {HTMLIFrameElement} iframe - The iframe element.
 * @param {number} [maxAttempts=10] - Maximum attempts.
 * @param {number} [interval=500] - Interval in ms.
 * @returns {Promise<Element|null>} - The toolbar element, or null.
 */
export async function waitForToolbar(iframe, maxAttempts = 10, interval = 500) {
  const fixedXPath =
    '//*[@id="app-container"]/div/div[3]/div[2]/div[2]/div[1]/div[1]/div/div[1]/div'; // Keep using the fixed XPath for the container
  console.log(
    "Checking for toolbar container in URL:",
    iframe.contentWindow.location.href
  );
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const toolbarContainer = iframe.contentDocument.evaluate(
        fixedXPath,
        iframe.contentDocument,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;

      if (toolbarContainer) {
        // Check if it contains EITHER buttons OR the specific div class
        const clickableElements = toolbarContainer.querySelectorAll(
          "button, div.psc-core\\/button_primary"
        ); // Escape '/'
        if (clickableElements.length > 0) {
          console.log(
            `Toolbar container found using fixed XPath with ${
              clickableElements.length
            } clickable elements (buttons or divs) after ${i + 1} attempts`
          );
          return toolbarContainer; // Return the container itself
        }
      }
      console.log(
        `Attempt ${
          i + 1
        }: No toolbar container with clickable elements found, waiting ${interval}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, interval));
    } catch (error) {
      console.warn(`Error in toolbar detection attempt ${i + 1}:`, error);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
  console.log(
    "No toolbar container with clickable elements found after maximum attempts in URL:",
    iframe.contentWindow.location.href
  );
  return null;
}

/**
 * Get toolbar button selectors by inspecting the toolbar element.
 * Now includes both <button> and specific <div class="psc-core/button_primary"> elements.
 * @param {HTMLIFrameElement} iframe - The iframe element
 * @returns {Array} - Array of button objects with name and selector properties
 */
export function getToolbarButtonSelectors(iframe) {
  try {
    console.log(
      "Getting toolbar clickable elements for URL:",
      iframe.contentWindow.location.href
    );
    const fixedXPath =
      '//*[@id="app-container"]/div/div[3]/div[2]/div[2]/div[1]/div[1]/div/div[1]/div';
    const toolbarContainer = iframe.contentDocument.evaluate(
      fixedXPath,
      iframe.contentDocument,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;

    let clickableElements = [];
    if (toolbarContainer) {
      // Select both buttons and the specific div class within the container
      clickableElements = toolbarContainer.querySelectorAll(
        "button, div.psc-core\\/button_primary"
      );
      console.log(
        `Found toolbar container with ${clickableElements.length} potential clickable elements (buttons/divs) using fixed XPath`
      );
    } else {
      console.log("No toolbar container found using fixed XPath.");
      return []; // Return empty if container not found
    }

    if (clickableElements.length === 0) {
      console.log(
        "No clickable elements (buttons or specific divs) found in toolbar container."
      );
      return [];
    }

    // --- Naming Logic (adjust as needed based on actual content) ---
    const iconToName = {
      "material/zoom_out_map": "Layout",
      "material/trending_up": "Trends", // Make sure this is correctly mapped
      "material/tune": "Settings", // Make sure this is correctly mapped
      "material/article": "Document",
      "material/report": "Report",
      "material/unfold_less": "Collapse",
      "material/unfold_more": "Expand",
      "material/alarm": "Alarm",
      "material/list": "List",
      "material/view_module": "View Module",
      "material/location_searching": "Location",
      "material/link": "Link",
      "material/merge_type": "Merge",
      // Add more mappings if needed
    };
    // --- End Naming Logic ---

    const elementList = [];
    // Log all elements for debugging
    console.log(
      `Found ${clickableElements.length} potential elements in toolbar`
    );

    Array.from(clickableElements).forEach((el, index) => {
      const iconEl = el.querySelector("svg");
      const iconData = iconEl?.getAttribute("data-icon") || "";
      console.log(
        `Element ${index} icon: ${iconData}, disabled: ${el.hasAttribute(
          "disabled"
        )}, class: ${el.className}`
      );

      let isDisabled = false;
      let isHidden = false;
      let elementName = `Element ${index + 1}`; // Default name
      let selector = "";
      let elementType = el.tagName.toLowerCase(); // 'button' or 'div'

      // --- Check Disabled State ---
      if (elementType === "button") {
        isDisabled =
          el.hasAttribute("disabled") ||
          el.classList.contains("disabled") ||
          el.classList.contains("ia_button--primary--disabled");
      } else if (elementType === "div") {
        isDisabled =
          el.classList.contains("disabled") ||
          el.closest(".disabled") !== null ||
          el.classList.contains("ia_button--primary--disabled");
      }

      // --- Improved Visibility Check ---
      // Check direct style properties (more reliable than computed style)
      isHidden =
        el.style.display === "none" || el.style.visibility === "hidden";

      // Skip hidden elements
      if (isHidden) {
        console.log(`Skipping hidden element ${index}`);
        return; // Skip this element in the forEach
      }

      // --- Determine Element Name ---
      const textEl = el.querySelector(".text"); // Common class for text in buttons
      const labelEl = el.querySelector(".ia_labelComponent span"); // Specific label in the example div

      if (iconData && iconToName[iconData]) {
        elementName = iconToName[iconData];
      } else if (textEl && textEl.textContent.trim()) {
        elementName = textEl.textContent.trim();
      } else if (labelEl && labelEl.textContent.trim()) {
        elementName = `Label ${labelEl.textContent.trim()}`;
      } else if (el.getAttribute("aria-label")) {
        elementName = el.getAttribute("aria-label");
      }

      // Add "Button" or "Control" suffix for clarity
      elementName += elementType === "button" ? " Button" : " Control";

      // --- Determine Selector ---
      // Prefer data-component-path when available as it's typically more stable
      if (el.hasAttribute("data-component-path")) {
        selector = `[data-component-path="${el.getAttribute(
          "data-component-path"
        )}"]`;
      } else if (el.id) {
        selector = `#${el.id}`;
      } else {
        // Ultimate fallback: XPath
        selector = getElementXPath(el, iframe.contentDocument);
      }

      console.log(
        `Adding element to list: ${elementName}, disabled: ${isDisabled}, selector: ${selector}`
      );

      elementList.push({
        name: elementName,
        selector: selector,
        disabled: isDisabled,
        skipActions: isDisabled, // Skip actions for disabled buttons
        type: elementType,
      });
    });

    console.log(
      "Final detected clickable toolbar elements:",
      elementList.map((e) => e.name).join(", ")
    );
    return elementList;
  } catch (error) {
    console.warn("Error getting toolbar element selectors:", error);
    return [];
  }
}

export default {
  waitForToolbar,
  getToolbarButtonSelectors,
};
