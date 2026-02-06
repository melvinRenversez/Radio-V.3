import { WebSocketServer } from 'ws';
import mysql from 'mysql2/promise';
import { parseFile } from "music-metadata";
import path from "path";
import { fileURLToPath } from 'url';
import express from 'express';
import { execFile } from "child_process";
import sharp from "sharp";
import { promisify } from "util";
import * as fsSync from "node:fs";
import fs from "fs/promises";
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';



const pool = mysql.createPool({
    host: '88.189.251.90',
    user: 'radio_user',
    password: 'radio@R12mdp',
    database: 'radio',
    port: 21336,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const musicFolder = path.join(__dirname, "Music");
const coversFolder = path.join(__dirname, "Covers");


const execFileAsync = promisify(execFile);

const app = express();
const PORT = 21900;

const wss = new WebSocketServer({ port: 21901 });
var allTitles;

var currentTrack = {};
var currentTimeTrack = 0;
var interval;
var totalListeners = 0;

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
    const [covers] = await pool.query("select id, url, name_cover from covers;");

    const files = await fs.readdir(musicFolder);
    const mp3s = files.filter(file => file.endsWith(".mp3"));

    res.render("add-title", { artistes, covers, mp3s });
});

app.get("/edit-title/:id", async (req, res) => {

    let id = req.params.id;

    const [title] = await pool.query("SELECT id, titre, url, duree, annee, fk_artiste, fk_cover FROM titles WHERE id = ?", [id]);

    const [artistes] = await pool.query("select id, nom from artistes;");
    const [covers] = await pool.query("select id, url from covers;");

    const files = await fs.readdir(musicFolder);
    const mp3s = files.filter(file => file.endsWith(".mp3"));


    console.log(title);
    console.log(artistes);
    console.log(covers);
    console.log(mp3s);

    res.render("edit-title", { title: title[0], artistes, covers, mp3s });
});

app.get("/show-title/:id", async (req, res) => {

    let id = req.params.id;
    console.log("👀 Showing title:", id);

    const [title] = await pool.query("SELECT titles.id, COALESCE(titles.titre,'Unknown') AS titre, COALESCE(titles.url,'') AS url, COALESCE(titles.annee,'0000') AS annee, COALESCE(artistes.nom,'Unknown') AS artiste, COALESCE(covers.url,'default.png') AS cover  FROM titles LEFT JOIN artistes ON artistes.id = titles.fk_artiste  LEFT JOIN covers ON covers.id = titles.fk_cover where titles.id = ?;", [id]);


    const [artistes] = await pool.query("select id, nom from artistes;");
    const [covers] = await pool.query("select id, url from covers;");

    console.log(title);
    console.log(artistes);
    console.log(covers);

    console.log(allTitles);

    res.render("show-title", { title: title[0], artistes, covers });
});


app.get("/history/:page", async (req, res) => {
    const page = parseInt(req.params.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;


    const [rows] = await pool.query(
        `SELECT h.id, titre, t.id as titre_id, duree, annee, status, c.url as cover, nom as artist, played_at 
         FROM history h  
         join status s on s.id = h.fk_status
         LEFT JOIN titles t ON t.id = h.fk_title 
         LEFT JOIN covers c ON c.id = t.fk_cover 
         LEFT JOIN artistes a ON a.id = t.fk_artiste 
         ORDER BY h.id DESC 
         LIMIT ? OFFSET ?`,
        [limit, offset]
    );

    const [countResult] = await pool.query("SELECT COUNT(*) as count FROM history");
    const totalCount = countResult[0].count;

    console.log(rows);
    console.log(rows.length);
    console.log(totalCount);

    res.render("history", {
        history: rows,
        totalCount: totalCount,
        currentPage: page
    });
});


app.get("/api/history/:page", async (req, res) => {
    const page = parseInt(req.params.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
        `SELECT h.id, titre, t.id as titre_id, duree, annee, status, c.url as cover, nom as artist, played_at 
         FROM history h  
         join status s on s.id = h.fk_status
         JOIN titles t ON t.id = h.fk_title 
         JOIN covers c ON c.id = t.fk_cover 
         JOIN artistes a ON a.id = t.fk_artiste 
         ORDER BY h.id DESC 
         LIMIT ? OFFSET ?`,
        [limit, offset]
    );

    const [countResult] = await pool.query("SELECT COUNT(*) as count FROM history");
    const totalCount = countResult[0].count;

    res.json({
        history: rows,
        totalCount: totalCount
    });
});

app.get("/add-artist", async (req, res) => {

    const [artists] = await pool.query("select nom from artistes;");

    res.render("add-artist", { artists });
})

app.get("/add-cover", async (req, res) => {

    const [covers] = await pool.query("select id, url from covers;");

    res.render("add-cover", { covers });
})

app.post("/add-artist", async (req, res) => {
    console.log("📥 Adding artist:", req.body);
    const { artist } = req.body;
    await pool.query("INSERT INTO artistes (nom) VALUES (?)", [artist]);
    res.redirect("/admin");
})


// ADD COVER __________________________________________________________________________________________________________________

// Configuration de Multer pour le stockage des images
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const coversDir = path.join(__dirname, "Covers");

        if (!fsSync.existsSync(coversDir)) {
            fsSync.mkdirSync(coversDir, { recursive: true });
        }

        cb(null, coversDir);
    },

    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});


