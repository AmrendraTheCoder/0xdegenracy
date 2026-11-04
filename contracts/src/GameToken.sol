// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IPrizePool {
    function record(address trader, uint256 volume) external payable;
}

/// @title GameToken — a Reachy memecoin that ships with a playable game.
/// @notice The whole fixed supply is minted to this contract at deploy. Buyers send MON to `buy()` and
///         sellers return tokens with `sell()`, both along the same linear bonding curve. There is no
///         mint after deploy. Testnet only.
///
/// Linear bonding curve (all quantities in WHOLE tokens, 1 token = 1e18 units):
///   price(s)     = P0 + K * s                         wei per whole token, s = whole tokens sold
///   cost(s, n)   = n * P0 + K * n * (2s + n) / 2      area under the curve from s to s + n
///   buy  n at s  : pay cost(s, n), rounded UP   (the reserve never ends up short)
///   sell n at s  : get cost(s - n, n), rounded DOWN
/// `reserve` always holds at least the area under the curve for `sold`, so every holder can sell.
///
/// Fees: 2% of each trade's MON value. 1% to the creator, 1% to the Reachy PrizePool, which pays the
/// day's top 10 traders by volume.
contract GameToken is ERC20, ReentrancyGuard {
    uint256 public constant TOTAL_SUPPLY_WHOLE = 1_000_000_000; // 1B tokens
    uint256 public constant CREATOR_FEE_BPS = 100; // 1%
    uint256 public constant POOL_FEE_BPS = 100; // 1%
    uint256 public constant FEE_BPS = CREATOR_FEE_BPS + POOL_FEE_BPS; // 2%
    uint256 private constant BPS = 10_000;

    uint256 public immutable basePrice;
    uint256 public immutable slope;
    address public immutable creator;
    address public immutable factory;
    IPrizePool public immutable prizePool;
    uint256 public immutable gameId;
    string public imageURI;
    string public configURI;

    /// @notice Whole tokens currently sold (held outside this contract).
    uint256 public sold;
    /// @notice MON backing the curve. Equals the sum of buy costs minus sell proceeds.
    uint256 public reserve;
    /// @notice Creator fees that could not be pushed (e.g. creator is a contract that reverts).
    uint256 public pendingCreatorFees;

    event Bought(address indexed buyer, uint256 tokensWhole, uint256 cost, uint256 fee, uint256 newPrice);
    event Sold(address indexed seller, uint256 tokensWhole, uint256 proceeds, uint256 fee, uint256 newPrice);
    event CreatorFeesClaimed(address indexed creator, uint256 amount);

    error ZeroAmount();
    error SoldOut();
    error Slippage(uint256 got, uint256 minimum);
    error InsufficientBalance();
    error TransferFailed();

    constructor(
        string memory name_,
        string memory symbol_,
        string memory imageURI_,
        string memory configURI_,
        address creator_,
        uint256 gameId_,
        uint256 basePrice_,
        uint256 slope_,
        address prizePool_
    ) ERC20(name_, symbol_) {
        require(creator_ != address(0), "creator=0");
        require(prizePool_ != address(0), "pool=0");
        require(slope_ > 0, "slope=0");
        creator = creator_;
        factory = msg.sender;
        prizePool = IPrizePool(prizePool_);
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

    /// @notice MON (before fee) to buy `n` whole tokens now.
    function costFor(uint256 n) public view returns (uint256) {
        return _costUp(sold, n);
    }

    /// @notice Whole tokens received for `valueWei` (fee included), the MON spent on the curve and the fee.
    function quoteBuy(uint256 valueWei) public view returns (uint256 tokensWhole, uint256 spent, uint256 fee) {
        uint256 budget = valueWei - (valueWei * FEE_BPS) / BPS;
        tokensWhole = _tokensFor(sold, budget);
        uint256 remaining = TOTAL_SUPPLY_WHOLE - sold;
        if (tokensWhole > remaining) tokensWhole = remaining;
        spent = _costUp(sold, tokensWhole);
        // Fee is charged on what is actually spent, not on the refunded remainder.
        fee = (spent * FEE_BPS) / (BPS - FEE_BPS);
    }

    /// @notice MON from selling `tokensWhole` now: gross curve value, fee, and what the seller receives.
    function quoteSell(uint256 tokensWhole) public view returns (uint256 gross, uint256 fee, uint256 net) {
        if (tokensWhole > sold) tokensWhole = sold;
        gross = _costDown(sold - tokensWhole, tokensWhole);
        fee = (gross * FEE_BPS) / BPS;
        net = gross - fee;
    }

    // ---------------------------------------------------------------- trading

    /// @notice Buy as many whole tokens as `msg.value` affords. Any unspent MON is refunded.
    /// @param minTokensOut Revert if fewer whole tokens would be received (slippage guard).
    function buy(uint256 minTokensOut) external payable nonReentrant returns (uint256 tokensWhole) {
        if (msg.value == 0) revert ZeroAmount();
        if (sold >= TOTAL_SUPPLY_WHOLE) revert SoldOut();

        uint256 spent;
        uint256 fee;
        (tokensWhole, spent, fee) = quoteBuy(msg.value);
        if (tokensWhole == 0 || tokensWhole < minTokensOut) revert Slippage(tokensWhole, minTokensOut);

        sold += tokensWhole;
        reserve += spent;
        _transfer(address(this), msg.sender, tokensWhole * 1e18);
        emit Bought(msg.sender, tokensWhole, spent, fee, currentPrice());

        _payFees(fee, msg.sender, spent);
        uint256 refund = msg.value - spent - fee;
        if (refund > 0) _sendOrRevert(msg.sender, refund);
    }

    /// @notice Sell `tokensWhole` back to the curve.
    /// @param minMonOut Revert if the seller would receive less MON (slippage guard).
    function sell(uint256 tokensWhole, uint256 minMonOut) external nonReentrant returns (uint256 net) {
        if (tokensWhole == 0) revert ZeroAmount();
        if (balanceOf(msg.sender) < tokensWhole * 1e18 || tokensWhole > sold) revert InsufficientBalance();

        (uint256 gross, uint256 fee, uint256 net_) = quoteSell(tokensWhole);
        net = net_;
        if (net < minMonOut) revert Slippage(net, minMonOut);

        sold -= tokensWhole;
        reserve -= gross; // cannot underflow: buys round up, sells round down
        _transfer(msg.sender, address(this), tokensWhole * 1e18);
        emit Sold(msg.sender, tokensWhole, gross, fee, currentPrice());

        _payFees(fee, msg.sender, gross);
        _sendOrRevert(msg.sender, net);
    }

    function claimCreatorFees() external nonReentrant {
        uint256 amount = pendingCreatorFees;
        pendingCreatorFees = 0;
        _sendOrRevert(creator, amount);
        emit CreatorFeesClaimed(creator, amount);
    }

    // ---------------------------------------------------------------- internals

    function _payFees(uint256 fee, address trader, uint256 volume) internal {
        if (fee == 0) return;
        uint256 creatorFee = (fee * CREATOR_FEE_BPS) / FEE_BPS;
        uint256 poolFee = fee - creatorFee;
        prizePool.record{value: poolFee}(trader, volume);
        // Push the creator fee; if the creator cannot receive, keep it claimable instead of reverting trades.
        (bool ok,) = creator.call{value: creatorFee}("");
        if (!ok) pendingCreatorFees += creatorFee;
    }

    function _sendOrRevert(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _costUp(uint256 s, uint256 n) internal view returns (uint256) {
        return n * basePrice + Math.ceilDiv(slope * n * (2 * s + n), 2);
    }

    function _costDown(uint256 s, uint256 n) internal view returns (uint256) {
        return n * basePrice + (slope * n * (2 * s + n)) / 2;
    }

    function _tokensFor(uint256 s, uint256 budget) internal view returns (uint256 n) {
        uint256 b = basePrice + slope * s;
        n = (Math.sqrt(b * b + 2 * slope * budget) - b) / slope;
        // Integer rounding can leave n one too high; correct it.
        while (n > 0 && _costUp(s, n) > budget) n--;
    }
}
