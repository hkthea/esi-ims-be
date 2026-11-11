import dotenv from "dotenv";
import express, { json } from "express";
import m from "mongoose";
import path from "path";
import { getConfigFile, getOsPlatform } from "./library/config";
import router from "./router";

dotenv.config();

const {
    server: { bind, port },
    database: { connection: dbConnection },
} = getConfigFile();
const app = express();

m.connect(dbConnection)
    .then(() => console.log(`Connected to MongoDB`))
    .catch((err) => console.error("MongoDB connection error:", err));

if (process.env.DEV === "true") {
    app.use("/", (req, res, next) => {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
        res.set(
            "Access-Control-Allow-Headers",
            "Authorization, Origin, X-Requested-With, Content-Type, usefirebaseauth, srawungtoken, key-jaster, Accept, Develop-by, bb-token, User-Agent, Content-Disposition"
        );
        res.set("Access-Control-Expose-Headers", "*");
        if (req.method.toLowerCase() === "options") {
            res.end("OKE");
        } else {
            next();
        }
    });
}

app.listen(port, bind, async () => {
    console.log("Listened", port, bind);
    const platform = getOsPlatform();
    console.log(platform);
});

app.use(json({ limit: "300MB" }));
app.use(router);

const PUBLIC_DIR = path.join(__dirname, "../public");
app.use("/public", express.static(PUBLIC_DIR));

app.use((req, res) => {
    res.json({ error: 404, message: "Page not found!" });
});
