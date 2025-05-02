// ui/thumbnails.js
import { elements } from "./elements.js";
import { utils } from "./utils.js";
import { modals } from "./modals.js";
import urlFetcher from "../url-fetcher.js"; // Keep this import

export const thumbnails = {
  /**
   * Create container for live thumbnails (initially hidden via CSS)
   * @returns {HTMLElement | null} - The created container or null on failure
   */
  createLiveThumbnailsContainer() {
    const outputContainer = elements.output;
    if (!outputContainer) {
      console.error(
        "Cannot create thumbnails container: #output element not found."
      );
      return null;
    }

    let container = document.getElementById("liveThumbnails");
    if (container) {
      // Ensure references are up-to-date if container exists
      elements.liveThumbnails = container;
      elements.thumbnailsContent = document.getElementById("thumbnailsContent");
      return container;
    }

    container = document.createElement("div");
    container.id = "liveThumbnails";
    container.className = "live-thumbnails-container";

    const headerSection = document.createElement("div");
    headerSection.className = "thumbnails-header"; // Can add title or controls here later if needed

    const contentSection = document.createElement("div");
    contentSection.className = "thumbnails-content";
    contentSection.id = "thumbnailsContent";

    const footerSection = document.createElement("div");
    footerSection.className = "combine-all-pdf-container";
    footerSection.style.display = "none"; // Start hidden

    const combinePdfBtn = document.createElement("button");
    combinePdfBtn.className = "btn combine-all-pdf-btn";
    combinePdfBtn.textContent = "Combine All Screenshots to PDF";
    combinePdfBtn.disabled = true;

    // Use 'this' context correctly for the event listener
    combinePdfBtn.addEventListener("click", () => {
      const allCategories = document.querySelectorAll(".thumbnail-category");
      if (allCategories.length === 0) {
        utils.showStatus("No screenshots available", true);
        return;
      }
      // Call the method using the correct 'this' context
      this.generateAllCategoriesPDF(allCategories);
    });

    footerSection.appendChild(combinePdfBtn);
    container.appendChild(headerSection);
    container.appendChild(contentSection);
    container.appendChild(footerSection);
    outputContainer.appendChild(container);

    // Store references
    elements.liveThumbnails = container;
    elements.thumbnailsContent = contentSection;

    return container;
  },

  /**
   * Add a live thumbnail to the container, organized by category
   * (Corrected Version: Groups by parentCategory, labels thumbnail with subCategoryName)
   * @param {Object} result - Screenshot result object
   * @param {string} fileName - Filename for the screenshot
   * @param {string} [sequenceName=null] - Optional name/identifier (often the URL)
   * @param {boolean} [isRetry=false] - Whether this is a retry
   * @param {boolean} [isToolbarAction=false] - Whether from a toolbar action
   * @returns {HTMLElement | null} - The created thumbnail element or null
   */
  addLiveThumbnail(
    result,
    fileName,
    sequenceName = null,
    isRetry = false,
    isToolbarAction = false
  ) {
    let liveThumbnailsContainer =
      elements.liveThumbnails || document.getElementById("liveThumbnails");
    if (!liveThumbnailsContainer) {
      liveThumbnailsContainer = this.createLiveThumbnailsContainer();
      if (!liveThumbnailsContainer) return null;
    }

    const isHidden =
      window.getComputedStyle(liveThumbnailsContainer).display === "none";
    if (isHidden) {
      console.log("First thumbnail, making container visible.");
      liveThumbnailsContainer.style.display = "flex";
    }

    const identifierForCategory = sequenceName || fileName;
    // Get both parent and sub-category names using the fixed parser
    const { parentCategory, category: subCategoryName } =
      this.parseCategoryFromFileName(identifierForCategory);

    // --- FIX: Get container based ONLY on parentCategory for grouping ---
    // Pass null for subCategoryName here as it's not used for grouping ID/Title anymore
    const categoryContainer = this.getCategoryContainer(null, parentCategory);
    if (!categoryContainer) return null;
    const categoryContent =
      categoryContainer.querySelector(".category-content");

    // --- Create Thumbnail Element ---
    const thumbnailContainer = document.createElement("div");
    thumbnailContainer.className = "thumbnail-container";
    if (isToolbarAction) thumbnailContainer.classList.add("toolbar-action");
    if (result.error) thumbnailContainer.classList.add("error-thumbnail");

    if (isRetry) {
      const retryBadge = document.createElement("div");
      retryBadge.textContent = "Retry";
      retryBadge.className = "retry-badge";
      thumbnailContainer.appendChild(retryBadge);
    }
    if (result.error) {
      const errorBadge = document.createElement("div");
      errorBadge.textContent = "Error";
      errorBadge.className = "error-badge";
      thumbnailContainer.appendChild(errorBadge);
    }

    // --- Image or Placeholder ---
    const thumbImg = document.createElement("img");
    if (result.error) {
      thumbImg.src =
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90"><rect width="120" height="90" fill="%23f8d7da"/><text x="60" y="45" font-family="Arial" font-size="12" fill="%23721c24" text-anchor="middle" dy=".3em">Capture Error</text></svg>';
      thumbImg.className = "thumbnail-image error-image";
      thumbImg.title = result.errorMessage || "Error capturing screenshot";
    } else {
      thumbImg.src = result.thumbnail;
      thumbImg.className = "thumbnail-image";
      thumbImg.addEventListener("click", () => {
        modals.viewScreenshotFromImage(
          result.screenshot,
          fileName,
          result.width,
          result.height,
          result.timeTaken,
          result.url || identifierForCategory
        );
      });
    }
    thumbnailContainer.appendChild(thumbImg); // Add image first

    // --- FIX: Labeling within the thumbnail ---
    // 1. Add Sub-Category Name (Page Name) if it exists
    if (subCategoryName) {
      const subCatLabel = document.createElement("div");
      subCatLabel.textContent = utils.truncateText(subCategoryName, 25);
      subCatLabel.title = subCategoryName;
      // Add a specific class for styling this label if needed
      subCatLabel.className = "thumbnail-subcategory-name";
      thumbnailContainer.appendChild(subCatLabel);
    }

    // 2. Always add the generated Filename
    const nameLabel = document.createElement("div");
    nameLabel.textContent = utils.truncateText(fileName, 25);
    nameLabel.title = fileName;
    nameLabel.className = "thumbnail-filename";
    thumbnailContainer.appendChild(nameLabel);
    // --- End Labeling Fix ---

    // Add error message text if applicable
    if (result.error && result.errorMessage) {
      const errorMsg = document.createElement("div");
      errorMsg.textContent =
        result.errorMessage.includes("No view configured") ||
        result.errorMessage.includes("Mount definition")
          ? "Mount Error"
          : "Capture Failed";
      errorMsg.className = "thumbnail-error-message";
      errorMsg.title = result.errorMessage;
      thumbnailContainer.appendChild(errorMsg);
    }

    // Add download button only for non-error thumbnails
    if (!result.error && result.screenshot) {
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "thumbnail-download-btn";
      downloadBtn.title = "Download this screenshot";
      downloadBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path></svg>';
      downloadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.downloadSingleScreenshot(result.screenshot, fileName);
      });
      thumbnailContainer.appendChild(downloadBtn);
      thumbnailContainer.dataset.filename = fileName;
      thumbnailContainer.dataset.screenshot = result.screenshot;
    }

    // Add the thumbnail to the correct category container
    categoryContent.appendChild(thumbnailContainer);

    // Update category count
    const countElement = categoryContainer.querySelector(".thumbnail-count");
    if (countElement) {
      const newCount = categoryContent.querySelectorAll(
        ".thumbnail-container"
      ).length;
      countElement.textContent = `(${newCount})`;
    }

    // Ensure "Combine All" PDF button is visible and enabled
    const pdfContainer = liveThumbnailsContainer?.querySelector(
      ".combine-all-pdf-container"
    );
    if (pdfContainer && pdfContainer.style.display === "none") {
      pdfContainer.style.display = "flex";
    }
    const pdfButton = pdfContainer?.querySelector(".combine-all-pdf-btn");
    if (pdfButton && pdfButton.disabled) {
      pdfButton.disabled = false;
    }

    // Scroll into view logic
    const thumbnailRect = thumbnailContainer.getBoundingClientRect();
    const outputRect = liveThumbnailsContainer.getBoundingClientRect();
    if (thumbnailRect.bottom > outputRect.bottom) {
      liveThumbnailsContainer.scrollTop +=
        thumbnailRect.bottom - outputRect.bottom + 20;
    } else if (thumbnailRect.top < outputRect.top) {
      liveThumbnailsContainer.scrollTop -=
        outputRect.top - thumbnailRect.top + 20;
    }

    return thumbnailContainer;
  },

  /**
   * Create or get a category container for organizing thumbnails.
   * (Corrected Version: Groups and Titles based only on parentCategoryName)
   * @param {string | null} _subCategoryName - Ignored for grouping/ID/Title now. Kept for signature consistency.
   * @param {string} parentCategoryName - Name of the parent category (e.g., module name or "Home").
   * @returns {HTMLElement | null} - The category container element or null if creation fails.
   */
  getCategoryContainer(_subCategoryName, parentCategoryName) {
    // _subCategoryName is unused for ID/Title
    let liveThumbnailsContainer =
      elements.liveThumbnails || document.getElementById("liveThumbnails");
    if (!liveThumbnailsContainer) {
      liveThumbnailsContainer = this.createLiveThumbnailsContainer();
      if (!liveThumbnailsContainer) return null; // Stop if container creation failed
    }

    const contentSection = document.getElementById("thumbnailsContent");
    if (!contentSection) {
      console.error("Cannot find thumbnailsContent section");
      return null;
    }

    // --- FIX: ID and Title based ONLY on parentCategoryName ---
    const parentClean = (parentCategoryName || "unknown")
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .toLowerCase();
    const categoryId = `category-${parentClean}`; // ID based only on parent

    let categoryContainer = document.getElementById(categoryId);

    if (!categoryContainer) {
      // Create the container if it doesn't exist for this parent category
      categoryContainer = document.createElement("div");
      categoryContainer.id = categoryId;
      categoryContainer.className = "thumbnail-category";

      const categoryHeader = document.createElement("div");
      categoryHeader.className = "category-header";
      // --- Click listener for collapse/expand ---
      categoryHeader.addEventListener("click", (e) => {
        if (e.target.closest(".combine-pdf-btn")) return; // Ignore clicks on the PDF button
        const content = categoryContainer.querySelector(".category-content");
        if (!content) return;
        const isCollapsed = content.style.display === "none";
        content.style.display = isCollapsed ? "flex" : "none"; // Toggle display
        categoryHeader.classList.toggle("collapsed", !isCollapsed); // Toggle class for styling
        const toggleIcon = categoryHeader.querySelector(".toggle-icon");
        if (toggleIcon) toggleIcon.innerHTML = isCollapsed ? "▼" : "►"; // Update icon
      });

      // --- Header elements ---
      const toggleIcon = document.createElement("span");
      toggleIcon.className = "toggle-icon";
      toggleIcon.innerHTML = "▼"; // Default icon
      categoryHeader.appendChild(toggleIcon);

      const categoryTitle = document.createElement("h4");
      categoryTitle.textContent = parentCategoryName; // Title is JUST the parent category name
      categoryHeader.appendChild(categoryTitle);
      // --- End ID/Title Fix ---

      const thumbnailCount = document.createElement("span");
      thumbnailCount.className = "thumbnail-count";
      thumbnailCount.textContent = "(0)"; // Initial count
      categoryHeader.appendChild(thumbnailCount);

      // --- Content area for thumbnails ---
      const categoryContent = document.createElement("div");
      categoryContent.className = "category-content"; // Default style likely display: flex; flex-wrap: wrap;

      // --- "Combine to PDF" button for this category ---
      const combinePdfBtn = document.createElement("button");
      combinePdfBtn.className = "btn btn-small combine-pdf-btn";
      combinePdfBtn.textContent = "Combine to PDF";
      combinePdfBtn.title = `Combine screenshots from ${parentCategoryName} into a PDF`; // Use parent name in title
      combinePdfBtn.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent the header click listener
        this.generatePDF(categoryContainer); // Generate PDF for this specific category
      });
      categoryHeader.appendChild(combinePdfBtn); // Add button to header

      // --- Assemble Category Container ---
      categoryContainer.appendChild(categoryHeader);
      categoryContainer.appendChild(categoryContent);
      contentSection.appendChild(categoryContainer); // Add to the main content area
    }

    return categoryContainer; // Return existing or new container
  },

  /**
   * Parses category information from an identifier (URL or filename).
   * Handles URL paths relative to '/client/PROJECT_NAME/' or falls back to filename parsing.
   * @param {string} identifier - The input string.
   * @returns {Object} - { parentCategory: string, category: string | null }
   */
  parseCategoryFromFileName(identifier) {
    let parentCategory = "Other";
    let category = null;
    if (!identifier || typeof identifier !== "string") {
      return { parentCategory, category };
    }
    try {
      if (identifier.includes("/data/perspective/client/")) {
        const url = new URL(identifier);
        const pathname = url.pathname;
        const projectName = urlFetcher.projectName;
        let relativePath = "";
        if (projectName) {
          const prefix = `/data/perspective/client/${projectName}/`;
          if (pathname.startsWith(prefix)) {
            relativePath = pathname.substring(prefix.length);
          } else {
            const pathPartsFallback = pathname.split("/").filter(Boolean);
            const relevantSegmentsFallback = pathPartsFallback.slice(4);
            relativePath = relevantSegmentsFallback.join("/");
          }
        } else {
          const pathPartsFallback = pathname.split("/client/");
          if (pathPartsFallback.length > 1) {
            const afterClient = pathPartsFallback[1].split("/");
            relativePath = afterClient.slice(1).join("/");
          } else {
            relativePath = pathname.split("/").filter(Boolean).pop() || "";
          }
        }
        const pathSegments = relativePath.split("/").filter(Boolean);
        if (pathSegments.length === 0) {
          parentCategory = "Home";
          category = null;
        } else if (pathSegments.length === 1) {
          parentCategory = this.formatCategoryName(pathSegments[0]);
          category = null;
        } else {
          parentCategory = this.formatCategoryName(pathSegments[0]);
          category = this.formatCategoryName(pathSegments[1]);
        }
      } else {
        const namePart = identifier.split("_")[0];
        const parts = namePart.split(" - ").map((p) => p.trim());
        if (parts.length >= 2) {
          parentCategory = this.formatCategoryName(parts[0]);
          category = this.formatCategoryName(parts[1]);
        } else if (parts.length === 1 && parts[0]) {
          parentCategory = this.formatCategoryName(parts[0]);
          category = null;
        } else {
          parentCategory = "Other";
          category = null;
        }
      }
    } catch (error) {
      console.error(
        `Error parsing category from identifier "${identifier}":`,
        error
      );
      parentCategory = "ErrorParsing";
      category = identifier;
    }
    if (!parentCategory) parentCategory = "Other";
    return { parentCategory, category };
  },

  /** Helper to format category names */
  formatCategoryName(name) {
    if (!name) return "";
    try {
      const decodedName = decodeURIComponent(name);
      return decodedName
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
    } catch (e) {
      console.warn(`Could not decode category segment: ${name}`, e);
      return name
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
    }
  },

  /** Downloads a single screenshot */
  downloadSingleScreenshot(screenshotData, fileName) {
    try {
      const link = document.createElement("a");
      link.href = screenshotData;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      utils.showStatus(`Downloaded: ${fileName}`, false, 3000);
    } catch (e) {
      console.error("Error downloading single screenshot:", e);
      utils.showStatus(`Error downloading ${fileName}`, true);
    }
  },

  /** Optimizes image size and format for PDF inclusion */
  optimizeImageForPDF(dataURL) {
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const dims = this.getValidImageDimensions(img); // Use helper
            if (!dims || dims.width <= 0 || dims.height <= 0) {
              console.warn("Opt PDF: Invalid dims");
              resolve(dataURL);
              return;
            }
            let targetWidth = dims.width,
              targetHeight = dims.height;
            const MAX_DIMENSION = 1800; // Max dimension constraint for PDF quality/size balance
            if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION) {
              // Resize logic maintains aspect ratio
              if (targetWidth > targetHeight) {
                const ratio = targetHeight / targetWidth;
                targetWidth = MAX_DIMENSION;
                targetHeight = Math.round(MAX_DIMENSION * ratio);
              } else {
                const ratio = targetWidth / targetHeight;
                targetHeight = MAX_DIMENSION;
                targetWidth = Math.round(MAX_DIMENSION * ratio);
              }
            }
            targetWidth = Math.max(1, Math.round(targetWidth));
            targetHeight = Math.max(1, Math.round(targetHeight));
            const canvas = document.createElement("canvas");
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, targetWidth, targetHeight); // Ensure white background
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
            let optimizedData;
            const quality = targetWidth > 1000 ? 0.85 : 0.92; // JPEG quality
            // Use PNG for smaller images (unless original was JPEG) for better quality, JPEG for larger
            if (
              targetWidth * targetHeight < 300000 &&
              !dataURL.startsWith("data:image/jpeg")
            ) {
              optimizedData = canvas.toDataURL("image/png");
            } else {
              optimizedData = canvas.toDataURL("image/jpeg", quality);
            }
            canvas.width = 1;
            canvas.height = 1; // Clean up canvas memory
            resolve(optimizedData);
          } catch (err) {
            console.warn("Error during image optimization canvas step:", err);
            resolve(dataURL);
          }
        }; // Return original on error
        img.onerror = () => {
          console.warn("Failed to load image for optimization");
          resolve(dataURL);
        }; // Return original on error
        img.src = dataURL; // Start loading image
      } catch (err) {
        console.warn("Exception starting optimization:", err);
        resolve(dataURL);
      }
    }); // Return original on error
  },

  /** Gets valid, positive integer dimensions from an image element */
  getValidImageDimensions(img) {
    let width = img.width || img.naturalWidth || 0;
    let height = img.height || img.naturalHeight || 0;
    // Ensure dimensions are positive numbers, default to 100x100 if invalid
    if (
      !width ||
      !height ||
      isNaN(width) ||
      isNaN(height) ||
      width <= 0 ||
      height <= 0
    ) {
      console.warn(
        `Invalid image dimensions detected (${width}x${height}), using defaults (100x100).`
      );
      width = 100;
      height = 100;
    }
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
  },

  /** Generates a PDF for a single category */
  generatePDF(categoryContainer) {
    const categoryTitleElement = categoryContainer.querySelector(
      ".category-header h4"
    );
    const categoryTitle = categoryTitleElement
      ? categoryTitleElement.textContent
      : "Screenshots";
    const validThumbnails = Array.from(
      categoryContainer.querySelectorAll(
        ".category-content .thumbnail-container"
      )
    ).filter(
      (c) => !c.classList.contains("error-thumbnail") && c.dataset.screenshot
    );
    if (validThumbnails.length === 0) {
      utils.showStatus("No valid screenshots in category", true);
      return;
    }
    utils.showStatus(`Generating PDF for ${categoryTitle}...`, false, 0); // Persistent message
    const pdf = new jspdf.jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
      compress: true,
      precision: 4,
      putOnlyUsedFonts: true,
    });
    // Add header
    pdf.setFontSize(18);
    pdf.text(categoryTitle, 20, 20);
    pdf.setFontSize(10);
    pdf.text(`Generated on ${new Date().toLocaleString()}`, 20, 28);
    pdf.setLineWidth(0.2);
    pdf.line(20, 32, pdf.internal.pageSize.width - 20, 32);
    // Define page layout constants
    const leftMargin = 15,
      rightMargin = 15,
      topMargin = 40,
      bottomMargin = 20;
    const pageWidth = pdf.internal.pageSize.width - leftMargin - rightMargin;
    const pageHeight = pdf.internal.pageSize.height - topMargin - bottomMargin;
    let currentIndex = 0,
      pageCount = 1;
    const self = this; // Store 'this' context for async callbacks

    // Process screenshots sequentially to manage memory
    function processNextScreenshot() {
      if (currentIndex >= validThumbnails.length) {
        // Base case: All done
        try {
          const sanitizedTitle = categoryTitle.replace(/[^a-zA-Z0-9]/g, "_");
          pdf.save(
            `${sanitizedTitle}_${new Date().toISOString().slice(0, 10)}.pdf`
          );
          utils.showStatus(
            `PDF for ${categoryTitle} generated (${pageCount} pages)`,
            false,
            5000
          );
        } catch (e) {
          console.error("Error saving PDF:", e);
          utils.showStatus("Error saving PDF", true);
        } finally {
          utils.showStatus("", false, 1);
        } // Clear "Generating..." message
        return;
      }
      // Get data for current screenshot
      const container = validThumbnails[currentIndex];
      const screenshotData = container.dataset.screenshot;
      const filename = container.dataset.filename || `Page ${currentIndex + 1}`;
      if (!screenshotData) {
        currentIndex++;
        processNextScreenshot();
        return;
      } // Skip if data missing

      // Add new page if not the first image
      if (currentIndex > 0) {
        pdf.addPage();
        pageCount++;
      }

      // Optimize image, then add to PDF
      self
        .optimizeImageForPDF(screenshotData)
        .then((optimizedData) => {
          const img = new Image();
          img.onload = () => {
            try {
              const imgDimensions = self.getValidImageDimensions(img);
              // Calculate image size on page maintaining aspect ratio
              let imgWidthOnPage, imgHeightOnPage;
              const imgRatio = imgDimensions.width / imgDimensions.height;
              const pageRatio = pageWidth / pageHeight;
              if (imgRatio > pageRatio) {
                imgWidthOnPage = pageWidth;
                imgHeightOnPage = pageWidth / imgRatio;
              } else {
                imgHeightOnPage = pageHeight;
                imgWidthOnPage = pageHeight * imgRatio;
              }
              imgWidthOnPage = Math.max(1, Math.round(imgWidthOnPage));
              imgHeightOnPage = Math.max(1, Math.round(imgHeightOnPage));
              // Basic validation for calculated dimensions
              if (
                isNaN(imgWidthOnPage) ||
                isNaN(imgHeightOnPage) ||
                imgWidthOnPage <= 0 ||
                imgHeightOnPage <= 0
              ) {
                throw new Error("Invalid calculated PDF image dimensions");
              }
              const xPos = leftMargin;
              const yPos = topMargin; // Position image
              // Add image using appropriate format
              pdf.addImage(
                optimizedData,
                optimizedData.includes("data:image/png") ? "PNG" : "JPEG",
                xPos,
                yPos,
                imgWidthOnPage,
                imgHeightOnPage,
                null,
                "FAST"
              );
              // Add filename caption below image
              pdf.setFontSize(8);
              const captionY = yPos + imgHeightOnPage + 5;
              const truncatedFilename =
                filename.length > 120
                  ? filename.substring(0, 117) + "..."
                  : filename;
              // Check if caption fits before drawing
              if (captionY < pdf.internal.pageSize.height - bottomMargin + 2) {
                pdf.text(truncatedFilename, leftMargin, captionY, {
                  maxWidth: pageWidth,
                });
              } else {
                console.warn(
                  `Caption skipped for ${filename} due to page height limits.`
                );
              }
              // Move to next screenshot
              currentIndex++;
              setTimeout(processNextScreenshot, 10); // Small delay for UI responsiveness
            } catch (error) {
              console.error(`Error adding image ${filename} to PDF:`, error);
              currentIndex++;
              processNextScreenshot();
            }
          }; // Continue on error
          img.onerror = () => {
            console.error(
              `Failed to load optimized image for PDF: ${filename}`
            );
            currentIndex++;
            processNextScreenshot();
          }; // Continue on error
          img.src = optimizedData; // Load the optimized image data
        })
        .catch((error) => {
          console.error(`Error optimizing image ${filename}:`, error);
          currentIndex++;
          processNextScreenshot();
        }); // Continue on error
    }
    processNextScreenshot(); // Start the sequential processing
  },

  /** Generates a single PDF containing screenshots from ALL categories */
  generateAllCategoriesPDF(categoryContainers) {
    utils.showStatus("Generating comprehensive PDF...", false, 0); // Persistent message
    try {
      if (typeof jspdf === "undefined" || typeof jspdf.jsPDF === "undefined") {
        throw new Error("jsPDF library not found.");
      }
      const pdf = new jspdf.jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        compress: true,
        precision: 4,
        putOnlyUsedFonts: true,
      });
      // --- PDF Header ---
      const projectUrl =
        urlFetcher.baseClientUrl || "Project URL not available";
      const generatedDateString = `Generated on ${new Date().toLocaleString()}`;
      const leftMargin = 15,
        rightMargin = 15;
      const pageContentWidth =
        pdf.internal.pageSize.width - leftMargin - rightMargin;
      let currentY = 15;
      pdf.setFontSize(12);
      pdf.text("Ignition Perspective Screenshot Capture", leftMargin, currentY);
      currentY += 5;
      pdf.setFontSize(8);
      pdf.setTextColor(100);
      pdf.text(`Project URL: ${projectUrl}`, leftMargin, currentY);
      pdf.setFontSize(7);
      pdf.setTextColor(150);
      const generatedWidth = pdf.getTextWidth(generatedDateString);
      const generatedX =
        pdf.internal.pageSize.width - rightMargin - generatedWidth;
      pdf.text(generatedDateString, generatedX, currentY);
      pdf.setTextColor(0);
      currentY += 6;
      pdf.setLineWidth(0.2);
      pdf.line(
        leftMargin,
        currentY,
        pdf.internal.pageSize.width - rightMargin,
        currentY
      );
      currentY += 5;
      // --- Page Layout ---
      const topMargin = currentY;
      const bottomMargin = 20;
      const pageWidth = pageContentWidth;
      const pageHeight =
        pdf.internal.pageSize.height - topMargin - bottomMargin;
      // --- Processing Variables ---
      let pageCount = 1,
        totalScreenshotsProcessed = 0;
      let hasAnyScreenshots = false;
      const self = this;

      // --- Async function to process one category at a time ---
      const processCategory = async (categoryIndex) => {
        if (categoryIndex >= categoryContainers.length) {
          // Base case: All categories processed
          if (hasAnyScreenshots) {
            finalizeAndSaveAll();
          } else {
            utils.showStatus(
              "No valid screenshots found to generate PDF.",
              true
            );
            utils.showStatus("", false, 1);
          }
          return;
        }
        const categoryContainer = categoryContainers[categoryIndex];
        const categoryTitleElement = categoryContainer.querySelector(
          ".category-header h4"
        );
        const categoryTitle = categoryTitleElement
          ? categoryTitleElement.textContent
          : `Category ${categoryIndex + 1}`;
        const validThumbnails = Array.from(
          categoryContainer.querySelectorAll(
            ".category-content .thumbnail-container"
          )
        ).filter(
          (c) =>
            !c.classList.contains("error-thumbnail") && c.dataset.screenshot
        );

        if (validThumbnails.length === 0) {
          await processCategory(categoryIndex + 1);
          return;
        } // Skip empty categories

        // Process screenshots within this category
        for (let i = 0; i < validThumbnails.length; i++) {
          const container = validThumbnails[i];
          const screenshotData = container.dataset.screenshot;
          const filename = container.dataset.filename || `Page ${i + 1}`;
          if (!screenshotData) continue;

          // Add new page if needed
          if (totalScreenshotsProcessed > 0) {
            pdf.addPage();
            pageCount++;
          }
          hasAnyScreenshots = true; // Mark that we've added content

          // Add Category Title on page (optional) - Commented out
          // pdf.setFontSize(10); pdf.setTextColor(120);
          // pdf.text(categoryTitle, leftMargin, topMargin - 4);
          // pdf.setTextColor(0);

          try {
            // Optimize and add image
            const optimizedData = await self.optimizeImageForPDF(
              screenshotData
            );
            const img = await new Promise((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve(image);
              image.onerror = (err) =>
                reject(new Error("Image loading failed"));
              image.src = optimizedData;
            });
            const imgDimensions = self.getValidImageDimensions(img);
            let imgWidthOnPage, imgHeightOnPage;
            const imgRatio = imgDimensions.width / imgDimensions.height;
            const pageRatio = pageWidth / pageHeight;
            if (imgRatio > pageRatio) {
              imgWidthOnPage = pageWidth;
              imgHeightOnPage = pageWidth / imgRatio;
            } else {
              imgHeightOnPage = pageHeight;
              imgWidthOnPage = pageHeight * imgRatio;
            }
            imgWidthOnPage = Math.max(1, Math.round(imgWidthOnPage));
            imgHeightOnPage = Math.max(1, Math.round(imgHeightOnPage));
            if (
              isNaN(imgWidthOnPage) ||
              isNaN(imgHeightOnPage) ||
              imgWidthOnPage <= 0 ||
              imgHeightOnPage <= 0
            ) {
              console.error(
                "Invalid calc dims for PDF:",
                imgWidthOnPage,
                imgHeightOnPage
              );
              continue;
            }
            const xPos = leftMargin;
            const yPos = topMargin;
            pdf.addImage(
              optimizedData,
              optimizedData.includes("data:image/png") ? "PNG" : "JPEG",
              xPos,
              yPos,
              imgWidthOnPage,
              imgHeightOnPage,
              null,
              "FAST"
            );
            // Add filename caption
            pdf.setFontSize(7);
            const captionY = yPos + imgHeightOnPage + 4;
            const truncatedFilename =
              filename.length > 120
                ? filename.substring(0, 117) + "..."
                : filename;
            if (captionY < pdf.internal.pageSize.height - bottomMargin + 2) {
              pdf.text(truncatedFilename, leftMargin, captionY, {
                maxWidth: pageWidth,
              });
            } else {
              console.warn(`Caption skipped for ${filename}.`);
            }
            totalScreenshotsProcessed++;
            utils.showStatus(
              `Generating PDF: Processed ${totalScreenshotsProcessed} screenshots...`,
              false,
              0
            ); // Update progress
          } catch (error) {
            // Handle errors for individual images
            console.error(`Error processing screenshot ${filename}:`, error);
            pdf.setFontSize(8);
            pdf.setTextColor(255, 0, 0);
            pdf.text(
              `Error loading image: ${filename}`,
              leftMargin,
              topMargin + 5
            );
            pdf.setTextColor(0);
          }
          await new Promise((res) => setTimeout(res, 5)); // Brief delay for UI
        } // End screenshot loop for category

        // Process next category recursively
        await processCategory(categoryIndex + 1);
      }; // End processCategory function definition

      // --- Function to Save PDF ---
      const finalizeAndSaveAll = () => {
        try {
          pdf.save(
            `All_Screenshots_${new Date().toISOString().slice(0, 10)}.pdf`
          );
          utils.showStatus(
            `Combined PDF generated with ${pageCount} pages`,
            false,
            5000
          );
        } catch (e) {
          console.error("Error saving combined PDF:", e);
          utils.showStatus("Error saving combined PDF", true);
        } finally {
          utils.showStatus("", false, 1);
        } // Clear "Generating..."
      };

      // --- Start Processing ---
      processCategory(0);
    } catch (error) {
      // Catch errors during PDF setup
      console.error("Error generating comprehensive PDF:", error);
      utils.showStatus(
        "Error generating comprehensive PDF: " + error.message,
        true
      );
    }
  }, // End generateAllCategoriesPDF function
};

export default thumbnails;
