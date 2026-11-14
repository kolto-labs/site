export const INSTALLER_ALLOWLIST: Set<string>;
export const INSTALLER_ASSET_NAMES: string[];
export function installerAllowed(asset: { name: string; url: string }): boolean;
