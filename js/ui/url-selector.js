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
        const parentElement =
          document.getElementById("captureSettingsContent") || document.body;

        if (!parentElement) {
          console.error(
            "Critical: Cannot find a suitable parent element for URL selector. UI may be broken."
          );
          this.showFallbackUIIfNeeded();
          return;
        }
        this._createDOMStructure(parentElement);
        this.isInitialized = true;
      } else {
        this.categoriesContainer = document.getElementById(
          "urlCategoriesContainer"
        );
        this.searchInput = document.getElementById("urlSearch");
        this.selectionCounter = document.getElementById("selectionCounter");
        this.toggleSelectionBtn = document.getElementById("toggleSelectionBtn");
        this.isInitialized = true;
      }

      if (this.container && !this.container.dataset.listenersAttached) {
        this.setupEventListeners();
        this.container.dataset.listenersAttached = "true";
        console.log("URL Selector: Event listeners attached.");
      }

      if (
        this.categoriesContainer &&
        this.categoriesContainer.innerHTML.trim() === ""
      ) {
        this.categoriesContainer.innerHTML = `<div class="url-selector-initial"><p>Select 'Automatic' source or load manual JSON.</p></div>`;
      }
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

    this.container = document.createElement("div");
    this.container.id = "urlSelectorContainer";
    this.container.className = "url-selector-container";
    this.container.style.display = "none";

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
    this.toggleSelectionBtn.className = "btn btn-small toggle-select-btn";
    this.toggleSelectionBtn.id = "toggleSelectionBtn";
    actionsContainer.appendChild(this.toggleSelectionBtn);

    this.selectionCounter = document.createElement("div");
    this.selectionCounter.className = "selection-counter";
    this.selectionCounter.id = "selectionCounter";
    this.selectionCounter.textContent = "0 selected";
    actionsContainer.appendChild(this.selectionCounter);

    toolbar.appendChild(actionsContainer);
    this.container.appendChild(toolbar);

    this.categoriesContainer = document.createElement("div");
    this.categoriesContainer.className = "url-categories-container";
    this.categoriesContainer.id = "urlCategoriesContainer";
    this.container.appendChild(this.categoriesContainer);

    const placeholderEl = document.getElementById("urlSelectorPlaceholder");
    if (placeholderEl && placeholderEl.parentElement === parentElement) {
      parentElement.insertBefore(this.container, placeholderEl);
    } else {
      parentElement.appendChild(this.container);
      console.warn(
        "URL Selector Placeholder not found in expected parent or does not exist; appended selector. Consider using a static host div in index.html for robustness."
      );
    }

    this.toggleSelectionBtn.disabled = true;
    this.searchInput.disabled = true;
    console.log("URL Selector: DOM structure created and appended.");
  },

  cleanup() {
    console.log(
      "URL Selector: cleanup called - clearing content, resetting state, and hiding container."
    );
    this.clearRenderedUrls();
    if (this.container) {
      this.container.style.display = "none";
    }
  },

  clearRenderedUrls() {
    if (!this.isInitialized || !this.container) {
      return;
    }

    if (this.categoriesContainer) {
      this.categoriesContainer.innerHTML = `<div class="url-selector-initial"><p>Select 'Automatic' source or load manual JSON.</p></div>`;
    }
    this.selectedUrls.clear(); // Ensure selectedUrls is cleared here too

    if (this.searchInput) {
      this.searchInput.value = "";
      this.searchInput.disabled = true;
    }
    if (this.toggleSelectionBtn) {
      this.toggleSelectionBtn.disabled = true;
      this.toggleSelectionBtn.textContent = "Select All";
      this.toggleSelectionBtn.classList.remove("clear-mode");
    }

    this.updateSelectionCounter();
    this.updateCaptureButtonState();
  },

  showLoadingState(message = "Loading available pages...") {
    if (!this.isInitialized) {
      console.warn(
        "URL Selector: showLoadingState called before full initialization. Attempting init."
      );
      this.initialize().then(() => {
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

    this.container.style.display = "";
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
        if (this.container && this.categoriesContainer) {
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

    // --- KEY FIX: Clear previous selections before rendering new items ---
    this.selectedUrls.clear();
    // --- END FIX ---

    this.container.style.display = "";
    this.categoriesContainer.innerHTML = "";

    if (!categorizedUrls || Object.keys(categorizedUrls).length === 0) {
      this.categoriesContainer.innerHTML =
        "<div class='url-selector-initial'><p>No pages found or provided.</p></div>";
      if (this.searchInput) this.searchInput.disabled = true;
      if (this.toggleSelectionBtn) this.toggleSelectionBtn.disabled = true;
      this.updateSelectionCounter(); // Will show 0 due to selectedUrls.clear()
      this.updateCaptureButtonState(); // Will reflect no selection
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
        // Checkbox will be unchecked because selectedUrls was just cleared
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

    this.updateCategoryCheckboxes(); // Reflects cleared selection (all categories unchecked)
    this.updateSelectionCounter(); // Reflects cleared selection (0 selected)
    this.updateCaptureButtonState(); // Reflects cleared selection
    this.categoriesContainer.scrollTop = 0;
    console.log(
      "URL Selector: Categories rendered, selection cleared by render."
    );
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

    this.container.dataset.listenersAttached = "true";
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
        categoryCheckbox.checked = false;
        categoryCheckbox.indeterminate = false;
        return;
      } else if (urlCheckboxes.length === 0) {
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

    if (
      totalVisibleUrls === 0 ||
      (this.categoriesContainer.children.length === 1 &&
        this.categoriesContainer.firstElementChild.classList.contains(
          "url-selector-initial"
        ))
    ) {
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
        categorySection.style.display =
          visibleItemsInCategory === 0 && term ? "none" : "";
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

  selectAll() {
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
    const totalVisibleUrls = this.categoriesContainer.querySelectorAll(
      '.url-item:not([style*="display: none"]) .url-checkbox'
    ).length;

    if (totalVisibleUrls === 0) return;

    if (this.toggleSelectionBtn.classList.contains("clear-mode")) {
      this.clearSelection();
    } else {
      this.selectAll();
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
    console.error(
      "URL Selector Fallback: Displaying critical error or basic input if possible."
    );
  },
};

export default urlSelector;
