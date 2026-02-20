// ─────────────────────────────────────────────────────────────────────────────
// errorMessages.js — Human-friendly error messages for Algorand transactions
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { toast } from "react-toastify";

/* ── Copyable address chip ─────────────────────────────────────────────────── */
function CopyAddress({ addr }) {
  const short = addr.slice(0, 8) + "…" + addr.slice(-6);
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(addr).then(() =>
          toast.info("Address copied to clipboard!", { autoClose: 1500 })
        );
      }}
      style={{
        cursor: "pointer",
        textDecoration: "underline",
        fontFamily: "monospace",
        fontWeight: "bold",
        color: "#60a5fa",
      }}
      title={`Click to copy: ${addr}`}
    >
      {short}
    </span>
  );
}

/** Try to extract an Algorand address from the raw message and build JSX */
function balanceMessageWithAccount(msg, fallback) {
  const m = msg.match(/account\s+([A-Z2-7]{58})/i);
  if (m) {
    return (
      <span>
        Insufficient balance for account <CopyAddress addr={m[1]} />.
        Please fund this wallet and try again.
      </span>
    );
  }
  return fallback;
}

/**
 * Map of regex patterns to user-friendly messages.
 * Order matters — first match wins.
 */
const ERROR_PATTERNS = [
  // ── Balance / funding errors ──────────────────────────────────────────────
  {
    pattern: /overspend|underflow|below min/i,
    getMessageFromFull: (msg) =>
      balanceMessageWithAccount(
        msg,
        "Insufficient balance. Your wallet does not have enough ALGO to complete this transaction. Please fund your wallet and try again."
      ),
  },
  {
    pattern: /min balance|minimum balance/i,
    getMessageFromFull: (msg) =>
      balanceMessageWithAccount(
        msg,
        "This transaction would drop your account below the minimum required ALGO balance. You need more ALGO in your wallet."
      ),
  },
  {
    pattern: /balance.*below|insufficient.*fund|not enough.*algo/i,
    getMessageFromFull: (msg) =>
      balanceMessageWithAccount(
        msg,
        "Insufficient ALGO balance. Please add more funds to your wallet."
      ),
  },

  // ── Opt-in errors ─────────────────────────────────────────────────────────
  {
    pattern: /asset.*not.*found.*account|not.*opted.*in/i,
    message: "You have not opted into this asset. Open Pera Wallet, go to Assets, and add this token before trying again.",
  },
  {
    pattern: /receiver.*not.*opted/i,
    message: "The receiver has not opted into this asset. They must add the token in their wallet first.",
  },
  {
    pattern: /asset.*already.*opted/i,
    message: "This account is already opted into this asset.",
  },

  // ── Will / contract logic errors ──────────────────────────────────────────
  {
    pattern: /will.*already.*created|will_created/i,
    message: "A will has already been created on this contract. You cannot create another one.",
  },
  {
    pattern: /not.*owner|only.*owner|unauthorized/i,
    message: "Only the will owner can perform this action.",
  },
  {
    pattern: /already.*claimed/i,
    message: "This share has already been claimed. You cannot claim it again.",
  },
  {
    pattern: /inheritance.*not.*active|not.*activated/i,
    message: "Inheritance has not been activated yet. The owner's inactivity period must expire first.",
  },
  {
    pattern: /inactivity.*period.*not.*elapsed|too.*early|timer.*not.*expired/i,
    message: "Cannot activate inheritance yet. The owner's inactivity timer has not expired.",
  },
  {
    pattern: /inheritance.*already.*active/i,
    message: "Inheritance is already active. Beneficiaries can now claim their shares.",
  },
  {
    pattern: /percentages.*must.*100|percent.*sum|pct.*100/i,
    message: "Beneficiary percentages must add up to exactly 100%.",
  },
  {
    pattern: /no.*will.*found|will.*not.*created/i,
    message: "No will found on this contract. Please create a will first.",
  },
  {
    pattern: /invalid.*beneficiary|not.*beneficiary/i,
    message: "Your wallet address is not registered as a beneficiary in this will.",
  },
  {
    pattern: /will.*revoked|will.*cancelled/i,
    message: "This will has been revoked by the owner.",
  },

  // ── ASA / token errors ────────────────────────────────────────────────────
  {
    pattern: /asset.*not.*found/i,
    message: "Asset not found. Please verify the ASA ID is correct.",
  },
  {
    pattern: /asset.*frozen/i,
    message: "This asset is frozen and cannot be transferred.",
  },
  {
    pattern: /invalid.*asset/i,
    message: "Invalid asset ID. Please check the ASA ID and try again.",
  },
  {
    pattern: /no.*asa.*locked|locked_asa_id/i,
    message: "No ASA has been locked in this will yet. The owner must lock tokens first.",
  },

  // ── Transaction / network errors ──────────────────────────────────────────
  {
    pattern: /user.*rejected|user.*cancel|user.*denied|user.*closed/i,
    message: "Transaction was cancelled. You declined the transaction in your wallet.",
  },
  {
    pattern: /popup.*closed|modal.*closed|connect.*cancel/i,
    message: "Wallet connection was cancelled.",
  },
  {
    pattern: /txn.*dead|transaction.*expired|round.*range/i,
    message: "Transaction expired. The network was too slow. Please try again.",
  },
  {
    pattern: /network.*error|fetch.*failed|econnrefused|timeout/i,
    message: "Network error. Could not reach the Algorand node. Please check your connection and try again.",
  },
  {
    pattern: /rate.*limit|429|too.*many.*requests/i,
    message: "Too many requests. The Algorand node is rate-limiting. Please wait a moment and try again.",
  },
  {
    pattern: /logic.*eval.*error|logic eval/i,
    getMessageFromFull: (msg) => {
      // Try to extract the specific assertion message from logic eval errors
      const assertMatch = msg.match(/assert.*failed|err.*opcode|byte.*assert/i);
      if (assertMatch) {
        return `Smart contract rejected the transaction. The on-chain logic validation failed. This could mean you're not authorized, values are invalid, or the will state doesn't allow this action.`;
      }
      return "Smart contract rejected this transaction. Please verify the inputs and try again.";
    },
  },
  {
    pattern: /application.*not.*found|app.*does.*not.*exist/i,
    message: "Application not found. This contract may not exist or may have been deleted.",
  },

  // ── IPFS / Pinata errors ──────────────────────────────────────────────────
  {
    pattern: /pinata|ipfs.*upload.*fail|jwt.*invalid/i,
    message: "IPFS upload failed. Please check your Pinata API key in the .env file.",
  },

  // ── Compilation / deployment errors ───────────────────────────────────────
  {
    pattern: /compile.*fail|teal.*error/i,
    message: "Contract compilation failed. The TEAL source code may be corrupted or incompatible.",
  },
  {
    pattern: /app.*creation.*fail|could.*not.*determine.*application/i,
    message: "Contract deployment failed. Please check your wallet balance and try again.",
  },
];

