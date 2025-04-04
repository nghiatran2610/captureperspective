// url-context-parser.js - Functions for parsing URL context

/**
 * Parse the current URL to determine context
 * Expected URL structure: http://localhost:8088/data/perspective/client/PROJECT/MODULE/PAGE
 * @param {string} url - The current URL
 * @returns {Object} - URL parts including project, module, page
 */
export function parseUrlContext(url) {
    const urlParts = url.split("/");
    const context = {
      isValid: false,
      project: null,
      module: null,
      page: null,
      depth: 0,
      urlParts,
    };
  
    const clientIndex = urlParts.indexOf("client");
    if (clientIndex === -1) return context;
  
    if (urlParts.length > clientIndex + 1) {
      context.project = urlParts[clientIndex + 1];
      context.isValid = true;
      context.depth = 1;
    }
    if (urlParts.length > clientIndex + 2) {
      context.module = urlParts[clientIndex + 2];
      context.depth = 2;
    }
    if (urlParts.length > clientIndex + 3) {
      context.page = urlParts[clientIndex + 3];
      context.depth = 3;
    }
    return context;
  }
  
  /**
   * Helper function to convert display name to URL segment.
   * Handles spaces and special characters.
   * @param {string} displayName - The display name shown in the UI.
   * @returns {string} URL-friendly segment.
   */
  export function convertDisplayNameToUrlSegment(displayName) {
    if (!displayName) return "";
    let urlSegment = displayName.trim();
    urlSegment = urlSegment.replace(/\s+/g, "");
    urlSegment = urlSegment.replace(/[^a-zA-Z0-9_-]/g, "");
    return urlSegment;
  }
  
  /**
   * Construct a page URL based on the project, module and optional page names.
   * @param {string} projectName - The project name.
   * @param {string} moduleName - The module name.
   * @param {string} [pageName=null] - Optional page name.
   * @param {string} [baseUrl=null] - Optional base URL.
   * @returns {string} The constructed URL.
   */
  export function constructPageUrl(projectName, moduleName, pageName = null, baseUrl = null) {
    if (!projectName || !moduleName) {
      console.warn("Cannot construct URL without project and module names");
      return null;
    }
    if (!baseUrl) {
      const currentUrl = window.location.href;
      const clientIndex = currentUrl.indexOf("/client/");
      baseUrl =
        clientIndex !== -1
          ? currentUrl.substring(0, clientIndex)
          : "http://localhost:8088/data/perspective";
    }
    const moduleUrlSegment = convertDisplayNameToUrlSegment(moduleName);
    let url = `${baseUrl}/client/${projectName}/${moduleUrlSegment}`;
    if (pageName) {
      const pageUrlSegment = convertDisplayNameToUrlSegment(pageName);
      url += `/${pageUrlSegment}`;
    }
    console.log(
      `Constructed URL for "${moduleName}"${
        pageName ? ` - "${pageName}"` : ""
      }: ${url}`
    );
    return url;
  }
  
  export default {
    parseUrlContext,
    convertDisplayNameToUrlSegment,
    constructPageUrl
  };