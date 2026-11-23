const IOS_VERSION = /OS (\d+)[_.](\d+)(?:[_.](\d+))?/;

export function parseDevice(userAgent) {
  const ua = String(userAgent || "");
  const ios = /iPhone|iPad|iPod|CPU (?:iPhone )?OS/.test(ua);
  let model = "iPhone";
  if (ios && /iPad/.test(ua)) model = "iPad";
  else if (ios && /iPod/.test(ua)) model = "iPod";
  else if (ios && /iPhone/.test(ua)) model = "iPhone";

  const match = ios ? ua.match(IOS_VERSION) : null;
  const version = match
    ? match[3]
      ? `${match[1]}.${match[2]}.${match[3]}`
      : `${match[1]}.${match[2]}`
    : "";

  return { model, version };
}

export function deviceLabel(userAgent) {
  const device = parseDevice(userAgent);
  return {
    ...device,
    line: `${device.model} · supported`,
  };
}
