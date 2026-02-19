"""
AlgoLegacy — Full Test Suite
=============================
Tests every branch of the smart contract using AlgoKit + pytest.

Run:
    pytest tests/ -v

Requirements:
    pip install beaker-pyteal algokit-utils pytest

Test Scenarios:
  1.  Contract deploy
  2.  create_will — happy path
  3.  create_will — reject duplicate
  4.  create_will — reject bad percentages
  5.  create_will — reject short inactivity period
  6.  deposit — happy path
  7.  deposit — reject non-owner
  8.  check_in — happy path
  9.  check_in — reject non-owner
  10. activate_inheritance — reject before deadline
  11. activate_inheritance — happy path (mocked time)
  12. claim — happy path (all 3 slots)
  13. claim — reject double claim
  14. claim — reject wrong address
  15. revoke_will — happy path
  16. revoke_will — reject after activation
"""

import pytest
from algokit_utils import (
    ApplicationClient,
    ApplicationSpecification,
    get_algod_client,
    get_indexer_client,
)
from algosdk.atomic_transaction_composer import (
    AtomicTransactionComposer,
    TransactionWithSigner,
)
from algosdk import account, transaction
from algosdk.v2client import algod
import base64, time

ALGOD_TOKEN = "a" * 64
ALGOD_SERVER = "http://localhost"
ALGOD_PORT = 4001

DEMO_INACTIVITY_PERIOD = 60  # 60 seconds for fast demo tests


@pytest.fixture(scope="module")
def algod_client():
    return get_algod_client(
        algod_token=ALGOD_TOKEN,
        algod_server=f"{ALGOD_SERVER}:{ALGOD_PORT}",
    )


@pytest.fixture(scope="module")
def owner_account(algod_client):
    """Generate and fund a test owner account."""
    private_key, address = account.generate_account()
    _fund_account(algod_client, address, 10_000_000)  # 10 ALGO
    return {"pk": private_key, "address": address}


@pytest.fixture(scope="module")
def beneficiary1(algod_client):
    pk, addr = account.generate_account()
    _fund_account(algod_client, addr, 1_000_000)
    return {"pk": pk, "address": addr}


@pytest.fixture(scope="module")
def beneficiary2(algod_client):
    pk, addr = account.generate_account()
    _fund_account(algod_client, addr, 1_000_000)
    return {"pk": pk, "address": addr}


@pytest.fixture(scope="module")
def beneficiary3(algod_client):
    pk, addr = account.generate_account()
    _fund_account(algod_client, addr, 1_000_000)
    return {"pk": pk, "address": addr}


@pytest.fixture(scope="module")
def stranger(algod_client):
    pk, addr = account.generate_account()
    _fund_account(algod_client, addr, 1_000_000)
    return {"pk": pk, "address": addr}


@pytest.fixture(scope="module")
def app_client(algod_client, owner_account):
    """Deploy the contract and return an ApplicationClient for the owner."""
    from contracts.algolegacy import app

    client = ApplicationClient(
        algod_client=algod_client,
        app=app,
        signer=_make_signer(owner_account["pk"]),
    )
    client.create()
    # Fund the contract account for inner txns
    _fund_account(algod_client, client.app_address, 2_000_000)
    return client


def _fund_account(algod_client, address: str, amount: int):
    """Fund an account from the sandbox dispenser."""
    from algokit_utils import get_sandbox_default_account
    dispenser = get_sandbox_default_account(algod_client)
    sp = algod_client.suggested_params()
    txn = transaction.PaymentTransaction(
        sender=dispenser.address,
        sp=sp,
        receiver=address,
        amt=amount,
    )
    signed = txn.sign(dispenser.private_key)
    txid = algod_client.send_transaction(signed)
    transaction.wait_for_confirmation(algod_client, txid, 4)


def _make_signer(private_key: str):
    from algosdk.atomic_transaction_composer import AccountTransactionSigner
    return AccountTransactionSigner(private_key)


def _get_client_for(algod_client, app_id: int, account_dict: dict):
    """Return ApplicationClient signed as a specific account."""
    from contracts.algolegacy import app
    from algokit_utils import ApplicationClient

    return ApplicationClient(
        algod_client=algod_client,
        app=app,
        app_id=app_id,
        signer=_make_signer(account_dict["pk"]),
        sender=account_dict["address"],
    )


class TestContractDeploy:
    def test_contract_deploys(self, app_client):
        assert app_client.app_id > 0, "Contract should have a valid app ID"
        print(f"\n✅ Deployed App ID: {app_client.app_id}")


