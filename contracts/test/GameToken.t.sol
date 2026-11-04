// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {GameTokenFactory} from "../src/GameTokenFactory.sol";
import {GameToken} from "../src/GameToken.sol";

contract RevertingCreator {
    receive() external payable {
        revert("no");
    }
}

contract GameTokenTest is Test {
    GameTokenFactory factory;
    address creator = makeAddr("creator");
    address alice = makeAddr("alice");

    function setUp() public {
        factory = new GameTokenFactory();
        vm.deal(alice, 100 ether);
    }

    function _launch(address c) internal returns (GameToken) {
        return GameToken(factory.launch("Monkey Banana Coin", "MNKY", "ipfs://img", "https://cfg", c));
    }

    function test_launchRecordsAndEmits() public {
        vm.expectEmit(false, true, false, true);
        emit GameTokenFactory.GameLaunched(address(0), creator, "Monkey Banana Coin", "MNKY", "ipfs://img", "https://cfg", 0);
        GameToken t = _launch(creator);
        assertEq(factory.tokenCount(), 1);
        assertTrue(factory.isGameToken(address(t)));
        assertEq(t.creator(), creator);
        assertEq(t.balanceOf(address(t)), 1_000_000_000e18);
        assertEq(t.imageURI(), "ipfs://img");
    }

    function test_launchDefaultsCreatorToSender() public {
        GameToken t = _launch(address(0));
        assertEq(t.creator(), address(this));
    }

    function test_launchRejectsBadSymbol() public {
        vm.expectRevert("bad symbol");
        factory.launch("x", "AB", "", "", creator);
    }

    function test_buyTransfersTokensPaysFeeAndRefunds() public {
        GameToken t = _launch(creator);
        uint256 value = 0.01 ether;
        (uint256 expected, uint256 spent, uint256 fee) = t.quote(value);

        vm.prank(alice);
        uint256 got = t.buy{value: value}(0);

        assertEq(got, expected);
        assertGt(got, 0);
        assertEq(t.balanceOf(alice), got * 1e18);
        assertEq(creator.balance, fee);
        assertEq(address(t).balance, spent);
        assertEq(alice.balance, 100 ether - spent - fee);
        assertLe(spent + fee, value);
    }

    function test_priceRisesWithSales() public {
        GameToken t = _launch(creator);
        uint256 p0 = t.currentPrice();
        vm.prank(alice);
        t.buy{value: 0.01 ether}(0);
        assertGt(t.currentPrice(), p0);

        // Same spend buys fewer tokens later on the curve.
        (uint256 later,,) = t.quote(0.01 ether);
        assertLt(later, t.sold());
    }

    function test_slippageReverts() public {
        GameToken t = _launch(creator);
        (uint256 expected,,) = t.quote(0.01 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GameToken.Slippage.selector, expected, expected + 1));
        t.buy{value: 0.01 ether}(expected + 1);
    }

    function test_zeroValueReverts() public {
        GameToken t = _launch(creator);
        vm.expectRevert(GameToken.ZeroValue.selector);
        t.buy{value: 0}(0);
    }

    function test_revertingCreatorAccruesFee() public {
        RevertingCreator rc = new RevertingCreator();
        GameToken t = _launch(address(rc));
        vm.prank(alice);
        t.buy{value: 0.01 ether}(0);
        assertGt(t.pendingCreatorFees(), 0);
    }

    function test_canBuyEntireSupplyAndThenSoldOut() public {
        GameToken t = _launch(creator);
        vm.prank(alice);
        t.buy{value: 10 ether}(0);
        assertEq(t.sold(), t.TOTAL_SUPPLY_WHOLE());
        assertEq(t.balanceOf(address(t)), 0);
        vm.prank(alice);
        vm.expectRevert(GameToken.SoldOut.selector);
        t.buy{value: 1 ether}(0);
    }

    function testFuzz_costNeverExceedsBudget(uint96 value) public {
        vm.assume(value > 0);
        GameToken t = _launch(creator);
        vm.deal(alice, uint256(value));
        (uint256 n, uint256 spent, uint256 fee) = t.quote(value);
        assertLe(spent + fee, uint256(value));
        if (n > 0 && n < t.TOTAL_SUPPLY_WHOLE()) {
            // One more token must not fit in the budget (n is maximal).
            assertGt(t.costFor(n + 1), uint256(value) - (uint256(value) / 100));
        }
    }
}
