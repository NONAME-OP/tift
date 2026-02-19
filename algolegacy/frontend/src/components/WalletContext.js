// ─────────────────────────────────────────────────────────────────────────────
// WalletContext.js — Pera Wallet connection management
// ─────────────────────────────────────────────────────────────────────────────
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { PeraWalletConnect } from "@perawallet/connect";
import algosdk from "algosdk";
import { algodClient } from "../algorand";

const WalletContext = createContext(null);

const peraWallet = new PeraWalletConnect({ shouldShowSignTxnToast: true });

export function WalletProvider({ children }) {
  const [accounts, setAccounts]   = useState([]);
  const [activeAddr, setActiveAddr] = useState(null);
  const [balance, setBalance]     = useState(0);
  const [connecting, setConnecting] = useState(false);

  const disconnect = useCallback(() => {
    peraWallet.disconnect();
    setAccounts([]);
    setActiveAddr(null);
    setBalance(0);
  }, []);

  // Reconnect if session persists
  useEffect(() => {
    peraWallet
      .reconnectSession()
      .then((accs) => {
        if (accs.length) {
          peraWallet.connector?.on("disconnect", disconnect);
          setAccounts(accs);
          setActiveAddr(accs[0]);
        }
      })
      .catch(console.error);
  }, [disconnect]);

  // Fetch ALGO balance whenever address changes
  useEffect(() => {
    if (!activeAddr) { setBalance(0); return; }
    algodClient
      .accountInformation(activeAddr)
      .do()
      .then((info) => setBalance(info.amount))
      .catch(console.error);
  }, [activeAddr]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const accs = await peraWallet.connect();
      peraWallet.connector?.on("disconnect", disconnect);
      setAccounts(accs);
      setActiveAddr(accs[0]);
    } catch (e) {
      if (e?.data?.type !== "CONNECT_MODAL_CLOSED") console.error(e);
    } finally {
      setConnecting(false);
    }
  }, [disconnect]);

  /**
   * Sign and send a list of unsigned transactions.
   * Returns array of txn IDs.
   */
  const signAndSend = useCallback(
    async (txns) => {
      const grouped = algosdk.assignGroupID(txns);
      const toSign  = grouped.map((t) => ({ txn: t, signers: [activeAddr] }));
      const signed  = await peraWallet.signTransaction([toSign]);
      const results = [];
      for (const s of signed) {
        const { txId } = await algodClient.sendRawTransaction(s).do();
        await algosdk.waitForConfirmation(algodClient, txId, 4);
        results.push(txId);
      }
      return results;
    },
    [activeAddr]
  );

  /**
   * Returns an ATC-compatible signer for this wallet.
   */
  const makeSigner = useCallback(() => {
    return async (txnGroup, indexes) => {
      const toSign = txnGroup.map((t, i) =>
        indexes.includes(i) ? { txn: t, signers: [activeAddr] } : { txn: t, signers: [] }
      );
      return peraWallet.signTransaction([toSign]);
    };
  }, [activeAddr]);

  return (
    <WalletContext.Provider
      value={{
        accounts,
        activeAddr,
        balance,
        connecting,
        connect,
        disconnect,
        signAndSend,
        makeSigner,
        isConnected: !!activeAddr,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
