// database.js (전체 코드)
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

class AppDatabase {
    constructor() {
        // ... (기존 생성자 코드) ...
        const dbDirectory = path.join(require('electron').app.getPath('documents'), 'IdeaPromptData');
        if (!fs.existsSync(dbDirectory)) {
            fs.mkdirSync(dbDirectory, { recursive: true });
        }
        const dbPath = path.join(dbDirectory, 'database.db');
        this.db = new Database(dbPath);
        this.init();
    }

    init() {
        // ... (기존 init 코드) ...
        const createTablesScript = `
            CREATE TABLE IF NOT EXISTS albums (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, createdAt INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY, title TEXT NOT NULL, prompt TEXT, imagePath TEXT, createdAt INTEGER NOT NULL,
                isHidden INTEGER DEFAULT 0, album_id INTEGER, isFavorite INTEGER DEFAULT 0,
                FOREIGN KEY (album_id) REFERENCES albums (id) ON DELETE SET NULL
            );
            INSERT OR IGNORE INTO albums (id, name, createdAt) VALUES (1, '모든 항목', 0);
        `;
        this.db.exec(createTablesScript);
        try {
            this.db.prepare('SELECT isFavorite FROM items LIMIT 1').get();
        } catch (e) {
            this.db.exec('ALTER TABLE items ADD COLUMN isFavorite INTEGER DEFAULT 0');
        }
    }

    // --- 앨범 관리 ---
    getAlbums() { return this.db.prepare('SELECT * FROM albums ORDER BY createdAt ASC').all(); }
    addAlbum(name) { return this.db.prepare('INSERT INTO albums (name, createdAt) VALUES (?, ?)').run(name, Date.now()); }
    deleteAlbum(id) { this.db.prepare('UPDATE items SET album_id = NULL WHERE album_id = ?').run(id); this.db.prepare('DELETE FROM albums WHERE id = ?').run(id); }
    // ★★★ 이 함수가 앨범 이름 변경의 핵심입니다 ★★★
    updateAlbumName({ id, name }) { return this.db.prepare('UPDATE albums SET name = ? WHERE id = ?').run(name, id); }

    // --- 아이템 조회 및 관리 ---
    // ... (이전 답변과 동일한 나머지 모든 함수들) ...
    getItemsByAlbum(albumId) { if (albumId == 1) { return this.db.prepare('SELECT * FROM items ORDER BY createdAt DESC').all(); } else if (albumId === 'favorites') { return this.db.prepare('SELECT * FROM items WHERE isFavorite = 1 ORDER BY createdAt DESC').all(); } else { return this.db.prepare('SELECT * FROM items WHERE album_id = ? ORDER BY createdAt DESC').all(albumId); } }
    getItem(id) { return this.db.prepare('SELECT * FROM items WHERE id = ?').get(id); }
    getItemImagePath(id) { return this.db.prepare('SELECT imagePath FROM items WHERE id = ?').get(id); }
    addItem(albumId) { const stmt = this.db.prepare('INSERT INTO items (title, prompt, createdAt, album_id, isHidden, isFavorite) VALUES (?, ?, ?, ?, 0, 0)'); const targetAlbumId = (albumId == 1) ? null : albumId; const result = stmt.run('새 제목', '프롬프트를 입력하세요...', Date.now(), targetAlbumId); return this.db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid); }
    deleteItems(itemIds) { const placeholders = itemIds.map(() => '?').join(','); const imagesToDelete = this.db.prepare(`SELECT imagePath FROM items WHERE id IN (${placeholders})`).all(...itemIds); this.db.prepare(`DELETE FROM items WHERE id IN (${placeholders})`).run(...itemIds); return imagesToDelete.map(row => row.imagePath).filter(Boolean); }
    updateItemText({ id, title, prompt }) { return this.db.prepare('UPDATE items SET title = ?, prompt = ? WHERE id = ?').run(title, prompt, id); }
    updateItemImage({ id, imagePath }) { return this.db.prepare('UPDATE items SET imagePath = ? WHERE id = ?').run(imagePath, id); }
    updateItemHiddenState({ id, isHidden }) { return this.db.prepare('UPDATE items SET isHidden = ? WHERE id = ?').run(isHidden ? 1 : 0, id); }
    updateItemFavoriteState({ id, isFavorite }) { return this.db.prepare('UPDATE items SET isFavorite = ? WHERE id = ?').run(isFavorite ? 1 : 0, id); }
    updateItemAlbum({ itemIds, albumId }) { if (!itemIds || itemIds.length === 0) { return; } const targetAlbumId = (albumId == 1) ? null : albumId; const placeholders = itemIds.map(() => '?').join(','); const stmt = this.db.prepare(`UPDATE items SET album_id = ? WHERE id IN (${placeholders})`); stmt.run(targetAlbumId, ...itemIds); }
}

module.exports = new AppDatabase();