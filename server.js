const express = require("express");

const app = express();
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }

    next();
});
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Проверка, что сервер работает
app.get("/", (req, res) => {
    res.json({
        status: "ok",
        project: "Gift Upgrade",
        message: "Backend is running"
    });
});

// Проверка Mini App
app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        message: "Gift Upgrade API работает"
    });
});

// Получение информации о пользователе
app.post("/api/user", (req, res) => {
    const user = req.body?.user;

    if (!user) {
        return res.status(400).json({
            success: false,
            error: "User data отсутствует"
        });
    }

    res.json({
        success: true,
        user: {
            id: user.id,
            first_name: user.first_name || "",
            username: user.username || ""
        }
    });
});

// Временный тест кейса
// Реальный результат позже будет рассчитываться только на сервере.
app.post("/api/case/test", (req, res) => {

    const cases = [
        {
            id: "starter",
            name: "Starter",
            price: 100
        },
        {
            id: "premium",
            name: "Premium",
            price: 500
        }
    ];

    res.json({
        success: true,
        cases
    });
});

app.listen(PORT, () => {
    console.log(`Gift Upgrade server started on port ${PORT}`);
});
