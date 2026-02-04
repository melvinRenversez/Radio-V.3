create database radio;
CREATE USER 'radio_user'@'%' IDENTIFIED BY 'radio_password_123';
GRANT ALL PRIVILEGES ON radio.* TO 'radio_user'@'%';

	

use radio;

drop table titles;
CREATE TABLE titles (
    id      INTEGER PRIMARY KEY AUTO_INCREMENT,
    titre   TEXT NOT NULL,
    url TEXT NOT NULL,
    duree   INTEGER,
    annee   INTEGER,

    fk_cover INTEGER ,
    fk_artiste INTEGER ,

    CONSTRAINT fk_title_cover
        FOREIGN KEY (fk_cover)
        REFERENCES covers(id)
        ON DELETE cascade,

    CONSTRAINT fk_title_artiste
        FOREIGN KEY (fk_artiste)
        REFERENCES artistes(id)
        ON DELETE cascade
);

drop table covers;
CREATE TABLE covers (
    id      INTEGER PRIMARY KEY AUTO_INCREMENT,
    url TEXT NOT NULL
);

drop table artistes;
CREATE TABLE artistes (
    id      INTEGER PRIMARY KEY AUTO_INCREMENT,
    nom TEXT NOT NULL
);

drop table history;
CREATE TABLE history (
    id        INTEGER PRIMARY KEY AUTO_INCREMENT,
    fk_title  INTEGER NOT NULL,
    played_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    fk_status INTEGER NOT NULL DEFAULT 1,
    
    CONSTRAINT fk_history_title
        FOREIGN KEY (fk_title)
        REFERENCES titles(id)
        ON DELETE cascade,

    CONSTRAINT fk_history_status
        FOREIGN KEY (fk_status)
        REFERENCES status(id)
        ON DELETE cascade
);

drop table status;
CREATE TABLE status (
    id      INTEGER PRIMARY KEY AUTO_INCREMENT,
    status  TEXT NOT NULL
);

insert into status(status)values
("played"),
("url not found");


insert into artistes(nom)values
("Lone Assembly");

insert into covers(url)values
("Lone.jpeg");

insert into titles(titre, url, fk_cover, fk_artiste)values
("All Around Me", "Lone Assembly - All Around Me (Official Lyric Video).mp3", 1, 1),
("In the Open", "Lone Assembly - In the Open (Official Music Video).mp3", 1, 1),
("Seven Souls", "Lone Assembly - Seven Souls (Official Music Video).mp3", 1, 1),
("The Pain Keeper", "Lone Assembly - The Pain Keeper (Official Music Video).mp3", 1, 1);


select * from artistes;

select * from covers;

select * from titles;

select * from history h
join status s on s.id = h.fk_status
order by h.id desc;

select * from status;

select titles.id, titles.titre, titles.url, titles.annee, artistes.nom as artiste, covers.url as cover from titles
join artistes on artistes.id = fk_artiste
join covers on covers.id = fk_cover
;


select h.id, titre, played_at
from history h
join titles t on t.id = h.fk_title
order by h.id desc limit 4;


insert into titles(titre, url, fk_cover, fk_artiste)values
("In the Open", "Lone Assembly - In the Open (Official Music Video).mp3", 1, 1);



insert into artistes(nom)values
("Deus Ex lumina");

insert into covers(url)values
("Tame Me Away.jpeg");


select titles.id, titles.titre, titles.url, titles.annee, artistes.nom as artiste, covers.url as cover from titles
join artistes on artistes.id = fk_artiste
join covers on covers.id = fk_cover
where titles.id not in (select fk_title from(select fk_title from history order by id desc limit 4) AS last4);

select * from history order by id desc;
select fk_title from history order by id limit 4;





SELECT titles.id, 
	COALESCE(titles.titre,'Unknown') AS titre, 
	COALESCE(titles.url,'') AS url, 
	COALESCE(titles.annee,'0000') AS annee, 
	COALESCE(artistes.nom,'Unknown') AS artiste, 
	COALESCE(covers.url,'default.png') AS cover 
FROM titles LEFT JOIN artistes ON artistes.id = titles.fk_artiste 
LEFT JOIN covers ON covers.id = titles.fk_cover
where titles.id not in (select fk_title from(select fk_title from history order by id desc limit 4) AS last4);

SELECT titles.id, 
	COALESCE(titles.titre,'Unknown') AS titre, 
	COALESCE(titles.url,'') AS url, 
	COALESCE(titles.annee,'0000') AS annee, 
	COALESCE(artistes.nom,'Unknown') AS artiste, 
	COALESCE(covers.url,'default.png') AS cover 
FROM titles LEFT JOIN artistes ON artistes.id = titles.fk_artiste 
LEFT JOIN covers ON covers.id = titles.fk_cover
where titles.id = 1;


SELECT h.id, titre, t.id as titre_id, duree, annee, status, c.url as cover, nom as artist, played_at 
         FROM history h  
         join status s on s.id = h.fk_status
         JOIN titles t ON t.id = h.fk_title 
         JOIN covers c ON c.id = t.fk_cover 
         JOIN artistes a ON a.id = t.fk_artiste 
         ORDER BY h.id DESC;