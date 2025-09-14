// database.js (전체 최종 코드)

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

class AppDatabase {
    constructor() {
        const dbDirectory = path.join(require('electron').app.getPath('documents'), 'IdeaPromptData');
        if (!fs.existsSync(dbDirectory)) {
            fs.mkdirSync(dbDirectory, { recursive: true });
        }
        const dbPath = path.join(dbDirectory, 'database.db');
        this.db = new Database(dbPath);
        this.init();
    }

    init() {
        const createTablesScript = `
            CREATE TABLE IF NOT EXISTS albums (
                id INTEGER PRIMARY KEY, 
                name TEXT NOT NULL UNIQUE, 
                createdAt INTEGER NOT NULL,
                parent_id INTEGER,
                display_order INTEGER,
                FOREIGN KEY (parent_id) REFERENCES albums (id) ON DELETE SET NULL
            );
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY, title TEXT NOT NULL, prompt TEXT, imagePath TEXT, createdAt INTEGER NOT NULL,
                isHidden INTEGER DEFAULT 0, album_id INTEGER, isFavorite INTEGER DEFAULT 0,
                FOREIGN KEY (album_id) REFERENCES albums (id) ON DELETE SET NULL
            );
            INSERT OR IGNORE INTO albums (id, name, createdAt) VALUES (1, '모든 항목', 0);
        `;
        this.db.exec(createTablesScript);

        try { this.db.prepare('SELECT parent_id FROM albums LIMIT 1').get(); } 
        catch (e) { this.db.exec('ALTER TABLE albums ADD COLUMN parent_id INTEGER REFERENCES albums(id) ON DELETE SET NULL'); }
        
        try { this.db.prepare('SELECT display_order FROM albums LIMIT 1').get(); }
        catch (e) { this.db.exec('ALTER TABLE albums ADD COLUMN display_order INTEGER'); }

        try { this.db.prepare('SELECT isFavorite FROM items LIMIT 1').get(); }
        catch (e) { this.db.exec('ALTER TABLE items ADD COLUMN isFavorite INTEGER DEFAULT 0'); }
    }

    // --- 앨범 관리 ---
    getAlbums() {
        return this.db.prepare('SELECT * FROM albums ORDER BY display_order ASC, name ASC').all();
    }

    addAlbum(name) {
        const stmt = this.db.prepare('INSERT INTO albums (name, createdAt, display_order) VALUES (?, ?, ?)');
        return stmt.run(name, Date.now(), Date.now());
    }

    deleteAlbum(id) {
        this.db.prepare('UPDATE albums SET parent_id = NULL WHERE parent_id = ?').run(id);
        this.db.prepare('UPDATE items SET album_id = NULL WHERE album_id = ?').run(id); 
        this.db.prepare('DELETE FROM albums WHERE id = ?').run(id); 
    }

    updateAlbumName({ id, name }) {
        return this.db.prepare('UPDATE albums SET name = ? WHERE id = ?').run(name, id);
    }
    
    // ★★★ 수정: 여러 앨범의 순서와 부모를 한 번에 업데이트 (트랜잭션)
    updateAlbumOrderAndParent(updates) {
        const stmt = this.db.prepare('UPDATE albums SET display_order = ?, parent_id = ? WHERE id = ?');
        const transaction = this.db.transaction((updates) => {
            for (const update of updates) {
                stmt.run(update.display_order, update.parent_id, update.id);
            }
        });
        transaction(updates);
    }

    // --- 아이템 조회 및 관리 ---
    getItemsByAlbum(albumId) {
        if (albumId == 1) {
            return this.db.prepare('SELECT * FROM items ORDER BY createdAt DESC').all();
        } else if (albumId === 'favorites') {
            return this.db.prepare('SELECT * FROM items WHERE isFavorite = 1 ORDER BY createdAt DESC').all();
        } else {
            const sql = `
                WITH RECURSIVE descendant_albums(id) AS (
                    SELECT id FROM albums WHERE id = ?
                    UNION ALL
                    SELECT a.id FROM albums a JOIN descendant_albums da ON a.parent_id = da.id
                )
                SELECT * FROM items WHERE album_id IN (SELECT id FROM descendant_albums)
                ORDER BY createdAt DESC;
            `;
            return this.db.prepare(sql).all(albumId);
        }
    }
    
    getItem(id) { return this.db.prepare('SELECT * FROM items WHERE id = ?').get(id); }
    getItemImagePath(id) { return this.db.prepare('SELECT imagePath FROM items WHERE id = ?').get(id); }
    addItem(albumId) {
        const targetAlbumId = (albumId == 1 || albumId === 'favorites') ? null : albumId;
        const stmt = this.db.prepare('INSERT INTO items (title, prompt, createdAt, album_id) VALUES (?, ?, ?, ?)');
        const result = stmt.run('새 제목', '프롬프트를 입력하세요...', Date.now(), targetAlbumId);
        return this.db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid);
    }
    deleteItems(itemIds) {
        const placeholders = itemIds.map(() => '?').join(',');
        const imagesToDelete = this.db.prepare(`SELECT imagePath FROM items WHERE id IN (${placeholders})`).all(...itemIds);
        this.db.prepare(`DELETE FROM items WHERE id IN (${placeholders})`).run(...itemIds);
        return imagesToDelete.map(row => row.imagePath).filter(Boolean);
    }
    updateItemText({ id, title, prompt }) { return this.db.prepare('UPDATE items SET title = ?, prompt = ? WHERE id = ?').run(title, prompt, id); }
    updateItemImage({ id, imagePath }) { return this.db.prepare('UPDATE items SET imagePath = ? WHERE id = ?').run(imagePath, id); }
    updateItemHiddenState({ id, isHidden }) { return this.db.prepare('UPDATE items SET isHidden = ? WHERE id = ?').run(isHidden ? 1 : 0, id); }
    updateItemFavoriteState({ id, isFavorite }) { return this.db.prepare('UPDATE items SET isFavorite = ? WHERE id = ?').run(isFavorite ? 1 : 0, id); }
    updateItemAlbum({ itemIds, albumId }) {
        if (!itemIds || itemIds.length === 0) return;
        const targetAlbumId = (albumId == 1) ? null : albumId;
        const placeholders = itemIds.map(() => '?').join(',');
        const stmt = this.db.prepare(`UPDATE items SET album_id = ? WHERE id IN (${placeholders})`);
        stmt.run(targetAlbumId, ...itemIds);
    }
}

module.exports = new AppDatabase();