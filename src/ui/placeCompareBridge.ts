/** Lets the globe dismiss a place comparison without importing the panel. */
let dismiss = (): void => {};

export function onDismissPlaceCompare(fn: () => void): void {
  dismiss = fn;
}

export function dismissPlaceCompare(): void {
  dismiss();
}

/** The render loop projects comparison pins. The pin owner registers this. */
let framePins: ((camera: object) => void) | undefined;

export function onFrameComparePins(fn: (camera: object) => void): void {
  framePins = fn;
}

export function frameComparePins(camera: object): void {
  framePins?.(camera);
}