// Filtre pour accepter uniquement les images
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Seules les images sont autorisées (JPG, PNG, WEBP, GIF)'));
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // Limite de 10MB
    }
});


// Route pour ajouter une couverture
app.post("/add-cover", upload.single('cover'), async (req, res) => {
    try {

        console.log("📥 Adding cover:", req.body.coverName);
        console.log("📁 File uploaded:", req.file);

        const { coverName } = req.body;
        let filename;

        if (req.file) {
            // Générer un UUID + extension du fichier original
            const ext = path.extname(req.file.originalname); // ex: .jpg, .png
            filename = `${uuidv4()}${ext}`;

            // Renommer le fichier uploadé avec le nouveau nom
            const oldPath = req.file.path;
            const newPath = path.join(path.dirname(oldPath), filename);
            await fs.rename(oldPath, newPath); // Utilise fs/promises
        }
        else if (coverName) {
            // Si pas de fichier uploadé, on peut quand même créer un nom unique
            filename = `${uuidv4()}_${coverName}`;
        }
        else {
            return res.status(400).json({ error: "Veuillez fournir un nom de couverture ou uploader un fichier" });
        }

        // Insérer dans la base de données
        await pool.query("INSERT INTO covers (url, name_cover) VALUES (?, ?)", [filename, coverName || filename]);

        console.log("✅ Cover added successfully:", filename);
        res.redirect("/admin");

    } catch (error) {
        console.error("❌ Error adding cover:", error);
        res.status(500).json({ error: error.message });
    }
});

// Route pour supprimer une couverture
app.post("/delete-cover/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // Récupérer l'URL de la couverture avant de la supprimer
        const [cover] = await pool.query("SELECT url FROM covers WHERE id = ?", [id]);

        if (cover.length > 0) {
            // Supprimer le fichier physique
            const filePath = path.join(__dirname, 'Covers', cover[0].url);
            if (fsSync.existsSync(filePath)) {
                fsSync.unlinkSync(filePath);
                console.log("🗑️ File deleted:", filePath);
            }

            // Supprimer de la base de données
            await pool.query("DELETE FROM covers WHERE id = ?", [id]);
            console.log("✅ Cover deleted from database:", id);
        }

        res.redirect("/admin");
    } catch (error) {
        console.error("❌ Error deleting cover:", error);
        res.status(500).json({ error: error.message });
    }
});


