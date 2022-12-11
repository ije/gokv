/** @jsx createElement */
import { createElement, CSSProperties, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { ImageProps } from "../../types/react.d.ts";
import { FileStorage } from "../../mod.ts";
import { Context } from "./Context.ts";
import { atobUrl, btoaUrl, getImageThumbFromBlob, toPInt } from "./utils.ts";

const iconImageAdd = (
  <svg
    width="32"
    height="24"
    viewBox="0 0 32 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M26 20.6563L22 14L17.4688 17.7813L14 12L2 22V6H20V4H0V24H28V12H26V20.6563ZM28 4V0H26V4H22V6H26V10H28V6H32V4H28Z"
      fill="currentColor"
    />
    <circle cx="7" cy="10" r="3" fill="currentColor" />
  </svg>
);

// The blur effect is copied from next.js/image
const blurSvg = (previewUrl: string, w: number, h: number): string => {
  return encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'><filter id='b' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='1'/><feComponentTransfer><feFuncA type='discrete' tableValues='1 1'/></feComponentTransfer></filter><image preserveAspectRatio='none' filter='url(#b)' x='0' y='0' height='100%' width='100%' href='${previewUrl}'/></svg>`,
  );
};

export const useImageSrc = (props: Pick<ImageProps, "src" | "width" | "height" | "quality" | "fit">): {
  src?: string;
  srcSet?: string;
  aspectRatio?: number;
  blurPreview?: string;
  blurPreviewSize?: number;
  fit?: "contain" | "cover";
} => {
  const { src, width, height, quality, fit } = props;
  return useMemo(() => {
    const { imagesHost } = useContext(Context);
    if (!src?.startsWith(`https://${imagesHost}/`)) {
      return { src };
    }
    const ret: ReturnType<typeof useImageSrc> = { src };
    const url = new URL(src);
    const parts = url.pathname.split("/");
    const imageId = parts[1];
    if (imageId.length >= 40) {
      const resizing: string[] = [];
      const w = toPInt(width);
      const h = toPInt(height);
      const q = toPInt(quality);
      if (w) resizing.push(`w=${w}`);
      if (h) resizing.push(`h=${h}`);
      if (q) resizing.push(`q=${q}`);
      if (w && h) {
        ret.fit = fit ?? "cover";
        resizing.push(`fit=${ret.fit}`);
      }
      if (w || h) {
        const pathname = "/" + imageId.slice(0, 40);
        ret.srcSet = [1, 2, 3]
          .map((r) => `https://${imagesHost}${pathname}/${resizing.join(",")},dpr=${r} ${r}x`)
          .join(", ");
      }
      if (imageId.length > 40) {
        const [w, h, ...rest] = imageId.slice(40).split("x");
        if (w && h) {
          ret.aspectRatio = parseInt(w, 32) / parseInt(h, 32);
        }
        if (rest.length > 0) {
          const v = rest.join("x");
          ret.blurPreviewSize = parseInt(v.slice(0, 2), 32);
          ret.blurPreview = `data:image/jpeg;base64,${atobUrl(v.slice(2))}`;
        }
      }
      ret.src = `https://${imagesHost}/${imageId.slice(0, 40)}/${resizing.join(",")}`;
    }
    return ret;
  }, [src, width, height, quality, fit]);
};

export function Image(props: ImageProps) {
  const { contentEditable, style } = props;
  const { namespace } = useContext(Context);
  const fs = useMemo(() => new FileStorage({ namespace }), [namespace]);
  const { src, srcSet, aspectRatio, fit, blurPreview, blurPreviewSize } = useImageSrc(props);
  const [isUploading, setIsUploading] = useState(false);
  const [isHover, setIsHover] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const $src = useMemo(
    () => previewUrl ?? src,
    [previewUrl, src],
  );
  const $imgStyle = useMemo(() => ({
    ...(blurPreview && blurPreviewSize && aspectRatio && !previewUrl
      ? {
        backgroundImage: `url("data:image/svg+xml;charset=utf-8,${
          blurSvg(blurPreview, blurPreviewSize, blurPreviewSize / aspectRatio)
        }")`,
        backgroundSize: fit,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }
      : null),
    objectFit: fit,
  }), [aspectRatio, blurPreview, blurPreviewSize, fit, previewUrl]);
  const $aspectRatio = useMemo(
    () => aspectRatio ?? style?.aspectRatio ?? (contentEditable && !previewUrl ? 1 : undefined),
    [aspectRatio, style?.aspectRatio, contentEditable, previewUrl],
  );
  const $style = useMemo(
    () => ({
      ...style,
      ...$imgStyle,
      aspectRatio: $aspectRatio,
    }),
    [style, $imgStyle, $aspectRatio],
  );

  const img = createElement("img", {
    ...props,
    key: $src,
    src: $src,
    srcSet: !previewUrl ? (props.srcSet ?? srcSet) : undefined,
    style: $style,
    loading: props.loading ?? "lazy",
  });

  const upload = async (file: File) => {
    const previewUrl = URL.createObjectURL(file.slice());
    setPreviewUrl(previewUrl);
    setIsUploading(true);
    setUploadProgress(0);
    try {
      let placeholder: string | undefined;
      const bp = props.blurPreview ?? "base";
      if (file.type === "image/jpeg") {
        const sizes = { "sm": 8, "base": 16, "md": 32, "lg": 64 };
        const size = sizes[bp] ?? 16;
        const thumb = await getImageThumbFromBlob(file.slice(), size);
        placeholder = size.toString(32).padStart(2, "0") + btoaUrl(thumb.split(",")[1]);
      }
      const { url } = await fs.put(file, {
        onProgress: (loaded: number, total: number) => setUploadProgress(loaded / total),
      });
      props.onChange?.({ src: url + (placeholder ? `x${placeholder}` : ""), alt: file.name });
    } catch (error) {
      props.onError?.(error);
      console.error("[gokv]", error);
    } finally {
      setIsUploading(false);
      setTimeout(() => {
        setPreviewUrl(null);
        URL.revokeObjectURL(previewUrl);
      }, 0);
    }
  };

  function Overlay(props: PropsWithChildren<{ style?: CSSProperties; transitionStyle?: CSSProperties }>) {
    const [dynStyle, setDynStyle] = useState(props.style);

    useEffect(() => {
      setDynStyle({ ...props.style, ...props.transitionStyle });
    }, [props.transitionStyle]);

    return (
      <div
        style={{
          boxSizing: "border-box",
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          textAlign: "center",
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "rgba(0,0,0,0.45)",
          fontSize: 12.8,
          color: "white",
          borderRadius: style?.borderRadius,
          ...dynStyle,
        }}
      >
        {props.children}
      </div>
    );
  }

  if (!contentEditable) {
    return img;
  }

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
    >
      {img}
      {isUploading && uploadProgress === 0 && <Overlay>Reading...</Overlay>}
      {isUploading && uploadProgress > 0 && <Overlay>{(uploadProgress * 100).toFixed(2)}%</Overlay>}
      {!$src && (
        <Overlay
          style={{
            color: "#868686",
            border: "1px solid #ddd",
            backgroundColor: "transparent",
            transition: "all 0.3s ease-out",
          }}
          transitionStyle={isHover ? { color: "#333", borderColor: "#bbb" } : undefined}
        >
          {iconImageAdd}
          {props.placeholder && <span>{props.placeholder}</span>}
        </Overlay>
      )}
      {isHover && !isUploading && !!$src && (
        <Overlay
          style={{ opacity: 0, transition: "opacity 0.3s ease-in" }}
          transitionStyle={{ opacity: 1 }}
        >
          {iconImageAdd}
          {props.placeholder && <span>{props.placeholder}</span>}
        </Overlay>
      )}
      {!isUploading && (
        <input
          type="file"
          accept="image/*"
          style={{
            display: "inline-block",
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            cursor: "pointer",
          }}
          title={!props.placeholder
            ? ($src ? "Choose or drag an image to replace" : "Choose or drag an image to upload")
            : ""}
          onChange={(e) => {
            const file = e.target.files?.item(0);
            if (file) {
              upload(file);
            }
          }}
        />
      )}
    </div>
  );
}

export type { ImageProps };
