const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

const symbol = "bitcoin";
const currency = "gbp"; // GBP tracking
const intervalSeconds = 60; // Check every 1 minute
const dataPoints = 14;
const STARTING_CAPITAL = 30;
const RSI_BUY_THRESHOLD = 30;
const RSI_SELL_THRESHOLD = 70;
const TARGET_PROFIT = 1; // Target profit per trade in GBP

let prices = [];
let position = "none";
let lastBuyPrice = 0;
let bitcoinQuantity = 0;
let capital = STARTING_CAPITAL;
let totalProfit = 0;

app.get("/", (req, res) => {
    res.send(`RSI Trading Bot running (Buy < ${RSI_BUY_THRESHOLD}, Sell for £${TARGET_PROFIT} profit, 1-minute interval).`);
});

app.listen(port, () => {
    console.log(`✅ Server started on port ${port}`);
});

// Prevent sleep with self-ping
setInterval(async () => {
    try {
        await axios.get(`http://localhost:${port}`);
        console.log("🔁 Self-ping OK");
    } catch (error) {
        console.error("⚠️ Self-ping failed:", error.message);
    }
}, 10 * 60 * 1000);

async function calculateRSI(prices) {
    if (prices.length < dataPoints) {
        return null;
    }
    const gains = [], losses = [];
    for (let i = 1; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        gains.push(diff > 0 ? diff : 0);
        losses.push(diff < 0 ? Math.abs(diff) : 0);
    }
    const avgGain = gains.reduce((a, b) => a + b) / gains.length;
    const avgLoss = losses.reduce((a, b) => a + b) / losses.length;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    return parseFloat(rsi.toFixed(2));
}

// RSI bot loop with 1-minute interval
setInterval(async () => {
    try {
        const response = await axios.get(
            `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=${currency}`
        );
        const price = response.data[symbol][currency];
        console.log(`📊 Price: £${price}`);

        prices.push(price);
        if (prices.length > dataPoints) prices.shift();

        const rsi = await calculateRSI(prices);

        if (rsi !== null) {
            console.log(`📈 RSI: ${rsi}`);

            // Buying logic
            if (position === "none" && rsi < RSI_BUY_THRESHOLD) {
                lastBuyPrice = price;
                bitcoinQuantity = capital / price;
                position = "long";
                console.log(`🟢 BUY at £${price} (RSI: ${rsi} < ${RSI_BUY_THRESHOLD})`);
                console.log(`💰 Bought ${bitcoinQuantity.toFixed(8)} BTC ≈ £${(bitcoinQuantity * price).toFixed(2)}`);
            }

            // Selling logic
            else if (position === "long") {
                const targetSellPrice = lastBuyPrice + (TARGET_PROFIT / bitcoinQuantity);
                if (price >= targetSellPrice) {
                    const sellPrice = price;
                    const profit = bitcoinQuantity * (sellPrice - lastBuyPrice);
                    capital += profit;
                    totalProfit += profit;
                    console.log(`🔴 SELL at £${sellPrice} (Target Profit Achieved: £${profit.toFixed(2)})`);
                    console.log(`💸 Profit: £${profit.toFixed(2)} | New Capital: £${capital.toFixed(2)}`);
                    position = "none";
                    bitcoinQuantity = 0;
                } else if (rsi > RSI_SELL_THRESHOLD) {
                    // Optionally sell based on RSI as well, even if target profit not hit
                    const sellPrice = price;
                    const profit = bitcoinQuantity * (sellPrice - lastBuyPrice);
                    capital += profit;
                    totalProfit += profit;
                    console.log(`🔴 SELL at £${sellPrice} (RSI: ${rsi} > ${RSI_SELL_THRESHOLD})`);
                    console.log(`💸 Profit: £${profit.toFixed(2)} | New Capital: £${capital.toFixed(2)}`);
                    position = "none";
                    bitcoinQuantity = 0;
                } else {
                    const currentValue = bitcoinQuantity * price;
                    const potentialProfit = bitcoinQuantity * (price - lastBuyPrice);
                    console.log(`📌 Holding ${bitcoinQuantity.toFixed(8)} BTC ≈ £${currentValue.toFixed(2)}, Buy Price: £${lastBuyPrice.toFixed(2)}, Potential Profit: £${potentialProfit.toFixed(2)}. Target Sell Price: £${targetSellPrice.toFixed(2)}`);
                }
            }

            console.log(`📊 Total Profit: £${totalProfit.toFixed(2)}`);
            console.log("------");
        } else {
            console.log(`⏳ Waiting for ${dataPoints} data points to calculate RSI.`);
        }
    } catch (error) {
        console.error("❌ Error fetching data:", error.message);
    }
}, intervalSeconds * 1000);