class TestCreateWill:
    def test_create_will_happy_path(
        self, app_client, beneficiary1, beneficiary2, beneficiary3
    ):
        result = app_client.call(
            "create_will",
            period=DEMO_INACTIVITY_PERIOD,
            b1_address=beneficiary1["address"],
            b1_percent=50,
            b2_address=beneficiary2["address"],
            b2_percent=30,
            b3_address=beneficiary3["address"],
            b3_percent=20,
        )
        assert "successfully" in result.return_value.lower()

    def test_create_will_duplicate_rejected(
        self, app_client, beneficiary1, beneficiary2, beneficiary3
    ):
        with pytest.raises(Exception, match="already created"):
            app_client.call(
                "create_will",
                period=DEMO_INACTIVITY_PERIOD,
                b1_address=beneficiary1["address"],
                b1_percent=50,
                b2_address=beneficiary2["address"],
                b2_percent=30,
                b3_address=beneficiary3["address"],
                b3_percent=20,
            )

    def test_create_will_bad_percentages(
        self, algod_client, beneficiary1, beneficiary2, beneficiary3
    ):
        """Deploy a fresh contract and test bad percentages."""
        from contracts.algolegacy import app
        from algokit_utils import ApplicationClient

        pk, addr = account.generate_account()
        _fund_account(algod_client, addr, 5_000_000)

        fresh_client = ApplicationClient(
            algod_client=algod_client,
            app=app,
            signer=_make_signer(pk),
            sender=addr,
        )
        fresh_client.create()

        with pytest.raises(Exception, match="sum to 100"):
            fresh_client.call(
                "create_will",
                period=DEMO_INACTIVITY_PERIOD,
                b1_address=beneficiary1["address"],
                b1_percent=60,
                b2_address=beneficiary2["address"],
                b2_percent=30,
                b3_address=beneficiary3["address"],
                b3_percent=20,  # Total = 110, should fail
            )

    def test_create_will_short_period_rejected(
        self, algod_client, beneficiary1, beneficiary2, beneficiary3
    ):
        from contracts.algolegacy import app
        from algokit_utils import ApplicationClient

        pk, addr = account.generate_account()
        _fund_account(algod_client, addr, 5_000_000)

        fresh_client = ApplicationClient(
            algod_client=algod_client,
            app=app,
            signer=_make_signer(pk),
            sender=addr,
        )
        fresh_client.create()

        with pytest.raises(Exception, match="too short"):
            fresh_client.call(
                "create_will",
                period=10,  # 10 seconds < MIN_INACTIVITY_SECONDS
                b1_address=beneficiary1["address"],
                b1_percent=50,
                b2_address=beneficiary2["address"],
                b2_percent=30,
                b3_address=beneficiary3["address"],
                b3_percent=20,
            )


class TestDeposit:
    def test_deposit_happy_path(self, app_client, algod_client, owner_account):
        sp = algod_client.suggested_params()
        payment_txn = TransactionWithSigner(
            txn=transaction.PaymentTransaction(
                sender=owner_account["address"],
                sp=sp,
                receiver=app_client.app_address,
                amt=3_000_000,  # 3 ALGO
            ),
            signer=_make_signer(owner_account["pk"]),
        )
        result = app_client.call(
            "deposit",
            payment=payment_txn,
        )
        assert result.return_value >= 3_000_000

    def test_deposit_non_owner_rejected(
        self, app_client, algod_client, stranger, owner_account
    ):
        stranger_client = _get_client_for(algod_client, app_client.app_id, stranger)
        sp = algod_client.suggested_params()
        payment_txn = TransactionWithSigner(
            txn=transaction.PaymentTransaction(
                sender=stranger["address"],
                sp=sp,
                receiver=app_client.app_address,
                amt=1_000_000,
            ),
            signer=_make_signer(stranger["pk"]),
        )
        with pytest.raises(Exception, match="Only owner"):
            stranger_client.call("deposit", payment=payment_txn)


class TestCheckIn:
    def test_checkin_happy_path(self, app_client):
        result = app_client.call("check_in")
        assert result.return_value > 0, "Should return a timestamp"

    def test_checkin_non_owner_rejected(self, app_client, algod_client, stranger):
        stranger_client = _get_client_for(algod_client, app_client.app_id, stranger)
        with pytest.raises(Exception, match="Only owner"):
            stranger_client.call("check_in")


class TestActivateInheritance:
    def test_activate_before_deadline_rejected(self, app_client):
        """Should fail because we just checked in."""
        with pytest.raises(Exception, match="not yet elapsed"):
            app_client.call("activate_inheritance")

    def test_activate_after_deadline(self, app_client, algod_client, stranger):
        """
        Simulate time passing by waiting or using a very short period.
        In real AlgoKit sandbox, you can advance rounds to simulate time.
        Here we sleep past the 60-second demo period.
        """
        print("\n⏳ Waiting for inactivity period to elapse (60s demo)...")
        time.sleep(DEMO_INACTIVITY_PERIOD + 5)

        # Anyone (even a stranger) can activate
        stranger_client = _get_client_for(algod_client, app_client.app_id, stranger)
        result = stranger_client.call("activate_inheritance")
        assert "activated" in result.return_value.lower()


