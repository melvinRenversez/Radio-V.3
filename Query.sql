use radio;

drop table titles;
CREATE TABLE titles (
    id      INTEGER PRIMARY KEY AUTO_INCREMENT,
    titre   TEXT NOT NULL,
    url TEXT NOT NULL,
    pochette TEXT,
    artiste TEXT,
    duree   INTEGER,
    annee   INTEGER
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

insert into titles(titre, url)values
("Lone Assembly - All Around Me (Official Lyric Video)", "Lone Assembly - All Around Me (Official Lyric Video).mp3"),
("Lone Assembly - In the Open (Official Music Video)", "Lone Assembly - In the Open (Official Music Video).mp3"),
("Lone Assembly - Seven Souls (Official Music Video)", "Lone Assembly - Seven Souls (Official Music Video).mp3"),
("Lone Assembly - The Pain Keeper (Official Music Video)", "Lone Assembly - The Pain Keeper (Official Music Video).mp3");


select * from titles;
select h.id, titre, played_at
from history h
join titles t on t.id = h.fk_title
order by h.id desc;