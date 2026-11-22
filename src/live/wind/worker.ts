import { decodeWindBinary, type WindHeader } from "./field";

interface WindWorkerRequest {
  buffer: ArrayBuffer;
  header: WindHeader;
}

self.onmessage = (event: MessageEvent<WindWorkerRequest>) => {
  // Chrome reports a dedicated worker's owner as an empty origin. Other
  // engines report the page origin. Any other origin is not our owner.
  const ownOrigin = self.location.origin;
  if (event.origin !== "" && event.origin !== ownOrigin) {
    self.postMessage({ error: "Wind worker rejected an unexpected origin" });
    return;
  }
  try {
    const field = decodeWindBinary(event.data.buffer, event.data.header);
    self.postMessage({
      header: field.header,
      u: field.u,
      v: field.v,
      t: field.t,
    });
  } catch (err) {
    self.postMessage({
      error: err instanceof Error ? err.message : "Wind decode failed",
    });
  }
};
