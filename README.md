import { WebSocketServer } from 'ws';
import mysql from 'mysql2/promise';
import { parseFile } from "music-metadata";
import path from "path";
import { fileURLToPath } from 'url';
import express from 'express';
import { execFile } from "child_process";
import sharp from "sharp";
import { Console } from 'console';

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
const coversFolder = path.join(__dirname, "Covers");

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

app.get("/edit-title", async (req, res) => {

    let id = req.query.id;

    const [title] = await pool.query("SELECT * FROM titles WHERE id = ?", [id]);

    const [artistes] = await pool.query("select id, nom from artistes;");
    const [covers] = await pool.query("select id, url from covers;");

    res.render("edit-title", { title: title[0], artistes, covers });
});



app.post("/add-title", async (req, res) => {

    let { title, url, year, artist, cover } = req.body;

    artist = artist || null;
    cover = cover || null;
    year = year || null;

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

app.post("/edit-title/:id", async (req, res) => {
    let { title, url, year, artist, cover } = req.body;

    artist = artist || null;
    cover = cover || null;
    year = year || null;

    try {
        // Récupérer l'ancien titre pour supprimer l'ancien fichier
        const [oldTitle] = await pool.query(
            `SELECT url FROM titles WHERE id = ?`,
            [req.params.id]
        );

        if (!oldTitle || oldTitle.length === 0) {
            return res.status(404).send("Title not found");
        }

        const oldFileName = oldTitle[0].url;
        const oldFilePath = path.join(musicFolder, oldFileName);

        // Nettoyer le nouveau titre
        const safeTitle = title.replace(/[<>:"/\\|?*]+/g, "").trim();
        
        let finalFileName;

        // Vérifier si l'URL contient "http"
        if (url.includes("http")) {
            // ========================================
            // CAS 1: Télécharger un nouveau fichier depuis une URL
            // ========================================
            console.log("📥 Downloading from URL:", url);
            
            const outputFile = path.join(musicFolder, `${safeTitle}.%(ext)s`);
            
            const cmd = [
                "yt-dlp",
                "-f", "bestaudio",
                "-x",
                "--audio-format", "mp3",
                "-o", outputFile,
                url
            ];

            try {
                // Télécharger le nouveau fichier
                await execFileAsync(cmd[0], cmd.slice(1));
                finalFileName = `${safeTitle}.mp3`;
                
                console.log("✅ Download complete:", finalFileName);
                
                // Supprimer l'ancien fichier si différent du nouveau
                if (oldFileName !== finalFileName) {
                    try {
                        await fs.access(oldFilePath);
                        await fs.unlink(oldFilePath);
                        console.log("🗑️  Old file deleted:", oldFileName);
                    } catch (err) {
                        console.warn("⚠️  Could not delete old file:", oldFileName);
                    }
                }
                
            } catch (dlError) {
                console.error("❌ Download failed:", dlError);
                return res.status(500).send("Download failed");
            }

        } else {
            // ========================================
            // CAS 2: Juste changer le nom du fichier en BDD
            // ========================================
            console.log("📝 Updating filename in database:", url);
            
            finalFileName = url;
        }

        // Mettre à jour la base de données
        await pool.query(
            `UPDATE titles SET titre = ?, url = ?, annee = ?, fk_artiste = ?, fk_cover = ? WHERE id = ?`,
            [safeTitle, finalFileName, year, artist, cover, req.params.id]
        );

        console.log("✅ Title updated successfully:", safeTitle);
        res.redirect("/admin");

    } catch (dbError) {
        console.error("❌ Database error:", dbError);
        res.status(500).send("Database update failed");
    }
});

// Route pour supprimer un titre
app.post("/delete-title/:id", async (req, res) => {
    try {
        // Récupérer les infos du titre avant suppression
        const [title] = await pool.query(
            `SELECT url FROM titles WHERE id = ?`,
            [req.params.id]
        );

        if (!title || title.length === 0) {
            return res.status(404).send("Title not found");
        }

        const fileName = title[0].url;
        const filePath = path.join(musicFolder, fileName);

        // Supprimer de la base de données
        await pool.query(
            `DELETE FROM titles WHERE id = ?`,
            [req.params.id]
        );

        console.log("✅ Title deleted from database");

        // Supprimer le fichier audio
        try {
            await fs.access(filePath);
            await fs.unlink(filePath);
            console.log("🗑️  File deleted:", fileName);
        } catch (err) {
            console.warn("⚠️  Could not delete file:", fileName);
        }

        res.redirect("/admin");

    } catch (error) {
        console.error("❌ Delete error:", error);
        res.status(500).send("Delete failed");
    }
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
    console.log('FUNCTION main');
    await getAllTitles();
    newTrack();
}

async function newTrack() {

    await getAllTitles();

    let x = Math.floor(Math.random() * allTitles.length);
    let track = allTitles[x];
    console.log(path.join(musicFolder, track.url));
    let duration = Math.floor((await parseFile(path.join(musicFolder, track.url))).format.duration);
    let lineColor = await getAverageColor(path.join(coversFolder, track.cover));

    currentTrack.trackInfo = track;
    currentTrack.duration = duration;
    currentTrack.lineColor = lineColor;

    playTack();
}

async function playTack() {
    // console.log(currentTrack);
    console.log('FUNCTION playTack');

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
                console.log("Music is playing...");
                console.log("Title: " + currentTrack.trackInfo.titre);
                console.log("Time left: " + (currentTrack.duration - currentTimeTrack) + " / " + currentTrack.duration);
                let timeMinSec = Math.floor((currentTrack.duration) / 60) + ":" + (currentTrack.duration) % 60;
                console.log("Current time: " + currentTimeTrack + "/" + timeMinSec);
                console.log("Precise time: " + (new Date(nowMySQLms()) - new Date(currentTrack.playedAt)));
                console.log("Played at: " + currentTrack.playedAt);
            }

        },
        1000
    )
}

async function getAllTitles() {
    try {
        const [rows] = await pool.query("SELECT titles.id, COALESCE(titles.titre,'Unknown') AS titre,  COALESCE(titles.url,'') AS url,  COALESCE(titles.annee,'0000') AS annee,  COALESCE(artistes.nom,'Unknown') AS artiste, COALESCE(covers.url,'default.png') AS cover  FROM titles LEFT JOIN artistes ON artistes.id = titles.fk_artiste  LEFT JOIN covers ON covers.id = titles.fk_cover where titles.id not in (select fk_title from(select fk_title from history order by id desc limit 4) AS last4);");
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

export async function getAverageColor(imagePath) {
    const { data, info } = await sharp(imagePath)
        .resize(50, 50)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    let rTotal = 0;
    let gTotal = 0;
    let bTotal = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += info.channels) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Optionnel : ignorer les pixels très sombres ou très clairs
        if (r + g + b < 30 || r + g + b > 740) continue;

        rTotal += r;
        gTotal += g;
        bTotal += b;
        count++;
    }

    const r = Math.round(rTotal / count);
    const g = Math.round(gTotal / count);
    const b = Math.round(bTotal / count);

    return (
        "#" +
        [r, g, b]
            .map(v => v.toString(16).padStart(2, "0"))
            .join("")
    );
}