app.post("/add-title", async (req, res) => {
    console.log("📥 Adding title:", req.body);
    let { title, url, year, artist, cover } = req.body;


    console.log(title);
    console.log(url);
    console.log(year);
    console.log(artist);
    console.log(cover);

    artist = artist || null;
    cover = cover || null;
    year = year || null;

    try {
        let finalFileName;

        // ========================================
        // CAS 1 : URL YouTube → télécharger
        // ========================================
        if (url && /^https?:\/\//i.test(url)) {
            console.log("📥 Downloading from URL:", url);

            const outputTemplate = path.join(
                musicFolder,
                "%(title)s.mp3"
            );

            // 1️⃣ Obtenir le nom final
            const getNameCmd = [
                "yt-dlp",
                "--get-filename",
                "--restrict-filenames",
                "--js-runtimes", "node",
                "-o", "%(title)s.mp3",
                url
            ];

            const { stdout } = await execFileAsync(
                getNameCmd[0],
                getNameCmd.slice(1)
            );

            finalFileName = stdout.trim();

            // 2️⃣ Télécharger
            const downloadCmd = [
                "yt-dlp",
                "-f", "bestaudio/best",                // Meilleur audio disponible (souvent opus ou aac → converti en mp3 après)
                "-x",                                  // Extraire l'audio seulement
                "--audio-format", "mp3",               // Convertir en MP3
                "--restrict-filenames",                // Noms de fichiers safe (pas de caractères spéciaux)
                "--js-runtimes", "node",               // Utilise Node.js pour le JS runtime (si installé)
                "--no-playlist",                       // Pas de playlists (seulement la vidéo unique)
                "--ignore-errors",                     // Continue même si erreur mineure
                "--extractor-args", "youtube:player_client=default,-android_sdkless",  // Fix principal SABR/403 en 2026
                "-o", outputTemplate,
                url
            ];


            await execFileAsync(
                downloadCmd[0],
                downloadCmd.slice(1)
            );

            console.log("✅ Download complete:", finalFileName);
        }

        // ========================================
        // CAS 2 : url = nom de fichier existant
        // ========================================
        else if (url) {
            console.log("📥 Using existing file:", url[0]);
            finalFileName = url[0];
        }

        // ========================================
        // Sécurité : rien fourni
        // ========================================
        else {
            return res.status(400).send("URL or filename required");
        }

        // ========================================
        // Insertion BDD
        // ========================================


        console.log("Insert :", title, finalFileName, year, artist, cover);
        await pool.query(
            `INSERT INTO titles (titre, url, annee, fk_artiste, fk_cover)
             VALUES (?, ?, ?, ?, ?)`,
            [title, finalFileName, year, artist, cover]
        );

        console.log("✅ Title added successfully:", finalFileName);
        res.redirect("/admin");

    } catch (err) {
        console.error("❌ Error:", err);
        res.status(500).send("Add title failed");
    }
});



app.post("/edit-title/:id", async (req, res) => {
    let { url, year, artist, cover } = req.body;

    artist = artist || null;
    cover = cover || null;
    year = year || null;

    console.log("edit info")
    console.log(url)
    console.log(year)
    console.log(artist)
    console.log(cover)

    try {
        // ========================================
        // Récupérer l'ancien fichier
        // ========================================
        const [oldTitle] = await pool.query(
            `SELECT url FROM titles WHERE id = ?`,
            [req.params.id]
        );

        if (!oldTitle || oldTitle.length === 0) {
            return res.status(404).send("Title not found");
        }

        const oldFileName = oldTitle[0].url;
        const oldFilePath = path.join(musicFolder, oldFileName);

        let finalFileName = oldFileName; // 👈 fallback par défaut

        // ========================================
        // CAS 1 : URL YouTube → télécharger
        // ========================================
        if (url && /^https?:\/\//i.test(url)) {
            console.log("📥 Downloading from URL:", url);

            const outputTemplate = path.join(
                musicFolder,
                "%(title)s.mp3"
            );

            // 1️⃣ Obtenir le nom final
            const getNameCmd = [
                "yt-dlp",
                "--get-filename",
                "--restrict-filenames",
                "-o", "%(title)s.mp3",
                url
            ];

            const { stdout } = await execFileAsync(
                getNameCmd[0],
                getNameCmd.slice(1)
            );

            finalFileName = stdout.trim();

            // 2️⃣ Télécharger
            const downloadCmd = [
                "yt-dlp",
                "-f", "bestaudio",
                "-x",
                "--audio-format", "mp3",
                "--restrict-filenames",
                "-o", outputTemplate,
                url
            ];

            await execFileAsync(
                downloadCmd[0],
                downloadCmd.slice(1)
            );

            console.log("✅ Download complete:", finalFileName);

            // 3️⃣ Supprimer l'ancien fichier
            if (oldFileName !== finalFileName) {
                try {
                    await fs.access(oldFilePath);
                    await fs.unlink(oldFilePath);
                    console.log("🗑️ Old file deleted:", oldFileName);
                } catch {
                    console.warn("⚠️ Could not delete old file:", oldFileName);
                }
            }
        }

        // ========================================
        // CAS 2 : url = nom de fichier manuel
        // ========================================
        else if (url && url !== oldFileName) {
            finalFileName = url;
        }

        // ========================================
        // Mise à jour BDD
        // ========================================
        await pool.query(
            `UPDATE titles
             SET url = ?, annee = ?, fk_artiste = ?, fk_cover = ?
             WHERE id = ?`,
            [finalFileName, year, artist, cover, req.params.id]
        );

        console.log("✅ Title updated successfully:", finalFileName);
        res.redirect("/admin");

    } catch (err) {
        console.error("❌ Error:", err);
        res.status(500).send("Update failed");
    }
});




