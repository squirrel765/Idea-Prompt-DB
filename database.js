// database.js (전체 최종 코드)

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

class AppDatabase {
    constructor() {
        // 사용자의 문서 폴더 내에 데이터 저장 경로 설정
        const dbDirectory = path.join(require('electron').app.getPath('documents'), 'IdeaPromptData');
        // 폴더가 없으면 생성
        if (!fs.existsSync(dbDirectory)) {
            fs.mkdirSync(dbDirectory, { recursive: true });
        }
        const dbPath = path.join(dbDirectory, 'database.db');
        this.db = new Database(dbPath);
        this.init();
    }

    /**
     * 데이터베이스 초기화: 테이블을 생성하고, 필요한 경우 기존 DB 스키마를 업데이트합니다.
     */
    init() {
        const createTablesScript = `
            CREATE TABLE IF NOT EXISTS albums (
                id INTEGER PRIMARY KEY, 
                name TEXT NOT NULL UNIQUE, 
                createdAt INTEGER NOT NULL,
                parent_id INTEGER, 
                FOREIGN KEY (parent_id) REFERENCES albums (id) ON DELETE SET NULL
            );
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY, 
                title TEXT NOT NULL, 
                prompt TEXT, 
                imagePath TEXT, 
                createdAt INTEGER NOT NULL,
                isHidden INTEGER DEFAULT 0, 
                album_id INTEGER, 
                isFavorite INTEGER DEFAULT 0,
                FOREIGN KEY (album_id) REFERENCES albums (id) ON DELETE SET NULL
            );
            INSERT OR IGNORE INTO albums (id, name, createdAt) VALUES (1, '모든 항목', 0);
        `;
        this.db.exec(createTablesScript);

        // --- 마이그레이션: 기존 사용자의 DB에 컬럼이 없을 경우 추가 ---
        try {
            // parent_id 컬럼이 albums 테이블에 있는지 확인
            this.db.prepare('SELECT parent_id FROM albums LIMIT 1').get();
        } catch (e) {
            // 없으면 추가
            this.db.exec('ALTER TABLE albums ADD COLUMN parent_id INTEGER REFERENCES albums(id) ON DELETE SET NULL');
        }
        try {
            // isFavorite 컬럼이 items 테이블에 있는지 확인
            this.db.prepare('SELECT isFavorite FROM items LIMIT 1').get();
        } catch (e) {
            // 없으면 추가
            this.db.exec('ALTER TABLE items ADD COLUMN isFavorite INTEGER DEFAULT 0');
        }
    }

    // --- 앨범 관리 ---
    getAlbums() {
        return this.db.prepare('SELECT * FROM albums ORDER BY createdAt ASC').all();
    }

    addAlbum(name) {
        return this.db.prepare('INSERT INTO albums (name, createdAt) VALUES (?, ?)').run(name, Date.now());
    }

    deleteAlbum(id) {
        // 1. 삭제될 앨범을 부모로 가졌던 자식 앨범들의 부모를 NULL로 변경 (최상위로 이동)
        this.db.prepare('UPDATE albums SET parent_id = NULL WHERE parent_id = ?').run(id);
        // 2. 삭제될 앨범에 속해있던 아이템들의 소속을 NULL로 변경 ('모든 항목'으로 이동)
        this.db.prepare('UPDATE items SET album_id = NULL WHERE album_id = ?').run(id); 
        // 3. 앨범을 최종적으로 삭제
        this.db.prepare('DELETE FROM albums WHERE id = ?').run(id); 
    }

    updateAlbumName({ id, name }) {
        return this.db.prepare('UPDATE albums SET name = ? WHERE id = ?').run(name, id);
    }

    updateAlbumParent({ id, parentId }) {
        // 자기 자신을 부모로 설정하는 순환 참조 방지
        if (id === parentId) return;
        return this.db.prepare('UPDATE albums SET parent_id = ? WHERE id = ?').run(parentId, id);
    }

    // --- 아이템 조회 및 관리 ---

