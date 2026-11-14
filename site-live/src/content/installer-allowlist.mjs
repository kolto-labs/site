// Release-asset installers the site may show. Other releases' installers stay hidden until listed here.
// kq v0.3.0 install scripts default to a different REPO. Every install command the site shows sets KQ_REPO=kolto-labs/kq.
export const INSTALLER_ALLOWLIST = new Set([
  'https://github.com/kolto-labs/kq/releases/download/v0.3.0/install.sh',
  'https://github.com/kolto-labs/kq/releases/download/v0.3.0/install.ps1',
]);

/** Names of release assets that are shell or PowerShell installers. */
export const INSTALLER_ASSET_NAMES = ['install.sh', 'install.ps1'];

/** True when a release asset may be offered as an install command or kept in the snapshot. */
export function installerAllowed(asset) {
  return !INSTALLER_ASSET_NAMES.includes(asset.name) || INSTALLER_ALLOWLIST.has(asset.url);
}