/**
 * Parse a raw error into a user-friendly message.
 * @param {Error|string} error - The raw error
 * @returns {string} Human-friendly error message
 */
export function parseError(error) {
  const rawMessage = typeof error === "string" ? error : error?.message || "Unknown error";

  for (const { pattern, message, getMessageFromFull } of ERROR_PATTERNS) {
    if (pattern.test(rawMessage)) {
      if (getMessageFromFull) return getMessageFromFull(rawMessage);
      return message;
    }
  }

  // Fallback: try to clean up the raw message
  // Remove long hex strings (transaction IDs, addresses)
  let cleaned = rawMessage
    .replace(/TransactionPool\.Remember:\s*/gi, "")
    .replace(/transaction\s+[A-Z0-9]{52,}:\s*/gi, "")
    .replace(/\b[A-Z2-7]{58}\b/g, "[address]")
    .replace(/\b[A-Z0-9]{52,}\b/g, "[txn]")
    .trim();

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // If still too long, truncate
  if (cleaned.length > 200) {
    cleaned = cleaned.slice(0, 197) + "...";
  }

  return cleaned || "Transaction failed. Please try again.";
}

/**
 * Parse error and return with a contextual prefix.
 * @param {Error|string} error
 * @param {string} action - e.g. "Deposit", "Claim", "Check-In"
 * @returns {string}
 */
export function parseActionError(error, action) {
  const parsed = parseError(error);
  // If parseError returned JSX, wrap with prefix as JSX
  if (React.isValidElement(parsed)) {
    return <span>{action} failed: {parsed}</span>;
  }
  // Don't double-prefix if the parsed message already mentions the action
  if (parsed.toLowerCase().includes(action.toLowerCase())) return parsed;
  return `${action} failed: ${parsed}`;
}
