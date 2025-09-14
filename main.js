// main.js (전체 최종 코드 - 자동 추가 기능 수정됨)

const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Store = require('electron-store');

// --- 사용자 정의 모듈 ---
const db = require('./database');
const { extractPromptFromImage } = require('./imageParser');

// --- 설정 및 경로 초기화 ---
const store = new Store();
const defaultDataPath = path.join(app.getPath('documents'), 'IdeaPromptData');
const userDataPath = store.get('userDataPath', defaultDataPath);
const imagesPath = path.join(userDataPath, 'images');
if (!fs.existsSync(imagesPath)) {
    fs.mkdirSync(imagesPath, { recursive: true });
}

let mainWindow;
// ★★★ 추가: 현재 렌더러에서 선택된 앨범 ID를 저장할 변수
let currentAlbumIdInRenderer = 1; // 기본값은 '모든 항목'

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, 
    height: 800,
    minWidth: 940,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  mainWindow.removeMenu();
  mainWindow.loadFile('index.html');
  
  // mainWindow.webContents.openDevTools();
}

// --- 클립보드 자동 추가 관련 상태 변수 및 로직 ---
let clipboardInterval = null;
let lastImage = clipboard.readImage();
let lastText = clipboard.readText();
let lastAutoAddedItemId = null;

async function checkClipboard() {
    const currentImage = clipboard.readImage();
    if (!currentImage.isEmpty() && currentImage.toDataURL() !== lastImage.toDataURL()) {
        console.log('새로운 이미지가 클립보드에서 감지되었습니다.');
        lastImage = currentImage;
        lastText = '';

        const buffer = currentImage.toPNG();
        const newFileName = `${crypto.randomUUID()}.png`;
        const newPath = path.join(imagesPath, newFileName);
        fs.writeFileSync(newPath, buffer);

        // ★★★ 수정: 하드코딩된 '1' 대신, 저장된 앨범 ID를 사용합니다.
        let targetAlbumId = currentAlbumIdInRenderer;
        // '즐겨찾기'가 선택된 경우, 실제 위치는 없으므로 '모든 항목'에 추가합니다.
        if (targetAlbumId === 'favorites') {
            targetAlbumId = 1;
        }
        
        const newItem = db.addItem(targetAlbumId);
        db.updateItemImage({ id: newItem.id, imagePath: newPath });
        
        const promptFromImage = await extractPromptFromImage(newPath);
        if (promptFromImage) {
            console.log('파싱된 프롬프트를 DB에 업데이트합니다.');
            db.updateItemText({ id: newItem.id, title: '새 제목', prompt: promptFromImage });
        }
        
        lastAutoAddedItemId = newItem.id;
        const finalItem = db.getItem(newItem.id);
        if (finalItem) {
            mainWindow.webContents.send('item-auto-added', finalItem);
        } else {
            console.error(`자동 추가된 아이템(ID: ${newItem.id})을 DB에서 찾지 못했습니다.`);
        }
        return;
    }

    const currentText = clipboard.readText();
    if (lastAutoAddedItemId && currentText && currentText !== lastText) {
        const existingItem = db.getItem(lastAutoAddedItemId);
        if (existingItem && existingItem.prompt === '프롬프트를 입력하세요...') {
            console.log(`기존 아이템(${lastAutoAddedItemId})에 클립보드 텍스트로 프롬프트를 추가합니다.`);
            lastText = currentText;
            db.updateItemText({ id: lastAutoAddedItemId, title: existingItem.title, prompt: currentText });
            mainWindow.webContents.send('item-prompt-updated', { id: lastAutoAddedItemId, prompt: currentText });
            lastAutoAddedItemId = null;
        }
    }
}

// --- IPC 핸들러 등록 ---

// ★★★ 추가: 렌더러에서 앨범 선택 시 ID를 받아와 저장합니다.
ipcMain.on('album-selected', (event, albumId) => {
    console.log(`선택된 앨범이 변경되었습니다: ${albumId}`);
    currentAlbumIdInRenderer = albumId;
});

