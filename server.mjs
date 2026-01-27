import { WebSocketServer } from 'ws';
import mysql from 'mysql2/promise';
import { parseFile } from "music-metadata";
import path from "path";
import { fileURLToPath } from 'url';
import express from 'express';
import { execFile } from "child_process";

const pool = mysql.createPool({
    host: 'localhost',
    user: 'radio_user',
    password: 'radio_password_123',
    database: 'radio',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const musicFolder = path.join(__dirname, "Music");

const app = express();
const PORT = 3000;

const wss = new WebSocketServer({ port: 8080 });
var allTitles;

var currentTrack = {};
var currentTimeTrack = 0;
var interval;

main();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.use('/Music', express.static(path.join(__dirname, 'Music')));
app.use('/Covers', express.static(path.join(__dirname, 'Covers')));
app.set('views', path.join(__dirname, 'views'));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});


app.get('/admin', async (req, res) => {

    const [rows] = await pool.query("SELECT titles.id, COALESCE(titles.titre,'Unknown') AS titre, COALESCE(titles.url,'') AS url, COALESCE(titles.annee,'0000') AS annee, COALESCE(artistes.nom,'Unknown') AS artiste, COALESCE(covers.url,'default.png') AS cover FROM titles LEFT JOIN artistes ON artistes.id = titles.fk_artiste LEFT JOIN covers ON covers.id = titles.fk_cover;");

    res.render('admin', { allTitles: rows });
});

app.get("/add-title", async (req, res) => {

    const [artistes] = await pool.query("select id, nom from artistes;");
    const [covers] = await pool.query("select id, url from covers;");

    res.render("add-title", { artistes, covers });
});

app.post("/add-title", async (req, res) => {

    let { title, url, year, artist, cover } = req.body;

    // Permettre que artist ou cover soient null
    artist = artist || null;
    cover = cover || null;
    year = year || null;

    // Nettoyage du titre pour le fichier
    const safeTitle = title.replace(/[<>:"/\\|?*]+/g, "").trim();
    const outputFile = `${musicFolder}/${safeTitle}.%(ext)s`;

    const cmd = [
        "yt-dlp",
        "-f", "bestaudio",
        "-x",
        "--audio-format", "mp3",
        "-o", outputFile,
        url
    ];

    execFile(cmd[0], cmd.slice(1), async (error) => {
        if (error) {
            console.error(error);
            return res.status(500).send("Download failed");
        }

        // ✅ Insert DB seulement si download réussi
        try {
            await pool.query(
                `INSERT INTO titles (titre, url, annee, fk_artiste, fk_cover)
                 VALUES (?, ?, ?, ?, ?)`,
                [safeTitle, `${safeTitle}.mp3`, year, artist, cover]
            );

            res.redirect("/admin");
        } catch (dbError) {
            console.error(dbError);
            res.status(500).send("Database insert failed");
        }
    });
});



app.listen(PORT, () => {
    console.log(`Serveur lancé sur http://localhost:${PORT}`);
});




wss.on('connection', (ws) => {
    console.log('$[WSS]');
    console.log('$[WSS] Client connected');
    console.log('$[WSS]');

    ws.send(JSON.stringify({ currentTrack }));

    ws.on('message', (message) => {
        wss.clients.forEach((client) => {
            if (client !== ws) {
                client.send(message);
            }
        });
    });
});

function broadcastTrack() {
    console.log('Broadcasting track');
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ currentTrack }));
        }
    });
}


console.log('Serveur WebSocket démarré sur ws://localhost:8080');

async function main() {
    await getAllTitles();
    newTrack();
}



async function newTrack() {

    await getAllTitles();

    let x = Math.floor(Math.random() * allTitles.length);
    let track = allTitles[x];
    let duration = Math.floor((await parseFile(path.join(musicFolder, track.url))).format.duration);

    currentTrack.trackInfo = track;
    currentTrack.duration = duration;

    playTack();
}

async function playTack() {
    console.log(currentTrack);

    pool.query("INSERT INTO history (fk_title) VALUES (?)", [currentTrack.trackInfo.id]);
    currentTrack.playedAt = nowMySQLms();
    broadcastTrack();

    currentTimeTrack = 0;
    interval = setInterval(
        () => {
            currentTimeTrack += 1;
            if (currentTimeTrack >= currentTrack.duration) {
                newTrack();
                clearInterval(interval);
            } else {
                // console.log("Music is playing...");
                // console.log("Title: " + currentTrack.trackInfo.titre);
                // console.log("Time left: " + (currentTrack.duration - currentTimeTrack) + " / " + currentTrack.duration);
                // let timeMinSec = Math.floor((currentTrack.duration) / 60) + ":" + (currentTrack.duration) % 60;
                // console.log("Current time: " + currentTimeTrack + "/" + timeMinSec);
                // console.log("Precise time: " + (new Date(nowMySQLms()) - new Date(currentTrack.playedAt)));
                // console.log("Played at: " + currentTrack.playedAt);
            }

        },
        1000
    )
}

async function getAllTitles() {
    try {
        const [rows] = await pool.query("select titles.id, titles.titre, titles.url, titles.annee, artistes.nom as artiste, covers.url as cover from titles join artistes on artistes.id = fk_artiste join covers on covers.id = fk_cover where titles.id not in (select fk_title from(select fk_title from history order by id desc limit 4) AS last4);");
        allTitles = rows;
    } catch (err) {
        console.error("Erreur lors de la requête MySQL:", err);
        allTitles = [];
    }

    console.log('✅ Title added to allTitles:');
    for (const title of allTitles) {
        console.log(title.titre);
    }
}

function nowMySQLms() {
    return new Date()
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d{3}Z$/, m => m.slice(0, -1));   // garde .SSS et enlève Z
}
