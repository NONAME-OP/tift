# AlgoLegacy -- Time-Locked Digital Will on Algorand

A trustless, time-locked digital will system deployed on the Algorand blockchain. Owners lock ALGO and ASA tokens in a smart contract, designate up to 3 beneficiaries with percentage splits, and if the owner fails to check in within the inactivity period, beneficiaries can claim their inheritance on-chain.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│   React + Pera Wallet + algosdk                             │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│   │ CreateWill   │  │  OwnerDash   │  │  Beneficiary     │ │
│   │ Form         │  │  Check-in    │  │  Panel + Claim   │ │
│   └──────────────┘  └──────────────┘  └──────────────────┘ │
└────────────────────────────┬────────────────────────────────┘
                             │ ABI Method Calls (ARC-4)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              SMART CONTRACT (Beaker + PyTEAL)               │
│                                                             │
│  Global State:                                              │
│    owner, inactivity_period, last_checkin,                  │
│    inheritance_active, total_locked,                        │
│    beneficiary{1,2,3}_{address,percent,claimed}             │
│    locked_asa_id, b{1,2,3}_asa_amount, b{1,2,3}_asa_claimed│
│                                                             │
│  Methods:                                                   │
│    create_will | check_in | trigger_inheritance             │
│    claim_inheritance | cancel_will                          │
│    lock_asa | claim_asa                                     │
│                                                             │
└────────────────────────────┬────────────────────────────────┘
                             │ Inner Transactions
                             ▼
              ┌──────────────────────────┐
              │   Algorand Testnet       │
              └──────────────────────────┘
```

---

## Project Structure

```
algolegacy/
├── contracts/
│   ├── algolegacy.py              Beaker smart contract
│   ├── __init__.py
│   └── artifacts/                 Generated TEAL + ABI (after compile)
│       ├── AlgoLegacy.approval.teal
│       ├── AlgoLegacy.clear.teal
│       ├── AlgoLegacy.abi.json
│       └── deployed.json
├── tests/
│   └── test_inheritance.py        Pytest test suite
├── scripts/
│   ├── deploy.py                  Deploy to testnet
│   └── compile.py                 Compile to TEAL artifacts
├── frontend/
│   ├── craco.config.js            PostCSS config (Tailwind v4)
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js                 Root component
│   │   ├── algorand.js            Algorand utility layer
│   │   ├── index.css              Global styles + Tailwind
│   │   ├── components/
│   │   │   ├── WalletContext.js   Pera Wallet management
│   │   │   ├── Navbar.js          Header + wallet button
│   │   │   ├── CreateWillForm.js  Will creation form
│   │   │   ├── OwnerDashboard.js  Check-in, cancel, manage
│   │   │   ├── BeneficiaryPanel.js  Claim UI
│   │   │   ├── ClaimsView.js      Claims overview
│   │   │   ├── CountdownTimer.js  Live countdown
│   │   │   ├── DigitalAssetsPanel.js  ASA/NFT management
│   │   │   ├── ShootingStars.js   Background animation
│   │   │   └── StarsBackground.js Starfield animation
│   │   └── utils/
│   │       └── ipfs.js            IPFS upload utility
│   ├── package.json
│   └── .env.example
├── requirements.txt
├── .env.example
└── .gitignore
```

---

## Prerequisites

| Tool         | Version  |
|--------------|----------|
| Python       | 3.10+    |
| Node.js      | 18+      |
| Git          | any      |

---

## Setup

### 1. Clone and Install

```bash
git clone https://github.com/your-repo/algolegacy
cd algolegacy

pip install -r requirements.txt

cd frontend
npm install
cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
ALGO_MNEMONIC=your 25 word mnemonic here
NETWORK=testnet
```

Get free testnet ALGO from the [Algorand Testnet Dispenser](https://bank.testnet.algorand.network/).

### 3. Compile the Contract

```bash
python scripts/compile.py
```

### 4. Deploy to Testnet

```bash
python scripts/deploy.py
```

Copy the printed App ID into `frontend/.env`:

```env
REACT_APP_APP_ID=123456789
```

### 5. Run Frontend

```bash
cd frontend
cp .env.example .env
# Set REACT_APP_APP_ID in .env
npm start
```

Open http://localhost:3000

### 6. Run Tests (local sandbox)

```bash
algokit localnet start
pytest tests/ -v
```

---

## Contract Methods

| Method | Caller | Description |
|--------|--------|-------------|
| `create_will` | Owner | Initialize will with ALGO deposit, inactivity period, and up to 3 beneficiaries with percentage splits |
| `check_in` | Owner | Reset inactivity clock (proof of life) |
| `trigger_inheritance` | Anyone | Activate inheritance after inactivity deadline has passed |
| `claim_inheritance` | Beneficiary | Claim ALGO share after inheritance is active |
| `cancel_will` | Owner | Cancel will and reclaim all locked ALGO (blocked after activation) |
| `lock_asa` | Owner | Lock an ASA token into the will with per-beneficiary amounts |
| `claim_asa` | Beneficiary | Claim ASA allocation after inheritance is active |

---

## Security

| Concern | Protection |
|---------|------------|
| Early activation | Contract asserts `latest_timestamp > last_checkin + inactivity_period` |
| Unauthorized claims | Contract asserts `Txn.sender == registered beneficiary address` |
| Invalid percentages | Contract asserts `b1_pct + b2_pct + b3_pct == 100` |
| Double claims | `claimed` flag set to 1 after first claim; second attempt is rejected |
| Unauthorized cancel | Only the owner address can call `cancel_will` |

---

## License

MIT
