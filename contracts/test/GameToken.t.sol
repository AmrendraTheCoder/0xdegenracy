// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {GameTokenFactory} from "../src/GameTokenFactory.sol";
import {GameToken} from "../src/GameToken.sol";
import {PrizePool} from "../src/PrizePool.sol";

contract RevertingReceiver {
    receive() external payable {
        revert("no");
    }
}

contract GameTokenTest is Test {
    GameTokenFactory factory;
    PrizePool pool;
    address creator = makeAddr("creator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        vm.warp(100 days);
        factory = new GameTokenFactory();
        pool = factory.prizePool();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _launch(address c) internal returns (GameToken) {
        return GameToken(factory.launch("Monkey Banana Coin", "MNKY", "ipfs://img", "https://cfg", c));
    }

    // ---------------------------------------------------------------- launch

    function test_launchRecordsAndEmits() public {
        vm.expectEmit(false, true, false, true);
        emit GameTokenFactory.GameLaunched(address(0), creator, "Monkey Banana Coin", "MNKY", "ipfs://img", "https://cfg", 0);
        GameToken t = _launch(creator);
        assertEq(factory.tokenCount(), 1);
        assertTrue(factory.isGameToken(address(t)));
        assertEq(address(t.prizePool()), address(pool));
        assertEq(t.creator(), creator);
        assertEq(t.balanceOf(address(t)), 1_000_000_000e18);
    }

    function test_launchDefaultsCreatorToSender() public {
        assertEq(_launch(address(0)).creator(), address(this));
    }

    function test_launchRejectsBadSymbol() public {
        vm.expectRevert("bad symbol");
        factory.launch("x", "AB", "", "", creator);
    }

    // ---------------------------------------------------------------- buy

    function test_buySplitsFeeAndRefunds() public {
        GameToken t = _launch(creator);
        uint256 value = 0.01 ether;
        (uint256 expected, uint256 spent, uint256 fee) = t.quoteBuy(value);

        vm.prank(alice);
        uint256 got = t.buy{value: value}(0);

        assertEq(got, expected);
        assertEq(t.balanceOf(alice), got * 1e18);
        assertEq(t.reserve(), spent);
        assertEq(creator.balance, fee / 2);
        assertEq(address(pool).balance, fee - fee / 2);
        assertEq(alice.balance, 100 ether - spent - fee);
        assertLe(spent + fee, value);
        assertEq(pool.volumeOf(pool.currentDay(), alice), spent);
    }

    function test_priceRisesWithBuysAndFallsWithSells() public {
        GameToken t = _launch(creator);
        uint256 p0 = t.currentPrice();
        vm.prank(alice);
        uint256 got = t.buy{value: 0.01 ether}(0);
        uint256 p1 = t.currentPrice();
        assertGt(p1, p0);
        vm.prank(alice);
        t.sell(got / 2, 0);
        assertLt(t.currentPrice(), p1);
    }

    function test_buySlippageReverts() public {
        GameToken t = _launch(creator);
        (uint256 expected,,) = t.quoteBuy(0.01 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GameToken.Slippage.selector, expected, expected + 1));
        t.buy{value: 0.01 ether}(expected + 1);
    }

    function test_canBuyEntireSupplyThenSoldOut() public {
        GameToken t = _launch(creator);
        vm.prank(alice);
        t.buy{value: 10 ether}(0);
        assertEq(t.sold(), t.TOTAL_SUPPLY_WHOLE());
        vm.prank(alice);
        vm.expectRevert(GameToken.SoldOut.selector);
        t.buy{value: 1 ether}(0);
    }

    // ---------------------------------------------------------------- sell

    function test_sellReturnsMonAlongCurve() public {
        GameToken t = _launch(creator);
        vm.prank(alice);
        uint256 got = t.buy{value: 0.01 ether}(0);
        (uint256 gross, uint256 fee, uint256 net) = t.quoteSell(got);
        uint256 before = alice.balance;

        vm.prank(alice);
        uint256 out = t.sell(got, net);

        assertEq(out, net);
        assertEq(alice.balance, before + net);
        assertEq(t.balanceOf(alice), 0);
        assertEq(t.sold(), 0);
        assertLe(t.reserve(), 1); // only round-up dust from the buy stays behind
        assertLe(gross, 0.01 ether);
        assertEq(fee, (gross * 200) / 10_000);
    }

    function test_roundTripLosesOnlyFees() public {
        GameToken t = _launch(creator);
        vm.startPrank(alice);
        uint256 got = t.buy{value: 0.01 ether}(0);
        t.sell(got, 0);
        vm.stopPrank();
        uint256 lost = 100 ether - alice.balance;
        // ~2% in, ~2% out, plus wei-level rounding.
        assertApproxEqRel(lost, 0.0004 ether, 0.02e18);
    }

    function test_sellMoreThanBalanceReverts() public {
        GameToken t = _launch(creator);
        vm.prank(alice);
        uint256 got = t.buy{value: 0.01 ether}(0);
        vm.prank(bob);
        vm.expectRevert(GameToken.InsufficientBalance.selector);
        t.sell(got, 0);
    }

    function test_sellSlippageReverts() public {
        GameToken t = _launch(creator);
        vm.prank(alice);
        uint256 got = t.buy{value: 0.01 ether}(0);
        (,, uint256 net) = t.quoteSell(got);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GameToken.Slippage.selector, net, net + 1));
        t.sell(got, net + 1);
    }

    function test_zeroAmountsRevert() public {
        GameToken t = _launch(creator);
        vm.expectRevert(GameToken.ZeroAmount.selector);
        t.buy{value: 0}(0);
        vm.expectRevert(GameToken.ZeroAmount.selector);
        t.sell(0, 0);
    }

    function test_revertingCreatorAccruesFee() public {
        RevertingReceiver rc = new RevertingReceiver();
        GameToken t = _launch(address(rc));
        vm.prank(alice);
        t.buy{value: 0.01 ether}(0);
        assertGt(t.pendingCreatorFees(), 0);
    }

    /// Random interleaved buys and sells: the reserve must always cover selling everything back.
    function testFuzz_reserveAlwaysSolvent(uint64[8] memory amounts, bool[8] memory isSell) public {
        GameToken t = _launch(creator);
        address[2] memory users = [alice, bob];
        for (uint256 i = 0; i < 8; i++) {
            address u = users[i % 2];
            uint256 bal = t.balanceOf(u) / 1e18;
            if (isSell[i] && bal > 0) {
                vm.prank(u);
                t.sell((uint256(amounts[i]) % bal) + 1, 0);
            } else {
                uint256 v = (uint256(amounts[i]) % 1 ether) + 1e12;
                if (t.sold() < t.TOTAL_SUPPLY_WHOLE()) {
                    (uint256 n,,) = t.quoteBuy(v);
                    vm.prank(u); // prank applies to the next call only, so set it right before the trade
                    if (n > 0) t.buy{value: v}(0);
                }
            }
            (uint256 grossAll,,) = t.quoteSell(t.sold());
            assertGe(t.reserve(), grossAll, "reserve short of curve");
            assertGe(address(t).balance, t.reserve(), "balance short of reserve");
        }
        // Everyone can exit.
        for (uint256 j = 0; j < 2; j++) {
            uint256 bal = t.balanceOf(users[j]) / 1e18;
            if (bal > 0) {
                vm.prank(users[j]);
                t.sell(bal, 0);
            }
        }
        assertEq(t.sold(), 0);
    }

    function testFuzz_buyCostNeverExceedsBudget(uint96 value) public {
        vm.assume(value > 0);
        GameToken t = _launch(creator);
        (uint256 n, uint256 spent, uint256 fee) = t.quoteBuy(value);
        assertLe(spent + fee, uint256(value));
        if (n > 0 && n < t.TOTAL_SUPPLY_WHOLE()) {
            assertGt(t.costFor(n + 1), uint256(value) - (uint256(value) * 200) / 10_000);
        }
    }
}
