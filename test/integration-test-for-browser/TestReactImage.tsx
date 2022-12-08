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
      <div className="json-viewer info">
        <pre>{viewer}</pre>
      </div>
    );
  }
  return viewer;
}

export function TestReactImage() {
  const [mode, setMode] = useState(0);
  const [image, setImage] = useState<{ src?: string; alt?: string }>({});

  return (
    <div className="flex">
      <div className="w-half">
        <h3>Image Display</h3>
        <div className="flex" style={{ gap: 8, marginBottom: 16 }}>
          fit mode:
          <label>
            <input type="radio" name="mode" checked={mode === 0} onChange={() => setMode(0)} />
            cover
          </label>
          <label>
            <input type="radio" name="mode" checked={mode === 1} onChange={() => setMode(1)} />
            contain
          </label>
          <label>
            <input type="radio" name="mode" checked={mode === 2} onChange={() => setMode(2)} />
            dynamic
          </label>
        </div>
        {mode === 0 && (
          <Image
            width={240}
            height={240}
            src={image.src}
            alt={image.alt}
          />
        )}
        {mode === 1 && (
          <Image
            width={240}
            height={240}
            src={image.src}
            alt={image.alt}
            fit="contain"
          />
        )}
        {mode === 2 && (
          <Image
            width={240}
            src={image.src}
            alt={image.alt}
          />
        )}
        <h3>Image Upload</h3>
        <Image
          width={240}
          height={240}
          placeholder="Select or drag an image"
          src={image.src}
          alt={image.alt}
          onChange={setImage}
          contentEditable
        />
      </div>
      <div className="w-half">
        <h3>State</h3>
        <JSONViewer data={{ image }} />
      </div>
    </div>
  );
}
