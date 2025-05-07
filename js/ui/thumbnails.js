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
      liveThumbnailsContainer.style.display = "flex";
    }

    const identifierForCategory = sequenceName || fileName;
    const { parentCategory, category: subCategoryName } =
      this.parseCategoryFromFileName(identifierForCategory);

    const categoryContainer = this.getCategoryContainer(null, parentCategory);
    if (!categoryContainer) return null;
    const categoryContent =
      categoryContainer.querySelector(".category-content");

    const thumbnailContainer = document.createElement("div");
    thumbnailContainer.className = "thumbnail-container";
    if (isToolbarAction) thumbnailContainer.classList.add("toolbar-action");

    if (result.error) {
      thumbnailContainer.classList.add("error-thumbnail");
      const errorBadge = document.createElement("div");
      errorBadge.textContent = "Error";
      errorBadge.className = "error-badge";
      thumbnailContainer.appendChild(errorBadge);
    } else if (result.detectedMountIssue) {
      // MODIFIED: Add a specific class for detected mount issues
      thumbnailContainer.classList.add("mount-issue-detected");
      // Add a title attribute to the container for more details on hover
      thumbnailContainer.title = `Page reported: ${
        result.mountIssueMessage || "Mount issue"
      }`;
    }

    if (isRetry) {
      const retryBadge = document.createElement("div");
      retryBadge.textContent = "Retry";
      retryBadge.className = "retry-badge";
      thumbnailContainer.appendChild(retryBadge);
    }
    // Note: The general error badge logic is above. If you want a specific icon for mount-issue-detected,
    // it would be added here or via CSS pseudo-elements.

    const thumbImg = document.createElement("img");
    if (result.error || !result.thumbnail) {
      thumbImg.src =
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90"><rect width="120" height="90" fill="%23f8d7da"/><text x="60" y="45" font-family="Arial" font-size="12" fill="%23721c24" text-anchor="middle" dy=".3em">' +
        (result.detectedMountIssue &&
        result.mountIssueMessage &&
        !result.screenshot
          ? "Mount Error (No Image)"
          : "Capture Error") +
        "</text></svg>";
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
    thumbnailContainer.appendChild(thumbImg);

    if (subCategoryName) {
      const subCatLabel = document.createElement("div");
      subCatLabel.textContent = utils.truncateText(subCategoryName, 25);
      subCatLabel.title = subCategoryName;
      subCatLabel.className = "thumbnail-subcategory-name";
      thumbnailContainer.appendChild(subCatLabel);
    }

    const nameLabel = document.createElement("div");
    nameLabel.textContent = utils.truncateText(fileName, 25);
    nameLabel.title = fileName; // Original filename for full hover
    thumbnailContainer.appendChild(nameLabel);
    nameLabel.className = "thumbnail-filename";

    if (result.error && result.errorMessage) {
      const errorMsgDiv = document.createElement("div");
      errorMsgDiv.textContent = "Capture Failed";
      errorMsgDiv.className = "thumbnail-error-message";
      errorMsgDiv.title = result.errorMessage;
      thumbnailContainer.appendChild(errorMsgDiv);
    } else if (
      result.detectedMountIssue &&
      result.mountIssueMessage &&
      !result.error
    ) {
      // The main indication will be the CSS class and optional warning icon.
      // The full message is on the container's title.
      // We could add a small text note if desired, but the icon might be cleaner.
      // Example:
      // const mountNoteDiv = document.createElement("div");
      // mountNoteDiv.textContent = "View Issue";
      // mountNoteDiv.className = "thumbnail-mount-issue-note";
      // thumbnailContainer.appendChild(mountNoteDiv);
    }

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

    categoryContent.appendChild(thumbnailContainer);

    const countElement = categoryContainer.querySelector(".thumbnail-count");
    if (countElement) {
      const newCount = categoryContent.querySelectorAll(
        ".thumbnail-container"
      ).length;
      countElement.textContent = `(${newCount})`;
    }

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

  getCategoryContainer(_subCategoryName, parentCategoryName) {
    let liveThumbnailsContainer =
      elements.liveThumbnails || document.getElementById("liveThumbnails");
    if (!liveThumbnailsContainer) {
      liveThumbnailsContainer = this.createLiveThumbnailsContainer();
      if (!liveThumbnailsContainer) return null;
    }

    const contentSection = document.getElementById("thumbnailsContent");
    if (!contentSection) {
      console.error("Cannot find thumbnailsContent section");
      return null;
    }

    const parentClean = (parentCategoryName || "unknown")
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .toLowerCase();
    const categoryId = `category-${parentClean}`;

    let categoryContainer = document.getElementById(categoryId);

    if (!categoryContainer) {
      categoryContainer = document.createElement("div");
      categoryContainer.id = categoryId;
      categoryContainer.className = "thumbnail-category";

      const categoryHeader = document.createElement("div");
      categoryHeader.className = "category-header";
      categoryHeader.addEventListener("click", (e) => {
        if (e.target.closest(".combine-pdf-btn")) return;
        const content = categoryContainer.querySelector(".category-content");
        if (!content) return;
        const isCollapsed = content.style.display === "none";
        content.style.display = isCollapsed ? "flex" : "none";
        categoryHeader.classList.toggle("collapsed", !isCollapsed);
        const toggleIcon = categoryHeader.querySelector(".toggle-icon");
        if (toggleIcon) toggleIcon.innerHTML = isCollapsed ? "▼" : "►";
      });

      const toggleIcon = document.createElement("span");
      toggleIcon.className = "toggle-icon";
      toggleIcon.innerHTML = "▼";
      categoryHeader.appendChild(toggleIcon);

      const categoryTitle = document.createElement("h4");
      categoryTitle.textContent = parentCategoryName;
      categoryHeader.appendChild(categoryTitle);

      const thumbnailCount = document.createElement("span");
      thumbnailCount.className = "thumbnail-count";
      thumbnailCount.textContent = "(0)";
      categoryHeader.appendChild(thumbnailCount);

      const categoryContent = document.createElement("div");
      categoryContent.className = "category-content";

      const combinePdfBtn = document.createElement("button");
      combinePdfBtn.className = "btn btn-small combine-pdf-btn";
      combinePdfBtn.textContent = "Combine to PDF";
      combinePdfBtn.title = `Combine screenshots from ${parentCategoryName} into a PDF`;
      combinePdfBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.generatePDF(categoryContainer);
      });
      categoryHeader.appendChild(combinePdfBtn);

      categoryContainer.appendChild(categoryHeader);
      categoryContainer.appendChild(categoryContent);
      contentSection.appendChild(categoryContainer);
    }
    return categoryContainer;
  },

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

  optimizeImageForPDF(dataURL) {
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const dims = this.getValidImageDimensions(img);
            if (!dims || dims.width <= 0 || dims.height <= 0) {
              resolve(dataURL);
              return;
            }
            let targetWidth = dims.width,
              targetHeight = dims.height;
            const MAX_DIMENSION = 1800;
            if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION) {
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
            ctx.fillRect(0, 0, targetWidth, targetHeight);
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
            let optimizedData;
            const quality = targetWidth > 1000 ? 0.85 : 0.92;
            if (
              targetWidth * targetHeight < 300000 &&
              !dataURL.startsWith("data:image/jpeg")
            ) {
              optimizedData = canvas.toDataURL("image/png");
            } else {
              optimizedData = canvas.toDataURL("image/jpeg", quality);
            }
            canvas.width = 1;
            canvas.height = 1;
            resolve(optimizedData);
          } catch (err) {
            resolve(dataURL);
          }
        };
        img.onerror = () => {
          resolve(dataURL);
        };
        img.src = dataURL;
      } catch (err) {
        resolve(dataURL);
      }
    });
  },

  getValidImageDimensions(img) {
    let width = img.width || img.naturalWidth || 0;
    let height = img.height || img.naturalHeight || 0;
    if (
      !width ||
      !height ||
      isNaN(width) ||
      isNaN(height) ||
      width <= 0 ||
      height <= 0
    ) {
      width = 100;
      height = 100;
    }
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
  },

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
    utils.showStatus(`Generating PDF for ${categoryTitle}...`, false, 0);
    const pdf = new jspdf.jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
      compress: true,
      precision: 4,
      putOnlyUsedFonts: true,
    });
    pdf.setFontSize(18);
    pdf.text(categoryTitle, 20, 20);
    pdf.setFontSize(10);
    pdf.text(`Generated on ${new Date().toLocaleString()}`, 20, 28);
    pdf.setLineWidth(0.2);
    pdf.line(20, 32, pdf.internal.pageSize.width - 20, 32);
    const leftMargin = 15,
      rightMargin = 15,
      topMargin = 40,
      bottomMargin = 20;
    const pageWidth = pdf.internal.pageSize.width - leftMargin - rightMargin;
    const pageHeight = pdf.internal.pageSize.height - topMargin - bottomMargin;
    let currentIndex = 0,
      pageCount = 1;
    const self = this;
    function processNextScreenshot() {
      if (currentIndex >= validThumbnails.length) {
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
          utils.showStatus("Error saving PDF", true);
        } finally {
          utils.showStatus("", false, 1);
        }
        return;
      }
      const container = validThumbnails[currentIndex];
      const screenshotData = container.dataset.screenshot;
      const filename = container.dataset.filename || `Page ${currentIndex + 1}`;
      if (!screenshotData) {
        currentIndex++;
        processNextScreenshot();
        return;
      }
      if (currentIndex > 0) {
        pdf.addPage();
        pageCount++;
      }
      self
        .optimizeImageForPDF(screenshotData)
        .then((optimizedData) => {
          const img = new Image();
          img.onload = () => {
            try {
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
              )
                throw new Error("Invalid PDF image dims");
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
              pdf.setFontSize(8);
              const captionY = yPos + imgHeightOnPage + 5;
              const truncatedFilename =
                filename.length > 120
                  ? filename.substring(0, 117) + "..."
                  : filename;
              if (captionY < pdf.internal.pageSize.height - bottomMargin + 2)
                pdf.text(truncatedFilename, leftMargin, captionY, {
                  maxWidth: pageWidth,
                });
              currentIndex++;
              setTimeout(processNextScreenshot, 10);
            } catch (error) {
              currentIndex++;
              processNextScreenshot();
            }
          };
          img.onerror = () => {
            currentIndex++;
            processNextScreenshot();
          };
          img.src = optimizedData;
        })
        .catch((error) => {
          currentIndex++;
          processNextScreenshot();
        });
    }
    processNextScreenshot();
  },

  generateAllCategoriesPDF(categoryContainers) {
    utils.showStatus("Generating comprehensive PDF...", false, 0);
    try {
      if (typeof jspdf === "undefined" || typeof jspdf.jsPDF === "undefined")
        throw new Error("jsPDF library not found.");
      const pdf = new jspdf.jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        compress: true,
        precision: 4,
        putOnlyUsedFonts: true,
      });
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
      const topMargin = currentY;
      const bottomMargin = 20;
      const pageWidth = pageContentWidth;
      const pageHeight =
        pdf.internal.pageSize.height - topMargin - bottomMargin;
      let pageCount = 1,
        totalScreenshotsProcessed = 0;
      let hasAnyScreenshots = false;
      const self = this;
      const processCategory = async (categoryIndex) => {
        if (categoryIndex >= categoryContainers.length) {
          if (hasAnyScreenshots) finalizeAndSaveAll();
          else {
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
        }
        for (let i = 0; i < validThumbnails.length; i++) {
          const container = validThumbnails[i];
          const screenshotData = container.dataset.screenshot;
          const filename = container.dataset.filename || `Page ${i + 1}`;
          if (!screenshotData) continue;
          if (totalScreenshotsProcessed > 0) {
            pdf.addPage();
            pageCount++;
          }
          hasAnyScreenshots = true;

          try {
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
            )
              continue;
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
            pdf.setFontSize(7);
            const captionY = yPos + imgHeightOnPage + 4;
            const truncatedFilename =
              filename.length > 120
                ? filename.substring(0, 117) + "..."
                : filename;
            if (captionY < pdf.internal.pageSize.height - bottomMargin + 2)
              pdf.text(truncatedFilename, leftMargin, captionY, {
                maxWidth: pageWidth,
              });
            totalScreenshotsProcessed++;
            utils.showStatus(
              `Generating PDF: Processed ${totalScreenshotsProcessed} screenshots...`,
              false,
              0
            );
          } catch (error) {
            pdf.setFontSize(8);
            pdf.setTextColor(255, 0, 0);
            pdf.text(
              `Error loading image: ${filename}`,
              leftMargin,
              topMargin + 5
            );
            pdf.setTextColor(0);
          }
          await new Promise((res) => setTimeout(res, 5));
        }
        await processCategory(categoryIndex + 1);
      };
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
          utils.showStatus("Error saving combined PDF", true);
        } finally {
          utils.showStatus("", false, 1);
        }
      };
      processCategory(0);
    } catch (error) {
      utils.showStatus(
        "Error generating comprehensive PDF: " + error.message,
        true
      );
    }
  },
};

export default thumbnails;
