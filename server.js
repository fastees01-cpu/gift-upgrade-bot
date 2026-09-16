const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");

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
const DATABASE_URL = process.env.DATABASE_URL;

if (!BOT_TOKEN) {
    console.error("BOT_TOKEN не найден в Environment!");
    process.exit(1);
}

if (!DATABASE_URL) {
    console.error("DATABASE_URL не найден в Environment!");
    process.exit(1);
}

// =========================
// DATABASE
// =========================

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                first_name TEXT DEFAULT '',
                last_name TEXT DEFAULT '',
                username TEXT DEFAULT '',
                balance_stars INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("PostgreSQL connected");
        console.log("Users table ready");
    } catch (error) {
        console.error("Database initialization error:", error);
    }
}

initDatabase();

// =========================
// TELEGRAM BOT
// =========================

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

app.get("/api/status", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            success: true,
            message: "Gift Upgrade API работает",
            database: "connected"
        });
    } catch (error) {
        console.error("Database status error:", error);

        res.status(500).json({
            success: false,
            message: "API работает, но база недоступна",
            database: "error"
        });
    }
});

// =========================
// TELEGRAM AUTH
// =========================

function verifyTelegramInitData(initData) {
    const params = new URLSearchParams(initData);

    const hash = params.get("hash");

    if (!hash) {
        throw new Error("Подпись Telegram отсутствует");
    }

    params.delete("hash");

    const dataCheckString = [...params.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");

    const secretKey = crypto
        .createHmac("sha256", BOT_TOKEN)
        .update("WebAppData")
        .digest();

    const calculatedHash = crypto
        .createHmac("sha256", secretKey)
        .update(dataCheckString)
        .digest("hex");

    if (calculatedHash !== hash) {
        throw new Error("Неверная подпись Telegram");
    }

    const userString = params.get("user");

    if (!userString) {
        throw new Error("Пользователь Telegram не найден");
    }

    return JSON.parse(userString);
}

app.post("/api/auth", async (req, res) => {
    try {
        const initData = req.body?.initData;

        if (!initData) {
            return res.status(400).json({
                success: false,
                error: "Telegram initData отсутствует"
            });
        }

        const user = verifyTelegramInitData(initData);

        await pool.query(
            `
            INSERT INTO users
                (telegram_id, first_name, last_name, username, updated_at)
            VALUES
                ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (telegram_id)
            DO UPDATE SET
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                username = EXCLUDED.username,
                updated_at = CURRENT_TIMESTAMP
            `,
            [
                user.id,
                user.first_name || "",
                user.last_name || "",
                user.username || ""
            ]
        );

        const result = await pool.query(
            `
            SELECT
                telegram_id,
                first_name,
                last_name,
                username,
                balance_stars
            FROM users
            WHERE telegram_id = $1
            `,
            [user.id]
        );

        res.json({
            success: true,
            user: result.rows[0]
        });

    } catch (error) {
        console.error("Auth error:", error);

        res.status(400).json({
            success: false,
            error: error.message || "Ошибка авторизации"
        });
    }
});

// =========================
// GET USER
// =========================

app.post("/api/user", async (req, res) => {
    try {
        const initData = req.body?.initData;

        if (!initData) {
            return res.status(400).json({
                success: false,
                error: "Telegram initData отсутствует"
            });
        }

        const user = verifyTelegramInitData(initData);

        const result = await pool.query(
            `
            SELECT
                telegram_id,
                first_name,
                last_name,
                username,
                balance_stars
            FROM users
            WHERE telegram_id = $1
            `,
            [user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Пользователь не найден"
            });
        }

        res.json({
            success: true,
            user: result.rows[0]
        });

    } catch (error) {
        console.error("User error:", error);

        res.status(400).json({
            success: false,
            error: "Ошибка получения пользователя"
        });
    }
});

// =========================
// TELEGRAM STARS PAYMENT
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

        const user = verifyTelegramInitData(initData);

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

    try {
        const payment = msg.successful_payment;

        const telegramId = msg.from?.id;

        if (!telegramId) {
            console.error("Payment user ID not found");
            return;
        }

        const amount = Number(payment.total_amount);

        await pool.query(
            `
            INSERT INTO users
                (telegram_id, first_name, last_name, username, balance_stars)
            VALUES
                ($1, $2, $3, $4, $5)
            ON CONFLICT (telegram_id)
            DO UPDATE SET
                balance_stars =
                    users.balance_stars + EXCLUDED.balance_stars,
                updated_at = CURRENT_TIMESTAMP
            `,
            [
                telegramId,
                msg.from?.first_name || "",
                msg.from?.last_name || "",
                msg.from?.username || "",
                amount
            ]
        );

        console.log("PAYMENT SUCCESS:", {
            user_id: telegramId,
            amount: amount,
            currency: payment.currency,
            payload: payment.invoice_payload,
            telegram_payment_charge_id:
                payment.telegram_payment_charge_id
        });

        const result = await pool.query(
            `
            SELECT balance_stars
            FROM users
            WHERE telegram_id = $1
            `,
            [telegramId]
        );

        const balance = result.rows[0]?.balance_stars || 0;

        await bot.sendMessage(
            msg.chat.id,
            `✅ Оплата получена!

⭐ Зачислено: ${amount}

💰 Баланс: ${balance} ⭐`
        );

    } catch (error) {
        console.error(
            "Payment database error:",
            error
        );
    }
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

// =========================
// ERRORS
// =========================

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
