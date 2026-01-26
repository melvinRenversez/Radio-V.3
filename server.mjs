import { WebSocketServer } from 'ws';
import mysql from 'mysql2/promise';
import { parseFile } from "music-metadata";
import path from "path";
import { fileURLToPath } from 'url';
import express from 'express';

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

app.use('/Music', express.static(path.join(__dirname, 'Music')));
app.use('/Covers', express.static(path.join(__dirname, 'Covers')));
app.set('views', path.join(__dirname, 'views'));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});
app.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});




wss.on('connection', (ws) => {
    console.log('$[WSS]');
    console.log('$[WSS] Client connected');
    console.log('$[WSS]');

    ws.send(JSON.stringify({ currentTrack}));

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
            client.send(JSON.stringify({ currentTrack}));
        }
    });
}


console.log('Serveur WebSocket démarré sur ws://localhost:8080');

async function main() {
    allTitles = await getAllTitles();
    newTrack();
}



async function newTrack() {
    let x = Math.floor(Math.random() * allTitles.length);
    let track = allTitles[x];
    let duration = Math.floor( (await parseFile(path.join(musicFolder, track.url))).format.duration);

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
            }else {
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
        const [rows] = await pool.query("SELECT id, titre, url, pochette, artiste, annee FROM titles");
        return rows;
    } catch (err) {
        console.error("Erreur lors de la requête MySQL:", err);
        return [];
    }
}

function nowMySQLms() {
  return new Date()
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, m => m.slice(0, -1));   // garde .SSS et enlève Z
}
