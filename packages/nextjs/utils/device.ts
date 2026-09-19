// When the Pico last polled this server. Memory only: the device only ever talks to the laptop running yarn start.
const g = globalThis as { __trustmDeviceSeen?: number; __trustmDeviceBusyUntil?: number };

export const deviceSeen = () => {
  g.__trustmDeviceSeen = Date.now();
};

// The device stops polling while it shows a request (waiting for A, then for the wallet's tx). That is alive, not
// offline: count it as seen until the window the firmware allows itself has passed.
export const deviceBusy = (ms: number) => {
  deviceSeen();
  g.__trustmDeviceBusyUntil = Date.now() + ms;
};
export const deviceIdle = () => {
  deviceSeen();
  g.__trustmDeviceBusyUntil = undefined;
};

// Seconds since the last poll (0 while busy), or null if the device has not polled since this server started.
export const deviceSeenAgo = () => {
  if (g.__trustmDeviceBusyUntil && g.__trustmDeviceBusyUntil > Date.now()) return 0;
  return g.__trustmDeviceSeen ? Math.round((Date.now() - g.__trustmDeviceSeen) / 1000) : null;
};