ipcMain.on('auto-add-toggle-changed', (event, isEnabled) => {
    if (isEnabled) {
        if (!clipboardInterval) {
            console.log('클립보드 자동 추가 감시를 시작합니다.');
            lastImage = clipboard.readImage();
            lastText = clipboard.readText();
            lastAutoAddedItemId = null;
            clipboardInterval = setInterval(checkClipboard, 1000);
        }
    } else {
        if (clipboardInterval) {
            console.log('클립보드 자동 추가 감시를 중지합니다.');
            clearInterval(clipboardInterval);
            clipboardInterval = null;
        }
    }
});

// 데이터 조회
ipcMain.handle('get-initial-data', () => ({ albums: db.getAlbums(), items: db.getItemsByAlbum(1) }));
ipcMain.handle('get-items-by-album', (event, albumId) => db.getItemsByAlbum(albumId));
ipcMain.handle('get-albums', () => db.getAlbums());

// 앨범 관리
ipcMain.handle('add-album', (event, name) => { db.addAlbum(name); return db.getAlbums(); });
ipcMain.handle('delete-album', (event, id) => { db.deleteAlbum(id); return db.getAlbums(); });
ipcMain.handle('update-album-name', (event, { id, name }) => { db.updateAlbumName({ id, name }); return db.getAlbums(); });
ipcMain.handle('update-album-parent', (event, { id, parentId }) => { db.updateAlbumParent({ id, parentId }); return db.getAlbums(); });

// 아이템 관리
ipcMain.handle('add-item', (event, albumId) => db.addItem(albumId));
ipcMain.handle('update-item-text', (event, data) => db.updateItemText(data));
ipcMain.handle('update-item-hidden-state', (event, data) => db.updateItemHiddenState(data));
ipcMain.handle('update-item-favorite-state', (event, data) => db.updateItemFavoriteState(data));
ipcMain.handle('update-item-album', (event, data) => db.updateItemAlbum(data));

// 아이템 삭제 (연결된 이미지 파일도 함께 삭제)
ipcMain.handle('delete-items', (event, itemIds) => {
    const imagesToDelete = db.deleteItems(itemIds);
    imagesToDelete.forEach(imgPath => {
        if (imgPath && imgPath.startsWith(imagesPath) && fs.existsSync(imgPath)) {
            try { fs.unlinkSync(imgPath); } catch (err) { console.error(`이미지 파일 삭제 실패: ${imgPath}`, err); }
        }
    });
});

// 아이템 이미지 업데이트 (기존 이미지 파일 삭제)
ipcMain.handle('update-item-image', (event, data) => {
    const item = db.getItemImagePath(data.id);
    const oldImagePath = item ? item.imagePath : null;
    db.updateItemImage(data);
    if (oldImagePath && oldImagePath.startsWith(imagesPath) && fs.existsSync(oldImagePath)) {
        try { fs.unlinkSync(oldImagePath); } catch (err) { console.error(`기존 이미지 파일 삭제 실패: ${oldImagePath}`, err); }
    }
});

// 드래그앤드롭으로 들어온 이미지 저장 및 프롬프트 파싱
ipcMain.handle('save-image-from-data', async (event, { arrayBuffer, fileName }) => {
    try {
        const buffer = Buffer.from(arrayBuffer);
        const fileExtension = path.extname(fileName);
        const newFileName = `${crypto.randomUUID()}${fileExtension}`;
        const newPath = path.join(imagesPath, newFileName);
        fs.writeFileSync(newPath, buffer);
        const prompt = await extractPromptFromImage(newPath);
        return { newPath, prompt };
    } catch (error) {
        console.error("이미지 파일 저장 실패:", error);
        return null;
    }
});

// --- Electron 앱 생명주기 관리 ---
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });