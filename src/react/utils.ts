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

export function getThumbImage(imgEl: HTMLImageElement, size: number): string {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext && canvas.getContext("2d");

  if (!context) {
    throw new Error("getThumbImage: context is null");
  }

  const width = imgEl.naturalWidth || imgEl.offsetWidth || imgEl.width;
  const height = imgEl.naturalHeight || imgEl.offsetHeight || imgEl.height;
  const ratio = width / height;
  const canvasWidth = ratio > 1 ? size : size * ratio;
  const canvasHeight = ratio > 1 ? size / ratio : size;
  console.log(width, height, canvasWidth, canvasHeight);
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  context.drawImage(imgEl, 0, 0, width, height, 0, 0, canvasWidth, canvasHeight);
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
