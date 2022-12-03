export function getEnv(key: string): string | undefined {
  const denoNs = Reflect.get(globalThis, "Deno");
  if (denoNs) {
    return denoNs.env.get(key);
  }
  const np = Reflect.get(globalThis, "process");
  if (np) {
    return np.env[key];
  }
  const storage = Reflect.get(globalThis, "localStorage");
  if (storage) {
    return storage.getItem(key) ?? undefined;
  }
  return void 0;
}

export function toPInt(v: unknown): number | undefined {
  if (typeof v === "string") {
    v = parseFloat(v);
  }
  if (typeof v === "number" && !Number.isNaN(v) && Number.isFinite(v) && v > 0) {
    return Math.ceil(v);
  }
}

export function atobUrl(b64: string) {
  const b = b64.length % 4;
  if (b === 3) {
    b64 += "=";
  } else if (b === 2) {
    b64 += "==";
  } else if (b === 1) {
    throw new TypeError("Illegal base64 Url String");
  }
  b64 = b64.replace(/\-/g, "+").replace(/_/g, "/");
  return atob(b64);
}

export function btoaUrl(s: string) {
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// Origin implement: https://stackoverflow.com/questions/2541481/get-average-color-of-image-via-javascript
export function getAverageRGB(imgEl: HTMLImageElement): { r: number; g: number; b: number } {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext && canvas.getContext("2d");

  if (!context) {
    throw new Error("getAverageRGB: context is null");
  }

  const height = canvas.height = imgEl.naturalHeight || imgEl.offsetHeight || imgEl.height;
  const width = canvas.width = imgEl.naturalWidth || imgEl.offsetWidth || imgEl.width;
  context.drawImage(imgEl, 0, 0);

  let i = -4;
  let n = 0;
  const blockSize = 5; // only visit every 5 pixels
  const rgb = { r: 0, g: 0, b: 0 };
  const data = context.getImageData(0, 0, width, height);
  const length = data.data.length;
  while ((i += blockSize * 4) < length) {
    ++n;
    rgb.r += data.data[i];
    rgb.g += data.data[i + 1];
    rgb.b += data.data[i + 2];
  }

  // `~~` used to floor values
  rgb.r = ~~(rgb.r / n);
  rgb.g = ~~(rgb.g / n);
  rgb.b = ~~(rgb.b / n);

  return rgb;
}

export function getAverageRGBFromBlob(blob: Blob): Promise<{ r: number; g: number; b: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const rgb = getAverageRGB(img);
        resolve(rgb);
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

export function getThumbImage(imgEl: HTMLImageElement, size: number): string {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext && canvas.getContext("2d");

  if (!context) {
    throw new Error("getThumbImage: context is null");
  }

  const height = canvas.height = imgEl.naturalHeight || imgEl.offsetHeight || imgEl.height;
  const width = canvas.width = imgEl.naturalWidth || imgEl.offsetWidth || imgEl.width;
  const ratio = Math.min(size / width, size / height);
  const newWidth = width * ratio;
  const newHeight = height * ratio;
  context.drawImage(imgEl, 0, 0, width, height, 0, 0, newWidth, newHeight);
  return canvas.toDataURL("image/jpeg", 0.6);
}

export function getThumbImageFromBlob(blob: Blob, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const thumb = getThumbImage(img, size);
        resolve(thumb);
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

export function rgbToHex(rgb: { r: number; g: number; b: number }) {
  return ((1 << 24) + (rgb.r << 16) + (rgb.g << 8) + rgb.b).toString(16).slice(1);
}
