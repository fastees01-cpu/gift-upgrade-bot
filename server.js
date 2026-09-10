const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const app = express();
app.use(express.json());
// Разрешаем запросы Mini App
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
// =========================
// MINI APP
// =========================
// Главная страница
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});
// Проверка backend
app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        message: "Gift Upgrade API работает"
    });
});
// Авторизация Telegram Mini App
app.post("/api/auth", (req, res) => {
    const initData = req.body?.initData;
    if (!initData) {
        return res.status(400).json({
            success: false,
            error: "Telegram initData отсутствует"
        });
    }
    // На этом этапе просто проверяем наличие данных.
    // Проверку подписи Telegram подключим следующим шагом.
    try {
        const params = new URLSearchParams(initData);
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
        res.status(400).json({
            success: false,
            error: "Не удалось прочитать Telegram данные"
        });
    }
});
// =========================
// TELEGRAM BOT
// =========================
const token = process.env.BOT_TOKEN;
if (!token) {
    console.error("BOT_TOKEN не найден!");
} else {
    const bot = new TelegramBot(token, {
        polling: true
    });
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        await bot.sendMessage(
            chatId,
            `🎁 Добро пожаловать в Gift Upgrade!
Здесь будут кейсы и апгрейд Telegram-подарков.
👇 Нажми кнопку ниже, чтобы открыть приложение.`,
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
        console.error("Telegram polling error:", error.message);
    });
    console.log("Telegram bot started");
}
// =========================
// SERVER
// =========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Gift Upgrade server started on port ${PORT}`);
});
