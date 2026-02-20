"""
AlgoLegacy — Time-Locked Digital Will Smart Contract
======================================================
Built with Beaker 1.x + PyTEAL for Algorand Testnet

Architecture:
  - Owner creates a will with an inactivity period
  - Owner periodically checks in (proof of life)
  - If owner misses check-in, any address can activate inheritance
  - Each beneficiary claims their % share of locked funds

Security:
  - Only owner can create will / check-in / revoke
  - Activation blocked until inactivity period elapses
  - Percentages must sum to exactly 100
  - Double-claim protection via claimed flags
  - Revoke only possible before inheritance is activated
"""

from beaker import Application, GlobalStateValue
from pyteal import (
    Assert,
    Bytes,
    Cond,
    Expr,
    Global,
    If,
    InnerTxnBuilder,
    Int,
    Seq,
    TealType,
    Txn,
    TxnField,
    TxnType,
    abi,
)


MIN_INACTIVITY_SECONDS = 60
MIN_DEPOSIT_MICROALGOS = 1_000_000
ERR_NO_WILL              = "No will exists"
ERR_INHERITANCE_ACTIVE   = "Inheritance already active"
ERR_ALREADY_CLAIMED      = "Already claimed"

# ─────────────────────────────────────────────────────────────────────────────
# Application + module-level global state
# (beaker 1.x: state vars must be declared at module scope, then assigned to app)
# ─────────────────────────────────────────────────────────────────────────────

# ── Core ──────────────────────────────────────────────────────────────────────
owner              = GlobalStateValue(TealType.bytes,  key="owner",              default=Bytes(""))
inactivity_period  = GlobalStateValue(TealType.uint64, key="inactivity_period",  default=Int(0))
last_checkin       = GlobalStateValue(TealType.uint64, key="last_checkin",       default=Int(0))
inheritance_active = GlobalStateValue(TealType.uint64, key="inheritance_active", default=Int(0))
total_locked       = GlobalStateValue(TealType.uint64, key="total_locked",       default=Int(0))
will_created       = GlobalStateValue(TealType.uint64, key="will_created",       default=Int(0))

# ── Beneficiary 1 ─────────────────────────────────────────────────────────────
b1_address = GlobalStateValue(TealType.bytes,  key="b1_address", default=Bytes(""))
b1_percent = GlobalStateValue(TealType.uint64, key="b1_percent", default=Int(0))
b1_claimed = GlobalStateValue(TealType.uint64, key="b1_claimed", default=Int(0))

# ── Beneficiary 2 ─────────────────────────────────────────────────────────────
b2_address = GlobalStateValue(TealType.bytes,  key="b2_address", default=Bytes(""))
b2_percent = GlobalStateValue(TealType.uint64, key="b2_percent", default=Int(0))
b2_claimed = GlobalStateValue(TealType.uint64, key="b2_claimed", default=Int(0))

# ── Beneficiary 3 ─────────────────────────────────────────────────────────────
b3_address = GlobalStateValue(TealType.bytes,  key="b3_address", default=Bytes(""))
b3_percent = GlobalStateValue(TealType.uint64, key="b3_percent", default=Int(0))
b3_claimed = GlobalStateValue(TealType.uint64, key="b3_claimed", default=Int(0))

# ── Digital Assets (ASA) ──────────────────────────────────────────────────────
locked_asa_id  = GlobalStateValue(TealType.uint64, key="locked_asa_id",  default=Int(0))
b1_asa_amount  = GlobalStateValue(TealType.uint64, key="b1_asa_amount",  default=Int(0))
b1_asa_claimed = GlobalStateValue(TealType.uint64, key="b1_asa_claimed", default=Int(0))
b2_asa_amount  = GlobalStateValue(TealType.uint64, key="b2_asa_amount",  default=Int(0))
b2_asa_claimed = GlobalStateValue(TealType.uint64, key="b2_asa_claimed", default=Int(0))
b3_asa_amount  = GlobalStateValue(TealType.uint64, key="b3_asa_amount",  default=Int(0))
b3_asa_claimed = GlobalStateValue(TealType.uint64, key="b3_asa_claimed", default=Int(0))