// Route pour supprimer un titre
app.post("/delete-title/:id", async (req, res) => {
    console.log("🗑️  Deleting title:", req.params.id);
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

    totalListeners++;
    broadcastListeners();

    ws.send(JSON.stringify({ currentTrack }));

    ws.on('message', (message) => {
        wss.clients.forEach((client) => {
            if (client !== ws) {
                client.send(message);
            }
        });
    });

    ws.on('close', () => {
        totalListeners--;
        broadcastListeners();
        console.log('$[WSS] Client disconnected');
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

function broadcastListeners() {
    console.log('Broadcasting listeners');
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ totalListeners }));
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

    if (allTitles.length === 0) {
        console.log('No titles found');
        console.log('Waiting 10 seconds...');
        setTimeout(() => {
            newTrack();   
        }, 10000)  
    }else {
        let x = Math.floor(Math.random() * allTitles.length);
        let track = allTitles[x];
        currentTrack.trackInfo = track;
    
        if (await fileExists(path.join(musicFolder, track.url))) {
            console.log(path.join(musicFolder, track.url));
            let duration = Math.floor((await parseFile(path.join(musicFolder, track.url))).format.duration);
            let lineColor = await getAverageColor(path.join(coversFolder, track.cover));
    
            currentTrack.duration = duration;
            currentTrack.lineColor = lineColor;
    
            playTack();
        } else {
            console.log('File does not exist');
    
            pool.query("INSERT INTO history (fk_title, fk_status) VALUES (?, ?)", [currentTrack.trackInfo.id, 2]);
    
            newTrack();
        }
    }


}

async function playTack() {
    // console.log(currentTrack);
    console.log('FUNCTION playTack');



    console.log("history: " + JSON.stringify(currentTrack));


    try {
        console.log("📌 Inserting into history...");
        console.log("Track ID:", currentTrack.trackInfo.id);

        const [result] = await pool.query(
            "INSERT INTO history (fk_title) VALUES (?)",
            [currentTrack.trackInfo.id]
        );

        console.log("✅ Insert success!");
        console.log("Inserted ID:", result.insertId);

    } catch (err) {
        console.error("❌ INSERT FAILED!");
        console.error("Message:", err.message);
        console.error("Code:", err.code);
        console.error("SQL State:", err.sqlState);
        console.error("Full error:", err);
    }


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

                // console.log("Total listeners: " + totalListeners);
            }

        },
        1000
    )
}

async function getAllTitles() {
    try {

        const nb = await pool.query("SELECT count(*) as nb FROM titles;");
        const limit = Math.round((nb[0][0].nb) /2);

        console.log("LIMIT: " + limit)

        const [rows] = await pool.query("SELECT titles.id, titles.created_at as created, COALESCE(titles.titre,'Unknown') AS titre,  COALESCE(titles.url,'') AS url,  COALESCE(titles.annee,'0000') AS annee,  COALESCE(artistes.nom,'Unknown') AS artiste, COALESCE(covers.url,'default.png') AS cover  FROM titles LEFT JOIN artistes ON artistes.id = titles.fk_artiste  LEFT JOIN covers ON covers.id = titles.fk_cover where titles.id not in (select fk_title from(select fk_title from history order by id desc limit ?) AS last);", [limit]);

        console.log("_____________________ Limit Selected ________________________")
        console.log(rows)
        console.log("_____________________ ENDED Selected ________________________")
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

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}