// js/url-fetcher.js
import config from './config.js';
import { URLProcessingError } from './errors.js';
import * as events from './events.js';

/**
 * A utility class to fetch URLs from an endpoint for Simple Mode
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
  }

  /**
   * Load URLs from the endpoint
   * @returns {Promise<Array>} List of URL objects with title and path
   */
  async loadUrls() {
    this.isLoading = true;
    this.error = null;

    try {
      if (!this.baseClientUrl || !this.projectName) {
        throw new Error('Base client URL or project name not set');
      }

      events.emit(events.events.URL_PROCESSING_STARTED, { message: 'Fetching available URLs...' });

      console.log(`Fetching URLs from endpoint: ${this.urlEndpoint}`);
      const response = await fetch(this.urlEndpoint);

      if (!response.ok) {
        throw new URLProcessingError(`Failed to fetch URLs: ${response.status} ${response.statusText}`, this.urlEndpoint);
      }

      const data = await response.json();
      console.log('Received data:', data);
      this.urlsData = data;

      if (data && data.pages) {
        this.urlsList = Object.entries(data.pages).map(([path, details]) => ({
          path,
          title: details.title || path,
          viewPath: details.viewPath
        }));

        this.categorizeUrls();

        events.emit(events.events.URL_PROCESSING_COMPLETED, {
          message: `Loaded ${this.urlsList.length} URLs`,
          urls: this.urlsList
        });

        return this.urlsList;
      } else {
        console.error('Invalid data format received:', data);
        throw new URLProcessingError('Invalid URL data format', this.urlEndpoint);
      }
    } catch (error) {
      console.error('Error loading URLs:', error);
      this.error = error;
      events.emit(events.events.CAPTURE_FAILED, {
        url: this.urlEndpoint,
        error
      });
      throw error;
    } finally {
      this.isLoading = false;
    }
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
      this.baseClientUrl = url.endsWith('/') ? url.slice(0, -1) : url;
      console.log(`Base client URL set to: ${this.baseClientUrl}`);

      // Extract project name from /client/ segment
      const match = this.baseClientUrl.match(/\/client\/([^\/]+)/);
      if (match && match[1]) {
        this.projectName = match[1];
        const urlObj = new URL(this.baseClientUrl);
        this.urlEndpoint = `${urlObj.origin}/system/webdev/${this.webdevFolder}/getUrls?projectName=${encodeURIComponent(this.projectName)}`;
        console.log(`Project name: ${this.projectName}`);
        console.log(`URL endpoint: ${this.urlEndpoint}`);
        return true;
      } else {
        console.warn('Could not extract project name from base client URL');
        return false;
      }
    } catch (e) {
      console.error('Error parsing base client URL:', e);
      return false;
    }
  }

  /**
   * Categorize URLs by their section (first path segment)
   */
  categorizeUrls() {
    this.categorizedUrls = {};
    this.urlsList.forEach(urlInfo => {
      const firstSegment = urlInfo.path.split('/').filter(Boolean)[0] || 'Home';
      if (!this.categorizedUrls[firstSegment]) {
        this.categorizedUrls[firstSegment] = [];
      }
      this.categorizedUrls[firstSegment].push(urlInfo);
    });
    console.log('URLs categorized:', Object.keys(this.categorizedUrls));
  }

  /**
   * Transform selected URLs into full URLs for the tool
   * @param {Array} selectedPaths
   * @returns {Array}
   */
  generateFullUrls(selectedPaths) {
    if (!Array.isArray(selectedPaths) || selectedPaths.length === 0 || !this.baseClientUrl) return [];

    return selectedPaths.map(path => {
      const processedPath = path.replace(/\/:[^\/]+/g, '/PARAM');
      return path === '/'
        ? this.baseClientUrl
        : `${this.baseClientUrl}${processedPath.startsWith('/') ? '' : '/'}${processedPath}`;
    });
  }

  extractProjectNameFromBaseUrl() {
    return this.projectName || null;
  }
}

export default new URLFetcher();
