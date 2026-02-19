# 🏛 AlgoLegacy — Time-Locked Digital Will on Algorand

> **On-chain inheritance, secured by time. No lawyers. No trust assumptions. Just code.**

[![Algorand](https://img.shields.io/badge/Built%20on-Algorand-00BCD4?style=flat-square)](https://algorand.com)
[![Network](https://img.shields.io/badge/Network-Testnet-orange?style=flat-square)](https://testnet.algoexplorer.io)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

---

## 🎯 What Is AlgoLegacy?

AlgoLegacy is a **trustless, time-locked digital will** deployed on the Algorand blockchain.

- The **owner** locks ALGO into a smart contract and designates up to 3 beneficiaries with percentage shares.
- The owner must **check in** (prove they're alive) before the inactivity period expires.
- If the owner **misses their check-in**, anyone can trigger inheritance activation.
- Beneficiaries then **claim** their share directly from the contract — no intermediaries.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│   React + Pera Wallet + algosdk                             │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│   │ CreateWill   │  │  OwnerDash   │  │  Beneficiary     │ │
│   │ Form         │  │  Check-in    │  │  Panel + Claim   │ │
│   │              │  │  Deposit     │  │                  │ │
│   └──────────────┘  └──────────────┘  └──────────────────┘ │
└────────────────────────────┬────────────────────────────────┘
                             │ ABI Method Calls
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              SMART CONTRACT (Beaker + PyTEAL)               │
│                                                             │
│  Global State:                                              │
│    owner, inactivity_period, last_checkin,                  │
│    inheritance_active, total_locked,                        │
│    beneficiary{1,2,3}_{address,percent,claimed}             │
│                                                             │
│  Methods:                                                   │
│    create_will() → deposit() → check_in()                   │
│    activate_inheritance() → claim() → revoke_will()         │
│                                                             │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │   Algorand Testnet       │
              │   AlgoExplorer Indexer   │
              └──────────────────────────┘
```

---

## 🗂 Project Structure

```
algolegacy/
├── contracts/
│   ├── algolegacy.py          ← Beaker smart contract (full logic)
│   ├── __init__.py
│   └── artifacts/             ← Generated TEAL + ABI (after compile)
│       ├── AlgoLegacy.approval.teal
│       ├── AlgoLegacy.clear.teal
│       ├── AlgoLegacy.abi.json
│       └── deployed.json
├── tests/
│   └── test_inheritance.py    ← Full pytest test suite (16 scenarios)
├── scripts/
│   ├── deploy.py              ← Deploy to testnet
│   └── compile.py             ← Compile to TEAL artifacts
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js             ← Root component
│   │   ├── algorand.js        ← Algorand utility layer
│   │   ├── index.css          ← Dark-theme styles
│   │   └── components/
│   │       ├── WalletContext.js    ← Pera Wallet management
│   │       ├── Navbar.js           ← Header + wallet button
│   │       ├── CreateWillForm.js   ← Will creation form
│   │       ├── OwnerDashboard.js   ← Check-in, deposit, revoke
│   │       ├── BeneficiaryPanel.js ← Claim UI
│   │       └── CountdownTimer.js   ← Live countdown
│   ├── package.json
│   └── .env.example
├── requirements.txt
├── .env.example
└── .gitignore
```

---

## ⚡ Quick Start

### Prerequisites

| Tool | Install |
|------|---------|
| Python 3.10+ | [python.org](https://python.org) |
| Node.js 18+  | [nodejs.org](https://nodejs.org) |
| AlgoKit CLI  | `pip install algokit` |
| Git          | [git-scm.com](https://git-scm.com) |

---

### 1️⃣ Clone & Install

```bash
git clone https://github.com/your-repo/algolegacy
cd algolegacy

# Python dependencies
pip install -r requirements.txt

# Frontend dependencies
cd frontend
npm install
cd ..
```

---

### 2️⃣ Configure Environment

```bash
# Copy and fill in your values
cp .env.example .env
```

Edit `.env`:
```env
ALGO_MNEMONIC=your 25 word mnemonic here
NETWORK=testnet
```

> 💡 Get free testnet ALGO from the [Algorand Testnet Dispenser](https://testnet.algoexplorer.io/dispenser)

---

### 3️⃣ Compile the Contract

```bash
python scripts/compile.py
```

Outputs TEAL files to `contracts/artifacts/`.

---

### 4️⃣ Deploy to Testnet

```bash
python scripts/deploy.py
```

Copy the printed **App ID** into `frontend/.env`:

```env
REACT_APP_APP_ID=123456789
```

---

### 5️⃣ Fund the Contract Account

The contract needs a small ALGO balance for inner transaction fees:

```bash
# Use AlgoKit sandbox or send from your wallet to the printed App Address
algokit goal clerk send -a 500000 -f YOUR_ADDRESS -t APP_ADDRESS
```

---

### 6️⃣ Run Frontend

```bash
cd frontend
cp .env.example .env
# Set REACT_APP_APP_ID=<your-app-id>
npm start
```

Open [http://localhost:3000](http://localhost:3000)

---

### 7️⃣ Run Tests (local sandbox)

```bash
# Start AlgoKit sandbox first
algokit localnet start

# Run tests
pytest tests/ -v
```

---

## 🔐 Smart Contract Security Q&A

| Judge Question | Answer |
|----------------|--------|
| **What prevents early activation?** | `Assert(Global.latest_timestamp() > last_checkin + inactivity_period)` — the blockchain timestamp must exceed the deadline. This is trustless. |
| **What prevents fake beneficiary claims?** | `Assert(Txn.sender() == beneficiaryN_address)` — only the exact registered address can claim that slot. |
| **What if percentages exceed 100%?** | `Assert(b1_pct + b2_pct + b3_pct == 100)` — the `create_will` call fails on-chain if percentages don't sum to exactly 100. |
| **What if owner wants to revoke?** | `revoke_will()` method returns all funds to owner. Blocked after activation. |
| **Double-claim protection?** | `beneficiaryN_claimed` flag set to 1 after claim. Second attempt fails with "already claimed". |

---

## 🔗 Contract Methods

| Method | Who Calls | Description |
|--------|-----------|-------------|
| `create_will(period, b1_addr, b1_pct, b2_addr, b2_pct, b3_addr, b3_pct)` | Owner | Initialize will with beneficiaries |
| `deposit(payment)` | Owner | Lock ALGO into the contract |
| `check_in()` | Owner | Reset inactivity clock (proof of life) |
| `activate_inheritance()` | Anyone | Trigger activation after deadline |
| `claim(slot)` | Beneficiary | Claim percentage share |
| `revoke_will()` | Owner | Cancel will, reclaim funds |
| `get_will_status()` | Anyone | Read-only: ALIVE / READY_TO_ACTIVATE / INHERITANCE_ACTIVE |
| `get_time_remaining()` | Anyone | Read-only: seconds until deadline |
| `get_locked_balance()` | Anyone | Read-only: microALGO in contract |

---

## 🎬 Demo Script (for LinkedIn video)

1. **Connect** Pera Wallet on Testnet
2. **Create Will** — set 60-second inactivity period, add 3 beneficiary addresses
3. **Deposit** 3 ALGO → show locked balance
4. **Show countdown** timer live on screen
5. **Wait 60 seconds** — do NOT check in
6. **Activate Inheritance** → click the button
7. **Switch wallet** to Beneficiary 1
8. **Claim** → live funds transferred → open AlgoExplorer and show the transaction

---

## 🏆 Hackathon Deliverables Checklist

- [x] Public GitHub repository
- [x] Deployed smart contract (App ID in `contracts/artifacts/deployed.json`)
- [x] Live hosted frontend
- [x] Testnet explorer link
- [x] Architecture diagram (see above)
- [x] LinkedIn demo video
- [x] README with full setup steps

---

## 📄 License

MIT — feel free to fork, improve, and build on top of AlgoLegacy.
