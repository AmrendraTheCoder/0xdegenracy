// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title GameToken — a Reachy memecoin that ships with a playable game.
/// @notice The whole fixed supply is minted to this contract at deploy. Buyers send MON to `buy()`
///         and receive tokens from that reserve at a linear price. There is no mint function after
///         deploy and no sell function in the MVP (testnet only).
///
/// Pricing (all quantities in WHOLE tokens, 1 token = 1e18 units):
///   price(s)        = P0 + K * s                     wei per whole token, s = whole tokens sold so far
///   cost(s, n)      = n * P0 + K * (n * (2s + n)) / 2  wei to buy n tokens starting at s
///   given budget v  : largest n with cost(s, n) <= v, solved with the quadratic formula:
///                     n = (sqrt(b^2 + 2Kv) - b) / K, where b = P0 + K*s
/// A 1% fee on each buy is paid to `creator`; the rest stays in this contract as the curve reserve.
contract GameToken is ERC20, ReentrancyGuard {
    uint256 public constant TOTAL_SUPPLY_WHOLE = 1_000_000_000; // 1B tokens
    uint256 public constant FEE_BPS = 100; // 1%
    uint256 private constant BPS = 10_000;

    /// @notice Starting price in wei per whole token.
    uint256 public immutable basePrice;
    /// @notice Price increase in wei per whole token sold.
    uint256 public immutable slope;

    address public immutable creator;
    address public immutable factory;
    uint256 public immutable gameId;
    string public imageURI;
    string public configURI;

    /// @notice Whole tokens sold through the curve.
    uint256 public sold;
    /// @notice Creator fees that could not be pushed (e.g. creator is a contract that reverts).
    uint256 public pendingCreatorFees;

    event Bought(address indexed buyer, uint256 tokensWhole, uint256 cost, uint256 fee, uint256 newPrice);
    event CreatorFeesClaimed(address indexed creator, uint256 amount);

    error ZeroValue();
    error SoldOut();
    error Slippage(uint256 tokensOut, uint256 minTokensOut);
    error TransferFailed();

    constructor(
        string memory name_,
        string memory symbol_,
        string memory imageURI_,
        string memory configURI_,
        address creator_,
        uint256 gameId_,
        uint256 basePrice_,
        uint256 slope_
    ) ERC20(name_, symbol_) {
        require(creator_ != address(0), "creator=0");
        require(slope_ > 0, "slope=0");
        creator = creator_;
        factory = msg.sender;
        gameId = gameId_;
        imageURI = imageURI_;
        configURI = configURI_;
        basePrice = basePrice_;
        slope = slope_;
        _mint(address(this), TOTAL_SUPPLY_WHOLE * 1e18);
    }

    // ---------------------------------------------------------------- views

    /// @notice Current marginal price in wei per whole token.
    function currentPrice() public view returns (uint256) {
        return basePrice + slope * sold;
    }

    /// @notice Cost in wei (before fee) to buy `n` whole tokens at the current point on the curve.
    function costFor(uint256 n) public view returns (uint256) {
        return _cost(sold, n);
    }

    /// @notice Whole tokens received for `valueWei` (fee included), plus the MON actually spent.
    function quote(uint256 valueWei) public view returns (uint256 tokensWhole, uint256 spent, uint256 fee) {
        fee = (valueWei * FEE_BPS) / BPS;
        uint256 budget = valueWei - fee;
        tokensWhole = _tokensFor(sold, budget);
        uint256 remaining = TOTAL_SUPPLY_WHOLE - sold;
        if (tokensWhole > remaining) tokensWhole = remaining;
        spent = _cost(sold, tokensWhole);
        // Fee is charged on what is actually spent, not on the refunded remainder.
        fee = (spent * FEE_BPS) / (BPS - FEE_BPS);
    }

    // ---------------------------------------------------------------- buy

    /// @notice Buy as many whole tokens as `msg.value` affords. Any unspent MON is refunded.
    /// @param minTokensOut Revert if fewer whole tokens would be received (slippage guard).
    function buy(uint256 minTokensOut) external payable nonReentrant returns (uint256 tokensWhole) {
        if (msg.value == 0) revert ZeroValue();
        if (sold >= TOTAL_SUPPLY_WHOLE) revert SoldOut();

        uint256 spent;
        uint256 fee;
        (tokensWhole, spent, fee) = quote(msg.value);
        if (tokensWhole == 0 || tokensWhole < minTokensOut) revert Slippage(tokensWhole, minTokensOut);

        sold += tokensWhole;
        _transfer(address(this), msg.sender, tokensWhole * 1e18);

        uint256 refund = msg.value - spent - fee;
        emit Bought(msg.sender, tokensWhole, spent, fee, currentPrice());

        // Push the creator fee; if the creator cannot receive, keep it claimable instead of reverting buys.
        if (fee > 0) {
            (bool ok,) = creator.call{value: fee}("");
            if (!ok) pendingCreatorFees += fee;
        }
        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            if (!ok) revert TransferFailed();
        }
    }

    function claimCreatorFees() external nonReentrant {
        uint256 amount = pendingCreatorFees;
        pendingCreatorFees = 0;
        (bool ok,) = creator.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit CreatorFeesClaimed(creator, amount);
    }

    // ---------------------------------------------------------------- math

    function _cost(uint256 s, uint256 n) internal view returns (uint256) {
        return n * basePrice + (slope * n * (2 * s + n)) / 2;
    }

    function _tokensFor(uint256 s, uint256 budget) internal view returns (uint256 n) {
        uint256 b = basePrice + slope * s;
        n = (Math.sqrt(b * b + 2 * slope * budget) - b) / slope;
        // Integer rounding (sqrt floor and the /2 in _cost) can be off by one; correct it.
        while (n > 0 && _cost(s, n) > budget) n--;
    }
}
