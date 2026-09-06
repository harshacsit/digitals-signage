/**
 * r2upload.js — Cloudflare R2 Upload Helper
 *
 * Uploads a File object to the Cloudflare Worker endpoint configured in
 * window.AppConfig.r2WorkerUrl.  The Worker forwards the bytes to R2 and
 * returns the permanent public URL.
 *
 * Usage:
 *   const { url } = await window.R2Upload.upload(file, (pct) => { ... });
 *
 * onProgress(pct) is called with 0-100 while uploading via XHR.
 * Throws an Error with a human-readable message on failure.
 */
(function () {
  /**
   * Sanitise a filename so it is safe for R2 object keys:
   *  - lowercase
   *  - spaces → underscores
   *  - strip characters that are not alphanumeric, dot, dash or underscore
   *  - prepend a short timestamp to avoid key collisions
   */
  function sanitiseName(originalName) {
    const ext   = originalName.includes(".") ? "." + originalName.split(".").pop().toLowerCase() : "";
    const base  = originalName.replace(/\.[^.]+$/, "")           // strip extension
                              .toLowerCase()
                              .replace(/\s+/g, "_")               // spaces → _
                              .replace(/[^a-z0-9._-]/g, "")       // remove weird chars
                              .slice(0, 80);                       // max 80 chars for base
    const ts    = Date.now();
    return `${ts}_${base}${ext}`;                                 // e.g. 1725521066_ad_clip.mp4
  }

  /**
   * Upload a File to R2 via the Worker.
   *
   * @param {File}     file        – The File object from <input type="file">
   * @param {Function} onProgress  – Called with a number 0-100 during upload
   * @returns {Promise<{url: string}>}
   */
  function upload(file, onProgress) {
    return new Promise(function (resolve, reject) {
      const workerUrl = (window.AppConfig && window.AppConfig.r2WorkerUrl) || "";

      if (!workerUrl || workerUrl.includes("YOUR-SUBDOMAIN")) {
        reject(new Error(
          "R2 Worker URL is not configured yet.\n\n" +
          "Open dashboard/config.js and set window.AppConfig.r2WorkerUrl\n" +
          "to the URL your friend gives you after deploying the Worker."
        ));
        return;
      }

      const objectKey = sanitiseName(file.name);
      const endpoint  = workerUrl.replace(/\/$/, "") + "?name=" + encodeURIComponent(objectKey);

      const xhr = new XMLHttpRequest();
      xhr.open("PUT", endpoint, true);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

      // Progress reporting
      if (xhr.upload && typeof onProgress === "function") {
        xhr.upload.addEventListener("progress", function (e) {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
      }

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data && data.url) {
              resolve({ url: data.url });
            } else {
              reject(new Error("Worker returned unexpected response: " + xhr.responseText));
            }
          } catch (e) {
            reject(new Error("Could not parse Worker response: " + xhr.responseText));
          }
        } else {
          reject(new Error(
            "Upload failed — Worker returned HTTP " + xhr.status + ". " +
            (xhr.responseText ? xhr.responseText.slice(0, 200) : "")
          ));
        }
      };

      xhr.onerror = function () {
        reject(new Error(
          "Network error while uploading. Check that the Worker URL is correct " +
          "and that CORS is enabled on the Worker (Access-Control-Allow-Origin: *)."
        ));
      };

      xhr.ontimeout = function () {
        reject(new Error("Upload timed out. Try a smaller file or check your internet connection."));
      };

      xhr.timeout = 300000; // 5-minute timeout for large video files
      xhr.send(file);
    });
  }

  // Expose globally
  window.R2Upload = { upload: upload };
})();
