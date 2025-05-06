// js/ui/url-selector.js
import { elements as UIElements } from "./elements.js"; // Assuming elements.js exports 'elements'
import { utils } from "./utils.js";
import urlFetcher from "../url-fetcher.js";
import * as events from "../events.js";

export const urlSelector = {
  selectedUrls: new Set(),
  toggleSelectionBtn: null,
  container: null, // Main div: #urlSelectorContainer
  categoriesContainer: null, // Div: #urlCategoriesContainer
  searchInput: null, // Input: #urlSearch
  selectionCounter: null, // Div: #selectionCounter
  isInitialized: false, // Flag to track if initial DOM setup has occurred

  async initialize() {
    // If already initialized and the main container still exists in the DOM,
    // ensure internal references are up-to-date and listeners are attached.
    if (this.isInitialized && document.getElementById("urlSelectorContainer")) {
      // console.log("URL Selector: Already initialized, ensuring references.");
      this.container = document.getElementById("urlSelectorContainer");
      this.categoriesContainer = document.getElementById(
        "urlCategoriesContainer"
      );
      this.searchInput = document.getElementById("urlSearch");
      this.selectionCounter = document.getElementById("selectionCounter");
      this.toggleSelectionBtn = document.getElementById("toggleSelectionBtn");

      // Ensure listeners are attached if somehow missed (e.g., DOM recreated externally)
      if (this.container && !this.container.dataset.listenersAttached) {
        this.setupEventListeners();
        this.container.dataset.listenersAttached = "true";
      }
      return;
    }

    // Proceed with full initialization if not yet done or container is missing
    try {
      this.container = document.getElementById("urlSelectorContainer");

      if (!this.container) {
        console.log(
          "URL Selector: Container (#urlSelectorContainer) not found. Creating DOM structure."
        );
        // Use a known stable parent from your HTML. '#captureSettingsContent' is a good candidate.
        // For even more robustness, add a dedicated <div id="url-selector-host"></div> in your index.html
        // within #captureSettingsContent, and pass that ID to _createDOMStructure.
        const parentElement =
          document.getElementById("captureSettingsContent") || document.body; // Fallback to body if parent not found

        if (!parentElement) {
          // Should not happen if #captureSettingsContent exists
          console.error(
            "Critical: Cannot find a suitable parent element for URL selector. UI may be broken."
          );
          this.showFallbackUIIfNeeded(); // Attempt fallback
          return;
        }
        this._createDOMStructure(parentElement);
        this.isInitialized = true; // Mark that DOM structure is now created
      } else {
        // Container was found in DOM, likely already initialized.
        // console.log("URL Selector: Container (#urlSelectorContainer) found. Setting internal references.");
        this.categoriesContainer = document.getElementById(
          "urlCategoriesContainer"
        );
        this.searchInput = document.getElementById("urlSearch");
        this.selectionCounter = document.getElementById("selectionCounter");
        this.toggleSelectionBtn = document.getElementById("toggleSelectionBtn");
        this.isInitialized = true; // Mark as initialized since DOM exists
      }

      // Attach event listeners only once
      if (this.container && !this.container.dataset.listenersAttached) {
        this.setupEventListeners();
        this.container.dataset.listenersAttached = "true";
        console.log("URL Selector: Event listeners attached.");
      }

      // Set initial placeholder text if the categories area is empty and ready
      if (
        this.categoriesContainer &&
        this.categoriesContainer.innerHTML.trim() === ""
      ) {
        this.categoriesContainer.innerHTML = `<div class="url-selector-initial"><p>Select 'Automatic' source or load manual JSON.</p></div>`;
      }
      // Visibility of this.container is managed by app.js based on selected source type.
    } catch (error) {
      console.error("Failed to initialize URL selector:", error);
      if (typeof utils !== "undefined" && utils.showStatus) {
        utils.showStatus(`URL Selector Init Error: ${error.message}`, true);
      }
      this.showFallbackUIIfNeeded();
    }
  },

  _createDOMStructure(parentElement) {
    if (!parentElement) {
      console.error(
        "URLSelector _createDOMStructure: No parentElement provided. Aborting DOM creation."
      );
      return;
    }

    // Create main container
    this.container = document.createElement("div");
    this.container.id = "urlSelectorContainer";
    this.container.className = "url-selector-container";
    this.container.style.display = "none"; // Initially hidden; app.js controls overall visibility

    // Create Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "url-selector-toolbar";

    this.searchInput = document.createElement("input");
    this.searchInput.type = "text";
    this.searchInput.placeholder = "Search pages...";
    this.searchInput.className = "url-selector-search";
    this.searchInput.id = "urlSearch";
    toolbar.appendChild(this.searchInput);

    const actionsContainer = document.createElement("div");
    actionsContainer.className = "url-selector-actions";

    this.toggleSelectionBtn = document.createElement("button");
    this.toggleSelectionBtn.textContent = "Select All";
    this.toggleSelectionBtn.className = "btn btn-small toggle-select-btn"; // Uses new unified button class
    this.toggleSelectionBtn.id = "toggleSelectionBtn";
    actionsContainer.appendChild(this.toggleSelectionBtn);

    this.selectionCounter = document.createElement("div");
    this.selectionCounter.className = "selection-counter";
    this.selectionCounter.id = "selectionCounter";
    this.selectionCounter.textContent = "0 selected";
    actionsContainer.appendChild(this.selectionCounter);

    toolbar.appendChild(actionsContainer);
    this.container.appendChild(toolbar);

    // Create Categories Area
    this.categoriesContainer = document.createElement("div");
    this.categoriesContainer.className = "url-categories-container";
    this.categoriesContainer.id = "urlCategoriesContainer";
    this.container.appendChild(this.categoriesContainer);

    // Append the new container to the specified parent.
    // If #urlSelectorPlaceholder exists, insert before it and hide it.
    // Otherwise, append to parentElement.
    const placeholderEl = document.getElementById("urlSelectorPlaceholder");
    if (placeholderEl && placeholderEl.parentElement === parentElement) {
      parentElement.insertBefore(this.container, placeholderEl);
      // placeholderEl.style.display = 'none'; // Hide the original placeholder as it's now replaced in function
    } else {
      parentElement.appendChild(this.container);
      console.warn(
        "URL Selector Placeholder not found in expected parent or does not exist; appended selector. Consider using a static host div in index.html for robustness."
      );
    }

    // Disable controls initially
    this.toggleSelectionBtn.disabled = true;
    this.searchInput.disabled = true;
    console.log("URL Selector: DOM structure created and appended.");
  },

  cleanup() {
    // This function is called when the Project URL changes, or when switching source types.
    // It should reset the selector's state and clear its content, but NOT remove the main container from DOM.
    console.log(
      "URL Selector: cleanup called - clearing content, resetting state, and hiding container."
    );

    // Clear rendered URLs and reset internal selection state and UI controls within the selector
    this.clearRenderedUrls();

    // Hide the main container. Its re-appearance is managed by app.js (_handleSourceChange)
    if (this.container) {
      this.container.style.display = "none";
    }
    // Note: We no longer nullify this.container and other DOM element references here,
    // as the container persists in the DOM. initialize() will re-acquire them if needed.
    // this.isInitialized flag remains true as the DOM structure was created.
  },

  clearRenderedUrls() {
    // This is called by cleanup() or when switching from manual to auto source.
    if (!this.isInitialized || !this.container) {
      // console.log("URL Selector: Clear request ignored - not initialized or container missing.");
      return;
    }
    // console.log("URL Selector: Clearing rendered URL categories and resetting controls.");

    if (this.categoriesContainer) {
      this.categoriesContainer.innerHTML = `<div class="url-selector-initial"><p>Select 'Automatic' source or load manual JSON.</p></div>`;
    }
    this.selectedUrls.clear();

    if (this.searchInput) {
      this.searchInput.value = "";
      this.searchInput.disabled = true; // Disable until new URLs are loaded
    }
    if (this.toggleSelectionBtn) {
      this.toggleSelectionBtn.disabled = true; // Disable until new URLs are loaded
      this.toggleSelectionBtn.textContent = "Select All";
      this.toggleSelectionBtn.classList.remove("clear-mode");
    }

    this.updateSelectionCounter(); // Update counter to "0 selected"
    this.updateCaptureButtonState(); // Notify app to update main capture button (likely disable it)

    // Visibility of this.container is managed by app.js logic (e.g. in _handleSourceChange)
    // Do not hide this.container here directly as it might conflict with app.js's intentions.
  },

  showLoadingState(message = "Loading available pages...") {
    if (!this.isInitialized) {
      // Try to initialize if not already. This might happen if called too early.
      console.warn(
        "URL Selector: showLoadingState called before full initialization. Attempting init."
      );
      this.initialize().then(() => {
        // Ensure initialize is async if it wasn't already
        if (this.container) this._displayLoadingState(message);
      });
      return;
    }
    if (!this.container || !this.categoriesContainer) {
      console.error(
        "URL Selector: Cannot show loading state - container or categoriesContainer missing."
      );
      return;
    }
    this._displayLoadingState(message);
  },

  _displayLoadingState(message) {
    if (!this.container || !this.categoriesContainer) return;

    this.container.style.display = ""; // Make the main selector container visible
    this.categoriesContainer.innerHTML = `
      <div class="url-selector-loading">
        <div class="loading-spinner"></div>
        <p>${message}</p>
      </div>
    `;
    if (this.searchInput) this.searchInput.disabled = true;
    if (this.toggleSelectionBtn) this.toggleSelectionBtn.disabled = true;
    this.selectedUrls.clear();
    this.updateSelectionCounter();
    this.updateCaptureButtonState();
  },

  renderUrlCategories(categorizedUrls) {
    if (!this.isInitialized || !this.container || !this.categoriesContainer) {
      console.warn(
        "URL Selector: Attempted to render URLs, but selector UI not fully ready. Attempting to initialize first."
      );
      this.initialize().then(() => {
        // Ensure initialize is async if it wasn't already
        if (this.container && this.categoriesContainer) {
          // Check again after init attempt
          this._doRenderUrlCategories(categorizedUrls);
        } else {
          console.error(
            "URL Selector: Cannot render URLs - UI still not ready after re-init attempt."
          );
        }
      });
      return;
    }
    this._doRenderUrlCategories(categorizedUrls);
  },

  _doRenderUrlCategories(categorizedUrls) {
    if (!this.container || !this.categoriesContainer) return;

    this.container.style.display = ""; // Make selector visible
    this.categoriesContainer.innerHTML = ""; // Clear previous (loading, initial, or old list)

    if (!categorizedUrls || Object.keys(categorizedUrls).length === 0) {
      this.categoriesContainer.innerHTML =
        "<div class='url-selector-initial'><p>No pages found or provided.</p></div>";
      if (this.searchInput) this.searchInput.disabled = true;
      if (this.toggleSelectionBtn) this.toggleSelectionBtn.disabled = true;
      this.selectedUrls.clear();
      this.updateSelectionCounter();
      this.updateCaptureButtonState();
      return;
    }

    const sortedCategories = Object.keys(categorizedUrls).sort();
    sortedCategories.forEach((category) => {
      const urls = categorizedUrls[category];
      if (!urls || urls.length === 0) return;

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
      categorySection.appendChild(categoryHeader);

      const urlsContainer = document.createElement("div");
      urlsContainer.className = "url-items-container";
      urls.forEach((url) => {
        const urlItem = document.createElement("div");
        urlItem.className = "url-item";
        urlItem.dataset.path = url.path;
        const urlCheckbox = document.createElement("input");
        urlCheckbox.type = "checkbox";
        urlCheckbox.className = "url-checkbox";
        urlCheckbox.dataset.path = url.path;
        urlCheckbox.checked = this.selectedUrls.has(url.path);
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
      categorySection.appendChild(urlsContainer);
      this.categoriesContainer.appendChild(categorySection);
    });

    if (this.searchInput) this.searchInput.disabled = false;
    if (this.toggleSelectionBtn) this.toggleSelectionBtn.disabled = false;

    this.updateCategoryCheckboxes();
    this.updateSelectionCounter();
    this.updateCaptureButtonState();
    this.categoriesContainer.scrollTop = 0;
    console.log("URL Selector: Categories rendered.");
  },

  setupEventListeners() {
    if (
      !this.container ||
      !this.categoriesContainer ||
      !this.searchInput ||
      !this.toggleSelectionBtn
    ) {
      console.warn("URL Selector: Elements not ready for event listeners.");
      return;
    }
    // Using a flag to prevent multiple attachments if setupEventListeners is called again
    if (this.container.dataset.listenersAttached === "true") return;

    this.categoriesContainer.addEventListener("click", (event) => {
      const urlItem = event.target.closest(".url-item");
      if (urlItem && event.target.type !== "checkbox") {
        const checkbox = urlItem.querySelector(".url-checkbox");
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          this.handleUrlSelection(checkbox);
        }
        event.stopPropagation();
        return;
      }
      const categoryHeader = event.target.closest(".url-category-header");
      if (categoryHeader && event.target.type !== "checkbox") {
        const checkbox = categoryHeader.querySelector(".category-checkbox");
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          this.handleCategorySelection(checkbox);
        }
        event.stopPropagation();
      }
    });

    this.categoriesContainer.addEventListener("change", (event) => {
      if (event.target.classList.contains("url-checkbox")) {
        this.handleUrlSelection(event.target);
      } else if (event.target.classList.contains("category-checkbox")) {
        this.handleCategorySelection(event.target);
      }
    });

    this.searchInput.addEventListener("input", (event) => {
      this.filterUrls(event.target.value);
    });
    this.searchInput.addEventListener("search", (event) => {
      this.filterUrls(event.target.value);
    });

    this.toggleSelectionBtn.addEventListener("click", () => {
      this.handleToggleSelection();
    });

    this.container.dataset.listenersAttached = "true"; // Mark as attached
    console.log("URL Selector: Event listeners setup complete.");
  },

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

  handleCategorySelection(categoryCheckbox) {
    const category = categoryCheckbox.dataset.category;
    if (!category || !this.categoriesContainer) return;
    const urlCheckboxes = this.categoriesContainer.querySelectorAll(
      `.url-category[data-category="${category}"] .url-item:not([style*="display: none"]) .url-checkbox`
    );
    urlCheckboxes.forEach((urlCheckbox) => {
      urlCheckbox.checked = categoryCheckbox.checked;
      const path = urlCheckbox.dataset.path;
      if (!path) return;
      if (categoryCheckbox.checked) {
        this.selectedUrls.add(path);
      } else {
        this.selectedUrls.delete(path);
      }
    });
    this.updateSelectionCounter();
    this.updateCaptureButtonState();
  },

  updateCategoryCheckboxes() {
    if (!this.categoriesContainer) return;
    const categories =
      this.categoriesContainer.querySelectorAll(".url-category");
    categories.forEach((category) => {
      const categoryCheckbox = category.querySelector(".category-checkbox");
      if (!categoryCheckbox) return;
      const urlCheckboxes = category.querySelectorAll(
        ".url-item:not([style*='display: none']) .url-checkbox"
      );
      if (urlCheckboxes.length === 0 && category.style.display !== "none") {
        // If category is visible but has no visible items (due to filter)
        categoryCheckbox.checked = false;
        categoryCheckbox.indeterminate = false;
        return;
      } else if (urlCheckboxes.length === 0) {
        // Category itself is hidden or genuinely empty
        return;
      }
      const checkedCount = Array.from(urlCheckboxes).filter(
        (cb) => cb.checked
      ).length;
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

  updateSelectionCounter() {
    if (
      !this.selectionCounter ||
      !this.toggleSelectionBtn ||
      !this.categoriesContainer
    )
      return;
    const selectedCount = this.selectedUrls.size;
    this.selectionCounter.textContent = `${selectedCount} selected`;

    const totalVisibleUrls = this.categoriesContainer.querySelectorAll(
      '.url-item:not([style*="display: none"]) .url-checkbox'
    ).length;

    const allCategoriesHidden = Array.from(
      this.categoriesContainer.querySelectorAll(".url-category")
    ).every((cat) => cat.style.display === "none");

    if (
      totalVisibleUrls === 0 ||
      (this.categoriesContainer.children.length === 1 &&
        this.categoriesContainer.firstElementChild.classList.contains(
          "url-selector-initial"
        ))
    ) {
      // No items or only placeholder
      this.toggleSelectionBtn.disabled = true;
      this.toggleSelectionBtn.textContent = "Select All";
      this.toggleSelectionBtn.classList.remove("clear-mode");
    } else if (selectedCount === totalVisibleUrls && selectedCount > 0) {
      this.toggleSelectionBtn.disabled = false;
      this.toggleSelectionBtn.textContent = "Deselect All";
      this.toggleSelectionBtn.classList.add("clear-mode");
    } else {
      this.toggleSelectionBtn.disabled = false;
      this.toggleSelectionBtn.textContent = "Select All";
      this.toggleSelectionBtn.classList.remove("clear-mode");
    }
  },

  updateCaptureButtonState() {
    events.emit("URL_SELECTION_CHANGED", {
      count: this.selectedUrls.size,
      selectedUrls: Array.from(this.selectedUrls),
    });
  },

  filterUrls(searchTerm) {
    if (!this.categoriesContainer) return;
    const existingNoResults = this.categoriesContainer.querySelector(
      ".no-results-message"
    );
    if (existingNoResults) existingNoResults.remove();

    const term = searchTerm.toLowerCase().trim();
    let visibleItemsOverall = 0;

    this.categoriesContainer
      .querySelectorAll(".url-category")
      .forEach((categorySection) => {
        let visibleItemsInCategory = 0;
        categorySection.querySelectorAll(".url-item").forEach((item) => {
          const path = (item.dataset.path || "").toLowerCase();
          const title = (
            item.querySelector(".url-title")?.textContent || ""
          ).toLowerCase();
          const isMatch = !term || path.includes(term) || title.includes(term);
          item.style.display = isMatch ? "" : "none";
          if (isMatch) {
            visibleItemsInCategory++;
            visibleItemsOverall++;
          }
        });
        // Hide or show the entire category section based on whether it has visible items
        categorySection.style.display =
          visibleItemsInCategory === 0 && term ? "none" : ""; // Hide if search term active and no items match in category
      });

    this.updateCategoryCheckboxes();
    this.updateSelectionCounter();

    if (
      term &&
      visibleItemsOverall === 0 &&
      this.categoriesContainer.children.length > 0 &&
      !this.categoriesContainer.querySelector(".url-selector-initial")
    ) {
      const noResultsMessage = document.createElement("div");
      noResultsMessage.className = "no-results-message";
      noResultsMessage.textContent = "No matching pages found for your search.";
      this.categoriesContainer.appendChild(noResultsMessage);
    }
  },

  // updateCategoryVisibility was integrated into filterUrls for simplicity and directness

  selectAll() {
    // Selects all *currently visible* URLs after filtering
    if (!this.categoriesContainer) return;
    const visibleCheckboxes = Array.from(
      this.categoriesContainer.querySelectorAll(
        ".url-item:not([style*='display: none']) .url-checkbox"
      )
    );
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

  clearSelection() {
    // Clears selection for ALL URLs (visible or not, effectively)
    if (!this.categoriesContainer) return;
    this.categoriesContainer
      .querySelectorAll(".url-checkbox")
      .forEach((checkbox) => {
        if (checkbox.checked) {
          checkbox.checked = false;
        }
      });
    this.selectedUrls.clear();
    this.updateCategoryCheckboxes();
    this.updateSelectionCounter();
    this.updateCaptureButtonState();
  },

  handleToggleSelection() {
    if (!this.toggleSelectionBtn || !this.categoriesContainer) return;
    const selectedCount = this.selectedUrls.size;
    const totalVisibleUrls = this.categoriesContainer.querySelectorAll(
      '.url-item:not([style*="display: none"]) .url-checkbox'
    ).length;

    if (totalVisibleUrls === 0) return;

    if (this.toggleSelectionBtn.classList.contains("clear-mode")) {
      // If it says "Deselect All"
      this.clearSelection(); // Clears all selected, including hidden ones
    } else {
      // If it says "Select All"
      this.selectAll(); // Selects only currently visible ones
    }
  },

  getSelectedUrlsForCapture() {
    if (!urlFetcher || typeof urlFetcher.generateFullUrls !== "function") {
      console.error("URL Fetcher not available for generating full URLs.");
      return [];
    }
    return urlFetcher.generateFullUrls(Array.from(this.selectedUrls));
  },

  showFallbackUIIfNeeded() {
    // Renamed from showFallbackUI for clarity
    // This method is a placeholder. Actual fallback UI (like showing original textarea)
    // would ideally be managed by app.js if urlSelector fails to initialize critically.
    console.error(
      "URL Selector Fallback: Displaying critical error or basic input if possible."
    );
    // Example: if (UIElements.urlList) UIElements.urlList.style.display = 'block';
    // This part needs careful consideration of the overall app structure for fallback.
  },
};

export default urlSelector;
