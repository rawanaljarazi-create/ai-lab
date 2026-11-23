export const DEVICE = {
  hostname: "iPhone",
  product: "iPhone17,2",
  productName: "iOS",
  productVersion: "18.1",
  build: "22B83",
  darwin: "24.1.0",
  kernel:
    "Darwin Kernel Version 24.1.0: Mon Oct 28 20:41:16 PDT 2024; root:xnu-11215.41.3~13/RELEASE_ARM64_T8140",
  arch: "arm64",
  dopamine: "2.4.5",
  procursus: "3000",
  suite: "3000",
  jb: "/private/preboot/A1F0C3E29B47D815/jb-3F2A91/procursus",
  source: "https://apt.procurs.us/",
};

export const STATUS_PATH = "/var/jb/var/lib/dpkg/status";
export const LISTS_PATH =
  "/var/jb/var/lib/apt/lists/apt.procurs.us_1800_main_binary-iphoneos-arm64_Packages";

export const SOURCES_TEXT = `Types: deb
URIs: ${DEVICE.source}
Suites: ${DEVICE.suite}
Components: main
`;

export const OS_RELEASE = `NAME="Procursus"
ID=procursus
VERSION="${DEVICE.procursus}"
VERSION_ID=${DEVICE.procursus}
PRETTY_NAME="Procursus ${DEVICE.procursus} (rootless)"
HOME_URL="https://procurs.us"
ARCHITECTURE="iphoneos-arm64"
SUITE="3000"
`;

export function unameLine() {
  return `Darwin ${DEVICE.hostname} ${DEVICE.darwin} ${DEVICE.kernel} ${DEVICE.product} ${DEVICE.arch}`;
}
