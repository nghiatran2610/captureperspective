// js/url-fetcher.js
import config from './config.js';
import { URLProcessingError } from './errors.js';
import * as events from './events.js';

/**
 * A utility class to fetch URLs from an endpoint or use provided data
 */
class URLFetcher {
  constructor() {
    this.urlsData = null;
    this.urlsList = [];
    this.categorizedUrls = {};
    this.isLoading = false;
    this.error = null;
    this.baseClientUrl = '';
    this.projectName = '';
    this.webdevFolder = 'RF_Main_STG'; // <-- fixed WebDev resource name
    this.urlEndpoint = ''; // Will be constructed when baseClientUrl is set
    this.dataLoadedDirectly = false; // New flag
  }

  /**
   * Set the base client URL and build the endpoint
   * @param {string} url - e.g. http://localhost:8088/data/perspective/client/RF_Main
   * @returns {boolean}
   */
  setBaseClientUrl(url) {
    if (!url || typeof url !== 'string') {
      console.error('Invalid base client URL');
      return false;
    }

    try {
      // Remove trailing slash if present
      this.baseClientUrl = url.endsWith('/') ? url.slice(0, -1) : url;
      console.log(`Base client URL set to: ${this.baseClientUrl}`);

      // Extract project name from /client/ segment
      const match = this.baseClientUrl.match(/\/client\/([^\/]+)/);
      if (match && match[1]) {
        this.projectName = match[1];
        const urlObj = new URL(this.baseClientUrl);
        // Construct the endpoint URL
        this.urlEndpoint = `${urlObj.origin}/system/webdev/${this.webdevFolder}/PerspectiveCapture/getUrls?projectName=${encodeURIComponent(this.projectName)}`;
        console.log(`Project name: ${this.projectName}`);
        console.log(`URL endpoint: ${this.urlEndpoint}`);
        return true;
      } else {
        console.warn('Could not extract project name from base client URL');
        this.projectName = ''; // Clear project name if extraction fails
        this.urlEndpoint = ''; // Clear endpoint
        return false;
      }
    } catch (e) {
      console.error('Error parsing base client URL:', e);
      this.projectName = ''; // Clear project name on error
      this.urlEndpoint = ''; // Clear endpoint
      return false;
    }
  }

  /**
   * Process the raw page data (either fetched or provided directly)
   * @param {Object} data - The raw JSON data object containing a 'pages' property
   * @returns {boolean} - True if processing was successful, false otherwise
   */
  _processData(data) {
    this.urlsData = data;
    // Validate the expected structure
    if (data && data.pages && typeof data.pages === 'object') {
      // Process the pages object into the urlsList array
      this.urlsList = Object.entries(data.pages).map(([path, details]) => ({
        path, // e.g., "/Overview" or "Section/Page"
        title: details.title || path, // Use title if available, otherwise path
        viewPath: details.viewPath // Keep viewPath if needed elsewhere
      }));

      this.categorizeUrls(); // Group URLs by category
      console.log(`Processed ${this.urlsList.length} URLs.`);
      events.emit(events.events.URL_PROCESSING_COMPLETED, {
        message: `Processed ${this.urlsList.length} URLs`,
        urls: this.urlsList
      });
      return true; // Indicate success
    } else {
      // Handle invalid data format
      console.error('Invalid data format received. Expected { "pages": { ... } }:', data);
      this.error = new URLProcessingError('Invalid URL data format', this.dataLoadedDirectly ? 'Direct Data' : this.urlEndpoint);
      events.emit(events.events.CAPTURE_FAILED, {
        url: this.dataLoadedDirectly ? 'Direct Data' : this.urlEndpoint,
        error: this.error
      });
      return false; // Indicate failure
    }
  }

  /**
   * Set URL data directly, bypassing the fetch mechanism.
   * Accepts either a pre-parsed JSON object or a JSON string.
   * @param {Object|string} jsonData - The JSON object or string containing page data (e.g., { pages: { "/path": { title: "Title" } } }).
   * @returns {Promise<Array>} - List of URL objects ({path, title, viewPath}), or empty array on failure.
   */
  async setDataDirectly(jsonData) {
    this.isLoading = true; // Mimic loading state
    this.error = null;
    this.dataLoadedDirectly = false; // Reset flag initially

    // Wrap in promise for consistent async behavior with loadUrls
    return new Promise((resolve, reject) => {
        try {
          let dataObject = jsonData;
          // If input is a string, try to parse it as JSON
          if (typeof jsonData === 'string') {
            try {
              dataObject = JSON.parse(jsonData);
            } catch (parseError) {
              // If parsing fails, throw specific error
              throw new URLProcessingError('Failed to parse provided JSON string', 'Direct Data', parseError);
            }
          }

          // Basic validation of the parsed/provided object
          if (typeof dataObject !== 'object' || dataObject === null) {
              throw new URLProcessingError('Provided data is not a valid object', 'Direct Data');
          }

          console.log('Setting URL data directly:', dataObject);
          events.emit(events.events.URL_PROCESSING_STARTED, { message: 'Processing provided URLs...' });

          // Use the common processing function
          if (this._processData(dataObject)) {
            this.dataLoadedDirectly = true; // Set flag on successful processing
            this.isLoading = false;
            resolve(this.urlsList); // Resolve with the processed list
          } else {
            // _processData handles error reporting via events
            this.isLoading = false;
            // Resolve with empty array to indicate processing failure but keep promise resolved
            resolve([]);
          }

        } catch (error) {
          console.error('Error setting data directly:', error);
          // Ensure the error is an instance of URLProcessingError for consistent handling
          this.error = error instanceof URLProcessingError ? error : new URLProcessingError(error.message, 'Direct Data');
          events.emit(events.events.CAPTURE_FAILED, {
            url: 'Direct Data',
            error: this.error
          });
          this.isLoading = false;
          reject(this.error); // Reject the promise on error
        }
    });
  }


