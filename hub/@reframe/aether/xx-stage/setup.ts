#!/usr/bin/env zx

import { $, fs } from "npm:zx";
import process from "node:process";
const packages = ["dnsmasq", "mkcert"];
const dnsmasqConf = `${
  $`brew --prefix`.stdout.toString()
    .trim()
}/etc/dnsmasq.conf`;

function checkMacOS() {
  if (process.platform !== "darwin") {
    throw new Error("This script only works on macOS");
  }
}

async function installBrewPackages() {
  for (const pkg of packages) {
    try {
      await $`brew list ${pkg}`;
      console.log(`${pkg} is already installed`);
    } catch {
      console.log(`Installing ${pkg}...`);
      await $`brew install ${pkg}`;
    }
  }
}

async function setupDnsmasq() {
  // Create backup if file exists
  if (await fs.exists(dnsmasqConf)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await $`cp ${dnsmasqConf} ${dnsmasqConf}.backup.${timestamp}`;
  }

  // Write new configuration
  const config = `server=9.9.9.9
address=/.reframe.dev/127.0.0.1
address=/reframe.dev/127.0.0.1`;

  await $`echo ${config} | sudo tee ${dnsmasqConf}`;
  console.log("DNSMasq configuration updated");
}

async function setupMkcert() {
  // Install mkcert root certificate
  try {
    await $`mkcert -install`;
  } catch {
    // Ignore errors as certificate might already be installed
  }

  // Create cache directory if it doesn't exist
  await $`mkdir -p ./.cache`;

  // Generate certificates if they don't exist
  if (
    !await fs.exists("./.cache/cert.pem") ||
    !await fs.exists("./.cache/key.pem")
  ) {
    await $`mkcert -key-file ./.cache/key.pem -cert-file ./.cache/cert.pem cert.pem reframe.dev "*.reframe.dev" localhost 127.0.0.1 ::1`;
    console.log("Certificates generated");
  } else {
    console.log("Certificates already exist");
  }
}

async function restartDnsServices() {
  console.log("Restarting DNS services...");
  await $`sudo networksetup -setdnsservers Wi-Fi 127.0.0.1`;
  await $`sudo brew services restart dnsmasq`;
  await $`sudo dscacheutil -flushcache`;
  await $`sudo killall -HUP mDNSResponder`;
  console.log("DNS services restarted");
}

async function main() {
  console.log("Starting local development environment setup...");

  // Check prerequisites
  checkMacOS();

  try {
    await $`which brew`;
  } catch {
    throw new Error(
      "Homebrew is required but not installed. Please install Homebrew first.",
    );
  }

  // Install required packages
  await installBrewPackages();

  // Setup configurations
  await setupDnsmasq();
  return;
  await setupMkcert();
  await restartDnsServices();

  console.log("Setup completed successfully!");
  console.log(
    "Please clear your browser's DNS cache by visiting chrome://net-internals/#dns and clicking 'Clear host cache'",
  );
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
