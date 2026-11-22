import { decodeWindBinary, type WindHeader } from "./field";

interface WindWorkerRequest {
  buffer: ArrayBuffer;
  header: WindHeader;
}

self.onmessage = (event: MessageEvent<WindWorkerRequest>) => {
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
