const { v2: cloudinary } = require("cloudinary");

let configured = false;

function ensureCloudinaryConfigured() {
  if (configured) return;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  configured = true;
}

function isCloudinaryReady() {
  ensureCloudinaryConfigured();
  return configured;
}

async function uploadBase64Image(dataUrl, options = {}) {
  ensureCloudinaryConfigured();
  if (!configured) {
    throw new Error("Cloudinary is not configured on server");
  }

  const folder = options.folder || process.env.CLOUDINARY_UI_PREVIEW_FOLDER || "test-portal/ui-preview";
  const publicIdPrefix = options.publicIdPrefix || "ui-preview";

  const result = await cloudinary.uploader.upload(dataUrl, {
    folder,
    resource_type: "image",
    public_id: `${publicIdPrefix}-${Date.now()}`,
    overwrite: true,
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
}

async function uploadBase64Pdf(dataUrl, options = {}) {
  ensureCloudinaryConfigured();
  if (!configured) {
    throw new Error("Cloudinary is not configured on server");
  }

  const folder = options.folder || process.env.CLOUDINARY_UI_TASK_PDF_FOLDER || "test-portal/ui-task-pdf";
  const publicIdPrefix = options.publicIdPrefix || "ui-task-pdf";

  const result = await cloudinary.uploader.upload(dataUrl, {
    folder,
    resource_type: "raw",
    public_id: `${publicIdPrefix}-${Date.now()}`,
    overwrite: true,
    format: "pdf",
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
}

module.exports = {
  isCloudinaryReady,
  uploadBase64Image,
  uploadBase64Pdf,
};
