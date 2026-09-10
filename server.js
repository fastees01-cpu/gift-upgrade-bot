const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const crypto = require("crypto");
const path = require("path");
const app = express();
app.use(express.json());
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
    );
    res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
    );
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});
const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("BOT_TOKEN не найден в Environment!");
    process.exit(1);
}
const bot = new TelegramBot(BOT_TOKEN, {
    polling: true
});
console.log("Telegram bot started");
// =========================
// MINI APP
// =========================
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        message: "Gift Upgrade API работает"
    });
});
// =========================
// TELEGRAM AUTH
// =========================
app.post("/api/auth", (req, res) => {
    const initData = req.body?.initData;
    if (!initData) {
        return res.status(400).json({
            success: false,
            error: "Telegram initData отсутствует"
        });
    }
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get("hash");
        if (!hash) {
            return res.status(400).json({
                success: false,
                error: "Подпись Telegram отсутствует"
            });
        }
        params.delete("hash");
        const dataCheckString = [...params.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join("\n");
        const secretKey = crypto
            .createHmac("sha256", "WebAppData")
            .update(BOT_TOKEN)
            .digest();
        const calculatedHash = crypto
            .createHmac("sha256", secretKey)
            .update(dataCheckString)
            .digest("hex");
        if (calculatedHash !== hash) {
            return res.status(403).json({
                success: false,
                error: "Неверная подпись Telegram"
            });
        }
        const userString = params.get("user");
        if (!userString) {
            return res.status(400).json({
                success: false,
                error: "Пользователь Telegram не найден"
            });
        }
        const user = JSON.parse(userString);
        res.json({
            success: true,
            user: {
                id: user.id,
                first_name: user.first_name || "",
                username: user.username || ""
            }
        });
    } catch (error) {
        console.error("Auth error:", error);
        res.status(400).json({
            success: false,
            error: "Ошибка авторизации"
        });
    }
});
// =========================
// TELEGRAM STARS
// =========================
app.post("/api/payment/create", async (req, res) => {
    try {
        const initData = req.body?.initData;
        if (!initData) {
            return res.status(400).json({
                success: false,
                error: "Telegram initData отсутствует"
            });
        }
        const params = new URLSearchParams(initData);
        const userString = params.get("user");
        if (!userString) {
            return res.status(400).json({
                success: false,
                error: "Пользователь Telegram не найден"
            });
        }
        const user = JSON.parse(userString);
        const payload = `deposit_${user.id}_${Date.now()}`;
        const invoiceLink = await bot.createInvoiceLink(
            "Gift Upgrade",
            "Пополнение баланса на 100 Telegram Stars",
            payload,
            "",
            "XTR",
            [
                {
                    label: "100 ⭐",
                    amount: 100
                }
            ]
        );
        res.json({
            success: true,
            invoiceLink
        });
    } catch (error) {
        console.error("Invoice error:", error);
        res.status(500).json({
            success: false,
            error: "Не удалось создать счёт"
        });
    }
});
// =========================
// PAYMENT CONFIRMATION
// =========================
bot.on("pre_checkout_query", async (query) => {
    try {
        await bot.answerPreCheckoutQuery(
            query.id,
            true
        );
        console.log(
            "Pre-checkout approved:",
            query.invoice_payload
        );
    } catch (error) {
        console.error(
            "Pre-checkout error:",
            error.message
        );
    }
});
bot.on("message", async (msg) => {
    if (!msg.successful_payment) {
        return;
    }
    const payment = msg.successful_payment;
    console.log("PAYMENT SUCCESS:", {
        user_id: msg.from?.id,
        amount: payment.total_amount,
        currency: payment.currency,
        payload: payment.invoice_payload,
        telegram_payment_charge_id:
            payment.telegram_payment_charge_id
    });
    await bot.sendMessage(
        msg.chat.id,
        `✅ Оплата получена!
⭐ Зачислено: ${payment.total_amount}
Сейчас баланс будет подключён к системе Gift Upgrade.`
    );
});
// =========================
// START COMMAND
// =========================
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(
        chatId,
        `🎁 Добро пожаловать в Gift Upgrade!
Здесь будут кейсы и апгрейд Telegram-подарков.
👇 Открой приложение:`,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "🎁 Открыть Gift Upgrade",
                            web_app: {
                                url: "https://gift-upgrade-bot.onrender.com/"
                            }
                        }
                    ]
                ]
            }
        }
    );
});
bot.on("polling_error", (error) => {
    console.error(
        "Telegram polling error:",
        error.message
    );
});
// =========================
// SERVER
// =========================
app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `Gift Upgrade server started on port ${PORT}`
    );
});
