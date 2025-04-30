// perspective_capture/js/ui/url-selector.js
import { elements } from "./elements.js";
import { utils } from "./utils.js";
import urlFetcher from "../url-fetcher.js";
import * as events from "../events.js";

export const urlSelector = {
  selectedUrls: new Set(),
  baseUrlInput: null,
  // --- NEW: Reference for the toggle button ---
  toggleSelectionBtn: null,
  // --- END NEW ---

  /**
   * Initialize the URL selector UI
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Create URL selector container if it doesn't exist
      if (!document.getElementById("urlSelectorContainer")) {
        this.createSelectorContainer();
      } else {
        // If it exists, ensure internal references are set
        this.container = document.getElementById("urlSelectorContainer");
        this.categoriesContainer = document.getElementById(
          "urlCategoriesContainer"
        );
        this.searchInput = document.getElementById("urlSearch");
        this.selectionCounter = document.getElementById("selectionCounter");
        // --- UPDATED: Get reference to the new button ---
        this.toggleSelectionBtn = document.getElementById("toggleSelectionBtn");
        // --- END UPDATED ---
      }

      // Show initial state - waiting for URLs
      if (this.categoriesContainer && !this.categoriesContainer.hasChildNodes()) {
        this.categoriesContainer.innerHTML = `
          <div class="url-selector-initial">
            <p>Available pages will load here after selecting a login option.</p>
          </div>
        `;
      }

      // Add event listeners for selection (ensure they are added only once)
      if (!this.container?.dataset?.listenersAttached) {
        this.setupEventListeners();
        if (this.container) this.container.dataset.listenersAttached = "true";
      }
    } catch (error) {
      console.error("Failed to initialize URL selector:", error);
      utils.showStatus(`Failed to initialize URL selector: ${error.message}`, true);
      this.showFallbackUI(); // Attempt to show fallback
    }
  },

  /**
   * Create the URL selector container
   */
  createSelectorContainer() {
    // Find URL list and its container (assuming it might exist)
    const urlList = elements.urlList || document.getElementById("urlList"); // Ensure reference
    const parentElement = urlList?.parentElement; // Use optional chaining

    // Save reference to the original elements if found
    if (urlList) {
      this.originalUrlList = urlList;
      this.originalUrlListParent = parentElement;
      this.urlHelpText = document.getElementById("urlHelpText");
    }

    // Create container for the URL selector
    this.container = document.createElement("div");
    this.container.id = "urlSelectorContainer";
    this.container.className = "url-selector-container";

    // --- Toolbar Creation ---
    const toolbar = document.createElement("div");
    toolbar.className = "url-selector-toolbar";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search pages...";
    searchInput.className = "url-selector-search";
    searchInput.id = "urlSearch";
    toolbar.appendChild(searchInput);

    const actionsContainer = document.createElement("div");
    actionsContainer.className = "url-selector-actions";

    // --- UPDATED: Create a single toggle button ---
    const toggleSelectionBtn = document.createElement("button");
    toggleSelectionBtn.textContent = "Select All"; // Initial text
    toggleSelectionBtn.className = "btn btn-small toggle-select-btn"; // New class for styling
    toggleSelectionBtn.id = "toggleSelectionBtn";
    actionsContainer.appendChild(toggleSelectionBtn);
    // --- END UPDATED ---

    const selectionCounter = document.createElement("div");
    selectionCounter.className = "selection-counter";
    selectionCounter.id = "selectionCounter";
    selectionCounter.textContent = "0 selected";
    actionsContainer.appendChild(selectionCounter);

    toolbar.appendChild(actionsContainer);
    this.container.appendChild(toolbar);

    // Create URL categories container
    const categoriesContainer = document.createElement("div");
    categoriesContainer.className = "url-categories-container";
    categoriesContainer.id = "urlCategoriesContainer";
    this.container.appendChild(categoriesContainer);

    // Replace the original textarea with our container
    if (parentElement && urlList && urlList.parentNode === parentElement) {
      parentElement.replaceChild(this.container, urlList);
    } else if (parentElement) {
      const helpText = document.getElementById("urlHelpText");
      if (helpText && helpText.parentElement === parentElement) {
        parentElement.insertBefore(this.container, helpText.nextSibling);
      } else {
        parentElement.appendChild(this.container);
      }
      console.warn(
        "URL list textarea not found for replacement, inserting/appending URL selector."
      );
    } else {
      console.error("Parent element for URL list not found. Cannot add URL selector.");
      return;
    }

    // Keep a reference to these elements
    this.categoriesContainer = categoriesContainer;
    this.searchInput = searchInput;
    this.selectionCounter = selectionCounter;
    // --- UPDATED: Store reference to the new button ---
    this.toggleSelectionBtn = toggleSelectionBtn;
    // --- END UPDATED ---

    // Initially disable button and search until URLs are loaded
    this.toggleSelectionBtn.disabled = true; // Disable the toggle button
    this.searchInput.disabled = true;
  },

  /**
   * Show loading state while fetching URLs
   */
  showLoadingState() {
    if (!this.categoriesContainer) return;
    this.categoriesContainer.innerHTML = `
      <div class="url-selector-loading">
        <div class="loading-spinner"></div>
        <p>Loading available pages...</p>
      </div>
    `;
    if (this.searchInput) this.searchInput.disabled = true;
    // --- UPDATED: Disable the toggle button ---
    if (this.toggleSelectionBtn) this.toggleSelectionBtn.disabled = true;
    // --- END UPDATED ---
  },

  /**
   * Show fallback text area when URL fetching fails
   */
  showFallbackUI() {
    if (!this.container || !this.container.parentElement) return;

    const parentElement = this.container.parentElement;
    parentElement.removeChild(this.container); // Remove our selector

    // Restore original textarea if we have reference
    if (this.originalUrlList) {
        // Try inserting after help text, otherwise append
        const helpText = document.getElementById('urlHelpText');
        if (helpText && helpText.parentElement === parentElement) {
             parentElement.insertBefore(this.originalUrlList, helpText.nextSibling);
        } else {
             parentElement.appendChild(this.originalUrlList);
        }
      this.originalUrlList.style.display = "block"; // Make it visible

      // Update title
      const urlInputTitle = document.getElementById('urlInputTitle');
      if (urlInputTitle) {
        urlInputTitle.textContent = "Enter URLs to Capture (one per line)";
      }

      // Add a note about the failure
      const fallbackNote = document.createElement("div");
      fallbackNote.className = "help-text";
      fallbackNote.style.color = "#dc3545";
      fallbackNote.textContent = "Failed to load URLs automatically. Please enter URLs manually.";
      parentElement.insertBefore(fallbackNote, this.originalUrlList);

       // Ensure the manual textarea is used for capture if fallback occurs
        elements.urlList = this.originalUrlList; // Restore reference in UI elements
    }
  },

  /**
   * Clean up the URL selector
   */
  cleanup() {
    if (this.container && this.container.parentElement) {
      const parentElement = this.container.parentElement;
      parentElement.removeChild(this.container);
      if (this.originalUrlList) {
        const urlHelpText = document.getElementById("urlHelpText");
        if (urlHelpText && urlHelpText.parentElement) {
          urlHelpText.parentElement.insertBefore(this.originalUrlList, urlHelpText.nextSibling);
        } else if (parentElement) {
          parentElement.appendChild(this.originalUrlList);
        }
        this.originalUrlList.style.display = "block";
      }
    }
    this.selectedUrls.clear();
    // Clear references to prevent memory leaks
    this.container = null;
    this.categoriesContainer = null;
    this.searchInput = null;
    this.selectionCounter = null;
    // --- UPDATED: Clear new button reference ---
    this.toggleSelectionBtn = null;
    // --- END UPDATED ---
    this.originalUrlList = null;
    this.originalUrlListParent = null;
    this.urlHelpText = null;
  },

  /**
   * Render URL categories
   * @param {Object} categorizedUrls - URLs organized by category
   */
  renderUrlCategories(categorizedUrls) {
     if (!this.categoriesContainer) return;

    if (!categorizedUrls || Object.keys(categorizedUrls).length === 0) {
      this.categoriesContainer.innerHTML = "<p>No URLs available for the specified project.</p>";
      if (this.searchInput) this.searchInput.disabled = true;
      // --- UPDATED: Disable toggle button ---
      if (this.toggleSelectionBtn) this.toggleSelectionBtn.disabled = true;
      // --- END UPDATED ---
      return;
    }

    this.categoriesContainer.innerHTML = ""; // Clear previous content
    const sortedCategories = Object.keys(categorizedUrls).sort();

    sortedCategories.forEach((category) => {
      const urls = categorizedUrls[category];
      const categorySection = document.createElement("div");
      categorySection.className = "url-category";
      categorySection.dataset.category = category;

      const categoryHeader = document.createElement("div");
      categoryHeader.className = "url-category-header";

      const categoryCheckbox = document.createElement("input");
      categoryCheckbox.type = "checkbox";
      categoryCheckbox.className = "category-checkbox";
      categoryCheckbox.dataset.category = category;
      categoryHeader.appendChild(categoryCheckbox);

      const categoryTitle = document.createElement("h3");
      categoryTitle.textContent = `${category} (${urls.length})`;
      categoryHeader.appendChild(categoryTitle);

      const urlsContainer = document.createElement("div");
      urlsContainer.className = "url-items-container"; // Always visible now

      urls.forEach((url) => {
        const urlItem = document.createElement("div");
        urlItem.className = "url-item";
        urlItem.dataset.path = url.path;

        const urlCheckbox = document.createElement("input");
        urlCheckbox.type = "checkbox";
        urlCheckbox.className = "url-checkbox";
        urlCheckbox.dataset.path = url.path;
        urlItem.appendChild(urlCheckbox);

        const urlTitle = document.createElement("span");
        urlTitle.className = "url-title";
        urlTitle.textContent = url.title || url.path;
        urlTitle.title = url.path;
        urlItem.appendChild(urlTitle);

        const urlPath = document.createElement("span");
        urlPath.className = "url-path";
        urlPath.textContent = url.path;
        urlItem.appendChild(urlPath);

        urlsContainer.appendChild(urlItem);
      });

      categorySection.appendChild(categoryHeader);
      categorySection.appendChild(urlsContainer);
      this.categoriesContainer.appendChild(categorySection);
    });

    // Enable controls now that URLs are loaded
    if (this.searchInput) this.searchInput.disabled = false;
    // --- UPDATED: Enable toggle button ---
    if (this.toggleSelectionBtn) this.toggleSelectionBtn.disabled = false;
    // --- END UPDATED ---
    this.updateSelectionCounter(); // Update counter and button states
  },

  /**
   * Set up event listeners for the URL selector
   */
  setupEventListeners() {
    // --- UPDATED: Check for toggleSelectionBtn instead of old buttons ---
    if (!this.container || !this.categoriesContainer || !this.searchInput || !this.toggleSelectionBtn) {
        console.warn("URL Selector elements not ready, skipping event listeners setup.");
        return;
    }
    // --- END UPDATED ---

    // Category header/item click delegation
    this.categoriesContainer.addEventListener("click", (event) => {
      // URL item selection (when clicking anywhere except checkbox)
      const urlItem = event.target.closest(".url-item");
      if (urlItem && !event.target.classList.contains("url-checkbox")) {
        const checkbox = urlItem.querySelector(".url-checkbox");
        if (checkbox) { // Check if checkbox exists
            checkbox.checked = !checkbox.checked;
            this.handleUrlSelection(checkbox);
        }
        event.stopPropagation();
        return; // Prevent category header click logic below
      }

      // Category header click (toggle category checkbox)
      const categoryHeader = event.target.closest(".url-category-header");
      if (categoryHeader && !event.target.classList.contains("category-checkbox")) {
        const checkbox = categoryHeader.querySelector(".category-checkbox");
         if (checkbox) { // Check if checkbox exists
            checkbox.checked = !checkbox.checked;
            this.handleCategorySelection(checkbox);
         }
        event.stopPropagation();
      }
    });

    // URL/Category checkbox change event
    this.categoriesContainer.addEventListener("change", (event) => {
      if (event.target.classList.contains("url-checkbox")) {
        this.handleUrlSelection(event.target);
      } else if (event.target.classList.contains("category-checkbox")) {
        this.handleCategorySelection(event.target);
      }
    });

    // Search functionality
    this.searchInput.addEventListener("input", (event) => {
      this.filterUrls(event.target.value);
    });

    // --- UPDATED: Add listener for the toggle button ---
    this.toggleSelectionBtn.addEventListener("click", () => {
      this.handleToggleSelection(); // Call the new handler
    });
    // --- END UPDATED ---

  },

  /** Handle URL checkbox selection */
  handleUrlSelection(checkbox) {
    const path = checkbox.dataset.path;
    if (!path) return;
    if (checkbox.checked) {
      this.selectedUrls.add(path);
    } else {
      this.selectedUrls.delete(path);
    }
    this.updateCategoryCheckboxes();
    this.updateSelectionCounter();
    this.updateCaptureButtonState();
  },

  /** Handle category checkbox selection */
  handleCategorySelection(checkbox) {
    const category = checkbox.dataset.category;
    const urlCheckboxes = this.categoriesContainer?.querySelectorAll(
      `.url-category[data-category="${category}"] .url-checkbox`
    );
    if (!urlCheckboxes) return;

    urlCheckboxes.forEach((urlCheckbox) => {
      urlCheckbox.checked = checkbox.checked;
      const path = urlCheckbox.dataset.path;
      if (!path) return;
      if (checkbox.checked) {
        this.selectedUrls.add(path);
      } else {
        this.selectedUrls.delete(path);
      }
    });
    this.updateSelectionCounter();
    this.updateCaptureButtonState();
  },

  /** Update category checkboxes based on URL selections */
  updateCategoryCheckboxes() {
     if (!this.categoriesContainer) return;
    const categories = this.categoriesContainer.querySelectorAll(".url-category");

    categories.forEach((category) => {
      const categoryCheckbox = category.querySelector(".category-checkbox");
       if (!categoryCheckbox) return;

      const urlCheckboxes = category.querySelectorAll(".url-checkbox");
      if (urlCheckboxes.length === 0) { // Handle empty category
           categoryCheckbox.checked = false;
           categoryCheckbox.indeterminate = false;
           return;
      }
      const checkedCount = Array.from(urlCheckboxes).filter(cb => cb.checked).length;

      if (checkedCount === 0) {
        categoryCheckbox.checked = false;
        categoryCheckbox.indeterminate = false;
      } else if (checkedCount === urlCheckboxes.length) {
        categoryCheckbox.checked = true;
        categoryCheckbox.indeterminate = false;
      } else {
        categoryCheckbox.checked = false;
        categoryCheckbox.indeterminate = true;
      }
    });
  },

  /** Update the selection counter and toggle button state */
  updateSelectionCounter() {
    if (!this.selectionCounter || !this.toggleSelectionBtn) return; // Check toggle button too

    const count = this.selectedUrls.size;
    this.selectionCounter.textContent = `${count} selected`;

    // Calculate total number of available (visible) URLs
    let totalVisibleUrls = 0;
    if (this.categoriesContainer) {
      totalVisibleUrls = this.categoriesContainer.querySelectorAll(
        '.url-item:not([style*="display: none"]) .url-checkbox'
      ).length;
    }

    // Update toggle button state and text
    if (totalVisibleUrls === 0) {
      this.toggleSelectionBtn.disabled = true;
      this.toggleSelectionBtn.textContent = "Select All";
      this.toggleSelectionBtn.classList.remove("clear-mode"); // Ensure class is removed
    } else if (count === totalVisibleUrls) {
      // All visible items are selected
      this.toggleSelectionBtn.disabled = false;
      this.toggleSelectionBtn.textContent = "Deselect All";
      this.toggleSelectionBtn.classList.add("clear-mode"); // Add class for styling
    } else {
      // Some or none are selected
      this.toggleSelectionBtn.disabled = false;
      this.toggleSelectionBtn.textContent = "Select All";
      this.toggleSelectionBtn.classList.remove("clear-mode"); // Ensure class is removed
    }
  },

  /** Update the main capture button state based on selections */
  updateCaptureButtonState() {
    const count = this.selectedUrls.size;
    events.emit("URL_SELECTION_CHANGED", {
      count,
      selectedUrls: Array.from(this.selectedUrls),
    });
  },

  /** Filter URLs based on search term */
  filterUrls(searchTerm) {
     if (!this.categoriesContainer) return;

    // Remove existing no results message if present
    const existingNoResults = this.categoriesContainer.querySelector(".no-results-message");
    if (existingNoResults) {
        existingNoResults.remove();
    }

    const term = searchTerm.toLowerCase().trim();
    let visibleCount = 0;

    this.categoriesContainer.querySelectorAll(".url-item").forEach((item) => {
        const path = (item.dataset.path || "").toLowerCase();
        const title = (item.querySelector(".url-title")?.textContent || "").toLowerCase();
        const isMatch = !term || path.includes(term) || title.includes(term);

        item.style.display = isMatch ? "" : "none";
        if (isMatch) visibleCount++;
    });

    this.updateCategoryVisibility();
    this.updateSelectionCounter(); // Update button state based on *visible* items

    // If no results found after filtering, show a message
    if (term && visibleCount === 0 && this.categoriesContainer) { // Check container exists
        const noResultsMessage = document.createElement("div");
        noResultsMessage.className = "no-results-message";
        noResultsMessage.textContent = "No matching URLs found.";
        this.categoriesContainer.appendChild(noResultsMessage);
    }
  },

  /** Update category visibility and counts based on visible URLs */
  updateCategoryVisibility() {
     if (!this.categoriesContainer) return;
    const categories = this.categoriesContainer.querySelectorAll(".url-category");

    categories.forEach((category) => {
      const visibleItemsCount = Array.from(category.querySelectorAll(".url-item")).filter(item => item.style.display !== "none").length;

      category.style.display = visibleItemsCount === 0 ? "none" : "";

      // Update category header count if needed
       const categoryName = category.dataset.category;
       const totalCountInCategory = urlFetcher?.categorizedUrls?.[categoryName]?.length || 0;
       const categoryTitle = category.querySelector("h3");

        if (categoryTitle) {
            const searchTerm = this.searchInput?.value.trim() || "";
            if (searchTerm && visibleItemsCount !== totalCountInCategory && totalCountInCategory > 0) {
                 categoryTitle.textContent = `${categoryName} (${visibleItemsCount} of ${totalCountInCategory})`;
            } else if (totalCountInCategory > 0) {
                 categoryTitle.textContent = `${categoryName} (${totalCountInCategory})`; // Show total count otherwise
            } else {
                 categoryTitle.textContent = categoryName; // Just name if category was somehow empty
            }
        }
    });
  },

  /** Select all VISIBLE URLs */
  selectAll() {
     if (!this.categoriesContainer) return;
    const visibleCheckboxes = Array.from(this.categoriesContainer.querySelectorAll(".url-item"))
      .filter((item) => item.style.display !== "none")
      .map((item) => item.querySelector(".url-checkbox"));

    visibleCheckboxes.forEach((checkbox) => {
       if (checkbox && !checkbox.checked) {
        checkbox.checked = true;
        const path = checkbox.dataset.path;
        if (path) this.selectedUrls.add(path);
       }
    });

    this.updateCategoryCheckboxes();
    this.updateSelectionCounter();
    this.updateCaptureButtonState();
  },

  /** Clear all URL selections */
  clearSelection() {
     if (!this.categoriesContainer) return;
    this.categoriesContainer.querySelectorAll(".url-checkbox").forEach((checkbox) => {
         if (checkbox.checked) {
            checkbox.checked = false;
         }
      });

    this.selectedUrls.clear();
    this.updateCategoryCheckboxes();
    this.updateSelectionCounter();
    this.updateCaptureButtonState();
  },

  // --- NEW: Handler for the toggle button click ---
  handleToggleSelection() {
    if (!this.toggleSelectionBtn || !this.categoriesContainer) return;

    // Get current selection count and total visible count
    const selectedCount = this.selectedUrls.size;
    const totalVisibleUrls = this.categoriesContainer.querySelectorAll(
        '.url-item:not([style*="display: none"]) .url-checkbox'
    ).length;

    if (totalVisibleUrls === 0) return; // Do nothing if no URLs are visible

    if (selectedCount === totalVisibleUrls) {
        // If all are selected, clear selection
        this.clearSelection();
    } else {
        // Otherwise, select all visible
        this.selectAll();
    }
  },
  // --- END NEW ---

  /** Get the list of selected URLs in full format */
  getSelectedUrlsForCapture() {
     if (!urlFetcher || !urlFetcher.baseClientUrl) {
         console.error("URL Fetcher or Base Client URL not available for generating full URLs.");
         return [];
     }
    return urlFetcher.generateFullUrls(Array.from(this.selectedUrls));
  },
};

export default urlSelector;