// js/context-menu-helper/toolbar-detector.js

import { getElementXPath } from "./element-utils.js";

/**
 * Wait for a toolbar to load but exclude control buttons with lock icons
 * @param {HTMLIFrameElement} iframe - The iframe element.
 * @param {number} [maxAttempts=3] - Maximum attempts.
 * @param {number} [interval=500] - Interval in ms.
 * @returns {Promise<Element|null>} - The toolbar element, or null.
 */
export async function waitForToolbar(iframe, maxAttempts = 3, interval = 200) {
  console.log("Checking for toolbar in URL:", iframe.contentWindow.location.href);
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // First look for the fixed XPath (primary method)
      const fixedXPath = '//*[@id="app-container"]/div/div[3]/div[2]/div[2]/div[1]/div[1]/div/div[1]/div';
      
      const toolbarContainer = iframe.contentDocument.evaluate(
        fixedXPath,
        iframe.contentDocument,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;
      
      if (toolbarContainer) {
        // Check if this container has buttons with lock icons, indicating they're content control buttons
        const hasLockIcons = toolbarContainer.querySelector('svg[data-icon="material/lock"]') !== null;
        
        if (hasLockIcons) {
          console.log("Found container but it contains lock icons - these are content control buttons, not a toolbar");
        } else {
          // Check for toolbar buttons with material icons (SVG)
          const iconButtons = toolbarContainer.querySelectorAll('button svg[data-icon^="material/"]');
          if (iconButtons.length > 0) {
            console.log(`Found toolbar container with ${iconButtons.length} icon buttons`);
            return toolbarContainer;
          }
        }
      }
      
      // If fixed XPath didn't find a valid toolbar, look for containers with material icon buttons
      const allContainers = iframe.contentDocument.querySelectorAll('.flex-container, [data-component="ia.container.flex"]');
      
      for (const container of allContainers) {
        // Skip containers with lock icons (content control buttons)
        const hasLockIcons = container.querySelector('svg[data-icon="material/lock"]') !== null;
        
        if (hasLockIcons) {
          continue; // Skip this container
        }
        
        // Look for toolbar buttons with SVG icons
        const iconButtons = container.querySelectorAll('button svg[data-icon^="material/"]');
        if (iconButtons.length > 0) {
          console.log(`Found toolbar container with ${iconButtons.length} icon buttons`);
          return container;
        }
      }
      
      console.log(`Attempt ${i + 1}: No valid toolbar found, waiting ${interval}ms...`);
      await new Promise((resolve) => setTimeout(resolve, interval));
    } catch (error) {
      console.warn(`Error in toolbar detection attempt ${i + 1}:`, error);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
  
  console.log("No toolbar found after maximum attempts");
  return null;
}

/**
 * Get toolbar button selectors, carefully excluding content control buttons with lock icons
 * @param {HTMLIFrameElement} iframe - The iframe element
 * @returns {Array} - Array of button objects with name and selector properties
 */
export function getToolbarButtonSelectors(iframe) {
  try {
    console.log("Getting toolbar buttons for URL:", iframe.contentWindow.location.href);
    
    // Use the same toolbar detection logic as waitForToolbar
    const fixedXPath = '//*[@id="app-container"]/div/div[3]/div[2]/div[2]/div[1]/div[1]/div/div[1]/div';
    
    const toolbarContainer = iframe.contentDocument.evaluate(
      fixedXPath,
      iframe.contentDocument,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
    
    if (!toolbarContainer) {
      console.log("No toolbar container found with fixed XPath.");
      return [];
    }
    
    // Verify this is not a container with content control buttons (has lock icons)
    const hasLockIcons = toolbarContainer.querySelector('svg[data-icon="material/lock"]') !== null;
    
    if (hasLockIcons) {
      console.log("Found container but it contains lock icons - these are content control buttons, not a toolbar");
      return [];
    }
    
    // Find toolbar buttons with SVG icons
    const buttons = toolbarContainer.querySelectorAll('button[data-component="ia.input.button"]');
    
    if (buttons.length === 0) {
      console.log("No buttons found in toolbar container.");
      return [];
    }
    
    // Map icon names to meaningful button names
    const iconToName = {
      "material/zoom_out_map": "Layout",
      "material/tune": "Settings",
      "material/trending_up": "Trends",
      "material/report": "Report",
      "material/alarm": "Alarm",
      "material/unfold_less": "Collapse",
      "material/unfold_more": "Expand",
      "material/article": "Document",
      "material/list": "List",
      "material/view_module": "View Module",
      "material/location_searching": "Location",
      "material/link": "Link",
      "material/merge_type": "Merge"
    };
    
    const buttonsList = [];
    
    Array.from(buttons).forEach((button, index) => {
      // Skip buttons that are associated with lock icons
      const nearbyLockIcon = button.querySelector('svg[data-icon="material/lock"]') || 
                            button.parentElement.querySelector('svg[data-icon="material/lock"]');
      
      if (nearbyLockIcon) {
        console.log(`Skipping button with nearby lock icon at index ${index}`);
        return;
      }
      
      // Get icon element
      const iconEl = button.querySelector("svg[data-icon]");
      const iconData = iconEl ? iconEl.getAttribute("data-icon") : "";
      
      // Determine if button is disabled
      const isDisabled = button.hasAttribute("disabled") || 
                         button.classList.contains("ia_button--primary--disabled");
      
      // Determine if button is hidden
      const isHidden = button.style.display === "none" || 
                       button.style.visibility === "hidden" ||
                       button.offsetParent === null;
      
      // Skip hidden buttons
      if (isHidden) {
        console.log(`Skipping hidden button ${index}: ${iconData}`);
        return;
      }
      
      // Determine button name
      let buttonName = `Button ${index + 1}`;
      
      if (iconData && iconToName[iconData]) {
        buttonName = iconToName[iconData];
      } else if (iconData) {
        // Extract name from icon data if not in our mapping
        const iconNameMatch = iconData.match(/material\/(.+)/);
        if (iconNameMatch && iconNameMatch[1]) {
          buttonName = iconNameMatch[1].replace(/_/g, ' ');
          // Capitalize first letter of each word
          buttonName = buttonName.replace(/\b\w/g, c => c.toUpperCase());
        }
      }
      
      // Add "Button" suffix for clarity
      buttonName += " Button";
      
      // Determine selector - prefer component path for stability
      let selector = "";
      
      if (button.hasAttribute("data-component-path")) {
        selector = `[data-component-path="${button.getAttribute("data-component-path")}"]`;
      } else if (button.id) {
        selector = `#${button.id}`;
      } else {
        // Use XPath as fallback
        selector = getElementXPath(button, iframe.contentDocument);
      }
      
      console.log(`Adding toolbar button to list: ${buttonName}, disabled: ${isDisabled}, selector: ${selector}`);
      
      buttonsList.push({
        name: buttonName,
        selector: selector,
        disabled: isDisabled,
        skipActions: isDisabled, // Skip actions for disabled buttons
        type: 'button'
      });
    });
    
    console.log("Final detected toolbar buttons:", buttonsList.map(b => b.name).join(", "));
    return buttonsList;
  } catch (error) {
    console.warn("Error getting toolbar button selectors:", error);
    return [];
  }
}

export default {
  waitForToolbar,
  getToolbarButtonSelectors,
};