  /**
   * Load URLs from the endpoint or use already set data.
   * @returns {Promise<Array>} List of URL objects ({path, title, viewPath})
   */
  async loadUrls() {
    // --- MODIFICATION: Check if data was loaded directly ---
    // If data was successfully loaded directly earlier, return the existing list
    if (this.dataLoadedDirectly) {
      console.log("Using directly loaded URL data (loadUrls).");
      // Return a resolved promise with the list for consistency
      return Promise.resolve(this.urlsList);
    }
    // --- END MODIFICATION ---

    // Proceed with fetching if data wasn't loaded directly
    this.isLoading = true;
    this.error = null;
    this.dataLoadedDirectly = false; // Ensure flag is false when fetching

    // Wrap fetch logic in a promise
    return new Promise(async (resolve, reject) => {
        try {
          // Validate required conditions for fetching
          if (!this.baseClientUrl || !this.projectName) {
            throw new Error('Base client URL or project name not set for fetching');
          }
          if (!this.urlEndpoint) {
            throw new Error('URL endpoint not constructed');
          }

          events.emit(events.events.URL_PROCESSING_STARTED, { message: 'Fetching available URLs...' });
          console.log(`Workspaceing URLs from endpoint: ${this.urlEndpoint}`);

          // Perform the fetch request
          const response = await fetch(this.urlEndpoint);

          // Check if the response was successful
          if (!response.ok) {
            // Throw an error with status details
            throw new URLProcessingError(`Failed to fetch URLs: ${response.status} ${response.statusText}`, this.urlEndpoint);
          }

          // Parse the JSON response
          const data = await response.json();
          console.log('Received data from fetch:', data);

          // Process the fetched data using the common function
          if (this._processData(data)) {
             this.isLoading = false;
            resolve(this.urlsList); // Resolve with processed list
          } else {
             // _processData handles error reporting via events
             this.isLoading = false;
             // Resolve with empty array on processing failure
             resolve([]);
          }

        } catch (error) {
          // Handle fetch or processing errors
          console.error('Error loading URLs via fetch:', error);
          // Ensure the error is an instance of URLProcessingError
          this.error = error instanceof URLProcessingError ? error : new URLProcessingError(error.message, this.urlEndpoint || 'Fetch Error');
          events.emit(events.events.CAPTURE_FAILED, {
            url: this.urlEndpoint || 'Fetch Error',
            error: this.error
          });
          this.isLoading = false;
          reject(this.error); // Reject the promise on fetch error
        }
    });
  }

  /**
   * Categorize URLs by their section (first path segment)
   */
  categorizeUrls() {
    this.categorizedUrls = {};
    this.urlsList.forEach(urlInfo => {
      // Use the first segment of the path as the category key
      // If path is "/" or empty, use "Home"
      const firstSegment = urlInfo.path.split('/').filter(Boolean)[0] || 'Home';
      if (!this.categorizedUrls[firstSegment]) {
        this.categorizedUrls[firstSegment] = [];
      }
      this.categorizedUrls[firstSegment].push(urlInfo);
    });
    // Optional: Sort categories alphabetically if needed
    // const sortedCategories = {};
    // Object.keys(this.categorizedUrls).sort().forEach(key => {
    //   sortedCategories[key] = this.categorizedUrls[key];
    // });
    // this.categorizedUrls = sortedCategories;
    console.log('URLs categorized:', Object.keys(this.categorizedUrls));
  }

  /**
   * Transform selected URLs into full URLs for the tool
   * @param {Array} selectedPaths - Array of page paths (e.g., ["/Overview", "Section/Page"])
   * @returns {Array<string>} - Array of full URLs
   */
  generateFullUrls(selectedPaths) {
    // Ensure input is valid and baseClientUrl is set
    if (!Array.isArray(selectedPaths) || selectedPaths.length === 0 || !this.baseClientUrl) {
        return [];
    }

    return selectedPaths.map(path => {
      // Handle parameterized paths by replacing segments like /:param with /PARAM
      // This is a simple replacement; adjust the logic or 'PARAM' if needed.
      const processedPath = path.replace(/\/:[^\/]+/g, '/PARAM');

      // Construct the full URL
      // Handle root path ('/' or '') correctly
      if (path === '/' || path === '') {
         return this.baseClientUrl;
      }

      // Ensure there's exactly one slash between base URL and the path segment
      const pathSegment = processedPath.startsWith('/') ? processedPath.substring(1) : processedPath;
      // Prevent double slashes if baseClientUrl already ends with one (though setBaseClientUrl removes it)
      return `${this.baseClientUrl}/${pathSegment}`;
    });
  }


  /**
   * Get the detected project name
   * @returns {string|null}
   */
  extractProjectNameFromBaseUrl() {
    return this.projectName || null;
  }
}

export default new URLFetcher();