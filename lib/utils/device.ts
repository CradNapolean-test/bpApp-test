// What kind of device this is, for the install help (UI2). An iPad running iPadOS 13 or later tells websites it is a Mac ("Macintosh" in
// the user agent), so a gym tablet was shown the desktop instructions with no Share -> Add to Home Screen steps. A "Mac" that has a
// touch screen is an iPad: real Macs report no touch points.
export interface DeviceInfo {
  ios: boolean;
  mobile: boolean;
}

export function detectDevice(userAgent: string, platform: string, maxTouchPoints: number): DeviceInfo {
  const iPadOs = /macintosh|macintel/i.test(`${userAgent} ${platform}`) && maxTouchPoints > 1;
  const ios = /iphone|ipad|ipod/i.test(userAgent) || iPadOs;
  const mobile = ios || /android/i.test(userAgent);
  return { ios, mobile };
}
