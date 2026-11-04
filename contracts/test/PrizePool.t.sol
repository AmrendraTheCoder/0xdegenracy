// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {GameTokenFactory} from "../src/GameTokenFactory.sol";
import {GameToken} from "../src/GameToken.sol";
import {PrizePool} from "../src/PrizePool.sol";

contract RevertingWinner {
    GameToken t;

    constructor(GameToken t_) payable {
        t = t_;
    }

    function trade() external {
        t.buy{value: address(this).balance}(0);
    }

    receive() external payable {
        if (msg.sender != address(t)) revert("no prizes please");
    }
}

contract PrizePoolTest is Test {
    GameTokenFactory factory;
    PrizePool pool;
    GameToken t;
    address[] traders;

    function setUp() public {
        vm.warp(100 days + 1 hours);
        factory = new GameTokenFactory();
        pool = factory.prizePool();
        t = GameToken(factory.launch("Coin", "COIN", "", "", makeAddr("creator")));
        for (uint256 i = 0; i < 12; i++) {
            address a = makeAddr(string(abi.encodePacked("trader", vm.toString(i))));
            vm.deal(a, 10 ether);
            traders.push(a);
        }
    }

    function _buy(address who, uint256 value) internal {
        vm.prank(who);
        t.buy{value: value}(0);
    }

    function test_onlyGameTokensCanRecord() public {
        vm.expectRevert(PrizePool.NotGameToken.selector);
        pool.record{value: 1}(address(this), 100);
    }

    function test_topTenIsSortedByVolume() public {
        // trader i buys (i+1) * 0.001 MON, in shuffled order.
        uint256[12] memory order = [uint256(5), 0, 11, 3, 8, 1, 10, 2, 7, 4, 9, 6];
        for (uint256 k = 0; k < 12; k++) {
            _buy(traders[order[k]], (order[k] + 1) * 0.001 ether);
        }
        PrizePool.Entry[10] memory top = pool.getTop(pool.currentDay());
        for (uint256 i = 0; i < 10; i++) {
            assertEq(top[i].user, traders[11 - i], "wrong rank");
            if (i > 0) assertGe(top[i - 1].volume, top[i].volume);
        }
    }

    function test_repeatTradesAccumulateAndClimb() public {
        _buy(traders[0], 0.005 ether);
        _buy(traders[1], 0.003 ether);
        assertEq(pool.getTop(pool.currentDay())[0].user, traders[0]);
        _buy(traders[1], 0.004 ether); // 0.007 total > 0.005
        PrizePool.Entry[10] memory top = pool.getTop(pool.currentDay());
        assertEq(top[0].user, traders[1]);
        assertEq(top[1].user, traders[0]);
        assertEq(top[2].user, address(0));
    }

    function test_sellsCountAsVolume() public {
        vm.startPrank(traders[0]);
        uint256 got = t.buy{value: 0.01 ether}(0);
        uint256 afterBuy = pool.volumeOf(pool.currentDay(), traders[0]);
        t.sell(got, 0);
        vm.stopPrank();
        assertGt(pool.volumeOf(pool.currentDay(), traders[0]), afterBuy);
    }

    function test_settlePaysExactSharesToTopTen() public {
        for (uint256 i = 0; i < 10; i++) {
            _buy(traders[i], (10 - i) * 0.01 ether); // traders[0] has the most volume
        }
        uint256 day = pool.currentDay();
        uint256 amount = pool.poolOf(day);
        assertGt(amount, 0);

        uint256[10] memory before;
        for (uint256 i = 0; i < 10; i++) before[i] = traders[i].balance;

        vm.expectRevert(PrizePool.DayNotOver.selector);
        pool.settle(day);

        vm.warp(block.timestamp + 1 days);
        pool.settle(day);

        uint16[10] memory shares = [2500, 1800, 1500, 1200, 1000, 800, 600, 400, 100, 100];
        uint256 paid;
        for (uint256 i = 0; i < 10; i++) {
            uint256 expected = (amount * shares[i]) / 10_000;
            assertEq(traders[i].balance - before[i], expected, "wrong prize");
            paid += expected;
        }
        // Shares sum to 100%; only integer dust rolls over.
        assertLe(amount - paid, 10);
        assertEq(pool.poolOf(day + 1), amount - paid);

        vm.expectRevert(PrizePool.AlreadySettled.selector);
        pool.settle(day);
    }

    function test_unfilledRanksRollOver() public {
        _buy(traders[0], 0.02 ether);
        _buy(traders[1], 0.01 ether);
        uint256 day = pool.currentDay();
        uint256 amount = pool.poolOf(day);
        vm.warp(block.timestamp + 1 days);
        pool.settle(day);
        uint256 paid = (amount * 2500) / 10_000 + (amount * 1800) / 10_000;
        assertEq(pool.poolOf(day + 1), amount - paid); // 57% carried into the new day
    }

    function test_failedPrizeBecomesClaimable() public {
        RevertingWinner w = new RevertingWinner{value: 1 ether}(t);
        w.trade();
        uint256 day = pool.currentDay();
        vm.warp(block.timestamp + 1 days);
        pool.settle(day);
        assertGt(pool.claimable(address(w)), 0);
    }

    function test_donationsFundToday() public {
        (bool ok,) = address(pool).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(pool.poolOf(pool.currentDay()), 1 ether);
    }
}
