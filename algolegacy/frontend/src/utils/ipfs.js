// ─────────────────────────────────────────────────────────────────────────────
// ipfs.js — IPFS utilities via Pinata cloud
//
// Setup:
//   1. Create a free account at https://app.pinata.cloud
//   2. Go to API Keys → New Key → enable "pinFileToIPFS" + "pinJSONToIPFS"
//   3. Copy the JWT and set REACT_APP_PINATA_JWT in your .env
//   4. (Optional) Set REACT_APP_PINATA_GATEWAY to your dedicated gateway
//      e.g. https://YOUR_SUBDOMAIN.mypinata.cloud
//      or leave blank to use the public gateway
// ─────────────────────────────────────────────────────────────────────────────

const PINATA_JWT     = process.env.REACT_APP_PINATA_JWT || "";
const PINATA_API     = "https://api.pinata.cloud";
export const PINATA_GATEWAY =
  process.env.REACT_APP_PINATA_GATEWAY || "https://gateway.pinata.cloud";

// ── Guard ─────────────────────────────────────────────────────────────────────
function requireJwt() {
  if (!PINATA_JWT) {
    throw new Error(
      "Pinata JWT not configured. Add REACT_APP_PINATA_JWT to your .env and restart."
    );
  }
}

// ── Upload a file (image / document) to IPFS via Pinata ──────────────────────
// Returns the IPFS CID (hash) of the uploaded file.
export async function uploadFileToIPFS(file, onProgress) {
  requireJwt();

  const formData = new FormData();
  formData.append("file", file);
  formData.append(
    "pinataMetadata",
    JSON.stringify({ name: file.name })
  );
  formData.append(
    "pinataOptions",
    JSON.stringify({ cidVersion: 1 })
  );

  const res = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: formData,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Pinata file upload failed (${res.status}): ${txt}`);
  }

  const data = await res.json();
  return data.IpfsHash; // CID
}

// ── Upload a JSON object as metadata ─────────────────────────────────────────
// Returns the IPFS CID of the pinned JSON.
export async function uploadMetadataToIPFS(metadata) {
  requireJwt();

  const res = await fetch(`${PINATA_API}/pinning/pinJSONToIPFS`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify({
      pinataContent:  metadata,
      pinataMetadata: { name: metadata.name || "NFT Metadata" },
      pinataOptions:  { cidVersion: 1 },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Pinata JSON upload failed (${res.status}): ${txt}`);
  }

  const data = await res.json();
  return data.IpfsHash; // CID
}

// ── Build ARC-3 compliant NFT metadata JSON ───────────────────────────────────
// https://github.com/algorandfoundation/ARCs/blob/main/ARCs/arc-0003.md
export function buildArc3Metadata({
  name,
  description,
  imageCid,        // IPFS CID of the image
  imageMimeType = "image/png",
  properties = {},
}) {
  return {
    name,
    description,
    image:          `ipfs://${imageCid}`,
    image_mimetype: imageMimeType,
    properties,
    // ARC-3 marker
    standard: "arc3",
  };
}

// ── Convert ipfs:// URI → HTTP gateway URL ────────────────────────────────────
export function ipfsToHttp(uri) {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) {
    const cid = uri.slice(7).split("#")[0]; // strip #arc3 fragment
    // Normalise gateway: strip any trailing /ipfs so we never get /ipfs/ipfs/
    const base = PINATA_GATEWAY.replace(/\/ipfs\/?$/, "");
    return `${base}/ipfs/${cid}`;
  }
  // already http
  return uri;
}

// ── Extract CID from ipfs:// URI ──────────────────────────────────────────────
export function ipfsCid(uri) {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) return uri.slice(7).split("#")[0];
  return uri;
}

// ── Check whether Pinata JWT is configured ───────────────────────────────────
export function isPinataConfigured() {
  return Boolean(PINATA_JWT);
}