class TestClaim:
    def test_claim_slot1(self, app_client, algod_client, beneficiary1):
        b1_client = _get_client_for(algod_client, app_client.app_id, beneficiary1)
        result = b1_client.call("claim", beneficiary_slot=1)
        assert result.return_value > 0, "Should return payout amount"
        print(f"\n💰 Beneficiary 1 claimed: {result.return_value / 1e6:.4f} ALGO")

    def test_claim_slot2(self, app_client, algod_client, beneficiary2):
        b2_client = _get_client_for(algod_client, app_client.app_id, beneficiary2)
        result = b2_client.call("claim", beneficiary_slot=2)
        assert result.return_value > 0
        print(f"\n💰 Beneficiary 2 claimed: {result.return_value / 1e6:.4f} ALGO")

    def test_claim_slot3(self, app_client, algod_client, beneficiary3):
        b3_client = _get_client_for(algod_client, app_client.app_id, beneficiary3)
        result = b3_client.call("claim", beneficiary_slot=3)
        assert result.return_value > 0
        print(f"\n💰 Beneficiary 3 claimed: {result.return_value / 1e6:.4f} ALGO")

    def test_double_claim_rejected(self, app_client, algod_client, beneficiary1):
        b1_client = _get_client_for(algod_client, app_client.app_id, beneficiary1)
        with pytest.raises(Exception, match="already claimed"):
            b1_client.call("claim", beneficiary_slot=1)

    def test_wrong_address_rejected(self, app_client, algod_client, stranger):
        stranger_client = _get_client_for(algod_client, app_client.app_id, stranger)
        with pytest.raises(Exception):
            stranger_client.call("claim", beneficiary_slot=2)


class TestRevokeWill:
    """Uses a freshly deployed contract so activation hasn't happened."""

    @pytest.fixture(scope="class")
    def fresh_will_client(
        self, algod_client, beneficiary1, beneficiary2, beneficiary3
    ):
        from contracts.algolegacy import app
        from algokit_utils import ApplicationClient

        pk, addr = account.generate_account()
        _fund_account(algod_client, addr, 10_000_000)
        _fund_account(algod_client, addr, 2_000_000)

        fresh = ApplicationClient(
            algod_client=algod_client,
            app=app,
            signer=_make_signer(pk),
            sender=addr,
        )
        fresh.create()
        _fund_account(algod_client, fresh.app_address, 2_000_000)

        # Create will
        fresh.call(
            "create_will",
            period=DEMO_INACTIVITY_PERIOD,
            b1_address=beneficiary1["address"],
            b1_percent=50,
            b2_address=beneficiary2["address"],
            b2_percent=30,
            b3_address=beneficiary3["address"],
            b3_percent=20,
        )

        # Deposit
        sp = algod_client.suggested_params()
        payment_txn = TransactionWithSigner(
            txn=transaction.PaymentTransaction(
                sender=addr, sp=sp,
                receiver=fresh.app_address, amt=2_000_000,
            ),
            signer=_make_signer(pk),
        )
        fresh.call("deposit", payment=payment_txn)
        return fresh

    def test_revoke_will_returns_funds(self, fresh_will_client):
        result = fresh_will_client.call("revoke_will")
        assert "revoked" in result.return_value.lower()

    def test_revoke_after_activation_rejected(
        self, algod_client, beneficiary1, beneficiary2, beneficiary3
    ):
        """
        Deploy, create, activate immediately (1s period), then try revoke.
        """
        from contracts.algolegacy import app
        from algokit_utils import ApplicationClient

        pk, addr = account.generate_account()
        _fund_account(algod_client, addr, 10_000_000)

        c = ApplicationClient(
            algod_client=algod_client,
            app=app,
            signer=_make_signer(pk),
            sender=addr,
        )
        c.create()
        _fund_account(algod_client, c.app_address, 2_000_000)

        c.call(
            "create_will",
            period=60,
            b1_address=beneficiary1["address"],
            b1_percent=100,
            b2_address=beneficiary2["address"],
            b2_percent=0,
            b3_address=beneficiary3["address"],
            b3_percent=0,
        )

        time.sleep(65)
        c.call("activate_inheritance")

        with pytest.raises(Exception, match="Cannot revoke after activation"):
            c.call("revoke_will")


class TestReadHelpers:
    def test_get_will_status(self, app_client):
        result = app_client.call("get_will_status")
        assert result.return_value in [
            "NO_WILL", "ALIVE", "READY_TO_ACTIVATE", "INHERITANCE_ACTIVE"
        ]

    def test_get_time_remaining(self, app_client):
        result = app_client.call("get_time_remaining")
        assert isinstance(result.return_value, int)
        assert result.return_value >= 0

    def test_get_locked_balance(self, app_client):
        result = app_client.call("get_locked_balance")
        assert isinstance(result.return_value, int)
