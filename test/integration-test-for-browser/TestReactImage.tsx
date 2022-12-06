/// <reference lib="dom" />
/** @jsx createElement */
/** @jsxFrag Fragment */
import { createElement, Fragment, useState } from "react";
import { Image } from "gokv/react";

function JSONViewer(
  { data, indent = 2 }: { data: Record<string, unknown> | unknown[]; indent?: number },
) {
  const isArray = Array.isArray(data);
  const sym = isArray ? "[]" : "{}";
  const len = isArray ? data.length : Object.keys(data).length;
  if (len === 0) {
    return <code>{sym}</code>;
  }
  const viewer = (
    <>
      <code>{sym[0]}</code>
      <br />
      {Object.entries(data).map(([key, value], i) => {
        if (typeof value === "object" && value !== null) {
          return (
            <>
              <code>
                {" ".repeat(indent)}
                <span className="key">{key}</span>
                <span className="colon">{": "}</span>
              </code>
              <JSONViewer data={value as typeof data} indent={indent + 2} />
              {i < len - 1 && <code className="comma">,</code>}
              <br />
            </>
          );
        }
        return (
          <>
            <code>
              {" ".repeat(indent)}
              <span className="key">{key}</span>
              <span className="colon">{": "}</span>
              <span className={"value " + typeof value}>{String(value)}</span>
              {i < len - 1 && <span className="comma">,</span>}
            </code>
            <br />
          </>
        );
      })}
      <code>{" ".repeat(indent - 2) + sym[1]}</code>
    </>
  );
  if (indent === 2) {
    return (
      <div className="json-viewer">
        <pre>{viewer}</pre>
      </div>
    );
  }
  return viewer;
}

export function TestReactImage() {
  const [image, setImage] = useState<{ src?: string; alt?: string }>({});

  return (
    <div className="flex">
      <div className="w-half">
        <h3>Images</h3>
        <ul>
          <li>
            <p>Image</p>
            <div className="card" style={{ width: 240 }}>
              <Image
                width={240}
                height={240}
                src={image.src}
                alt={image.alt}
              />
              <em>cover</em>
            </div>
            <div className="card" style={{ width: 240 }}>
              <Image
                width={240}
                height={240}
                src={image.src}
                alt={image.alt}
                fit="contain"
              />
              <em>contain</em>
            </div>
            <div className="card" style={{ width: 240 }}>
              <Image
                width={240}
                src={image.src}
                alt={image.alt}
              />
              <em>dynamic</em>
            </div>
          </li>
          <li>
            <p>Image Uploader</p>
            <Image
              width={240}
              height={240}
              src={image.src}
              alt={image.alt}
              onChange={setImage}
              contentEditable
            />
          </li>
        </ul>
      </div>
      <div className="w-half">
        <h3>State</h3>
        <JSONViewer data={{ image }} />
      </div>
    </div>
  );
}
