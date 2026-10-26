/** Lets the globe dismiss a place comparison without importing the panel. */
let dismiss = (): void => {};

export function onDismissPlaceCompare(fn: () => void): void {
  dismiss = fn;
}

export function dismissPlaceCompare(): void {
  dismiss();
}
