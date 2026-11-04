// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IGameTokenRegistry {
    function isGameToken(address token) external view returns (bool);
}

/// @title PrizePool — daily trading leaderboard funded by Reachy trading fees.
/// @notice Every GameToken trade sends 1% of its MON value here and records the trader's volume for the
///         current UTC day. The contract keeps that day's top 10 traders on-chain. Once the day is over,
///         anyone can call `settle(day)` to pay out:
///             1st 25% · 2nd 18% · 3rd 15% · 4th 12% · 5th 10% · 6th 8% · 7th 6% · 8th 4% · 9th 1% · 10th 1%
///         Shares for empty ranks (fewer than 10 traders) roll over into the pool of the day `settle` runs.
///         Volume is measured on-chain, so nobody can report a fake score. Wash trading is unprofitable:
///         every trade pays a 2% fee and at most 25% of a day's pool comes back to one trader.
contract PrizePool is ReentrancyGuard {
    uint256 public constant TOP = 10;
    uint256 private constant BPS = 10_000;

    struct Entry {
        address user;
        uint96 volume; // MON wei; 7.9e28 cap is far beyond any realistic daily volume
    }

    address public immutable factory;

    mapping(uint256 day => uint256) public poolOf;
    mapping(uint256 day => mapping(address user => uint256)) public volumeOf;
    mapping(uint256 day => Entry[10]) internal _top;
    mapping(uint256 day => bool) public settled;
    /// @notice Prizes whose push transfer failed; the winner pulls them with `claim()`.
    mapping(address user => uint256) public claimable;

    event TradeRecorded(uint256 indexed day, address indexed trader, uint256 volume, uint256 dayVolume, uint256 fee);
    event Funded(uint256 indexed day, address indexed from, uint256 amount);
    event PrizePaid(uint256 indexed day, uint256 rank, address indexed winner, uint256 amount, bool pushed);
    event DaySettled(uint256 indexed day, uint256 pool, uint256 paid, uint256 rolledOver, uint256 intoDay);
    event Claimed(address indexed user, uint256 amount);

    error NotGameToken();
    error DayNotOver();
    error AlreadySettled();
    error NothingToClaim();
    error TransferFailed();

    constructor(address factory_) {
        factory = factory_;
    }

    // ---------------------------------------------------------------- views

    function currentDay() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    /// @notice Basis points paid to rank `i` (0-based).
    function shareBps(uint256 i) public pure returns (uint256) {
        if (i == 0) return 2500;
        if (i == 1) return 1800;
        if (i == 2) return 1500;
        if (i == 3) return 1200;
        if (i == 4) return 1000;
        if (i == 5) return 800;
        if (i == 6) return 600;
        if (i == 7) return 400;
        if (i < TOP) return 100;
        return 0;
    }

    function getTop(uint256 day) external view returns (Entry[10] memory) {
        return _top[day];
    }

    // ---------------------------------------------------------------- funding

    /// @notice Called by GameTokens on every trade with the pool's share of the fee.
    function record(address trader, uint256 volume) external payable {
        if (!IGameTokenRegistry(factory).isGameToken(msg.sender)) revert NotGameToken();
        uint256 day = currentDay();
        poolOf[day] += msg.value;
        uint256 dayVolume = volumeOf[day][trader] + volume;
        volumeOf[day][trader] = dayVolume;
        _updateTop(day, trader, dayVolume);
        emit TradeRecorded(day, trader, volume, dayVolume, msg.value);
    }

    /// @notice Anyone can top up today's pool (sponsors, the platform).
    receive() external payable {
        uint256 day = currentDay();
        poolOf[day] += msg.value;
        emit Funded(day, msg.sender, msg.value);
    }

    // ---------------------------------------------------------------- settlement

    /// @notice Pays out a finished day's pool to its top 10. Permissionless.
    function settle(uint256 day) external nonReentrant {
        if (day >= currentDay()) revert DayNotOver();
        if (settled[day]) revert AlreadySettled();
        settled[day] = true;

        uint256 amount = poolOf[day];
        uint256 paid;
        Entry[10] storage top = _top[day];
        for (uint256 i = 0; i < TOP; i++) {
            address winner = top[i].user;
            if (winner == address(0)) break;
            uint256 prize = (amount * shareBps(i)) / BPS;
            if (prize == 0) continue;
            paid += prize;
            // Limited gas so a winner contract cannot grief settlement; failures become claimable.
            (bool ok,) = winner.call{value: prize, gas: 50_000}("");
            if (!ok) claimable[winner] += prize;
            emit PrizePaid(day, i + 1, winner, prize, ok);
        }

        uint256 leftover = amount - paid;
        uint256 today = currentDay();
        if (leftover > 0) poolOf[today] += leftover;
        emit DaySettled(day, amount, paid, leftover, today);
    }

    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Claimed(msg.sender, amount);
    }

    // ---------------------------------------------------------------- leaderboard

    /// @dev Keeps `_top[day]` sorted by volume, descending. One slot per entry, so a trade costs at most
    ///      10 reads plus the few writes needed to move the trader up.
    function _updateTop(uint256 day, address trader, uint256 dayVolume) internal {
        Entry[10] storage top = _top[day];
        uint96 v = dayVolume > type(uint96).max ? type(uint96).max : uint96(dayVolume);

        // Find the trader's current slot, or the first empty slot.
        uint256 idx = TOP;
        uint256 firstEmpty = TOP;
        for (uint256 i = 0; i < TOP; i++) {
            address u = top[i].user;
            if (u == trader) {
                idx = i;
                break;
            }
            if (u == address(0)) {
                firstEmpty = i;
                break;
            }
        }
        if (idx == TOP) {
            if (firstEmpty < TOP) idx = firstEmpty;
            else if (v > top[TOP - 1].volume) idx = TOP - 1; // bump the 10th place
            else return;
        }

        // Bubble up while the entry above has less volume.
        while (idx > 0 && top[idx - 1].volume < v) {
            top[idx] = top[idx - 1];
            idx--;
        }
        top[idx] = Entry(trader, v);
    }
}