# ─────────────────────────────────────────────────────────────────────────────
# Create application  (22 global state keys: 15 original + 7 ASA)
# Schema: 4 byte-slices, 18 ints
# ─────────────────────────────────────────────────────────────────────────────
app = Application(
    "AlgoLegacy",
    state=[
        owner, inactivity_period, last_checkin, inheritance_active,
        total_locked, will_created,
        b1_address, b1_percent, b1_claimed,
        b2_address, b2_percent, b2_claimed,
        b3_address, b3_percent, b3_claimed,
        # ASA state
        locked_asa_id,
        b1_asa_amount, b1_asa_claimed,
        b2_asa_amount, b2_asa_claimed,
        b3_asa_amount, b3_asa_claimed,
    ],
)


# ─────────────────────────────────────────────────────────────────────────────
# 1. CREATE WILL
# ─────────────────────────────────────────────────────────────────────────────
@app.external
def create_will(
    period:     abi.Uint64,
    addr1:      abi.Address,
    pct1:       abi.Uint64,
    addr2:      abi.Address,
    pct2:       abi.Uint64,
    addr3:      abi.Address,
    pct3:       abi.Uint64,
    *,
    output:     abi.String,
) -> Expr:
    """
    Initialize the will. Can only be called once per app instance.
    Caller becomes the owner. Percentages must sum to 100.
    """
    total_pct = pct1.get() + pct2.get() + pct3.get()
    return Seq(
        Assert(will_created.get() == Int(0),                   comment="Will already created"),
        Assert(period.get() >= Int(MIN_INACTIVITY_SECONDS),    comment="Inactivity period too short"),
        Assert(total_pct == Int(100),                          comment="Percentages must sum to 100"),
        owner.set(Txn.sender()),
        inactivity_period.set(period.get()),
        last_checkin.set(Global.latest_timestamp()),
        inheritance_active.set(Int(0)),
        will_created.set(Int(1)),
        b1_address.set(addr1.get()),
        b1_percent.set(pct1.get()),
        b1_claimed.set(Int(0)),
        b2_address.set(addr2.get()),
        b2_percent.set(pct2.get()),
        b2_claimed.set(Int(0)),
        b3_address.set(addr3.get()),
        b3_percent.set(pct3.get()),
        b3_claimed.set(Int(0)),
        output.set("Will created successfully"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 2. DEPOSIT FUNDS
# ─────────────────────────────────────────────────────────────────────────────
@app.external
def deposit(
    payment: abi.PaymentTransaction,
    *,
    output: abi.Uint64,
) -> Expr:
    """Lock ALGO into the will. Full payment amount is locked with no fees."""
    return Seq(
        Assert(will_created.get() == Int(1),                         comment="Create will first"),
        Assert(inheritance_active.get() == Int(0),                   comment=ERR_INHERITANCE_ACTIVE),
        Assert(Txn.sender() == owner.get(),                          comment="Only owner can deposit"),
        Assert(payment.get().receiver() == Global.current_application_address(),
               comment="Payment must go to contract"),
        Assert(payment.get().amount() >= Int(MIN_DEPOSIT_MICROALGOS), comment="Minimum deposit is 1 ALGO"),
        total_locked.set(total_locked.get() + payment.get().amount()),
        output.set(total_locked.get()),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 3. CHECK-IN (Proof of Life)
# ─────────────────────────────────────────────────────────────────────────────
@app.external
def check_in(*, output: abi.Uint64) -> Expr:
    """Owner resets the inactivity clock. Blocked after activation."""
    return Seq(
        Assert(will_created.get() == Int(1),                         comment=ERR_NO_WILL),
        Assert(Txn.sender() == owner.get(),                          comment="Only owner can check in"),
        Assert(inheritance_active.get() == Int(0),                   comment=ERR_INHERITANCE_ACTIVE),
        last_checkin.set(Global.latest_timestamp()),
        output.set(Global.latest_timestamp()),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 4. ACTIVATE INHERITANCE
# ─────────────────────────────────────────────────────────────────────────────
@app.external
def activate_inheritance(*, output: abi.String) -> Expr:
    """Anyone can trigger activation once the inactivity deadline passes."""
    deadline = last_checkin.get() + inactivity_period.get()
    return Seq(
        Assert(will_created.get() == Int(1),                           comment=ERR_NO_WILL),
        Assert(inheritance_active.get() == Int(0),                     comment="Already activated"),
        Assert(Global.latest_timestamp() > deadline,                   comment="Inactivity period not yet elapsed"),
        inheritance_active.set(Int(1)),
        output.set("Inheritance activated"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 4b. FORCE ACTIVATE (owner only — skips time check, useful for testing/demo)
# ─────────────────────────────────────────────────────────────────────────────
@app.external
def force_activate(*, output: abi.String) -> Expr:
    """Owner can force-activate inheritance immediately, bypassing the inactivity timer."""
    return Seq(
        Assert(will_created.get() == Int(1),        comment=ERR_NO_WILL),
        Assert(Txn.sender() == owner.get(),          comment="Only owner can force activate"),
        Assert(inheritance_active.get() == Int(0),   comment="Already activated"),
        inheritance_active.set(Int(1)),
        output.set("Inheritance force-activated by owner"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 5. CLAIM INHERITANCE
# ─────────────────────────────────────────────────────────────────────────────
@app.external
def claim(beneficiary_slot: abi.Uint64, *, output: abi.Uint64) -> Expr:
    """Beneficiary claims their full share (slot 1, 2, or 3). No fees deducted."""
    slot    = beneficiary_slot.get()
    locked  = total_locked.get()

    def share(pct: Expr) -> Expr:
        return (locked * pct) / Int(100)

    def pay_out(addr: Expr, pct: Expr, claimed_flag: GlobalStateValue) -> Expr:
        return Seq(
            InnerTxnBuilder.Execute({
                TxnField.type_enum: TxnType.Payment,
                TxnField.receiver:  addr,
                TxnField.amount:    share(pct),
                TxnField.fee:       Int(0),
            }),
            claimed_flag.set(Int(1)),
            output.set(share(pct)),
        )

    return Seq(
        Assert(inheritance_active.get() == Int(1), comment="Inheritance not active"),
        Assert(total_locked.get() > Int(0),        comment="No funds to claim"),
        Cond(
            [slot == Int(1), Seq(
                Assert(Txn.sender() == b1_address.get(), comment="Not beneficiary 1"),
                Assert(b1_claimed.get() == Int(0),       comment="Slot 1 already claimed"),
                pay_out(b1_address.get(), b1_percent.get(), b1_claimed),
            )],
            [slot == Int(2), Seq(
                Assert(Txn.sender() == b2_address.get(), comment="Not beneficiary 2"),
                Assert(b2_claimed.get() == Int(0),       comment="Slot 2 already claimed"),
                pay_out(b2_address.get(), b2_percent.get(), b2_claimed),
            )],
            [slot == Int(3), Seq(
                Assert(Txn.sender() == b3_address.get(), comment="Not beneficiary 3"),
                Assert(b3_claimed.get() == Int(0),       comment="Slot 3 already claimed"),
                pay_out(b3_address.get(), b3_percent.get(), b3_claimed),
            )],
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 6. REVOKE WILL (owner only, before activation)
# ─────────────────────────────────────────────────────────────────────────────
@app.external
def revoke_will(*, output: abi.String) -> Expr:
    """Owner cancels the will and reclaims all funds. Blocked after activation."""
    return Seq(
        Assert(will_created.get() == Int(1),       comment=ERR_NO_WILL),
        Assert(Txn.sender() == owner.get(),         comment="Only owner can revoke"),
        Assert(inheritance_active.get() == Int(0), comment="Cannot revoke after activation"),
        If(
            total_locked.get() > Int(0),
            Seq(
                InnerTxnBuilder.Execute({
                    TxnField.type_enum: TxnType.Payment,
                    TxnField.receiver:  owner.get(),
                    TxnField.amount:    total_locked.get(),
                    TxnField.fee:       Int(0),
                }),
                total_locked.set(Int(0)),
            ),
        ),
        will_created.set(Int(0)),
        owner.set(Bytes("")),
        inactivity_period.set(Int(0)),
        last_checkin.set(Int(0)),
        b1_address.set(Bytes("")), b1_percent.set(Int(0)), b1_claimed.set(Int(0)),
        b2_address.set(Bytes("")), b2_percent.set(Int(0)), b2_claimed.set(Int(0)),
        b3_address.set(Bytes("")), b3_percent.set(Int(0)), b3_claimed.set(Int(0)),
        output.set("Will revoked - funds returned to owner"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 7. DIGITAL ASSET (ASA) METHODS
# ─────────────────────────────────────────────────────────────────────────────

@app.external
def opt_in_asa(asset: abi.Asset, *, output: abi.String) -> Expr:
    """
    Contract opts in to the given ASA so it can hold it.
    Only the owner can call this. Sets the tracked ASA ID.
    Fee must cover the inner opt-in transaction (fee budget ≥ 2000).
    """
    return Seq(
        Assert(will_created.get() == Int(1),        comment=ERR_NO_WILL),
        Assert(Txn.sender() == owner.get(),          comment="Only owner can opt contract in"),
        Assert(inheritance_active.get() == Int(0),  comment=ERR_INHERITANCE_ACTIVE),
        InnerTxnBuilder.Execute({
            TxnField.type_enum:     TxnType.AssetTransfer,
            TxnField.xfer_asset:    asset.asset_id(),
            TxnField.asset_receiver: Global.current_application_address(),
            TxnField.asset_amount:  Int(0),
            TxnField.fee:           Int(0),
        }),
        locked_asa_id.set(asset.asset_id()),
        output.set("Contract opted in to ASA"),
    )


@app.external
def lock_asa(
    transfer:  abi.AssetTransferTransaction,
    b1_amount: abi.Uint64,
    b2_amount: abi.Uint64,
    b3_amount: abi.Uint64,
    *,
    output: abi.String,
) -> Expr:
    """
    Owner transfers ASA tokens into the will, specifying how many units
    each beneficiary slot should receive.
    """
    total_asa = b1_amount.get() + b2_amount.get() + b3_amount.get()
    return Seq(
        Assert(will_created.get() == Int(1),        comment=ERR_NO_WILL),
        Assert(inheritance_active.get() == Int(0),  comment=ERR_INHERITANCE_ACTIVE),
        Assert(Txn.sender() == owner.get(),          comment="Only owner can lock ASA"),
        Assert(locked_asa_id.get() > Int(0),        comment="Opt contract in to an ASA first"),
        Assert(
            transfer.get().xfer_asset() == locked_asa_id.get(),
            comment="ASA ID mismatch — ensure opt-in was done for this asset",
        ),
        Assert(
            transfer.get().asset_receiver() == Global.current_application_address(),
            comment="Transfer must go to contract",
        ),
        Assert(
            transfer.get().asset_amount() == total_asa,
            comment="Transfer amount must equal sum of beneficiary allocations",
        ),
        b1_asa_amount.set(b1_asa_amount.get() + b1_amount.get()),
        b2_asa_amount.set(b2_asa_amount.get() + b2_amount.get()),
        b3_asa_amount.set(b3_asa_amount.get() + b3_amount.get()),
        output.set("ASA locked into will"),
    )


@app.external
def claim_asa(beneficiary_slot: abi.Uint64, *, output: abi.Uint64) -> Expr:
    """Beneficiary claims their ASA allocation (slot 1, 2, or 3)."""
    slot = beneficiary_slot.get()

    def pay_asa(addr: Expr, amount: GlobalStateValue, claimed_flag: GlobalStateValue) -> Expr:
        return Seq(
            InnerTxnBuilder.Execute({
                TxnField.type_enum:     TxnType.AssetTransfer,
                TxnField.xfer_asset:    locked_asa_id.get(),
                TxnField.asset_receiver: addr,
                TxnField.asset_amount:  amount.get(),
                TxnField.fee:           Int(0),
            }),
            claimed_flag.set(Int(1)),
            output.set(amount.get()),
        )

    return Seq(
        Assert(inheritance_active.get() == Int(1), comment="Inheritance not active"),
        Assert(locked_asa_id.get() > Int(0),       comment="No ASA locked in this will"),
        Cond(
            [slot == Int(1), Seq(
                Assert(Txn.sender() == b1_address.get(),  comment="Not beneficiary 1"),
                Assert(b1_asa_claimed.get() == Int(0),    comment=ERR_ALREADY_CLAIMED),
                Assert(b1_asa_amount.get()  > Int(0),     comment="No ASA allocated to slot 1"),
                pay_asa(b1_address.get(), b1_asa_amount, b1_asa_claimed),
            )],
            [slot == Int(2), Seq(
                Assert(Txn.sender() == b2_address.get(),  comment="Not beneficiary 2"),
                Assert(b2_asa_claimed.get() == Int(0),    comment=ERR_ALREADY_CLAIMED),
                Assert(b2_asa_amount.get()  > Int(0),     comment="No ASA allocated to slot 2"),
                pay_asa(b2_address.get(), b2_asa_amount, b2_asa_claimed),
            )],
            [slot == Int(3), Seq(
                Assert(Txn.sender() == b3_address.get(),  comment="Not beneficiary 3"),
                Assert(b3_asa_claimed.get() == Int(0),    comment=ERR_ALREADY_CLAIMED),
                Assert(b3_asa_amount.get()  > Int(0),     comment="No ASA allocated to slot 3"),
                pay_asa(b3_address.get(), b3_asa_amount, b3_asa_claimed),
            )],
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 8. READ-ONLY HELPERS
# ─────────────────────────────────────────────────────────────────────────────
@app.external(read_only=True)
def get_will_status(*, output: abi.String) -> Expr:
    """Returns: NO_WILL | ALIVE | READY_TO_ACTIVATE | INHERITANCE_ACTIVE"""
    return output.set(
        Cond(
            [will_created.get() == Int(0),      Bytes("NO_WILL")],
            [inheritance_active.get() == Int(1), Bytes("INHERITANCE_ACTIVE")],
            [Global.latest_timestamp() > last_checkin.get() + inactivity_period.get(),
             Bytes("READY_TO_ACTIVATE")],
            [Int(1),                             Bytes("ALIVE")],
        )
    )


@app.external(read_only=True)
def get_time_remaining(*, output: abi.Uint64) -> Expr:
    """Seconds until the inactivity deadline. Returns 0 if past deadline."""
    deadline = last_checkin.get() + inactivity_period.get()
    now      = Global.latest_timestamp()
    return If(
        now >= deadline,
        output.set(Int(0)),
        output.set(deadline - now),
    )


@app.external(read_only=True)
def get_locked_balance(*, output: abi.Uint64) -> Expr:
    """Total microALGO locked in the will."""
    return output.set(total_locked.get())


# ─────────────────────────────────────────────────────────────────────────────
# Entry point — compile to TEAL artifacts
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import json, pathlib

    spec = app.build()
    out  = pathlib.Path(__file__).parent / "artifacts"
    out.mkdir(exist_ok=True)
    (out / "AlgoLegacy.approval.teal").write_text(spec.approval_program)
    (out / "AlgoLegacy.clear.teal").write_text(spec.clear_program)
    (out / "AlgoLegacy.abi.json").write_text(json.dumps(spec.contract.dictify(), indent=2))
    print("✅ Contract artifacts written to contracts/artifacts/")

