import { createElement } from "react";
import { ImageProps } from "../../types/react.d.ts";

export function Image(props: ImageProps) {
  if (props.readonly) {
    if (!props.url) {
      return null;
    }
    const resizing: string[] = [];
    if (typeof props.width === "number") {
      resizing.push(`width=${props.width}`);
    }
    if (typeof props.height === "number") {
      resizing.push(`height=${props.height}`);
    }
    if (resizing.length && props.fit) {
      resizing.push(`fit=${props.fit}`);
    }
    const href = props.url + (resizing.length > 0 ? `/${resizing.join(",")}` : "");
    return createElement("img", {
      href,
      alt: props.alt,
      className: props.className,
      style: props.style,
      width: props.width,
      height: props.height,
    });
  }
}
