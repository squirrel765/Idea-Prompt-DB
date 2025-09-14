// main.js (전체 최종 코드)

const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Store = require('electron-store');

const db = require('./database');
const { extractPromptFromImage } = require('./imageParser');

const store = new Store();
const defaultDataPath = path.join(app.getPath('documents'), 'IdeaPromptData');
const userDataPath = store.get('userDataPath', defaultDataPath);
const imagesPath = path.join(userDataPath, 'images');
if (!fs.existsSync(imagesPath)) {
    fs.mkdirSync(imagesPath, { recursive: true });
}

let mainWindow;
let currentAlbumIdInRenderer = 1;

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

        const newItem = db.addItem(currentAlbumIdInRenderer);
        db.updateItemImage({ id: newItem.id, imagePath: newPath });
        
        const promptFromImage = await extractPromptFromImage(newPath);
        if (promptFromImage) {
            db.updateItemText({ id: newItem.id, title: '새 제목', prompt: promptFromImage });
        }
        
        lastAutoAddedItemId = newItem.id;
        const finalItem = db.getItem(newItem.id);
        if (finalItem) {
            mainWindow.webContents.send('item-auto-added', finalItem);
        }
        return;
    }

    const currentText = clipboard.readText();
    if (lastAutoAddedItemId && currentText && currentText !== lastText) {
        const existingItem = db.getItem(lastAutoAddedItemId);
        if (existingItem && existingItem.prompt === '프롬프트를 입력하세요...') {
            lastText = currentText;
            db.updateItemText({ id: lastAutoAddedItemId, title: existingItem.title, prompt: currentText });
            mainWindow.webContents.send('item-prompt-updated', { id: lastAutoAddedItemId, prompt: currentText });
            lastAutoAddedItemId = null;
        }
    }
}

// IPC 핸들러
ipcMain.on('album-selected', (event, albumId) => {
    currentAlbumIdInRenderer = albumId;
});

ipcMain.on('auto-add-toggle-changed', (event, isEnabled) => {
    if (isEnabled) {
        if (!clipboardInterval) {
            lastImage = clipboard.readImage();
            lastText = clipboard.readText();
            lastAutoAddedItemId = null;
            clipboardInterval = setInterval(checkClipboard, 1000);
        }
    } else {
        if (clipboardInterval) {
            clearInterval(clipboardInterval);
            clipboardInterval = null;
        }
    }
});

ipcMain.handle('get-initial-data', () => ({ albums: db.getAlbums(), items: db.getItemsByAlbum(1) }));
ipcMain.handle('get-items-by-album', (event, albumId) => db.getItemsByAlbum(albumId));
ipcMain.handle('get-albums', () => db.getAlbums());
ipcMain.handle('add-album', (event, name) => { db.addAlbum(name); return db.getAlbums(); });
ipcMain.handle('delete-album', (event, id) => { db.deleteAlbum(id); return db.getAlbums(); });
ipcMain.handle('update-album-name', (event, { id, name }) => { db.updateAlbumName({ id, name }); return db.getAlbums(); });

// ★★★ 추가: 앨범 순서/부모 업데이트 핸들러
ipcMain.handle('update-album-order-and-parent', (event, updates) => {
    db.updateAlbumOrderAndParent(updates);
    return db.getAlbums();
});

ipcMain.handle('add-item', (event, albumId) => db.addItem(albumId));
ipcMain.handle('update-item-text', (event, data) => db.updateItemText(data));
ipcMain.handle('update-item-hidden-state', (event, data) => db.updateItemHiddenState(data));
ipcMain.handle('update-item-favorite-state', (event, data) => db.updateItemFavoriteState(data));
ipcMain.handle('update-item-album', (event, data) => db.updateItemAlbum(data));

ipcMain.handle('delete-items', (event, itemIds) => {
    const imagesToDelete = db.deleteItems(itemIds);
    imagesToDelete.forEach(imgPath => {
        if (imgPath && imgPath.startsWith(imagesPath) && fs.existsSync(imgPath)) {
            try { fs.unlinkSync(imgPath); } catch (err) { console.error(`이미지 파일 삭제 실패: ${imgPath}`, err); }
        }
    });
});

ipcMain.handle('update-item-image', (event, data) => {
    const item = db.getItemImagePath(data.id);
    const oldImagePath = item ? item.imagePath : null;
    db.updateItemImage(data);
    if (oldImagePath && oldImagePath.startsWith(imagesPath) && fs.existsSync(oldImagePath)) {
        try { fs.unlinkSync(oldImagePath); } catch (err) { console.error(`기존 이미지 파일 삭제 실패: ${oldImagePath}`, err); }
    }
});

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

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });