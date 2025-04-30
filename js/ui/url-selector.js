// js/ui/url-selector.js
import { elements } from "./elements.js";
import { utils } from "./utils.js";
import urlFetcher from "../url-fetcher.js";
import * as events from "../events.js";

export const urlSelector = {
  selectedUrls: new Set(),
  baseUrlInput: null, // Reference might be set externally if needed

  /**
   * Initialize the URL selector UI
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Create URL selector container if it doesn't exist
      if (!document.getElementById('urlSelectorContainer')) {
          this.createSelectorContainer();
      } else {
          // If it exists, ensure internal references are set
           this.container = document.getElementById('urlSelectorContainer');
           this.categoriesContainer = document.getElementById('urlCategoriesContainer');
           this.searchInput = document.getElementById('urlSearch');
           this.selectionCounter = document.getElementById('selectionCounter');
           this.selectAllBtn = document.getElementById('selectAllBtn');
           this.clearSelectionBtn = document.getElementById('clearSelectionBtn');
      }


      // Show initial state - waiting for URLs
      if (this.categoriesContainer && !this.categoriesContainer.hasChildNodes()) { // Check if empty
        this.categoriesContainer.innerHTML = `
          <div class="url-selector-initial">
            <p>Available pages will load here after selecting a login option.</p>
          </div>
        `;
      }


      // Add event listeners for selection (ensure they are added only once)
      if (!this.container?.dataset?.listenersAttached) {
         this.setupEventListeners();
         if (this.container) this.container.dataset.listenersAttached = 'true';
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
     const urlList = elements.urlList || document.getElementById('urlList'); // Ensure reference
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

    const selectAllBtn = document.createElement("button");
    selectAllBtn.textContent = "Select All";
    selectAllBtn.className = "btn btn-small";
    selectAllBtn.id = "selectAllBtn";
    actionsContainer.appendChild(selectAllBtn);

    const clearSelectionBtn = document.createElement("button");
    clearSelectionBtn.textContent = "Clear Selection";
    clearSelectionBtn.className = "btn btn-small";
    clearSelectionBtn.id = "clearSelectionBtn";
    actionsContainer.appendChild(clearSelectionBtn);

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
         // Fallback if urlList was already removed or structure changed
         // Insert after the help text if possible
         const helpText = document.getElementById('urlHelpText');
         if (helpText && helpText.parentElement === parentElement) {
             parentElement.insertBefore(this.container, helpText.nextSibling);
         } else {
              parentElement.appendChild(this.container); // Append otherwise
         }
         console.warn("URL list textarea not found for replacement, inserting/appending URL selector.");
     } else {
         console.error("Parent element for URL list not found. Cannot add URL selector.");
         return; // Stop initialization if parent is missing
     }


    // Keep a reference to these elements
    this.categoriesContainer = categoriesContainer;
    this.searchInput = searchInput;
    this.selectionCounter = selectionCounter;
    this.selectAllBtn = selectAllBtn;
    this.clearSelectionBtn = clearSelectionBtn;

    // Initially disable buttons and search until URLs are loaded
    this.selectAllBtn.disabled = true;
    this.clearSelectionBtn.disabled = true;
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
    if (this.selectAllBtn) this.selectAllBtn.disabled = true;
    if (this.clearSelectionBtn) this.clearSelectionBtn.disabled = true;
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
   * Clean up the URL selector (e.g., if switching modes - though mode is fixed now)
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
    this.selectAllBtn = null;
    this.clearSelectionBtn = null;
    this.originalUrlList = null;
    this.originalUrlListParent = null;
    this.urlHelpText = null;
  },

  /**
   * Render URL categories (No toggle icon created)
   * @param {Object} categorizedUrls - URLs organized by category
   */
  renderUrlCategories(categorizedUrls) {
     if (!this.categoriesContainer) return;

    if (!categorizedUrls || Object.keys(categorizedUrls).length === 0) {
      this.categoriesContainer.innerHTML = "<p>No URLs available for the specified project.</p>";
      if (this.searchInput) this.searchInput.disabled = true;
      if (this.selectAllBtn) this.selectAllBtn.disabled = true;
      if (this.clearSelectionBtn) this.clearSelectionBtn.disabled = true;
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

      // --- TOGGLE ICON REMOVED ---

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
    if (this.selectAllBtn) this.selectAllBtn.disabled = false;
    this.updateSelectionCounter(); // Update counter and button states
  },

  /**
   * Set up event listeners for the URL selector (No toggle logic)
   */
  setupEventListeners() {
    if (!this.container || !this.categoriesContainer || !this.searchInput || !this.selectAllBtn || !this.clearSelectionBtn) {
        console.warn("URL Selector elements not ready, skipping event listeners setup.");
        return;
    }
    // Category header/item click delegation
    this.categoriesContainer.addEventListener("click", (event) => {
      // --- TOGGLE ICON CLICK LOGIC REMOVED ---

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
      // Make sure not clicking the checkbox itself
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

    // Select all button
    this.selectAllBtn.addEventListener("click", () => {
      this.selectAll();
    });

    // Clear selection button
    this.clearSelectionBtn.addEventListener("click", () => {
      this.clearSelection();
    });
  },

  /** Handle URL checkbox selection */
  handleUrlSelection(checkbox) {
    const path = checkbox.dataset.path;
    if (!path) return; // Ignore if path is missing
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
      if (!path) return; // Skip if path is missing
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
        categoryCheckbox.checked = false; // Indeterminate is represented as unchecked visually but with a different style if needed
        categoryCheckbox.indeterminate = true;
      }
    });
  },

  /** Update the selection counter and button states */
  updateSelectionCounter() {
     if (!this.selectionCounter) return;
    const count = this.selectedUrls.size;
    this.selectionCounter.textContent = `${count} selected`;

    // Calculate total number of available (visible) URLs for select all logic
     let totalVisibleUrls = 0;
     if (this.categoriesContainer) {
        totalVisibleUrls = this.categoriesContainer.querySelectorAll('.url-item:not([style*="display: none"]) .url-checkbox').length;
     }


    // Update buttons state
    if (this.selectAllBtn) {
         // Disable Select All only if ALL currently VISIBLE URLs are already selected
         this.selectAllBtn.disabled = totalVisibleUrls > 0 && count === totalVisibleUrls;
    }
     if (this.clearSelectionBtn) {
        this.clearSelectionBtn.disabled = count === 0;
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

    this.updateCategoryVisibility(); // Update category headers
    this.updateSelectionCounter(); // Update Select All button state based on *visible* items

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

      // Update category header count if needed (optional)
       const categoryName = category.dataset.category;
        // Use urlFetcher safely
       const totalCountInCategory = urlFetcher?.categorizedUrls?.[categoryName]?.length || 0;
       const categoryTitle = category.querySelector("h3");


        if (categoryTitle) {
            const searchTerm = this.searchInput?.value.trim() || "";
            if (searchTerm && visibleItemsCount !== totalCountInCategory && totalCountInCategory > 0) {
                 // Show "x of y" only when filtering and not all items are visible
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
       if (checkbox && !checkbox.checked) { // Only check if not already checked
        checkbox.checked = true;
        const path = checkbox.dataset.path;
        if (path) this.selectedUrls.add(path); // Add path only if it exists
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
         if (checkbox.checked) { // Only uncheck if needed
            checkbox.checked = false;
         }
      });

    this.selectedUrls.clear();
    this.updateCategoryCheckboxes();
    this.updateSelectionCounter();
    this.updateCaptureButtonState();
  },

  /** Get the list of selected URLs in full format */
  getSelectedUrlsForCapture() {
     // Ensure urlFetcher and baseClientUrl are available
     if (!urlFetcher || !urlFetcher.baseClientUrl) {
         console.error("URL Fetcher or Base Client URL not available for generating full URLs.");
         return [];
     }
    return urlFetcher.generateFullUrls(Array.from(this.selectedUrls));
  },
};

export default urlSelector;