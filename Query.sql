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
    
    CONSTRAINT fk_history_title
        FOREIGN KEY (fk_title)
        REFERENCES titles(id)
        ON DELETE cascade
);

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

select * from titles
;

select titles.id, titles.titre, titles.url, titles.annee, artistes.nom as artiste, covers.url as cover from titles
join artistes on artistes.id = fk_artiste
join covers on covers.id = fk_cover
;


select h.id, titre, played_at
from history h
join titles t on t.id = h.fk_title
order by h.id desc;


insert into titles(titre, url, fk_cover, fk_artiste)values
("In the Open", "Lone Assembly - In the Open (Official Music Video).mp3", 1, 1);



insert into artistes(nom)values
("Deus Ex lumina");

insert into covers(url)values
("Tame Me Away.jpeg");


select titles.id, titles.titre, titles.url, titles.annee, artistes.nom as artiste, covers.url as cover from titles
join artistes on artistes.id = fk_artiste
join covers on covers.id = fk_cover
where titles.id not in (select fk_title from history limit 4);