    /**
     * 특정 앨범 및 모든 하위 앨범에 속한 아이템들을 조회합니다.
     * @param {number | 'favorites'} albumId - 조회할 앨범의 ID 또는 'favorites'
     * @returns {Array<object>} 아이템 목록
     */
    getItemsByAlbum(albumId) {
        // '모든 항목'은 전체 아이템 반환
        if (albumId == 1) {
            return this.db.prepare('SELECT * FROM items ORDER BY createdAt DESC').all();
        }
        // '즐겨찾기'는 isFavorite가 1인 아이템만 반환
        else if (albumId === 'favorites') {
            return this.db.prepare('SELECT * FROM items WHERE isFavorite = 1 ORDER BY createdAt DESC').all();
        }
        // 그 외의 앨범은 재귀 쿼리를 사용하여 해당 앨범 및 모든 하위 앨범의 아이템을 조회
        else {
            const sql = `
                WITH RECURSIVE descendant_albums(id) AS (
                    -- 시작점: 사용자가 선택한 앨범의 ID
                    SELECT id FROM albums WHERE id = ?
                    UNION ALL
                    -- 재귀 부분: 위에서 찾은 앨범 ID를 부모로 삼는 자식 앨범들을 계속해서 찾아 합침
                    SELECT a.id FROM albums a
                    JOIN descendant_albums da ON a.parent_id = da.id
                )
                -- 최종 결과: 찾은 모든 앨범 ID에 속한 아이템들을 조회
                SELECT * FROM items 
                WHERE album_id IN (SELECT id FROM descendant_albums)
                ORDER BY createdAt DESC;
            `;
            return this.db.prepare(sql).all(albumId);
        }
    }
    
    getItem(id) {
        return this.db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    }

    getItemImagePath(id) {
        return this.db.prepare('SELECT imagePath FROM items WHERE id = ?').get(id);
    }

    addItem(albumId) {
        const stmt = this.db.prepare('INSERT INTO items (title, prompt, createdAt, album_id, isHidden, isFavorite) VALUES (?, ?, ?, ?, 0, 0)');
        const targetAlbumId = (albumId == 1) ? null : albumId; // '모든 항목'에 추가 시 album_id는 NULL
        const result = stmt.run('새 제목', '프롬프트를 입력하세요...', Date.now(), targetAlbumId);
        return this.db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid);
    }

    deleteItems(itemIds) {
        const placeholders = itemIds.map(() => '?').join(',');
        const imagesToDelete = this.db.prepare(`SELECT imagePath FROM items WHERE id IN (${placeholders})`).all(...itemIds);
        this.db.prepare(`DELETE FROM items WHERE id IN (${placeholders})`).run(...itemIds);
        return imagesToDelete.map(row => row.imagePath).filter(Boolean);
    }

    updateItemText({ id, title, prompt }) {
        return this.db.prepare('UPDATE items SET title = ?, prompt = ? WHERE id = ?').run(title, prompt, id);
    }

    updateItemImage({ id, imagePath }) {
        return this.db.prepare('UPDATE items SET imagePath = ? WHERE id = ?').run(imagePath, id);
    }

    updateItemHiddenState({ id, isHidden }) {
        return this.db.prepare('UPDATE items SET isHidden = ? WHERE id = ?').run(isHidden ? 1 : 0, id);
    }

    updateItemFavoriteState({ id, isFavorite }) {
        return this.db.prepare('UPDATE items SET isFavorite = ? WHERE id = ?').run(isFavorite ? 1 : 0, id);
    }

    updateItemAlbum({ itemIds, albumId }) {
        if (!itemIds || itemIds.length === 0) {
            return;
        }
        const targetAlbumId = (albumId == 1) ? null : albumId;
        const placeholders = itemIds.map(() => '?').join(',');
        const stmt = this.db.prepare(`UPDATE items SET album_id = ? WHERE id IN (${placeholders})`);
        stmt.run(targetAlbumId, ...itemIds);
    }
}

module.exports = new AppDatabase();